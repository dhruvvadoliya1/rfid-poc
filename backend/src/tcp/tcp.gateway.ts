import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import * as net from 'net';
import { OnModuleInit, Logger, OnModuleDestroy } from '@nestjs/common';

interface ParsedTagData {
  timestamp: string;
  tagId: string; // EPC
  serverReadCount: number; // Count maintained by this server for this session
  readerReportedReadCount?: number; // Count from the reader's packet
  antennaId?: number;
  rssi?: number;
  rawDataPacket: string; // The full hex of the parsed packet
}

// Expected byte length of a complete message if EPC is 12 bytes (0x0C)
// AA (1) + Addr (1) + MaybeLen (2) + Cmd (1) + SubCmd (1) + EpcLen (1) + EPC (12) + Meta (2) + Ant (1) + ReaderCount (1) + RSSI (1) + OtherMeta (3) + CRC (1) = 28
const EXPECTED_MESSAGE_LENGTH_12_BYTE_EPC = 28; // Example for 12-byte EPC
const MIN_PACKET_HEADER_LENGTH = 8; // Min length to read up to and including EPC_LEN byte
const SOF = 'aa';
const TAG_REPORT_COMMAND = '15';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  port: 8080, // Make sure this doesn't conflict with your NestJS app's main port
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  serveClient: false,
  namespace: '/',
})
export class TcpGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private tcpServer: net.Server;
  private readonly logger = new Logger(TcpGateway.name);
  private readonly TCP_PORT = 8081;

  // Store buffers and tag counts per connected socket
  private clientData = new Map<
    net.Socket,
    { buffer: string; tagCounts: Map<string, number> }
  >();

  onModuleInit() {
    this.initTcpServer();
  }

  onModuleDestroy() {
    this.logger.log('Closing TCP server...');
    this.tcpServer.close();
    this.clientData.forEach((_value, socket) => {
      socket.destroy();
    });
    this.clientData.clear();
  }

  private initTcpServer() {
    this.tcpServer = net.createServer((socket) => {
      const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
      this.logger.log(`Reader connected: ${clientAddress}`);

      // Initialize buffer and tag counts for this new client
      this.clientData.set(socket, { buffer: '', tagCounts: new Map() });

      socket.on('data', (data) => {
        const hexDataChunk = data.toString('hex');
        this.logger.debug(`Received chunk from ${clientAddress}: ${hexDataChunk}`);

        const clientInfo = this.clientData.get(socket);
        if (!clientInfo) {
          this.logger.error(`No client info for socket ${clientAddress}`);
          return;
        }

        clientInfo.buffer += hexDataChunk;
        this.processBuffer(socket);
      });

      socket.on('end', () => {
        this.logger.log(`Reader disconnected: ${clientAddress}`);
        this.clientData.delete(socket); // Clean up
      });

      socket.on('error', (error) => {
        this.logger.error(`Socket error from ${clientAddress}:`, error.message);
        this.clientData.delete(socket); // Clean up on error
        socket.destroy(); // Ensure socket is fully closed
      });
    });

    this.tcpServer.on('error', (error) => {
      this.logger.error('TCP Server error:', error);
      if (error['code'] === 'EADDRINUSE') {
        this.logger.error(`Port ${this.TCP_PORT} is already in use. Shutting down.`);
        process.exit(1);
      }
    });

    this.tcpServer.listen(this.TCP_PORT, '0.0.0.0', () => {
      this.logger.log(`TCP server listening on 0.0.0.0 port ${this.TCP_PORT}`);
    });
  }

  private processBuffer(socket: net.Socket) {
    const clientInfo = this.clientData.get(socket);
    if (!clientInfo) return;

    let buffer = clientInfo.buffer;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const sofIndex = buffer.indexOf(SOF);
      if (sofIndex === -1) {
        // No SOF found, keep the buffer as is for now, or clear if it's too long (potential garbage)
        // For simplicity, we'll just wait for more data. If buffer gets too large, you might want to clear it.
        // this.logger.debug('No SOF in buffer');
        break;
      }

      // Discard data before SOF
      if (sofIndex > 0) {
        this.logger.warn(`Discarding ${sofIndex * 2} bytes before SOF: ${buffer.substring(0, sofIndex * 2)}`);
        buffer = buffer.substring(sofIndex);
      }

      // Buffer needs to be at least MIN_PACKET_HEADER_LENGTH hex chars (MIN_PACKET_HEADER_LENGTH/2 bytes)
      if (buffer.length < MIN_PACKET_HEADER_LENGTH * 2) {
        this.logger.debug('Buffer too short for header, waiting for more data.');
        break; // Not enough data for the initial header part
      }

      // Check command (assuming SOF is at index 0 now)
      // Command is at byte index 4 (hex string index 8)
      const command = buffer.substring(8, 10); // 2 hex chars for 1 byte
      if (command !== TAG_REPORT_COMMAND) {
        this.logger.warn(`Unknown command ${command}. Discarding SOF and trying again.`);
        buffer = buffer.substring(2); // Discard current 'aa' and retry
        clientInfo.buffer = buffer;
        continue; // Restart loop to find next 'aa'
      }

      // EPC Length is at byte index 6 (hex string index 12)
      const epcLenHex = buffer.substring(12, 14);
      const epcLenBytes = parseInt(epcLenHex, 16);

      if (isNaN(epcLenBytes) || epcLenBytes === 0 || epcLenBytes > 64) { // Sanity check for EPC length
        this.logger.error(`Invalid EPC length: ${epcLenHex} (${epcLenBytes} bytes). Discarding 'aa'.`);
        buffer = buffer.substring(2); // Discard 'aa' and retry
        clientInfo.buffer = buffer;
        continue;
      }

      // Calculate expected total message length based on parsed EPC length
      // Structure: SOF(1) + Addr(1) + MaybeLen(2) + Cmd(1) + SubCmd(1) + EpcLenByte(1) + EPC(epcLenBytes) + Meta(2) + Ant(1) + ReaderCount(1) + RSSI(1) + OtherMeta(3) + CRC(1)
      const expectedTotalLengthBytes = 1 + 1 + 2 + 1 + 1 + 1 + epcLenBytes + 2 + 1 + 1 + 1 + 3 + 1;
      const expectedTotalLengthHexChars = expectedTotalLengthBytes * 2;

      if (buffer.length < expectedTotalLengthHexChars) {
        this.logger.debug(`Buffer has ${buffer.length / 2} bytes, need ${expectedTotalLengthBytes} bytes for EPC len ${epcLenBytes}. Waiting...`);
        break; // Not enough data for the full expected message
      }

      const messagePacket = buffer.substring(0, expectedTotalLengthHexChars);
      buffer = buffer.substring(expectedTotalLengthHexChars); // Remaining buffer

      // Now parse the messagePacket
      try {
        // EPC Data starts at byte index 7 (hex string index 14) to include the E2 prefix
        const epcStartIndexHex = 14;
        const epcEndIndexHex = epcStartIndexHex + (epcLenBytes + 1) * 2; // +1 to include the E2 prefix
        const tagId = messagePacket.substring(epcStartIndexHex, epcEndIndexHex - 2); // -2 to remove only the last byte (30)

        // Assuming metadata starts right after EPC
        // Meta(2bytes) + Ant(1byte) + ReaderCount(1byte)
        // Reader's reported read count is after EPC + 2 bytes (e.g., '3000') + 1 byte (Antenna)
        const readerReportedReadCountIndexHex = epcEndIndexHex + 2 * 2 + 1 * 2; // after EPC (EL bytes) + Meta (2 bytes) + Antenna (1 byte)
        const readerReportedReadCountHex = messagePacket.substring(readerReportedReadCountIndexHex, readerReportedReadCountIndexHex + 2);
        const readerReportedReadCount = parseInt(readerReportedReadCountHex, 16);

        const antennaIdIndexHex = epcEndIndexHex + 2 * 2;
        const antennaIdHex = messagePacket.substring(antennaIdIndexHex, antennaIdIndexHex + 2);
        const antennaId = parseInt(antennaIdHex, 16);

        const rssiIndexHex = readerReportedReadCountIndexHex + 1 * 2;
        const rssiHex = messagePacket.substring(rssiIndexHex, rssiIndexHex + 2);
        const rssi = parseInt(rssiHex, 16);


        // Update server-side count
        const currentServerCount = clientInfo.tagCounts.get(tagId) || 0;
        const newServerCount = currentServerCount + 1;
        clientInfo.tagCounts.set(tagId, newServerCount);

        const parsedData: ParsedTagData = {
          timestamp: new Date().toISOString(),
          tagId: tagId.toUpperCase(),
          serverReadCount: newServerCount,
          readerReportedReadCount: isNaN(readerReportedReadCount) ? undefined : readerReportedReadCount,
          antennaId: isNaN(antennaId) ? undefined : antennaId,
          rssi: isNaN(rssi) ? undefined : rssi,
          rawDataPacket: messagePacket,
        };

        this.logger.log(`Parsed: TagID=${parsedData.tagId}, ServerCnt=${parsedData.serverReadCount}, ReaderCnt=${parsedData.readerReportedReadCount}`);
        this.server.emit('parsedTcpData', parsedData);

      } catch (e) {
        this.logger.error(`Error parsing packet ${messagePacket}:`, e.message);
        // The buffer already had the problematic packet removed, so the loop will continue
      }
    }
    clientInfo.buffer = buffer; // Update buffer with remaining data
  }
}