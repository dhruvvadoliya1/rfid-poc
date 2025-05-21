import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

interface TcpData {
  timestamp: string;
  data: string;
}

const DataTable = () => {
  const [data, setData] = useState<TcpData[]>([]);

  useEffect(() => {
    const socket = io(window.location.origin);

    socket.on('tcpData', (newData: TcpData) => {
      setData((prevData) => [...prevData, newData]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

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
              <th className="px-6 py-3 bg-gray-100 border-b text-left">Data (HEX)</th>
              <th className="px-6 py-3 bg-gray-100 border-b text-left">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                <td className="px-6 py-4 border-b font-mono">{item.data}</td>
                <td className="px-6 py-4 border-b">{new Date(item.timestamp).toLocaleString()}</td>
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
    </div>
  );
};

export default DataTable; 