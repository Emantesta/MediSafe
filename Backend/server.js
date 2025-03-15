require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const ResourceUsage = require('../models/ResourceUsage');
const mongoose = require('mongoose');
const winston = require('winston');
const cors = require('cors');
const { ethers } = require('ethers');
const redis = require('redis');
const Appointment = require('./models/Appointment');
const EventLog = require('./models/EventLog');
const LabTest = require('./models/LabTest'); 
const Prescription = require('./models/Prescription');
const { Transport } = require('winston');
const config = require('./config');

// Initialize Express and Server
const app = express();
const server = process.env.NODE_ENV === 'production'
  ? https.createServer({ cert: fs.readFileSync(config.server.sslCertPath), key: fs.readFileSync(config.server.sslKeyPath) }, app)
  : http.createServer(app);
const wss = new WebSocketServer({ server });

// Redis Client
const redisClient = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
redisClient.on('error', (err) => logger.error('Redis Client Error', err));

// Custom Winston WebSocket Transport
class WebSocketTransport extends winston.Transport {
  constructor(wss) {
    super();
    this.wss = wss;
  }
  log(info, callback) {
    this.wss.clients.forEach(client => client.send(JSON.stringify({ type: 'logUpdate', data: info })));
    callback();
  }
}
logger.add(new WebSocketTransport(wss));

// Setup Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/combined.log', maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.File({ filename: 'logs/access.log', level: 'info', maxsize: 5242880, maxFiles: 5 }),
    new winston.transports.Console(),
    new WebSocketTransport(wss),
  ],
});

// Ethereum Setup
const provider = new ethers.providers.JsonRpcProvider(config.blockchain.rpcUrl);
const wallet = new ethers.Wallet(config.blockchain.privateKey, provider);
const contract = new ethers.Contract(config.blockchain.contractAddress, [
  'function registerPatient(string)', 'function verifyDoctor(address, string, uint256)', 
  'function verifyLabTechnician(address, string)', 'function registerPharmacy(address, string)',
  'function bookAppointment(address, uint48, uint8, bool, string) payable', 'function confirmAppointment(uint256)',
  'function requestAISymptomAnalysis(string)', 'function reviewAISymptomAnalysis(uint256, string)',
  'function orderLabTest(address, string)', 'function collectSample(uint256, string)',
  'function uploadLabResults(uint256, string)', 'function reviewLabResults(uint256, string, string)',
  'function verifyPrescription(uint256, bytes32)', 'function fulfillPrescription(uint256)',
  'function toggleDataMonetization(bool)', 'function claimDataReward()',
  'function handleUserOp(tuple(address, uint256, bytes, uint256, uint256, uint256, uint256, uint256, bytes))',
  'function executeUserOp(tuple(address, uint256, bytes, uint256, uint256, uint256, uint256, uint256, bytes))',
  'function nonces(address) view returns (uint256)', 'function paymaster() view returns (address)',
  'function trustedPaymasters(address) view returns (bool)',
  'function getPatientAppointments(address) view returns (tuple(uint256, address, address, uint48, uint8, uint256, uint8, string, bool)[])',
  'function getLabTestDetails(uint256) view returns (tuple(uint256, address, address, address, uint8, string, string, string, uint48, uint48))',
  'function getPrescriptionDetails(uint256) view returns (tuple(uint256, address, address, bytes32, string, string, uint8, address, uint48, uint48))',
  'function getAIAnalysisDetails(uint256) view returns (tuple(uint256, address, string, string, bool))',
  'function getPatientDataStatus(address) view returns (uint8, uint256)',
], wallet);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || config.server.allowedOrigins }));
app.use(express.json());
app.use(express.static('frontend/dist'));

// Routes
app.use('/auth', require('./routes/auth')(wallet, logger));
app.use('/patient', require('./routes/patient')(wallet, contract, wss, logger));
app.use('/doctor', require('./routes/doctor')(wallet, contract, logger));
app.use('/lab', require('./routes/lab')(wallet, contract, logger));
app.use('/pharmacy', require('./routes/pharmacy')(wallet, contract, logger));
app.use('/admin', require('./routes/admin')(wallet, contract, provider, logger, redisClient, wss));
app.use('/health', require('./routes/health')(provider, logger, redisClient, wss));

// Health Check Endpoint
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Fallback for SPA
app.get('*', (req, res) => res.sendFile('index.html', { root: 'frontend/dist' }));

// MongoDB Connection
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || config.mongo.uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('Connected to MongoDB');
  } catch (err) {
    logger.error('MongoDB connection error:', err);
  }
};

// Redis Connection
const connectRedis = async () => {
  try {
    await redisClient.connect();
    logger.info('Connected to Redis');
  } catch (err) {
    logger.error('Redis connection error:', err);
  }
};

// WebSocket Handling
wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'appointment') {
        const appointments = await contract.getPatientAppointments(data.address);
        ws.send(JSON.stringify({ type: 'appointmentUpdate', data: appointments }));
      }
    } catch (error) {
      logger.error('WebSocket message error:', error);
    }
  });
});

// Blockchain Event Listeners
const setupEventListeners = () => {
  const eventNames = ['AppointmentBooked', 'PrescriptionFulfilled', 'AppointmentStatusUpdated', 
    'LabTestOrdered', 'LabTestCollected', 'LabTestUploaded', 'LabTestReviewed', 
    'PrescriptionIssued', 'PrescriptionVerified', 'PrescriptionRevoked'];

  eventNames.forEach(eventName => {
    contract.on(eventName, async (...args) => {
      const event = args[args.length - 1];
      const block = await provider.getBlock(event.blockNumber);
      const eventLog = {
        eventName,
        blockNumber: event.blockNumber,
        timestamp: new Date(block.timestamp * 1000),
        data: event.args,
        transactionHash: event.transactionHash,
      };
      await new EventLog(eventLog).save();
      wss.clients.forEach(client => client.send(JSON.stringify({ type: 'eventUpdate', data: eventLog })));
      const keys = await redisClient.keys('events:*');
      for (const key of keys) await redisClient.del(key);
    });
  });

  contract.on('AppointmentBooked', async (appointmentId, patient, doctor, timestamp, videoCallLink, event) => {
    await new Appointment({
      appointmentId: appointmentId.toNumber(),
      patientAddress: patient,
      doctorAddress: doctor,
      timestamp: new Date(timestamp.toNumber() * 1000),
      status: 'booked',
      videoCallLink,
      txHash: event.transactionHash,
    }).save();
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'appointmentUpdate', data: { appointmentId } })));
  });

  contract.on('AppointmentStatusUpdated', async (appointmentId, status, event) => {
    await Appointment.findOneAndUpdate(
      { appointmentId: appointmentId.toNumber() },
      { status, txHash: event.transactionHash },
      { new: true }
    );
  });

  contract.on('LabTestOrdered', async (testId, patient, lab, testType, orderedAt, event) => {
    await new LabTest({
      testId: testId.toNumber(),
      patientAddress: patient,
      labAddress: lab,
      testType,
      status: 'ordered',
      orderedAt: new Date(orderedAt.toNumber() * 1000),
      txHash: event.transactionHash,
    }).save();
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'labTestUpdate', data: { testId } })));
  });

  contract.on('LabTestCollected', async (testId, ipfsHash, event) => {
    await LabTest.findOneAndUpdate(
      { testId: testId.toNumber() },
      { status: 'collected', ipfsHash, updatedAt: new Date(), txHash: event.transactionHash },
      { new: true }
    );
  });

  contract.on('LabTestUploaded', async (testId, ipfsHash, event) => {
    await LabTest.findOneAndUpdate(
      { testId: testId.toNumber() },
      { status: 'uploaded', ipfsHash, updatedAt: new Date(), txHash: event.transactionHash },
      { new: true }
    );
  });

  contract.on('LabTestReviewed', async (testId, review, event) => {
    await LabTest.findOneAndUpdate(
      { testId: testId.toNumber() },
      { status: 'reviewed', updatedAt: new Date(), txHash: event.transactionHash },
      { new: true }
    );
  });

  contract.on('PrescriptionIssued', async (prescriptionId, patient, doctor, verificationCodeHash, details, issuedAt, event) => {
    await new Prescription({
      prescriptionId: prescriptionId.toNumber(),
      patientAddress: patient,
      doctorAddress: doctor,
      verificationCodeHash,
      status: 'issued',
      issuedAt: new Date(issuedAt.toNumber() * 1000),
      txHash: event.transactionHash,
    }).save();
    wss.clients.forEach(client => client.send(JSON.stringify({ type: 'prescriptionUpdate', data: { prescriptionId } })));
  });

  contract.on('PrescriptionVerified', async (prescriptionId, pharmacy, event) => {
    await Prescription.findOneAndUpdate(
      { prescriptionId: prescriptionId.toNumber() },
      { status: 'verified', pharmacyAddress: pharmacy, updatedAt: new Date(), txHash: event.transactionHash },
      { new: true }
    );
  });

  contract.on('PrescriptionFulfilled', async (prescriptionId, event) => {
    await Prescription.findOneAndUpdate(
      { prescriptionId: prescriptionId.toNumber() },
      { status: 'fulfilled', updatedAt: new Date(), txHash: event.transactionHash },
      { new: true }
    );
  });

  contract.on('PrescriptionRevoked', async (prescriptionId, event) => {
    await Prescription.findOneAndUpdate(
      { prescriptionId: prescriptionId.toNumber() },
      { status: 'revoked', updatedAt: new Date(), txHash: event.transactionHash },
      { new: true }
    );
  });
};
// ResourceUsage
let wss;

function initializeWebSocket(server) {
  wss = new WebSocket.Server({ server });
  console.log('WebSocket server initialized');

  wss.on('connection', (ws) => {
    console.log('New WebSocket client connected');
    ws.on('close', () => console.log('WebSocket client disconnected'));
  });
}

async function broadcastResourceUpdate(cpu, memoryUsed, diskUsed) {
  if (!wss) {
    console.error('WebSocket server not initialized');
    return;
  }

  // Save to MongoDB
  await ResourceUsage.create({ cpu, memoryUsed, diskUsed });

  // Broadcast to clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ 
        type: 'resourceUpdate', 
        data: { cpu, memoryUsed, diskUsed } 
      }));
    }
  });
}

module.exports = { initializeWebSocket, broadcastResourceUpdate };
// Health Monitoring
const monitorHealth = () => {
  setInterval(async () => {
    const mongoStatus = mongoose.connection.readyState === 1 ? 'Up' : 'Down';
    if (mongoStatus === 'Down') {
      wss.clients.forEach(client => client.send(JSON.stringify({
        type: 'healthAlert',
        data: { message: 'MongoDB is down', timestamp: new Date() },
      })));
    }
    const paymasterBalance = ethers.utils.formatEther(await provider.getBalance(config.blockchain.paymasterAddress));
    if (parseFloat(paymasterBalance) < 0.1) {
      wss.clients.forEach(client => client.send(JSON.stringify({ type: 'alert', data: 'Low paymaster balance' })));
    }
  }, 60000); // Check every minute
};

// Start Server
const startServer = async () => {
  await connectMongoDB();
  await connectRedis();
  setupEventListeners();
  monitorHealth();

  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
};

startServer().catch(err => logger.error('Server startup error:', err));
