import { useState } from 'react';
import { useQuery } from 'react-query';
import { Table, Select, Button } from 'antd';
import { Link } from 'react-router-dom';
import api from '../services/api';

const { Option } = Select;

const UserList = () => {
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const pageSize = 10;

  const { data, isLoading, refetch } = useQuery(
    ['users', page, roleFilter, statusFilter],
    () => api.get(`/admin/users?page=${page}&limit=${pageSize}&role=${roleFilter || ''}&status=${statusFilter || ''}`).then(res => res.data)
  );

  const handleVerify = async (address, role) => {
    await api.post('/admin/users/verify', { address, role, verificationData: 'Admin Verified' });
    refetch();
  };

  const handleDeactivate = async (address) => {
    await api.post('/admin/users/deactivate', { address });
    refetch();
  };

  const columns = [
    { title: 'Address', dataIndex: 'address', render: text => <span>{text.slice(0, 6)}...{text.slice(-4)}</span> },
    { title: 'Role', dataIndex: 'role' },
    { title: 'Registration Date', dataIndex: 'registrationDate', render: date => new Date(date).toLocaleDateString() },
    { title: 'Verification Status', dataIndex: 'verificationStatus' },
    { title: 'Last Activity', dataIndex: 'lastActivity', render: date => date ? new Date(date).toLocaleString() : 'N/A' },
    {
      title: 'Actions',
      render: (_, record) => (
        <>
          {record.verificationStatus === 'pending' && record.role !== 'patient' && (
            <Button onClick={() => handleVerify(record.address, record.role)}>Verify</Button>
          )}
          {record.verificationStatus !== 'deactivated' && (
            <Button onClick={() => handleDeactivate(record.address)} danger>Deactivate</Button>
          )}
          <Link to={`/users/${record.address}`}>Details</Link>
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>User List</h1>
      <Select placeholder="Filter by Role" style={{ width: 200, marginRight: 10 }} onChange={setRoleFilter} allowClear>
        <Option value="patient">Patient</Option>
        <Option value="doctor">Doctor</Option>
        <Option value="lab">Lab Technician</Option>
        <Option value="pharmacy">Pharmacy</Option>
      </Select>
      <Select placeholder="Filter by Status" style={{ width: 200 }} onChange={setStatusFilter} allowClear>
        <Option value="pending">Pending</Option>
        <Option value="verified">Verified</Option>
        <Option value="deactivated">Deactivated</Option>
      </Select>
      <Table
        columns={columns}
        dataSource={data?.users}
        loading={isLoading}
        pagination={{ current: page, pageSize, total: data?.total, onChange: setPage }}
        rowKey="address"
      />
    </div>
  );
};
// UserList.js
useEffect(() => {
  subscribeToUpdates((data) => data.type === 'userUpdate' && refetch());
}, [refetch]);

export default UserList;
