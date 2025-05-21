import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

interface TcpData {
  timestamp: string;
  data: string;
}

const DataTable = () => {
  const [data, setData] = useState<TcpData[]>([]);

  useEffect(() => {
    const socket = io(window.location.origin, {
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

    socket.on('tcpData', (newData: TcpData) => {
      setData((prevData) => [...prevData, newData]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const formatHexData = (hexString: string) => {
    // Split the hex string into pairs and join with spaces
    const pairs = hexString.match(/.{1,2}/g) || [];
    // Group pairs into blocks of 8 (16 characters) for better readability
    const blocks = [];
    for (let i = 0; i < pairs.length; i += 8) {
      blocks.push(pairs.slice(i, i + 8).join(' '));
    }
    return blocks.join('\n');
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">TCP Data Log</h1>
      <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 mb-4">
        <p>Connect your TCP client to <span className="font-mono">localhost:8081</span> to see incoming data.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-300">
          <thead>
            <tr>
              <th className="w-2/3 px-6 py-3 bg-gray-100 border-b text-left">Data (HEX)</th>
              <th className="w-1/3 px-6 py-3 bg-gray-100 border-b text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                <td className="px-6 py-4 border-b">
                  <div className="font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {formatHexData(item.data)}
                  </div>
                </td>
                <td className="px-6 py-4 border-b whitespace-normal">
                  {new Date(item.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={2} className="px-6 py-4 text-center text-gray-500">
                  No data received yet. Connect a TCP client to see data here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data.length > 0 && (
        <div className="mt-4 text-right">
          <button
            onClick={() => setData([])}
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
          >
            Clear Data
          </button>
        </div>
      )}
    </div>
  );
};

export default DataTable; 