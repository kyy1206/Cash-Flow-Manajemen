import { useState } from 'react';
import { AuthContext } from './authContext';
import { authService } from '../services/authService';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => (
    authService.getToken() ? authService.getCurrentUser() : null
  ));

  const login = async (email, password) => {
    const data = await authService.login(email, password);
    setUser(data.user);
    return data;
  };

  const setupOwner = async (userData) => {
    const data = await authService.setupOwner(userData);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    login,
    setupOwner,
    logout,
    isAuthenticated: !!user,
    loading: false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
