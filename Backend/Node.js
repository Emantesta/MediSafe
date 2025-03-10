require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const cors = require('cors');
const { create } = require('ipfs-http-client');
const QRCode = require('qrcode');
const tf = require('@tensorflow/tfjs-node');
const { UserOperation, packUserOp } = require('@account-abstraction/utils');
const { EntryPoint } = require('@account-abstraction/contracts');
const mongoose = require('mongoose');

// Setup
const app = express();
const server = https.createServer({
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
});
const wss = new WebSocket.Server({ server });
const ipfs = create({ host: 'ipfs.infura.io', port: 5001, protocol: 'https' });

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

// Paymaster Contract Setup
const paymasterABI = [
    'function validatePaymasterUserOp(tuple(address, uint256, bytes, bytes, uint256, uint256, uint256, uint256, uint256, bytes), bytes32, uint256) external returns (uint256, bytes)',
    'function getBalance() external view returns (uint256)'
];
const paymasterContract = new ethers.Contract(process.env.PAYMASTER_ADDRESS, paymasterABI, provider);

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.Console()
    ]
});

// MongoDB Setup
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => logger.info('Connected to MongoDB'))
    .catch(err => logger.error('MongoDB connection error:', err));

const UserOpSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    nonce: { type: Number, required: true },
    callData: { type: String, required: true },
    callGasLimit: Number,
    verificationGasLimit: Number,
    preVerificationGas: Number,
    maxFeePerGas: String,
    maxPriorityFeePerGas: String,
    paymasterAndData: String,
    signature: { type: String, required: true },
    txHash: String,
    status: { type: String, enum: ['pending', 'validated', 'submitted', 'failed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const UserOp = mongoose.model('UserOp', UserOpSchema);

// Middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) throw new Error('Token required');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        logger.error('Auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

// Enhanced User Operation Handling
async function createUserOperation(sender, callData, gasParams = {}) {
    const entryPoint = new ethers.Contract(process.env.ENTRYPOINT_ADDRESS, EntryPoint.abi, wallet);
    
    const userOp = {
        sender,
        nonce: await contract.nonces(sender),
        initCode: '0x',
        callData,
        callGasLimit: gasParams.callGasLimit || 200000,
        verificationGasLimit: gasParams.verificationGasLimit || 100000,
        preVerificationGas: gasParams.preVerificationGas || 21000,
        maxFeePerGas: gasParams.maxFeePerGas || ethers.utils.parseUnits('10', 'gwei'),
        maxPriorityFeePerGas: gasParams.maxPriorityFeePerGas || ethers.utils.parseUnits('1', 'gwei'),
        paymasterAndData: '0x',
        signature: '0x'
    };

    // Handle paymaster-specific data
    if (process.env.PAYMASTER_ADDRESS) {
        const paymasterData = await generatePaymasterData(userOp);
        userOp.paymasterAndData = ethers.utils.hexConcat([process.env.PAYMASTER_ADDRESS, paymasterData]);
    }

    const userOpHash = ethers.utils.keccak256(packUserOp(userOp));
    const signature = await wallet.signMessage(ethers.utils.arrayify(userOpHash));
    userOp.signature = signature;

    return userOp;
}

async function generatePaymasterData(userOp) {
    // Example: Generate paymaster-specific data (e.g., a deadline or additional context)
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour validity
    const context = ethers.utils.defaultAbiCoder.encode(['uint256'], [deadline]);
    return context;
}

async function validateUserOp(userOp) {
    try {
        // Verify signature
        const userOpHash = ethers.utils.keccak256(packUserOp(userOp));
        const recoveredAddress = ethers.utils.verifyMessage(ethers.utils.arrayify(userOpHash), userOp.signature);
        if (recoveredAddress.toLowerCase() !== userOp.sender.toLowerCase()) {
            throw new Error('Invalid signature');
        }

        // Check nonce
        const onChainNonce = await contract.nonces(userOp.sender);
        if (userOp.nonce < onChainNonce) {
            throw new Error('Nonce too low');
        }

        // Paymaster validation and funding check
        if (userOp.paymasterAndData !== '0x') {
            const paymasterAddress = userOp.paymasterAndData.slice(0, 42); // First 20 bytes (address)
            const paymasterData = '0x' + userOp.paymasterAndData.slice(42); // Remaining bytes
            const isTrusted = await contract.trustedPaymasters(paymasterAddress);
            if (!isTrusted) {
                throw new Error('Untrusted paymaster');
            }

            // Verify paymaster funding
            const paymaster = new ethers.Contract(paymasterAddress, paymasterABI, provider);
            const balance = await paymaster.getBalance();
            const totalGasCost = ethers.BigNumber.from(userOp.maxFeePerGas)
                .mul(userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas);
            if (balance.lt(totalGasCost)) {
                throw new Error('Insufficient paymaster funding');
            }

            // Call validatePaymasterUserOp
            const [validationResult, context] = await paymaster.validatePaymasterUserOp(
                userOp,
                userOpHash,
                totalGasCost
            );
            if (validationResult.toNumber() !== 0) { // Assuming 0 is success per ERC-4337
                throw new Error('Paymaster validation failed');
            }
        }

        return true;
    } catch (error) {
        logger.error('UserOp validation error:', error);
        return false;
    }
}

async function submitUserOperation(userOp) {
    const dbUserOp = new UserOp({ ...userOp, status: 'pending' });
    await dbUserOp.save();

    const isValid = await validateUserOp(userOp);
    if (!isValid) {
        dbUserOp.status = 'failed';
        await dbUserOp.save();
        throw new Error('UserOp validation failed');
    }

    dbUserOp.status = 'validated';
    await dbUserOp.save();

    try {
        const tx = await contract.executeUserOp(userOp);
        await tx.wait();
        dbUserOp.txHash = tx.hash;
        dbUserOp.status = 'submitted';
        await dbUserOp.save();
        return tx.hash;
    } catch (error) {
        dbUserOp.status = 'failed';
        await dbUserOp.save();
        throw error;
    }
}

// AI Symptom Analysis (Simple Mock Model)
async function analyzeSymptoms(symptoms) {
    const tensor = tf.tensor([symptoms.split(' ').length]);
    const prediction = tensor.add(0.5); // Mock AI logic
    return { diagnosis: "Possible condition based on: " + symptoms, confidence: prediction.dataSync()[0] };
}

// Routes
app.post('/login', async (req, res) => {
    try {
        const { address, signature } = req.body;
        const recovered = ethers.utils.verifyMessage('Telemedicine Login', signature);
        if (recovered !== address) throw new Error('Invalid signature');
        const token = jwt.sign({ address }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(401).json({ error: 'Login failed' });
    }
});

app.post('/register-patient', authMiddleware, async (req, res) => {
    try {
        const callData = contract.interface.encodeFunctionData('registerPatient', [req.body.encryptedSymmetricKey]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/book-appointment', authMiddleware, async (req, res) => {
    const { doctorAddress, timestamp, paymentType, isVideoCall, videoCallLink, userOp } = req.body;
    
    try {
        if (userOp) {
            const txHash = await submitUserOperation(userOp);
            wss.clients.forEach(client => client.send(JSON.stringify({ type: 'appointment', id: txHash })));
            res.json({ txHash });
        } else {
            const callData = contract.interface.encodeFunctionData('bookAppointment', [
                doctorAddress,
                timestamp,
                paymentType,
                isVideoCall,
                videoCallLink || ""
            ]);
            const userOp = await createUserOperation(req.user.address, callData);
            const txHash = await submitUserOperation(userOp);
            wss.clients.forEach(client => client.send(JSON.stringify({ type: 'appointment', id: txHash })));
            res.json({ txHash });
        }
    } catch (error) {
        logger.error('Booking error:', error);
        res.status(500).json({ error: 'Booking failed' });
    }
});

app.post('/confirm-appointment', authMiddleware, async (req, res) => {
    const { appointmentId } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('confirmAppointment', [appointmentId]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        wss.clients.forEach(client => client.send(JSON.stringify({ type: 'appointmentConfirmed', id: appointmentId })));
        res.json({ txHash });
    } catch (error) {
        logger.error('Confirmation error:', error);
        res.status(500).json({ error: 'Confirmation failed' });
    }
});

app.post('/analyze-symptoms', authMiddleware, async (req, res) => {
    const { symptoms, userOp } = req.body;
    try {
        if (userOp) {
            const txHash = await submitUserOperation(userOp);
            res.json({ txHash });
        } else {
            const analysis = await analyzeSymptoms(symptoms);
            const ipfsResult = await ipfs.add(JSON.stringify(analysis));
            const callData = contract.interface.encodeFunctionData('requestAISymptomAnalysis', [symptoms]);
            const userOp = await createUserOperation(req.user.address, callData);
            const txHash = await submitUserOperation(userOp);
            res.json({ txHash, ipfsHash: ipfsResult.path });
        }
    } catch (error) {
        logger.error('Symptom analysis error:', error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

app.post('/toggle-data-monetization', authMiddleware, async (req, res) => {
    const { enable } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('toggleDataMonetization', [enable]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Data monetization toggle error:', error);
        res.status(500).json({ error: 'Toggle failed' });
    }
});

app.post('/claim-data-reward', authMiddleware, async (req, res) => {
    try {
        const callData = contract.interface.encodeFunctionData('claimDataReward');
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Reward claim error:', error);
        res.status(500).json({ error: 'Claim failed' });
    }
});

app.post('/review-ai-analysis', authMiddleware, async (req, res) => {
    const { aiAnalysisId, analysisIpfsHash } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('reviewAISymptomAnalysis', [aiAnalysisId, analysisIpfsHash]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('AI review error:', error);
        res.status(500).json({ error: 'Review failed' });
    }
});

app.post('/order-lab-test', authMiddleware, async (req, res) => {
    const { patientAddress, testType } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('orderLabTest', [patientAddress, testType]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Lab test order error:', error);
        res.status(500).json({ error: 'Order failed' });
    }
});

app.post('/collect-sample', authMiddleware, async (req, res) => {
    const { labTestId, ipfsHash } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('collectSample', [labTestId, ipfsHash]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Sample collection error:', error);
        res.status(500).json({ error: 'Collection failed' });
    }
});

app.post('/upload-lab-results', authMiddleware, async (req, res) => {
    const { labTestId, resultsIpfsHash } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('uploadLabResults', [labTestId, resultsIpfsHash]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Results upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.post('/review-lab-results', authMiddleware, async (req, res) => {
    const { labTestId, medicationDetails, prescriptionIpfsHash } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('reviewLabResults', [labTestId, medicationDetails, prescriptionIpfsHash]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Lab results review error:', error);
        res.status(500).json({ error: 'Review failed' });
    }
});

app.post('/verify-prescription', authMiddleware, async (req, res) => {
    const { prescriptionId, verificationCodeHash } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('verifyPrescription', [prescriptionId, ethers.utils.hexlify(verificationCodeHash)]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Prescription verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.post('/fulfill-prescription', authMiddleware, async (req, res) => {
    const { prescriptionId } = req.body;
    try {
        const callData = contract.interface.encodeFunctionData('fulfillPrescription', [prescriptionId]);
        const userOp = await createUserOperation(req.user.address, callData);
        const txHash = await submitUserOperation(userOp);
        res.json({ txHash });
    } catch (error) {
        logger.error('Prescription fulfillment error:', error);
        res.status(500).json({ error: 'Fulfillment failed' });
    }
});

app.get('/paymaster-status', authMiddleware, async (req, res) => {
    try {
        const paymaster = await contract.paymaster();
        const isTrusted = await contract.trustedPaymasters(paymaster);
        const balance = await paymasterContract.getBalance();
        res.json({ paymaster, isTrusted, balance: ethers.utils.formatEther(balance) });
    } catch (error) {
        logger.error('Paymaster status error:', error);
        res.status(500).json({ error: 'Status check failed' });
    }
});

app.get('/userop-status/:txHash', authMiddleware, async (req, res) => {
    try {
        const userOp = await UserOp.findOne({ txHash: req.params.txHash });
        if (!userOp) return res.status(404).json({ error: 'UserOp not found' });
        res.json({ status: userOp.status, userOp });
    } catch (error) {
        logger.error('UserOp status error:', error);
        res.status(500).json({ error: 'Status check failed' });
    }
});

app.get('/generate-qr/:prescriptionId', authMiddleware, async (req, res) => {
    try {
        const prescription = await contract.getPrescriptionDetails(req.params.prescriptionId);
        const qrData = JSON.stringify({
            id: prescription[0].toString(),
            verificationCodeHash: ethers.utils.hexlify(prescription[3])
        });
        const qrCode = await QRCode.toDataURL(qrData);
        res.json({ qrCode });
    } catch (error) {
        logger.error('QR generation error:', error);
        res.status(500).json({ error: 'QR generation failed' });
    }
});

app.get('/appointments/:address', authMiddleware, async (req, res) => {
    try {
        const appointments = await contract.getPatientAppointments(req.params.address);
        res.json({ appointments });
    } catch (error) {
        logger.error('Appointments fetch error:', error);
        res.status(500).json({ error: 'Fetch failed' });
    }
});

app.get('/lab-test/:id', async (req, res) => {
    try {
        const labTest = await contract.getLabTestDetails(req.params.id);
        res.json({ labTest });
    } catch (error) {
        logger.error('Lab test fetch error:', error);
        res.status(500).json({ error: 'Fetch failed' });
    }
});

app.get('/prescription/:id', async (req, res) => {
    try {
        const prescription = await contract.getPrescriptionDetails(req.params.id);
        res.json({ prescription });
    } catch (error) {
        logger.error('Prescription fetch error:', error);
        res.status(500).json({ error: 'Fetch failed' });
    }
});

app.get('/ai-analysis/:id', async (req, res) => {
    try {
        const analysis = await contract.getAIAnalysisDetails(req.params.id);
        res.json({ analysis });
    } catch (error) {
        logger.error('AI analysis fetch error:', error);
        res.status(500).json({ error: 'Fetch failed' });
    }
});

app.get('/data-status/:address', async (req, res) => {
    try {
        const [dataSharing, lastRewardTimestamp] = await contract.getPatientDataStatus(req.params.address);
        res.json({ dataSharing: dataSharing === 1, lastRewardTimestamp });
    } catch (error) {
        logger.error('Data status fetch error:', error);
        res.status(500).json({ error: 'Fetch failed' });
    }
});

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
});

// Start Server
server.listen(8080, () => logger.info('Server running on port 8080'));                              
