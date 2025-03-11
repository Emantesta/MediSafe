import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Button } from 'antd';
import api from '../services/api';
import { useAuth } from '../App';

const Login = () => {
  const [address, setAddress] = useState('');
  const [signature, setSignature] = useState('');
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await api.post('/auth/login', { address, signature });
      localStorage.setItem('token', res.data.token);
      setUser({ token: res.data.token });
      navigate('/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div style={{ padding: '50px', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Admin Login</h1>
      <Input
        placeholder="Wallet Address"
        value={address}
        onChange={e => setAddress(e.target.value)}
        style={{ marginBottom: 16 }}
      />
      <Input
        placeholder="Signature"
        value={signature}
        onChange={e => setSignature(e.target.value)}
        style={{ marginBottom: 16 }}
      />
      <Button type="primary" onClick={handleLogin}>Login</Button>
    </div>
  );
};

export default Login;
