import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import InsightsLayout from '../components/InsightsLayout';
import { useAuth } from '../context/useAuth';
import './Subscriptions.css';

const initialForm = {
  name: '',
  category: 'Hiburan',
  amount: '',
  billing_cycle: 'monthly',
  due_date: '',
  status: 'active',
};

const categoryOptions = ['Hiburan', 'Produktivitas', 'Penyimpanan', 'Pendidikan', 'Lainnya'];

const formatCurrency = (value = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value));

const formatDate = (value) => {
  const dateValue = value?.slice(0, 10);
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : null;

  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    : '—';
};

const monthlyEquivalent = (subscription) => (
  Number(subscription.amount) / (subscription.billing_cycle === 'yearly' ? 12 : 1)
);

const statusLabels = {
  active: 'Aktif',
  inactive: 'Dijeda',
  cancelled: 'Dihentikan',
};

const cycleLabels = {
  monthly: 'Bulanan',
  yearly: 'Tahunan',
};

const MetricCard = ({ eyebrow, title, value, footnote, icon, tone = 'green' }) => (
  <article className="subscription-metric-card">
    <div className={`subscription-metric-icon ${tone}`}>{icon}</div>
    <div className="subscription-eyebrow">{eyebrow}</div>
    <h2>{title}</h2>
    <strong className="subscription-metric-value">{value}</strong>
    <p>{footnote}</p>
  </article>
);

const SubscriptionForm = ({ subscription, saving, error, onClose, onSubmit }) => {
  const [form, setForm] = useState(() => subscription
    ? {
      name: subscription.name,
      category: subscription.category,
      amount: subscription.amount,
      billing_cycle: subscription.billing_cycle,
      due_date: subscription.due_date.slice(0, 10),
      status: subscription.status,
    }
    : initialForm);

  const changeField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      ...form,
      amount: Number(form.amount),
    });
  };

  return (
    <div className="subscription-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <form className="subscription-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="subscription-form-heading">
        <header className="subscription-modal-header">
          <div>
            <span className="subscription-eyebrow">PENGELOLAAN RUTIN</span>
            <h2 id="subscription-form-heading">{subscription ? 'Edit Tagihan Rutin' : 'Tambah Tagihan Rutin'}</h2>
          </div>
          <button type="button" className="subscription-icon-button" onClick={onClose} disabled={saving} aria-label="Tutup form">×</button>
        </header>

        {error && <div className="subscription-inline-error" role="alert">{error}</div>}

        <label className="subscription-field">
          Nama layanan
          <input name="name" value={form.name} onChange={changeField} maxLength="255" placeholder="Contoh: Spotify Premium" required />
        </label>

        <div className="subscription-form-grid">
          <label className="subscription-field">
            Kategori
            <select name="category" value={form.category} onChange={changeField} required>
              {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label className="subscription-field">
            Nominal tagihan
            <input name="amount" type="number" min="0.01" step="0.01" value={form.amount} onChange={changeField} required />
          </label>
          <label className="subscription-field">
            Siklus tagihan
            <select name="billing_cycle" value={form.billing_cycle} onChange={changeField} required>
              <option value="monthly">Bulanan</option>
              <option value="yearly">Tahunan</option>
            </select>
          </label>
          <label className="subscription-field">
            Jatuh tempo berikutnya
            <input name="due_date" type="date" value={form.due_date} onChange={changeField} required />
          </label>
          {subscription && (
            <label className="subscription-field">
              Status
              <select name="status" value={form.status} onChange={changeField} required>
                <option value="active">Aktif</option>
                <option value="inactive">Dijeda</option>
                <option value="cancelled">Dihentikan</option>
              </select>
            </label>
          )}
        </div>

        <p className="subscription-form-hint">Ini hanya catatan dan pengingat, bukan pembayaran otomatis atau transaksi kas. Perubahan status tidak memengaruhi layanan pihak ketiga. Tagihan tahunan dihitung sebagai rata-rata biaya bulanan (nominal dibagi 12).</p>

        <footer className="subscription-modal-actions">
          <button type="button" className="subscription-button secondary" onClick={onClose} disabled={saving}>Batal</button>
          <button type="submit" className="subscription-button primary" disabled={saving}>
            {saving ? 'Menyimpan...' : subscription ? 'Simpan Perubahan' : 'Tambah Catatan'}
          </button>
        </footer>
      </form>
    </div>
  );
};

const Subscriptions = () => {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [subscriptions, setSubscriptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedSimulationId, setSelectedSimulationId] = useState('');
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busySubscriptionId, setBusySubscriptionId] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadSubscriptions = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/subscriptions');
        if (active) {
          setSubscriptions(response.data.data);
          setSummary(response.data.summary);
          setSelectedSimulationId((current) => (
            response.data.data.some((subscription) => String(subscription.id) === current)
              ? current
              : String(response.data.data.find((subscription) => subscription.status === 'active')?.id ?? '')
          ));
        }
      } catch (requestError) {
        if (active) {
          setError(requestError.response?.data?.message ?? 'Daftar tagihan rutin gagal dimuat. Coba lagi.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadSubscriptions();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const activeSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => subscription.status === 'active'),
    [subscriptions],
  );
  const filteredSubscriptions = useMemo(() => subscriptions.filter((subscription) => {
    const matchesSearch = `${subscription.name} ${subscription.category}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || subscription.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [subscriptions, search, statusFilter]);
  const selectedSimulation = activeSubscriptions.find((subscription) => String(subscription.id) === selectedSimulationId);
  const monthlySavings = selectedSimulation ? monthlyEquivalent(selectedSimulation) : 0;
  const selectedCategoryBreakdown = summary?.category_breakdown ?? [];
  const totalCategorySpending = selectedCategoryBreakdown.reduce((total, item) => total + item.monthly_total, 0);
  const categoryColors = ['#174bb8', '#315dc2', '#587bd1', '#86a0df', '#b6c6ed'];
  const donutBackground = totalCategorySpending > 0
    ? `conic-gradient(${selectedCategoryBreakdown.map((item, index) => {
      const start = selectedCategoryBreakdown.slice(0, index).reduce((total, entry) => total + entry.monthly_total, 0) / totalCategorySpending * 100;
      const end = start + item.monthly_total / totalCategorySpending * 100;
      return `${categoryColors[index % categoryColors.length]} ${start}% ${end}%`;
    }).join(', ')})`
    : '#e2e8f0';
  const dueSoonCount = summary?.due_soon?.length ?? 0;

  const closeForm = () => {
    if (saving) return;
    setEditingSubscription(null);
    setIsCreating(false);
    setFormError('');
  };

  const submitSubscription = async (payload) => {
    setSaving(true);
    setFormError('');
    try {
      if (editingSubscription) {
        await api.put(`/subscriptions/${editingSubscription.id}`, payload);
      } else {
        await api.post('/subscriptions', payload);
      }
      setEditingSubscription(null);
      setIsCreating(false);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      const validationErrors = requestError.response?.data?.errors;
      const firstValidationError = validationErrors ? Object.values(validationErrors).flat()[0] : null;
      setFormError(firstValidationError ?? requestError.response?.data?.message ?? 'Catatan tagihan gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (subscription, status) => {
    setError('');
    setBusySubscriptionId(subscription.id);
    try {
      await api.patch(`/subscriptions/${subscription.id}`, { status });
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? 'Status tagihan gagal diperbarui.');
    } finally {
      setBusySubscriptionId(null);
    }
  };

  const deleteSubscription = async (subscription) => {
    if (!window.confirm(`Hapus subscription ${subscription.name}?`)) return;
    setError('');
    setBusySubscriptionId(subscription.id);
    try {
      await api.delete(`/subscriptions/${subscription.id}`);
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? 'Catatan tagihan gagal dihapus.');
    } finally {
      setBusySubscriptionId(null);
    }
  };

  const openCreateForm = () => {
    setEditingSubscription(null);
    setFormError('');
    setIsCreating(true);
  };

  return (
    <InsightsLayout
      active="subscriptions"
      title={isOwner ? 'Tagihan & Langganan' : 'Tagihan & Langganan Saya'}
      eyebrow="PENCATATAN BERKALA"
    >
      <div className="subscription-content">
        <section className="subscription-page-heading">
          <div>
            <p>Catat layanan berulang, pantau nominal, dan periksa tanggal jatuh tempo.</p>
          </div>
          <div className="subscription-page-actions">
            <button type="button" className="subscription-button primary" onClick={openCreateForm}>+ Tambah Tagihan</button>
          </div>
        </section>

        <section className="subscription-scope-note" aria-label="Batas fungsi tagihan rutin">
          <div>
            <strong>{isOwner ? 'Ruang lingkup Owner' : 'Catatan akun'}</strong>
            <p>{isOwner
              ? 'Owner dapat mengelola catatan dan pengingat pada akunnya sendiri. Data ini tidak dibagikan otomatis ke akun Supervisor atau Staf.'
              : 'Daftar ini hanya berisi catatan pada akun Anda dan tidak dibagikan otomatis ke akun lain.'} Ini bukan pengelolaan paket atau lisensi Bocor Halus; aplikasi belum menyediakan metode pembayaran maupun invoice layanan. Perubahan status hanya berlaku pada catatan ini, bukan pada layanan pihak ketiga, saldo, atau transaksi kas.
            </p>
          </div>
          <span>Catatan saja · tanpa pembayaran</span>
        </section>

        {error && (
          <div className="subscription-alert error" role="alert">
            <span>{error}</span>
            {!loading && (
              <button type="button" className="subscription-button secondary" onClick={() => setRefreshKey((current) => current + 1)}>
                Coba lagi
              </button>
            )}
          </div>
        )}
        {loading && <div className="subscription-loading" role="status">Memuat catatan tagihan...</div>}

        {!loading && !error && (
          <>
            <section className="subscription-overview-grid">
              <MetricCard
                eyebrow="LAYANAN AKTIF"
                title="Catatan berjalan"
                value={summary?.active_count ?? 0}
                footnote="Tidak termasuk yang dijeda atau dihentikan"
                icon="▣"
                tone="blue"
              />
              <MetricCard
                eyebrow="BIAYA BERKALA"
                title="Rata-rata per bulan"
                value={formatCurrency(summary?.monthly_total)}
                footnote="Ekuivalen bulanan dari layanan aktif"
                icon="↻"
                tone="blue"
              />
              <MetricCard
                eyebrow="PORSI ANGGARAN"
                title="Dari rencana bulanan akun"
                value={`${summary?.monthly_budget_share ?? 0}%`}
                footnote={summary?.monthly_budget ? `Berdasarkan ${formatCurrency(summary.monthly_budget)}` : 'Belum ada rencana anggaran bulanan'}
                icon="↗"
                tone="blue"
              />
              <article className={`subscription-upcoming-card ${dueSoonCount ? 'has-due' : ''}`}>
                <span className="subscription-upcoming-icon">◷</span>
                <div>
                  <span className="subscription-eyebrow">JATUH TEMPO DEKAT</span>
                  {dueSoonCount > 0 ? (
                    <>
                      <h2>{dueSoonCount} tagihan perlu diperhatikan</h2>
                      {summary.due_soon.slice(0, 2).map((item) => (
                        <p key={item.id}>
                          <strong>{item.name}</strong> · {item.overdue ? 'Terlambat' : formatDate(item.due_date)}
                        </p>
                      ))}
                    </>
                  ) : summary?.next_due ? (
                    <>
                      <h2>Tagihan berikutnya</h2>
                      <p><strong>{summary.next_due.name}</strong> · {formatDate(summary.next_due.due_date)}</p>
                    </>
                  ) : (
                    <>
                      <h2>Tidak ada tagihan aktif</h2>
                      <p>Tambahkan subscription untuk mulai mengingat jatuh tempo.</p>
                    </>
                  )}
                </div>
              </article>
            </section>

            <section className="subscription-insights-grid">
              <article className="subscription-breakdown-card">
                <div>
                  <span className="subscription-eyebrow">DISTRIBUSI KATEGORI</span>
                  <h2>Rata-rata biaya bulanan</h2>
                  <p>Rincian biaya ekuivalen untuk semua layanan aktif.</p>
                  <div className="subscription-legend">
                    {selectedCategoryBreakdown.map((item, index) => (
                      <div key={item.category}>
                        <span style={{ background: categoryColors[index % categoryColors.length] }} />
                        <span>{item.category}</span>
                        <strong>{formatCurrency(item.monthly_total)}</strong>
                      </div>
                    ))}
                    {selectedCategoryBreakdown.length === 0 && <p>Belum ada subscription aktif.</p>}
                  </div>
                </div>
                <div className="subscription-donut" style={{ background: donutBackground }}>
                  <div><strong>{summary?.active_count ?? 0}</strong><span>Layanan<br />aktif</span></div>
                </div>
              </article>

              <article className="subscription-savings-card">
                <div className="subscription-savings-icon">✦</div>
                <div className="subscription-savings-content">
                  <span className="subscription-eyebrow">SIMULASI PENGHEMATAN</span>
                  <h2>Simulasikan biaya yang bisa dihemat</h2>
                  <p>Pilih layanan yang sedang dipertimbangkan untuk dihentikan. Simulasi ini memperkirakan biaya yang bisa dihemat tanpa mengubah catatan atau layanan pihak ketiga.</p>
                  <div className="subscription-simulation-controls">
                    <select value={selectedSimulationId} onChange={(event) => setSelectedSimulationId(event.target.value)} aria-label="Pilih subscription untuk simulasi">
                      {activeSubscriptions.length === 0 && <option value="">Tidak ada layanan aktif</option>}
                      {activeSubscriptions.map((subscription) => (
                        <option key={subscription.id} value={subscription.id}>{subscription.name}</option>
                      ))}
                    </select>
                    <span>Potensi hemat <strong>{formatCurrency(monthlySavings)} / bulan</strong></span>
                  </div>
                </div>
                {selectedSimulation && (
                  <button type="button" className="subscription-button secondary" onClick={() => {
                    setEditingSubscription(selectedSimulation);
                    setFormError('');
                  }}>
                    Tinjau &amp; edit →
                  </button>
                )}
              </article>
            </section>

            <section className="subscription-table-section">
              <header className="subscription-table-header">
                <div>
                  <h2>Daftar Tagihan Rutin <span>{subscriptions.length}</span></h2>
                  <p>Kelola catatan, status, nominal, dan jatuh tempo. Status hanya berlaku di aplikasi.</p>
                </div>
                <div className="subscription-table-tools">
                  <label className="subscription-search">
                    <span>⌕</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari layanan..." aria-label="Cari subscription" />
                  </label>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter status subscription">
                    <option value="all">Semua status</option>
                    <option value="active">Aktif</option>
                    <option value="inactive">Dijeda</option>
                    <option value="cancelled">Dihentikan</option>
                  </select>
                </div>
              </header>

              <div className="subscription-table-scroll">
                <table className="subscription-table">
                  <thead>
                    <tr>
                      <th>LAYANAN</th>
                      <th>KATEGORI</th>
                      <th>NOMINAL</th>
                      <th>PERIODE</th>
                      <th>JATUH TEMPO</th>
                      <th>STATUS</th>
                      <th>AKSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubscriptions.map((subscription) => (
                      <tr key={subscription.id}>
                        <td><strong>{subscription.name}</strong><small>{cycleLabels[subscription.billing_cycle]} · {formatCurrency(monthlyEquivalent(subscription))}/bln ekuivalen</small></td>
                        <td><span className="subscription-category-pill">{subscription.category}</span></td>
                        <td><strong>{formatCurrency(subscription.amount)}</strong></td>
                        <td>{cycleLabels[subscription.billing_cycle]}</td>
                        <td>{formatDate(subscription.due_date)}</td>
                        <td><span className={`subscription-status ${subscription.status}`}>{statusLabels[subscription.status]}</span></td>
                        <td>
                          <div className="subscription-row-actions">
                            <button type="button" onClick={() => {
                              setEditingSubscription(subscription);
                              setFormError('');
                            }} aria-label={`Edit ${subscription.name}`} title="Edit" disabled={busySubscriptionId === subscription.id}>✎</button>
                            {subscription.status === 'active' ? (
                              <button type="button" onClick={() => updateStatus(subscription, 'inactive')} aria-label={`Jeda catatan ${subscription.name}`} title="Jeda catatan" disabled={busySubscriptionId === subscription.id}>Ⅱ</button>
                            ) : subscription.status === 'inactive' ? (
                              <button type="button" onClick={() => updateStatus(subscription, 'active')} aria-label={`Aktifkan catatan ${subscription.name}`} title="Aktifkan catatan kembali" disabled={busySubscriptionId === subscription.id}>▶</button>
                            ) : null}
                            {subscription.status !== 'cancelled' && (
                              <button type="button" className="danger" onClick={() => updateStatus(subscription, 'cancelled')} aria-label={`Tandai catatan ${subscription.name} dihentikan`} title="Tandai catatan dihentikan" disabled={busySubscriptionId === subscription.id}>⊘</button>
                            )}
                            <button type="button" className="danger" onClick={() => deleteSubscription(subscription)} aria-label={`Hapus catatan ${subscription.name}`} title="Hapus catatan" disabled={busySubscriptionId === subscription.id}>⌫</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredSubscriptions.length === 0 && (
                      <tr><td colSpan="7" className="subscription-empty-state">
                        {subscriptions.length === 0 ? 'Belum ada catatan tagihan. Tambahkan layanan pertama Anda.' : 'Tidak ada catatan yang cocok dengan pencarian atau filter.'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <footer className="subscription-table-footer">
                <span>Menampilkan {filteredSubscriptions.length} dari {subscriptions.length} catatan</span>
                <span>Nominal tahunan diringkas sebagai ekuivalen biaya bulanan.</span>
              </footer>
            </section>
          </>
        )}
        {(isCreating || editingSubscription) && (
          <SubscriptionForm
            key={editingSubscription?.id ?? 'new-subscription'}
            subscription={editingSubscription}
            saving={saving}
            error={formError}
            onClose={closeForm}
            onSubmit={submitSubscription}
          />
        )}
      </div>
    </InsightsLayout>
  );
};

export default Subscriptions;
