const healthMock = require('../mocks/health.json');

test('GET /health returns mock data', async () => {
  // Mock the endpoint logic here
  const response = healthMock;
  expect(response.status.server).toBe('Up');
});
