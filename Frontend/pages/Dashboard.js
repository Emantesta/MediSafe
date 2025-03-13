// pages/Dashboard.js
import { useQuery } from 'react-query';
import api from '../services/api';
import { Card } from 'antd';

const Dashboard = () => {
  const { data: health } = useQuery('health', () => api.get('/health').then(res => res.data));
  const { data: userOps } = useQuery('userOps', () => api.get('/admin/userops').then(res => res.data));

  return (
    <div>
      <Card title="System Health">{health?.status}</Card>
      <Card title="Recent UserOps">{userOps?.length} transactions</Card>
    </div>
  );
};
export default Dashboard;
