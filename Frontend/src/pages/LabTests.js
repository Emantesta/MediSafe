import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Table, Select, Button, DatePicker, Modal } from 'antd';
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';

const { Option } = Select;
const { RangePicker } = DatePicker;

const LabTests = () => {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(null);
  const [timeRange, setTimeRange] = useState([null, null]);
  const [selectedTest, setSelectedTest] = useState(null);
  const pageSize = 10;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    ['lab-tests', page, status, timeRange],
    () => api.get(`/admin/lab-tests?page=${page}&limit=${pageSize}&status=${status || ''}&startTime=${timeRange[0]?.valueOf() || ''}&endTime=${timeRange[1]?.valueOf() || ''}`).then(res => res.data),
    { keepPreviousData: true }
  );

  const { data: testDetails, isLoading: detailsLoading } = useQuery(
    ['lab-test', selectedTest],
    () => api.get(`/admin/lab-test/${selectedTest}`).then(res => res.data),
    { enabled: !!selectedTest }
  );

  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'labTestUpdate') {
        queryClient.invalidateQueries('lab-tests');
      }
    });
  }, [queryClient]);

  const columns = [
    { title: 'Test ID', dataIndex: 'testId' },
    { title: 'Patient Address', dataIndex: 'patientAddress', render: addr => `${addr.slice(0, 6)}...${addr.slice(-4)}` },
    { title: 'Lab Address', dataIndex: 'labAddress', render: addr => `${addr.slice(0, 6)}...${addr.slice(-4)}` },
    { title: 'Test Type', dataIndex: 'testType' },
    { title: 'Status', dataIndex: 'status' },
    { title: 'IPFS Hash', dataIndex: 'ipfsHash', render: hash => hash || 'N/A' },
    {
      title: 'Actions',
      render: (_, record) => (
        <Button
          onClick={() => setSelectedTest(record.testId)}
          disabled={!record.ipfsHash}
        >
          View Results
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>Lab Tests</h1>
      <div style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by Status"
          style={{ width: 150, marginRight: 10 }}
          onChange={setStatus}
          allowClear
        >
          <Option value="ordered">Ordered</Option>
          <Option value="collected">Collected</Option>
          <Option value="uploaded">Uploaded</Option>
          <Option value="reviewed">Reviewed</Option>
        </Select>
        <RangePicker
          onChange={dates => setTimeRange(dates || [null, null])}
          style={{ marginRight: 10 }}
        />
      </div>

      <Table
        columns={columns}
        dataSource={data?.labTests}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.total,
          onChange: setPage,
        }}
        rowKey="testId"
      />

      {/* Result Details Modal */}
      <Modal
        title={`Lab Test ${selectedTest} Results`}
        visible={!!selectedTest}
        onCancel={() => setSelectedTest(null)}
        footer={null}
      >
        {detailsLoading ? (
          <p>Loading...</p>
        ) : testDetails?.results ? (
          <pre>{testDetails.results}</pre> // Adjust rendering based on content type
        ) : (
          <p>No results available</p>
        )}
      </Modal>
    </div>
  );
};

export default LabTests;
