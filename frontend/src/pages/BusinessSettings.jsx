import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import SupervisorFrame from '../components/SupervisorFrame';
import './BusinessSettings.css';

const currency = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const errorMessage = (error) => Object.values(error?.response?.data?.errors ?? {})[0]?.[0]
  ?? error?.response?.data?.message
  ?? 'Pengaturan gagal disimpan. Coba lagi.';

const BusinessSettings = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [businessSettings, setBusinessSettings] = useState(null);
  const [businessName, setBusinessName] = useState('');
  const [approvalThreshold, setApprovalThreshold] = useState('');
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadSettings = async () => {
      setLoading(true);
      setError('');
      try {
        const [settingsResponse, categoriesResponse, usersResponse, requestsResponse] = await Promise.all([
          api.get('/business-settings', { signal: controller.signal }),
          api.get('/categories', { signal: controller.signal }),
          api.get('/users', { signal: controller.signal }),
          api.get('/expense-requests', { params: { status: 'pending' }, signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        const settings = settingsResponse.data.data;
        setBusinessSettings(settings);
        setBusinessName(settings.business_name ?? '');
        setApprovalThreshold(settings.approval_threshold ?? '');
        setCategories(categoriesResponse.data.data ?? []);
        setUsers(usersResponse.data.data ?? []);
        setPendingRequestCount(requestsResponse.data.summary?.pending_count ?? 0);
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message ?? 'Pengaturan dan ringkasan kebijakan gagal dimuat.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadSettings();
    return () => controller.abort();
  }, [refresh]);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense'),
    [categories],
  );
  const approvalCategories = useMemo(
    () => expenseCategories.filter((category) => category.requires_approval),
    [expenseCategories],
  );
  const activeSupervisors = useMemo(
    () => users.filter((user) => user.role === 'supervisor' && user.is_active).length,
    [users],
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.put('/business-settings', {
        business_name: businessName.trim(),
        approval_threshold: approvalThreshold === '' ? null : Number(approvalThreshold),
      });
      setBusinessSettings(response.data.data);
      setBusinessName(response.data.data.business_name ?? '');
      setApprovalThreshold(response.data.data.approval_threshold ?? '');
      setNotice('Pengaturan tersimpan. Perubahan yang benar-benar terjadi dicatat pada Audit Trail.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SupervisorFrame active="settings" onLogout={handleLogout}>
      <div className="business-settings-page">
        <section className="business-settings-heading">
          <div>
            <div className="business-settings-breadcrumb"><span>SISTEM</span><b>/</b><strong>PENGATURAN &amp; APPROVAL</strong><span>MODE OWNER</span></div>
            <h1>Kontrol Usaha &amp; Approval</h1>
            <p>Kelola identitas usaha, tetapkan aturan pengajuan, lalu pantau kesiapan tim dan pekerjaan yang menunggu keputusan.</p>
          </div>
          <Link className="settings-history-link" to="/audit">Riwayat perubahan aturan <span aria-hidden="true">→</span></Link>
        </section>

        {error && <div className="business-settings-message error" role="alert">{error}<button type="button" onClick={() => setRefresh((value) => value + 1)}>Coba lagi</button></div>}
        {notice && <div className="business-settings-message success" role="status">{notice}</div>}
        {loading && <div className="business-settings-loading" role="status">Memuat kebijakan usaha...</div>}

        {!loading && businessSettings && (
          <>
            <section className="business-settings-metrics" aria-label="Ringkasan kebijakan">
              <article><span>Ambang approval Staff</span><strong>{businessSettings?.approval_threshold ? currency(businessSettings.approval_threshold) : 'Tidak disetel'}</strong><small>Pengeluaran Staff pada atau di atas ambang harus diajukan.</small></article>
              <article><span>Kategori wajib approval</span><strong>{approvalCategories.length}</strong><small>Aturan kategori tetap berlaku tanpa ambang nominal.</small></article>
              <article><span>Supervisor aktif</span><strong>{activeSupervisors}</strong><small>Supervisor memutuskan pengajuan masuk.</small></article>
              <article><span>Pengajuan menunggu</span><strong>{pendingRequestCount}</strong><small>Perlu ditinjau oleh Supervisor.</small></article>
            </section>

            <section className="business-settings-notice">
              <span aria-hidden="true">i</span>
              <div><strong>Aturan keputusan dalam usaha</strong><p>Owner mengatur identitas dan ambang pengajuan. Pengeluaran Staff wajib diajukan jika memenuhi ambang nominal atau aturan kategori; Supervisor yang memutuskan, sedangkan Owner memantau aktivitas usaha.</p></div>
            </section>

            <div className="business-settings-main-grid">
              <section className="business-settings-card">
                <header><span className="settings-section-icon" aria-hidden="true">⚙</span><div><h2>Identitas usaha &amp; ambang pengajuan</h2><p>Nilai ini diterapkan untuk usaha yang sedang dipilih.</p></div></header>
                <form onSubmit={saveSettings}>
                  <label className="settings-field"><span>Nama usaha</span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} maxLength="255" required /></label>
                  <label className="settings-field"><span>Ambang nominal pengajuan (Rp)</span><input type="number" min="0.01" max="9999999999999.99" step="0.01" value={approvalThreshold} onChange={(event) => setApprovalThreshold(event.target.value)} placeholder="Kosongkan untuk menonaktifkan ambang nominal" /><small>Jika kosong, kategori yang ditandai wajib approval tetap mengharuskan pengajuan.</small></label>
                  <div className="business-settings-form-footer"><span>Perubahan dicatat di Audit Trail saat nilainya berubah.</span><button type="submit" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan pengaturan'}</button></div>
                </form>
              </section>

              <section className="business-settings-card business-settings-categories">
                <header><span className="settings-section-icon" aria-hidden="true">▦</span><div><h2>Aturan approval per kategori</h2><p>Kategori pengeluaran tertentu dapat selalu mewajibkan pengajuan.</p></div></header>
                {approvalCategories.length ? (
                  <ul>{approvalCategories.slice(0, 5).map((category) => <li key={category.id}><span>{category.name}</span><b>Wajib pengajuan</b></li>)}</ul>
                ) : <p className="settings-empty">Belum ada kategori pengeluaran yang ditandai wajib approval.</p>}
                <Link to="/categories" className="settings-text-link">Kelola kategori arus kas <span aria-hidden="true">→</span></Link>
              </section>
            </div>

            <section className="business-settings-owner-panel">
              <header><div><span className="settings-eyebrow">TATA KELOLA USAHA</span><h2>Pembagian kewenangan</h2><p>Pengaturan ini menjaga keputusan pengeluaran tetap terpisah dari pemantauan Owner.</p></div></header>
              <div className="settings-role-grid">
                <article className="settings-role-owner"><span>OWNER</span><h3>Atur &amp; pantau</h3><p>Kelola identitas usaha dan ambang pengajuan, atur kategori, serta pantau pengajuan dan riwayat perubahan.</p><Link to="/audit">Buka Audit Trail <b aria-hidden="true">→</b></Link></article>
                <article className="settings-role-supervisor"><span>SUPERVISOR</span><h3>Tinjau pengajuan</h3><p>Menyetujui atau menolak pengajuan Staff dengan catatan keputusan. Hak keputusan ini tidak diubah dari pengaturan Owner.</p><Link to="/requests">Lihat pengajuan <b aria-hidden="true">→</b></Link></article>
                <article className="settings-role-staff"><span>STAFF</span><h3>Ajukan &amp; catat pembayaran</h3><p>Mengajukan pengeluaran yang terkena aturan dan mencatat pembayaran setelah disetujui.</p><Link to="/users">Kelola pengguna <b aria-hidden="true">→</b></Link></article>
              </div>
            </section>
          </>
        )}
      </div>
    </SupervisorFrame>
  );
};

export default BusinessSettings;
