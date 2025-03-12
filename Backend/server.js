require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const winston = require('winston');
const cors = require('cors');
const { ethers } = require('ethers');
const redis = require('redis');
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

// Routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const labRoutes = require('./routes/lab');
const pharmacyRoutes = require('./routes/pharmacy');

// Setup Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.Console()
  ]
});

const config = require('./config');
// Express App
const server = https.createServer({
  cert: fs.readFileSync(config.server.sslCertPath),
  key: fs.readFileSync(config.server.sslKeyPath),
});
app.use(cors({ origin: config.server.allowedOrigins }));
mongoose.connect(config.mongo.uri, { useNewUrlParser: true, useUnifiedTopology: true });
// Ethereum setup
const provider = new ethers.providers.JsonRpcProvider(config.blockchain.rpcUrl);
const wallet = new ethers.Wallet(config.blockchain.privateKey, provider);
const contract = new ethers.Contract(config.blockchain.contractAddress, [/* ABI */], wallet);
  'function registerPatient(string)',
  'function verifyDoctor(address, string, uint256)',
  'function verifyLabTechnician(address, string)',
  'function registerPharmacy(address, string)',
  'function bookAppointment(address, uint48, uint8, bool, string) payable',
  'function confirmAppointment(uint256)',
  'function requestAISymptomAnalysis(string)',
  'function reviewAISymptomAnalysis(uint256, string)',
  'function orderLabTest(address, string)',
  'function collectSample(uint256, string)',
  'function uploadLabResults(uint256, string)',
  'function reviewLabResults(uint256, string, string)',
  'function verifyPrescription(uint256, bytes32)',
  'function fulfillPrescription(uint256)',
  'function toggleDataMonetization(bool)',
  'function claimDataReward()',
  'function handleUserOp(tuple(address, uint256, bytes, uint256, uint256, uint256, uint256, uint256, bytes))',
  'function executeUserOp(tuple(address, uint256, bytes, uint256, uint256, uint256, uint256, uint256, bytes))',
  'function nonces(address) view returns (uint256)',
  'function paymaster() view returns (address)',
  'function trustedPaymasters(address) view returns (bool)',
  'function getPatientAppointments(address) view returns (tuple(uint256, address, address, uint48, uint8, uint256, uint8, string, bool)[])',
  'function getLabTestDetails(uint256) view returns (tuple(uint256, address, address, address, uint8, string, string, string, uint48, uint48))',
  'function getPrescriptionDetails(uint256) view returns (tuple(uint256, address, address, bytes32, string, string, uint8, address, uint48, uint48))',
  'function getAIAnalysisDetails(uint256) view returns (tuple(uint256, address, string, string, bool))',
  'function getPatientDataStatus(address) view returns (uint8, uint256)'
], wallet);

// Middleware
app.use(express.static('frontend/dist'));
app.get('*', (req, res) => res.sendFile('index.html', { root: 'frontend/dist' }));
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error('MongoDB connection error:', err));
redisClient.connect().then(() => logger.info('Connected to Redis'));
await new EventLog(eventLog).save(); // Cache in MongoDB
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'eventUpdate', data: eventLog })));
    const keys = await redisClient.keys('events:*');
    for (const key of keys) await redisClient.del(key); // Invalidate cache
  });
});

// Route Middleware
app.use('/auth', authRoutes(wallet, logger));
app.use('/patient', patientRoutes(wallet, contract, wss, logger));
app.use('/doctor', doctorRoutes(wallet, contract, logger));
app.use('/lab', labRoutes(wallet, contract, logger));
app.use('/pharmacy', pharmacyRoutes(wallet, contract, logger));
app.use('/admin', require('./routes/admin')(wallet, contract, provider, logger, redisClient));

// WebSocket Handling
wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'appointment') {
        const appointments = await contract.getPatientAppointments(data.address);
        ws.send(JSON.stringify({ type: 'appointmentUpdate', data: appointments }));
      }
redisClient.on('error', (err) => logger.error('Redis Client Error', err));
    } catch (error) {
      logger.error('WebSocket error:', error);
    }
  });
  // Notify on UserOp status change
  const notifyUpdate = (userOp) => wss.clients.forEach(client => client.send(JSON.stringify({ type: 'userOpUpdate', data: userOp })));
  // Call notifyUpdate in submitUserOperation after status changes
});
  // server.js
wss.clients.forEach(client => client.send(JSON.stringify({ type: 'userUpdate', data: { address, verificationStatus: 'verified' } })));
  
  // Send alerts
  if (parseFloat(paymasterBalance) < 0.1) {
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'paymasterUpdate', data: { balance: amount } })));
  }
});
// At server startup
const eventNames = ['AppointmentBooked', 'PrescriptionFulfilled']; // Add all relevant events
eventNames.forEach(eventName => {
  contract.on(eventName, async (...args) => {
    const event = args[args.length - 1]; // Last arg is event object
    const block = await provider.getBlock(event.blockNumber);
    const eventLog = {
      eventName,
      blockNumber: event.blockNumber,
      timestamp: new Date(block.timestamp * 1000),
      data: event.args,
      transactionHash: event.transactionHash,
    };
server.listen(process.env.PORT || 8080, () => logger.info(`Server running on port ${process.env.PORT || 8080}`));
});

// Start Server
server.listen(8080, () => logger.info('Server running on port 8080'));
