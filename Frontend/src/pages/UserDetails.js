import { useParams } from 'react-router-dom';
import { useQuery } from 'react-query';
import { Card, Table, Button, Tabs } from 'antd';
import api from '../services/api';

const { TabPane } = Tabs;

const UserDetails = () => {
  const { address } = useParams();
  const { data, isLoading, refetch } = useQuery(['user', address], () =>
    api.get(`/admin/users/${address}`).then(res => res.data)
  );

  const handleResetNonce = async () => {
    await api.post(`/admin/users/${address}/reset-nonce`);
    refetch();
  };

  const handleBan = async () => {
    await api.post(`/admin/users/${address}/ban`);
    refetch();
  };

  if (isLoading) return <div>Loading...</div>;

  const userOpsColumns = [
    { title: 'Tx Hash', dataIndex: 'txHash', render: text => text?.slice(0, 6) + '...' + text?.slice(-4) },
    { title: 'Status', dataIndex: 'status' },
    { title: 'Timestamp', dataIndex: 'createdAt', render: date => new Date(date).toLocaleString() },
  ];

  const appointmentsColumns = [
    { title: 'ID', dataIndex: '0' },
    { title: 'Doctor', dataIndex: '2', render: text => text.slice(0, 6) + '...' + text.slice(-4) },
    { title: 'Timestamp', dataIndex: '3', render: ts => new Date(ts * 1000).toLocaleString() },
    { title: 'Status', dataIndex: '6', render: status => ['Booked', 'Confirmed', 'Completed'][status] },
  ];

  const labTestsColumns = [
    { title: 'ID', dataIndex: '0' },
    { title: 'Test Type', dataIndex: '5' },
    { title: 'Status', dataIndex: '4', render: status => ['Ordered', 'Collected', 'Uploaded', 'Reviewed'][status] },
  ];

  const prescriptionsColumns = [
    { title: 'ID', dataIndex: '0' },
    { title: 'Pharmacy', dataIndex: '7', render: text => text.slice(0, 6) + '...' + text.slice(-4) },
    { title: 'Status', dataIndex: '6', render: status => ['Issued', 'Verified', 'Fulfilled'][status] },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>User Details: {address.slice(0, 6)}...{address.slice(-4)}</h1>
      <Card title="User Info">
        <p><strong>Address:</strong> {data.info.address}</p>
        <p><strong>Role:</strong> {data.info.role}</p>
        <p><strong>Registration Date:</strong> {new Date(data.info.registrationDate).toLocaleDateString()}</p>
        <p><strong>Verification Status:</strong> {data.info.verificationStatus}</p>
        {data.info.dataMonetization !== null && (
          <p><strong>Data Monetization:</strong> {data.info.dataMonetization ? 'Enabled' : 'Disabled'}</p>
        )}
        <Button onClick={handleResetNonce} style={{ marginRight: 10 }}>Reset Nonce</Button>
        <Button onClick={handleBan} danger>Ban User</Button>
      </Card>

      <Tabs defaultActiveKey="1" style={{ marginTop: '20px' }}>
        <TabPane tab="Recent UserOps" key="1">
          <Table columns={userOpsColumns} dataSource={data.userOps} rowKey="_id" pagination={false} />
        </TabPane>
        <TabPane tab="Appointments" key="2">
          <Table columns={appointmentsColumns} dataSource={data.appointments} rowKey="0" pagination={false} />
        </TabPane>
        {data.labTests.length > 0 && (
          <TabPane tab="Lab Tests" key="3">
            <Table columns={labTestsColumns} dataSource={data.labTests} rowKey="0" pagination={false} />
          </TabPane>
        )}
        {data.prescriptions.length > 0 && (
          <TabPane tab="Prescriptions" key="4">
            <Table columns={prescriptionsColumns} dataSource={data.prescriptions} rowKey="0" pagination={false} />
          </TabPane>
        )}
      </Tabs>
    </div>
  );
};

export default UserDetails;
