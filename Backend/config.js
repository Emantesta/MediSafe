require('dotenv').config();

module.exports = {
  server: {
    port: process.env.PORT || 8080,
    sslCertPath: process.env.SSL_CERT_PATH,
    sslKeyPath: process.env.SSL_KEY_PATH,
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000']
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'default_secret_key',
  },
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017/telemedicine',
  },
  blockchain: {
    rpcUrl: process.env.SONIC_RPC_URL || 'https://rpc.sonic.network',
    privateKey: process.env.PRIVATE_KEY,
    contractAddress: process.env.CONTRACT_ADDRESS,
    paymasterAddress: process.env.PAYMASTER_ADDRESS,
    entrypointAddress: process.env.ENTRYPOINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  },
  ipfs: {
    host: process.env.IPFS_HOST || 'ipfs.infura.io',
    port: process.env.IPFS_PORT || 5001,
    protocol: process.env.IPFS_PROTOCOL || 'https',
    projectId: process.env.INFURA_PROJECT_ID,
    projectSecret: process.env.INFURA_PROJECT_SECRET,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    sentryDsn: process.env.SENTRY_DSN,
  },
  security: {
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  },
  performance: {
    maxConcurrentUserOps: parseInt(process.env.MAX_CONCURRENT_USEROPS) || 10,
  }
};
