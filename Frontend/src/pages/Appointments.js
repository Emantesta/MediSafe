import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { Table, Select, Input, Button, DatePicker, Modal, Form, message } from 'antd';
import api from '../services/api';
import { subscribeToUpdates } from '../services/websocket';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { Search: SearchInput } = Input;

const Appointments = () => {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(null);
  const [timeRange, setTimeRange] = useState([null, null]);
  const [userAddress, setUserAddress] = useState('');
  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [form] = Form.useForm();
  const pageSize = 10;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    ['appointments', page, status, timeRange, userAddress],
    () => api.get(`/admin/appointments?page=${page}&limit=${pageSize}&status=${status || ''}&startTime=${timeRange[0]?.valueOf() || ''}&endTime=${timeRange[1]?.valueOf() || ''}&userAddress=${userAddress}`).then(res => res.data),
    { keepPreviousData: true }
  );

  useEffect(() => {
    subscribeToUpdates((message) => {
      if (message.type === 'appointmentUpdate') {
        queryClient.invalidateQueries('appointments');
      }
    });
  }, [queryClient]);

  const handleCancel = async (id) => {
    try {
      await api.post(`/admin/appointments/${id}/cancel`);
      message.success('Appointment cancelled');
      queryClient.invalidateQueries('appointments');
    } catch (error) {
      message.error('Cancellation failed');
    }
  };

  const handleReschedule = async (values) => {
    try {
      await api.post(`/admin/appointments/${rescheduleModal}/reschedule`, { newTimestamp: values.timestamp });
      message.success('Appointment rescheduled');
      setRescheduleModal(null);
      queryClient.invalidateQueries('appointments');
    } catch (error) {
      message.error('Rescheduling failed');
    }
  };

  const columns = [
    { title: 'Patient Address', dataIndex: 'patientAddress', render: addr => `${addr.slice(0, 6)}...${addr.slice(-4)}` },
    { title: 'Doctor Address', dataIndex: 'doctorAddress', render: addr => `${addr.slice(0, 6)}...${addr.slice(-4)}` },
    { title: 'Timestamp', dataIndex: 'timestamp', render: date => new Date(date).toLocaleString() },
    { title: 'Status', dataIndex: 'status' },
    { title: 'Video Call Link', dataIndex: 'videoCallLink', render: link => link ? <a href={link} target="_blank" rel="noopener noreferrer">Join</a> : 'N/A' },
    {
      title: 'Actions',
      render: (_, record) => (
        <>
          {record.status !== 'cancelled' && (
            <Button onClick={() => handleCancel(record.appointmentId)} danger>Cancel</Button>
          )}
          {['booked', 'confirmed'].includes(record.status) && (
            <Button onClick={() => setRescheduleModal(record.appointmentId)} style={{ marginLeft: 8 }}>Reschedule</Button>
          )}
        </>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px' }}>
      <h1>Appointments</h1>
      <div style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by Status"
          style={{ width: 150, marginRight: 10 }}
          onChange={setStatus}
          allowClear
        >
          <Option value="booked">Booked</Option>
          <Option value="confirmed">Confirmed</Option>
          <Option value="completed">Completed</Option>
          <Option value="cancelled">Cancelled</Option>
        </Select>
        <RangePicker
          onChange={dates => setTimeRange(dates || [null, null])}
          style={{ marginRight: 10 }}
        />
        <SearchInput
          placeholder="Search by patient/doctor address"
          onSearch={value => { setUserAddress(value); setPage(1); }}
          style={{ width: 200 }}
        />
      </div>

      <Table
        columns={columns}
        dataSource={data?.appointments}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.total,
          onChange: setPage,
        }}
        rowKey="appointmentId"
      />

      {/* Reschedule Modal */}
      <Modal
        title="Reschedule Appointment"
        visible={!!rescheduleModal}
        onCancel={() => setRescheduleModal(null)}
        footer={null}
      >
        <Form form={form} onFinish={handleReschedule}>
          <Form.Item name="timestamp" label="New Timestamp" rules={[{ required: true }]}>
            <DatePicker showTime />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">Reschedule</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Appointments;
