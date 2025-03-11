import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Table, Select, Input, Button, Modal, Descriptions } from 'antd';
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';

const { Option } = Select;
const { Search } = Input;

const UserOps = () => {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedUserOp, setSelectedUserOp] = useState(null);
  const pageSize = 10;
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching } = useQuery(
    ['userOps', page, statusFilter, search],
    () => api.get(`/admin/userops?page=${page}&limit=${pageSize}&status=${statusFilter || ''}&search=${search}`).then(res => res.data),
    {
      keepPreviousData: true, // Smooth page transitions
      refetchInterval: 300000, // Refresh every 5 minutes
    }
  );

  // Real-time updates
  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'userOpUpdate') {
        queryClient.invalidateQueries('userOps'); // Refresh on update
      }
    });
  }, [queryClient]);

  const handleRetry Composed = async (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleRetry = async (id) => {
    await api.post(`/admin/userops/${id}/retry`);
    queryClient.invalidateQueries('userOps');
  };

  const handleResolve = async (id) => {
    await api.post(`/admin/userops/${id}/resolve`);
    queryClient.invalidateQueries('userOps');
  };

  const columns = [
    { title: 'Sender', dataIndex: 'sender', render: text => `${text.slice(0, 6)}...${text.slice(-4)}` },
    { title: 'Tx Hash', dataIndex: 'txHash', render: text => text ? `${text.slice(0, 6)}...${text.slice(-4)}` : 'N/A' },
    { title: 'Status', dataIndex: 'status' },
    { title: 'Timestamp', dataIndex: 'createdAt', render: date => new Date(date).toLocaleString() },
    {
      title: 'Actions',
      render: (_, record) => (
        <>
          <Button onClick={() => setSelectedUserOp(record)}>Details</Button>
          {record.status === 'failed' && (
            <Button onClick={() => handleRetry(record._id)} style={{ marginLeft: 8 }}>Retry</Button>
          )}
          {['failed', 'pending'].includes(record.status) && (
            <Button onClick={() => handleResolve(record._id)} style={{ marginLeft: 8 }}>Resolve</Button>
          )}
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>User Operations</h1>
      <div style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by Status"
          style={{ width: 200, marginRight: 10 }}
          onChange={setStatusFilter}
          allowClear
          onClear={() => setStatusFilter(null)}
        >
          <Option value="pending">Pending</Option>
          <Option value="validated">Validated</Option>
          <Option value="submitted">Submitted</Option>
          <Option value="failed">Failed</Option>
          <Option value="resolved">Resolved</Option>
        </Select>
        <Search
          placeholder="Search by txHash or sender"
          onSearch={value => { setSearch(value); setPage(1); }}
          onChange={e => { if (!e.target.value) { setSearch(''); setPage(1); } }}
          style={{ width: 300 }}
        />
      </div>
      <Table
        columns={columns}
        dataSource={data?.userOps}
        loading={isLoading || isFetching}
        pagination={{
          current: page,
          pageSize,
          total: data?.total,
          onChange: (newPage) => setPage(newPage),
          showSizeChanger: false,
        }}
        rowKey="_id"
      />

      {/* Details Modal */}
      <Modal
        title="UserOp Details"
        visible={!!selectedUserOp}
        onCancel={() => setSelectedUserOp(null)}
        footer={null}
        width={800}
      >
        {selectedUserOp && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="Sender">{selectedUserOp.sender}</Descriptions.Item>
            <Descriptions.Item label="Tx Hash">{selectedUserOp.txHash || 'N/A'}</Descriptions.Item>
            <Descriptions.Item label="Status">{selectedUserOp.status}</Descriptions.Item>
            <Descriptions.Item label="Nonce">{selectedUserOp.nonce}</Descriptions.Item>
            <Descriptions.Item label="Call Data">{selectedUserOp.callData.slice(0, 50)}...</Descriptions.Item>
            <Descriptions.Item label="Call Gas Limit">{selectedUserOp.callGasLimit}</Descriptions.Item>
            <Descriptions.Item label="Verification Gas Limit">{selectedUserOp.verificationGasLimit}</Descriptions.Item>
            <Descriptions.Item label="Pre-Verification Gas">{selectedUserOp.preVerificationGas}</Descriptions.Item>
            <Descriptions.Item label="Max Fee Per Gas">{selectedUserOp.maxFeePerGas}</Descriptions.Item>
            <Descriptions.Item label="Max Priority Fee Per Gas">{selectedUserOp.maxPriorityFeePerGas}</Descriptions.Item>
            <Descriptions.Item label="Paymaster And Data">{selectedUserOp.paymasterAndData.slice(0, 50)}...</Descriptions.Item>
            <Descriptions.Item label="Signature">{selectedUserOp.signature.slice(0, 50)}...</Descriptions.Item>
            <Descriptions.Item label="Timestamp">{new Date(selectedUserOp.createdAt).toLocaleString()}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default UserOps;
