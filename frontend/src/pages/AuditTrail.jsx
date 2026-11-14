import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import SupervisorFrame from '../components/SupervisorFrame';
import './AuditTrail.css';

const emptyFilters = { search: '', action: '', date_from: '', date_to: '' };
const moduleLabels = {
  transaction: 'Transaksi',
  expense_request: 'Pengajuan & approval',
  wallet: 'Kas & rekening',
  debt: 'Utang & piutang',
  reconciliation: 'Rekonsiliasi',
  user: 'Pengguna',
  business_setting: 'Pengaturan usaha',
};
const actionLabels = {
  'transaction.posted': 'Transaksi diposting',
  'transaction.reversed': 'Transaksi dikoreksi',
  'expense_request.created': 'Pengajuan dibuat',
  'expense_request.approved': 'Pengajuan disetujui',
  'expense_request.rejected': 'Pengajuan ditolak',
  'expense_request.paid': 'Pengajuan dibayar',
  'wallet.created': 'Sumber dana dibuat',
  'wallet.updated': 'Sumber dana diperbarui',
  'debt.created': 'Utang/piutang dicatat',
  'debt.settled': 'Utang/piutang dilunasi',
  'reconciliation.created': 'Rekonsiliasi diajukan',
  'reconciliation.reviewed': 'Rekonsiliasi direview',
  'business_setting.updated': 'Kebijakan usaha diperbarui',
  'user.created': 'Akun dibuat',
  'user.updated': 'Akun diperbarui',
};

const dateTimeLabel = (value) => {
  if (!value) return 'Waktu tidak tersedia';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Waktu tidak tersedia'
    : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
};

const logModule = (action = '') => String(action).split('.')[0];
const moduleLabel = (module) => moduleLabels[module] ?? 'Aktivitas lainnya';
const actionLabel = (action) => actionLabels[action] ?? String(action || 'Aktivitas tidak diketahui').replaceAll('.', ' ');
const referenceLabel = (log) => `${log.auditable_type ? String(log.auditable_type).split(/[\\/.]/).pop() : 'Log'}${log.auditable_id ? ` #${log.auditable_id}` : ''}`;

const AuditTrail = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [actions, setActions] = useState([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [pagination, setPagination] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [perPage, setPerPage] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadLogs = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {
          page: pagination.current_page,
          per_page: perPage,
          ...Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value)),
        };
        const response = await api.get('/audit-logs', { params, signal: controller.signal });
        const paginated = response.data.data;
        setLogs(paginated.data);
        setPagination({
          current_page: paginated.current_page,
          last_page: paginated.last_page,
          total: paginated.total,
        });
        setSummary(response.data.summary);
        setActions(response.data.action_options ?? []);
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message ?? 'Audit trail gagal dimuat. Coba muat ulang.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadLogs();
    return () => controller.abort();
  }, [appliedFilters, pagination.current_page, perPage, refresh]);

  useEffect(() => {
    if (!selectedLog) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedLog(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedLog]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const applyFilters = (event) => {
    event.preventDefault();
    setPagination((current) => ({ ...current, current_page: 1 }));
    setAppliedFilters({ ...filters });
  };

  const resetFilters = () => {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setPagination((current) => ({ ...current, current_page: 1 }));
  };

  const exportLogs = async (format) => {
    setExporting(format);
    setError('');
    try {
      const params = {
        format,
        ...Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value)),
      };
      const response = await api.get('/audit-logs/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-trail-${new Date().toISOString().replaceAll(':', '-').slice(0, 19)}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? `Ekspor ${format.toUpperCase()} gagal. Coba lagi.`);
    } finally {
      setExporting('');
    }
  };

  const firstItem = pagination.total === 0 ? 0 : (pagination.current_page - 1) * perPage + 1;
  const lastItem = Math.min(pagination.current_page * perPage, pagination.total);

  return (
    <SupervisorFrame active="audit" onLogout={handleLogout}>
      <div className="audit-page">
        <section className="audit-heading">
          <div>
            <div className="audit-breadcrumb"><span>MANAJEMEN &amp; KONTROL</span><b>/</b><strong>AUDIT TRAIL</strong><span className="audit-owner-pill">MODE OWNER</span></div>
            <h1>Audit Trail &amp; Riwayat Aktivitas</h1>
            <p>Telusuri aktivitas keuangan dan perubahan yang dicatat sistem, termasuk aktor, waktu, alamat IP, dan rincian sebelum/sesudah bila tersedia.</p>
          </div>
          <div className="audit-heading-actions">
            <button type="button" className="audit-button secondary" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>↻ Muat ulang</button>
            <button type="button" className="audit-button secondary" onClick={() => window.print()}>Cetak / Simpan PDF</button>
            <button type="button" className="audit-button secondary" onClick={() => exportLogs('json')} disabled={Boolean(exporting)}>{exporting === 'json' ? 'Mengekspor...' : 'Ekspor JSON'}</button>
            <button type="button" className="audit-button primary" onClick={() => exportLogs('csv')} disabled={Boolean(exporting)}>{exporting === 'csv' ? 'Mengekspor...' : 'Ekspor CSV'}</button>
          </div>
        </section>

        {error && <div className="audit-message" role="alert">{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}>Coba lagi</button></div>}

        <section className="audit-summary-grid" aria-label="Ringkasan audit">
          <article className="audit-summary-card">
            <span>Total catatan audit</span><strong>{summary?.total_count ?? '—'}</strong><small>Catatan yang tersimpan untuk usaha ini</small>
          </article>
          <article className="audit-summary-card">
            <span>Aktivitas 30 hari terakhir</span><strong>{summary?.last_30_days ?? '—'}</strong><small>Jumlah log pada rentang 30 hari</small>
          </article>
          <article className="audit-summary-card">
            <span>Aktor tercatat</span><strong>{summary?.actors_last_30_days ?? '—'}</strong><small>Pengguna berbeda dalam 30 hari</small>
          </article>
          <article className="audit-summary-card">
            <span>Modul dengan aktivitas</span><strong>{summary?.modules_last_30_days ?? '—'}</strong><small>Modul dengan log dalam 30 hari</small>
          </article>
        </section>

        <section className="audit-integrity-note">
          <span aria-hidden="true">i</span>
          <div><strong>Catatan cakupan dan integritas</strong><p>Daftar ini memuat aktivitas yang saat ini direkam aplikasi. Sistem belum memakai hash chain SHA-256 atau penyimpanan WORM; informasi perangkat, laci POS, dan notifikasi WhatsApp/Telegram juga tidak tersedia di log ini.</p></div>
        </section>

        <section className="audit-activity-panel">
          <header><div><span className="audit-eyebrow">RINGKASAN 30 HARI</span><h2>Distribusi aktivitas tercatat</h2></div><span>{summary?.last_30_days ?? 0} catatan</span></header>
          {summary?.modules?.length ? (
            <div className="audit-module-list">
              {summary.modules.map((module) => {
                const percent = summary.last_30_days ? Math.round((module.count / summary.last_30_days) * 100) : 0;
                return (
                  <div className="audit-module-row" key={module.module}>
                    <div><span>{module.label}</span><strong>{module.count} <small>({percent}%)</small></strong></div>
                    <span className="audit-module-track"><i style={{ width: `${percent}%` }} /></span>
                  </div>
                );
              })}
            </div>
          ) : <p className="audit-empty-summary">Belum ada aktivitas yang tercatat dalam 30 hari terakhir.</p>}
        </section>

        <section className="audit-log-panel">
          <header className="audit-log-heading">
            <div><span className="audit-eyebrow">RIWAYAT USAHA</span><h2>Kronologis aktivitas &amp; perubahan</h2><p>Pencarian dan filter diterapkan pada data usaha Anda.</p></div>
            <label className="audit-per-page">Baris
              <select value={perPage} onChange={(event) => {
                setPerPage(Number(event.target.value));
                setPagination((current) => ({ ...current, current_page: 1 }));
              }}>
                <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
              </select>
            </label>
          </header>

          <form className="audit-filters" onSubmit={applyFilters}>
            <label className="audit-search-field"><span>Cari aktivitas, aktor, peran, atau IP</span><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} maxLength="100" placeholder="Contoh: pengajuan, Supervisor..." /></label>
            <label><span>Jenis aksi</span><select value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))}><option value="">Semua aksi</option>{actions.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}</select></label>
            <label><span>Dari tanggal</span><input type="date" value={filters.date_from} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} /></label>
            <label><span>Sampai tanggal</span><input type="date" min={filters.date_from || undefined} value={filters.date_to} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} /></label>
            <div className="audit-filter-actions"><button className="audit-button primary" type="submit">Terapkan</button><button className="audit-button secondary" type="button" onClick={resetFilters}>Reset</button></div>
          </form>

          <div className="audit-table-scroll">
            <table className="audit-table">
              <thead><tr><th>Waktu &amp; ID log</th><th>Aktor &amp; IP</th><th>Modul &amp; aksi</th><th>Rincian aktivitas</th><th>Perubahan</th><th /></tr></thead>
              <tbody>
                {loading ? <tr><td className="audit-table-state" colSpan="6" role="status">Memuat riwayat audit...</td></tr>
                  : logs.length === 0 ? <tr><td className="audit-table-state" colSpan="6">Tidak ada log yang cocok dengan filter.</td></tr>
                    : logs.map((log) => {
                      const module = logModule(log.action);
                      return (
                        <tr key={log.id}>
                          <td><time dateTime={log.created_at}>{dateTimeLabel(log.created_at)}</time><code>LOG-{String(log.id).padStart(6, '0')}</code></td>
                          <td><strong>{log.user?.name ?? 'Sistem / akun tidak tersedia'}</strong><span className="audit-role">{log.user?.role ?? 'Sistem'}</span><small>{log.ip_address || 'Alamat IP tidak tersedia'}</small></td>
                          <td><span className={`audit-module-pill module-${module}`}>{moduleLabel(module)}</span><small>{actionLabel(log.action)}</small></td>
                          <td><strong>{log.description || 'Tidak ada deskripsi'}</strong>{(log.old_values || log.new_values) && <small>{referenceLabel(log)}</small>}</td>
                          <td>{log.old_values || log.new_values ? <span className="audit-change-available">Ada rincian</span> : <span className="audit-change-missing">Tidak tersedia</span>}</td>
                          <td><button className="audit-inspect-button" type="button" onClick={() => setSelectedLog(log)}>Detail</button></td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>

          <footer className="audit-pagination">
            <span>Menampilkan {firstItem}–{lastItem} dari {pagination.total} catatan</span>
            <div><button type="button" onClick={() => setPagination((current) => ({ ...current, current_page: current.current_page - 1 }))} disabled={loading || pagination.current_page <= 1}>Sebelumnya</button><span>Halaman {pagination.current_page} / {pagination.last_page}</span><button type="button" onClick={() => setPagination((current) => ({ ...current, current_page: current.current_page + 1 }))} disabled={loading || pagination.current_page >= pagination.last_page}>Berikutnya</button></div>
          </footer>
        </section>
      </div>

      {selectedLog && (
        <div className="audit-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedLog(null);
        }}>
          <section className="audit-modal" role="dialog" aria-modal="true" aria-labelledby="audit-modal-title">
            <header><div><span className="audit-eyebrow">RINCIAN CATATAN</span><h2 id="audit-modal-title">Log-{String(selectedLog.id).padStart(6, '0')}</h2></div><button type="button" onClick={() => setSelectedLog(null)} aria-label="Tutup detail">×</button></header>
            <dl className="audit-detail-grid">
              <div><dt>Waktu</dt><dd>{dateTimeLabel(selectedLog.created_at)}</dd></div>
              <div><dt>Aktor</dt><dd>{selectedLog.user?.name ?? 'Sistem / akun tidak tersedia'} · {selectedLog.user?.role ?? 'Sistem'}</dd></div>
              <div><dt>Jenis aksi</dt><dd>{actionLabel(selectedLog.action)}</dd></div>
              <div><dt>Alamat IP</dt><dd>{selectedLog.ip_address || 'Tidak tersedia'}</dd></div>
              <div><dt>Referensi data</dt><dd>{referenceLabel(selectedLog)}</dd></div>
              <div><dt>Deskripsi</dt><dd>{selectedLog.description || 'Tidak tersedia'}</dd></div>
            </dl>
            <div className="audit-values-grid">
              <section><h3>Nilai sebelum</h3><pre>{selectedLog.old_values ? JSON.stringify(selectedLog.old_values, null, 2) : 'Data sebelum tidak direkam untuk aktivitas ini.'}</pre></section>
              <section><h3>Nilai sesudah</h3><pre>{selectedLog.new_values ? JSON.stringify(selectedLog.new_values, null, 2) : 'Data sesudah tidak direkam untuk aktivitas ini.'}</pre></section>
            </div>
            <footer><button type="button" className="audit-button primary" onClick={() => setSelectedLog(null)}>Tutup</button></footer>
          </section>
        </div>
      )}
    </SupervisorFrame>
  );
};

export default AuditTrail;
