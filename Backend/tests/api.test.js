const request = require('supertest');
const app = require('../index'); // Adjust path to your main file

describe('API Endpoints', () => {
  let token;

  beforeAll(async () => {
    // Mock login to get a token
    const res = await request(app)
      .post('/login')
      .send({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        signature: 'mock_signature'
      });
    token = res.body.token;
  });

  it('POST /register-patient should register a patient', async () => {
    const res = await request(app)
      .post('/register-patient')
      .set('Authorization', `Bearer ${token}`)
      .send({ encryptedSymmetricKey: 'mock_key' });
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('txHash');
  });

  it('GET /paymaster-status should return paymaster details', async () => {
    const res = await request(app)
      .get('/paymaster-status')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('paymaster');
    expect(res.body).toHaveProperty('isTrusted');
    expect(res.body).toHaveProperty('balance');
  });
});
