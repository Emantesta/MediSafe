// Mock response for /admin/dashboard
{
  health: { server: { status: 'ok', uptime: 3600 }, mongo: { status: 'ok' }, ipfs: { status: 'ok' }, blockchain: { status: 'ok' } },
  users: { patients: 50, doctors: 20, labs: 10, pharmacies: 5 },
  userOps: { total: 100, successRate: 95, failureRate: 5 },
  blockchain: { blockNumber: 123456, gasPrice: '10' },
  paymaster: { address: '0xPaymasterAddress', balance: '0.5' },
  alerts: ['Low paymaster balance: 0.5 ETH']
}
