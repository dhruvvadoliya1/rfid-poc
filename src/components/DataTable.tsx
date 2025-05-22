import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

interface ParsedTagData {
  timestamp: string;
  tagId: string;
  serverReadCount: number;
  readerReportedReadCount?: number;
  antennaId?: number;
  rssi?: number;
  rawDataPacket: string;
}

interface TagCount {
  tagId: string;
  count: number;
  lastSeen: string;
  lastRssi?: number;
}

const DataTable = () => {
  const [rawData, setRawData] = useState<ParsedTagData[]>([]);
  const [tagCounts, setTagCounts] = useState<Map<string, TagCount>>(new Map());

  useEffect(() => {
    const socket = io('http://localhost:8080', {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    socket.on('parsedTcpData', (newData: ParsedTagData) => {
      setRawData((prevData) => [...prevData, newData]);

      setTagCounts((prevCounts) => {
        const newCounts = new Map(prevCounts);
        const existingTag = newCounts.get(newData.tagId) || {
          tagId: newData.tagId,
          count: 0,
          lastSeen: newData.timestamp,
          lastRssi: newData.rssi
        };

        newCounts.set(newData.tagId, {
          ...existingTag,
          count: existingTag.count + 1,
          lastSeen: newData.timestamp,
          lastRssi: newData.rssi
        });

        return newCounts;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const formatHexData = (hexString: string) => {
    const pairs = hexString.match(/.{1,2}/g) || [];
    return pairs.join(' ');
  };

  const clearAll = () => {
    setRawData([]);
    setTagCounts(new Map());
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">RFID Tag Monitor</h1>

      {/* Tag Counts Table */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3">Tag Summary</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr>
                <th className="px-6 py-3 bg-gray-100 border-b text-left">Tag ID</th>
                <th className="px-6 py-3 bg-gray-100 border-b text-left">Read Count</th>
                <th className="px-6 py-3 bg-gray-100 border-b text-left">Last Seen</th>
                <th className="px-6 py-3 bg-gray-100 border-b text-left">Last RSSI</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(tagCounts.values()).map((tag) => (
                <tr key={tag.tagId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 border-b font-mono">{tag.tagId}</td>
                  <td className="px-6 py-4 border-b">{tag.count}</td>
                  <td className="px-6 py-4 border-b">{new Date(tag.lastSeen).toLocaleString()}</td>
                  <td className="px-6 py-4 border-b">{tag.lastRssi !== undefined ? `${tag.lastRssi} dBm` : 'N/A'}</td>
                </tr>
              ))}
              {tagCounts.size === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                    No tags detected yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Raw Data Table */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Raw Data Log</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr>
                <th className="w-1/4 px-6 py-3 bg-gray-100 border-b text-left">Tag ID</th>
                <th className="w-1/2 px-6 py-3 bg-gray-100 border-b text-left">Raw Data</th>
                <th className="w-1/4 px-6 py-3 bg-gray-100 border-b text-left">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {rawData.map((item, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="px-6 py-4 border-b font-mono">{item.tagId}</td>
                  <td className="px-6 py-4 border-b">
                    <div className="font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                      {formatHexData(item.rawDataPacket)}
                    </div>
                  </td>
                  <td className="px-6 py-4 border-b whitespace-normal">
                    {new Date(item.timestamp).toLocaleString()}
                  </td>
                </tr>
              ))}
              {rawData.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-4 text-center text-gray-500">
                    No data received yet. Connect a TCP client to see data here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(rawData.length > 0 || tagCounts.size > 0) && (
        <div className="mt-4 text-right">
          <button
            onClick={clearAll}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Clear All Data
          </button>
        </div>
      )}
    </div>
  );
};

export default DataTable; 