import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import './UserManagement.css';

const roles = {
  owner: 'Owner',
  supervisor: 'Supervisor',
  staff: 'Staff',
};
const pageSize = 8;

const getErrorMessage = (requestError, fallback) => {
  const validationErrors = requestError.response?.data?.errors;
  return validationErrors
    ? Object.values(validationErrors).flat()[0]
    : requestError.response?.data?.message ?? fallback;
};

const formatCurrency = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value ?? 0));

const formatDate = (value) => {
  if (!value) return 'Tanggal tidak tersedia';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Tanggal tidak tersedia'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
};

const initials = (name = '') => name
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0]?.toLocaleUpperCase('id-ID'))
  .join('') || '?';

const exportUsers = (users) => {
  const headers = ['ID', 'Nama', 'Email', 'Peran', 'Status', 'Dibuat'];
  const rows = users.map((account) => [
    account.id,
    account.name,
    account.email,
    roles[account.role] ?? account.role,
    account.is_active ? 'Aktif' : 'Nonaktif',
    account.created_at ?? '',
  ]);
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `daftar-pengguna-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const UserEditor = ({ account, saving, error, onClose, onSubmit }) => {
  const [name, setName] = useState(account?.name ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [role, setRole] = useState(account?.role ?? 'staff');
  const [password, setPassword] = useState('');
  const isNew = !account;

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      role,
      ...(password ? { password } : {}),
    });
  };

  return (
    <div
      className="users-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="users-modal" role="dialog" aria-modal="true" aria-labelledby="user-editor-title">
        <header className="users-modal-header">
          <div>
            <span className="users-eyebrow">MANAJEMEN AKUN USAHA</span>
            <h2 id="user-editor-title">{isNew ? 'Tambah pengguna' : 'Ubah akun pengguna'}</h2>
            <p>{isNew
              ? 'Buat akun Supervisor atau Staff dengan password awal.'
              : 'Perbarui identitas, peran, atau reset password pengguna.'}</p>
          </div>
          <button type="button" className="users-close-button" onClick={onClose} disabled={saving} aria-label="Tutup form">×</button>
        </header>
        {error && <div className="users-message error" role="alert">{error}</div>}
        <form className="users-form" onSubmit={submit}>
          <label>
            Nama pengguna
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} autoComplete="name" required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={255} autoComplete="email" required />
          </label>
          <label>
            Peran
            <select value={role} onChange={(event) => setRole(event.target.value)} required>
              <option value="staff">Staff</option>
              <option value="supervisor">Supervisor</option>
            </select>
            <small>Akun Owner dikelola terpisah dan tidak dapat dibuat dari halaman ini.</small>
          </label>
          <label>
            {isNew ? 'Password awal' : 'Reset password (opsional)'}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              autoComplete={isNew ? 'new-password' : 'new-password'}
              required={isNew}
              placeholder={isNew ? 'Minimal 8 karakter' : 'Kosongkan jika tidak ingin mengganti'}
            />
            <small>{isNew ? 'Password minimal 8 karakter.' : 'Password yang diisi akan menggantikan password saat ini.'}</small>
          </label>
          <footer className="users-modal-actions">
            <button type="button" className="users-button secondary" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="users-button primary" disabled={saving}>
              {saving ? 'Menyimpan...' : isNew ? 'Buat akun' : 'Simpan perubahan'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

const UserManagement = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [businessSettings, setBusinessSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [notice, setNotice] = useState('');
  const [editorError, setEditorError] = useState('');
  const [editingAccount, setEditingAccount] = useState(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const loadPage = async () => {
      setLoading(true);
      setError('');
      setSettingsError('');
      try {
        const [usersResult, settingsResult] = await Promise.allSettled([
          api.get('/users', { signal: controller.signal }),
          api.get('/business-settings', { signal: controller.signal }),
        ]);
        if (!active) return;
        if (usersResult.status === 'rejected') throw usersResult.reason;
        setUsers(usersResult.value.data.data);
        if (settingsResult.status === 'fulfilled') {
          setBusinessSettings(settingsResult.value.data.data);
        } else {
          setBusinessSettings(null);
          setSettingsError(settingsResult.reason.response?.data?.message ?? 'Pengaturan ambang approval tidak dapat dimuat.');
        }
      } catch (requestError) {
        if (active && requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message ?? 'Daftar pengguna gagal dimuat. Coba muat ulang halaman.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadPage();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshKey]);

  const activeUsers = users.filter((account) => account.is_active);
  const inactiveCount = users.length - activeUsers.length;
  const supervisors = users.filter((account) => account.role === 'supervisor');
  const staff = users.filter((account) => account.role === 'staff');
  const hasThreshold = businessSettings?.approval_threshold !== null
    && businessSettings?.approval_threshold !== undefined;
  const thresholdLabel = settingsError
    ? 'Tidak dapat dimuat'
    : hasThreshold
      ? formatCurrency(businessSettings.approval_threshold)
      : 'Belum diatur';

  const filteredUsers = useMemo(() => {
    const searchText = query.trim().toLocaleLowerCase('id-ID');
    return users
      .filter((account) => roleFilter === 'all' || account.role === roleFilter)
      .filter((account) => statusFilter === 'all'
        || (statusFilter === 'active' && account.is_active)
        || (statusFilter === 'inactive' && !account.is_active))
      .filter((account) => !searchText || [
        account.id,
        account.name,
        account.email,
        roles[account.role] ?? account.role,
      ].join(' ').toLocaleLowerCase('id-ID').includes(searchText))
      .sort((left, right) => {
        const roleOrder = { owner: 0, supervisor: 1, staff: 2 };
        return (roleOrder[left.role] ?? 3) - (roleOrder[right.role] ?? 3)
          || left.name.localeCompare(right.name, 'id');
      });
  }, [users, query, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstUser = filteredUsers.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastUser = Math.min(currentPage * pageSize, filteredUsers.length);

  const closeEditor = () => {
    if (!saving) {
      setEditingAccount(null);
      setCreating(false);
      setEditorError('');
    }
  };

  const openCreateEditor = () => {
    setEditorError('');
    setCreating(true);
  };

  const openEditEditor = (account) => {
    setEditorError('');
    setEditingAccount(account);
  };

  const saveAccount = async (values) => {
    setSaving(true);
    setEditorError('');
    setError('');
    setNotice('');
    try {
      if (editingAccount) {
        await api.patch(`/users/${editingAccount.id}`, values);
        setNotice('Akun pengguna berhasil diperbarui.');
      } else {
        await api.post('/users', values);
        setNotice('Akun pengguna berhasil dibuat.');
      }
      setEditingAccount(null);
      setCreating(false);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setEditorError(getErrorMessage(requestError, 'Perubahan akun gagal disimpan.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleAccount = async (account) => {
    const nextActive = !account.is_active;
    const confirmation = nextActive
      ? `Aktifkan kembali akun ${account.name}?`
      : `Nonaktifkan akun ${account.name}? Pengguna tidak dapat login kembali. Sesi yang sudah terbuka tidak diputus oleh sistem.`;
    if (!window.confirm(confirmation)) return;

    setError('');
    setNotice('');
    setSavingUserId(account.id);
    try {
      await api.patch(`/users/${account.id}`, { is_active: nextActive });
      setNotice(`Akun ${account.name} berhasil ${nextActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Status akun gagal diperbarui.'));
    } finally {
      setSavingUserId(null);
    }
  };

  const canManageAccount = (account) => account.role !== 'owner' && String(account.id) !== String(user?.id);

  return (
    <div className="owner-module-content users-workspace">
      <div className="owner-module-main users-page">
        <header className="users-page-header">
          <div>
            <div className="users-breadcrumb">
              <span>MANAJEMEN &amp; KONTROL</span><i>/</i><strong>PENGGUNA &amp; STAF</strong>
              <span className="users-mode-badge">MODE OWNER</span>
            </div>
            <h1>Manajemen Pengguna, Staf &amp; Hak Akses</h1>
            <p>Kelola akun dan peran Owner, Supervisor, serta Staff. Hak akses mengikuti aturan peran yang ditetapkan sistem.</p>
          </div>
          <div className="users-header-actions">
            <Link to="/audit" className="users-button secondary"><span aria-hidden="true">◷</span> Audit Trail</Link>
            <button type="button" className="users-button secondary" onClick={() => exportUsers(users)} disabled={!users.length || loading}>
              <span aria-hidden="true">⇩</span> Ekspor daftar (.CSV)
            </button>
            <button type="button" className="users-button primary" onClick={openCreateEditor}>
              <span aria-hidden="true">＋</span> Tambah pengguna
            </button>
          </div>
        </header>

        {error && <div className="users-message error" role="alert">{error}</div>}
        {notice && <div className="users-message success" role="status">{notice}</div>}
        {loading && <div className="users-loading" role="status">Memuat daftar pengguna...</div>}

        {!loading && !error && (
          <>
            <section className="users-metrics" aria-label="Ringkasan pengguna">
              <article className="users-metric">
                <div className="users-metric-label"><span>Akun aktif</span><i aria-hidden="true">◎</i></div>
                <strong>{activeUsers.length}<small> / {users.length}</small></strong>
                <span className="users-metric-foot">{inactiveCount} akun nonaktif</span>
              </article>
              <article className="users-metric">
                <div className="users-metric-label"><span>Supervisor</span><i aria-hidden="true">◈</i></div>
                <strong>{supervisors.length}</strong>
                <span className="users-metric-foot">{supervisors.filter((account) => account.is_active).length} akun aktif</span>
              </article>
              <article className="users-metric">
                <div className="users-metric-label"><span>Staff</span><i aria-hidden="true">⌑</i></div>
                <strong>{staff.length}</strong>
                <span className="users-metric-foot">{staff.filter((account) => account.is_active).length} akun aktif</span>
              </article>
              <article className="users-metric">
                <div className="users-metric-label"><span>Ambang approval usaha</span><i aria-hidden="true">✓</i></div>
                <strong className="threshold">{thresholdLabel}</strong>
                <span className="users-metric-foot">{hasThreshold ? 'Pengeluaran staff pada atau di atas ambang perlu pengajuan' : 'Kategori wajib approval tetap mengikuti pengajuan'}</span>
              </article>
            </section>

            <section className="users-security-banner">
              <span className="users-security-icon" aria-hidden="true">⌑</span>
              <div>
                <div className="users-security-heading">
                  <h2>Pemisahan kewenangan berbasis peran</h2>
                  <span>ATURAN SERVER</span>
                </div>
                <p>
                  Hanya Owner yang dapat mengelola akun dan pengaturan usaha. Supervisor memutuskan pengajuan; Staff mengajukan pengeluaran.
                  Sistem tidak menyediakan data PIN, perangkat, atau sesi aktif pada halaman ini.
                </p>
              </div>
              <Link to="/settings" className="users-security-link">Pengaturan usaha <span aria-hidden="true">→</span></Link>
            </section>

            {settingsError && <div className="users-message warning" role="status">{settingsError}</div>}

            <section className="users-directory">
              <header className="users-directory-header">
                <div>
                  <span className="users-eyebrow">DIREKTORI PENGGUNA USAHA</span>
                  <h2>Daftar akun &amp; peran</h2>
                  <p>Akun Owner bersifat terlindungi. Akun yang masih memiliki sesi aktif tidak otomatis dikeluarkan saat dinonaktifkan.</p>
                </div>
                <span className="users-count-badge">{filteredUsers.length} akun cocok</span>
              </header>

              <div className="users-filter-bar">
                <div className="users-role-tabs" role="group" aria-label="Filter peran pengguna">
                  {[
                    ['all', `Semua (${users.length})`],
                    ['owner', `Owner (${users.filter((account) => account.role === 'owner').length})`],
                    ['supervisor', `Supervisor (${supervisors.length})`],
                    ['staff', `Staff (${staff.length})`],
                  ].map(([filter, label]) => (
                    <button
                      type="button"
                      key={filter}
                      className={roleFilter === filter ? 'active' : ''}
                      aria-pressed={roleFilter === filter}
                      onClick={() => {
                        setRoleFilter(filter);
                        setPage(1);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="users-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Cari nama, email, ID, atau peran..."
                    aria-label="Cari pengguna"
                  />
                </label>
                <label className="users-status-filter">
                  <span className="users-sr-only">Filter status akun</span>
                  <select value={statusFilter} onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}>
                    <option value="all">Semua status</option>
                    <option value="active">Akun aktif</option>
                    <option value="inactive">Akun nonaktif</option>
                  </select>
                </label>
              </div>

              <div className="users-table-scroll">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th scope="col">Nama &amp; identitas</th>
                      <th scope="col">Peran</th>
                      <th scope="col">Akun dibuat</th>
                      <th scope="col">Status akun</th>
                      <th scope="col" className="users-actions-heading">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((account) => (
                      <tr key={account.id} className={!account.is_active ? 'inactive' : ''}>
                        <td>
                          <div className="users-identity">
                            <span className={`users-avatar ${account.role}`}>{initials(account.name)}</span>
                            <span>
                              <strong>{account.name}{String(account.id) === String(user?.id) ? ' (Anda)' : ''}</strong>
                              <small>ID #{account.id} · {account.email}</small>
                            </span>
                          </div>
                        </td>
                        <td><span className={`users-role-badge ${account.role}`}>{roles[account.role] ?? account.role}</span></td>
                        <td className="users-date-cell">{formatDate(account.created_at)}</td>
                        <td><span className={`users-status-badge ${account.is_active ? 'active' : 'inactive'}`}>{account.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                        <td>
                          <div className="users-row-actions">
                            {canManageAccount(account) ? (
                              <>
                                <button type="button" onClick={() => openEditEditor(account)} aria-label={`Ubah ${account.name}`}>Ubah</button>
                                <button
                                  type="button"
                                  className={account.is_active ? 'deactivate' : 'activate'}
                                  disabled={savingUserId === account.id}
                                  onClick={() => toggleAccount(account)}
                                  aria-label={`${account.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${account.name}`}
                                >
                                  {savingUserId === account.id ? 'Menyimpan...' : account.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                                </button>
                              </>
                            ) : <span className="users-protected-label">Terlindungi</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!visibleUsers.length && (
                      <tr>
                        <td colSpan={5} className="users-empty-cell">
                          <strong>{users.length ? 'Tidak ada akun yang cocok' : 'Belum ada akun pengguna'}</strong>
                          <span>{users.length
                            ? 'Ubah pencarian, peran, atau status untuk melihat akun lainnya.'
                            : 'Buat akun Supervisor atau Staff untuk mulai mengelola akses usaha.'}</span>
                          {!users.length && <button type="button" className="users-button primary" onClick={openCreateEditor}>Tambah pengguna</button>}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <footer className="users-table-footer">
                <span>Menampilkan <strong>{firstUser}–{lastUser}</strong> dari <strong>{filteredUsers.length}</strong> akun</span>
                <div className="users-pagination" aria-label="Halaman daftar pengguna">
                  <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>Sebelumnya</button>
                  <span>Halaman {currentPage} dari {totalPages}</span>
                  <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>Berikutnya</button>
                </div>
              </footer>
            </section>

            <section className="users-governance-grid">
              <article className="users-governance-card">
                <header>
                  <span className="users-governance-icon" aria-hidden="true">▦</span>
                  <div><h2>Matriks hak akses peran</h2><p>Ringkasan akses pada route dan proses yang tersedia di aplikasi.</p></div>
                  <span className="users-governance-badge">3 PERAN</span>
                </header>
                <div className="users-rbac-table-scroll">
                  <table className="users-rbac-table">
                    <thead><tr><th scope="col">Aktivitas</th><th scope="col">Owner</th><th scope="col">Supervisor</th><th scope="col">Staff</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Kelola akun pengguna &amp; ambang usaha</th><td className="allowed">✓</td><td>—</td><td>—</td></tr>
                      <tr><th scope="row">Kelola kategori arus kas</th><td className="allowed">✓</td><td>—</td><td>—</td></tr>
                      <tr><th scope="row">Lihat anggaran usaha</th><td className="allowed">✓</td><td className="allowed">✓</td><td>—</td></tr>
                      <tr><th scope="row">Buat pengajuan pengeluaran</th><td>—</td><td>—</td><td className="allowed">✓</td></tr>
                      <tr><th scope="row">Setujui / tolak pengajuan</th><td>—</td><td className="allowed">✓</td><td>—</td></tr>
                      <tr><th scope="row">Catat transaksi</th><td className="allowed">✓</td><td className="allowed">✓</td><td className="limited">Dengan aturan approval</td></tr>
                    </tbody>
                  </table>
                </div>
                <Link to="/settings" className="users-governance-link">Lihat konfigurasi ambang approval <span aria-hidden="true">→</span></Link>
              </article>

              <article className="users-governance-card">
                <header>
                  <span className="users-governance-icon" aria-hidden="true">⌑</span>
                  <div><h2>Proteksi akun yang tersedia</h2><p>Yang benar-benar diberlakukan oleh sistem saat ini.</p></div>
                  <span className="users-governance-badge neutral">AKUN</span>
                </header>
                <div className="users-protection-list">
                  <div><b>01</b><span><strong>Password minimal 8 karakter</strong><small>Diperiksa ketika Owner membuat akun atau mengatur password baru.</small></span></div>
                  <div><b>02</b><span><strong>Akun nonaktif ditolak saat login</strong><small>Penonaktifan tidak mencabut token/sesi yang sudah terbit; sistem belum memiliki kontrol sesi aktif.</small></span></div>
                  <div><b>03</b><span><strong>Aktivitas perubahan akun dicatat</strong><small>Pembuatan dan perubahan akun masuk ke Audit Trail yang dapat dilihat Owner.</small></span></div>
                </div>
                <Link to="/audit" className="users-governance-link">Buka Audit Trail <span aria-hidden="true">→</span></Link>
              </article>
            </section>
          </>
        )}
      </div>

      {(creating || editingAccount) && (
        <UserEditor
          key={editingAccount?.id ?? 'new-user'}
          account={editingAccount}
          saving={saving}
          error={editorError}
          onClose={closeEditor}
          onSubmit={saveAccount}
        />
      )}
    </div>
  );
};

export default UserManagement;
