require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const mongoose = require('mongoose');
const winston = require('winston');
const cors = require('cors');
const { ethers } = require('ethers');
const redis = require('redis');
const Appointment = require('./models/Appointment'); // Assuming this exists from previous design
const EventLog = require('./models/EventLog'); // Assuming this exists from previous design

// Initialize Express and Server
const app = express();
const config = require('./config');
const server = process.env.NODE_ENV === 'production'
  ? https.createServer({
      cert: fs.readFileSync(config.server.sslCertPath),
      key: fs.readFileSync(config.server.sslKeyPath),
    }, app)
  : require('http').createServer(app);
const wss = new WebSocketServer({ server });

// Redis Client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});
redisClient.on('error', (err) => logger.error('Redis Client Error', err));

// Custom Winston WebSocket Transport
const { Transport } = require('winston');
class WebSocketTransport extends Transport {
  constructor(wss) {
    super();
    this.wss = wss;
  }
  log(info, callback) {
    this.wss.clients.forEach(client => client.send(JSON.stringify({ type: 'logUpdate', data: info })));
    callback();
  }
}

// Setup Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
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
  'function getPatientDataStatus(address) view returns (uint8, uint256)',
], wallet);

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || config.server.allowedOrigins }));
app.use(express.json());
app.use(express.static('frontend/dist')); // Serve frontend build

// Routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const labRoutes = require('./routes/lab');
const pharmacyRoutes = require('./routes/pharmacy');
app.use('/auth', authRoutes(wallet, logger));
app.use('/patient', patientRoutes(wallet, contract, wss, logger));
app.use('/doctor', doctorRoutes(wallet, contract, logger));
app.use('/lab', labRoutes(wallet, contract, logger));
app.use('/pharmacy', pharmacyRoutes(wallet, contract, logger));
app.use('/admin', require('./routes/admin')(wallet, contract, provider, logger, redisClient, wss));
app.use('/health', require('./routes/health')(provider, logger, redisClient, wss));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fallback for SPA
app.get('*', (req, res) => res.sendFile('index.html', { root: 'frontend/dist' }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || config.mongo.uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error('MongoDB connection error:', err));

// Redis Connection
redisClient.connect()
  .then(() => logger.info('Connected to Redis'))
  .catch(err => logger.error('Redis connection error:', err));

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
const eventNames = ['AppointmentBooked', 'PrescriptionFulfilled'];
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
    for (const key of keys) await redisClient.del(key); // Invalidate cache
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

// Health Monitoring
setInterval(async () => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'Up' : 'Down';
  if (mongoStatus === 'Down') {
    wss.clients.forEach(client => client.send(JSON.stringify({
      type: 'healthAlert',
      data: { message: 'MongoDB is down', timestamp: new Date() },
    })));
  }
  // Add more service checks as needed
}, 60000); // Check every minute

// Start Server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
