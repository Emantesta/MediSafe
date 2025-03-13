// pages/Login.js
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Login = () => {
  const [address, setAddress] = useState('');
  const [signature, setSignature] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    const res = await api.post('/auth/login', { address, signature });
    localStorage.setItem('token', res.data.token);
    navigate('/dashboard');
  };

  return (
    <div>
      <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Address" />
      <input value={signature} onChange={e => setSignature(e.target.value)} placeholder="Signature" />
      <button onClick={handleLogin}>Login</button>
    </div>
  );
};
export default Login;
