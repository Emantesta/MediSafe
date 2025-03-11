import { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Table, Select, Input, Button, Modal } from 'antd';
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

  const { data, isLoading, refetch } = useQuery(
    ['userOps', page, statusFilter, search],
    () => api.get(`/admin/userops?page=${page}&limit=${pageSize}&status=${statusFilter || ''}&search=${search}`).then(res => res.data),
    { keepPreviousData: true }
  );

  // Real-time updates
  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'userOpUpdate') {
        queryClient.invalidateQueries('userOps');
      }
    });
  }, [queryClient]);

  const handleRetry = async (id) => {
    await api.post(`/admin/userops/${id}/retry`);
    refetch();
  };

  const handleResolve = async (id) => {
    await api.post(`/admin/userops/${id}/resolve`);
    refetch();
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
          style={{ width: 300 }}
        />
      </div>
      <Table
        columns={columns}
        dataSource={data?.userOps}
        loading={isLoading}
        pagination={{ current: page, pageSize, total: data?.total, onChange: setPage }}
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
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify({
              sender: selectedUserOp.sender,
              nonce: selectedUserOp.nonce,
              callData: selectedUserOp.callData,
              callGasLimit: selectedUserOp.callGasLimit,
              verificationGasLimit: selectedUserOp.verificationGasLimit,
              preVerificationGas: selectedUserOp.preVerificationGas,
              maxFeePerGas: selectedUserOp.maxFeePerGas,
              maxPriorityFeePerGas: selectedUserOp.maxPriorityFeePerGas,
              paymasterAndData: selectedUserOp.paymasterAndData,
              signature: selectedUserOp.signature,
              txHash: selectedUserOp.txHash,
              status: selectedUserOp.status,
              createdAt: selectedUserOp.createdAt,
            }, null, 2)}
          </pre>
        )}
      </Modal>
    </div>
  );
};

export default UserOps;
