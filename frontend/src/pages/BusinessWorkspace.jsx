import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { notifyFinancialDataChanged } from '../services/financialDataEvents';
import './BusinessWorkspace.css';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const currency = (amount = 0) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(Number(amount));
const errorMessage = (error) => Object.values(error?.response?.data?.errors ?? {})[0]?.[0]
  ?? error?.response?.data?.message
  ?? 'Permintaan gagal. Silakan coba lagi.';
const titles = {
  transactions: 'Transaksi Keuangan',
  wallets: 'Kas & Rekening',
  requests: 'Pengajuan Pengeluaran',
  debts: 'Utang & Piutang',
  reconciliations: 'Rekonsiliasi Kas',
  users: 'Manajemen Pengguna',
  settings: 'Pengaturan Usaha',
  audit: 'Audit Trail',
  profile: 'Profil & Keamanan',
};
const roles = { owner: 'Owner', supervisor: 'Supervisor', staff: 'Staff' };

function Sidebar({ user, section, onLogout }) {
  const links = [
    { to: '/dashboard', text: 'Dashboard', icon: '⌂', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/transactions', text: 'Transaksi', icon: '↕', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/requests', text: 'Pengajuan', icon: '▣', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/wallets', text: 'Kas & Rekening', icon: '▤', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/debts', text: 'Utang & Piutang', icon: '⇄', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/reconciliations', text: 'Rekonsiliasi', icon: '✓', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/reports', text: 'Laporan', icon: '▥', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/categories', text: 'Kategori', icon: '＋', roles: ['owner'] },
    { to: '/budgets', text: 'Anggaran', icon: '◫', roles: ['owner', 'supervisor'] },
    { to: '/users', text: 'Pengguna', icon: '♙', roles: ['owner'] },
    { to: '/settings', text: 'Pengaturan', icon: '⚙', roles: ['owner'] },
    { to: '/audit', text: 'Audit Trail', icon: '≡', roles: ['owner'] },
    { to: '/notifications', text: 'Notifikasi', icon: '♧', roles: ['owner', 'supervisor', 'staff'] },
    { to: '/profile', text: 'Profil & Keamanan', icon: '⚿', roles: ['owner', 'supervisor', 'staff'] },
  ].filter((link) => link.roles.includes(user?.role));

  return (
    <aside className="dashboard-sidebar">
      <Link to="/dashboard" className="dashboard-brand">
        <span className="dashboard-brand-mark">BH</span>
        <span><strong>Bocor Halus</strong><small>KEUANGAN UMKM</small></span>
      </Link>
      <nav className="dashboard-nav">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`dashboard-nav-link ${section === link.to.slice(1) ? 'active' : ''}`}
            aria-current={section === link.to.slice(1) ? 'page' : undefined}
          >
            <span>{link.icon}</span>{link.text}
          </Link>
        ))}
      </nav>
      <div className="dashboard-sidebar-spacer" />
      <div className="dashboard-user">
        <span className="dashboard-avatar">{user?.name?.[0] ?? 'U'}</span>
        <span><strong>{user?.name}</strong><small>{roles[user?.role] ?? user?.email}</small></span>
      </div>
      <button className="business-logout" type="button" onClick={onLogout}>Keluar akun</button>
    </aside>
  );
}

function Field({ label, children }) {
  return <label className="business-field"><span>{label}</span>{children}</label>;
}

function BusinessWorkspace() {
  const location = useLocation();
  const section = location.pathname.slice(1);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ transaction_type: 'income', date: today(), type: 'receivable' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editingUserId, setEditingUserId] = useState(null);
  const isOwner = user?.role === 'owner';
  const isSupervisor = user?.role === 'supervisor';
  const activeWallets = useMemo(() => wallets.filter((wallet) => wallet.is_active), [wallets]);
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.type === form.transaction_type),
    [categories, form.transaction_type],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const endpoint = {
          requests: '/expense-requests',
          settings: '/business-settings',
          audit: '/audit-logs',
          profile: '/profile',
        }[section] ?? `/${section}`;
        const response = await api.get(endpoint);
        const result = response.data.data;
        if (active) {
          setData(['settings', 'profile'].includes(section) ? result : Array.isArray(result) ? result : result?.data ?? []);
        }
        if (['transactions', 'requests', 'debts', 'reconciliations'].includes(section)) {
          const [walletResponse, categoryResponse] = await Promise.all([
            api.get('/wallets'),
            api.get('/categories'),
          ]);
          if (active) {
            setWallets(walletResponse.data.data);
            setCategories(categoryResponse.data.data);
          }
        }
      } catch (requestError) {
        if (active) setError(errorMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => { active = false; };
  }, [section, refresh]);

  const setField = (event) => {
    const { name, value, files, type } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === 'file' ? files?.[0] ?? null : value,
      ...(name === 'transaction_type' ? {
        category_id: '',
        destination_wallet_id: '',
        ...(current.transaction_type !== value ? { source: 'manual' } : {}),
      } : {}),
    }));
  };

  const reverseTransaction = async (transaction) => {
    const reason = window.prompt('Jelaskan alasan koreksi transaksi ini:');
    if (!reason?.trim()) return;

    setError('');
    try {
      await api.post(`/transactions/${transaction.id}/reverse`, { reason: reason.trim() });
      notifyFinancialDataChanged();
      setNotice('Transaksi dikoreksi melalui pembalikan yang tercatat di audit.');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const extractReceipt = async () => {
    if (!receipt) {
      setError('Pilih file struk terlebih dahulu.');
      return;
    }

    setProcessingReceipt(true);
    setError('');
    setNotice('');
    try {
      const requestData = new FormData();
      requestData.append('receipt', receipt);
      const response = await api.post('/receipt-extractions', requestData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const extracted = response.data.data;
      setForm((current) => ({
        ...current,
        transaction_type: 'expense',
        category_id: '',
        date: extracted.date ?? current.date,
        amount: extracted.amount ? String(extracted.amount) : current.amount,
        merchant: extracted.merchant ?? '',
        payment_method: extracted.payment_method ?? '',
        description: extracted.description ?? '',
        source: 'ocr',
      }));
      setNotice(response.data.message ?? 'Hasil OCR terisi. Periksa kembali sebelum menyimpan transaksi.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setProcessingReceipt(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (section === 'transactions') {
        await api.post('/transactions', {
          ...form,
          amount: Number(form.amount),
          category_id: form.transaction_type === 'transfer' ? null : Number(form.category_id),
          wallet_id: Number(form.wallet_id),
          destination_wallet_id: form.transaction_type === 'transfer' ? Number(form.destination_wallet_id) : null,
          source: form.source ?? 'manual',
        });
        notifyFinancialDataChanged();
      } else if (section === 'requests') {
        const requestData = new FormData();
        requestData.append('amount', String(Number(form.amount)));
        requestData.append('wallet_id', String(Number(form.wallet_id)));
        requestData.append('purpose', form.purpose);
        if (form.category_id) requestData.append('category_id', String(Number(form.category_id)));
        if (form.description) requestData.append('description', form.description);
        if (form.attachment) requestData.append('attachment', form.attachment);
        await api.post('/expense-requests', requestData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else if (section === 'wallets') {
        await api.post('/wallets', { ...form, opening_balance: Number(form.opening_balance) });
      } else if (section === 'users') {
        if (editingUserId === null) {
          await api.post('/users', form);
        } else {
          await api.patch(`/users/${editingUserId}`, {
            name: form.name,
            email: form.email,
            role: form.role,
            ...(form.password ? { password: form.password } : {}),
          });
        }
      } else if (section === 'debts') {
        await api.post('/debts', { ...form, amount: Number(form.amount) });
      } else if (section === 'reconciliations') {
        await api.post('/reconciliations', {
          ...form,
          wallet_id: Number(form.wallet_id),
          counted_balance: Number(form.counted_balance),
        });
      } else if (section === 'settings') {
        await api.put('/business-settings', {
          business_name: form.business_name,
          approval_threshold: form.approval_threshold === '' ? null : Number(form.approval_threshold),
        });
      } else if (section === 'profile') {
        await api.patch('/profile', {
          name: form.name,
          email: form.email,
          ...(form.password ? {
            current_password: form.current_password,
            password: form.password,
            password_confirmation: form.password_confirmation,
          } : {}),
        });
      }
      setNotice('Perubahan berhasil disimpan.');
      formElement.reset();
      setForm({ transaction_type: 'income', date: today(), type: 'receivable' });
      setEditingUserId(null);
      setReceipt(null);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const logoutUser = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const decide = async (id, decision) => {
    setError('');
    try {
      const note = decision === 'reject' ? window.prompt('Alasan penolakan wajib diisi:') : '';
      if (decision === 'reject' && !note?.trim()) return;
      await api.post(`/expense-requests/${id}/${decision === 'approve' ? 'approve' : 'reject'}`, { note });
      setNotice(decision === 'approve' ? 'Pengajuan disetujui. Saldo belum berubah.' : 'Pengajuan ditolak.');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const payRequest = async (requestItem) => {
    setError('');
    try {
      await api.post(`/expense-requests/${requestItem.id}/pay`, {
        date: today(),
        description: requestItem.purpose,
      });
      notifyFinancialDataChanged();
      setNotice('Pembayaran dicatat dan saldo diperbarui.');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const downloadEvidence = async (requestItem) => {
    try {
      const response = await api.get(`/expense-requests/${requestItem.id}/evidence`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bukti-pengajuan-${requestItem.id}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const settleDebt = async (debt) => {
    const walletId = activeWallets[0]?.id;
    if (!walletId) {
      setError('Tambahkan sumber dana aktif terlebih dahulu.');
      return;
    }
    try {
      await api.post(`/debts/${debt.id}/settle`, {
        wallet_id: walletId,
        amount: Number(debt.remaining_amount),
        date: today(),
      });
      notifyFinancialDataChanged();
      setNotice('Pembayaran utang/piutang dicatat.');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const reviewReconciliation = async (id) => {
    try {
      await api.post(`/reconciliations/${id}/review`);
      setNotice('Hasil rekonsiliasi ditandai telah direview.');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const setUserActive = async (account) => {
    try {
      await api.patch(`/users/${account.id}`, { is_active: !account.is_active });
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const editUser = (account) => {
    setEditingUserId(account.id);
    setForm({
      name: account.name,
      email: account.email,
      role: account.role,
      password: '',
    });
    setError('');
    setNotice('');
  };

  const cancelUserEdit = () => {
    setEditingUserId(null);
    setForm({ transaction_type: 'income', date: today(), type: 'receivable' });
  };

  const title = titles[section] ?? 'Keuangan Usaha';

  return (
    <div className="dashboard-app business-app">
      <Sidebar user={user} section={section} onLogout={logoutUser} />
      <main className="dashboard-main business-main">
        <header className="dashboard-topbar">
          <div className="dashboard-welcome">
            <span className="dashboard-eyebrow">{roles[user?.role]?.toUpperCase()} · BOCOR HALUS</span>
            <h1>{title}</h1>
            <p>Kelola dan pantau keuangan usaha dalam satu tempat.</p>
          </div>
          <Link className="dashboard-primary-button" to="/transactions">+ Catat transaksi</Link>
        </header>

        {error && <div className="dashboard-message error" role="alert">{error}</div>}
        {notice && <div className="dashboard-message info" role="status">{notice}</div>}
        {loading && <div className="dashboard-message loading">Memuat data...</div>}

        {section === 'transactions' && (
          <>
            <form className="business-panel business-form" onSubmit={submit}>
              <h2>Catat transaksi aktual</h2>
              <p>Transaksi yang disimpan langsung mengubah saldo kas/rekening.</p>
              <div className="business-form-grid">
                {user?.role === 'staff' && <Field label="Scan struk (JPG, PNG, WEBP, PDF; maks. 10 MB)">
                  <input
                    name="receipt"
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(event) => setReceipt(event.target.files?.[0] ?? null)}
                  />
                </Field>}
                <Field label="Jenis transaksi">
                  <select name="transaction_type" value={form.transaction_type ?? 'income'} onChange={setField}>
                    <option value="income">Pemasukan</option><option value="expense">Pengeluaran</option>
                    {user?.role !== 'staff' && <option value="transfer">Transfer internal</option>}
                  </select>
                </Field>
                <Field label="Tanggal"><input name="date" type="date" value={form.date ?? today()} onChange={setField} required /></Field>
                {form.transaction_type !== 'transfer' && <Field label="Kategori">
                  <select name="category_id" value={form.category_id ?? ''} onChange={setField} required>
                    <option value="">Pilih kategori</option>
                    {visibleCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </Field>}
                <Field label={form.transaction_type === 'transfer' ? 'Sumber dana' : 'Kas/rekening'}>
                  <select name="wallet_id" value={form.wallet_id ?? ''} onChange={setField} required>
                    <option value="">Pilih kas/rekening</option>
                    {activeWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                  </select>
                </Field>
                {form.transaction_type === 'transfer' && <Field label="Tujuan transfer">
                  <select name="destination_wallet_id" value={form.destination_wallet_id ?? ''} onChange={setField} required>
                    <option value="">Pilih tujuan</option>
                    {activeWallets.filter((wallet) => String(wallet.id) !== String(form.wallet_id)).map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                  </select>
                </Field>}
                <Field label="Nominal"><input name="amount" type="number" min="1" step="0.01" value={form.amount ?? ''} onChange={setField} required /></Field>
                <Field label="Merchant"><input name="merchant" value={form.merchant ?? ''} onChange={setField} /></Field>
                <Field label="Metode pembayaran"><input name="payment_method" value={form.payment_method ?? ''} onChange={setField} /></Field>
                <Field label="Keterangan"><input name="description" value={form.description ?? ''} onChange={setField} placeholder="Contoh: Penjualan harian" /></Field>
              </div>
              {user?.role === 'staff' && <button className="business-button secondary" type="button" onClick={extractReceipt} disabled={processingReceipt || !receipt}>
                {processingReceipt ? 'Membaca struk...' : 'Baca struk dengan OCR'}
              </button>}
              <button className="business-button" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan transaksi'}</button>
              {user?.role === 'staff' && <p className="business-hint">OCR hanya mengisi rancangan transaksi. Periksa hasil dan pilih kategori sebelum menyimpan. Pengeluaran tertentu atau di atas ambang approval harus diajukan ke Supervisor.</p>}
            </form>
            <DataTable headers={isOwner
              ? ['Tanggal', 'Jenis', 'Keterangan', 'Kategori', 'Sumber dana', 'Nominal', 'Aksi']
              : ['Tanggal', 'Jenis', 'Keterangan', 'Kategori', 'Sumber dana', 'Nominal']} rows={data.map((item) => [
              item.date, item.transaction_type, item.description || item.merchant || '—', item.category?.name ?? '—',
              item.wallet?.name ?? '—', currency(item.amount),
              ...(isOwner ? [item.reversal || item.reversal_of_id
                ? 'Sudah dikoreksi'
                : <button className="business-button secondary" onClick={() => reverseTransaction(item)}>Koreksi</button>] : []),
            ])} />
          </>
        )}

        {section === 'wallets' && (
          <>
            {isOwner && <form className="business-panel business-form" onSubmit={submit}>
              <h2>Tambah kas atau rekening</h2>
              <div className="business-form-grid">
                <Field label="Nama sumber dana"><input name="name" value={form.name ?? ''} onChange={setField} required /></Field>
                <Field label="Jenis"><select name="type" value={form.type ?? 'cash'} onChange={setField}><option value="cash">Kas tunai</option><option value="bank">Rekening bank</option><option value="other">Lainnya</option></select></Field>
                <Field label="Saldo awal"><input name="opening_balance" type="number" min="0" step="0.01" value={form.opening_balance ?? ''} onChange={setField} required /></Field>
              </div>
              <button className="business-button" disabled={saving}>Tambah sumber dana</button>
            </form>}
            <div className="business-card-grid">{data.map((wallet) => <article className="business-panel business-balance-card" key={wallet.id}>
              <span>{wallet.type === 'cash' ? 'Kas Tunai' : wallet.type === 'bank' ? 'Rekening Bank' : 'Sumber Dana'}</span>
              <h2>{wallet.name}</h2><strong>{currency(wallet.balance)}</strong>
              {!wallet.is_active && <small>Nonaktif</small>}
            </article>)}</div>
          </>
        )}

        {section === 'requests' && (
          <>
            {user?.role === 'staff' && <form className="business-panel business-form" onSubmit={submit}>
              <h2>Ajukan pengeluaran</h2>
              <p>Pengajuan tidak mengurangi saldo. Catat pembayaran setelah disetujui dan benar-benar dibayarkan.</p>
              <div className="business-form-grid">
                <Field label="Tujuan"><input name="purpose" value={form.purpose ?? ''} onChange={setField} required /></Field>
                <Field label="Nominal"><input name="amount" type="number" min="1" step="0.01" value={form.amount ?? ''} onChange={setField} required /></Field>
                <Field label="Kategori"><select name="category_id" value={form.category_id ?? ''} onChange={setField}><option value="">Pilih kategori</option>{categories.filter((item) => item.type === 'expense').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Sumber dana"><select name="wallet_id" value={form.wallet_id ?? ''} onChange={setField} required><option value="">Pilih kas/rekening</option>{activeWallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Keterangan"><input name="description" value={form.description ?? ''} onChange={setField} /></Field>
                <Field label="Bukti pendukung (PDF/JPG/PNG, maks. 5 MB)"><input name="attachment" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={setField} /></Field>
              </div>
              <button className="business-button" disabled={saving}>Kirim pengajuan</button>
            </form>}
            <div className="business-list">{data.map((item) => <article className="business-panel business-list-item" key={item.id}>
              <div><strong>{item.purpose}</strong><span>{item.requester?.name} · {item.category?.name ?? 'Tanpa kategori'} · {item.wallet?.name}</span><small>{item.description}</small></div>
              <div className="business-request-value"><strong>{currency(item.amount)}</strong><span className={`business-status status-${item.status}`}>{item.status}</span></div>
              {item.has_attachment && <button className="business-button secondary" onClick={() => downloadEvidence(item)}>Unduh bukti</button>}
              {isSupervisor && item.status === 'pending' && <div className="business-actions">
                <button className="business-button" onClick={() => decide(item.id, 'approve')}>Setujui</button>
                <button className="business-button secondary" onClick={() => decide(item.id, 'reject')}>Tolak</button>
              </div>}
              {user?.role === 'staff' && item.status === 'approved' && <button className="business-button" onClick={() => payRequest(item)}>Catat sudah dibayar</button>}
              {item.decision_note && <small className="business-decision-note">Catatan: {item.decision_note}</small>}
              {item.transaction_id && <small>Transaksi #{item.transaction_id} · saldo sudah diperbarui</small>}
            </article>)}</div>
          </>
        )}

        {section === 'users' && isOwner && (
          <>
            <form className="business-panel business-form" onSubmit={submit}>
              <h2>{editingUserId === null ? 'Buat akun Supervisor atau Staff' : 'Ubah akun pengguna'}</h2>
              <div className="business-form-grid">
                <Field label="Nama"><input name="name" value={form.name ?? ''} onChange={setField} required /></Field>
                <Field label="Email"><input name="email" type="email" value={form.email ?? ''} onChange={setField} required /></Field>
                <Field label="Role"><select name="role" value={form.role ?? 'staff'} onChange={setField}><option value="staff">Staff</option><option value="supervisor">Supervisor</option></select></Field>
                <Field label={editingUserId === null ? 'Password awal' : 'Reset password (opsional)'}>
                  <input name="password" type="password" minLength="8" value={form.password ?? ''} onChange={setField} required={editingUserId === null} />
                </Field>
              </div>
              <button className="business-button" disabled={saving}>{editingUserId === null ? 'Buat pengguna' : 'Simpan perubahan'}</button>
              {editingUserId !== null && <button className="business-button secondary" type="button" onClick={cancelUserEdit}>Batal</button>}
            </form>
            <DataTable headers={['Nama', 'Email', 'Role', 'Status', 'Aksi']} rows={data.map((account) => [
              account.name, account.email, roles[account.role], account.is_active ? 'Aktif' : 'Nonaktif',
              <div className="business-actions">
                <button className="business-button secondary" onClick={() => editUser(account)}>Ubah</button>
                <button className="business-button secondary" onClick={() => setUserActive(account)}>{account.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </div>,
            ])} />
          </>
        )}

        {section === 'debts' && (
          <>
            <form className="business-panel business-form" onSubmit={submit}>
              <h2>Catat utang atau piutang</h2>
              <p>Pencatatan saldo kewajiban/tagihan tidak mengubah saldo kas sampai pembayaran diterima atau dilakukan.</p>
              <div className="business-form-grid">
                <Field label="Jenis"><select name="type" value={form.type ?? 'receivable'} onChange={setField}><option value="receivable">Piutang pelanggan</option><option value="payable">Utang supplier</option></select></Field>
                <Field label="Pihak terkait"><input name="counterparty" value={form.counterparty ?? ''} onChange={setField} required /></Field>
                <Field label="Nominal"><input name="amount" type="number" min="1" step="0.01" value={form.amount ?? ''} onChange={setField} required /></Field>
                <Field label="Jatuh tempo"><input name="due_date" type="date" value={form.due_date ?? ''} onChange={setField} /></Field>
              </div>
              <button className="business-button" disabled={saving}>Simpan</button>
            </form>
            <DataTable headers={['Jenis', 'Pihak', 'Jatuh tempo', 'Sisa', 'Status', '']} rows={data.map((debt) => [
              debt.type === 'receivable' ? 'Piutang' : 'Utang', debt.counterparty, debt.due_date ?? '—',
              currency(debt.remaining_amount), debt.status,
              debt.status === 'open' && activeWallets.length > 0 ? <button className="business-button secondary" onClick={() => settleDebt(debt)}>Lunasi penuh</button> : '—',
            ])} />
          </>
        )}

        {section === 'reconciliations' && (
          <>
            <form className="business-panel business-form" onSubmit={submit}>
              <h2>Input hasil hitung kas/rekening</h2>
              <div className="business-form-grid">
                <Field label="Kas/rekening"><select name="wallet_id" value={form.wallet_id ?? ''} onChange={setField} required><option value="">Pilih sumber dana</option>{activeWallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Tanggal"><input name="reconciled_at" type="date" value={form.reconciled_at ?? today()} onChange={setField} required /></Field>
                <Field label="Saldo hasil hitung"><input name="counted_balance" type="number" min="0" step="0.01" value={form.counted_balance ?? ''} onChange={setField} required /></Field>
                <Field label="Catatan"><input name="notes" value={form.notes ?? ''} onChange={setField} /></Field>
              </div>
              <button className="business-button" disabled={saving}>Kirim untuk review</button>
            </form>
            <DataTable headers={['Tanggal', 'Sumber dana', 'Saldo sistem', 'Hasil hitung', 'Selisih', 'Status', '']} rows={data.map((item) => [
              item.reconciled_at, item.wallet?.name, currency(item.system_balance), currency(item.counted_balance),
              currency(item.difference), item.status,
              isSupervisor && item.status === 'pending' ? <button className="business-button secondary" onClick={() => reviewReconciliation(item.id)}>Review</button> : '—',
            ])} />
          </>
        )}

        {section === 'settings' && isOwner && <form className="business-panel business-form" onSubmit={submit}>
          <h2>Konfigurasi usaha dan approval</h2>
          <p>Staff dapat mencatat pengeluaran rutin di bawah ambang batas. Kategori bertanda wajib approval selalu diajukan ke Supervisor.</p>
          <div className="business-form-grid">
            <Field label="Nama usaha"><input name="business_name" value={form.business_name ?? data.business_name ?? ''} onChange={setField} required /></Field>
            <Field label="Ambang approval (Rp)"><input name="approval_threshold" type="number" min="1" step="0.01" value={form.approval_threshold ?? data.approval_threshold ?? ''} onChange={setField} placeholder="Tidak ada ambang nominal" /></Field>
          </div>
          <button className="business-button" disabled={saving}>Simpan pengaturan</button>
        </form>}

        {section === 'profile' && <form className="business-panel business-form" onSubmit={submit}>
          <h2>Profil dan keamanan akun</h2>
          <div className="business-form-grid">
            <Field label="Nama"><input name="name" value={form.name ?? data.name ?? ''} onChange={setField} required /></Field>
            <Field label="Email"><input name="email" type="email" value={form.email ?? data.email ?? ''} onChange={setField} required /></Field>
            <Field label="Password saat ini (untuk mengganti password)"><input name="current_password" type="password" value={form.current_password ?? ''} onChange={setField} autoComplete="current-password" /></Field>
            <Field label="Password baru"><input name="password" type="password" minLength="8" value={form.password ?? ''} onChange={setField} autoComplete="new-password" /></Field>
            <Field label="Konfirmasi password baru"><input name="password_confirmation" type="password" minLength="8" value={form.password_confirmation ?? ''} onChange={setField} autoComplete="new-password" /></Field>
          </div>
          <button className="business-button" disabled={saving}>Simpan profil</button>
        </form>}

        {section === 'audit' && isOwner && <DataTable headers={['Waktu', 'Pengguna', 'Aksi', 'Deskripsi']} rows={data.map((log) => [
          new Date(log.created_at).toLocaleString('id-ID'), log.user?.name ?? 'Sistem', log.action, log.description,
        ])} />}
      </main>
    </div>
  );
}

function DataTable({ headers, rows }) {
  return (
    <div className="business-panel business-table-wrap">
      <table className="business-table">
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)
            : <tr><td colSpan={headers.length}>Belum ada data.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default BusinessWorkspace;
