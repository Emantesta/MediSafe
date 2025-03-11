router.get('/users/:address', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  const { address } = req.params;

  try {
    const user = await User.findOne({ address });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const userOps = await UserOp.find({ sender: address }).sort({ createdAt: -1 }).limit(10);
    const appointments = await contract.getPatientAppointments(address);
    const labTests = user.role === 'patient' || user.role === 'lab' 
      ? await Promise.all((await UserOp.find({ sender: address, callData: /orderLabTest/ })).map(async op => {
          const id = ethers.utils.defaultAbiCoder.decode(['uint256'], op.callData.slice(-64))[0];
          return await contract.getLabTestDetails(id);
        }))
      : [];
    const prescriptions = user.role === 'patient' || user.role === 'pharmacy' 
      ? await Promise.all((await UserOp.find({ sender: address, callData: /verifyPrescription/ })).map(async op => {
          const id = ethers.utils.defaultAbiCoder.decode(['uint256'], op.callData.slice(-64))[0];
          return await contract.getPrescriptionDetails(id);
        }))
      : [];

    res.json({
      info: {
        address: user.address,
        role: user.role,
        registrationDate: user.registrationDate,
        verificationStatus: user.verificationStatus,
        dataMonetization: user.role === 'patient' ? (await contract.getPatientDataStatus(address))[0] === 1 : null,
      },
      userOps,
      appointments,
      labTests,
      prescriptions,
    });
  } catch (error) {
    logger.error('User details fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

// Action: Reset Nonce (mocked; requires contract support)
router.post('/users/:address/reset-nonce', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin || req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin access required' });
  const { address } = req.params;
  // Implement contract call if supported, otherwise just log
  await new AuditLog({ adminAddress: req.user.address, action: 'reset_nonce', details: `Reset nonce for ${address}` }).save();
  res.json({ message: 'Nonce reset requested' });
});

// Action: Ban User
router.post('/users/:address/ban', authMiddleware, async (req, res) => {
  if (!req.user.isAdmin || req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin access required' });
  const { address } = req.params;
  await User.updateOne({ address }, { verificationStatus: 'deactivated' });
  await new AuditLog({ adminAddress: req.user.address, action: 'ban_user', details: `Banned ${address}` }).save();
  res.json({ message: 'User banned' });
});
