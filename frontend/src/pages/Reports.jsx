import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import InsightsLayout from '../components/InsightsLayout';
import './Reports.css';

const currentDate = new Date();
const monthNames = Array.from({ length: 12 }, (_, index) => new Date(2026, index, 1)
  .toLocaleDateString('id-ID', { month: 'long' }));
const currency = (value = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(value));

const Reports = () => {
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
          setError(requestError.response?.data?.message ?? 'Laporan gagal dimuat. Coba lagi.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadReport();
    return () => controller.abort();
  }, [year, month]);

  const monthlySpending = report?.monthly_spending ?? [];
  const categorySpending = report?.category_spending ?? [];
  const dailySpending = report?.daily_spending ?? [];
  const maxMonthly = Math.max(1, ...monthlySpending.map((item) => Math.max(item.spent, item.budget)));
  const maxCategory = Math.max(1, ...categorySpending.map((item) => item.total));
  const selectedMonthLabel = monthNames[month - 1];
  const insight = useMemo(() => {
    if (!report || report.summary.selected_month_total === 0) {
      return `Belum ada transaksi tercatat pada ${selectedMonthLabel} ${year}.`;
    }
    if (report.summary.selected_month_budget <= 0) {
      return `Total pengeluaran ${selectedMonthLabel} sebesar ${currency(report.summary.selected_month_total)}. Tetapkan target bulanan untuk membandingkannya dengan budget.`;
    }
    if (report.summary.budget_variance < 0) {
      return `Pengeluaran ${selectedMonthLabel} melebihi target sebesar ${currency(Math.abs(report.summary.budget_variance))}.`;
    }
    return `Pengeluaran ${selectedMonthLabel} masih di bawah target dengan sisa ${currency(report.summary.budget_variance)}.`;
  }, [report, selectedMonthLabel, year]);

  return (
    <InsightsLayout active="reports" title="Laporan Keuangan" eyebrow="ANALISIS PENGELUARAN">
      <div className="report-page">
        <section className="report-controls">
          <label>Tahun
            <input type="number" min="2000" max="2100" value={year} onChange={(event) => {
              const nextYear = Number(event.target.value);
              if (nextYear >= 2000 && nextYear <= 2100) setYear(nextYear);
            }} />
          </label>
          <label>Rincian bulan
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </label>
        </section>

        {error && <div className="dashboard-message error" role="alert">{error}</div>}
        {loading && <div className="dashboard-message loading" role="status">Memuat laporan...</div>}

        {!loading && report && (
          <>
            <p className="report-insight">
              {report.scope === 'own_activity'
                ? 'Laporan ini hanya menampilkan transaksi yang Anda catat. Target anggaran yang ditampilkan adalah target bersama usaha.'
                : 'Laporan ini mencakup transaksi seluruh usaha.'}
            </p>
            <section className="report-summary-grid" aria-label="Ringkasan laporan">
              <article className="report-summary-card"><span>Total pengeluaran tahunan</span><strong>{currency(report.summary.year_total)}</strong><small>Tahun {year}</small></article>
              <article className="report-summary-card"><span>Rata-rata bulanan</span><strong>{currency(report.summary.monthly_average)}</strong><small>Rata-rata 12 bulan</small></article>
              <article className="report-summary-card"><span>Pengeluaran {selectedMonthLabel}</span><strong>{currency(report.summary.selected_month_total)}</strong><small>{report.summary.category_count} kategori tercatat</small></article>
            </section>

            <section className="report-panel">
              <header className="report-panel-heading">
                <div><span className="dashboard-eyebrow">TREN TAHUNAN</span><h2>Pengeluaran bulanan · {year}</h2></div>
                <div className="report-legend"><span><i className="report-legend-spent" />Pengeluaran</span><span><i className="report-legend-budget" />Target budget</span></div>
              </header>
              <div className="report-month-chart" role="img" aria-label={`Grafik pengeluaran bulanan tahun ${year}`}>
                {monthlySpending.map((item) => (
                  <button type="button" className={`report-month-column ${item.month === month ? 'selected' : ''}`} key={item.month} onClick={() => setMonth(item.month)} aria-label={`${item.label}: pengeluaran ${currency(item.spent)}, budget ${currency(item.budget)}`}>
                    <span className="report-month-values">{currency(item.spent)}</span>
                    <span className="report-month-bars">
                      <i className="report-month-budget" style={{ height: `${Math.max(item.budget ? 3 : 0, item.budget / maxMonthly * 100)}%` }} />
                      <i className="report-month-spent" style={{ height: `${Math.max(item.spent ? 3 : 0, item.spent / maxMonthly * 100)}%` }} />
                    </span>
                    <span className="report-month-label">{item.label}</span>
                  </button>
                ))}
              </div>
              <p className="report-chart-footnote">Pilih bulan untuk melihat rincian kategori dan harian.</p>
            </section>

            <section className="report-detail-grid">
              <article className="report-panel">
                <header className="report-panel-heading">
                  <div><span className="dashboard-eyebrow">DISTRIBUSI</span><h2>Pengeluaran per kategori · {selectedMonthLabel}</h2></div>
                </header>
                {categorySpending.length ? (
                  <div className="report-category-list">
                    {categorySpending.map((item) => (
                      <div className="report-category-row" key={item.category}>
                        <div><strong>{item.category}</strong><span>{currency(item.total)}</span></div>
                        <div className="report-category-track"><i style={{ width: `${item.total / maxCategory * 100}%` }} /></div>
                        <small>{report.summary.selected_month_total ? `${Math.round(item.total / report.summary.selected_month_total * 100)}% dari total` : '0%'}</small>
                      </div>
                    ))}
                  </div>
                ) : <p className="report-empty">Belum ada pengeluaran pada bulan ini.</p>}
              </article>

              <article className="report-panel">
                <header className="report-panel-heading">
                  <div><span className="dashboard-eyebrow">EVALUASI BUDGET</span><h2>Target dan realisasi · {selectedMonthLabel}</h2></div>
                </header>
                <div className="report-budget-comparison">
                  <div><span>Target budget</span><strong>{currency(report.summary.selected_month_budget)}</strong></div>
                  <div><span>Realisasi</span><strong>{currency(report.summary.selected_month_total)}</strong></div>
                  <div className={report.summary.budget_variance < 0 ? 'over' : ''}><span>{report.summary.budget_variance < 0 ? 'Melebihi target' : 'Sisa budget'}</span><strong>{currency(Math.abs(report.summary.budget_variance))}</strong></div>
                </div>
                <p className="report-insight">{insight}</p>
              </article>
            </section>

            <section className="report-panel">
              <header className="report-panel-heading">
                <div><span className="dashboard-eyebrow">AKTIVITAS HARIAN</span><h2>Pengeluaran harian · {selectedMonthLabel}</h2></div>
              </header>
              {dailySpending.length ? (
                <div className="report-daily-chart" role="img" aria-label={`Grafik pengeluaran harian ${selectedMonthLabel}`}>
                  {dailySpending.map((item) => (
                    <div className="report-daily-column" key={item.date} title={`${item.date}: ${currency(item.total)}`}>
                      <i style={{ height: `${Math.max(4, item.total / Math.max(1, ...dailySpending.map((day) => day.total)) * 100)}%` }} />
                      <span>{Number(item.date.slice(-2))}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="report-empty">Belum ada transaksi untuk ditampilkan.</p>}
            </section>
          </>
        )}
      </div>
    </InsightsLayout>
  );
};

export default Reports;
