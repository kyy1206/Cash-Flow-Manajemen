import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import SupervisorFrame from '../components/SupervisorFrame';
import './Dashboard.css';
import './BusinessWorkspace.css';
import './SupervisorDashboard.css';

const currency = (amount = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(amount));

const ownerGroups = [
  { label: 'UTAMA', links: [
    ['/dashboard', '⌂', 'Dashboard'],
    ['/transactions', '↕', 'Monitoring Transaksi'],
    ['/requests', '▣', 'Pengawasan Pengajuan'],
  ] },
  { label: 'KAS & BUKU BESAR', links: [
    ['/wallets', '▤', 'Kas & Rekening'],
    ['/debts', '⇄', 'Utang & Piutang'],
    ['/reconciliations', '✓', 'Rekonsiliasi & Koreksi'],
    ['/reports', '▥', 'Laporan Keuangan'],
  ] },
  { label: 'MANAJEMEN & KONTROL', links: [
    ['/budgets', '◫', 'Anggaran Operasional'],
    ['/categories', '＋', 'Kategori Arus Kas'],
    ['/users', '♙', 'Pengguna & Staf'],
    ['/audit', '≡', 'Audit Trail'],
  ] },
  { label: 'SISTEM', links: [
    ['/settings', '⚙', 'Pengaturan & Approval'],
    ['/profile', '⚿', 'Profil & Keamanan'],
  ] },
];
const navigation = [
  ['/dashboard', '⌂', 'Dashboard'],
  ['/transactions', '↕', 'Transaksi'],
  ['/requests', '▣', 'Pengajuan'],
  ['/wallets', '▤', 'Kas & Rekening'],
  ['/debts', '⇄', 'Utang & Piutang'],
  ['/reconciliations', '✓', 'Rekonsiliasi'],
  ['/reports', '▥', 'Laporan'],
  ['/budgets', '◫', 'Anggaran'],
  ['/notifications', '♧', 'Notifikasi'],
  ['/profile', '⚿', 'Profil & Keamanan'],
];

const downloadSummary = (dashboard, period) => {
  const rows = [
    ['Ringkasan supervisor', period],
    ['Saldo kas dan rekening', dashboard.summary.total_balance],
    ['Pemasukan periode', dashboard.summary.income_total],
    ['Pengeluaran periode', dashboard.summary.expense_total],
    ['Pengeluaran hari ini', dashboard.summary.expense_today],
    ['Pengajuan menunggu', dashboard.summary.pending_requests],
    ['Nominal pengajuan menunggu', dashboard.summary.pending_requests_amount],
    [],
    ['Tanggal', 'Transaksi', 'Kategori', 'Sumber dana', 'Jenis', 'Nominal'],
    ...dashboard.recent_transactions.map((transaction) => [
      transaction.date,
      transaction.description || transaction.merchant || transaction.category || 'Transaksi',
      transaction.category || '',
      transaction.wallet || '',
      transaction.transaction_type,
      transaction.amount,
    ]),
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ringkasan-supervisor-${period}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

function BusinessDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [reconciliations, setReconciliations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const [year, month] = period.split('-').map(Number);
    const loadDashboard = async () => {
      setLoading(true);
      setError('');
      const [dashboardResult, reconciliationResult, notificationResult] = await Promise.allSettled([
        api.get('/dashboard', { params: { year, month }, signal: controller.signal }),
        api.get('/reconciliations', { params: { page: 1 }, signal: controller.signal }),
        api.get('/notifications', { params: { page: 1 }, signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (dashboardResult.status === 'fulfilled') {
        setDashboard(dashboardResult.value.data.data);
      } else {
        setError(dashboardResult.reason.response?.data?.message ?? 'Ringkasan usaha gagal dimuat.');
      }
      if (reconciliationResult.status === 'fulfilled') {
        setReconciliations(reconciliationResult.value.data.data.data ?? []);
      }
      if (notificationResult.status === 'fulfilled') {
        setNotifications(notificationResult.value.data.data.data ?? []);
        setUnreadCount(notificationResult.value.data.unread_count ?? 0);
      }
      setLoading(false);
    };
    loadDashboard();

    return () => controller.abort();
  }, [period, refreshKey]);

  const logoutUser = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  const summary = dashboard?.summary;
  const statusLabel = { owner: 'OWNER', supervisor: 'SUPERVISOR', staff: 'STAFF' }[user?.role] ?? 'PENGGUNA';

  const decideRequest = async (id, decision) => {
    const note = decision === 'reject' ? window.prompt('Tuliskan alasan penolakan:') : '';
    if (decision === 'reject' && !note?.trim()) return;
    setBusyRequestId(id);
    setActionError('');
    try {
      await api.post(`/expense-requests/${id}/${decision === 'approve' ? 'approve' : 'reject'}`, { note });
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setActionError(requestError.response?.data?.message ?? 'Keputusan pengajuan gagal disimpan.');
    } finally {
      setBusyRequestId(null);
    }
  };

  const downloadEvidence = async (requestItem) => {
    try {
      const response = await api.get(`/expense-requests/${requestItem.id}/evidence`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `bukti-pengajuan-${requestItem.id}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setActionError(requestError.response?.data?.message ?? 'Bukti pengajuan gagal diunduh.');
    }
  };

  if (user?.role === 'supervisor') {
    const pendingPreview = dashboard?.pending_requests_preview ?? [];
    const latestReconciliation = reconciliations[0];
    const budgetPercentage = Number(summary?.percentage ?? 0);

    return (
      <SupervisorFrame active="dashboard" unreadCount={unreadCount}>
        <div className="supervisor-dashboard-content">
          <div className="supervisor-page-heading">
            <div><span className="supervisor-eyebrow">RUANG KENDALI OPERASIONAL</span><h1>Dashboard Pengawasan & Otorisasi Operasional</h1><p>Pantau integritas kas, pengajuan, dan aktivitas keuangan usaha.</p></div>
            <div className="supervisor-page-actions">
              <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Pilih periode" />
              <button type="button" className="supervisor-button secondary" onClick={() => dashboard && downloadSummary(dashboard, period)} disabled={!dashboard}>↓ Unduh Ringkasan</button>
              <button type="button" className="supervisor-button primary" onClick={() => document.getElementById('approval-queue')?.scrollIntoView({ behavior: 'smooth' })}>✓ Verifikasi Pengajuan Cepat</button>
            </div>
          </div>

            {error && <div className="supervisor-alert error" role="alert">{error}</div>}
            {actionError && <div className="supervisor-alert error" role="alert">{actionError}</div>}
            {loading && <div className="supervisor-alert" role="status">Memuat ringkasan pengawasan...</div>}

            <section className="supervisor-metric-grid" aria-label="Indikator operasional">
              <article className="supervisor-metric approval"><div className="supervisor-metric-top"><span>MENUNGGU APPROVAL</span><b>Perlu ditinjau</b></div><strong>{summary?.pending_requests ?? '—'} <small>Berkas</small></strong><p>Total nilai {currency(summary?.pending_requests_amount ?? 0)}</p><Link to="/requests">Buka antrean <span>→</span></Link></article>
              <article className="supervisor-metric realization"><div className="supervisor-metric-top"><span>PENGELUARAN HARI INI</span><b>Transaksi tercatat</b></div><strong>{currency(summary?.expense_today ?? 0)}</strong><p>Pengeluaran yang sudah diposting</p><Link to="/transactions">Pantau transaksi <span>→</span></Link></article>
              <article className="supervisor-metric reconciliation"><div className="supervisor-metric-top"><span>REKONSILIASI TERAKHIR</span><b>{latestReconciliation?.status === 'pending' ? 'Menunggu review' : 'Status kas'}</b></div><strong>{latestReconciliation ? currency(latestReconciliation.difference) : 'Belum ada'}</strong><p>{latestReconciliation ? `${latestReconciliation.wallet?.name ?? 'Kas'} · ${latestReconciliation.reconciled_at}` : 'Belum ada hasil hitung kas'}</p><Link to="/reconciliations">Buka rekonsiliasi <span>→</span></Link></article>
              <article className="supervisor-metric budget"><div className="supervisor-metric-top"><span>SERAPAN ANGGARAN</span><b>{summary?.status ?? 'Belum diatur'}</b></div><strong>{summary?.budget_total ? `${budgetPercentage.toFixed(1)}%` : '—'}</strong><p>{summary?.budget_total ? `${currency(summary.spent_total)} dari ${currency(summary.budget_total)}` : 'Belum ada rencana anggaran'}</p><Link to="/budgets">Lihat anggaran <span>→</span></Link></article>
            </section>

            <div className="supervisor-content-grid">
              <div className="supervisor-primary-column">
                <section className="supervisor-panel" id="approval-queue">
                  <header className="supervisor-panel-heading"><div><span className="supervisor-eyebrow">TINDAKAN PENGAWASAN</span><h2>Antrean Pengajuan</h2></div><Link to="/requests">Lihat semua <span>→</span></Link></header>
                  {pendingPreview.length ? <div className="supervisor-request-list">{pendingPreview.map((requestItem) => (
                    <article className="supervisor-request" key={requestItem.id}>
                      <div className="supervisor-request-icon">▣</div>
                      <div className="supervisor-request-details"><div><strong>{requestItem.purpose}</strong><span className="supervisor-pending-tag">MENUNGGU</span></div><p>{requestItem.requester} · {requestItem.category ?? 'Tanpa kategori'} · {requestItem.wallet ?? 'Kas belum ditentukan'}</p><small>{requestItem.created_at ? new Date(requestItem.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Waktu tidak tersedia'}{requestItem.description ? ` · ${requestItem.description}` : ''}</small></div>
                      <div className="supervisor-request-total"><small>Nilai pengajuan</small><strong>{currency(requestItem.amount)}</strong><div>{requestItem.has_attachment && <button type="button" onClick={() => downloadEvidence(requestItem)}>Unduh bukti</button>}</div></div>
                      <div className="supervisor-request-actions"><button type="button" className="supervisor-button primary" onClick={() => decideRequest(requestItem.id, 'approve')} disabled={busyRequestId === requestItem.id}>{busyRequestId === requestItem.id ? 'Menyimpan...' : 'Setujui'}</button><button type="button" className="supervisor-button reject" onClick={() => decideRequest(requestItem.id, 'reject')} disabled={busyRequestId === requestItem.id}>Tolak</button></div>
                    </article>
                  ))}</div> : <div className="supervisor-empty-state"><span>✓</span><strong>Tidak ada pengajuan yang menunggu</strong><p>Antrean approval akan muncul di sini saat Staff mengirim pengajuan.</p></div>}
                  {pendingPreview.length > 0 && summary?.pending_requests > pendingPreview.length && <Link className="supervisor-more-link" to="/requests">Lihat {summary.pending_requests - pendingPreview.length} pengajuan lainnya</Link>}
                </section>

                <section className="supervisor-panel supervisor-activity-panel">
                  <header className="supervisor-panel-heading"><div><span className="supervisor-eyebrow">BUKU KAS TERKINI</span><h2>Aktivitas Transaksi</h2></div><Link to="/transactions">Buka buku kas <span>→</span></Link></header>
                  <div className="supervisor-activity-list">{(dashboard?.recent_transactions ?? []).slice(0, 6).map((transaction) => (
                    <article className="supervisor-activity-row" key={transaction.id}><span className={`supervisor-activity-icon ${transaction.transaction_type}`}>{transaction.transaction_type === 'income' ? '↗' : transaction.transaction_type === 'expense' ? '↙' : '⇄'}</span><div><strong>{transaction.description || transaction.merchant || transaction.category || 'Transaksi'}</strong><small>{transaction.date} · {transaction.wallet ?? 'Sumber dana'} · {transaction.category ?? 'Tanpa kategori'}</small></div><strong className={transaction.transaction_type === 'expense' ? 'negative' : 'positive'}>{transaction.transaction_type === 'expense' ? '−' : '+'}{currency(transaction.amount)}</strong></article>
                  ))}{!dashboard?.recent_transactions?.length && <p className="supervisor-muted">Belum ada transaksi pada periode ini.</p>}</div>
                </section>
              </div>

              <aside className="supervisor-secondary-column">
                <section className="supervisor-panel supervisor-side-panel">
                  <header className="supervisor-panel-heading"><div><span className="supervisor-eyebrow">KAS & REKONSILIASI</span><h2>Rekonsiliasi Terbaru</h2></div><Link to="/reconciliations" aria-label="Buka semua rekonsiliasi">→</Link></header>
                  {latestReconciliation ? <div className="supervisor-reconciliation-card"><span className={`supervisor-state ${latestReconciliation.status}`}>{latestReconciliation.status === 'pending' ? 'Perlu review' : 'Sudah direview'}</span><strong>{latestReconciliation.wallet?.name ?? 'Sumber dana'}</strong><p>{latestReconciliation.reconciled_at} · oleh {latestReconciliation.creator?.name ?? 'Pengguna'}</p><div><span>Saldo sistem <b>{currency(latestReconciliation.system_balance)}</b></span><span>Hasil hitung <b>{currency(latestReconciliation.counted_balance)}</b></span><span>Selisih <b>{currency(latestReconciliation.difference)}</b></span></div>{latestReconciliation.status === 'pending' && <Link className="supervisor-button primary" to="/reconciliations">Tinjau rekonsiliasi</Link>}</div> : <div className="supervisor-empty-state compact"><strong>Belum ada rekonsiliasi</strong><p>Hasil hitung saldo kas akan tercatat di sini.</p><Link to="/reconciliations">Buka rekonsiliasi</Link></div>}
                </section>

                <section className="supervisor-panel supervisor-side-panel">
                  <header className="supervisor-panel-heading"><div><span className="supervisor-eyebrow">KONTROL ANGGARAN</span><h2>Anggaran Kategori</h2></div><Link to="/budgets" aria-label="Buka anggaran">→</Link></header>
                  <div className="supervisor-budget-list">{(dashboard?.budget_categories ?? []).slice(0, 4).map((item) => (
                    <div className="supervisor-budget-row" key={item.category}><div><strong>{item.category}</strong><span>{currency(item.spent)} / {currency(item.amount)}</span></div><div className="supervisor-budget-track"><i className={item.status} style={{ width: `${Math.min(100, Number(item.percentage))}%` }} /></div></div>
                  ))}{!dashboard?.budget_categories?.length && <p className="supervisor-muted">Belum ada alokasi anggaran kategori.</p>}</div>
                  <Link className="supervisor-text-link" to="/budgets">Lihat rencana anggaran</Link>
                </section>

                <section className="supervisor-panel supervisor-side-panel">
                  <header className="supervisor-panel-heading"><div><span className="supervisor-eyebrow">NOTIFIKASI & ALERT</span><h2>Perlu Diperhatikan</h2></div><Link to="/notifications" aria-label="Buka semua notifikasi">{unreadCount > 0 ? unreadCount : '→'}</Link></header>
                  <div className="supervisor-alert-list">{notifications.slice(0, 3).map((notification) => (
                    <article className="supervisor-notice" key={notification.id}><span>{notification.read_at ? '•' : '!'}</span><div><strong>{notification.type?.replaceAll('_', ' ') ?? 'Pembaruan'}</strong><p>{notification.message}</p><small>{notification.created_at ? new Date(notification.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Baru saja'}</small></div></article>
                  ))}{!notifications.length && <p className="supervisor-muted">Tidak ada notifikasi terbaru.</p>}</div>
                  <Link className="supervisor-text-link" to="/notifications">Buka pusat notifikasi</Link>
                </section>
              </aside>
            </div>

            <section className="supervisor-footer-callout"><div><span>✓</span><div><strong>Rekonsiliasi saldo kas</strong><p>Catat hasil hitung fisik dan kirim untuk review supervisor.</p></div></div><Link to="/reconciliations" className="supervisor-button secondary">Mulai rekonsiliasi</Link></section>
        </div>
      </SupervisorFrame>
    );
  }

  return (
    <div className={`dashboard-app business-app ${user?.role === 'owner' ? 'owner-workspace owner-dashboard' : ''}`}>
      <aside className={`dashboard-sidebar ${user?.role === 'owner' ? 'owner-sidebar' : ''}`}>
        <Link to="/dashboard" className="dashboard-brand">
          <span className="dashboard-brand-mark">BH</span>
          <span><strong>Bocor Halus</strong><small>{user?.role === 'owner' ? 'OWNER PORTAL' : 'KEUANGAN UMKM'}</small>
            {user?.role === 'owner' && <small className="owner-brand-business">{user?.name}</small>}
          </span>
        </Link>
        <nav className="dashboard-nav">
          {user?.role === 'owner' ? ownerGroups.map((group) => (
            <div className="owner-nav-group" key={group.label}>
              <span className="owner-nav-label">{group.label}</span>
              {group.links.map(([path, icon, label]) => (
                <Link key={path} to={path} className={`dashboard-nav-link ${path === '/dashboard' ? 'active' : ''}`} aria-current={path === '/dashboard' ? 'page' : undefined}>
                  <span>{icon}</span>{label}
                </Link>
              ))}
            </div>
          )) : navigation.map(([path, icon, label]) => (
            <Link key={path} to={path} className={`dashboard-nav-link ${path === '/dashboard' ? 'active' : ''}`} aria-current={path === '/dashboard' ? 'page' : undefined}>
              <span>{icon}</span>{label}
            </Link>
          ))}
        </nav>
        <div className="dashboard-sidebar-spacer" />
        {user?.role === 'owner' && <div className="owner-security-status"><strong>◉ Status Sesi</strong><span>Akun Owner aktif</span></div>}
        <div className="dashboard-user">
          <span className="dashboard-avatar">{user?.name?.[0] ?? 'U'}</span>
          <span><strong>{user?.name}</strong><small>{statusLabel}</small></span>
        </div>
        <button className="business-logout" type="button" onClick={logoutUser}>Keluar akun</button>
      </aside>
      <main className="dashboard-main business-main">
        {user?.role === 'owner' && <div className="owner-utilitybar">
          <Link to="/dashboard" className="owner-utility-brand"><span>BH</span><strong>Bocor Halus</strong></Link>
          <span className="owner-utility-divider" />
          <span className="owner-utility-business">{user?.name} <b>• Data Usaha</b></span>
          <span className="owner-sync-badge"><i /> Sesi Aktif</span>
        </div>}
        <header className="dashboard-topbar">
          <div className="dashboard-welcome">
            <span className="dashboard-eyebrow">{user?.role === 'owner' ? '◈ MONITORING KEUANGAN USAHA' : `${statusLabel} · MONITORING KEUANGAN`}</span>
            <h1>Ringkasan keuangan usaha</h1>
            <p>Saldo kas/rekening serta arus pemasukan dan pengeluaran.</p>
          </div>
          <div className="dashboard-topbar-actions">
            <input className="dashboard-period-input" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Pilih periode" />
            <Link to="/transactions" className="dashboard-primary-button">{user?.role === 'owner' ? '+ Catat Kas Langsung' : '+ Catat transaksi'}</Link>
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
