import { useState, useEffect } from 'react';
import { useQuery } from 'react-query';
import { Card, Alert, Row, Col, Statistic } from 'antd';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';

const Dashboard = () => {
  const { data, isLoading } = useQuery('dashboard', () =>
    api.get('/admin/dashboard').then(res => res.data)
  );

  const [alerts, setAlerts] = useState(data?.alerts || []);

  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'alert') setAlerts(prev => [...prev, message.data]);
    });
  }, []);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div style={{ padding: '20px' }}>
      <h1>Admin Dashboard</h1>

      {/* System Health */}
      <Row gutter={16}>
        <Col span={6}>
          <Card title="Server">
            <Statistic value={data.health.server.status} valueStyle={{ color: data.health.server.status === 'ok' ? '#3f8600' : '#cf1322' }} />
            <p>Uptime: {(data.health.server.uptime / 3600).toFixed(2)} hours</p>
          </Card>
        </Col>
        <Col span={6}>
          <Card title="MongoDB">
            <Statistic value={data.health.mongo.status} valueStyle={{ color: data.health.mongo.status === 'ok' ? '#3f8600' : '#cf1322' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card title="IPFS">
            <Statistic value={data.health.ipfs.status} valueStyle={{ color: data.health.ipfs.status === 'ok' ? '#3f8600' : '#cf1322' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card title="Blockchain">
            <Statistic value={data.health.blockchain.status} valueStyle={{ color: data.health.blockchain.status === 'ok' ? '#3f8600' : '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      {/* Total Registered Users */}
      <Row gutter={16} style={{ marginTop: '20px' }}>
        <Col span={6}><Card title="Patients"><Statistic value={data.users.patients} /></Card></Col>
        <Col span={6}><Card title="Doctors"><Statistic value={data.users.doctors} /></Card></Col>
        <Col span={6}><Card title="Labs"><Statistic value={data.users.labs} /></Card></Col>
        <Col span={6}><Card title="Pharmacies"><Statistic value={data.users.pharmacies} /></Card></Col>
      </Row>

      {/* Recent UserOps */}
      <Row gutter={16} style={{ marginTop: '20px' }}>
        <Col span={12}>
          <Card title="Recent UserOps (Last 24h)">
            <Statistic title="Total" value={data.userOps.total} />
            <Statistic title="Success Rate" value={data.userOps.successRate} suffix="%" />
            <Link to="/userops">View Details</Link>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Blockchain Sync">
            <Statistic title="Block Number" value={data.blockchain.blockNumber} />
            <Statistic title="Gas Price" value={data.blockchain.gasPrice} suffix="Gwei" />
          </Card>
        </Col>
      </Row>

      {/* Paymaster Status */}
      <Row gutter={16} style={{ marginTop: '20px' }}>
        <Col span={24}>
          <Card title="Paymaster Status">
            <p>Address: {data.paymaster.address}</p>
            <Statistic title="Balance" value={data.paymaster.balance} suffix="ETH" />
          </Card>
        </Col>
      </Row>

      {/* Alerts */}
      <div style={{ marginTop: '20px' }}>
        <h2>Alerts</h2>
        {alerts.map((alert, index) => (
          <Alert key={index} message={alert} type="error" showIcon style={{ marginBottom: '10px' }} />
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
