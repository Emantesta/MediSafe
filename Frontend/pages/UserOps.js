// pages/UserOps.js
import { useState } from 'react';
import { useQuery } from 'react-query';
import { Table } from 'antd';
import api from '../services/api';
import { useEffect } from 'react';
import { subscribeToUpdates } from '../services/websocket';


const UserOps = () => {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading } = useQuery(['userOps', page], () =>
    api.get(`/admin/userops?page=${page}&limit=${pageSize}`).then(res => res.data)
  );
  useEffect(() => {
    subscribeToUpdates((data) => {
      if (data.type === 'userOpUpdate') {
        queryClient.invalidateQueries('userOps'); // Refresh table
      }
    });
  }, []);

  const columns = [
    { title: 'Sender', dataIndex: 'sender' },
    { title: 'Tx Hash', dataIndex: 'txHash' },
    { title: 'Status', dataIndex: 'status' },
    { title: 'Timestamp', dataIndex: 'createdAt' },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data?.userOps}
      loading={isLoading}
      pagination={{ current: page, pageSize, total: data?.total, onChange: setPage }}
    />
  );
};
export default UserOps;
