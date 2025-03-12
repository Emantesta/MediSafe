import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Table, Select, Input, Button, DatePicker } from 'antd';
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Search: SearchInput } = Input;

const Logs = () => {
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState(null);
  const [timeRange, setTimeRange] = useState([null, null]);
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState(null);
  const [realTimeLogs, setRealTimeLogs] = useState([]);
  const pageSize = 10;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    ['logs', page, level, timeRange, keyword, source],
    () => api.get(`/admin/logs?page=${page}&limit=${pageSize}&level=${level || ''}&startTime=${timeRange[0]?.valueOf() || ''}&endTime=${timeRange[1]?.valueOf() || ''}&keyword=${keyword}&source=${source || ''}`).then(res => res.data),
    { keepPreviousData: true }
  );

  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'logUpdate') {
        setRealTimeLogs(prev => [message.data, ...prev].slice(0, pageSize));
      }
    });
  }, []);

  const handleDownload = () => {
    window.location.href = `/admin/logs?level=${level || ''}&startTime=${timeRange[0]?.valueOf() || ''}&endTime=${timeRange[1]?.valueOf() || ''}&keyword=${keyword}&source=${source || ''}&download=true`;
  };

  const columns = [
    { title: 'Level', dataIndex: 'level', render: level => (
      <span style={{ color: level === 'error' ? '#cf1322' : level === 'warn' ? '#fa8c16' : '#3f8600' }}>{level}</span>
    ) },
    { title: 'Timestamp', dataIndex: 'timestamp', render: date => new Date(date).toLocaleString() },
    { title: 'Source', dataIndex: 'source' },
    { title: 'Message', dataIndex: 'message' },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>System Logs</h1>
      <div style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by Level"
          style={{ width: 150, marginRight: 10 }}
          onChange={setLevel}
          allowClear
        >
          <Option value="info">Info</Option>
          <Option value="warn">Warn</Option>
          <Option value="error">Error</Option>
        </Select>
        <Select
          placeholder="Filter by Source"
          style={{ width: 150, marginRight: 10 }}
          onChange={setSource}
          allowClear
        >
          {data?.sources.map(src => <Option key={src} value={src}>{src}</Option>)}
        </Select>
        <RangePicker
          onChange={dates => setTimeRange(dates || [null, null])}
          style={{ marginRight: 10 }}
        />
        <SearchInput
          placeholder="Search logs"
          onSearch={value => { setKeyword(value); setPage(1); }}
          style={{ width: 200, marginRight: 10 }}
        />
        <Button type="primary" onClick={handleDownload}>Download Logs</Button>
      </div>

      {/* Real-Time Logs */}
      <Card title="Real-Time Logs" style={{ marginBottom: 20 }}>
        <Table
          columns={columns}
          dataSource={realTimeLogs}
          rowKey={(record, index) => `realtime-${index}`}
          pagination={false}
          size="small"
        />
      </Card>

      {/* Historical Logs */}
      <Card title="Historical Logs">
        <Table
          columns={columns}
          dataSource={data?.logs}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: data?.total,
            onChange: setPage,
          }}
          rowKey="timestamp"
        />
      </Card>
    </div>
  );
};

export default Logs;
