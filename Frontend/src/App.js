import React, { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Layout, Menu, Button } from 'antd';
import { DashboardOutlined, UserOutlined, TransactionOutlined } from '@ant-design/icons';
import api from './services/api';
import Dashboard from './pages/Dashboard';
import UserList from './pages/UserList';
import UserDetails from './pages/UserDetails';
import UserOps from './pages/UserOps';
import Login from './pages/Login';

const { Header, Sider, Content } = Layout;

// Authentication Context
const AuthContext = createContext();

const useAuth = () => useContext(AuthContext);

const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
};

const App = () => {
  const [user, setUser] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  // Check for existing token on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Verify token with backend (optional)
      api.get('/admin/dashboard', { headers: { Authorization: `Bearer ${token}` } })
        .then(() => setUser({ token })) // Simplified; decode JWT for real user data
        .catch(() => localStorage.removeItem('token'));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Router>
        <Layout style={{ minHeight: '100vh' }}>
          {user && (
            <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
              <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)' }} /> {/* Logo placeholder */}
              <Menu theme="dark" mode="inline" defaultSelectedKeys={['1']}>
                <Menu.Item key="1" icon={<DashboardOutlined />}>
                  <Link to="/dashboard">Dashboard</Link>
                </Menu.Item>
                <Menu.Item key="2" icon={<UserOutlined />}>
                  <Link to="/users">Users</Link>
                </Menu.Item>
                <Menu.Item key="3" icon={<TransactionOutlined />}>
                  <Link to="/userops">UserOps</Link>
                </Menu.Item>
              </Menu>
            </Sider>
          )}
          <Layout>
            {user && (
              <Header style={{ padding: 0, background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                <Button type="link" onClick={handleLogout} style={{ marginRight: 16 }}>Logout</Button>
              </Header>
            )}
            <Content style={{ margin: '16px' }}>
              <Routes>
                <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
                <Route
                  path="/dashboard"
                  element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
                />
                <Route
                  path="/users"
                  element={<ProtectedRoute><UserList /></ProtectedRoute>}
                />
                <Route
                  path="/users/:address"
                  element={<ProtectedRoute><UserDetails /></ProtectedRoute>}
                />
                <Route
                  path="/userops"
                  element={<ProtectedRoute><UserOps /></ProtectedRoute>}
                />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/userops" element={<UserOps />} />
                <Route path="/users/:address" element={<UserDetails />} />
                <Route path="/users" element={<UserList />} />
                <Route path="/paymaster" element={<ProtectedRoute><PaymasterManagement /></ProtectedRoute>} />
                <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
                <Route path="/events" element={<ProtectedRoute><BlockchainEvents /></ProtectedRoute>} />
                <Route path="/health" element={<ProtectedRoute><SystemHealth /></ProtectedRoute>} />
                <Route path="/appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />
                <Route path="/lab-tests" element={<ProtectedRoute><LabTests /></ProtectedRoute>} />
                <Route path="/logs" element={<ProtectedRoute><Logs /></ProtectedRoute>} />
              </Routes>
            </Content>
          </Layout>
        </Layout>
      </Router>
    </AuthContext.Provider>
  );
};

export default App;
