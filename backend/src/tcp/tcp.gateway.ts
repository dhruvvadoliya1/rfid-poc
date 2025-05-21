import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import * as net from 'net';
import { OnModuleInit, Logger } from '@nestjs/common';

interface TcpData {
  timestamp: string;
  data: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class TcpGateway implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  private tcpServer: net.Server;
  private readonly logger = new Logger(TcpGateway.name);
  private readonly TCP_PORT = 8081; // Changed to 9091

  onModuleInit() {
    this.initTcpServer();
  }

  private initTcpServer() {
    this.tcpServer = net.createServer((socket) => {
      this.logger.log('Reader connected');

      socket.on('data', (data) => {
        const hexData = data.toString('hex');
        this.logger.log(`Received: ${hexData}`);
        
        const tcpData: TcpData = {
          timestamp: new Date().toISOString(),
          data: hexData,
        };

        // Broadcast the data to all connected WebSocket clients
        this.server.emit('tcpData', tcpData);
      });

      socket.on('end', () => {
        this.logger.log('Reader disconnected');
      });

      socket.on('error', (error) => {
        this.logger.error('Socket error:', error);
      });
    });

    this.tcpServer.on('error', (error) => {
      this.logger.error('TCP Server error:', error);
      if (error['code'] === 'EADDRINUSE') {
        this.logger.error(`Port ${this.TCP_PORT} is already in use`);
        process.exit(1);
      }
    });

    this.tcpServer.listen(this.TCP_PORT, () => {
      this.logger.log(`TCP server listening on port ${this.TCP_PORT}`);
    });
  }
} 