import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { notifyFinancialDataChanged } from '../services/financialDataEvents';
import './BudgetManagement.css';

const iconChoices = [
  { value: 'food', label: 'Makan', glyph: '♨' },
  { value: 'car', label: 'Transportasi', glyph: '↗' },
  { value: 'bus', label: 'Perjalanan', glyph: '▣' },
  { value: 'game', label: 'Hiburan', glyph: '✦' },
  { value: 'shop', label: 'Belanja', glyph: '▤' },
  { value: 'health', label: 'Kesehatan', glyph: '+' },
  { value: 'home', label: 'Rumah', glyph: '⌂' },
  { value: 'education', label: 'Pendidikan', glyph: '▱' },
  { value: 'coffee', label: 'Kopi', glyph: '☕' },
  { value: 'tag', label: 'Lainnya', glyph: '◇' },
];

const colors = ['#4f46e5', '#0f766e', '#0891b2', '#dc2626', '#f59e0b', '#7c3aed', '#db2777', '#334155'];
const starterCategories = ['Makan & Minum', 'Transportasi', 'Hiburan & Hobi', 'Belanja Pribadi', 'Kesehatan', 'Pendidikan'];
const pageModules = [
  ['Manajemen Budget', 'Atur target dan alokasi budget kategori.', '/budgets'],
  ['Perencanaan Bulanan', 'Tentukan target pengeluaran bulanan.', '/budgets'],
  ['Transaksi Pengeluaran', 'Catat pengeluaran sesuai kategori.', '/expenses'],
  ['Dashboard & Budget Harian', 'Pantau penggunaan dan batas budget.', '/dashboard'],
];

const CategoryManagement = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('tag');
  const [color, setColor] = useState(colors[0]);
  const [type, setType] = useState('expense');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const loadCategories = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/categories');
        if (active) setCategories(response.data.data);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message ?? 'Daftar kategori gagal dimuat.');
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCategories();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setIcon('tag');
    setColor(colors[0]);
    setType('expense');
    setRequiresApproval(false);
    setEditingCategory(null);
  };

  const chooseStarter = (categoryName) => {
    setName(categoryName);
    setIcon(categoryName.toLowerCase().includes('makan') ? 'food' : categoryName.toLowerCase().includes('transport') ? 'car' : categoryName.toLowerCase().includes('hiburan') ? 'game' : 'tag');
    setNotice('');
  };

  const editCategory = (category) => {
    setEditingCategory(category);
    setName(category.name);
    setDescription(category.description ?? '');
    setIcon(category.icon ?? 'tag');
    setColor(category.color ?? colors[0]);
    setType(category.type ?? 'expense');
    setRequiresApproval(Boolean(category.requires_approval));
    setNotice('');
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      icon,
      color,
      type,
      requires_approval: type === 'expense' && requiresApproval,
    };
    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, payload);
        setNotice('Kategori berhasil diperbarui.');
      } else {
        await api.post('/categories', payload);
        setNotice('Kategori berhasil ditambahkan.');
      }
      resetForm();
      notifyFinancialDataChanged();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      const validationErrors = requestError.response?.data?.errors;
      setError(validationErrors ? Object.values(validationErrors).flat()[0] : requestError.response?.data?.message ?? 'Kategori gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = async (category) => {
    if (category.budgets_count > 0) {
      setError('Kategori masih memiliki alokasi budget. Hapus alokasi budget terlebih dahulu.');
      return;
    }
    if (!window.confirm(`Hapus kategori ${category.name}?`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/categories/${category.id}`);
      setNotice('Kategori berhasil dihapus.');
      notifyFinancialDataChanged();
      if (editingCategory?.id === category.id) resetForm();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? 'Kategori gagal dihapus.');
    }
  };

  const handleLogout = async () => {
    setLoadingLogout(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setLoadingLogout(false);
    }
  };

  const iconGlyph = iconChoices.find((choice) => choice.value === icon)?.glyph ?? '◇';

  return (
    <div className="finance-app">
      <aside className="finance-sidebar">
        <Link to="/dashboard" className="finance-brand"><span className="finance-brand-icon">BH</span><span><strong>Bocor Halus</strong><small>KEUANGAN UMKM</small></span></Link>
        <Link to="/dashboard" className="finance-nav-link"><span>⌂</span> Dashboard</Link>
        <Link to="/transactions" className="finance-nav-link"><span>↕</span> Transaksi</Link>
        <Link to="/requests" className="finance-nav-link"><span>▣</span> Pengajuan</Link>
        <Link to="/wallets" className="finance-nav-link"><span>▤</span> Kas &amp; Rekening</Link>
        <Link to="/categories" className="finance-nav-link active" aria-current="page"><span>＋</span> Pengaturan Kategori</Link>
        <Link to="/reports" className="finance-nav-link"><span>▥</span> Laporan</Link>
        <Link to="/notifications" className="finance-nav-link"><span>♧</span> Notifikasi</Link>
        <div className="finance-sidebar-spacer" />
        <div className="finance-user"><span className="finance-avatar">{user?.name?.[0] ?? 'U'}</span><span><strong>{user?.name ?? 'User'}</strong><small>{user?.email ?? ''}</small></span></div>
        <button type="button" className="finance-logout" onClick={handleLogout} disabled={loadingLogout}>{loadingLogout ? 'Keluar...' : 'Keluar akun'}</button>
      </aside>

      <main className="finance-main">
        <header className="finance-topbar">
          <div className="finance-breadcrumb"><Link to="/budgets">Budget</Link><span>/</span><strong>Tambah Kategori</strong></div>
          <div className="finance-topbar-actions"><span className="finance-eyebrow">KATEGORI USAHA</span><span className="finance-avatar">{user?.name?.[0] ?? 'U'}</span></div>
        </header>

        <section className="finance-page-heading">
          <div>
            <span className="finance-eyebrow">KELOLA KATEGORI USAHA</span>
            <h1>{editingCategory ? 'Edit Kategori' : 'Tambah Kategori'}</h1>
            <p>Kelola kategori pemasukan dan pengeluaran bersama untuk pencatatan keuangan usaha.</p>
          </div>
          <Link to="/budgets" className="finance-button secondary">← Kembali ke Manajemen Budget</Link>
        </section>

        {error && <div className="finance-error finance-page-message" role="alert">{error}</div>}
        {notice && <div className="finance-notice finance-page-message" role="status">{notice}</div>}

        <div className="finance-category-layout">
          <form className="finance-category-form" onSubmit={saveCategory}>
            <label className="finance-field">
              Jenis kategori
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="income">Pemasukan</option>
                <option value="expense">Pengeluaran</option>
              </select>
            </label>
            <label className="finance-field">
              Nama kategori
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength="255" placeholder="Contoh: Perawatan Hewan" required />
            </label>
            {type === 'expense' && (
              <label className="finance-field">
                <span><input type="checkbox" checked={requiresApproval} onChange={(event) => setRequiresApproval(event.target.checked)} /> Wajib persetujuan Supervisor</span>
              </label>
            )}
            <div className="finance-category-limit">{name.length} / 255 karakter</div>

            <section className="finance-category-preset">
              <div className="finance-subheading"><h2>Pilih kategori</h2><span>OPSIONAL</span></div>
              <p>Pilih rekomendasi atau ketik nama kategori sendiri.</p>
              <div className="finance-preset-list">
                {starterCategories.map((category) => (
                  <button type="button" key={category} className={name === category ? 'selected' : ''} onClick={() => chooseStarter(category)}>
                    {category}
                  </button>
                ))}
              </div>
            </section>

            <section className="finance-category-preset">
              <div className="finance-subheading"><h2>Pilih ikon</h2><span>{iconChoices.find((choice) => choice.value === icon)?.label}</span></div>
              <div className="finance-icon-picker">
                {iconChoices.map((choice) => (
                  <button type="button" key={choice.value} className={icon === choice.value ? 'selected' : ''} onClick={() => setIcon(choice.value)} aria-label={choice.label} title={choice.label}>
                    {choice.glyph}
                  </button>
                ))}
              </div>
            </section>

            <section className="finance-category-preset">
              <div className="finance-subheading"><h2>Warna label &amp; tag</h2><span>{color}</span></div>
              <div className="finance-color-picker">
                {colors.map((choice) => (
                  <button type="button" key={choice} className={color === choice ? 'selected' : ''} style={{ '--category-color': choice }} onClick={() => setColor(choice)} aria-label={`Pilih warna ${choice}`} title={choice}>
                    {color === choice ? '✓' : ''}
                  </button>
                ))}
              </div>
            </section>

            <label className="finance-field">
              Deskripsi kategori <span className="finance-optional-label">OPSIONAL</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength="500" rows="3" placeholder="Jelaskan pengeluaran yang termasuk dalam kategori ini." />
            </label>

            <footer className="finance-category-actions">
              {editingCategory && <button type="button" className="finance-button danger-outline" onClick={() => removeCategory(editingCategory)} disabled={editingCategory.budgets_count > 0}>Hapus Kategori</button>}
              <button type="button" className="finance-button secondary" onClick={resetForm} disabled={saving}>Reset</button>
              <button type="submit" className="finance-button primary" disabled={saving}>{saving ? 'Menyimpan...' : editingCategory ? 'Simpan Perubahan' : 'Simpan Kategori'}</button>
            </footer>
          </form>

          <aside className="finance-category-aside">
            <section className="finance-category-preview">
              <header><div><span className="finance-eyebrow">PRATINJAU TAMPILAN</span><h2>Kategori ini akan muncul</h2></div><span className="finance-status safe">Live view</span></header>
              <div className="finance-category-preview-row">
                <span className="finance-category-icon" style={{ backgroundColor: `${color}18`, color }}>{iconGlyph}</span>
                <span><strong>{name || 'Nama kategori'}</strong><small>{description || 'Deskripsi kategori akan tampil di sini.'}</small></span>
                <span className="finance-category-tag" style={{ color, backgroundColor: `${color}14` }}>Kategori</span>
              </div>
              <p>Ikon, warna, dan deskripsi akan ditampilkan di halaman budget dan rincian transaksi.</p>
            </section>

            <section className="finance-category-preview">
              <header><div><span className="finance-eyebrow">TERSEDIA DI SELURUH MODUL</span><h2>Integrasi kategori</h2></div></header>
              <div className="finance-module-list">
                {pageModules.map(([title, description, path]) => (
                  <Link to={path} key={title}><span className="finance-module-dot">✓</span><span><strong>{title}</strong><small>{description}</small></span><span>→</span></Link>
                ))}
              </div>
            </section>

            <section className="finance-category-preview finance-defaults-card">
              <header><div><span className="finance-eyebrow">KATEGORI ANDA</span><h2>{categories.length} kategori tersimpan</h2></div></header>
              {loading ? <p>Memuat kategori...</p> : (
                <div className="finance-category-list">
                  {categories.map((category) => (
                    <div className="finance-category-list-row" key={category.id}>
                      <span className="finance-category-icon small" style={{ backgroundColor: `${category.color}18`, color: category.color }}>{iconChoices.find((choice) => choice.value === category.icon)?.glyph ?? '◇'}</span>
                      <span><strong>{category.name}</strong><small>{category.budgets_count ?? 0} budget</small></span>
                      <button type="button" onClick={() => editCategory(category)}>Ubah</button>
                      <button type="button" className="category-delete" onClick={() => removeCategory(category)} disabled={category.budgets_count > 0} aria-label={`Hapus ${category.name}`}>×</button>
                    </div>
                  ))}
                  {categories.length === 0 && <p>Belum ada kategori. Buat kategori pertama Anda.</p>}
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default CategoryManagement;
