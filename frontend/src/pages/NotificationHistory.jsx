import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import InsightsLayout from '../components/InsightsLayout';
import './NotificationHistory.css';

const notificationPresentation = {
  budget_warning: { label: 'Anggaran mendekati batas', category: 'budget', icon: '!', tone: 'warning' },
  budget_critical: { label: 'Anggaran kritis', category: 'budget', icon: '!', tone: 'critical' },
  budget_overbudget: { label: 'Anggaran terlampaui', category: 'budget', icon: '↗', tone: 'critical' },
  subscription_due: { label: 'Pengingat tagihan rutin', category: 'subscription', icon: '↻', tone: 'subscription' },
};

const emptySummary = {
  total: 0,
  unread_count: 0,
  budget_count: 0,
  subscription_count: 0,
};

const dateTimeLabel = (value) => {
  if (!value) return 'Waktu tidak tersedia';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const NotificationHistory = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const canViewBudgets = ['owner', 'supervisor'].includes(user?.role);
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [filters, setFilters] = useState({ category: 'all', status: 'all', search: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/notifications', {
          params: {
            page: currentPage,
            category: filters.category,
            status: filters.status,
            search: filters.search.trim() || undefined,
          },
          signal: controller.signal,
        });
        const paginated = response.data.data;
        setNotifications(paginated.data);
        setSummary(response.data.summary ?? {
          ...emptySummary,
          total: paginated.total,
          unread_count: response.data.unread_count,
        });
        setPagination({
          current_page: paginated.current_page,
          last_page: paginated.last_page,
          total: paginated.total,
        });
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message ?? 'Notifikasi gagal dimuat. Coba lagi.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, filters.search ? 250 : 0);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [currentPage, filters, refreshKey]);

  const updateFilter = (key, value) => {
    setCurrentPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleMarkRead = async (notification) => {
    setBusyId(notification.id);
    setActionError('');
    try {
      await api.post(`/notifications/${notification.id}/read`);
      setCurrentPage(1);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setActionError(requestError.response?.data?.message ?? 'Notifikasi gagal ditandai dibaca. Coba lagi.');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    setActionError('');
    try {
      await api.post('/notifications/read-all');
      setCurrentPage(1);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setActionError(requestError.response?.data?.message ?? 'Notifikasi gagal ditandai dibaca. Coba lagi.');
    } finally {
      setMarkingAll(false);
    }
  };

  const categoryTabs = [
    { value: 'all', label: 'Semua', count: summary.total },
    { value: 'budget', label: 'Anggaran', count: summary.budget_count },
    { value: 'subscription', label: 'Tagihan rutin', count: summary.subscription_count },
  ];

  return (
    <InsightsLayout
      active="notifications"
      title={isOwner ? 'Notifikasi & Peringatan' : 'Notifikasi Saya'}
      eyebrow={isOwner ? 'PEMANTAUAN OWNER' : 'PEMBARUAN AKUN'}
      unreadCount={summary.unread_count}
    >
      <div className="notification-page">
        <section className="notification-page-heading">
          <div>
            <p>Pantau peringatan anggaran dan pengingat tagihan rutin yang ditujukan ke akun Anda.</p>
          </div>
          <button
            type="button"
            className="notification-mark-all"
            onClick={handleMarkAllRead}
            disabled={!summary.unread_count || markingAll}
            title="Menandai semua notifikasi akun, bukan hanya hasil filter saat ini"
          >
            {markingAll ? 'Memperbarui...' : 'Tandai semua dibaca'}
          </button>
        </section>

        <section className="notification-scope-note" aria-label="Batas fungsi notifikasi">
          <strong>{isOwner ? 'Pemantauan Owner' : 'Notifikasi akun'}</strong>
          <p>
            {isOwner
              ? 'Daftar ini hanya memuat notifikasi akun Owner. Dari sini Owner dapat meninjau dan menandai notifikasi sebagai dibaca, bukan menyetujui atau menolak pengajuan.'
              : 'Daftar ini hanya memuat notifikasi akun Anda.'} Sistem saat ini memberi peringatan anggaran dan pengingat tagihan rutin; belum ada deteksi fraud POS atau pengiriman WhatsApp/Push.
          </p>
        </section>

        {error && (
          <div className="notification-message error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>Coba lagi</button>
          </div>
        )}
        {actionError && <div className="notification-message error" role="alert">{actionError}</div>}

        <section className="notification-summary" aria-label="Ringkasan notifikasi">
          <article>
            <span className="notification-summary-label">Belum dibaca</span>
            <strong>{summary.unread_count}</strong>
            <small>Perlu ditinjau</small>
          </article>
          <article>
            <span className="notification-summary-label">Peringatan anggaran</span>
            <strong>{summary.budget_count}</strong>
            <small>Semua status</small>
          </article>
          <article>
            <span className="notification-summary-label">Pengingat tagihan</span>
            <strong>{summary.subscription_count}</strong>
            <small>Semua status</small>
          </article>
          <article>
            <span className="notification-summary-label">Total notifikasi</span>
            <strong>{summary.total}</strong>
            <small>Untuk akun ini</small>
          </article>
        </section>

        <div className="notification-content-grid">
          <section className="notification-list-panel">
            <header className="notification-list-heading">
              <div>
                <span className="notification-eyebrow">RIWAYAT AKTIVITAS</span>
                <h2>Notifikasi akun</h2>
              </div>
              <span>{pagination.total} hasil</span>
            </header>

            <div className="notification-filters">
              <div className="notification-category-tabs" role="group" aria-label="Kategori notifikasi">
                {categoryTabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    aria-pressed={filters.category === tab.value}
                    className={filters.category === tab.value ? 'active' : ''}
                    onClick={() => updateFilter('category', tab.value)}
                  >
                    {tab.label}<span>{tab.count}</span>
                  </button>
                ))}
              </div>
              <div className="notification-filter-controls">
                <label className="notification-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={filters.search}
                    onChange={(event) => updateFilter('search', event.target.value)}
                    placeholder="Cari isi notifikasi..."
                    aria-label="Cari notifikasi"
                  />
                </label>
                <label className="notification-status-filter">
                  <span className="visually-hidden">Filter status</span>
                  <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
                    <option value="all">Semua status</option>
                    <option value="unread">Belum dibaca</option>
                    <option value="read">Sudah dibaca</option>
                  </select>
                </label>
              </div>
            </div>

            {loading ? (
              <p className="notification-empty" role="status">Memuat notifikasi...</p>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">
                <span aria-hidden="true">♧</span>
                <strong>{pagination.total === 0 ? 'Belum ada notifikasi' : 'Tidak ada hasil yang cocok'}</strong>
                <p>{pagination.total === 0
                  ? 'Peringatan anggaran dan pengingat tagihan rutin akan muncul di sini jika tersedia.'
                  : 'Coba ubah kategori, status, atau kata pencarian.'}
                </p>
              </div>
            ) : (
              <div className="notification-list" aria-busy={loading}>
                {notifications.map((notification) => {
                  const presentation = notificationPresentation[notification.type]
                    ?? { label: 'Pembaruan', category: null, icon: '•', tone: 'general' };
                  const destination = presentation.category === 'budget'
                    ? (canViewBudgets ? '/budgets' : null)
                    : presentation.category === 'subscription' ? '/subscriptions' : null;

                  return (
                    <article
                      className={`notification-item ${notification.read_at ? 'read' : 'unread'}`}
                      key={notification.id}
                    >
                      <span className={`notification-icon ${presentation.tone}`} aria-hidden="true">{presentation.icon}</span>
                      <div className="notification-content">
                        <div className="notification-item-title">
                          <strong>{presentation.label}</strong>
                          <span className={`notification-status-badge ${notification.read_at ? 'read' : 'unread'}`}>
                            {notification.read_at ? 'Dibaca' : 'Baru'}
                          </span>
                        </div>
                        <p>{notification.message}</p>
                        <time dateTime={notification.created_at}>{dateTimeLabel(notification.created_at)}</time>
                      </div>
                      <div className="notification-item-actions">
                        {destination && <Link to={destination}>Lihat terkait</Link>}
                        {!notification.read_at && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(notification)}
                            disabled={busyId === notification.id || markingAll}
                          >
                            {busyId === notification.id ? 'Menyimpan...' : 'Tandai dibaca'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {!loading && pagination.last_page > 1 && (
              <footer className="notification-pagination">
                <span>Halaman {pagination.current_page} dari {pagination.last_page}</span>
                <div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => page - 1)}
                    disabled={pagination.current_page <= 1}
                  >
                    Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => page + 1)}
                    disabled={pagination.current_page >= pagination.last_page}
                  >
                    Berikutnya
                  </button>
                </div>
              </footer>
            )}
          </section>

          <aside className="notification-sidebar">
            <section className="notification-side-card">
              <span className="notification-eyebrow">JENIS NOTIFIKASI</span>
              <h2>Yang dipantau sistem</h2>
              <div className="notification-type-row">
                <span className="notification-type-icon budget">↗</span>
                <span><strong>Anggaran</strong><small>Realisasi budget mendekati atau melewati batas.</small></span>
                <b>{summary.budget_count}</b>
              </div>
              <div className="notification-type-row">
                <span className="notification-type-icon subscription">↻</span>
                <span><strong>Tagihan rutin</strong><small>Pengingat jatuh tempo layanan yang dicatat.</small></span>
                <b>{summary.subscription_count}</b>
              </div>
            </section>

            <section className="notification-side-card">
              <span className="notification-eyebrow">TINDAKAN TERKAIT</span>
              <h2>Tinjau sumber informasi</h2>
              {canViewBudgets && <Link className="notification-related-link" to="/budgets">Anggaran &amp; realisasi <span>→</span></Link>}
              <Link className="notification-related-link" to="/subscriptions">Tagihan rutin <span>→</span></Link>
            </section>

            <section className="notification-boundary-card">
              <span aria-hidden="true">i</span>
              <div>
                <strong>Bukan kanal darurat</strong>
                <p>Notifikasi disimpan di aplikasi. Belum ada koneksi POS, deteksi fraud, WhatsApp, Web Push, atau persetujuan kas dari halaman ini.</p>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </InsightsLayout>
  );
};

export default NotificationHistory;
