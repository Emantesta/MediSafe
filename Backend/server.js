require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const winston = require('winston');
const cors = require('cors');
const { ethers } = require('ethers');

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
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.Console()
  ]
});

// Express App
const app = express();
const server = https.createServer({
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
});
const wss = new WebSocket.Server({ server });

// Ethereum Setup
const provider = new ethers.providers.JsonRpcProvider(process.env.SONIC_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, [
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
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error('MongoDB connection error:', err));

// Route Middleware
app.use('/auth', authRoutes(wallet, logger));
app.use('/patient', patientRoutes(wallet, contract, wss, logger));
app.use('/doctor', doctorRoutes(wallet, contract, logger));
app.use('/lab', labRoutes(wallet, contract, logger));
app.use('/pharmacy', pharmacyRoutes(wallet, contract, logger));

// WebSocket Handling
wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'appointment') {
        const appointments = await contract.getPatientAppointments(data.address);
        ws.send(JSON.stringify({ type: 'appointmentUpdate', data: appointments }));
      }
    } catch (error) {
      logger.error('WebSocket error:', error);
    }
  });
  server.listen(process.env.PORT || 8080, () => logger.info(`Server running on port ${process.env.PORT || 8080}`));
});

// Start Server
server.listen(8080, () => logger.info('Server running on port 8080'));
