import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { notifyFinancialDataChanged } from '../services/financialDataEvents';
import './CategoryManagement.css';

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

const categoryColors = ['#3456a3', '#526d91', '#627c9f', '#7b6f91', '#8b7660', '#567e78', '#737d8c', '#42516b'];
const starterCategories = ['Makan & Minum', 'Transportasi', 'Hiburan & Hobi', 'Belanja', 'Kesehatan', 'Pendidikan'];
const pageSize = 10;

const currency = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value ?? 0));

const getErrorMessage = (requestError, fallback) => {
  const validationErrors = requestError.response?.data?.errors;
  return validationErrors
    ? Object.values(validationErrors).flat()[0]
    : requestError.response?.data?.message ?? fallback;
};

const exportCategories = (categories) => {
  const exportedCategories = categories.map((category) => ({
    id: category.id,
    name: category.name,
    type: category.type,
    description: category.description,
    icon: category.icon,
    color: category.color,
    requires_approval: Boolean(category.requires_approval),
    budgets_count: Number(category.budgets_count ?? 0),
  }));
  const blob = new Blob([JSON.stringify(exportedCategories, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `kategori-arus-kas-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const CategoryEditor = ({ category, saving, error, onClose, onSubmit }) => {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'tag');
  const [color, setColor] = useState(category?.color ?? categoryColors[0]);
  const [type, setType] = useState(category?.type ?? 'expense');
  const [requiresApproval, setRequiresApproval] = useState(Boolean(category?.requires_approval));
  const iconGlyph = iconChoices.find((choice) => choice.value === icon)?.glyph ?? '◇';

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      name: name.trim(),
      description: description.trim() || null,
      icon,
      color,
      type,
      requires_approval: type === 'expense' && requiresApproval,
    });
  };

  return (
    <div
      className="category-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="category-modal" role="dialog" aria-modal="true" aria-labelledby="category-editor-title">
        <header className="category-modal-header">
          <div>
            <span className="category-eyebrow">PENGELOLAAN KATEGORI</span>
            <h2 id="category-editor-title">{category ? 'Ubah kategori' : 'Tambah kategori baru'}</h2>
            <p>Gunakan kategori yang jelas agar transaksi usaha mudah ditelusuri.</p>
          </div>
          <button type="button" className="category-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form">×</button>
        </header>

        {error && <div className="category-message error" role="alert">{error}</div>}

        <form className="category-editor-form" onSubmit={submit}>
          <label className="category-field">
            Jenis arus kas
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="income">Pemasukan</option>
              <option value="expense">Pengeluaran</option>
            </select>
          </label>

          <label className="category-field">
            Nama kategori
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              placeholder="Contoh: Perawatan mesin"
              required
              autoFocus
            />
            <small>{name.length} / 255 karakter</small>
          </label>

          <div className="category-suggestions">
            <span>Rekomendasi</span>
            <div>
              {starterCategories.map((categoryName) => (
                <button
                  type="button"
                  key={categoryName}
                  className={name === categoryName ? 'selected' : ''}
                  onClick={() => {
                    setName(categoryName);
                    if (categoryName.includes('Makan')) setIcon('food');
                    else if (categoryName.includes('Transportasi')) setIcon('car');
                    else if (categoryName.includes('Hiburan')) setIcon('game');
                    else setIcon('tag');
                  }}
                >
                  {categoryName}
                </button>
              ))}
            </div>
          </div>

          {type === 'expense' && (
            <label className="category-approval-option">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(event) => setRequiresApproval(event.target.checked)}
              />
              <span>
                <strong>Wajib diajukan ke Supervisor</strong>
                <small>Staf tidak dapat mencatat pengeluaran langsung pada kategori ini.</small>
              </span>
            </label>
          )}

          <fieldset className="category-choice-group">
            <legend>Ikon kategori</legend>
            <div className="category-icon-picker">
              {iconChoices.map((choice) => (
                <button
                  type="button"
                  key={choice.value}
                  className={icon === choice.value ? 'selected' : ''}
                  onClick={() => setIcon(choice.value)}
                  aria-label={choice.label}
                  aria-pressed={icon === choice.value}
                  title={choice.label}
                >
                  {choice.glyph}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="category-choice-group">
            <legend>Warna label</legend>
            <div className="category-color-picker">
              {categoryColors.map((choice) => (
                <button
                  type="button"
                  key={choice}
                  className={color === choice ? 'selected' : ''}
                  style={{ '--category-color': choice }}
                  onClick={() => setColor(choice)}
                  aria-label={`Pilih warna ${choice}`}
                  aria-pressed={color === choice}
                >
                  {color === choice ? '✓' : ''}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="category-field">
            Deskripsi <span className="category-optional">OPSIONAL</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Keterangan singkat tentang transaksi yang termasuk kategori ini."
            />
            <small>{description.length} / 500 karakter</small>
          </label>

          <div className="category-live-preview">
            <span className="category-avatar" style={{ '--category-color': color }} aria-hidden="true">{iconGlyph}</span>
            <span>
              <strong>{name || 'Nama kategori'}</strong>
              <small>{description || 'Deskripsi kategori akan tampil di sini.'}</small>
            </span>
            <span className="category-type-badge">{type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</span>
          </div>

          <footer className="category-modal-actions">
            <button type="button" className="category-button secondary" onClick={onClose} disabled={saving}>Batal</button>
            <button type="submit" className="category-button primary" disabled={saving}>
              {saving ? 'Menyimpan...' : category ? 'Simpan perubahan' : 'Simpan kategori'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

const CategoryManagement = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [approvalFilter, setApprovalFilter] = useState('all');
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
        const [categoriesResult, settingsResult] = await Promise.allSettled([
          api.get('/categories', { signal: controller.signal }),
          api.get('/business-settings', { signal: controller.signal }),
        ]);
        if (!active) return;
        if (categoriesResult.status === 'rejected') throw categoriesResult.reason;
        setCategories(categoriesResult.value.data.data);
        if (settingsResult.status === 'fulfilled') {
          setSettings(settingsResult.value.data.data);
        } else {
          setSettings(null);
          setSettingsError(settingsResult.reason.response?.data?.message ?? 'Ambang persetujuan usaha tidak dapat dimuat.');
        }
      } catch (requestError) {
        if (active && requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message ?? 'Daftar kategori gagal dimuat. Coba muat ulang halaman.');
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

  const approvalCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense' && category.requires_approval),
    [categories],
  );
  const incomeCount = categories.filter((category) => category.type === 'income').length;
  const expenseCount = categories.filter((category) => category.type === 'expense').length;
  const hasThreshold = settings?.approval_threshold !== null && settings?.approval_threshold !== undefined;
  const formattedThreshold = hasThreshold ? currency(settings.approval_threshold) : null;

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    return categories
      .filter((category) => typeFilter === 'all' || category.type === typeFilter)
      .filter((category) => approvalFilter === 'all'
        || (approvalFilter === 'required' && category.type === 'expense' && category.requires_approval)
        || (approvalFilter === 'not-required' && (category.type !== 'expense' || !category.requires_approval)))
      .filter((category) => {
        const searchable = [
          category.id,
          category.name,
          category.description,
          category.type === 'income' ? 'pemasukan masuk' : 'pengeluaran keluar',
        ].join(' ').toLocaleLowerCase('id-ID');
        return !query || searchable.includes(query);
      })
      .sort((left, right) => {
        const typeOrder = { income: 0, expense: 1 };
        return (typeOrder[left.type] ?? 2) - (typeOrder[right.type] ?? 2)
          || left.name.localeCompare(right.name, 'id');
      });
  }, [categories, search, typeFilter, approvalFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleCategories = filteredCategories.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstItem = filteredCategories.length ? (currentPage - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(currentPage * pageSize, filteredCategories.length);
  const thresholdDescription = settingsError
    ? 'Ambang nominal usaha belum dapat dibaca.'
    : hasThreshold
      ? `Pengeluaran staf mulai ${formattedThreshold} harus diajukan ke Supervisor.`
      : 'Belum ada ambang nominal usaha; aturan kategori wajib approval tetap berlaku.';

  const openCreateForm = () => {
    setFormError('');
    setIsCreating(true);
  };

  const openEditForm = (category) => {
    setFormError('');
    setEditingCategory(category);
  };

  const closeForm = () => {
    if (!saving) {
      setEditingCategory(null);
      setIsCreating(false);
      setFormError('');
    }
  };

  const saveCategory = async (values) => {
    setSaving(true);
    setFormError('');
    setError('');
    setNotice('');
    try {
      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, values);
        setNotice('Kategori berhasil diperbarui.');
      } else {
        await api.post('/categories', values);
        setNotice('Kategori berhasil ditambahkan.');
      }
      setEditingCategory(null);
      setIsCreating(false);
      notifyFinancialDataChanged();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setFormError(getErrorMessage(requestError, 'Kategori gagal disimpan.'));
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = async (category) => {
    if (Number(category.budgets_count ?? 0) > 0) {
      setError('Kategori masih memiliki alokasi anggaran. Hapus alokasi tersebut sebelum menghapus kategori.');
      return;
    }
    if (!window.confirm(`Hapus kategori “${category.name}”? Kategori yang masih digunakan oleh transaksi tidak dapat dihapus.`)) return;

    setError('');
    setNotice('');
    try {
      await api.delete(`/categories/${category.id}`);
      setNotice('Kategori berhasil dihapus.');
      if (editingCategory?.id === category.id) setEditingCategory(null);
      notifyFinancialDataChanged();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Kategori gagal dihapus.'));
    }
  };

  const setType = (nextType) => {
    setTypeFilter(nextType);
    setPage(1);
  };

  const setApproval = (nextFilter) => {
    setApprovalFilter(nextFilter);
    setPage(1);
  };

  return (
    <div className="owner-module-content category-workspace">
      <div className="owner-module-main category-page">
        <header className="category-page-header">
          <div>
            <div className="category-breadcrumb">
              <span>MANAJEMEN &amp; KONTROL</span><i>/</i><strong>KATEGORI ARUS KAS</strong>
              <span className="category-mode-badge">MODE OWNER</span>
            </div>
            <h1>Kategori Arus Kas &amp; Aturan Pembukuan</h1>
            <p>
              Kelola jenis pemasukan dan pengeluaran, serta tandai kategori yang wajib diajukan ke Supervisor.
              Kategori di sini mengikuti kemampuan pencatatan transaksi yang tersedia.
            </p>
            <div className="category-business-name">{user?.business?.business_name ?? user?.business_name ?? 'Nama usaha belum tersedia'}</div>
          </div>
          <div className="category-header-actions">
            <button type="button" className="category-button secondary" onClick={() => exportCategories(categories)} disabled={!categories.length || loading}>
              <span aria-hidden="true">⇩</span> Unduh kategori (.JSON)
            </button>
            <button type="button" className="category-button primary" onClick={openCreateForm}>
              <span aria-hidden="true">＋</span> Tambah kategori
            </button>
          </div>
        </header>

        {error && <div className="category-message error" role="alert">{error}</div>}
        {notice && <div className="category-message success" role="status">{notice}</div>}
        {loading && <div className="category-loading" role="status">Memuat daftar kategori...</div>}

        {!loading && !error && (
          <>
            <section className="category-metrics" aria-label="Ringkasan kategori">
              <article className="category-metric">
                <div className="category-metric-top"><span>Total kategori</span><i aria-hidden="true">▦</i></div>
                <strong>{categories.length}</strong>
                <small>Kategori tersedia di usaha</small>
                <div className="category-metric-accent blue" />
              </article>
              <article className="category-metric">
                <div className="category-metric-top"><span>Kategori pemasukan</span><i aria-hidden="true">↘</i></div>
                <strong>{incomeCount}</strong>
                <small>Jenis arus masuk yang tercatat</small>
                <div className="category-metric-accent slate" />
              </article>
              <article className="category-metric">
                <div className="category-metric-top"><span>Kategori pengeluaran</span><i aria-hidden="true">↗</i></div>
                <strong>{expenseCount}</strong>
                <small>Jenis arus keluar yang tercatat</small>
                <div className="category-metric-accent navy" />
              </article>
              <article className="category-metric">
                <div className="category-metric-top"><span>Wajib approval Supervisor</span><i aria-hidden="true">✓</i></div>
                <strong>{approvalCategories.length}</strong>
                <small>Kategori pengeluaran dengan aturan khusus</small>
                <div className="category-metric-accent muted" />
              </article>
            </section>

            <section className="category-policy-banner">
              <span className="category-policy-icon" aria-hidden="true">⌑</span>
              <div>
                <div className="category-policy-heading">
                  <h2>Aturan persetujuan pengeluaran</h2>
                  <span>BERDASARKAN PENGATURAN USAHA</span>
                </div>
                <p>
                  {thresholdDescription} {approvalCategories.length
                    ? `${approvalCategories.length} kategori juga selalu mengharuskan pengajuan, terlepas dari nominal.`
                    : 'Belum ada kategori yang ditandai wajib approval.'}
                </p>
              </div>
              <Link to="/settings" className="category-policy-link">Lihat pengaturan <span aria-hidden="true">→</span></Link>
            </section>

            {settingsError && <div className="category-message warning" role="status">{settingsError}</div>}

            <section className="category-registry">
              <header className="category-registry-header">
                <div>
                  <span className="category-eyebrow">DAFTAR KATEGORI USAHA</span>
                  <h2>Bagan kategori</h2>
                  <p>Perubahan di sini akan digunakan pada pilihan kategori transaksi dan anggaran.</p>
                </div>
                <span className="category-total-pill">{filteredCategories.length} kategori cocok</span>
              </header>

              <div className="category-filter-bar">
                <div className="category-type-tabs" role="group" aria-label="Filter jenis arus kas">
                  {[
                    ['all', `Semua (${categories.length})`],
                    ['income', `Pemasukan (${incomeCount})`],
                    ['expense', `Pengeluaran (${expenseCount})`],
                  ].map(([filter, label]) => (
                    <button
                      type="button"
                      key={filter}
                      className={typeFilter === filter ? 'active' : ''}
                      aria-pressed={typeFilter === filter}
                      onClick={() => setType(filter)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="category-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Cari nama, deskripsi, atau ID kategori..."
                    aria-label="Cari kategori"
                  />
                </label>
                <label className="category-approval-filter">
                  <span className="sr-only">Filter persetujuan</span>
                  <select value={approvalFilter} onChange={(event) => setApproval(event.target.value)}>
                    <option value="all">Semua aturan approval</option>
                    <option value="required">Wajib diajukan</option>
                    <option value="not-required">Tanpa aturan khusus</option>
                  </select>
                </label>
              </div>

              <div className="category-table-scroll">
                <table className="category-table">
                  <thead>
                    <tr>
                      <th scope="col">Kategori</th>
                      <th scope="col">Jenis arus kas</th>
                      <th scope="col">Alokasi anggaran</th>
                      <th scope="col">Aturan pengajuan</th>
                      <th scope="col" className="category-actions-heading">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleCategories.map((category, index) => {
                      const previous = visibleCategories[index - 1];
                      const showGroup = !previous || previous.type !== category.type;
                      return (
                        <FragmentRow
                          key={category.id}
                          category={category}
                          showGroup={showGroup}
                          typeFilter={typeFilter}
                          onEdit={openEditForm}
                          onDelete={removeCategory}
                        />
                      );
                    })}
                    {!visibleCategories.length && (
                      <tr>
                        <td colSpan={5} className="category-empty-cell">
                          <strong>{categories.length ? 'Kategori tidak ditemukan' : 'Belum ada kategori'}</strong>
                          <span>{categories.length
                            ? 'Ubah pencarian atau filter untuk melihat kategori lainnya.'
                            : 'Tambahkan kategori pemasukan atau pengeluaran pertama untuk mulai mencatat.'}</span>
                          {!categories.length && <button type="button" className="category-button primary" onClick={openCreateForm}>Tambah kategori</button>}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <footer className="category-table-footer">
                <span>
                  Menampilkan <strong>{firstItem}–{lastItem}</strong> dari <strong>{filteredCategories.length}</strong> kategori
                </span>
                <div className="category-pagination" aria-label="Halaman daftar kategori">
                  <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage <= 1}>Sebelumnya</button>
                  <span>Halaman {currentPage} dari {totalPages}</span>
                  <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= totalPages}>Berikutnya</button>
                </div>
              </footer>
            </section>

            <section className="category-info-grid">
              <article className="category-info-card">
                <header>
                  <span className="category-info-icon" aria-hidden="true">◎</span>
                  <div><h2>Aturan persetujuan bertingkat</h2><p>Aturan yang benar-benar diterapkan saat staf mencatat pengeluaran.</p></div>
                  <span className="category-info-badge">AKTIF</span>
                </header>
                <div className="category-rule-list">
                  <div><b>01</b><span><strong>Kategori wajib approval</strong><small>{approvalCategories.length ? `${approvalCategories.length} kategori meminta staf mengajukan transaksi ke Supervisor.` : 'Tidak ada kategori yang saat ini ditandai wajib approval.'}</small></span></div>
                  <div><b>02</b><span><strong>Ambang nominal usaha</strong><small>{settingsError ? 'Tidak dapat dimuat; periksa pengaturan usaha.' : hasThreshold ? `Pengeluaran staf senilai ${formattedThreshold} atau lebih harus diajukan.` : 'Belum dikonfigurasi; tidak ada ambang nominal tambahan.'}</small></span></div>
                  <div><b>03</b><span><strong>Keputusan melalui pengajuan</strong><small>Kategori dan ambang menentukan kewajiban pengajuan; halaman ini tidak mengatur tier atau batas nominal Supervisor.</small></span></div>
                </div>
                <Link to="/settings" className="category-text-link">Atur nama usaha dan ambang approval <span aria-hidden="true">→</span></Link>
              </article>

              <article className="category-info-card">
                <header>
                  <span className="category-info-icon" aria-hidden="true">▤</span>
                  <div><h2>Data kategori yang tersimpan</h2><p>Informasi yang tersedia dan digunakan oleh modul lain.</p></div>
                  <span className="category-info-badge neutral">TERINTEGRASI</span>
                </header>
                <div className="category-rule-list">
                  <div><b>✓</b><span><strong>Jenis, nama, ikon, dan warna</strong><small>Dipakai pada formulir transaksi, filter monitoring, laporan, dan halaman anggaran.</small></span></div>
                  <div><b>✓</b><span><strong>Penghapusan kategori terlindungi</strong><small>Kategori yang masih terhubung ke anggaran atau transaksi ditolak oleh API.</small></span></div>
                  <div><b>i</b><span><strong>Pengelompokan akuntansi lanjutan</strong><small>Kode akun, klasifikasi investasi/pendanaan, rekening default, dan persyaratan bukti belum tersedia sebagai data kategori.</small></span></div>
                </div>
                <Link to="/budgets" className="category-text-link">Lihat penggunaan kategori di anggaran <span aria-hidden="true">→</span></Link>
              </article>
            </section>
          </>
        )}
      </div>

      {(isCreating || editingCategory) && (
        <CategoryEditor
          key={editingCategory?.id ?? 'new-category'}
          category={editingCategory}
          saving={saving}
          error={formError}
          onClose={closeForm}
          onSubmit={saveCategory}
        />
      )}
    </div>
  );
};

const FragmentRow = ({ category, showGroup, typeFilter, onEdit, onDelete }) => (
  <>
    {typeFilter === 'all' && showGroup && (
      <tr className={`category-group-row ${category.type}`}>
        <th scope="rowgroup" colSpan={5}>
          <span aria-hidden="true">{category.type === 'income' ? '↘' : '↗'}</span>
          {category.type === 'income' ? 'KATEGORI PEMASUKAN' : 'KATEGORI PENGELUARAN'}
        </th>
      </tr>
    )}
    <tr className="category-data-row">
      <td>
        <div className="category-name-cell">
          <span className="category-avatar" style={{ '--category-color': category.color ?? '#42516b' }}>
            {iconChoices.find((choice) => choice.value === category.icon)?.glyph ?? '◇'}
          </span>
          <span>
            <strong>{category.name}</strong>
            <small>ID #{category.id} · {category.description || 'Belum ada deskripsi'}</small>
          </span>
        </div>
      </td>
      <td><span className={`category-type-badge ${category.type}`}>{category.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</span></td>
      <td>
        <span className="category-usage-value">{Number(category.budgets_count ?? 0)}</span>
        <small className="category-cell-note">alokasi anggaran</small>
      </td>
      <td>
        {category.type === 'expense' && category.requires_approval
          ? <span className="category-approval-badge required">Wajib diajukan</span>
          : <span className="category-approval-badge">{category.type === 'expense' ? 'Mengikuti ambang usaha' : 'Tidak berlaku'}</span>}
      </td>
      <td>
        <div className="category-row-actions">
          <button type="button" onClick={() => onEdit(category)} aria-label={`Ubah kategori ${category.name}`}>Ubah</button>
          <button
            type="button"
            className="delete"
            onClick={() => onDelete(category)}
            disabled={Number(category.budgets_count ?? 0) > 0}
            title={Number(category.budgets_count ?? 0) > 0 ? 'Hapus alokasi anggaran terlebih dahulu' : 'Hapus kategori'}
            aria-label={`Hapus kategori ${category.name}`}
          >
            Hapus
          </button>
        </div>
      </td>
    </tr>
  </>
);

export default CategoryManagement;
