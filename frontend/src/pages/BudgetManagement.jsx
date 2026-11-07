import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { notifyFinancialDataChanged } from '../services/financialDataEvents';
import './BudgetManagement.css';

const formatCurrency = (value = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value));

const iconGlyphs = {
  tag: '◇',
  food: '♨',
  car: '↗',
  bus: '▣',
  game: '✦',
  shop: '▤',
  health: '+',
  home: '⌂',
  education: '▱',
  coffee: '☕',
};

const getBudgetStatus = (percentage) => {
  if (percentage >= 80) return { label: 'Kritis', color: '#dc2626', tone: 'critical' };
  if (percentage >= 50) return { label: 'Waspada', color: '#d97706', tone: 'warning' };
  return { label: 'Aman', color: '#059669', tone: 'safe' };
};

const getCurrentPeriod = () => {
  const current = new Date();
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
};

const SharedSidebar = ({ user, onLogout, loadingLogout, active }) => (
  <aside className="finance-sidebar">
    <Link to="/dashboard" className="finance-brand">
      <span className="finance-brand-icon">BH</span>
      <span><strong>Bocor Halus</strong><small>PERSONAL FINANCE</small></span>
    </Link>
    <Link to="/dashboard" className="finance-nav-link"><span>⌂</span> Dashboard</Link>
    <Link to="/expenses" className="finance-nav-link"><span>↕</span> Pengeluaran</Link>
    <Link to="/budgets" className={`finance-nav-link ${active === 'budgets' ? 'active' : ''}`} aria-current={active === 'budgets' ? 'page' : undefined}><span>▤</span> Budget</Link>
    {user?.role === 'owner' && <Link to="/categories" className={`finance-nav-link ${active === 'categories' ? 'active' : ''}`} aria-current={active === 'categories' ? 'page' : undefined}><span>＋</span> Kategori</Link>}
    <Link to="/subscriptions" className="finance-nav-link"><span>↻</span> Subscription</Link>
    <Link to="/reports" className="finance-nav-link"><span>▥</span> Laporan</Link>
    <Link to="/notifications" className="finance-nav-link"><span>♧</span> Notifikasi</Link>
    <div className="finance-sidebar-spacer" />
    <div className="finance-user">
      <span className="finance-avatar">{user?.name?.[0] ?? 'U'}</span>
      <span><strong>{user?.name ?? 'User'}</strong><small>{user?.email ?? ''}</small></span>
    </div>
    <button type="button" className="finance-logout" onClick={onLogout} disabled={loadingLogout}>{loadingLogout ? 'Keluar...' : 'Keluar akun'}</button>
  </aside>
);

const AllocationForm = ({ allocation, categories, saving, error, onCancel, onSubmit }) => {
  const [categoryId, setCategoryId] = useState(allocation ? String(allocation.category_id) : '');
  const [amount, setAmount] = useState(allocation ? String(allocation.amount) : '');

  const submit = (event) => {
    event.preventDefault();
    onSubmit({
      category_id: Number(categoryId),
      amount: Number(amount),
    });
  };

  return (
    <div className="finance-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onCancel();
    }}>
      <form className="finance-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="allocation-title">
        <header className="finance-modal-header">
          <div>
            <span className="finance-eyebrow">RENCANA BULANAN</span>
            <h2 id="allocation-title">{allocation ? 'Ubah Alokasi Budget' : 'Tambah Alokasi Budget'}</h2>
          </div>
          <button type="button" className="finance-close" onClick={onCancel} disabled={saving} aria-label="Tutup">×</button>
        </header>
        {error && <div className="finance-error" role="alert">{error}</div>}
        <label className="finance-field">
          Kategori pengeluaran
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required disabled={Boolean(allocation)}>
            <option value="">Pilih kategori</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="finance-field">
          Alokasi nominal
          <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </label>
        <div className="finance-modal-actions">
          <button type="button" className="finance-button secondary" onClick={onCancel} disabled={saving}>Batal</button>
          <button type="submit" className="finance-button primary" disabled={saving}>{saving ? 'Menyimpan...' : allocation ? 'Simpan Perubahan' : 'Simpan Alokasi'}</button>
        </div>
      </form>
    </div>
  );
};

const BudgetManagement = () => {
  const { user, logout } = useAuth();
  const isOwner = user?.role === 'owner';
  const navigate = useNavigate();
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [plan, setPlan] = useState(null);
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [subscriptionSummary, setSubscriptionSummary] = useState(null);
  const [targetAmount, setTargetAmount] = useState('');
  const [editingTarget, setEditingTarget] = useState(false);
  const [allocationForm, setAllocationForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingLogout, setLoadingLogout] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedYear, selectedMonth] = period.split('-').map(Number);
  const periodLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });

  const loadPage = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const [year, month] = period.split('-').map(Number);
      const [plansResponse, categoriesResponse, dashboardResponse, subscriptionsResponse] = await Promise.all([
        api.get('/monthly-plans', { params: { month, year }, signal }),
        api.get('/categories', { signal }),
        api.get('/dashboard', { params: { month, year }, signal }),
        api.get('/subscriptions', { signal }),
      ]);
      const currentPlan = plansResponse.data.data[0] ?? null;
      const allocationResponse = currentPlan
        ? await api.get('/budgets', { params: { monthly_plan_id: currentPlan.id }, signal })
        : null;
      setPlan(currentPlan);
      setTargetAmount(currentPlan ? String(Number(currentPlan.total_budget)) : '');
      setCategories(categoriesResponse.data.data);
      setBudgets(allocationResponse?.data.data ?? []);
      setDashboard(dashboardResponse.data.data);
      setSubscriptionSummary(subscriptionsResponse.data.summary);
    } catch (requestError) {
      if (requestError.code !== 'ERR_CANCELED') {
        setError(requestError.response?.data?.message ?? 'Data budget gagal dimuat. Coba lagi.');
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => loadPage(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadPage, refreshKey]);

  const allocated = useMemo(
    () => budgets.reduce((sum, budget) => sum + Number(budget.amount), 0),
    [budgets],
  );
  const spent = Number(dashboard?.summary?.spent_total ?? 0);
  const totalBudget = Number(plan?.total_budget ?? 0);
  const unallocated = totalBudget - allocated;
  const utilization = totalBudget > 0 ? Math.round((allocated / totalBudget) * 1000) / 10 : 0;
  const spentPercentage = totalBudget > 0 ? Math.round((spent / totalBudget) * 1000) / 10 : 0;
  const availableCategories = categories.filter(
    (category) => !budgets.some((budget) => budget.category_id === category.id),
  );

  const handleLogout = async () => {
    setLoadingLogout(true);
    try {
      await logout();
      navigate('/login');
    } finally {
      setLoadingLogout(false);
    }
  };

  const savePlan = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post('/monthly-plans', {
        month: selectedMonth,
        year: selectedYear,
        total_budget: Number(targetAmount),
      });
      setPlan(response.data.data);
      setEditingTarget(false);
      setNotice('Target budget bulanan berhasil disimpan.');
      notifyFinancialDataChanged();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      const errors = requestError.response?.data?.errors;
      setError(errors ? Object.values(errors).flat()[0] : requestError.response?.data?.message ?? 'Target budget gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const saveAllocation = async (values) => {
    setSaving(true);
    setFormError('');
    try {
      if (allocationForm.allocation) {
        await api.put(`/budgets/${allocationForm.allocation.id}`, { amount: values.amount });
      } else {
        await api.post('/budgets', {
          monthly_plan_id: plan.id,
          category_id: values.category_id,
          amount: values.amount,
        });
      }
      setAllocationForm(null);
      setNotice('Alokasi budget berhasil disimpan.');
      notifyFinancialDataChanged();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      const errors = requestError.response?.data?.errors;
      setFormError(errors ? Object.values(errors).flat()[0] : requestError.response?.data?.message ?? 'Alokasi gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAllocation = async (budget) => {
    if (!window.confirm(`Hapus alokasi budget ${budget.category.name}? Transaksi tetap tersimpan tanpa alokasi kategori.`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/budgets/${budget.id}`);
      setNotice('Alokasi budget berhasil dihapus.');
      notifyFinancialDataChanged();
      setRefreshKey((current) => current + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? 'Alokasi gagal dihapus.');
    }
  };

  return (
    <div className="finance-app">
      <SharedSidebar user={user} onLogout={handleLogout} loadingLogout={loadingLogout} active="budgets" />
      <main className="finance-main">
        <header className="finance-topbar">
          <div className="finance-breadcrumb"><Link to="/dashboard">Dashboard</Link><span>/</span><strong>Budget &amp; Kategori</strong></div>
          <div className="finance-topbar-actions">
            <label className="finance-period-label">
              Periode
              <input type="month" aria-label="Periode budget" value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
            {isOwner && <Link className="finance-button secondary" to="/categories">Kelola Kategori</Link>}
            <span className="finance-avatar">{user?.name?.[0] ?? 'U'}</span>
          </div>
        </header>

        <section className="finance-page-heading">
          <div>
            <span className="finance-eyebrow">RENCANA KEUANGAN</span>
            <h1>Manajemen Budget Bulanan</h1>
            <p>{isOwner
              ? 'Atur rencana pengeluaran dan alokasi budget kategori agar pengeluaran tetap terkendali.'
              : 'Pantau rencana pengeluaran dan alokasi budget kategori usaha.'}</p>
          </div>
          {isOwner && <Link className="finance-button secondary" to="/categories">＋ Tambah Kategori</Link>}
        </section>

        {error && <div className="finance-error finance-page-message" role="alert">{error}</div>}
        {notice && <div className="finance-notice finance-page-message" role="status">{notice}</div>}
        {loading && <div className="finance-loading" role="status">Memuat data budget...</div>}

        {!loading && (
          <>
            <section className="finance-plan-card">
              <div className="finance-plan-copy">
                <span className="finance-eyebrow">TARGET BULANAN</span>
                <h2>Rencana pengeluaran {periodLabel}</h2>
                <p>Tentukan batas pengeluaran bulanan untuk memantau sisa budget dan mencegah kebocoran.</p>
              </div>
              {(editingTarget || !plan) && isOwner ? (
                <form className="finance-target-form" onSubmit={savePlan}>
                  <label className="finance-field">
                    Target budget
                    <div className="finance-input-prefix"><span>Rp</span><input type="number" min={allocated} step="0.01" value={targetAmount} onChange={(event) => setTargetAmount(event.target.value)} required /></div>
                  </label>
                  {plan && <button type="button" className="finance-button secondary" onClick={() => setEditingTarget(false)}>Batal</button>}
                  <button type="submit" className="finance-button primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan Target'}</button>
                </form>
              ) : plan ? (
                <div className="finance-plan-value">
                  <span>Total rencana pengeluaran</span>
                  <strong>{formatCurrency(totalBudget)}</strong>
                  {isOwner && <button type="button" className="finance-button secondary" onClick={() => setEditingTarget(true)}>Ubah Target</button>}
                </div>
              ) : null}
            </section>

            {!plan && (
              <div className="finance-notice finance-page-message">
                {isOwner
                  ? `Belum ada target untuk ${periodLabel}. Simpan target bulanan untuk mulai membuat alokasi.`
                  : `Belum ada target budget untuk ${periodLabel}.`}
              </div>
            )}

            <div className="finance-management-grid">
              <section className="finance-allocation-section">
                <header className="finance-section-header">
                  <div><span className="finance-eyebrow">ALOKASI PENGELUARAN</span><h2>Alokasi Budget</h2><p>Rincian batas pengeluaran untuk tiap kategori.</p></div>
                  {isOwner && <button
                    type="button"
                    className="finance-button primary"
                    disabled={!plan || availableCategories.length === 0}
                    onClick={() => {
                      setFormError('');
                      setAllocationForm({ allocation: null });
                    }}
                  >
                    ＋ Tambah Kategori
                  </button>}
                </header>

                {budgets.length > 0 ? (
                  <div className="finance-allocation-list">
                    {budgets.map((budget) => {
                      const budgetAmount = Number(budget.amount);
                      const categorySpent = Number(budget.spent_amount ?? 0);
                      const progress = budgetAmount > 0 ? categorySpent / budgetAmount * 100 : 0;
                      const status = getBudgetStatus(progress);
                      const category = budget.category;
                      return (
                        <article className="finance-allocation-card" key={budget.id}>
                          <div className="finance-category-icon" style={{ backgroundColor: `${category.color}18`, color: category.color }}>
                            {iconGlyphs[category.icon] ?? category.icon ?? '◇'}
                          </div>
                          <div className="finance-allocation-body">
                            <div className="finance-allocation-heading">
                              <div><h3>{category.name}</h3><p>{category.description || 'Budget kategori periode ini'}</p></div>
                              <div className="finance-allocation-numbers">
                                <strong>{formatCurrency(budgetAmount)}</strong>
                                <span>Terpakai {formatCurrency(categorySpent)}</span>
                              </div>
                            </div>
                            <div className="finance-progress-track"><div style={{ width: `${Math.min(progress, 100)}%`, background: status.color }} /></div>
                            <div className="finance-progress-caption">
                              <span>{Math.round(progress)}% digunakan · Sisa {formatCurrency(budgetAmount - categorySpent)}</span>
                              <span className={`finance-status ${status.tone}`}>{status.label}</span>
                            </div>
                          </div>
                          {isOwner && <div className="finance-allocation-actions">
                            <button type="button" title="Ubah alokasi" aria-label={`Ubah budget ${category.name}`} onClick={() => {
                              setFormError('');
                              setAllocationForm({ allocation: budget });
                            }}>✎</button>
                            <button type="button" className="danger" title="Hapus alokasi" aria-label={`Hapus budget ${category.name}`} onClick={() => deleteAllocation(budget)}>⌫</button>
                          </div>}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="finance-empty-state">
                    <span>▤</span><strong>Belum ada alokasi budget</strong>
                    <p>Buat kategori, lalu tentukan alokasi budget agar pengeluaran dapat dipantau.</p>
                    {isOwner && <Link className="finance-button secondary" to="/categories">Kelola Kategori</Link>}
                  </div>
                )}
              </section>

              <aside className="finance-budget-aside">
                <section className="finance-summary-card">
                  <header><div><span className="finance-eyebrow">RINGKASAN ALOKASI</span><h2>Distribusi budget</h2></div><span className="finance-status safe">{utilization >= 100 ? 'Penuh' : 'Terkendali'}</span></header>
                  <div className="finance-summary-progress"><div style={{ width: `${Math.min(utilization, 100)}%` }} /></div>
                  <div className="finance-summary-percent">{utilization}% dari target dialokasikan</div>
                  <dl>
                    <div><dt>Total budget</dt><dd>{formatCurrency(totalBudget)}</dd></div>
                    <div><dt>Total dialokasikan</dt><dd>{formatCurrency(allocated)}</dd></div>
                    <div><dt>Belum dialokasikan</dt><dd className={unallocated < 0 ? 'negative' : 'positive'}>{formatCurrency(unallocated)}</dd></div>
                    <div><dt>Pengeluaran aktual</dt><dd>{formatCurrency(spent)}</dd></div>
                    <div><dt>Sisa keseluruhan</dt><dd className={totalBudget - spent < 0 ? 'negative' : 'positive'}>{formatCurrency(totalBudget - spent)}</dd></div>
                  </dl>
                  <div className="finance-spending-summary">
                    <span>Pemakaian target bulanan</span><strong>{spentPercentage}%</strong>
                    <div className="finance-summary-progress"><div className={spentPercentage >= 80 ? 'critical' : ''} style={{ width: `${Math.min(spentPercentage, 100)}%` }} /></div>
                  </div>
                </section>

                <section className="finance-summary-card">
                  <header><div><span className="finance-eyebrow">SUBSCRIPTION BULAN INI</span><h2>Tagihan rutin</h2></div><Link to="/subscriptions">Lihat semua →</Link></header>
                  {(subscriptionSummary?.due_soon ?? []).slice(0, 2).map((subscription) => (
                    <div className="finance-subscription-row" key={subscription.id}>
                      <span className="finance-subscription-icon">↻</span>
                      <span><strong>{subscription.name}</strong><small>Jatuh tempo {subscription.due_date}</small></span>
                      <strong>{formatCurrency(subscription.amount)}</strong>
                    </div>
                  ))}
                  <div className="finance-subscription-total"><span>Total beban bulanan</span><strong>{formatCurrency(subscriptionSummary?.monthly_total)}</strong></div>
                  {!(subscriptionSummary?.due_soon ?? []).length && <p className="finance-aside-hint">Tidak ada tagihan yang jatuh tempo dalam tujuh hari ke depan.</p>}
                </section>

                <section className="finance-aside-tip"><span>✦</span><p><strong>Panduan alokasi</strong> Sisakan sebagian target sebagai ruang fleksibel. Status kategori berubah menjadi Waspada pada 50% dan Kritis pada 80% pemakaian.</p></section>
              </aside>
            </div>
          </>
        )}
      </main>
      {allocationForm && (
        <AllocationForm
          key={allocationForm.allocation?.id ?? 'new-allocation'}
          allocation={allocationForm.allocation}
          categories={allocationForm.allocation ? [allocationForm.allocation.category] : availableCategories}
          saving={saving}
          error={formError}
          onCancel={() => {
            if (!saving) {
              setAllocationForm(null);
              setFormError('');
            }
          }}
          onSubmit={saveAllocation}
        />
      )}
    </div>
  );
};

export default BudgetManagement;
