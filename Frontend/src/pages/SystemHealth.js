import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Card, Statistic, Row, Col, Alert, Table } from 'antd';
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';

const SystemHealth = () => {
  const [alerts, setAlerts] = useState([]);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery('health', () =>
    api.get('/health').then(res => res.data),
    { refetchInterval: 10000 } // Refresh every 10 seconds
  );

  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'healthAlert') {
        setAlerts(prev => [message.data, ...prev].slice(0, 10)); // Limit to 10 alerts
        queryClient.invalidateQueries('health');
      }
    });
  }, [queryClient]);

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

      {/* Resource Usage */}
      <Card title="Resource Usage" style={{ marginBottom: 20 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Statistic title="CPU (%)" value={data?.resources.cpu} loading={isLoading} />
          </Col>
          <Col span={8}>
            <Statistic title="Memory" value={data?.resources.memory} loading={isLoading} />
          </Col>
          <Col span={8}>
            <Statistic title="Disk" value={data?.resources.disk} loading={isLoading} />
          </Col>
        </Row>
      </Card>

      {/* Uptime and Last Restart */}
      <Card title="System Info" style={{ marginBottom: 20 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Statistic
              title="Uptime (hours)"
              value={data?.uptime ? (data.uptime / 3600).toFixed(2) : 'N/A'}
              loading={isLoading}
            />
          </Col>
          <Col span={12}>
            <Statistic
              title="Last Restart"
              value={data?.lastRestart ? new Date(data.lastRestart).toLocaleString() : 'N/A'}
              loading={isLoading}
            />
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
