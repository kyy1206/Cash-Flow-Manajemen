import { Link } from 'react-router-dom';
import './LandingPage.css';

const sampleTransactions = [
  { time: '09:14', name: 'Pembelian bahan baku', category: 'Bahan Baku', amount: '- Rp 485.000', type: 'expense' },
  { time: '10:32', name: 'Penjualan harian', category: 'Penjualan', amount: '+ Rp 1.250.000', type: 'income' },
  { time: '11:06', name: 'Pembayaran operasional', category: 'Operasional', amount: '- Rp 175.000', type: 'expense' },
];

const LandingPage = () => {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="Bocor Halus, beranda">
          <span className="landing-brand-mark">BH</span>
          <span><strong>Bocor Halus</strong><small>KEUANGAN USAHA</small></span>
        </Link>
        <nav className="landing-navigation" aria-label="Navigasi utama">
          <a href="#fitur">Fitur</a>
          <a href="#alur">Alur kerja</a>
          <a href="#akses">Akses</a>
        </nav>
        <div className="landing-header-actions">
          <Link to="/login" className="landing-login-link">Masuk</Link>
          <Link to="/register" className="landing-header-cta">Daftarkan Owner <span>→</span></Link>
        </div>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow"><i /> PORTAL KEUANGAN OPERASIONAL</span>
            <h1 id="landing-title">Bocor Halus</h1>
            <p>Arus kas lebih tertib. Pengeluaran lebih terkontrol. Keputusan usaha tercatat dalam satu alur.</p>
            <div className="landing-hero-actions">
              <Link to="/register" className="landing-button primary">Daftarkan Owner <span>→</span></Link>
              <a href="#fitur" className="landing-button quiet">Lihat cara kerja <span>↓</span></a>
            </div>
            <div className="landing-trust-line"><span>01</span> Pencatatan · <span>02</span> Persetujuan · <span>03</span> Pengawasan</div>
          </div>

          <div className="landing-preview-wrap" aria-label="Pratinjau dashboard Bocor Halus dengan data ilustrasi">
            <div className="landing-preview-bar">
              <div className="landing-preview-brand"><span>BH</span><strong>Bocor Halus</strong></div>
              <div className="landing-preview-title">RINGKASAN KEUANGAN USAHA</div>
              <span className="landing-preview-period">Oktober 2026⌄</span>
            </div>
            <div className="landing-preview-body">
              <aside className="landing-preview-nav" aria-hidden="true">
                <b className="active">⌂ <span>Dashboard</span></b>
                <b>↕ <span>Transaksi</span></b>
                <b>▣ <span>Pengajuan</span></b>
                <b>▤ <span>Kas & Rekening</span></b>
                <b>▥ <span>Laporan</span></b>
              </aside>
              <div className="landing-preview-content">
                <div className="landing-preview-heading"><div><small>RINGKASAN USAHA</small><strong>Aktivitas keuangan</strong></div><span>DATA ILUSTRASI</span></div>
                <div className="landing-preview-metrics">
                  <article><small>Saldo usaha</small><strong>Rp 18.420.000</strong><span>2 sumber dana</span></article>
                  <article><small>Pengeluaran periode</small><strong>Rp 6.285.000</strong><span className="orange">Terkendali</span></article>
                  <article><small>Menunggu persetujuan</small><strong>03 pengajuan</strong><span className="red">Perlu ditinjau</span></article>
                </div>
                <div className="landing-preview-lower">
                  <section className="landing-preview-transactions"><header><strong>Aktivitas terbaru</strong><span>Lihat semua →</span></header>{sampleTransactions.map((transaction) => <div className="landing-preview-transaction" key={transaction.time}><i className={transaction.type}>{transaction.type === 'income' ? '↗' : '↙'}</i><span><b>{transaction.name}</b><small>{transaction.time} · {transaction.category}</small></span><strong className={transaction.type}>{transaction.amount}</strong></div>)}</section>
                  <section className="landing-preview-budget"><header><strong>Rencana anggaran</strong><span>Periode</span></header><div className="landing-budget-total"><span>Realisasi pengeluaran</span><b>67%</b></div><div className="landing-budget-track"><i /></div><div className="landing-budget-legend"><span><i /> Terpakai</span><span><i /> Tersedia</span></div><div className="landing-preview-note"><i>✓</i><span>Semua aktivitas tercatat dalam satu buku usaha.</span></div></section>
                </div>
              </div>
            </div>
            <span className="landing-preview-caption">PRATINJAU DASHBOARD · DATA ILUSTRASI</span>
          </div>
          <div className="landing-hero-foot"><span>01 / FINANSIAL</span><span>Kontrol untuk usaha sehari-hari</span><a href="#fitur" aria-label="Gulir ke fitur">↓</a></div>
        </section>

        <section className="landing-intro" id="fitur">
          <div className="landing-section-label"><span>01</span><span>RAPIKAN OPERASIONAL</span></div>
          <div className="landing-intro-copy"><h2>Semua angka punya<br />jejak yang jelas.</h2><p>Catat transaksi, minta persetujuan untuk pengeluaran, lalu tinjau posisi kas dan anggaran dari satu ruang kerja.</p></div>
        </section>

        <section className="landing-feature-grid" aria-label="Fitur utama">
          <article className="landing-feature"><span className="landing-feature-number">01</span><div className="landing-feature-icon cash">↕</div><h3>Pencatatan kas</h3><p>Kelola transaksi pemasukan dan pengeluaran berdasarkan kategori serta sumber dana usaha.</p><Link to="/login">Buka buku transaksi <span>→</span></Link></article>
          <article className="landing-feature"><span className="landing-feature-number">02</span><div className="landing-feature-icon approval">✓</div><h3>Persetujuan berjejak</h3><p>Staff mengajukan pengeluaran, Supervisor memberi keputusan, dan catatan tersimpan untuk ditinjau.</p><Link to="/login">Lihat alur persetujuan <span>→</span></Link></article>
          <article className="landing-feature"><span className="landing-feature-number">03</span><div className="landing-feature-icon report">▥</div><h3>Laporan dan anggaran</h3><p>Pantau realisasi per periode, bandingkan pengeluaran dengan target, dan tinjau rekonsiliasi kas.</p><Link to="/login">Tinjau laporan <span>→</span></Link></article>
        </section>

        <section className="landing-workflow" id="alur">
          <div className="landing-section-label"><span>02</span><span>ALUR KERJA</span></div>
          <div className="landing-workflow-content"><div><h2>Kerja bersama,<br />otorisasi tetap jelas.</h2><p>Peran yang berbeda membantu setiap orang fokus pada tanggung jawabnya.</p></div>
            <div className="landing-role-list">
              <article><span>01</span><div><strong>Owner</strong><p>Mengatur usaha, pengguna, kategori, dan kebijakan persetujuan.</p></div><i>→</i></article>
              <article><span>02</span><div><strong>Supervisor</strong><p>Memantau aktivitas usaha, menyetujui pengajuan, dan meninjau rekonsiliasi.</p></div><i>→</i></article>
              <article><span>03</span><div><strong>Staff</strong><p>Mencatat transaksi dan mengajukan pengeluaran yang memerlukan persetujuan.</p></div><i>→</i></article>
            </div>
          </div>
        </section>

        <section className="landing-access" id="akses">
          <div><span className="landing-eyebrow"><i /> AKSES TERKONTROL</span><h2>Keputusan keuangan tetap bisa ditelusuri.</h2><p>Hak akses mengikuti peran, sementara tindakan penting dicatat sebagai audit trail.</p></div>
          <Link to="/register" className="landing-button primary">Daftarkan Owner <span>→</span></Link>
        </section>
      </main>

      <footer className="landing-footer"><Link to="/" className="landing-brand"><span className="landing-brand-mark">BH</span><span><strong>Bocor Halus</strong><small>KEUANGAN USAHA</small></span></Link><span>Portal keuangan operasional usaha.</span><Link to="/login">Masuk akun <span>→</span></Link></footer>
    </div>
  );
};

export default LandingPage;