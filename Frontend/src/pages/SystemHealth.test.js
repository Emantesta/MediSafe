import { render, screen } from '@testing-library/react';
import SystemHealth from './SystemHealth';
import healthMock from '../__mocks__/health.json';
import api from '../services/api';

jest.mock('../services/api');

test('renders system health with mock data', async () => {
  api.get.mockResolvedValue({ data: healthMock });
  render(<SystemHealth />);
  expect(await screen.findByText('Server')).toBeInTheDocument();
});
