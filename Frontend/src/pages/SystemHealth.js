import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Card, Statistic, Row, Col, Alert, Table, Select } from 'antd';
import { Line } from 'react-chartjs-2';
import Chart from 'chart.js/auto'; // Required for react-chartjs-2
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';

const { Option } = Select;

const SystemHealth = () => {
  const [alerts, setAlerts] = useState([]);
  const [timeRange, setTimeRange] = useState('1h'); // Default: last hour
  const queryClient = useQueryClient();

  const getTimeRange = () => {
    const now = Date.now();
    const ranges = {
      '1h': now - 3600000,
      '24h': now - 86400000,
      '7d': now - 604800000,
    };
    return ranges[timeRange] || ranges['1h'];
  };

  const { data, isLoading } = useQuery(
    ['health', timeRange],
    () => api.get(`/health?startTime=${getTimeRange()}`).then(res => res.data),
    { refetchInterval: 10000 }
  );

  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'healthAlert') {
        setAlerts(prev => [message.data, ...prev].slice(0, 10));
        queryClient.invalidateQueries('health');
      } else if (message.type === 'resourceUpdate') {
        queryClient.setQueryData(['health', timeRange], (old) => ({
          ...old,
          resources: {
            ...old.resources,
            history: [...old.resources.history, { timestamp: new Date(), ...message.data, memoryTotal: old.resources.current.memory.split('/')[1], diskTotal: old.resources.current.disk[1] }],
          },
        }));
      }
    });
  }, [queryClient, timeRange]);

  const chartOptions = {
    scales: { x: { type: 'time', time: { unit: 'minute' } } },
    maintainAspectRatio: false,
  };

  const cpuData = {
    labels: data?.resources.history.map(h => h.timestamp),
    datasets: [{
      label: 'CPU Usage (%)',
      data: data?.resources.history.map(h => h.cpu),
      borderColor: 'rgba(75, 192, 192, 1)',
      fill: false,
    }],
  };

  const memoryData = {
    labels: data?.resources.history.map(h => h.timestamp),
    datasets: [
      { label: 'Memory Used (GB)', data: data?.resources.history.map(h => h.memoryUsed), borderColor: 'rgba(255, 99, 132, 1)', fill: false },
      { label: 'Memory Total (GB)', data: data?.resources.history.map(h => h.memoryTotal), borderColor: 'rgba(255, 99, 132, 0.2)', fill: false, dashed: true },
    ],
  };

  const diskData = {
    labels: data?.resources.history.map(h => h.timestamp),
    datasets: [
      { label: 'Disk Used (GB)', data: data?.resources.history.map(h => h.diskUsed), borderColor: 'rgba(54, 162, 235, 1)', fill: false },
      { label: 'Disk Total (GB)', data: data?.resources.history.map(h => h.diskTotal), borderColor: 'rgba(54, 162, 235, 0.2)', fill: false, dashed: true },
    ],
  };

  const statusColumns = [
    { title: 'Service', dataIndex: 'service' },
    { title: 'Status', dataIndex: 'status', render: status => (
      <span style={{ color: status === 'Up' ? '#3f8600' : '#cf1322' }}>{status}</span>
    ) },
  ];

  const alertColumns = [
    { title: 'Message', dataIndex: 'message' },
    { title: 'Timestamp', dataIndex: 'timestamp', render: date => new Date(date).toLocaleString() },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>System Health</h1>

      {/* Status Indicators */}
      <Card title="Service Status" style={{ marginBottom: 20 }}>
        <Table
          columns={statusColumns}
          dataSource={[
            { key: 'server', service: 'Server', status: data?.status.server },
            { key: 'mongo', service: 'MongoDB', status: data?.status.mongo },
            { key: 'ipfs', service: 'IPFS', status: data?.status.ipfs },
            { key: 'blockchain', service: 'Blockchain RPC', status: data?.status.blockchain },
            { key: 'websocket', service: 'WebSocket', status: data?.status.websocket },
          ]}
          loading={isLoading}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Resource Usage Graphs */}
      <Card title="Resource Usage" style={{ marginBottom: 20 }}>
        <Select
          defaultValue="1h"
          style={{ width: 120, marginBottom: 16 }}
          onChange={setTimeRange}
        >
          <Option value="1h">Last Hour</Option>
          <Option value="24h">Last 24 Hours</Option>
          <Option value="7d">Last 7 Days</Option>
        </Select>
        <Row gutter={16}>
          <Col span={8}>
            <div style={{ height: 200 }}>
              <Line data={cpuData} options={chartOptions} />
            </div>
          </Col>
          <Col span={8}>
            <div style={{ height: 200 }}>
              <Line data={memoryData} options={chartOptions} />
            </div>
          </Col>
          <Col span={8}>
            <div style={{ height: 200 }}>
              <Line data={diskData} options={chartOptions} />
            </div>
          </Col>
        </Row>
      </Card>

      {/* Uptime and Last Restart */}
      <Card title="System Info" style={{ marginBottom: 20 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Statistic title="Uptime (hours)" value={data?.uptime ? (data.uptime / 3600).toFixed(2) : 'N/A'} loading={isLoading} />
          </Col>
          <Col span={12}>
            <Statistic title="Last Restart" value={data?.lastRestart ? new Date(data.lastRestart).toLocaleString() : 'N/A'} loading={isLoading} />
          </Col>
        </Row>
      </Card>

      {/* Alerts */}
      <Card title="Alerts">
        <Table
          columns={alertColumns}
          dataSource={[...(data?.alerts || []), ...alerts]}
          loading={isLoading}
          rowKey={(record, index) => index}
          pagination={{ pageSize: 5 }}
        />
      </Card>
    </div>
  );
};

export default SystemHealth;
