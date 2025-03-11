import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Card, Statistic, Table, Input, Button, Descriptions } from 'antd';
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';

const PaymasterManagement = () => {
  const [fundAmount, setFundAmount] = useState('');
  const [trustedAddress, setTrustedAddress] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery('paymasterStatus', () =>
    api.get('/admin/paymaster-status').then(res => res.data),
    { refetchInterval: 60000 } // Refresh every minute
  );

  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'paymasterUpdate') {
        queryClient.invalidateQueries('paymasterStatus');
      }
    });
  }, [queryClient]);

  const handleFund = async () => {
    await api.post('/admin/paymaster/fund', { amount: fundAmount });
    setFundAmount('');
    queryClient.invalidateQueries('paymasterStatus');
  };

  const handleUpdateTrusted = async (action) => {
    await api.post('/admin/paymaster/trusted', { action, address: trustedAddress });
    setTrustedAddress('');
    queryClient.invalidateQueries('paymasterStatus');
  };

  const fundingColumns = [
    { title: 'Tx Hash', dataIndex: 'txHash', render: text => `${text.slice(0, 6)}...${text.slice(-4)}` },
    { title: 'Amount (ETH)', dataIndex: 'amount', render: wei => ethers.utils.formatEther(wei) },
    { title: 'Type', dataIndex: 'type' },
    { title: 'Timestamp', dataIndex: 'timestamp', render: date => new Date(date).toLocaleString() },
    { title: 'Admin', dataIndex: 'adminAddress', render: text => `${text.slice(0, 6)}...${text.slice(-4)}` },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>Paymaster Management</h1>

      {/* Current Paymaster Status */}
      <Card title="Current Paymaster" style={{ marginBottom: 20 }}>
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <>
            <Statistic title="Address" value={data?.paymaster.address} />
            <Statistic title="Balance (ETH)" value={data?.paymaster.balance} />
          </>
        )}
      </Card>

      {/* Trusted Paymasters */}
      <Card title="Trusted Paymasters" style={{ marginBottom: 20 }}>
        <Descriptions column={1}>
          {data?.trustedPaymasters.map((addr, index) => (
            <Descriptions.Item key={index} label={`Paymaster ${index + 1}`}>
              {addr.slice(0, 6)}...{addr.slice(-4)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      </Card>

      {/* Funding Actions */}
      <Card title="Add Funds" style={{ marginBottom: 20 }}>
        <Input
          placeholder="Amount in ETH"
          value={fundAmount}
          onChange={e => setFundAmount(e.target.value)}
          style={{ width: 200, marginRight: 10 }}
        />
        <Button type="primary" onClick={handleFund} disabled={!fundAmount || isLoading}>
          Fund Paymaster
        </Button>
      </Card>

      {/* Update Trusted Paymasters */}
      <Card title="Update Trusted Paymasters" style={{ marginBottom: 20 }}>
        <Input
          placeholder="Paymaster Address"
          value={trustedAddress}
          onChange={e => setTrustedAddress(e.target.value)}
          style={{ width: 300, marginRight: 10 }}
        />
        <Button onClick={() => handleUpdateTrusted('add')} disabled={!trustedAddress || isLoading}>
          Add
        </Button>
        <Button onClick={() => handleUpdateTrusted('remove')} disabled={!trustedAddress || isLoading} style={{ marginLeft: 10 }}>
          Remove
        </Button>
      </Card>

      {/* Funding History */}
      <Card title="Funding History">
        <Table
          columns={fundingColumns}
          dataSource={data?.fundingHistory}
          loading={isLoading}
          rowKey="txHash"
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default PaymasterManagement;
