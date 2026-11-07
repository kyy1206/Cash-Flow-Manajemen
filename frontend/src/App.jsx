import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import BusinessDashboard from './pages/BusinessDashboard';
import BusinessWorkspace from './pages/BusinessWorkspace';
import Subscriptions from './pages/Subscriptions';
import BudgetManagement from './pages/BudgetManagement';
import CategoryManagement from './pages/CategoryManagement';
import Reports from './pages/Reports';
import NotificationHistory from './pages/NotificationHistory';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Register />} />
          <Route path="/register" element={<Navigate to="/setup" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <BusinessDashboard />
              </ProtectedRoute>
            }
          />
          {['transactions', 'wallets', 'requests', 'debts', 'reconciliations', 'users', 'settings', 'audit', 'profile'].map((path) => (
            <Route
              key={path}
              path={`/${path}`}
              element={<ProtectedRoute><BusinessWorkspace /></ProtectedRoute>}
            />
          ))}
          <Route
            path="/expenses"
            element={
              <Navigate to="/transactions" replace />
            }
          />
          <Route
            path="/expenses/manual"
            element={
              <Navigate to="/transactions" replace />
            }
          />
          <Route
            path="/expenses/ocr"
            element={
              <Navigate to="/transactions" replace />
            }
          />
          <Route
            path="/subscriptions"
            element={
              <ProtectedRoute>
                <Subscriptions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets"
            element={
              <ProtectedRoute roles={['owner', 'supervisor']}>
                <BudgetManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute roles={['owner']}>
                <CategoryManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Reports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <NotificationHistory />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
