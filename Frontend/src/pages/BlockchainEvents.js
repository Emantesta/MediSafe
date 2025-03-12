import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Table, Select, DatePicker, Input, Button } from 'antd';
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';
import moment from 'moment';

const { Option } = Select;
const { RangePicker } = DatePicker;

const BlockchainEvents = () => {
  const [page, setPage] = useState(1);
  const [eventName, setEventName] = useState(null);
  const [timeRange, setTimeRange] = useState([null, null]);
  const [userAddress, setUserAddress] = useState('');
  const pageSize = 10;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    ['events', page, eventName, timeRange, userAddress],
    () => api.get(`/admin/events?page=${page}&limit=${pageSize}&eventName=${eventName || ''}&startTime=${timeRange[0]?.valueOf() || ''}&endTime=${timeRange[1]?.valueOf() || ''}&userAddress=${userAddress}`).then(res => res.data),
    { keepPreviousData: true }
  );

  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'eventUpdate') {
        queryClient.setQueryData(['events', page, eventName, timeRange, userAddress], (old) => ({
          ...old,
          events: [message.data, ...(old?.events || [])].slice(0, pageSize),
        }));
      }
    });
  }, [queryClient, page, eventName, timeRange, userAddress]);

  const handleExport = () => {
    window.location.href = `/admin/events?eventName=${eventName || ''}&startTime=${timeRange[0]?.valueOf() || ''}&endTime=${timeRange[1]?.valueOf() || ''}&userAddress=${userAddress}&exportCsv=true`;
  };

  const columns = [
    { title: 'Event Name', dataIndex: 'eventName' },
    { title: 'Block Number', dataIndex: 'blockNumber' },
    { title: 'Timestamp', dataIndex: 'timestamp', render: date => new Date(date).toLocaleString() },
    { title: 'Data', dataIndex: 'data', render: data => JSON.stringify(data).slice(0, 50) + '...' },
    { title: 'Tx Hash', dataIndex: 'transactionHash', render: text => `${text.slice(0, 6)}...${text.slice(-4)}` },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>Blockchain Events</h1>
      <div style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by Event"
          style={{ width: 200, marginRight: 10 }}
          onChange={setEventName}
          allowClear
        >
          <Option value="AppointmentBooked">AppointmentBooked</Option>
          <Option value="PrescriptionFulfilled">PrescriptionFulfilled</Option>
          {/* Add more events as per contract */}
        </Select>
        <RangePicker
          onChange={dates => setTimeRange(dates || [null, null])}
          style={{ marginRight: 10 }}
        />
        <Input
          placeholder="Filter by User Address"
          value={userAddress}
          onChange={e => setUserAddress(e.target.value)}
          style={{ width: 200, marginRight: 10 }}
        />
        <Button type="primary" onClick={handleExport}>Export as CSV</Button>
      </div>
      <Table
        columns={columns}
        dataSource={data?.events}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.total,
          onChange: setPage,
        }}
        rowKey="transactionHash"
      />
    </div>
  );
};

export default BlockchainEvents;
