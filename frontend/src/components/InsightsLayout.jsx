import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useState } from 'react';
import SupervisorFrame from './SupervisorFrame';
import StaffFrame from './StaffFrame';
import '../pages/Dashboard.css';

const InsightsLayout = ({ active, title, eyebrow, unreadCount = 0, children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const navigation = [
    { to: '/dashboard', text: 'Dashboard', icon: '⌂', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/transactions', text: 'Transaksi', icon: '↕', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/requests', text: 'Pengajuan', icon: '▣', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/wallets', text: 'Kas & Rekening', icon: '▤', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/debts', text: 'Utang & Piutang', icon: '⇄', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/reconciliations', text: 'Rekonsiliasi', icon: '✓', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/reports', text: 'Laporan', icon: '▥', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/budgets', text: 'Anggaran', icon: '◫', roles: ['owner', 'supervisor'] },
    { to: '/categories', text: 'Kategori', icon: '＋', roles: ['owner'] },
    { to: '/users', text: 'Pengguna', icon: '♙', roles: ['owner'] },
    { to: '/settings', text: 'Pengaturan', icon: '⚙', roles: ['owner'] },
    { to: '/audit', text: 'Audit Trail', icon: '≡', roles: ['owner'] },
    { to: '/subscriptions', text: 'Subscription', icon: '↻', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/notifications', text: 'Notifikasi', icon: '♧', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/profile', text: 'Profil & Keamanan', icon: '⚿', roles: ['owner', 'supervisor', 'staff'] },
  ].filter((item) => item.roles.includes(user?.role));

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      navigate('/login');
    } catch {
      setLogoutError('Gagal keluar dari akun. Coba lagi.');
    } finally {
      setLoggingOut(false);
    }
  };

  if (user?.role === 'supervisor') {
    return (
      <SupervisorFrame active={active} unreadCount={unreadCount} onLogout={handleLogout}>
        <div className="supervisor-page-heading">
          <div><span className="supervisor-eyebrow">{eyebrow}</span><h1>{title}</h1></div>
        </div>
        {logoutError && <div className="supervisor-alert error" role="alert">{logoutError}</div>}
        {children}
      </SupervisorFrame>
    );
  }

  if (user?.role === 'staff') {
    return (
      <StaffFrame active={active} unreadCount={unreadCount} onLogout={handleLogout}>
        <div className="staff-page-heading">
          <div><span className="staff-eyebrow">{eyebrow}</span><h1>{title}</h1></div>
        </div>
        {logoutError && <div className="staff-alert error" role="alert">{logoutError}</div>}
        {children}
      </StaffFrame>
    );
  }

  return (
    <div className="dashboard-app">
      <aside className="dashboard-sidebar">
        <Link to="/dashboard" className="dashboard-brand">
          <span className="dashboard-brand-mark">BH</span>
          <span><strong>Bocor Halus</strong><small>PERSONAL FINANCE</small></span>
        </Link>
        <nav className="dashboard-nav">
          {navigation.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`dashboard-nav-link ${active === item.to.slice(1) ? 'active' : ''}`}
              aria-current={active === item.to.slice(1) ? 'page' : undefined}
            >
              <span>{item.icon}</span> {item.text}
            </Link>
          ))}
        </nav>
        <div className="dashboard-sidebar-spacer" />
        <div className="dashboard-user">
          <span className="dashboard-avatar">{user?.name?.[0] ?? 'U'}</span>
          <span><strong>{user?.name ?? 'User'}</strong><small>{user?.email ?? ''}</small></span>
        </div>
        <button type="button" className="dashboard-logout" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? 'Keluar...' : 'Keluar akun'}
        </button>
      </aside>
      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-welcome">
            <span className="dashboard-eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>
          <Link to="/notifications" className="dashboard-primary-button" aria-label="Buka riwayat notifikasi">♧ Notifikasi</Link>
        </header>
        {logoutError && <div className="dashboard-message error" role="alert">{logoutError}</div>}
        {children}
      </main>
    </div>
  );
};

export default InsightsLayout;
