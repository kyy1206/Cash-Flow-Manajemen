import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import '../pages/StaffDashboard.css';

const navigation = [
  {
    section: 'UTAMA OPERASIONAL',
    links: [
      ['/dashboard', '⌂', 'Dashboard Kasir'],
      ['/transactions', '↕', 'Buku Kas & Transaksi'],
      ['/requests', '▣', 'Pengajuan Pengeluaran'],
    ],
  },
  {
    section: 'KAS & PEMBUKUAN',
    links: [
      ['/wallets', '▤', 'Kas & Rekening Gerai'],
      ['/reconciliations', '✓', 'Hitung Fisik Kas'],
      ['/debts', '⇄', 'Utang & Piutang'],
      ['/reports', '▥', 'Laporan Operasional'],
    ],
  },
  {
    section: 'AKUN & SISTEM',
    links: [
      ['/notifications', '♧', 'Notifikasi & Status'],
      ['/profile', '⚿', 'Profil & Keamanan'],
    ],
  },
];

const StaffFrame = ({ active, unreadCount = 0, onLogout, children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (onLogout) {
      await onLogout();
      return;
    }
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="staff-app">
      <aside className="staff-sidebar">
        <Link to="/dashboard" className="staff-brand">
          <span className="staff-brand-mark">BH</span>
          <span>
            <strong>Bocor Halus</strong>
            <small>PORTAL OPERASIONAL STAF</small>
          </span>
        </Link>
        <div className="staff-business-chip">
          <i /> Operasional kasir aktif
        </div>
        <nav className="staff-navigation" aria-label="Navigasi staf operasional">
          {navigation.map((group) => (
            <div className="staff-nav-group" key={group.section}>
              <span className="staff-nav-heading">{group.section}</span>
              {group.links.map(([path, icon, label]) => (
                <Link
                  key={path}
                  to={path}
                  className={`staff-nav-link ${active === path.slice(1) ? 'active' : ''}`}
                  aria-current={active === path.slice(1) ? 'page' : undefined}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label}
                  {path === '/notifications' && unreadCount > 0 && <b>{unreadCount}</b>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="staff-sidebar-spacer" />
        <div className="staff-authority-note">
          <strong>PERAN OPERATOR STAF</strong>
          <span>Catat transaksi harian, ajukan biaya, dan bukukan realisasi setelah disetujui.</span>
        </div>
        <div className="staff-account">
          <span className="staff-avatar">{user?.name?.[0] ?? 'S'}</span>
          <span>
            <strong>{user?.name}</strong>
            <small>Staf Operasional</small>
          </span>
          <button type="button" title="Keluar" aria-label="Keluar" onClick={handleLogout}>
            ↪
          </button>
        </div>
      </aside>

      <main className="staff-main">
        <header className="staff-topbar">
          <div className="staff-topbar-brand">
            <strong>Bocor Halus</strong>
            <span>PORTAL OPERASIONAL · Kasir & Pencatatan Harian</span>
          </div>
          <div className="staff-topbar-actions">
            <span className="staff-online">
              <i /> Operator aktif
            </span>
            <Link to="/transactions" className="staff-action-link primary">
              ＋ Catat Penjualan / Kas
            </Link>
            <Link to="/requests" className="staff-action-link secondary">
              ＋ Ajukan Biaya
            </Link>
            <Link
              to="/notifications"
              className="staff-notification-button"
              aria-label={`Notifikasi, ${unreadCount} belum dibaca`}
            >
              ♧{unreadCount > 0 && <b>{unreadCount}</b>}
            </Link>
            <span className="staff-profile">
              <i>{user?.name?.[0] ?? 'S'}</i>
              <span>
                <strong>{user?.name}</strong>
                <small>Staf Kasir / Lapangan</small>
              </span>
            </span>
          </div>
        </header>
        <div className="staff-page-content">{children}</div>
      </main>
    </div>
  );
};

export default StaffFrame;
