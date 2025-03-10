const express = require('express');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');
const router = express.Router();

module.exports = (wallet, logger) => {
  router.post('/login', async (req, res) => {
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

  return router;
};
