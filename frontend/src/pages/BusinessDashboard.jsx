import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import SupervisorFrame from '../components/SupervisorFrame';
import StaffFrame from '../components/StaffFrame';
import './Dashboard.css';
import './BusinessWorkspace.css';
import './SupervisorDashboard.css';
import './StaffDashboard.css';

const currency = (amount = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(amount));

const downloadSummary = (dashboard, period) => {
  const rows = [
    ['Ringkasan keuangan usaha', period],
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
  anchor.download = `ringkasan-usaha-${period}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

function OwnerExecutiveDashboard({
  dashboard,
  period,
  onPeriodChange,
  reconciliations,
  notifications,
  error,
  loading,
  onDownload,
}) {
  const summary = dashboard?.summary;
  const wallets = dashboard?.wallets ?? [];
  const transactions = dashboard?.recent_transactions ?? [];
  const pendingRequests = dashboard?.pending_requests_preview ?? [];
  const cashFlow = dashboard?.daily_cash_flow ?? [];
  const obligations = dashboard?.upcoming_obligations ?? {
    count: 0,
    receivable_total: 0,
    payable_total: 0,
    net_total: 0,
    items: [],
  };
  const latestReconciliation = reconciliations[0];
  const maxDailyFlow = Math.max(1, ...cashFlow.map((day) => Math.max(day.income, day.expense)));
  const monthLabel = new Date(`${period}-01T12:00:00`).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
  const activeDays = Math.max(1, cashFlow.length);

  return (
    <div className="owner-executive-dashboard">
      <header className="owner-dashboard-heading">
        <div>
          <span className="supervisor-eyebrow">IKHTISAR EKSEKUTIF PEMILIK</span>
          <h1>Dashboard Keuangan Usaha</h1>
          <p>Saldo, arus kas, pengajuan, dan rekonsiliasi berdasarkan data usaha.</p>
        </div>
        <div className="owner-dashboard-actions">
          <input type="month" aria-label="Pilih periode dashboard" value={period} onChange={(event) => onPeriodChange(event.target.value)} />
          <button type="button" className="supervisor-button secondary" onClick={onDownload} disabled={!dashboard}>
            Unduh ringkasan CSV
          </button>
          <Link to="/transactions" className="supervisor-button primary">＋ Catat transaksi</Link>
        </div>
      </header>

      {error && <div className="supervisor-alert error" role="alert">{error}</div>}
      {loading && !dashboard && <div className="supervisor-alert" role="status">Memuat dashboard usaha...</div>}

      {summary && (
        <>
          <section className="owner-executive-kpi-grid" aria-label="Ikhtisar keuangan">
            <article className="owner-executive-kpi">
              <div className="owner-kpi-heading"><span>Likuiditas tersedia</span><b aria-hidden="true">▤</b></div>
              <strong>{currency(summary.total_balance)}</strong>
              <small>{summary.wallet_count} sumber dana aktif</small>
              <div className="owner-kpi-breakdown">
                {wallets.slice(0, 2).map((wallet) => (
                  <span key={wallet.id}><span>{wallet.name}</span><b>{currency(wallet.balance)}</b></span>
                ))}
                {!wallets.length && <span>Belum ada sumber dana.</span>}
              </div>
            </article>

            <article className="owner-executive-kpi">
              <div className="owner-kpi-heading"><span>Arus kas bersih · {monthLabel}</span><b aria-hidden="true">↗</b></div>
              <strong>{currency(summary.net_flow)}</strong>
              <small>Pemasukan dikurangi pengeluaran terposting</small>
              <div className="owner-kpi-breakdown">
                <span><span>Pemasukan</span><b>{currency(summary.income_total)}</b></span>
                <span><span>Pengeluaran</span><b>{currency(summary.expense_total)}</b></span>
              </div>
            </article>

            <article className="owner-executive-kpi">
              <div className="owner-kpi-heading"><span>Rekonsiliasi terakhir</span><b aria-hidden="true">✓</b></div>
              <strong>{latestReconciliation ? currency(latestReconciliation.difference) : 'Belum ada'}</strong>
              <small>
                {latestReconciliation
                  ? `${latestReconciliation.wallet?.name ?? 'Sumber dana'} · ${latestReconciliation.reconciled_at}`
                  : 'Belum ada hasil hitung kas'}
              </small>
              <div className="owner-kpi-breakdown">
                <span>Status</span>
                <b>{latestReconciliation?.status === 'pending' ? 'Menunggu review' : latestReconciliation ? 'Sudah direview' : 'Belum tersedia'}</b>
              </div>
            </article>

            <article className="owner-executive-kpi">
              <div className="owner-kpi-heading"><span>Kewajiban 14 hari ke depan</span><b aria-hidden="true">◷</b></div>
              <strong>{currency(obligations.net_total)}</strong>
              <small>{obligations.count} utang/piutang jatuh tempo</small>
              <div className="owner-kpi-breakdown">
                <span><span>Piutang</span><b>{currency(obligations.receivable_total)}</b></span>
                <span><span>Utang</span><b>{currency(obligations.payable_total)}</b></span>
              </div>
            </article>
          </section>

          <div className="owner-executive-grid">
            <div className="owner-executive-main">
              <section className="supervisor-panel owner-cashflow-panel">
                <header className="supervisor-panel-heading">
                  <div>
                    <span className="supervisor-eyebrow">ARUS KAS TERCATAT</span>
                    <h2>Arus kas harian · {monthLabel}</h2>
                  </div>
                </header>
                {cashFlow.length ? (
                  <>
                    <div className="owner-cashflow-summary">
                      <span>Rata-rata pemasukan hari aktif <b>{currency(summary.income_total / activeDays)}</b></span>
                      <span>Rata-rata pengeluaran hari aktif <b>{currency(summary.expense_total / activeDays)}</b></span>
                    </div>
                    <div className="owner-cashflow-scroll">
                      <div className="owner-cashflow-chart" role="img" aria-label={`Grafik pemasukan dan pengeluaran harian ${monthLabel}`}>
                        {cashFlow.map((day) => (
                          <div className="owner-cashflow-day" key={day.date} title={`${day.date} · Masuk ${currency(day.income)} · Keluar ${currency(day.expense)}`}>
                            <div className="owner-cashflow-bars">
                              <i className="income" style={{ height: `${day.income ? Math.max(4, day.income / maxDailyFlow * 100) : 0}%` }} />
                              <i className="expense" style={{ height: `${day.expense ? Math.max(4, day.expense / maxDailyFlow * 100) : 0}%` }} />
                            </div>
                            <span>{Number(day.date.slice(-2))}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="owner-cashflow-legend">
                      <span><i className="income" /> Pemasukan</span>
                      <span><i className="expense" /> Pengeluaran</span>
                      <small>Hanya transaksi yang sudah terposting.</small>
                    </div>
                  </>
                ) : <p className="owner-dashboard-empty">Belum ada pemasukan atau pengeluaran terposting pada periode ini.</p>}
              </section>

              <div className="owner-dashboard-lower-grid">
                <section className="supervisor-panel">
                  <header className="supervisor-panel-heading">
                    <div><span className="supervisor-eyebrow">SALDO RIIL</span><h2>Sumber dana</h2></div>
                    <Link to="/wallets">Lihat semua →</Link>
                  </header>
                  <div className="owner-dashboard-list">
                    {wallets.map((wallet) => (
                      <div className="owner-dashboard-row" key={wallet.id}>
                        <div><strong>{wallet.name}</strong><small>{wallet.type === 'cash' ? 'Kas tunai' : wallet.type === 'bank' ? 'Rekening bank' : 'Sumber dana lain'}</small></div>
                        <b>{currency(wallet.balance)}</b>
                      </div>
                    ))}
                    {!wallets.length && <p className="owner-dashboard-empty">Belum ada sumber dana aktif.</p>}
                  </div>
                </section>

                <section className="supervisor-panel">
                  <header className="supervisor-panel-heading">
                    <div><span className="supervisor-eyebrow">KONTROL ANGGARAN</span><h2>Anggaran kategori</h2></div>
                    <Link to="/budgets">Kelola →</Link>
                  </header>
                  <div className="owner-dashboard-list">
                    {(dashboard.budget_categories ?? []).slice(0, 5).map((item) => (
                      <div className="owner-budget-row" key={item.category}>
                        <div><strong>{item.category}</strong><span>{currency(item.spent)} / {currency(item.amount)}</span></div>
                        <div className="owner-budget-track"><i className={item.status} style={{ width: `${Math.min(100, Number(item.percentage))}%` }} /></div>
                      </div>
                    ))}
                    {!dashboard.budget_categories?.length && <p className="owner-dashboard-empty">Belum ada alokasi anggaran.</p>}
                  </div>
                </section>
              </div>

              <section className="supervisor-panel">
                <header className="supervisor-panel-heading">
                  <div><span className="supervisor-eyebrow">BUKU KAS</span><h2>Transaksi terbaru</h2></div>
                  <Link to="/transactions">Buka semua →</Link>
                </header>
                <div className="owner-dashboard-list">
                  {transactions.slice(0, 5).map((transaction) => (
                    <div className="owner-dashboard-row owner-transaction-row" key={transaction.id}>
                      <div>
                        <strong>{transaction.description || transaction.merchant || transaction.category || 'Transaksi'}</strong>
                        <small>{transaction.date} · {transaction.wallet ?? 'Sumber dana'} · {transaction.category ?? 'Tanpa kategori'}</small>
                      </div>
                      <b>{transaction.transaction_type === 'expense' ? '−' : transaction.transaction_type === 'income' ? '+' : '↔'} {currency(transaction.amount)}</b>
                    </div>
                  ))}
                  {!transactions.length && <p className="owner-dashboard-empty">Belum ada transaksi terposting pada periode ini.</p>}
                </div>
              </section>
            </div>

            <aside className="owner-executive-side">
              <section className="supervisor-panel">
                <header className="supervisor-panel-heading">
                  <div><span className="supervisor-eyebrow">ANTREAN OPERASIONAL</span><h2>Pengajuan menunggu</h2></div>
                  <Link to="/requests">{summary.pending_requests} →</Link>
                </header>
                <div className="owner-dashboard-list">
                  {pendingRequests.map((requestItem) => (
                    <article className="owner-request-item" key={requestItem.id}>
                      <div><strong>{requestItem.purpose}</strong><small>{requestItem.requester ?? 'Staff'} · {requestItem.category ?? 'Tanpa kategori'}</small></div>
                      <b>{currency(requestItem.amount)}</b>
                    </article>
                  ))}
                  {!pendingRequests.length && <p className="owner-dashboard-empty">Tidak ada pengajuan yang menunggu.</p>}
                </div>
                <p className="owner-dashboard-note">Keputusan pengajuan dilakukan oleh Supervisor.</p>
                <Link className="owner-dashboard-text-link" to="/requests">Pantau semua pengajuan →</Link>
              </section>

              <section className="supervisor-panel">
                <header className="supervisor-panel-heading">
                  <div><span className="supervisor-eyebrow">HITUNG FISIK KAS</span><h2>Rekonsiliasi terbaru</h2></div>
                  <Link to="/reconciliations">Lihat →</Link>
                </header>
                <div className="owner-dashboard-list">
                  {reconciliations.slice(0, 3).map((item) => (
                    <div className="owner-dashboard-row" key={item.id}>
                      <div><strong>{item.wallet?.name ?? 'Sumber dana'}</strong><small>{item.reconciled_at} · {item.status === 'pending' ? 'Menunggu review' : 'Sudah direview'}</small></div>
                      <b>{currency(item.difference)}</b>
                    </div>
                  ))}
                  {!reconciliations.length && <p className="owner-dashboard-empty">Belum ada rekonsiliasi.</p>}
                </div>
                <Link className="owner-dashboard-text-link" to="/reconciliations">Buat atau lihat rekonsiliasi →</Link>
              </section>

              <section className="supervisor-panel">
                <header className="supervisor-panel-heading">
                  <div><span className="supervisor-eyebrow">JATUH TEMPO 14 HARI</span><h2>Utang & piutang</h2></div>
                  <Link to="/debts">Kelola →</Link>
                </header>
                <div className="owner-dashboard-list">
                  {obligations.items.map((item) => (
                    <div className="owner-dashboard-row" key={item.id}>
                      <div><strong>{item.counterparty}</strong><small>{item.type === 'receivable' ? 'Piutang' : 'Utang'} · {item.due_date}</small></div>
                      <b>{currency(item.remaining_amount)}</b>
                    </div>
                  ))}
                  {!obligations.items.length && <p className="owner-dashboard-empty">Tidak ada utang/piutang jatuh tempo dalam 14 hari.</p>}
                </div>
                <Link className="owner-dashboard-text-link" to="/debts">Lihat semua utang & piutang →</Link>
              </section>

              <section className="supervisor-panel">
                <header className="supervisor-panel-heading">
                  <div><span className="supervisor-eyebrow">AKTIVITAS SISTEM</span><h2>Notifikasi terbaru</h2></div>
                  <Link to="/notifications">Semua →</Link>
                </header>
                <div className="owner-dashboard-list">
                  {notifications.slice(0, 3).map((notification) => (
                    <div className="owner-notification-item" key={notification.id}>
                      <strong>{notification.type?.replaceAll('_', ' ') ?? 'Pembaruan'}</strong>
                      <p>{notification.message}</p>
                    </div>
                  ))}
                  {!notifications.length && <p className="owner-dashboard-empty">Tidak ada notifikasi terbaru.</p>}
                </div>
              </section>

              <section className="owner-protocol-card">
                <span className="supervisor-eyebrow">KONTROL KEUANGAN</span>
                <h2>Aturan pencatatan</h2>
                <ul>
                  <li>Transaksi terposting tidak dapat diedit atau dihapus; koreksi dilakukan melalui reversal Owner.</li>
                  <li>Pengeluaran Staff yang wajib approval menunggu keputusan Supervisor sebelum memengaruhi saldo.</li>
                  <li>Transfer antar sumber dana tidak dihitung sebagai pemasukan atau pengeluaran.</li>
                </ul>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function BusinessDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [reconciliations, setReconciliations] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [staffRequests, setStaffRequests] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [payingRequest, setPayingRequest] = useState(null);
  const [payForm, setPayForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    merchant: '',
    payment_method: 'Kas Tunai',
    description: '',
  });
  const [paySaving, setPaySaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const [year, month] = period.split('-').map(Number);
    const loadDashboard = async () => {
      setLoading(true);
      setError('');
      const requests = [
        api.get('/dashboard', { params: { year, month }, signal: controller.signal }),
        api.get('/reconciliations', { params: { page: 1 }, signal: controller.signal }),
        api.get('/notifications', { params: { page: 1 }, signal: controller.signal }),
      ];
      if (user?.role === 'staff') {
        requests.push(api.get('/expense-requests', { params: { page: 1 }, signal: controller.signal }));
      }

      const results = await Promise.allSettled(requests);
      if (controller.signal.aborted) return;

      const [dashboardResult, reconciliationResult, notificationResult, staffRequestResult] = results;

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
      if (staffRequestResult && staffRequestResult.status === 'fulfilled') {
        setStaffRequests(staffRequestResult.value.data?.data?.data ?? []);
      }
      setLoading(false);
    };
    loadDashboard();

    return () => controller.abort();
  }, [period, refreshKey, user?.role]);

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

  const openPayModal = (item) => {
    setPayingRequest(item);
    setPayForm({
      date: new Date().toISOString().slice(0, 10),
      merchant: item.merchant ?? '',
      payment_method: 'Kas Tunai',
      description: item.purpose ? `Realisasi: ${item.purpose}` : '',
    });
    setActionError('');
    setActionSuccess('');
  };

  const handlePaySubmit = async (event) => {
    event.preventDefault();
    if (!payingRequest) return;
    setPaySaving(true);
    setActionError('');
    setActionSuccess('');
    try {
      await api.post(`/expense-requests/${payingRequest.id}/pay`, payForm);
      setActionSuccess('Realisasi pengeluaran berhasil dibukukan ke kas usaha.');
      setPayingRequest(null);
      setRefreshKey((current) => current + 1);
    } catch (payError) {
      setActionError(payError.response?.data?.message ?? 'Gagal membukukan realisasi pengeluaran.');
    } finally {
      setPaySaving(false);
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
              <article className="supervisor-metric approval"><div className="supervisor-metric-top"><span>MENUNGGU APPROVAL</span><b>Perlu ditinjau</b></div><strong>{summary?.pending_requests ?? '0'} <small>Berkas</small></strong><p>Total nilai {currency(summary?.pending_requests_amount ?? 0)}</p><Link to="/requests">Buka antrean <span>→</span></Link></article>
              <article className="supervisor-metric realization"><div className="supervisor-metric-top"><span>PENGELUARAN HARI INI</span><b>Transaksi tercatat</b></div><strong>{currency(summary?.expense_today ?? 0)}</strong><p>Pengeluaran yang sudah diposting</p><Link to="/transactions">Pantau transaksi <span>→</span></Link></article>
              <article className="supervisor-metric reconciliation"><div className="supervisor-metric-top"><span>REKONSILIASI TERAKHIR</span><b>{latestReconciliation?.status === 'pending' ? 'Menunggu review' : 'Status kas'}</b></div><strong>{latestReconciliation ? currency(latestReconciliation.difference) : 'Belum ada'}</strong><p>{latestReconciliation ? `${latestReconciliation.wallet?.name ?? 'Kas'} · ${latestReconciliation.reconciled_at}` : 'Belum ada hasil hitung kas'}</p><Link to="/reconciliations">Buka rekonsiliasi <span>→</span></Link></article>
              <article className="supervisor-metric budget"><div className="supervisor-metric-top"><span>SERAPAN ANGGARAN</span><b>{summary?.status ?? 'Belum diatur'}</b></div><strong>{summary?.budget_total ? `${budgetPercentage.toFixed(1)}%` : '0%'}</strong><p>{summary?.budget_total ? `${currency(summary.spent_total)} dari ${currency(summary.budget_total)}` : 'Belum ada rencana anggaran'}</p><Link to="/budgets">Lihat anggaran <span>→</span></Link></article>
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

  if (user?.role === 'staff') {
    const latestReconciliation = reconciliations[0];
    const pendingCount = staffRequests.filter((item) => item.status === 'pending').length;
    const approvedCount = staffRequests.filter((item) => item.status === 'approved').length;
    const activeRequests = staffRequests.slice(0, 6);

    return (
      <StaffFrame active="dashboard" unreadCount={unreadCount}>
        <div className="staff-dashboard-content">
          <div className="staff-page-heading">
            <div>
              <span className="staff-eyebrow">RUANG KERJA OPERASIONAL</span>
              <h1>Dashboard Kasir & Pencatatan Staf</h1>
              <p>Kelola pemasukan harian gerai, catat kas kecil, dan pantau pengajuan operasional.</p>
            </div>
            <div className="staff-page-actions">
              <input
                type="month"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                aria-label="Pilih periode pencatatan"
              />
              <Link to="/transactions" className="staff-button primary">
                ＋ Catat Penjualan / Kas
              </Link>
              <Link to="/requests" className="staff-button secondary">
                ＋ Ajukan Biaya
              </Link>
            </div>
          </div>

          {error && <div className="staff-alert error" role="alert">{error}</div>}
          {actionError && <div className="staff-alert error" role="alert">{actionError}</div>}
          {actionSuccess && <div className="staff-alert success" role="alert">{actionSuccess}</div>}
          {loading && <div className="staff-alert" role="status">Memuat data operasional...</div>}

          {/* Quick Action Banner */}
          <section className="staff-quick-banner" aria-label="Aksi Cepat Staf">
            <Link to="/transactions" className="staff-quick-card">
              <span className="staff-quick-icon sales">↗</span>
              <span className="staff-quick-text">
                <strong>Catat Penjualan Harian</strong>
                <small>Omset kasir, QRIS, atau transfer</small>
              </span>
            </Link>
            <Link to="/transactions" className="staff-quick-card">
              <span className="staff-quick-icon expense">↙</span>
              <span className="staff-quick-text">
                <strong>Catat Pengeluaran Langsung</strong>
                <small>Belanja kecil rutin operasional</small>
              </span>
            </Link>
            <Link to="/requests" className="staff-quick-card">
              <span className="staff-quick-icon request">▣</span>
              <span className="staff-quick-text">
                <strong>Ajukan Biaya / Struk</strong>
                <small>Memerlukan persetujuan supervisor</small>
              </span>
            </Link>
            <Link to="/reconciliations" className="staff-quick-card">
              <span className="staff-quick-icon reconcile">✓</span>
              <span className="staff-quick-text">
                <strong>Hitung Fisik Kas (Tutup Shift)</strong>
                <small>Verifikasi uang tunai di laci</small>
              </span>
            </Link>
          </section>

          {/* Metric Grid */}
          <section className="staff-metric-grid" aria-label="Ringkasan Operasional Hari Ini">
            <article className="staff-metric income">
              <div className="staff-metric-top">
                <span>PEMASUKAN HARI INI</span>
                <b>Kas masuk</b>
              </div>
              <strong>{currency(summary?.income_today ?? 0)}</strong>
              <p>Total transaksi penjualan hari ini</p>
              <Link to="/transactions">
                Buku transaksi <span>→</span>
              </Link>
            </article>

            <article className="staff-metric expense">
              <div className="staff-metric-top">
                <span>PENGELUARAN HARI INI</span>
                <b>Kas keluar</b>
              </div>
              <strong>{currency(summary?.expense_today ?? 0)}</strong>
              <p>Total pengeluaran tercatat hari ini</p>
              <Link to="/transactions">
                Buku transaksi <span>→</span>
              </Link>
            </article>

            <article className="staff-metric pending">
              <div className="staff-metric-top">
                <span>PENGAJUAN MENUNGGU</span>
                <b>{pendingCount} Berkas</b>
              </div>
              <strong>{pendingCount}</strong>
              <p>Sedang ditinjau Supervisor</p>
              <Link to="/requests">
                Pantau status <span>→</span>
              </Link>
            </article>

            <article className="staff-metric approved">
              <div className="staff-metric-top">
                <span>SIAP DICAIRKAN</span>
                <b>{approvedCount} Disetujui</b>
              </div>
              <strong>{approvedCount}</strong>
              <p>Telah disetujui, siap dibukukan</p>
              <Link to="/requests">
                Realisasikan pembayaran <span>→</span>
              </Link>
            </article>
          </section>

          {/* Main Content Grid */}
          <div className="staff-content-grid">
            <div className="staff-primary-column">
              {/* Status Pengajuan Saya & Realisasi */}
              <section className="staff-panel">
                <header className="staff-panel-heading">
                  <div>
                    <span className="staff-eyebrow">PENGAJUAN BIAYA SAYA</span>
                    <h2>Status Pengajuan & Tindak Lanjut</h2>
                  </div>
                  <Link to="/requests">Lihat semua pengajuan <span>→</span></Link>
                </header>

                {activeRequests.length > 0 ? (
                  <div className="staff-request-list">
                    {activeRequests.map((item) => (
                      <article className={`staff-request-card ${item.status}`} key={item.id}>
                        <div>
                          <div className="staff-request-header">
                            <strong>{item.purpose}</strong>
                            <span className={`staff-status-tag ${item.status}`}>
                              {item.status === 'pending'
                                ? 'Menunggu Review'
                                : item.status === 'approved'
                                ? 'Disetujui'
                                : item.status === 'rejected'
                                ? 'Ditolak'
                                : 'Dibayar'}
                            </span>
                          </div>
                          <div className="staff-request-meta">
                            {item.category?.name ?? 'Tanpa kategori'} · {item.wallet?.name ?? 'Kas gerai'} · {item.created_at ? new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Hari ini'}
                          </div>
                          {item.description && <p className="staff-request-desc">{item.description}</p>}
                          {item.status === 'approved' && (
                            <div className="staff-decision-alert approved">
                              ✓ Disetujui oleh Supervisor. Silakan lakukan pembayaran dan catat realisasinya di bawah.
                            </div>
                          )}
                          {item.status === 'rejected' && item.decision_note && (
                            <div className="staff-decision-alert rejected">
                              ✕ Ditolak Supervisor: {item.decision_note}
                            </div>
                          )}
                        </div>

                        <div className="staff-request-side">
                          <div className="staff-request-amount">
                            <small>Nominal</small>
                            <strong>{currency(item.amount)}</strong>
                            {item.has_attachment && (
                              <button
                                type="button"
                                className="staff-button secondary"
                                style={{ marginTop: '4px', minHeight: '22px', fontSize: '8px', padding: '0 6px' }}
                                onClick={() => downloadEvidence(item)}
                              >
                                ↓ Bukti
                              </button>
                            )}
                          </div>
                          {item.status === 'approved' && (
                            <button
                              type="button"
                              className="staff-pay-button"
                              onClick={() => openPayModal(item)}
                            >
                              Catat Sudah Dibayar
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="staff-empty-state">
                    <span>✓</span>
                    <strong>Tidak ada pengajuan aktif</strong>
                    <p>Semua pengajuan operasional kasir telah selesai diproses.</p>
                  </div>
                )}
              </section>

              {/* Aktivitas Transaksi Pencatatan Saya */}
              <section className="staff-panel">
                <header className="staff-panel-heading">
                  <div>
                    <span className="staff-eyebrow">BUKU KAS HARIAN</span>
                    <h2>Aktivitas Transaksi Saya</h2>
                  </div>
                  <Link to="/transactions">Buka buku kas lengkap <span>→</span></Link>
                </header>

                <div className="staff-activity-list">
                  {(dashboard?.recent_transactions ?? []).slice(0, 6).map((transaction) => (
                    <article className="staff-activity-row" key={transaction.id}>
                      <span className={`staff-activity-icon ${transaction.transaction_type}`}>
                        {transaction.transaction_type === 'income' ? '↗' : '↙'}
                      </span>
                      <div>
                        <strong>{transaction.description || transaction.merchant || transaction.category || 'Transaksi'}</strong>
                        <small style={{ display: 'block', color: '#64748b', fontSize: '8px' }}>
                          {transaction.date} · {transaction.wallet ?? 'Kas gerai'} · {transaction.category ?? 'Umum'}
                        </small>
                      </div>
                      <strong className={transaction.transaction_type === 'expense' ? 'negative' : 'positive'}>
                        {transaction.transaction_type === 'expense' ? '−' : '+'}
                        {currency(transaction.amount)}
                      </strong>
                    </article>
                  ))}
                  {!dashboard?.recent_transactions?.length && (
                    <p style={{ color: '#64748b', fontSize: '9px', padding: '8px 0' }}>
                      Belum ada transaksi yang dicatat pada periode ini.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <aside className="staff-secondary-column">
              {/* Kas & Rekening Operasional */}
              <section className="staff-panel staff-side-panel">
                <header className="staff-panel-heading">
                  <div>
                    <span className="staff-eyebrow">SUMBER DANA AKTIF</span>
                    <h2>Kas Operasional Gerai</h2>
                  </div>
                  <Link to="/wallets" aria-label="Lihat kas">Detail →</Link>
                </header>
                <div>
                  {(dashboard?.wallets ?? []).map((wallet) => (
                    <div className="staff-wallet-item" key={wallet.id}>
                      <div>
                        <strong>{wallet.name}</strong>
                        <small>{wallet.type === 'cash' ? 'Kas Tunai / Laci' : 'Rekening Bank'}</small>
                      </div>
                      <strong style={{ color: '#0f766e' }}>{currency(wallet.balance)}</strong>
                    </div>
                  ))}
                  {!dashboard?.wallets?.length && (
                    <p style={{ color: '#64748b', fontSize: '9px' }}>Belum ada sumber kas aktif.</p>
                  )}
                </div>
              </section>

              {/* Rekonsiliasi Kas Saya */}
              <section className="staff-panel staff-side-panel">
                <header className="staff-panel-heading">
                  <div>
                    <span className="staff-eyebrow">TUTUP SHIFT & KASIR</span>
                    <h2>Rekonsiliasi Kas Terakhir</h2>
                  </div>
                  <Link to="/reconciliations" aria-label="Buka rekonsiliasi">→</Link>
                </header>
                {latestReconciliation ? (
                  <div className="staff-reconciliation-card">
                    <span className={`staff-status-tag ${latestReconciliation.status}`}>
                      {latestReconciliation.status === 'pending' ? 'Menunggu Review Supervisor' : 'Sudah Direview'}
                    </span>
                    <strong style={{ marginTop: '6px' }}>{latestReconciliation.wallet?.name ?? 'Kas Toko'}</strong>
                    <p>Tanggal hitung: {latestReconciliation.reconciled_at}</p>
                    <div className="staff-reconciliation-stats">
                      <div>
                        <span>Sistem</span>
                        <b>{currency(latestReconciliation.system_balance)}</b>
                      </div>
                      <div>
                        <span>Hitung Fisik</span>
                        <b>{currency(latestReconciliation.counted_balance)}</b>
                      </div>
                      <div>
                        <span>Selisih</span>
                        <b style={{ color: latestReconciliation.difference === 0 ? '#059669' : '#e11d48' }}>
                          {currency(latestReconciliation.difference)}
                        </b>
                      </div>
                    </div>
                    {latestReconciliation.notes && (
                      <small style={{ display: 'block', color: '#475569', fontSize: '8px' }}>
                        Catatan: {latestReconciliation.notes}
                      </small>
                    )}
                  </div>
                ) : (
                  <div className="staff-empty-state compact">
                    <strong>Belum ada hitung kas fisik</strong>
                    <p>Lakukan hitung fisik di akhir shift untuk memastikan saldo kasir sesuai.</p>
                    <Link to="/reconciliations">Mulai Hitung Fisik Kas</Link>
                  </div>
                )}
              </section>

              {/* Notifikasi & Alert */}
              <section className="staff-panel staff-side-panel">
                <header className="staff-panel-heading">
                  <div>
                    <span className="staff-eyebrow">PEMBERITAHUAN</span>
                    <h2>Status & Notifikasi</h2>
                  </div>
                  <Link to="/notifications" aria-label="Lihat notifikasi">
                    {unreadCount > 0 ? `${unreadCount} Baru` : '→'}
                  </Link>
                </header>
                <div className="staff-notice-list">
                  {notifications.slice(0, 3).map((notification) => (
                    <article className="staff-notice" key={notification.id}>
                      <span>{notification.read_at ? '•' : '!'}</span>
                      <div>
                        <strong>{notification.type?.replaceAll('_', ' ') ?? 'Pembaruan'}</strong>
                        <p>{notification.message}</p>
                        <small>
                          {notification.created_at
                            ? new Date(notification.created_at).toLocaleString('id-ID', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })
                            : 'Baru saja'}
                        </small>
                      </div>
                    </article>
                  ))}
                  {!notifications.length && (
                    <p style={{ color: '#64748b', fontSize: '9px' }}>Tidak ada notifikasi baru.</p>
                  )}
                </div>
                <Link
                  to="/notifications"
                  style={{ display: 'block', marginTop: '8px', color: '#0f766e', fontSize: '8px', fontWeight: 700 }}
                >
                  Buka semua notifikasi
                </Link>
              </section>
            </aside>
          </div>

          {/* Modal Realisasi Pembayaran */}
          {payingRequest && (
            <div className="staff-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pay-modal-title">
              <div className="staff-modal">
                <div className="staff-modal-header">
                  <h3 id="pay-modal-title">Catat Realisasi Pembayaran</h3>
                  <button
                    type="button"
                    className="staff-modal-close"
                    onClick={() => setPayingRequest(null)}
                    aria-label="Tutup modal"
                  >
                    ✕
                  </button>
                </div>
                <div className="staff-modal-summary">
                  <strong>{payingRequest.purpose}</strong>
                  <p>
                    Nominal: <b>{currency(payingRequest.amount)}</b> · Kas: <b>{payingRequest.wallet?.name ?? 'Kas gerai'}</b>
                  </p>
                </div>
                <form onSubmit={handlePaySubmit}>
                  <div className="staff-modal-fields">
                    <div className="staff-field-group">
                      <label htmlFor="pay-date">Tanggal Realisasi Pembayaran</label>
                      <input
                        id="pay-date"
                        type="date"
                        required
                        value={payForm.date}
                        onChange={(e) => setPayForm((prev) => ({ ...prev, date: e.target.value }))}
                      />
                    </div>
                    <div className="staff-field-group">
                      <label htmlFor="pay-method">Metode Pembayaran</label>
                      <select
                        id="pay-method"
                        value={payForm.payment_method}
                        onChange={(e) => setPayForm((prev) => ({ ...prev, payment_method: e.target.value }))}
                      >
                        <option value="Kas Tunai">Kas Tunai</option>
                        <option value="Transfer Bank">Transfer Bank</option>
                        <option value="QRIS">QRIS</option>
                        <option value="Kartu Debit">Kartu Debit</option>
                      </select>
                    </div>
                    <div className="staff-field-group">
                      <label htmlFor="pay-merchant">Penerima / Vendor / Toko (Opsional)</label>
                      <input
                        id="pay-merchant"
                        type="text"
                        placeholder="Contoh: Toko ATK Sejahtera"
                        value={payForm.merchant}
                        onChange={(e) => setPayForm((prev) => ({ ...prev, merchant: e.target.value }))}
                      />
                    </div>
                    <div className="staff-field-group">
                      <label htmlFor="pay-desc">Keterangan Tambahan (Opsional)</label>
                      <input
                        id="pay-desc"
                        type="text"
                        placeholder="Catatan pembayaran"
                        value={payForm.description}
                        onChange={(e) => setPayForm((prev) => ({ ...prev, description: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="staff-modal-actions">
                    <button
                      type="button"
                      className="staff-button secondary"
                      onClick={() => setPayingRequest(null)}
                      disabled={paySaving}
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="staff-button success"
                      disabled={paySaving}
                    >
                      {paySaving ? 'Membukukan...' : 'Bukukan Pengeluaran (Potong Saldo)'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </StaffFrame>
    );
  }

  if (user?.role === 'owner') {
    return (
      <SupervisorFrame active="dashboard" unreadCount={unreadCount} onLogout={logoutUser}>
        <OwnerExecutiveDashboard
          dashboard={dashboard}
          period={period}
          onPeriodChange={setPeriod}
          reconciliations={reconciliations}
          notifications={notifications}
          error={error}
          loading={loading}
          onDownload={() => dashboard && downloadSummary(dashboard, period)}
        />
      </SupervisorFrame>
    );
  }

  return (
    <SupervisorFrame active="dashboard" unreadCount={unreadCount} onLogout={logoutUser}>
      <div className="supervisor-dashboard-content">
        <header className="supervisor-page-heading">
          <div>
            <span className="supervisor-eyebrow">{user?.role === 'owner' ? 'MONITORING KEUANGAN USAHA' : `${statusLabel} · MONITORING KEUANGAN`}</span>
            <h1>Ringkasan keuangan usaha</h1>
            <p>Saldo kas/rekening serta arus pemasukan dan pengeluaran.</p>
          </div>
          <div className="supervisor-page-actions">
            <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Pilih periode" />
          </div>
        </header>
        {error && <div className="supervisor-alert error" role="alert">{error}</div>}
        {loading && <div className="supervisor-alert" role="status">Memuat ringkasan...</div>}
        {summary && (
          <>
            <section className="dashboard-kpi-grid" aria-label="Ringkasan periode">
              <article className="dashboard-kpi"><span className="dashboard-kpi-label">Total saldo</span><strong>{currency(summary.total_balance)}</strong><small>{summary.wallet_count} sumber dana aktif</small></article>
              <article className="dashboard-kpi"><span className="dashboard-kpi-label">Pemasukan periode</span><strong>{currency(summary.income_total)}</strong><small>Uang yang benar-benar diterima</small></article>
              <article className="dashboard-kpi"><span className="dashboard-kpi-label">Pengeluaran periode</span><strong>{currency(summary.expense_total)}</strong><small>Transaksi yang sudah diposting</small></article>
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
                    <span><strong>{transaction.description || transaction.category || 'Transaksi'}</strong><small>{transaction.date} · {transaction.wallet ?? 'Kas gerai'}</small></span>
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
      </div>
    </SupervisorFrame>
  );
}

export default BusinessDashboard;
