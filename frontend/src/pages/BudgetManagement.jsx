import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
  if (percentage >= 80) return { label: 'Kritis', tone: 'critical' };
  if (percentage >= 50) return { label: 'Waspada', tone: 'warning' };
  return { label: 'Aman', tone: 'safe' };
};

const getCurrentPeriod = () => {
  const current = new Date();
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
};

const downloadBudgetCsv = (periodLabel, plan, rows, summary) => {
  const data = [
    ['Anggaran Operasional', periodLabel],
    ['Total pagu', plan?.total_budget ?? 0],
    ['Realisasi pengeluaran', summary.spent],
    ['Sisa pagu', summary.remaining],
    [],
    ['Kategori', 'Keterangan', 'Pagu', 'Realisasi', 'Sisa', 'Serapan (%)', 'Status'],
    ...rows.map((row) => [
      row.category?.name ?? 'Kategori',
      row.category?.description ?? '',
      row.amount,
      row.spent,
      row.remaining,
      row.percentage.toFixed(1),
      row.status.label,
    ]),
  ];
  const csv = data.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `anggaran-operasional-${periodLabel.toLowerCase().replaceAll(' ', '-')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

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
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [plan, setPlan] = useState(null);
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [report, setReport] = useState(null);
  const [trendError, setTrendError] = useState('');
  const [subscriptionSummary, setSubscriptionSummary] = useState(null);
  const [targetAmount, setTargetAmount] = useState('');
  const [editingTarget, setEditingTarget] = useState(false);
  const [allocationForm, setAllocationForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
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
      let reportResponse = null;
      try {
        reportResponse = await api.get('/reports', { params: { month, year }, signal });
        setTrendError('');
      } catch (reportError) {
        if (reportError.code === 'ERR_CANCELED') throw reportError;
        setTrendError('Tren serapan tidak dapat dimuat saat ini.');
      }
      const currentPlan = plansResponse.data.data[0] ?? null;
      const allocationResponse = currentPlan
        ? await api.get('/budgets', { params: { monthly_plan_id: currentPlan.id }, signal })
        : null;
      setPlan(currentPlan);
      setTargetAmount(currentPlan ? String(Number(currentPlan.total_budget)) : '');
      setCategories(categoriesResponse.data.data);
      setBudgets(allocationResponse?.data.data ?? []);
      setDashboard(dashboardResponse.data.data);
      setReport(reportResponse?.data.data ?? null);
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
  const spent = Number(dashboard?.summary?.expense_total ?? dashboard?.summary?.spent_total ?? 0);
  const totalBudget = Number(plan?.total_budget ?? 0);
  const unallocated = totalBudget - allocated;
  const spentPercentage = totalBudget > 0 ? Math.round((spent / totalBudget) * 1000) / 10 : 0;
  const budgetRows = useMemo(() => budgets.map((budget) => {
    const amount = Number(budget.amount);
    const categorySpent = Number(budget.spent_amount ?? 0);
    const percentage = amount > 0 ? categorySpent / amount * 100 : 0;

    return {
      ...budget,
      amount,
      spent: categorySpent,
      percentage,
      remaining: amount - categorySpent,
      status: getBudgetStatus(percentage),
    };
  }), [budgets]);
  const attentionRows = budgetRows.filter((budget) => budget.percentage >= 80);
  const warningRows = budgetRows.filter((budget) => budget.percentage >= 50 && budget.percentage < 80);
  const filteredBudgets = budgetRows.filter((budget) => {
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'safe' && budget.percentage < 50)
      || (statusFilter === 'warning' && budget.percentage >= 50 && budget.percentage < 80)
      || (statusFilter === 'critical' && budget.percentage >= 80);
    const query = searchTerm.trim().toLocaleLowerCase('id-ID');
    const matchesSearch = !query
      || budget.category?.name?.toLocaleLowerCase('id-ID').includes(query)
      || budget.category?.description?.toLocaleLowerCase('id-ID').includes(query);

    return matchesStatus && matchesSearch;
  });
  const availableCategories = categories.filter(
    (category) => category.type === 'expense'
      && !budgets.some((budget) => budget.category_id === category.id),
  );
  const daysInPeriod = new Date(selectedYear, selectedMonth, 0).getDate();
  const today = new Date();
  const isCurrentPeriod = selectedYear === today.getFullYear() && selectedMonth === today.getMonth() + 1;
  const elapsedDays = isCurrentPeriod ? today.getDate() : daysInPeriod;
  const projectedSpent = isCurrentPeriod && elapsedDays > 0
    ? spent / elapsedDays * daysInPeriod
    : null;
  const dailyTrend = useMemo(() => {
    if (totalBudget <= 0) return [];
    const dailyTotals = new Map((report?.daily_spending ?? []).map((day) => [
      Number(day.date.slice(-2)),
      Number(day.total),
    ]));
    if (!dailyTotals.size) return [];
    const sampleDays = [...new Set([1, 7, 14, 21, 28, elapsedDays])]
      .filter((day) => day <= elapsedDays);
    let cumulative = 0;
    let lastDay = 0;
    return sampleDays.map((day) => {
      for (let currentDay = lastDay + 1; currentDay <= day; currentDay += 1) {
        cumulative += dailyTotals.get(currentDay) ?? 0;
      }
      lastDay = day;
      return {
        day,
        actual: cumulative / totalBudget * 100,
        ideal: day / daysInPeriod * 100,
      };
    });
  }, [report, totalBudget, daysInPeriod, elapsedDays]);
  const chartY = (percentage) => 140 - Math.min(100, Math.max(0, percentage)) * 1.2;
  const chartX = (day) => 40 + (day - 1) * (440 / (daysInPeriod - 1));

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

  const openAllocationForm = () => {
    if (!plan) {
      setEditingTarget(true);
      return;
    }
    setFormError('');
    setAllocationForm({ allocation: null });
  };

  const dailyTrendPoints = dailyTrend.map((point) => (
    `${chartX(point.day)},${chartY(point.actual)}`
  )).join(' ');
  const idealTrendPoints = dailyTrend.map((point) => (
    `${chartX(point.day)},${chartY(point.ideal)}`
  )).join(' ');
  const actualAreaPoints = dailyTrend.length
    ? `40,140 ${dailyTrendPoints} ${chartX(dailyTrend[dailyTrend.length - 1].day)},140`
    : '';

  return (
    <div className="owner-module-content budget-page-shell">
      <div className="owner-module-main budget-dashboard">
        <header className="budget-page-header">
          <div className="budget-page-heading">
            <div className="budget-breadcrumb">
              <span>ANGGARAN &amp; KONTROL</span><i>/</i><strong>MODE {user?.role?.toUpperCase() ?? 'PENGGUNA'}</strong>
            </div>
            <h1>Anggaran Operasional &amp; Pengendalian Biaya</h1>
            <p>{isOwner
              ? 'Atur pagu bulanan, alokasi kategori, dan pantau realisasi pengeluaran usaha.'
              : 'Pantau pagu dan realisasi anggaran usaha sesuai akses Anda.'}</p>
          </div>
          <div className="budget-header-actions">
            <label className="budget-period-picker">
              <span>Periode</span>
              <input type="month" aria-label="Periode anggaran" value={period} onChange={(event) => setPeriod(event.target.value)} />
            </label>
            {isOwner && (
              <button type="button" className="budget-button secondary" onClick={() => setEditingTarget(true)}>
                {plan ? 'Ubah target' : 'Atur target'}
              </button>
            )}
            <button
              type="button"
              className="budget-button secondary"
              disabled={!plan}
              onClick={() => downloadBudgetCsv(periodLabel, plan, budgetRows, {
                spent,
                remaining: totalBudget - spent,
              })}
            >
              Ekspor CSV
            </button>
            {isOwner && (
              <button
                type="button"
                className="budget-button primary"
                disabled={Boolean(plan && availableCategories.length === 0)}
                onClick={openAllocationForm}
              >
                + Alokasi anggaran
              </button>
            )}
          </div>
        </header>

        {error && <div className="finance-error finance-page-message" role="alert">{error}</div>}
        {notice && <div className="finance-notice finance-page-message" role="status">{notice}</div>}
        {loading && <div className="finance-loading" role="status">Memuat data budget...</div>}

        {!loading && (
          <>
            <section className="budget-kpi-grid" aria-label="Ringkasan anggaran">
              <article className="budget-kpi-card">
                <div className="budget-kpi-label"><span>Total pagu operasional</span><i aria-hidden="true">▤</i></div>
                <strong>{formatCurrency(totalBudget)}</strong>
                <small>Pagu bulanan · {periodLabel}</small>
                <div className="budget-kpi-foot"><span>Total dialokasikan ke kategori</span><b>{formatCurrency(allocated)}</b></div>
              </article>
              <article className="budget-kpi-card">
                <div className="budget-kpi-label"><span>Realisasi pengeluaran</span><i aria-hidden="true">↗</i></div>
                <strong>{formatCurrency(spent)}</strong>
                <small>{spentPercentage.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari pagu bulanan</small>
                <div className="budget-kpi-progress"><i className={spentPercentage >= 80 ? 'critical' : ''} style={{ width: `${Math.min(spentPercentage, 100)}%` }} /></div>
              </article>
              <article className="budget-kpi-card">
                <div className="budget-kpi-label"><span>Sisa anggaran tersedia</span><i aria-hidden="true">◉</i></div>
                <strong className={totalBudget - spent < 0 ? 'is-over' : ''}>{formatCurrency(totalBudget - spent)}</strong>
                <small>{totalBudget > 0 ? `${Math.max(0, 100 - spentPercentage).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari pagu` : 'Belum ada pagu periode ini'}</small>
                <div className="budget-kpi-foot"><span>Belum dialokasikan</span><b>{formatCurrency(unallocated)}</b></div>
              </article>
              <article className={`budget-kpi-card ${attentionRows.length ? 'attention' : ''}`}>
                <div className="budget-kpi-label"><span>Pos perlu perhatian</span><i aria-hidden="true">!</i></div>
                <strong>{attentionRows.length} <small>pos kritis</small></strong>
                <small>{warningRows.length} pos berstatus waspada</small>
                {attentionRows[0]
                  ? <div className="budget-kpi-foot"><span>{attentionRows[0].category?.name}</span><b>Sisa {formatCurrency(attentionRows[0].remaining)}</b></div>
                  : <div className="budget-kpi-foot"><span>Tidak ada pos mencapai 80%</span><b>Periode ini</b></div>}
              </article>
            </section>

            <section className={`budget-alert-banner ${attentionRows.length ? 'critical' : 'calm'}`}>
              <span className="budget-alert-icon" aria-hidden="true">{attentionRows.length ? '!' : '✓'}</span>
              <div>
                <strong>{attentionRows.length ? 'Perhatian: serapan anggaran tinggi' : 'Pemantauan anggaran aktif'}</strong>
                <p>
                  {attentionRows.length
                    ? `${attentionRows[0].category?.name} telah menggunakan ${attentionRows[0].percentage.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dari pagu (${formatCurrency(attentionRows[0].spent)} dari ${formatCurrency(attentionRows[0].amount)}). Pengajuan tidak otomatis dikunci oleh sistem.`
                    : `Status pos berubah menjadi Waspada pada 50% dan Kritis pada 80%. ${warningRows.length ? `${warningRows.length} pos saat ini perlu dipantau.` : 'Belum ada pos yang mencapai ambang waspada.'}`}
                </p>
              </div>
              {attentionRows.length > 0 && <a href="#budget-allocations">Tinjau pos anggaran</a>}
            </section>

            <section className={`finance-plan-card budget-target-editor ${isOwner && (editingTarget || !plan) ? 'is-visible' : ''}`}>
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

            <section className="budget-table-panel" id="budget-allocations">
              <header className="budget-table-header">
                <div>
                  <span className="budget-overline">MONITORING POS ANGGARAN BULANAN</span>
                  <h2>Realisasi dan kontrol anggaran</h2>
                </div>
                <span className="budget-period-caption">{periodLabel}</span>
              </header>
              <div className="budget-table-toolbar">
                <div className="budget-status-tabs" role="group" aria-label="Filter status anggaran">
                  {[
                    ['all', `Semua pos (${budgetRows.length})`],
                    ['safe', 'Aman'],
                    ['warning', `Waspada (${warningRows.length})`],
                    ['critical', `Kritis (${attentionRows.length})`],
                  ].map(([filter, label]) => (
                    <button
                      type="button"
                      key={filter}
                      className={statusFilter === filter ? 'active' : ''}
                      aria-pressed={statusFilter === filter}
                      onClick={() => setStatusFilter(filter)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="budget-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Cari nama atau keterangan kategori"
                    aria-label="Cari kategori anggaran"
                  />
                </label>
              </div>

              {budgetRows.length ? (
                <div className="budget-table-scroll">
                  <table className="budget-table">
                    <thead>
                      <tr>
                        <th scope="col">Pos anggaran</th>
                        <th scope="col">Pagu</th>
                        <th scope="col">Realisasi berjalan</th>
                        <th scope="col">Sisa pagu</th>
                        <th scope="col">Status kontrol</th>
                        {isOwner && <th scope="col">Tindakan</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBudgets.map((budget) => (
                        <tr className={budget.percentage >= 80 ? 'budget-row-critical' : ''} key={budget.id}>
                          <td>
                            <div className="budget-category-cell">
                              <span className="budget-category-icon" style={{ '--category-color': budget.category?.color ?? '#334155' }}>
                                {iconGlyphs[budget.category?.icon] ?? '◇'}
                              </span>
                              <span>
                                <strong>{budget.category?.name ?? 'Kategori'}</strong>
                                <small>{budget.category?.description || 'Alokasi pengeluaran periode ini'}</small>
                              </span>
                            </div>
                          </td>
                          <td className="budget-money-cell">{formatCurrency(budget.amount)}</td>
                          <td>
                            <div className="budget-realization">
                              <div>
                                <strong>{formatCurrency(budget.spent)}</strong>
                                <span>{budget.percentage.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%</span>
                              </div>
                              <div className="budget-row-progress">
                                <i className={budget.status.tone} style={{ width: `${Math.min(budget.percentage, 100)}%` }} />
                              </div>
                            </div>
                          </td>
                          <td>
                            <strong className={budget.remaining < 0 ? 'budget-negative' : ''}>{formatCurrency(budget.remaining)}</strong>
                            <small className="budget-cell-note">{budget.remaining < 0 ? 'Melebihi pagu' : 'tersedia'}</small>
                          </td>
                          <td>
                            <span className={`budget-status-pill ${budget.status.tone}`}>
                              {budget.percentage > 100 ? 'Melebihi pagu' : budget.percentage >= 80 ? 'Perlu ditinjau' : budget.percentage >= 50 ? 'Pantau' : 'Terkendali'}
                            </span>
                          </td>
                          {isOwner && (
                            <td>
                              <div className="budget-row-actions">
                                <button
                                  type="button"
                                  title="Ubah pagu kategori"
                                  aria-label={`Ubah pagu ${budget.category?.name ?? 'kategori'}`}
                                  onClick={() => {
                                    setFormError('');
                                    setAllocationForm({ allocation: budget });
                                  }}
                                >
                                  Ubah
                                </button>
                                <button
                                  type="button"
                                  className="remove"
                                  title="Hapus alokasi"
                                  aria-label={`Hapus alokasi ${budget.category?.name ?? 'kategori'}`}
                                  onClick={() => deleteAllocation(budget)}
                                >
                                  Hapus
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                      {!filteredBudgets.length && (
                        <tr>
                          <td className="budget-filter-empty" colSpan={isOwner ? 6 : 5}>
                            Tidak ada kategori yang cocok dengan pencarian atau filter ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">Total alokasi ({budgets.length} pos)</th>
                        <td>{formatCurrency(allocated)}</td>
                        <td>{formatCurrency(budgetRows.reduce((sum, budget) => sum + budget.spent, 0))}</td>
                        <td>{formatCurrency(allocated - budgetRows.reduce((sum, budget) => sum + budget.spent, 0))}</td>
                        <td colSpan={isOwner ? 2 : 1}>Sisa pagu bulanan: {formatCurrency(unallocated)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="budget-empty-state">
                  <strong>Belum ada alokasi untuk periode ini</strong>
                  <p>Buat target bulanan dan alokasikan anggaran ke kategori pengeluaran.</p>
                  {isOwner && <button type="button" className="budget-button primary" onClick={openAllocationForm}>Buat alokasi pertama</button>}
                </div>
              )}
              <p className="budget-table-note">Realisasi dihitung dari transaksi pengeluaran berstatus terposting pada periode ini. Nilai sisa dapat negatif jika realisasi melebihi pagu.</p>
            </section>

            <section className="budget-analytics-grid">
              <article className="budget-analytics-panel">
                <header className="budget-panel-heading">
                  <div>
                    <span className="budget-overline">TREN SERAPAN ANGGARAN</span>
                    <h2>Realisasi harian dan acuan pagu</h2>
                    <p>Realisasi dihitung kumulatif dari transaksi pengeluaran terposting.</p>
                  </div>
                  <div className="budget-chart-legend">
                    <span><i className="actual" />Realisasi</span>
                    <span><i className="ideal" />Acuan merata</span>
                  </div>
                </header>
                {trendError && <p className="budget-chart-error" role="status">{trendError}</p>}
                {totalBudget > 0 && dailyTrend.length ? (
                  <>
                    <div className="budget-chart-frame">
                      <svg viewBox="0 0 500 170" role="img" aria-label={`Grafik serapan pagu harian ${periodLabel}`}>
                        {[0, 25, 50, 75, 100].map((value) => (
                          <g key={value}>
                            <line x1="40" x2="480" y1={chartY(value)} y2={chartY(value)} className="budget-chart-gridline" />
                            <text x="32" y={chartY(value) + 3} textAnchor="end" className="budget-chart-axis">{value}%</text>
                          </g>
                        ))}
                        <polygon points={actualAreaPoints} className="budget-chart-area" />
                        {dailyTrend.length > 1 && <polyline points={idealTrendPoints} className="budget-chart-ideal-line" />}
                        {dailyTrend.length > 1 && <polyline points={dailyTrendPoints} className="budget-chart-actual-line" />}
                        {dailyTrend.map((point) => (
                          <circle key={point.day} cx={chartX(point.day)} cy={chartY(point.actual)} r="3.5" className="budget-chart-point" />
                        ))}
                        {dailyTrend.map((point) => (
                          <text key={`day-${point.day}`} x={chartX(point.day)} y="160" textAnchor="middle" className="budget-chart-axis">
                            {point.day}
                          </text>
                        ))}
                      </svg>
                    </div>
                    <div className="budget-projection-card">
                      <div>
                        <span className="budget-overline">{isCurrentPeriod ? 'ESTIMASI BERDASARKAN RERATA BERJALAN' : 'RINGKASAN PERIODE'}</span>
                        <strong>{projectedSpent === null ? `${spentPercentage.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% terserap` : formatCurrency(projectedSpent)}</strong>
                        <p>{projectedSpent === null
                          ? `Realisasi periode ${periodLabel}: ${formatCurrency(spent)} dari pagu ${formatCurrency(totalBudget)}.`
                          : `Perkiraan jika rerata pengeluaran harian sampai hari ke-${elapsedDays} berlanjut hingga akhir bulan.`}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="budget-empty-state compact">
                    <strong>{totalBudget > 0 ? 'Tren belum tersedia' : 'Tetapkan target untuk melihat tren serapan'}</strong>
                    <p>{totalBudget > 0 ? 'Belum ada data pengeluaran terposting pada periode ini.' : 'Grafik membutuhkan target anggaran bulanan.'}</p>
                  </div>
                )}
              </article>

              <aside className="budget-policy-stack">
                <section className="budget-policy-panel">
                  <header className="budget-panel-heading">
                    <div><span className="budget-overline">KONTROL ANGGARAN</span><h2>Aturan yang berlaku</h2></div>
                    <span className="budget-policy-count">3 aturan</span>
                  </header>
                  <ul>
                    <li><i>01</i><span><strong>Batas total pagu</strong><small>Jumlah alokasi tidak dapat melebihi target bulanan.</small></span></li>
                    <li><i>02</i><span><strong>Pemantauan serapan</strong><small>Status Waspada dimulai 50%; status Kritis dimulai 80%.</small></span></li>
                    <li><i>03</i><span><strong>Approval terpisah</strong><small>Pengajuan tetap mengikuti kebijakan approval usaha; status anggaran tidak otomatis memblokir pengajuan.</small></span></li>
                  </ul>
                  {isOwner && <Link className="budget-policy-link" to="/settings">Lihat kebijakan usaha <span>→</span></Link>}
                </section>

                <section className="budget-subscription-panel">
                  <header className="budget-panel-heading">
                    <div><span className="budget-overline">TAGIHAN RUTIN</span><h2>Subscription mendatang</h2></div>
                    <Link to="/subscriptions">Lihat semua →</Link>
                  </header>
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
              </aside>
            </section>

          </>
        )}
      </div>
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
