import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import '../pages/SupervisorDashboard.css';

const navigation = [
  { section: 'UTAMA', links: [
    ['/dashboard', '⌂', 'Dashboard'],
    ['/transactions', '↕', 'Monitoring Transaksi'],
    ['/requests', '▣', 'Pengajuan & Approval'],
  ] },
  { section: 'OPERASIONAL & BUKU KAS', links: [
    ['/wallets', '▤', 'Kas & Rekening Gerai'],
    ['/debts', '⇄', 'Utang & Piutang'],
    ['/reconciliations', '✓', 'Rekonsiliasi Kas'],
    ['/reports', '▥', 'Laporan Operasional'],
  ] },
  { section: 'KONTROL & PENGATURAN', links: [
    ['/budgets', '◫', 'Anggaran & Plan'],
    ['/notifications', '♧', 'Notifikasi & Alert'],
    ['/profile', '⚿', 'Profil & Keamanan'],
  ] },
];

const SupervisorFrame = ({ active, unreadCount = 0, onLogout, children }) => {
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
    <div className="supervisor-app">
      <aside className="supervisor-sidebar">
        <Link to="/dashboard" className="supervisor-brand">
          <span className="supervisor-brand-mark">BH</span>
          <span><strong>Bocor Halus</strong><small>PORTAL PENGAWASAN</small></span>
        </Link>
        <div className="supervisor-business-chip"><i /> Data usaha aktif</div>
        <nav className="supervisor-navigation" aria-label="Navigasi supervisor">
          {navigation.map((group) => (
            <div className="supervisor-nav-group" key={group.section}>
              <span className="supervisor-nav-heading">{group.section}</span>
              {group.links.map(([path, icon, label]) => (
                <Link
                  key={path}
                  to={path}
                  className={`supervisor-nav-link ${active === path.slice(1) ? 'active' : ''}`}
                  aria-current={active === path.slice(1) ? 'page' : undefined}
                >
                  <span aria-hidden="true">{icon}</span>{label}
                  {path === '/notifications' && unreadCount > 0 && <b>{unreadCount}</b>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="supervisor-sidebar-spacer" />
        <div className="supervisor-authority-note"><strong>OTORISASI SUPERVISOR</strong><span>Keputusan approval dan review tercatat pada audit usaha.</span></div>
        <div className="supervisor-account">
          <span className="supervisor-avatar">{user?.name?.[0] ?? 'S'}</span>
          <span><strong>{user?.name}</strong><small>Supervisor</small></span>
          <button type="button" title="Keluar" aria-label="Keluar" onClick={handleLogout}>↪</button>
        </div>
      </aside>

      <main className="supervisor-main">
        <header className="supervisor-topbar">
          <div className="supervisor-topbar-brand"><strong>Bocor Halus</strong><span>SUPERVISOR PORTAL · Kontrol & Risk Monitoring</span></div>
          <div className="supervisor-topbar-actions">
            <span className="supervisor-online"><i /> Pengawasan aktif</span>
            <Link to="/transactions" className="supervisor-action-link">＋ Ajukan / Verifikasi Kas</Link>
            <Link to="/notifications" className="supervisor-notification-button" aria-label={`Notifikasi, ${unreadCount} belum dibaca`}>
              ♧{unreadCount > 0 && <b>{unreadCount}</b>}
            </Link>
            <span className="supervisor-profile">
              <i>{user?.name?.[0] ?? 'S'}</i>
              <span><strong>{user?.name}</strong><small>Supervisor / Approver</small></span>
            </span>
          </div>
        </header>
        <div className="supervisor-page-content">{children}</div>
      </main>
    </div>
  );
};

export default SupervisorFrame;