import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import InsightsLayout from '../components/InsightsLayout';
import './Reports.css';

const currentDate = new Date();
const monthNames = Array.from({ length: 12 }, (_, index) => new Date(2000, index, 1)
  .toLocaleDateString('id-ID', { month: 'long' }));
const currency = (value = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value));
const formatPeriod = (year, month) => new Date(year, month - 1, 1)
  .toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
const formatDifference = (current, previous) => {
  const difference = Number(current ?? 0) - Number(previous ?? 0);
  if (difference === 0) return '—';
  return `${difference > 0 ? '+' : '−'}${currency(Math.abs(difference))}`;
};
const formatShare = (value, total) => (total > 0
  ? `${(value / total * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`
  : '—');
const mergeCategoryRows = (currentRows = [], previousRows = []) => {
  const rows = new Map();
  previousRows.forEach((item) => rows.set(item.category, {
    category: item.category,
    current: 0,
    previous: Number(item.total),
  }));
  currentRows.forEach((item) => {
    const row = rows.get(item.category) ?? { category: item.category, current: 0, previous: 0 };
    row.current = Number(item.total);
    rows.set(item.category, row);
  });
  return [...rows.values()].sort((first, second) => (
    second.current - first.current || first.category.localeCompare(second.category, 'id')
  ));
};
const downloadCsv = (report, year, month) => {
  const summary = report.summary;
  const previousIncome = new Map(report.previous_category_income.map((item) => [item.category, item.total]));
  const previousExpense = new Map(report.previous_category_spending.map((item) => [item.category, item.total]));
  const rows = [
    ['Laporan keuangan', formatPeriod(year, month)],
    ['Cakupan', report.scope === 'own_activity' ? 'Aktivitas sendiri' : 'Seluruh usaha'],
    [],
    ['Ringkasan', 'Nilai'],
    ['Total pemasukan', summary.selected_month_income],
    ['Total pengeluaran', summary.selected_month_total],
    ['Arus kas bersih', summary.selected_month_net_flow],
    ['Target anggaran', summary.selected_month_budget],
    ['Selisih anggaran', summary.budget_variance],
    [],
    ['Jenis', 'Kategori', formatPeriod(year, month), formatPeriod(report.previous_period.year, report.previous_period.month)],
    ...report.category_income.map((item) => [
      'Pemasukan', item.category, item.total, previousIncome.get(item.category) ?? 0,
    ]),
    ['Total pemasukan', '', summary.selected_month_income, summary.previous_month_income],
    ...report.category_spending.map((item) => [
      'Pengeluaran', item.category, item.total, previousExpense.get(item.category) ?? 0,
    ]),
    ['Total pengeluaran', '', summary.selected_month_total, summary.previous_month_total],
    ['Arus kas bersih', '', summary.selected_month_net_flow, summary.previous_month_net_flow],
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `laporan-keuangan-${year}-${String(month).padStart(2, '0')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const Reports = () => {
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadReport = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.get('/reports', {
          params: { year, month },
          signal: controller.signal,
        });
        setReport(response.data.data);
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setReport(null);
          setError(requestError.response?.data?.message ?? 'Laporan gagal dimuat. Coba lagi.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadReport();
    return () => controller.abort();
  }, [year, month, refresh]);

  const summary = report?.summary;
  const monthlySpending = report?.monthly_spending ?? [];
  const categorySpending = report?.category_spending ?? [];
  const dailyCashFlow = report?.daily_cash_flow ?? [];
  const incomeRows = useMemo(() => mergeCategoryRows(
    report?.category_income,
    report?.previous_category_income,
  ), [report]);
  const expenseRows = useMemo(() => mergeCategoryRows(
    report?.category_spending,
    report?.previous_category_spending,
  ), [report]);
  const selectedMonthLabel = monthNames[month - 1];
  const currentPeriodLabel = formatPeriod(year, month);
  const previousPeriodLabel = report
    ? formatPeriod(report.previous_period.year, report.previous_period.month)
    : '';
  const maxMonthly = Math.max(1, ...monthlySpending.map((item) => Math.max(item.income, item.spent)));
  const maxCategory = Math.max(1, ...categorySpending.map((item) => item.total));
  const maxDaily = Math.max(1, ...dailyCashFlow.map((item) => Math.max(item.income, item.expense)));
  const categoryTotal = categorySpending.reduce((total, item) => total + Number(item.total), 0);
  const insight = useMemo(() => {
    if (!summary || summary.selected_month_budget <= 0) {
      return `Belum ada target anggaran untuk ${currentPeriodLabel}.`;
    }
    if (summary.budget_variance < 0) {
      return `Pengeluaran melebihi target sebesar ${currency(Math.abs(summary.budget_variance))}.`;
    }
    return `Pengeluaran masih di bawah target dengan sisa ${currency(summary.budget_variance)}.`;
  }, [summary, currentPeriodLabel]);

  const renderCategoryRows = (rows, type, shareTotal) => (
    rows.length ? rows.map((row) => (
      <tr key={`${type}-${row.category}`}>
        <td className="report-category-name">{row.category}</td>
        <td className={type === 'expense' ? 'report-expense-value' : ''}>
          {type === 'expense' && row.current > 0 ? `− ${currency(row.current)}` : currency(row.current)}
        </td>
        <td>{formatShare(row.current, shareTotal)}</td>
        <td className={type === 'expense' && row.previous > 0 ? 'report-expense-value' : ''}>
          {type === 'expense' && row.previous > 0 ? `− ${currency(row.previous)}` : currency(row.previous)}
        </td>
        <td>{formatDifference(row.current, row.previous)}</td>
      </tr>
    )) : (
      <tr className="report-no-category"><td colSpan="5">Tidak ada {type === 'income' ? 'pemasukan' : 'pengeluaran'} pada kedua periode.</td></tr>
    )
  );

  return (
    <InsightsLayout active="reports" title="Laporan Keuangan & Performa Usaha" eyebrow="LAPORAN & ANALISIS">
      <div className="report-page">
        <section className="report-controls" aria-label="Filter dan tindakan laporan">
          <div className="report-period-fields">
            <label>Tahun
              <input type="number" min="2000" max="2100" value={year} onChange={(event) => {
                const nextYear = Number(event.target.value);
                if (nextYear >= 2000 && nextYear <= 2100) setYear(nextYear);
              }} />
            </label>
            <label>Periode
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select>
            </label>
          </div>
          <div className="report-actions">
            <Link to="/reconciliations" className="report-action-button report-secondary-action">Lihat rekonsiliasi</Link>
            <button type="button" className="report-action-button report-secondary-action" onClick={() => window.print()} disabled={!report}>
              Cetak / Simpan PDF
            </button>
            <button type="button" className="report-action-button report-primary-action" onClick={() => downloadCsv(report, year, month)} disabled={!report}>
              Unduh CSV
            </button>
          </div>
        </section>

        {error && (
          <div className="report-request-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setRefresh((value) => value + 1)}>Coba lagi</button>
          </div>
        )}
        {loading && <div className="dashboard-message loading" role="status">Memuat laporan...</div>}

        {!loading && report && (
          <>
            <p className="report-scope-note">
              {report.scope === 'own_activity'
                ? 'Laporan menampilkan transaksi yang Anda catat. Target anggaran berasal dari rencana bersama usaha.'
                : 'Laporan mencakup transaksi keuangan terposting dari seluruh usaha.'}
            </p>

            <section className="report-summary-grid" aria-label="Ringkasan laporan">
              <article className="report-summary-card">
                <span className="report-card-label">Total pemasukan</span>
                <strong>{currency(summary.selected_month_income)}</strong>
                <small>{formatDifference(summary.selected_month_income, summary.previous_month_income)} dibanding bulan lalu</small>
              </article>
              <article className="report-summary-card">
                <span className="report-card-label">Total pengeluaran</span>
                <strong>{currency(summary.selected_month_total)}</strong>
                <small>{formatDifference(summary.selected_month_total, summary.previous_month_total)} dibanding bulan lalu</small>
              </article>
              <article className="report-summary-card">
                <span className="report-card-label">Arus kas bersih</span>
                <strong>{currency(summary.selected_month_net_flow)}</strong>
                <small>{formatDifference(summary.selected_month_net_flow, summary.previous_month_net_flow)} dibanding bulan lalu</small>
              </article>
              <article className="report-summary-card">
                <span className="report-card-label">Sisa / selisih anggaran</span>
                <strong>{summary.selected_month_budget > 0 ? currency(Math.abs(summary.budget_variance)) : '—'}</strong>
                <small>
                  {summary.selected_month_budget > 0
                    ? `${summary.budget_variance < 0 ? 'Melebihi target' : 'Tersisa dari'} ${currency(summary.selected_month_budget)}`
                    : 'Belum ada target anggaran'}
                </small>
              </article>
            </section>

            <section className="report-panel report-pnl-panel">
              <header className="report-panel-heading">
                <div>
                  <span className="dashboard-eyebrow">RINGKASAN LABA RUGI</span>
                  <h2>Perbandingan periode</h2>
                </div>
                <span className="report-comparison-label">{currentPeriodLabel} dibanding {previousPeriodLabel}</span>
              </header>
              <div className="report-table-scroll">
                <table className="report-pnl-table">
                  <thead>
                    <tr>
                      <th scope="col">Pos laporan</th>
                      <th scope="col">{currentPeriodLabel}</th>
                      <th scope="col">Porsi grup</th>
                      <th scope="col">{previousPeriodLabel}</th>
                      <th scope="col">Perubahan</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="report-table-section"><th colSpan="5" scope="rowgroup">Pemasukan</th></tr>
                    {renderCategoryRows(incomeRows, 'income', summary.selected_month_income)}
                    <tr className="report-table-total">
                      <th scope="row">Total pemasukan</th>
                      <td>{currency(summary.selected_month_income)}</td>
                      <td>{summary.selected_month_income > 0 ? '100%' : '—'}</td>
                      <td>{currency(summary.previous_month_income)}</td>
                      <td>{formatDifference(summary.selected_month_income, summary.previous_month_income)}</td>
                    </tr>

                    <tr className="report-table-section"><th colSpan="5" scope="rowgroup">Pengeluaran</th></tr>
                    {renderCategoryRows(expenseRows, 'expense', summary.selected_month_total)}
                    <tr className="report-table-total">
                      <th scope="row">Total pengeluaran</th>
                      <td className="report-expense-value">{summary.selected_month_total > 0 ? `− ${currency(summary.selected_month_total)}` : currency(0)}</td>
                      <td>{summary.selected_month_total > 0 ? '100%' : '—'}</td>
                      <td className="report-expense-value">{summary.previous_month_total > 0 ? `− ${currency(summary.previous_month_total)}` : currency(0)}</td>
                      <td>{formatDifference(summary.selected_month_total, summary.previous_month_total)}</td>
                    </tr>

                    <tr className="report-table-net">
                      <th scope="row">Arus kas bersih</th>
                      <td>{currency(summary.selected_month_net_flow)}</td>
                      <td>{formatShare(summary.selected_month_net_flow, summary.selected_month_income)}</td>
                      <td>{currency(summary.previous_month_net_flow)}</td>
                      <td>{formatDifference(summary.selected_month_net_flow, summary.previous_month_net_flow)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="report-table-note">Hanya pemasukan dan pengeluaran berstatus terposting yang dihitung. Transfer antar rekening tidak termasuk dalam laba rugi.</p>
            </section>

            <section className="report-panel">
              <header className="report-panel-heading">
                <div><span className="dashboard-eyebrow">TREN TAHUNAN</span><h2>Pemasukan dan pengeluaran · {year}</h2></div>
                <div className="report-legend">
                  <span><i className="report-legend-income" />Pemasukan</span>
                  <span><i className="report-legend-expense" />Pengeluaran</span>
                </div>
              </header>
              <div className="report-month-chart" role="img" aria-label={`Grafik pemasukan dan pengeluaran bulanan tahun ${year}`}>
                {monthlySpending.map((item) => (
                  <button
                    type="button"
                    className={`report-month-column ${item.month === month ? 'selected' : ''}`}
                    key={item.month}
                    onClick={() => setMonth(item.month)}
                    aria-label={`${item.label}: pemasukan ${currency(item.income)}, pengeluaran ${currency(item.spent)}`}
                    title={`${item.label}: pemasukan ${currency(item.income)}, pengeluaran ${currency(item.spent)}`}
                  >
                    <span className="report-month-values">{currency(item.cash_flow)}</span>
                    <span className="report-month-bars">
                      <i className="report-month-income" style={{ height: `${Math.max(item.income ? 3 : 0, item.income / maxMonthly * 100)}%` }} />
                      <i className="report-month-expense" style={{ height: `${Math.max(item.spent ? 3 : 0, item.spent / maxMonthly * 100)}%` }} />
                    </span>
                    <span className="report-month-label">{item.label}</span>
                  </button>
                ))}
              </div>
              <p className="report-chart-footnote">Angka di atas tiap kolom menunjukkan arus kas bersih. Pilih bulan untuk melihat rinciannya.</p>
            </section>

            <section className="report-detail-grid">
              <article className="report-panel">
                <header className="report-panel-heading">
                  <div><span className="dashboard-eyebrow">DISTRIBUSI PENGELUARAN</span><h2>Per kategori · {selectedMonthLabel}</h2></div>
                  <strong className="report-panel-total">{currency(summary.selected_month_total)}</strong>
                </header>
                {categorySpending.length ? (
                  <div className="report-category-list">
                    {categorySpending.map((item) => (
                      <div className="report-category-row" key={item.category}>
                        <div><strong>{item.category}</strong><span>{currency(item.total)}</span></div>
                        <div className="report-category-track"><i style={{ width: `${item.total / maxCategory * 100}%` }} /></div>
                        <small>{formatShare(item.total, summary.selected_month_total)} dari pengeluaran</small>
                      </div>
                    ))}
                  </div>
                ) : <p className="report-empty">Belum ada pengeluaran pada bulan ini.</p>}
              </article>

              <article className="report-panel">
                <header className="report-panel-heading">
                  <div><span className="dashboard-eyebrow">ANGGARAN</span><h2>Target dan realisasi</h2></div>
                </header>
                <div className="report-budget-comparison">
                  <div><span>Target anggaran</span><strong>{currency(summary.selected_month_budget)}</strong></div>
                  <div><span>Pengeluaran terposting</span><strong>{currency(summary.selected_month_total)}</strong></div>
                  <div>
                    <span>{summary.selected_month_budget > 0 && summary.budget_variance < 0 ? 'Melebihi target' : 'Sisa anggaran'}</span>
                    <strong>{summary.selected_month_budget > 0 ? currency(Math.abs(summary.budget_variance)) : '—'}</strong>
                  </div>
                </div>
                <p className="report-insight">{insight}</p>
              </article>
            </section>

            <section className="report-detail-grid report-secondary-grid">
              <article className="report-panel">
                <header className="report-panel-heading">
                  <div><span className="dashboard-eyebrow">KOMPOSISI BIAYA</span><h2>Proporsi kategori pengeluaran</h2></div>
                </header>
                {categorySpending.length ? (
                  <>
                    <div className="report-composition-bar" aria-label="Komposisi pengeluaran per kategori">
                      {categorySpending.map((item, index) => (
                        <i
                          className={`report-composition-segment segment-${index % 5}`}
                          key={item.category}
                          style={{ width: `${item.total / categoryTotal * 100}%` }}
                          title={`${item.category}: ${currency(item.total)}`}
                        />
                      ))}
                    </div>
                    <div className="report-composition-legend">
                      {categorySpending.map((item, index) => (
                        <div key={item.category}>
                          <span><i className={`segment-${index % 5}`} />{item.category}</span>
                          <strong>{formatShare(item.total, categoryTotal)}</strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="report-empty">Belum ada data kategori untuk periode ini.</p>}
              </article>

              <article className="report-panel report-basis-panel">
                <header className="report-panel-heading">
                  <div><span className="dashboard-eyebrow">BASIS LAPORAN</span><h2>Cakupan dan sumber data</h2></div>
                </header>
                <dl>
                  <div><dt>Periode aktif</dt><dd>{currentPeriodLabel}</dd></div>
                  <div><dt>Cakupan transaksi</dt><dd>{report.scope === 'own_activity' ? 'Aktivitas Anda' : 'Seluruh usaha'}</dd></div>
                  <div><dt>Transaksi keuangan</dt><dd>{summary.selected_month_transaction_count} transaksi terposting</dd></div>
                  <div><dt>Data yang dihitung</dt><dd>Pemasukan dan pengeluaran</dd></div>
                  <div><dt>Transfer internal</dt><dd>Tidak dihitung sebagai pemasukan / pengeluaran</dd></div>
                </dl>
              </article>
            </section>

            <section className="report-panel">
              <header className="report-panel-heading">
                <div>
                  <span className="dashboard-eyebrow">AKTIVITAS HARIAN</span>
                  <h2>Arus kas harian · {selectedMonthLabel}</h2>
                </div>
                <div className="report-legend">
                  <span><i className="report-legend-income" />Pemasukan</span>
                  <span><i className="report-legend-expense" />Pengeluaran</span>
                </div>
              </header>
              {dailyCashFlow.length ? (
                <div className="report-daily-chart" role="img" aria-label={`Grafik pemasukan dan pengeluaran harian ${selectedMonthLabel}`}>
                  {dailyCashFlow.map((item) => (
                    <div className="report-daily-column" key={item.date} title={`${item.date}: pemasukan ${currency(item.income)}, pengeluaran ${currency(item.expense)}`}>
                      <div className="report-daily-bars">
                        <i className="report-daily-income" style={{ height: `${Math.max(item.income ? 3 : 0, item.income / maxDaily * 100)}%` }} />
                        <i className="report-daily-expense" style={{ height: `${Math.max(item.expense ? 3 : 0, item.expense / maxDaily * 100)}%` }} />
                      </div>
                      <span>{Number(item.date.slice(-2))}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="report-empty">Belum ada transaksi keuangan pada periode ini.</p>}
            </section>
          </>
        )}
      </div>
    </InsightsLayout>
  );
};

export default Reports;
