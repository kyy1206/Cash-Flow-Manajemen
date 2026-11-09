import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import InsightsLayout from '../components/InsightsLayout';
import './NotificationHistory.css';

const notificationPresentation = {
  budget_warning: { label: 'Waspada', icon: '!' },
  budget_critical: { label: 'Kritis', icon: '!' },
  budget_overbudget: { label: 'Melebihi budget', icon: '↗' },
  subscription_due: { label: 'Tagihan subscription', icon: '↻' },
};

const dateTimeLabel = (value) => {
  if (!value) return 'Baru saja';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const NotificationHistory = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async (page = 1, signal) => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/notifications', { params: { page }, signal });
      const paginated = response.data.data;
      setNotifications(paginated.data);
      setUnreadCount(response.data.unread_count);
      setPagination({
        current_page: paginated.current_page,
        last_page: paginated.last_page,
        total: paginated.total,
      });
    } catch (requestError) {
      if (requestError.code !== 'ERR_CANCELED') {
        setError(requestError.response?.data?.message ?? 'Riwayat notifikasi gagal dimuat. Coba lagi.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchNotifications = async () => {
      setError('');
      try {
        const response = await api.get('/notifications', { params: { page: 1 }, signal: controller.signal });
        const paginated = response.data.data;
        setNotifications(paginated.data);
        setUnreadCount(response.data.unread_count);
        setPagination({
          current_page: paginated.current_page,
          last_page: paginated.last_page,
          total: paginated.total,
        });
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message ?? 'Riwayat notifikasi gagal dimuat. Coba lagi.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchNotifications();
    return () => controller.abort();
  }, []);

  const handleMarkRead = async (notification) => {
    setBusyId(notification.id);
    setActionError('');
    try {
      await api.post(`/notifications/${notification.id}/read`);
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
      )));
      setUnreadCount((count) => Math.max(0, count - 1));
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
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notification) => (
        notification.read_at ? notification : { ...notification, read_at: readAt }
      )));
      setUnreadCount(0);
    } catch (requestError) {
      setActionError(requestError.response?.data?.message ?? 'Notifikasi gagal ditandai dibaca. Coba lagi.');
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <InsightsLayout active="notifications" title="Riwayat Notifikasi" eyebrow="PEMBARUAN KEUANGAN" unreadCount={unreadCount}>
      <div className="notification-page">
        <section className="notification-summary">
          <div><span className="dashboard-eyebrow">SEMUA PEMBARUAN</span><strong>{pagination.total}</strong><small>notifikasi tersimpan</small></div>
          <div><span className="dashboard-eyebrow">BELUM DIBACA</span><strong>{unreadCount}</strong><small>notifikasi perlu ditinjau</small></div>
          <button type="button" className="notification-mark-all" onClick={handleMarkAllRead} disabled={!unreadCount || markingAll}>
            {markingAll ? 'Memperbarui...' : 'Tandai semua dibaca'}
          </button>
        </section>

        {error && <div className="dashboard-message error" role="alert">{error}<button type="button" onClick={() => loadNotifications(pagination.current_page)}>Coba lagi</button></div>}
        {actionError && <div className="dashboard-message error" role="alert">{actionError}</div>}

        <section className="notification-list-panel">
          <header className="notification-list-heading">
            <div><span className="dashboard-eyebrow">AKTIVITAS TERBARU</span><h2>Notifikasi Anda</h2></div>
            {!loading && <span>{pagination.total} total</span>}
          </header>
          {loading ? <p className="notification-empty" role="status">Memuat notifikasi...</p>
            : notifications.length === 0 ? (
              <div className="notification-empty"><span>♧</span><strong>Belum ada notifikasi</strong><p>Peringatan budget dan pengingat subscription akan muncul di sini.</p></div>
            ) : (
              <div className="notification-list">
                {notifications.map((notification) => {
                  const presentation = notificationPresentation[notification.type] ?? { label: 'Pembaruan', icon: '•' };
                  return (
                    <article className={`notification-item ${notification.read_at ? 'read' : 'unread'}`} key={notification.id}>
                      <span className={`notification-icon ${notification.type ?? ''}`} aria-hidden="true">{presentation.icon}</span>
                      <div className="notification-content">
                        <div className="notification-item-title"><strong>{presentation.label}</strong>{!notification.read_at && <span>Baru</span>}</div>
                        <p>{notification.message}</p>
                        <time dateTime={notification.created_at}>{dateTimeLabel(notification.created_at)}</time>
                      </div>
                      {!notification.read_at && (
                        <button type="button" className="notification-read-button" onClick={() => handleMarkRead(notification)} disabled={busyId === notification.id}>
                          {busyId === notification.id ? 'Menyimpan...' : 'Tandai dibaca'}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          {!loading && pagination.total > 30 && (
            <footer className="notification-pagination">
              <span>Halaman {pagination.current_page} dari {pagination.last_page}</span>
              <div>
                <button type="button" onClick={() => loadNotifications(pagination.current_page - 1)} disabled={pagination.current_page <= 1}>Sebelumnya</button>
                <button type="button" onClick={() => loadNotifications(pagination.current_page + 1)} disabled={pagination.current_page >= pagination.last_page}>Berikutnya</button>
              </div>
            </footer>
          )}
        </section>
      </div>
    </InsightsLayout>
  );
};

export default NotificationHistory;
