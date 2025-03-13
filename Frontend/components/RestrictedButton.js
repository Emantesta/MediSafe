// components/RestrictedButton.js
import { Button } from 'antd';
import { useAuth } from '../utils/auth';

const RestrictedButton = ({ action, children }) => {
  const { user } = useAuth();
  if (!user.isAdmin || (action === 'fundPaymaster' && user.role !== 'super_admin')) return null;
  return <Button>{children}</Button>;
};
