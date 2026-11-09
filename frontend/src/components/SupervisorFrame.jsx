import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import '../pages/SupervisorDashboard.css';

const navigationByRole = {
  owner: [
    { section: 'UTAMA', links: [
      ['/dashboard', '⌂', 'Dashboard'],
      ['/transactions', '↕', 'Monitoring Transaksi'],
      ['/requests', '▣', 'Pengawasan Pengajuan'],
    ] },
    { section: 'KAS & BUKU BESAR', links: [
      ['/wallets', '▤', 'Kas & Rekening'],
      ['/debts', '⇄', 'Utang & Piutang'],
      ['/reconciliations', '✓', 'Rekonsiliasi & Koreksi'],
      ['/reports', '▥', 'Laporan Keuangan'],
    ] },
    { section: 'MANAJEMEN & KONTROL', links: [
      ['/budgets', '◫', 'Anggaran Operasional'],
      ['/categories', '＋', 'Kategori Arus Kas'],
      ['/users', '♙', 'Pengguna & Staf'],
      ['/audit', '≡', 'Audit Trail'],
    ] },
    { section: 'SISTEM', links: [
      ['/settings', '⚙', 'Pengaturan & Approval'],
      ['/subscriptions', '↻', 'Tagihan & Langganan'],
      ['/notifications', '♧', 'Notifikasi'],
      ['/profile', '⚿', 'Profil & Keamanan'],
    ] },
  ],
  supervisor: [
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
      ['/subscriptions', '↻', 'Tagihan & Langganan'],
      ['/notifications', '♧', 'Notifikasi & Alert'],
      ['/profile', '⚿', 'Profil & Keamanan'],
    ] },
  ],
  staff: [
    { section: 'UTAMA', links: [
      ['/dashboard', '⌂', 'Dashboard'],
      ['/transactions', '↕', 'Transaksi'],
      ['/requests', '▣', 'Pengajuan'],
    ] },
    { section: 'OPERASIONAL', links: [
      ['/wallets', '▤', 'Kas & Rekening'],
      ['/debts', '⇄', 'Utang & Piutang'],
      ['/reconciliations', '✓', 'Rekonsiliasi'],
      ['/reports', '▥', 'Laporan'],
    ] },
    { section: 'AKUN', links: [
      ['/subscriptions', '↻', 'Tagihan & Langganan'],
      ['/notifications', '♧', 'Notifikasi'],
      ['/profile', '⚿', 'Profil & Keamanan'],
    ] },
  ],
};

const SupervisorFrame = ({ active, unreadCount = 0, onLogout, children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');
  const role = user?.role ?? 'staff';
  const roleLabel = { owner: 'Owner', supervisor: 'Supervisor', staff: 'Staff' }[role];
  const portalLabel = { owner: 'OWNER PORTAL', supervisor: 'PORTAL PENGAWASAN', staff: 'KEUANGAN UMKM' }[role];
  const navigation = navigationByRole[role] ?? navigationByRole.staff;
  const actionLabel = {
    owner: '+ Catat Kas Langsung',
    supervisor: 'Tinjau Pengajuan',
    staff: '+ Catat transaksi',
  }[role];
  const actionPath = role === 'supervisor' ? '/requests' : '/transactions';

  const handleLogout = async () => {
    setLogoutError('');
    try {
      if (onLogout) {
        await onLogout();
        return;
      }
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setLogoutError('Gagal keluar dari akun. Coba lagi.');
    }
  };

  return (
    <div className="supervisor-app">
      <aside className="supervisor-sidebar">
        <Link to="/dashboard" className="supervisor-brand">
          <span className="supervisor-brand-mark">BH</span>
          <span><strong>Bocor Halus</strong><small>{portalLabel}</small></span>
        </Link>
        <div className="supervisor-business-chip"><i /> {role === 'owner' ? `Usaha · ${user?.name ?? 'Aktif'}` : role === 'supervisor' ? 'Data usaha aktif' : 'Akses staf aktif'}</div>
        <nav className="supervisor-navigation" aria-label={`Navigasi ${roleLabel.toLowerCase()}`}>
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
        <div className="supervisor-authority-note">
          <strong>{role === 'owner' ? 'KONTROL USAHA' : role === 'supervisor' ? 'OTORISASI SUPERVISOR' : 'AKSES STAF'}</strong>
          <span>{role === 'owner'
            ? 'Pantau dan kelola keuangan seluruh usaha.'
            : role === 'supervisor'
              ? 'Keputusan approval dan review tercatat pada audit usaha.'
              : 'Catat aktivitas dan pantau pengajuan keuangan.'}</span>
        </div>
        <div className="supervisor-account">
          <span className="supervisor-avatar">{user?.name?.[0] ?? 'S'}</span>
          <span><strong>{user?.name}</strong><small>{roleLabel}</small></span>
          <button type="button" title="Keluar" aria-label="Keluar" onClick={handleLogout}>↪</button>
        </div>
      </aside>

      <main className="supervisor-main">
        <header className="supervisor-topbar">
          <div className="supervisor-topbar-brand"><strong>Bocor Halus</strong><span>{portalLabel} · {role === 'owner' ? 'Manajemen Keuangan Usaha' : role === 'supervisor' ? 'Kontrol & Risk Monitoring' : 'Operasional Keuangan'}</span></div>
          <div className="supervisor-topbar-actions">
            <span className="supervisor-online"><i /> {role === 'supervisor' ? 'Pengawasan aktif' : 'Sesi aktif'}</span>
            <Link to={actionPath} className="supervisor-action-link">{actionLabel}</Link>
            <Link to="/notifications" className="supervisor-notification-button" aria-label={`Notifikasi, ${unreadCount} belum dibaca`}>
              ♧{unreadCount > 0 && <b>{unreadCount}</b>}
            </Link>
            <span className="supervisor-profile">
              <i>{user?.name?.[0] ?? 'S'}</i>
              <span><strong>{user?.name}</strong><small>{roleLabel}{role === 'supervisor' ? ' / Approver' : ''}</small></span>
            </span>
          </div>
        </header>
        <div className="supervisor-page-content">
          {logoutError && <div className="supervisor-alert error" role="alert">{logoutError}</div>}
          {children}
        </div>
      </main>
    </div>
  );
};

export default SupervisorFrame;