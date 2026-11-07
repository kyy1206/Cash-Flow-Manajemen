import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import './Dashboard.css';
import './BusinessWorkspace.css';

const currency = (amount = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(amount));

const navigation = [
  ['/dashboard', '⌂', 'Dashboard'],
  ['/transactions', '↕', 'Transaksi'],
  ['/requests', '▣', 'Pengajuan'],
  ['/wallets', '▤', 'Kas & Rekening'],
  ['/debts', '⇄', 'Utang & Piutang'],
  ['/reconciliations', '✓', 'Rekonsiliasi'],
  ['/reports', '▥', 'Laporan'],
  ['/categories', '＋', 'Kategori'],
  ['/budgets', '◫', 'Anggaran'],
  ['/users', '♙', 'Pengguna'],
  ['/settings', '⚙', 'Pengaturan'],
  ['/audit', '≡', 'Audit Trail'],
  ['/notifications', '♧', 'Notifikasi'],
  ['/profile', '⚿', 'Profil & Keamanan'],
];

function BusinessDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const [year, month] = period.split('-').map(Number);
    api.get('/dashboard', { params: { year, month } })
      .then(({ data }) => {
        if (active) setDashboard(data.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message ?? 'Ringkasan usaha gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [period]);

  const logoutUser = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  const summary = dashboard?.summary;
  const visibleNavigation = navigation.filter(([path]) => {
    if (user?.role !== 'owner' && ['/categories', '/users', '/settings', '/audit'].includes(path)) return false;
    return true;
  });
  const statusLabel = { owner: 'OWNER', supervisor: 'SUPERVISOR', staff: 'STAFF' }[user?.role] ?? 'PENGGUNA';

  return (
    <div className="dashboard-app business-app">
      <aside className="dashboard-sidebar">
        <Link to="/dashboard" className="dashboard-brand">
          <span className="dashboard-brand-mark">BH</span>
          <span><strong>Bocor Halus</strong><small>KEUANGAN UMKM</small></span>
        </Link>
        <nav className="dashboard-nav">
          {visibleNavigation.map(([path, icon, label]) => (
            <Link key={path} to={path} className={`dashboard-nav-link ${path === '/dashboard' ? 'active' : ''}`} aria-current={path === '/dashboard' ? 'page' : undefined}>
              <span>{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="dashboard-sidebar-spacer" />
        <div className="dashboard-user">
          <span className="dashboard-avatar">{user?.name?.[0] ?? 'U'}</span>
          <span><strong>{user?.name}</strong><small>{statusLabel}</small></span>
        </div>
        <button className="business-logout" type="button" onClick={logoutUser}>Keluar akun</button>
      </aside>
      <main className="dashboard-main business-main">
        <header className="dashboard-topbar">
          <div className="dashboard-welcome">
            <span className="dashboard-eyebrow">{statusLabel} · MONITORING KEUANGAN</span>
            <h1>Ringkasan keuangan usaha</h1>
            <p>Saldo kas/rekening serta arus pemasukan dan pengeluaran.</p>
          </div>
          <div className="dashboard-topbar-actions">
            <input className="dashboard-period-input" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Pilih periode" />
            <Link to="/transactions" className="dashboard-primary-button">+ Catat transaksi</Link>
          </div>
        </header>
        {error && <div className="dashboard-message error" role="alert">{error}</div>}
        {loading && <div className="dashboard-message loading">Memuat ringkasan...</div>}
        {summary && (
          <>
            <section className="dashboard-kpi-grid" aria-label="Ringkasan periode">
              <article className="dashboard-kpi"><span className="dashboard-kpi-label">Total saldo</span><strong>{currency(summary.total_balance)}</strong><small>{summary.wallet_count} sumber dana aktif</small></article>
              <article className="dashboard-kpi"><span className="dashboard-kpi-label">Pemasukan periode</span><strong style={{ color: '#059669' }}>{currency(summary.income_total)}</strong><small>Uang yang benar-benar diterima</small></article>
              <article className="dashboard-kpi"><span className="dashboard-kpi-label">Pengeluaran periode</span><strong style={{ color: '#dc2626' }}>{currency(summary.expense_total)}</strong><small>Transaksi yang sudah diposting</small></article>
              <article className="dashboard-kpi"><span className="dashboard-kpi-label">Pengajuan menunggu</span><strong>{summary.pending_requests}</strong><small>Belum memengaruhi saldo</small></article>
            </section>
            <section className="business-dashboard-grid">
              <article className="business-panel">
                <div className="business-section-heading"><h2>Saldo kas & rekening</h2><Link to="/wallets">Lihat semua</Link></div>
                <div className="business-wallet-list">
                  {(dashboard.wallets ?? []).map((wallet) => <div className="business-wallet-row" key={wallet.id}>
                    <span><strong>{wallet.name}</strong><small>{wallet.type === 'cash' ? 'Kas tunai' : wallet.type === 'bank' ? 'Rekening bank' : 'Sumber dana'}</small></span>
                    <strong>{currency(wallet.balance)}</strong>
                  </div>)}
                  {dashboard.wallets?.length === 0 && <p className="business-muted">Belum ada sumber dana.</p>}
                </div>
              </article>
              <article className="business-panel">
                <div className="business-section-heading"><h2>Aktivitas terbaru</h2><Link to="/transactions">Semua transaksi</Link></div>
                <div className="business-wallet-list">
                  {(dashboard.recent_transactions ?? []).map((transaction) => <div className="business-wallet-row" key={transaction.id}>
                    <span><strong>{transaction.description || transaction.category || 'Transaksi'}</strong><small>{transaction.date} · {transaction.wallet ?? '—'}</small></span>
                    <strong className={transaction.transaction_type === 'income' ? 'business-income' : transaction.transaction_type === 'expense' ? 'business-expense' : ''}>
                      {transaction.transaction_type === 'expense' ? '−' : transaction.transaction_type === 'income' ? '+' : '↔'} {currency(transaction.amount)}
                    </strong>
                  </div>)}
                  {dashboard.recent_transactions?.length === 0 && <p className="business-muted">Belum ada transaksi pada periode ini.</p>}
                </div>
              </article>
              <article className="business-panel">
                <div className="business-section-heading"><h2>Anggaran kategori</h2><Link to="/budgets">Kelola anggaran</Link></div>
                <div className="business-wallet-list">
                  {(dashboard.budget_categories ?? []).map((item) => <div className="business-wallet-row" key={item.category}>
                    <span><strong>{item.category}</strong><small>{currency(item.spent)} dari {currency(item.amount)}</small></span>
                    <strong>{currency(item.remaining)}</strong>
                  </div>)}
                  {dashboard.budget_categories?.length === 0 && <p className="business-muted">Anggaran belum diatur.</p>}
                </div>
              </article>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default BusinessDashboard;
