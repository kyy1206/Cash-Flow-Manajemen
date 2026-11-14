import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';
import { notifyFinancialDataChanged } from '../services/financialDataEvents';
import SupervisorFrame from '../components/SupervisorFrame';
import BudgetManagement from './BudgetManagement';
import CategoryManagement from './CategoryManagement';
import UserManagement from './UserManagement';
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
  profile: 'Profil & Keamanan',
  budgets: 'Anggaran Operasional',
  categories: 'Kategori Arus Kas',
};
const roles = { owner: 'Owner', supervisor: 'Supervisor', staff: 'Staff' };
const requestStatusLabels = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak', paid: 'Dibayar' };
const reconciliationStatusLabels = { pending: 'Menunggu review', reviewed: 'Sudah direview' };
const readCsv = (text) => {
  const delimiter = (text.split(/\r?\n/, 1)[0].match(/;/g) ?? []).length
    > (text.split(/\r?\n/, 1)[0].match(/,/g) ?? []).length ? ';' : ',';
  return text.trim().split(/\r?\n/).map((line) => {
    const cells = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && line[index + 1] === '"' && quoted) {
        value += '"';
        index += 1;
      } else if (character === '"') quoted = !quoted;
      else if (character === delimiter && !quoted) {
        cells.push(value.trim());
        value = '';
      } else value += character;
    }
    cells.push(value.trim());
    return cells;
  }).filter((row) => row.some(Boolean));
};
const csvAmount = (value) => {
  const raw = String(value ?? '').replace(/[^\d,.-]/g, '');
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.lastIndexOf(',') > raw.lastIndexOf('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
    : /^[\d]+[.,]\d{3}$/.test(raw) ? raw.replace(/[.,]/g, '') : raw.replace(',', '.');
  const amount = Number(normalized);
  return raw && Number.isFinite(amount) ? Math.abs(amount) : null;
};
const csvDate = (value) => {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
};
const downloadCsv = (filename, headers, rows) => {
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const content = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const transactionQueryParams = (filters, page) => ({
  page,
  ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
  ...(filters.wallet_id ? { wallet_id: filters.wallet_id } : {}),
  ...(filters.category_id ? { category_id: filters.category_id } : {}),
  ...(filters.date_from ? { date_from: filters.date_from } : {}),
  ...(filters.date_to ? { date_to: filters.date_to } : {}),
  ...(filters.transaction_type ? { transaction_type: filters.transaction_type } : {}),
  ...(filters.attention ? { attention: 1 } : {}),
});
const requestQueryParams = (filters, page) => ({
  page,
  ...(filters.status !== 'all' ? { status: filters.status } : {}),
  ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
  ...(filters.category_id ? { category_id: filters.category_id } : {}),
  ...(filters.wallet_id ? { wallet_id: filters.wallet_id } : {}),
  ...(filters.amount_min ? { amount_min: filters.amount_min } : {}),
  ...(filters.amount_max ? { amount_max: filters.amount_max } : {}),
  ...(filters.date_from ? { date_from: filters.date_from } : {}),
  ...(filters.date_to ? { date_to: filters.date_to } : {}),
});
const reconciliationQueryParams = (filters, page) => ({
  page,
  ...(filters.status !== 'all' ? { status: filters.status } : {}),
  ...(filters.wallet_id ? { wallet_id: filters.wallet_id } : {}),
  ...(filters.date_from ? { date_from: filters.date_from } : {}),
  ...(filters.date_to ? { date_to: filters.date_to } : {}),
  ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
});
const debtQueryParams = (filters, page) => ({
  page,
  ...(filters.type !== 'all' ? { type: filters.type } : {}),
  ...(filters.status !== 'all' ? { status: filters.status } : {}),
  ...(filters.due_period !== 'all' ? { due_period: filters.due_period } : {}),
  ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
});
const transactionReference = (id) => `#TRX-${String(id).padStart(8, '0')}`;
const debtStatusLabels = { open: 'Belum lunas', settled: 'Lunas' };
const debtTypeLabels = { payable: 'Utang usaha', receivable: 'Piutang usaha' };
const dateLabel = (value) => {
  if (!value) return '-';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(year, month - 1, day));
};
const daysUntil = (value) => {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  const due = new Date(year, month - 1, day);
  const current = new Date();
  current.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - current.getTime()) / 86400000);
};
const debtDueLabel = (debt) => {
  if (debt.status === 'settled') return 'Lunas';
  if (!debt.due_date) return 'Tanpa tanggal jatuh tempo';
  const remainingDays = daysUntil(debt.due_date);
  if (remainingDays < 0) return `Terlambat ${Math.abs(remainingDays)} hari`;
  if (remainingDays === 0) return 'Jatuh tempo hari ini';
  return `Jatuh tempo ${remainingDays} hari lagi`;
};

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
  const [form, setForm] = useState({
    transaction_type: 'income',
    date: today(),
    reconciled_at: today(),
    type: 'receivable',
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [processingReceipt, setProcessingReceipt] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [editingWalletId, setEditingWalletId] = useState(null);
  const [walletSearch, setWalletSearch] = useState('');
  const [walletTypeFilter, setWalletTypeFilter] = useState('all');
  const [walletStatusFilter, setWalletStatusFilter] = useState('active');
  const [walletActivityFilter, setWalletActivityFilter] = useState({ wallet_id: '', transaction_type: '' });
  const [walletTransactions, setWalletTransactions] = useState([]);
  const [walletTransactionCount, setWalletTransactionCount] = useState(0);
  const [exportingWalletTransactions, setExportingWalletTransactions] = useState(false);
  const [showWalletForm, setShowWalletForm] = useState(false);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [showReconciliationForm, setShowReconciliationForm] = useState(false);
  const [debtPayment, setDebtPayment] = useState(null);
  const [debtPaymentSaving, setDebtPaymentSaving] = useState(false);
  const [debtSummary, setDebtSummary] = useState(null);
  const [debtAlerts, setDebtAlerts] = useState([]);
  const [debtFilters, setDebtFilters] = useState({
    type: 'all', status: 'open', due_period: 'all', search: '',
  });
  const [debtFilterDraft, setDebtFilterDraft] = useState({
    type: 'all', status: 'open', due_period: 'all', search: '',
  });
  const [exportingDebts, setExportingDebts] = useState(false);
  const [requestFilters, setRequestFilters] = useState({
    status: 'all', search: '', category_id: '', wallet_id: '', amount_min: '', amount_max: '', date_from: '', date_to: '',
  });
  const [requestFilterDraft, setRequestFilterDraft] = useState({
    status: 'all', search: '', category_id: '', wallet_id: '', amount_min: '', amount_max: '', date_from: '', date_to: '',
  });
  const [requestSummary, setRequestSummary] = useState(null);
  const [reconciliationFilters, setReconciliationFilters] = useState({
    status: 'all', wallet_id: '', date_from: '', date_to: '', search: '',
  });
  const [reconciliationFilterDraft, setReconciliationFilterDraft] = useState({
    status: 'all', wallet_id: '', date_from: '', date_to: '', search: '',
  });
  const [reconciliationSummary, setReconciliationSummary] = useState(null);
  const [exportingReconciliations, setExportingReconciliations] = useState(false);
  const [statementWalletId, setStatementWalletId] = useState('');
  const [statement, setStatement] = useState(null);
  const [statementError, setStatementError] = useState('');
  const [transfer, setTransfer] = useState({ wallet_id: '', destination_wallet_id: '', amount: '', date: today(), description: '' });
  const [transferSaving, setTransferSaving] = useState(false);
  const [pageBySection, setPageBySection] = useState({});
  const [pageInfo, setPageInfo] = useState(null);
  const [transactionFilters, setTransactionFilters] = useState({
    search: '', wallet_id: '', category_id: '', date_from: '', date_to: '', transaction_type: '', attention: false,
  });
  const [transactionFilterDraft, setTransactionFilterDraft] = useState({
    search: '', wallet_id: '', category_id: '', date_from: '', date_to: '',
  });
  const [transactionSummary, setTransactionSummary] = useState(null);
  const [showTransactionFilters, setShowTransactionFilters] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [exportingTransactions, setExportingTransactions] = useState(false);
  const [exportingRequests, setExportingRequests] = useState(false);
  const page = pageBySection[section] ?? 1;
  const changePage = (nextPage) => setPageBySection((current) => ({ ...current, [section]: nextPage }));
  const shownPageInfo = pageInfo?.section === section ? pageInfo : null;
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
      if (['budgets', 'categories', 'users'].includes(section)) {
        setLoading(false);
        setError('');
        return;
      }
      setLoading(true);
      setError('');
      if (section === 'transactions') setTransactionSummary(null);
      if (section === 'requests') setRequestSummary(null);
      if (section === 'debts') {
        setDebtSummary(null);
        setDebtAlerts([]);
      }
      if (section === 'reconciliations') setReconciliationSummary(null);
      try {
        const endpoint = {
          requests: '/expense-requests',
          profile: '/profile',
        }[section] ?? `/${section}`;
        const params = section === 'transactions' ? { page } : undefined;
        const response = await api.get(endpoint, {
          params: section === 'transactions' ? transactionQueryParams(transactionFilters, page)
            : section === 'requests' ? requestQueryParams(requestFilters, page)
              : section === 'debts' ? debtQueryParams(debtFilters, page)
                : section === 'reconciliations' ? reconciliationQueryParams(reconciliationFilters, page) : params,
        });
        const result = response.data.data;
        if (active) {
          setData(section === 'profile' ? result : Array.isArray(result) ? result : result?.data ?? []);
          if (section === 'transactions') setTransactionSummary(response.data.summary ?? null);
          if (section === 'requests') setRequestSummary(response.data.summary ?? null);
          if (section === 'debts') {
            setDebtSummary(response.data.summary ?? null);
            setDebtAlerts(response.data.alerts ?? []);
          }
          if (section === 'reconciliations') setReconciliationSummary(response.data.summary ?? null);
          setPageInfo(result?.last_page ? {
            section, currentPage: result.current_page, lastPage: result.last_page, total: result.total,
          } : null);
        }
        if (['transactions', 'requests', 'debts', 'reconciliations', 'wallets'].includes(section)) {
          const responses = await Promise.all([
            api.get('/wallets'),
            api.get('/categories'),
            ...(section === 'wallets' ? [api.get('/transactions', {
              params: {
                page: 1,
                ...(walletActivityFilter.wallet_id ? { wallet_id: walletActivityFilter.wallet_id } : {}),
                ...(walletActivityFilter.transaction_type ? { transaction_type: walletActivityFilter.transaction_type } : {}),
              },
            })] : []),
          ]);
          if (active) {
            setWallets(responses[0].data.data);
            setCategories(responses[1].data.data);
            if (section === 'wallets') {
              setWalletTransactions(responses[2].data.data.data ?? []);
              setWalletTransactionCount(responses[2].data.summary?.total_count ?? 0);
            }
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
  }, [section, refresh, page, transactionFilters, requestFilters, debtFilters, reconciliationFilters, walletActivityFilter]);

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
        if (editingWalletId === null) {
          await api.post('/wallets', { ...form, opening_balance: Number(form.opening_balance) });
        } else {
          await api.patch(`/wallets/${editingWalletId}`, { name: form.name, type: form.type });
        }
      } else if (section === 'debts') {
        await api.post('/debts', { ...form, amount: Number(form.amount) });
      } else if (section === 'reconciliations') {
        await api.post('/reconciliations', {
          ...form,
          reconciled_at: form.reconciled_at || today(),
          wallet_id: Number(form.wallet_id),
          counted_balance: Number(form.counted_balance),
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
      setForm({
        transaction_type: 'income',
        date: today(),
        reconciled_at: today(),
        type: 'receivable',
      });
      setEditingWalletId(null);
      if (section === 'wallets') setShowWalletForm(false);
      if (section === 'debts') setShowDebtForm(false);
      if (section === 'reconciliations') {
        setShowReconciliationForm(false);
        if (location.state?.openReconciliationForm) navigate(location.pathname, { replace: true, state: null });
      }
      if (section === 'transactions') setShowTransactionForm(false);
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
    setError('');
    setNotice('');
    if (!activeWallets.length) {
      setError('Tambahkan sumber dana aktif terlebih dahulu.');
      return;
    }
    setDebtPayment({ id: debt.id, amount: String(debt.remaining_amount), wallet_id: String(activeWallets[0].id) });
  };

  const openDebtForm = (type) => {
    setForm((current) => ({
      ...current,
      type,
      counterparty: '',
      amount: '',
      due_date: '',
      description: '',
    }));
    setShowDebtForm(true);
  };

  const submitDebtPayment = async (event, debt) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setDebtPaymentSaving(true);
    try {
      await api.post(`/debts/${debt.id}/settle`, {
        wallet_id: Number(debtPayment.wallet_id),
        amount: Number(debtPayment.amount),
        date: today(),
      });
      notifyFinancialDataChanged();
      setNotice(Number(debtPayment.amount) < Number(debt.remaining_amount)
        ? 'Pembayaran sebagian dicatat dan sisa saldo diperbarui.'
        : 'Pembayaran lunas dicatat.');
      setDebtPayment(null);
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDebtPaymentSaving(false);
    }
  };

  const toggleWallet = async (wallet) => {
    setError('');
    try {
      await api.patch(`/wallets/${wallet.id}`, { is_active: !wallet.is_active });
      setNotice(wallet.is_active ? 'Sumber dana dinonaktifkan.' : 'Sumber dana diaktifkan kembali.');
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  const viewWalletTransactions = (wallet) => {
    const walletId = String(wallet.id);
    setTransactionFilterDraft((current) => ({ ...current, wallet_id: walletId }));
    setTransactionFilters((current) => ({ ...current, wallet_id: walletId }));
    setPageBySection((current) => ({ ...current, transactions: 1 }));
    navigate('/transactions');
  };

  const showAllWalletTransactions = () => {
    setTransactionFilterDraft((current) => ({ ...current, wallet_id: walletActivityFilter.wallet_id }));
    setTransactionFilters((current) => ({
      ...current,
      wallet_id: walletActivityFilter.wallet_id,
      transaction_type: walletActivityFilter.transaction_type,
    }));
    setPageBySection((current) => ({ ...current, transactions: 1 }));
    navigate('/transactions');
  };

  const reconcileWallet = (wallet) => {
    setForm((current) => ({ ...current, wallet_id: String(wallet.id), reconciled_at: today() }));
    setShowReconciliationForm(true);
    navigate('/reconciliations');
  };

  const exportWalletTransactions = async () => {
    setExportingWalletTransactions(true);
    setError('');
    setNotice('');
    try {
      const exported = [];
      let pageNumber = 1;
      let lastPage = 1;
      do {
        const response = await api.get('/transactions', {
          params: {
            page: pageNumber,
            ...(walletActivityFilter.wallet_id ? { wallet_id: walletActivityFilter.wallet_id } : {}),
            ...(walletActivityFilter.transaction_type ? { transaction_type: walletActivityFilter.transaction_type } : {}),
          },
        });
        const paginator = response.data.data;
        exported.push(...paginator.data);
        lastPage = Number(paginator.last_page) || 1;
        pageNumber = Number(paginator.current_page) + 1;
      } while (pageNumber <= lastPage);

      downloadCsv('mutasi-kas-rekening.csv', [
        'ID Transaksi', 'Tanggal', 'Jenis', 'Sumber dana', 'Tujuan transfer',
        'Keterangan', 'Pencatat', 'Nominal', 'Status',
      ], exported.map((item) => [
        transactionReference(item.id), item.date, item.transaction_type,
        item.wallet?.name ?? '', item.destination_wallet?.name ?? '', item.description ?? '',
        item.user?.name ?? '', item.amount,
        item.reversal_of_id || item.reversal ? 'Dikoreksi' : item.financial_status,
      ]));
      setNotice(`${exported.length} mutasi sesuai filter berhasil diekspor.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setExportingWalletTransactions(false);
    }
  };

  const transferFunds = async (event) => {
    event.preventDefault();
    setTransferSaving(true);
    setError('');
    try {
      await api.post('/transactions', {
        transaction_type: 'transfer',
        ...transfer,
        wallet_id: Number(transfer.wallet_id),
        destination_wallet_id: Number(transfer.destination_wallet_id),
        amount: Number(transfer.amount),
      });
      notifyFinancialDataChanged();
      setNotice('Transfer internal berhasil dicatat dan saldo kedua rekening diperbarui.');
      setTransfer({ wallet_id: '', destination_wallet_id: '', amount: '', date: today(), description: '' });
      setRefresh((value) => value + 1);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setTransferSaving(false);
    }
  };

  const importStatement = async (event) => {
    const file = event.target.files?.[0];
    setStatement(null);
    setStatementError('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setStatementError('Ukuran file maksimal 5 MB.');
      return;
    }
    try {
      const csv = readCsv(await file.text());
      const headers = csv[0].map((header) => header.replace(/^\uFEFF/, '').toLowerCase());
      const dateIndex = headers.findIndex((header) => ['tanggal', 'tgl', 'date', 'transaction date'].includes(header));
      const amountIndex = headers.findIndex((header) => ['nominal', 'amount', 'jumlah', 'mutasi', 'debit', 'debet', 'credit', 'kredit'].includes(header));
      const descriptionIndex = headers.findIndex((header) => ['deskripsi', 'description', 'keterangan', 'narrative'].includes(header));
      if (csv.length < 2 || dateIndex < 0 || amountIndex < 0) {
        throw new Error('CSV harus memiliki baris data, kolom tanggal (date/tanggal), dan nominal/mutasi/debit/credit.');
      }
      const rows = csv.slice(1).map((cells, index) => ({
        line: index + 2,
        date: csvDate(cells[dateIndex]),
        amount: csvAmount(cells[amountIndex]),
        description: cells[descriptionIndex] || '-',
      })).filter((row) => row.date && row.amount !== null);
      if (!rows.length) throw new Error('Tidak ada baris mutasi dengan tanggal dan nominal yang valid.');
      if (!statementWalletId) throw new Error('Pilih rekening yang akan dicocokkan terlebih dahulu.');

      const dateFrom = rows.map((row) => row.date).sort()[0];
      const dateTo = rows.map((row) => row.date).sort().at(-1);
      const transactions = [];
      let currentPage = 1;
      let lastPage = 1;
      do {
        const response = await api.get('/transactions', {
          params: { wallet_id: statementWalletId, date_from: dateFrom, date_to: dateTo, page: currentPage },
        });
        transactions.push(...(response.data.data.data ?? []));
        lastPage = response.data.data.last_page ?? 1;
        currentPage += 1;
      } while (currentPage <= lastPage);

      const used = new Set();
      const compared = rows.map((row) => {
        const matched = transactions.find((transaction) => String(transaction.date).slice(0, 10) === row.date
          && Math.abs(Number(transaction.amount) - row.amount) < 0.01
          && !used.has(transaction.id)
          && (Number(transaction.wallet_id) === Number(statementWalletId)
            || Number(transaction.destination_wallet_id) === Number(statementWalletId)));
        if (matched) used.add(matched.id);
        return { ...row, matched };
      });
      setStatement({ filename: file.name, rows: compared });
    } catch (importError) {
      setStatementError(importError.message || errorMessage(importError));
    } finally {
      event.target.value = '';
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

  const ownerTitles = {
    wallets: 'Kas & Rekening Bisnis',
    requests: 'Pengawasan Pengajuan Pengeluaran Staf',
    debts: 'Pengelolaan Utang & Piutang Usaha',
  };
  const title = isOwner ? ownerTitles[section] ?? titles[section] ?? 'Keuangan Usaha' : titles[section] ?? 'Keuangan Usaha';
  const listData = Array.isArray(data) ? data : [];
  const walletRows = section === 'wallets' ? listData : [];
  const debtRows = section === 'debts' ? listData : [];
  const requestRows = section === 'requests' ? listData : [];
  const reconciliationRows = section === 'reconciliations' ? listData : [];
  const reconciliationFormOpen = showReconciliationForm || Boolean(location.state?.openReconciliationForm);
  const visibleRequests = requestRows;
  const visibleWalletRows = walletRows.filter((wallet) => {
    const matchesSearch = `${wallet.name} ${wallet.type}`.toLowerCase().includes(walletSearch.trim().toLowerCase());
    const matchesType = walletTypeFilter === 'all' || wallet.type === walletTypeFilter;
    const matchesStatus = walletStatusFilter === 'all'
      || (walletStatusFilter === 'active' ? wallet.is_active : !wallet.is_active);
    return matchesSearch && matchesType && matchesStatus;
  });
  const visibleReconciliations = reconciliationRows;
  const pendingDifference = reconciliationRows.find((item) => item.status === 'pending' && Number(item.difference) !== 0);
  const reconciliationTotal = Number(reconciliationSummary?.total_count ?? 0);
  const reconciliationPercent = (count) => reconciliationTotal
    ? Math.round((Number(count || 0) / reconciliationTotal) * 100)
    : 0;
  const applyTransactionFilters = (event) => {
    event.preventDefault();
    setTransactionFilters((current) => ({ ...current, ...transactionFilterDraft }));
    changePage(1);
  };
  const applyRequestFilters = (event) => {
    event.preventDefault();
    setRequestFilters(requestFilterDraft);
    changePage(1);
  };
  const resetRequestFilters = () => {
    const emptyFilters = {
      status: 'all', search: '', category_id: '', wallet_id: '', amount_min: '', amount_max: '', date_from: '', date_to: '',
    };
    setRequestFilterDraft(emptyFilters);
    setRequestFilters(emptyFilters);
    changePage(1);
  };
  const selectDebtTab = (updates) => {
    const nextFilters = { ...debtFilters, ...updates };
    setDebtFilters(nextFilters);
    setDebtFilterDraft(nextFilters);
    setDebtPayment(null);
    changePage(1);
  };
  const applyDebtFilters = (event) => {
    event.preventDefault();
    setDebtFilters(debtFilterDraft);
    setDebtPayment(null);
    changePage(1);
  };
  const resetDebtFilters = () => {
    const defaultFilters = { type: 'all', status: 'open', due_period: 'all', search: '' };
    setDebtFilters(defaultFilters);
    setDebtFilterDraft(defaultFilters);
    setDebtPayment(null);
    changePage(1);
  };
  const exportDebts = async () => {
    setExportingDebts(true);
    setError('');
    setNotice('');
    try {
      const exported = [];
      let pageNumber = 1;
      let lastPage = 1;
      do {
        const response = await api.get('/debts', { params: debtQueryParams(debtFilters, pageNumber) });
        const paginator = response.data.data;
        exported.push(...paginator.data);
        lastPage = Number(paginator.last_page) || 1;
        pageNumber = Number(paginator.current_page) + 1;
      } while (pageNumber <= lastPage);

      downloadCsv('utang-piutang.csv', [
        'ID', 'Jenis', 'Pihak', 'Deskripsi', 'Nominal awal', 'Telah dibayar',
        'Sisa', 'Jatuh tempo', 'Status', 'Dicatat oleh',
      ], exported.map((item) => [
        item.id, debtTypeLabels[item.type] ?? item.type, item.counterparty, item.description ?? '',
        item.original_amount, Number(item.original_amount) - Number(item.remaining_amount),
        item.remaining_amount, item.due_date ?? '', debtStatusLabels[item.status] ?? item.status,
        item.creator?.name ?? '',
      ]));
      setNotice(`${exported.length} catatan utang/piutang berhasil diekspor.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setExportingDebts(false);
    }
  };
  const debtTableRows = (type) => debtRows
    .filter((item) => item.type === type)
    .map((item) => {
      const paidAmount = Number(item.original_amount) - Number(item.remaining_amount);
      const remainingDays = daysUntil(item.due_date);
      return [
        <><strong>{type === 'payable' ? 'UTG' : 'PTG'}-{String(item.id).padStart(4, '0')}</strong><small>Dicatat {dateLabel(item.created_at)}</small></>,
        <><strong>{item.counterparty}</strong><small>{item.description || `Dicatat oleh ${item.creator?.name ?? 'Pengguna'}`}</small></>,
        <><strong>{currency(item.original_amount)}</strong><small>Terbayar {currency(paidAmount)}</small></>,
        <strong>{currency(item.remaining_amount)}</strong>,
        <div className="debt-due-cell">
          <span className={`business-status status-${item.status}${item.status === 'open' && remainingDays !== null && remainingDays < 0 ? ' debt-overdue' : ''}`}>
            {debtDueLabel(item)}
          </span>
          <small>{item.due_date ? dateLabel(item.due_date) : 'Belum ditentukan'}</small>
        </div>,
        item.status === 'open' ? debtPayment?.id === item.id ? (
          <form className="debt-payment-form" onSubmit={(event) => submitDebtPayment(event, item)}>
            <select aria-label="Sumber kas/rekening pembayaran" value={debtPayment.wallet_id} onChange={(event) => setDebtPayment((value) => ({ ...value, wallet_id: event.target.value }))} required>
              {activeWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
            </select>
            <input aria-label="Nominal pelunasan" type="number" min="0.01" max={item.remaining_amount} step="0.01" value={debtPayment.amount} onChange={(event) => setDebtPayment((value) => ({ ...value, amount: event.target.value }))} required />
            <button className="business-button" type="submit" disabled={debtPaymentSaving}>{debtPaymentSaving ? 'Menyimpan…' : 'Simpan'}</button>
            <button className="business-button secondary" type="button" onClick={() => setDebtPayment(null)} disabled={debtPaymentSaving}>Batal</button>
          </form>
        ) : activeWallets.length ? (
          <button className="business-button secondary" type="button" onClick={() => settleDebt(item)}>
            {type === 'payable' ? 'Catat pembayaran' : 'Catat penerimaan'}
          </button>
        ) : <span className="business-muted">Aktifkan sumber kas/rekening</span> : '-',
      ];
    });
  const applyReconciliationFilters = (event) => {
    event.preventDefault();
    setReconciliationFilters(reconciliationFilterDraft);
    changePage(1);
  };
  const resetReconciliationFilters = () => {
    const emptyFilters = { status: 'all', wallet_id: '', date_from: '', date_to: '', search: '' };
    setReconciliationFilterDraft(emptyFilters);
    setReconciliationFilters(emptyFilters);
    changePage(1);
  };
  const exportReconciliations = async () => {
    setExportingReconciliations(true);
    setError('');
    setNotice('');
    try {
      const exported = [];
      let pageNumber = 1;
      let lastPage = 1;
      do {
        const response = await api.get('/reconciliations', {
          params: reconciliationQueryParams(reconciliationFilters, pageNumber),
        });
        const paginator = response.data.data;
        exported.push(...paginator.data);
        lastPage = Number(paginator.last_page) || 1;
        pageNumber = Number(paginator.current_page) + 1;
      } while (pageNumber <= lastPage);

      downloadCsv('rekonsiliasi-kas.csv', [
        'ID Rekonsiliasi', 'Tanggal', 'Kas/Rekening', 'Saldo Sistem', 'Saldo Hasil Hitung',
        'Selisih', 'Status', 'Catatan', 'Dicatat oleh', 'Direview oleh',
      ], exported.map((item) => [
        `REC-${String(item.id).padStart(4, '0')}`, item.reconciled_at, item.wallet?.name ?? '',
        item.system_balance, item.counted_balance, item.difference,
        reconciliationStatusLabels[item.status] ?? item.status, item.notes ?? '',
        item.creator?.name ?? '', item.reviewer?.name ?? '',
      ]));
      setNotice(`${exported.length} hasil rekonsiliasi berhasil diekspor.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setExportingReconciliations(false);
    }
  };
  const exportRequests = async () => {
    setExportingRequests(true);
    setError('');
    setNotice('');
    try {
      const exported = [];
      let pageNumber = 1;
      let lastPage = 1;
      do {
        const response = await api.get('/expense-requests', {
          params: requestQueryParams(requestFilters, pageNumber),
        });
        const paginator = response.data.data;
        exported.push(...paginator.data);
        lastPage = Number(paginator.last_page) || 1;
        pageNumber = Number(paginator.current_page) + 1;
      } while (pageNumber <= lastPage);

      downloadCsv('pengawasan-pengajuan.csv', [
        'ID Pengajuan', 'Diajukan', 'Pemohon', 'Tujuan', 'Kategori', 'Kas/Rekening',
        'Nominal', 'Status', 'Diputuskan oleh', 'Catatan keputusan', 'Transaksi',
      ], exported.map((item) => [
        `REQ-${String(item.id).padStart(4, '0')}`, item.created_at, item.requester?.name ?? '',
        item.purpose, item.category?.name ?? '', item.wallet?.name ?? '', item.amount, item.status,
        item.decider?.name ?? '', item.decision_note ?? '', item.transaction_id ?? '',
      ]));
      setNotice(`${exported.length} pengajuan berhasil diekspor.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setExportingRequests(false);
    }
  };
  const changeTransactionTab = (transactionType, attention = false) => {
    setTransactionFilters((current) => ({ ...current, transaction_type: transactionType, attention }));
    changePage(1);
  };
  const resetTransactionFilters = () => {
    const emptyFilters = { search: '', wallet_id: '', category_id: '', date_from: '', date_to: '' };
    setTransactionFilterDraft(emptyFilters);
    setTransactionFilters({ ...emptyFilters, transaction_type: '', attention: false });
    changePage(1);
  };
  const exportTransactions = async () => {
    setExportingTransactions(true);
    setError('');
    setNotice('');
    try {
      const exported = [];
      let pageNumber = 1;
      let lastPage = 1;
      do {
        const response = await api.get('/transactions', {
          params: transactionQueryParams(transactionFilters, pageNumber),
        });
        const paginator = response.data.data;
        exported.push(...paginator.data);
        lastPage = Number(paginator.last_page) || 1;
        pageNumber = Number(paginator.current_page) + 1;
      } while (pageNumber <= lastPage);

      downloadCsv('monitoring-transaksi.csv', [
        'ID Transaksi', 'Tanggal', 'Jenis', 'Kategori', 'Sumber dana', 'Tujuan transfer',
        'Keterangan', 'Merchant', 'Pencatat', 'Nominal', 'Sumber pencatatan', 'Status',
      ], exported.map((item) => [
        transactionReference(item.id), item.date, item.transaction_type, item.category?.name ?? '',
        item.wallet?.name ?? '', item.destination_wallet?.name ?? '', item.description ?? '',
        item.merchant ?? '', item.user?.name ?? '', item.amount, item.source ?? '',
        item.reversal_of_id || item.reversal ? 'Dikoreksi' : item.financial_status,
      ]));
      setNotice(`${exported.length} transaksi berhasil diekspor.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setExportingTransactions(false);
    }
  };

  const workspaceClassName = isOwner ? `workspace-module owner-${section}` : 'workspace-module';
  const workspaceContent = (
    <div className={workspaceClassName}>
      {section === 'transactions' ? <header className="supervisor-page-heading transaction-monitor-heading">
          <div>
            <span className="supervisor-eyebrow">{isOwner ? '◈ KONTROL INTERNAL & AKUNTABILITAS' : `${roles[user?.role]?.toUpperCase()} · MONITORING KEUANGAN`}</span>
            <h1>Monitoring Transaksi</h1>
            <p>Pantau mutasi kas usaha, telusuri pencatatan, dan kelola koreksi sesuai kewenangan.</p>
          </div>
          <div className="transaction-monitor-actions">
            <button className="business-button secondary" type="button" onClick={() => setShowTransactionFilters((visible) => !visible)}>
              {showTransactionFilters ? 'Tutup filter' : 'Filter lanjutan'}
            </button>
            <button className="business-button secondary" type="button" onClick={exportTransactions} disabled={exportingTransactions}>
              {exportingTransactions ? 'Mengekspor...' : 'Ekspor CSV'}
            </button>
            {isOwner
              ? <button className="business-button" type="button" onClick={() => navigate('/reconciliations', { state: { openReconciliationForm: true } })}>Rekonsiliasi Kas</button>
              : <button className="business-button" type="button" onClick={() => setShowTransactionForm((visible) => !visible)}>
                {showTransactionForm ? 'Tutup form' : 'Catat transaksi'}
              </button>}
          </div>
        </header> : !['budgets', 'categories', 'users', 'debts', 'reconciliations'].includes(section)
          && !(isOwner && section === 'wallets') && <header className="supervisor-page-heading">
          <div>
            <span className="supervisor-eyebrow">{isOwner ? '◈ KONTROL INTERNAL & AKUNTABILITAS' : `${roles[user?.role]?.toUpperCase()} · PENGELOLAAN KEUANGAN`}</span>
            <h1>{title}</h1>
            <p>{isOwner && section === 'requests'
              ? 'Pantau pengajuan dan keputusan Supervisor. Owner tidak menyetujui atau menolak pengajuan.'
              : 'Kelola dan pantau keuangan usaha dalam satu tempat.'}</p>
          </div>
          {section === 'requests' && <div className="transaction-monitor-actions">
            <button className="business-button secondary" type="button" onClick={() => document.getElementById('request-filters')?.scrollIntoView({ behavior: 'smooth' })}>Filter pengajuan</button>
            <button className="business-button secondary" type="button" onClick={exportRequests} disabled={exportingRequests}>
              {exportingRequests ? 'Mengekspor...' : 'Ekspor CSV'}
            </button>
          </div>}
        </header>
      }

        {error && <div className="dashboard-message error" role="alert">{error}</div>}
        {notice && <div className="dashboard-message info" role="status">{notice}</div>}
        {loading && !['budgets', 'categories', 'users'].includes(section) && <div className="dashboard-message loading">Memuat data...</div>}

        {section === 'budgets' && <BudgetManagement />}
        {section === 'categories' && isOwner && <CategoryManagement />}

        {section === 'transactions' && (
          <section className="transaction-monitoring">
            <div className="transaction-monitor-metrics">
              <article><span>Total pemasukan</span><strong>{currency(transactionSummary?.income_total)}</strong><small>{transactionSummary?.income_count ?? 0} transaksi dalam cakupan</small></article>
              <article><span>Total pengeluaran</span><strong>{currency(transactionSummary?.expense_total)}</strong><small>{transactionSummary?.expense_count ?? 0} transaksi dalam cakupan</small></article>
              <article><span>Total transfer internal</span><strong>{currency(transactionSummary?.transfer_total)}</strong><small>{transactionSummary?.transfer_count ?? 0} transaksi dalam cakupan</small></article>
              <article><span>Transaksi tercatat</span><strong>{transactionSummary?.total_count ?? 0}</strong><small>{transactionSummary?.attention_count ?? 0} memiliki riwayat koreksi</small></article>
            </div>

            <div className="business-panel transaction-monitor-filters">
              <div className="transaction-monitor-tabs" role="group" aria-label="Filter jenis transaksi">
                {[
                  { label: 'Semua mutasi', type: '', count: transactionSummary?.total_count },
                  { label: 'Pemasukan', type: 'income', count: transactionSummary?.income_count },
                  { label: 'Pengeluaran', type: 'expense', count: transactionSummary?.expense_count },
                  { label: 'Transfer', type: 'transfer', count: transactionSummary?.transfer_count },
                  { label: 'Riwayat koreksi', type: '', attention: true, count: transactionSummary?.attention_count },
                ].map((tab) => {
                  const active = transactionFilters.transaction_type === tab.type
                    && transactionFilters.attention === Boolean(tab.attention);
                  return <button
                    key={tab.label}
                    className={active ? 'active' : ''}
                    type="button"
                    aria-pressed={active}
                    onClick={() => changeTransactionTab(tab.type, Boolean(tab.attention))}
                  >
                    {tab.label}<span>{tab.count ?? 0}</span>
                  </button>;
                })}
              </div>
              <form className="transaction-filter-form" onSubmit={applyTransactionFilters}>
                <label className="transaction-search">
                  <input
                    type="search"
                    placeholder="Cari ID transaksi, merchant, pencatat, atau keterangan..."
                    value={transactionFilterDraft.search}
                    onChange={(event) => setTransactionFilterDraft((current) => ({ ...current, search: event.target.value }))}
                  />
                </label>
                <label>
                  <select
                    aria-label="Sumber dana"
                    value={transactionFilterDraft.wallet_id}
                    onChange={(event) => setTransactionFilterDraft((current) => ({ ...current, wallet_id: event.target.value }))}
                  >
                    <option value="">Semua kas/rekening</option>
                    {wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                  </select>
                </label>
                <button className="business-button" type="submit">Terapkan</button>
                {showTransactionFilters && <div className="transaction-advanced-filters">
                  <label><span>Dari tanggal</span><input type="date" value={transactionFilterDraft.date_from} onChange={(event) => setTransactionFilterDraft((current) => ({ ...current, date_from: event.target.value }))} /></label>
                  <label><span>Sampai tanggal</span><input type="date" value={transactionFilterDraft.date_to} onChange={(event) => setTransactionFilterDraft((current) => ({ ...current, date_to: event.target.value }))} /></label>
                  <label><span>Kategori</span>
                    <select value={transactionFilterDraft.category_id} onChange={(event) => setTransactionFilterDraft((current) => ({ ...current, category_id: event.target.value }))}>
                      <option value="">Semua kategori</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>
                </div>}
                {(transactionFilters.search || transactionFilters.wallet_id || transactionFilters.category_id
                  || transactionFilters.date_from || transactionFilters.date_to) && <button className="transaction-reset" type="button" onClick={resetTransactionFilters}>Hapus filter</button>}
              </form>
            </div>

            {showTransactionForm && user?.role !== 'owner' && <form className="business-panel business-form transaction-entry-form" onSubmit={submit}>
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
            </form>}

            <div className="business-panel transaction-ledger-wrap">
              <div className="transaction-ledger-scroll">
                <table className="transaction-ledger">
                  <thead><tr>
                    <th>Waktu &amp; ID transaksi</th><th>Jenis &amp; kategori</th><th>Sumber dana</th>
                    <th>Uraian &amp; pencatat</th><th className="transaction-amount-cell">Nominal &amp; status</th>
                    {isOwner && <th>Aksi</th>}
                  </tr></thead>
                  <tbody>{listData.length ? listData.map((item) => {
                    const corrected = Boolean(item.reversal || item.reversal_of_id);
                    const typeLabel = { income: 'Pemasukan', expense: 'Pengeluaran', transfer: 'Transfer internal' }[item.transaction_type] ?? item.transaction_type;
                    const timeLabel = item.created_at
                      ? new Date(item.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
                      : null;
                    const dateOnly = String(item.date).slice(0, 10);
                    return <tr key={item.id}>
                      <td><strong>{new Date(`${dateOnly}T00:00:00`).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                        {timeLabel && <small>{timeLabel}</small>}<code>{transactionReference(item.id)}</code></td>
                      <td><span className="transaction-kind">{typeLabel}</span><small>{item.category?.name ?? (item.transaction_type === 'transfer' ? 'Netral kas' : 'Tanpa kategori')}</small></td>
                      <td><strong>{item.wallet?.name ?? '-'}</strong>
                        {item.destination_wallet && <small>Tujuan: {item.destination_wallet.name}</small>}
                        {item.payment_method && <small>{item.payment_method}</small>}</td>
                      <td><strong className="transaction-description">{item.description || item.merchant || 'Tanpa keterangan'}</strong>
                        {item.description && item.merchant && <small>{item.merchant}</small>}
                        <small>Dicatat oleh {item.user?.name ?? 'Pengguna'}</small></td>
                      <td className="transaction-amount-cell"><strong>{item.transaction_type === 'expense' ? '− ' : item.transaction_type === 'income' ? '+ ' : ''}{currency(item.amount)}</strong>
                        <span className={`transaction-status${corrected ? ' corrected' : ''}`}>{corrected ? 'Memiliki koreksi' : 'Terposting'}</span></td>
                      {isOwner && <td>{corrected ? <span className="transaction-muted">Riwayat tercatat</span>
                        : <button className="business-button secondary" type="button" onClick={() => reverseTransaction(item)}>Koreksi</button>}</td>}
                    </tr>;
                  }) : <tr><td className="transaction-empty" colSpan={isOwner ? 6 : 5}>Belum ada transaksi yang sesuai dengan filter.</td></tr>}</tbody>
                </table>
              </div>
              <div className="transaction-ledger-footer">
                <span>Menampilkan {listData.length} dari {shownPageInfo?.total ?? 0} transaksi</span>
                <PageControls pageInfo={shownPageInfo} onPageChange={changePage} />
              </div>
            </div>
            <aside className="transaction-policy-note">
              <div><strong>Riwayat transaksi tetap tercatat</strong>
                <p>Transaksi yang sudah diposting tidak dapat diedit atau dihapus. Owner dapat membuat koreksi melalui transaksi pembalik agar perubahan tetap tercatat pada audit trail.</p></div>
            </aside>
          </section>
        )}

        {section === 'wallets' && (
          <>
            {isOwner && <div className="owner-page-heading wallet-page-heading">
              <div>
                <span className="owner-kicker">MANAJEMEN LIKUIDITAS & SUMBER DANA</span>
                <h2>Kas & Rekening Bisnis</h2>
                <p>Kelola sumber dana dan pantau saldo buku dari saldo awal serta transaksi yang sudah dicatat.</p>
              </div>
              <div className="owner-heading-actions">
                <button className="business-button secondary" type="button" onClick={() => navigate('/reconciliations', { state: { openReconciliationForm: true } })}>Audit fisik kas</button>
                <button className="business-button secondary" type="button" onClick={() => document.getElementById('owner-transfer')?.scrollIntoView({ behavior: 'smooth' })}>Transfer antar-akun</button>
                <button className="business-button" type="button" onClick={() => {
                  setEditingWalletId(null);
                  setForm({ transaction_type: 'income', date: today(), type: 'cash', opening_balance: '' });
                  setShowWalletForm((visible) => !visible);
                }}>+ Tambah akun / rekening</button>
              </div>
            </div>}
            {isOwner && showWalletForm && <form className="business-panel business-form owner-editor" onSubmit={submit}>
              <h2>{editingWalletId === null ? 'Tambah kas atau rekening' : 'Ubah kas atau rekening'}</h2>
              <div className="business-form-grid">
                <Field label="Nama sumber dana"><input name="name" value={form.name ?? ''} onChange={setField} required /></Field>
                <Field label="Jenis"><select name="type" value={form.type ?? 'cash'} onChange={setField}><option value="cash">Kas tunai</option><option value="bank">Rekening bank</option><option value="other">Lainnya</option></select></Field>
                {editingWalletId === null && <Field label="Saldo awal"><input name="opening_balance" type="number" min="0" step="0.01" value={form.opening_balance ?? ''} onChange={setField} required /></Field>}
              </div>
              <button className="business-button" disabled={saving}>{saving ? 'Menyimpan...' : editingWalletId === null ? 'Tambah sumber dana' : 'Simpan perubahan'}</button>
              {editingWalletId !== null && <button className="business-button secondary" type="button" onClick={() => {
                setEditingWalletId(null);
                setShowWalletForm(false);
                setForm({ transaction_type: 'income', date: today(), type: 'cash', opening_balance: '' });
              }}>Batal</button>}
            </form>}
            <div className="owner-metrics">
              <article><span>Saldo tercatat · sumber aktif</span><strong>{currency(activeWallets.reduce((sum, item) => sum + Number(item.balance || 0), 0))}</strong><small>Saldo buku, bukan saldo bank real-time</small></article>
              <article><span>Saldo rekening bank</span><strong>{currency(activeWallets.filter((item) => item.type === 'bank').reduce((sum, item) => sum + Number(item.balance || 0), 0))}</strong><small>{activeWallets.filter((item) => item.type === 'bank').length} rekening aktif</small></article>
              <article><span>Saldo kas tunai</span><strong>{currency(activeWallets.filter((item) => item.type === 'cash').reduce((sum, item) => sum + Number(item.balance || 0), 0))}</strong><small>Perlu opname untuk mencocokkan uang fisik</small></article>
              <article><span>Sumber dana aktif</span><strong>{activeWallets.length}</strong><small>{walletRows.filter((item) => !item.is_active).length} sumber dana nonaktif</small></article>
            </div>
            <section className="business-panel owner-section owner-wallet-list">
              <div className="business-section-heading">
                <div><h2>Pusat kas & rekening terdaftar</h2><small>{walletRows.length} sumber dana · saldo diperbarui dari transaksi yang sudah dicatat</small></div>
              </div>
              <div className="owner-wallet-filters">
                <Field label="Cari sumber dana"><input value={walletSearch} onChange={(event) => setWalletSearch(event.target.value)} placeholder="Nama akun atau rekening" /></Field>
                <Field label="Jenis sumber"><select value={walletTypeFilter} onChange={(event) => setWalletTypeFilter(event.target.value)}><option value="all">Semua jenis</option><option value="bank">Rekening bank</option><option value="cash">Kas tunai</option><option value="other">Lainnya</option></select></Field>
                <Field label="Status"><select value={walletStatusFilter} onChange={(event) => setWalletStatusFilter(event.target.value)}><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="all">Semua</option></select></Field>
                <span className="business-muted">{visibleWalletRows.length} dari {walletRows.length} sumber dana</span>
              </div>
              <div className="business-card-grid">{visibleWalletRows.map((wallet) => <article className="business-panel business-balance-card" key={wallet.id}>
                <div className="owner-wallet-card-heading">
                  <span>{wallet.type === 'cash' ? 'KAS TUNAI' : wallet.type === 'bank' ? 'REKENING BANK' : 'SUMBER DANA LAINNYA'}</span>
                  <span className={`owner-wallet-status${wallet.is_active ? ' active' : ''}`}>{wallet.is_active ? 'Aktif' : 'Nonaktif'}</span>
                </div>
                <h2>{wallet.name}</h2><strong>{currency(wallet.balance)}</strong>
                <small>Saldo awal: {currency(wallet.opening_balance)}</small>
                {wallet.is_active && <div className="owner-wallet-note">Saldo berjalan dari saldo awal dan mutasi yang telah dibukukan.</div>}
              {isOwner && <div className="business-actions">
                <button className="business-button secondary" type="button" onClick={() => viewWalletTransactions(wallet)}>Mutasi rekening</button>
                {wallet.is_active && <button className="business-button secondary" type="button" onClick={() => reconcileWallet(wallet)}>Rekonsiliasi kas</button>}
                <button className="business-button secondary" type="button" onClick={() => {
                  setEditingWalletId(wallet.id);
                  setForm({ name: wallet.name, type: wallet.type });
                  setShowWalletForm(true);
                }}>Ubah</button>
                <button className="business-button secondary" type="button" onClick={() => toggleWallet(wallet)}>{wallet.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </div>}
              </article>)}
                {!visibleWalletRows.length && <p className="business-muted owner-wallet-empty">{walletRows.length ? 'Tidak ada sumber dana yang cocok dengan filter.' : 'Belum ada sumber dana yang terdaftar.'}</p>}
              </div>
            </section>
            {isOwner && <div className="owner-wallet-lower-grid">
              <section className="business-panel owner-wallet-activity">
                <div className="business-section-heading">
                  <div><h2>Mutasi antar-akun & pergerakan kas</h2><small>Aktivitas aktual dari buku transaksi usaha</small></div>
                  <button className="business-button secondary" type="button" onClick={exportWalletTransactions} disabled={exportingWalletTransactions}>
                    {exportingWalletTransactions ? 'Mengekspor...' : 'Ekspor CSV'}
                  </button>
                </div>
                <div className="owner-wallet-activity-filters">
                  <Field label="Sumber dana"><select value={walletActivityFilter.wallet_id} onChange={(event) => setWalletActivityFilter((current) => ({ ...current, wallet_id: event.target.value }))}>
                    <option value="">Semua sumber dana</option>
                    {walletRows.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                  </select></Field>
                  <Field label="Jenis mutasi"><select value={walletActivityFilter.transaction_type} onChange={(event) => setWalletActivityFilter((current) => ({ ...current, transaction_type: event.target.value }))}>
                    <option value="">Semua jenis</option><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option><option value="transfer">Transfer internal</option>
                  </select></Field>
                  <button className="business-button secondary" type="button" onClick={() => setWalletActivityFilter({ wallet_id: '', transaction_type: '' })}>Reset filter</button>
                </div>
                <div className="owner-wallet-transaction-list">
                  {walletTransactions.slice(0, 4).map((item) => {
                    const transactionType = item.transaction_type === 'transfer' ? 'Transfer internal'
                      : item.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran';
                    const movement = item.transaction_type === 'transfer'
                      ? `${item.wallet?.name ?? 'Sumber'} → ${item.destination_wallet?.name ?? 'Tujuan'}`
                      : item.wallet?.name ?? 'Sumber dana';
                    const transactionDate = String(item.date).slice(0, 10);
                    return <article className="owner-wallet-transaction" key={item.id}>
                      <div className="owner-wallet-transaction-icon">{item.transaction_type === 'transfer' ? '⇄' : item.transaction_type === 'income' ? '↓' : '↑'}</div>
                      <div className="owner-wallet-transaction-description">
                        <strong>{item.description || transactionType}</strong>
                        <span>{movement} · {new Date(`${transactionDate}T00:00:00`).toLocaleDateString('id-ID')} · {item.user?.name ?? 'Pengguna'}</span>
                      </div>
                      <div className="owner-wallet-transaction-amount">
                        <strong>{currency(item.amount)}</strong>
                        <small>{transactionType}{item.reversal_of_id || item.reversal ? ' · Dikoreksi' : ''}</small>
                      </div>
                    </article>;
                  })}
                  {!walletTransactions.length && <p className="business-muted owner-wallet-empty">Belum ada mutasi transaksi.</p>}
                </div>
                <div className="owner-wallet-activity-footer">
                  <span>Menampilkan {Math.min(walletTransactions.length, 4)} dari {walletTransactionCount} mutasi</span>
                  <button className="business-button secondary" type="button" onClick={showAllWalletTransactions}>Lihat semua mutasi</button>
                </div>
              </section>

              <section className="business-panel owner-wallet-controls">
                <div className="business-section-heading">
                  <div><h2>Kontrol saldo & integritas kas</h2><small>Fitur yang tersedia dalam sistem</small></div>
                </div>
                <article className="owner-wallet-control-item">
                  <div><strong>Saldo bersumber dari buku transaksi</strong><span>Saldo awal ditambah pemasukan, dikurangi pengeluaran, serta dikoreksi transfer internal.</span></div>
                  <span className="owner-wallet-control-badge">Aktif</span>
                </article>
                <article className="owner-wallet-control-item">
                  <div><strong>Rekonsiliasi fisik kas</strong><span>Catat hasil hitung kas; hasilnya menunggu review Supervisor dan tidak mengubah saldo otomatis.</span></div>
                  <button className="business-button secondary" type="button" onClick={() => navigate('/reconciliations', { state: { openReconciliationForm: true } })}>Buka</button>
                </article>
                <article className="owner-wallet-control-item">
                  <div><strong>Audit & koreksi transaksi</strong><span>Transaksi yang sudah dibukukan dikoreksi lewat pembalikan tercatat, bukan dihapus.</span></div>
                  <button className="business-button secondary" type="button" onClick={() => navigate('/audit')}>Audit trail</button>
                </article>
                <div className="owner-wallet-quick-actions">
                  <span>AKSI PENGELOLAAN OWNER</span>
                  <button className="business-button" type="button" disabled={activeWallets.length < 2} onClick={() => document.getElementById('owner-transfer')?.scrollIntoView({ behavior: 'smooth' })}>
                    {activeWallets.length < 2 ? 'Perlu 2 sumber aktif untuk transfer' : 'Transfer antar-akun'}
                  </button>
                </div>
              </section>
            </div>}
            {isOwner && <form id="owner-transfer" className="business-panel business-form owner-section owner-editor" onSubmit={transferFunds}>
              <h2>Transfer antar-kas dan rekening</h2>
              <p>Transfer dicatat sebagai perpindahan internal; tidak menambah pemasukan atau pengeluaran usaha.</p>
              <div className="business-form-grid">
                <Field label="Sumber"><select value={transfer.wallet_id} onChange={(event) => setTransfer((value) => ({ ...value, wallet_id: event.target.value }))} required><option value="">Pilih sumber</option>{activeWallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Tujuan"><select value={transfer.destination_wallet_id} onChange={(event) => setTransfer((value) => ({ ...value, destination_wallet_id: event.target.value }))} required><option value="">Pilih tujuan</option>{activeWallets.filter((item) => String(item.id) !== transfer.wallet_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Nominal"><input type="number" min="1" step="0.01" value={transfer.amount} onChange={(event) => setTransfer((value) => ({ ...value, amount: event.target.value }))} required /></Field>
                <Field label="Tanggal"><input type="date" value={transfer.date} onChange={(event) => setTransfer((value) => ({ ...value, date: event.target.value }))} required /></Field>
                <Field label="Keterangan"><input value={transfer.description} onChange={(event) => setTransfer((value) => ({ ...value, description: event.target.value }))} /></Field>
              </div>
              <button className="business-button" disabled={transferSaving || activeWallets.length < 2}>{transferSaving ? 'Mencatat...' : 'Catat transfer'}</button>
            </form>}
            {isOwner && <section id="owner-statement" className="business-panel business-form owner-section owner-editor">
              <h2>Cocokkan mutasi rekening dari CSV</h2>
              <p>Pencocokan dilakukan di browser dengan transaksi yang sudah tercatat; file tidak disinkronkan ke bank dan tidak mengubah saldo.</p>
              <div className="business-form-grid">
                <Field label="Kas/rekening"><select value={statementWalletId} onChange={(event) => setStatementWalletId(event.target.value)}><option value="">Pilih sumber dana</option>{walletRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="File mutasi CSV (maks. 5 MB)"><input type="file" accept=".csv,text/csv" onChange={importStatement} /></Field>
              </div>
              {statementError && <p className="owner-error" role="alert">{statementError}</p>}
              {statement && <><p className="business-muted">{statement.filename}: {statement.rows.filter((row) => row.matched).length} cocok, {statement.rows.filter((row) => !row.matched).length} perlu diperiksa.</p>
                <DataTable headers={['Baris', 'Tanggal', 'Deskripsi', 'Nominal', 'Pencocokan']} rows={statement.rows.slice(0, 100).map((row) => [
                  row.line, row.date, row.description, currency(row.amount),
                  row.matched ? `Cocok: ${row.matched.description || row.matched.merchant || row.matched.transaction_type}` : 'Belum ada transaksi cocok',
                ])} />
              </>}
            </section>}
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
            <div className="owner-metrics">
              <article><span>Total · semua status</span><strong>{requestSummary?.total_count ?? shownPageInfo?.total ?? requestRows.length}</strong><small>{currency(requestSummary?.total_amount ?? 0)}</small></article>
              <article><span>Menunggu keputusan</span><strong>{requestSummary?.pending_count ?? 0}</strong><small>{currency(requestSummary?.pending_amount ?? 0)}</small></article>
              <article><span>Disetujui</span><strong>{requestSummary?.approved_count ?? 0}</strong><small>{currency(requestSummary?.approved_amount ?? 0)}</small></article>
              <article><span>Ditolak</span><strong>{requestSummary?.rejected_count ?? 0}</strong><small>{currency(requestSummary?.rejected_amount ?? 0)}</small></article>
              <article><span>Dibayar</span><strong>{requestSummary?.paid_count ?? 0}</strong><small>{currency(requestSummary?.paid_amount ?? 0)}</small></article>
            </div>
            {isOwner && <div className="owner-protocol"><strong>◈ Protokol Pemisahan Otoritas Pemilik</strong><span>Owner memantau dan mengunduh bukti. Keputusan persetujuan atau penolakan tetap dilakukan Supervisor sesuai izin yang berlaku.</span></div>}
            <section className="business-panel owner-section">
              <div className="business-section-heading">
                <div><h2>Daftar Pengajuan</h2><small>Gunakan filter untuk menelusuri pengajuan dan status pembayarannya.</small></div>
              </div>
              <form id="request-filters" className="owner-request-filter-form" onSubmit={applyRequestFilters}>
                <div className="owner-request-filter-grid">
                  <Field label="Cari ID, pemohon, tujuan"><input value={requestFilterDraft.search} onChange={(event) => setRequestFilterDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Nama, REQ-0001, atau tujuan" /></Field>
                  <Field label="Status"><select value={requestFilterDraft.status} onChange={(event) => setRequestFilterDraft((current) => ({ ...current, status: event.target.value }))}><option value="all">Semua status</option>{Object.entries(requestStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></Field>
                  <Field label="Kategori"><select value={requestFilterDraft.category_id} onChange={(event) => setRequestFilterDraft((current) => ({ ...current, category_id: event.target.value }))}><option value="">Semua kategori</option>{categories.filter((item) => item.type === 'expense').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="Kas/rekening"><select value={requestFilterDraft.wallet_id} onChange={(event) => setRequestFilterDraft((current) => ({ ...current, wallet_id: event.target.value }))}><option value="">Semua sumber dana</option>{wallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                  <Field label="Nominal minimum"><input type="number" min="0" step="1" value={requestFilterDraft.amount_min} onChange={(event) => setRequestFilterDraft((current) => ({ ...current, amount_min: event.target.value }))} /></Field>
                  <Field label="Nominal maksimum"><input type="number" min="0" step="1" value={requestFilterDraft.amount_max} onChange={(event) => setRequestFilterDraft((current) => ({ ...current, amount_max: event.target.value }))} /></Field>
                  <Field label="Diajukan mulai"><input type="date" value={requestFilterDraft.date_from} onChange={(event) => setRequestFilterDraft((current) => ({ ...current, date_from: event.target.value }))} /></Field>
                  <Field label="Diajukan sampai"><input type="date" value={requestFilterDraft.date_to} onChange={(event) => setRequestFilterDraft((current) => ({ ...current, date_to: event.target.value }))} /></Field>
                </div>
                <div className="business-actions">
                  <button className="business-button" type="submit">Terapkan filter</button>
                  <button className="business-button secondary" type="button" onClick={resetRequestFilters}>Reset</button>
                </div>
              </form>
            {isOwner ? <DataTable headers={['ID & WAKTU', 'PEMOHON', 'KEPERLUAN & KATEGORI', 'NOMINAL', 'STATUS & SUMBER DANA', 'VERIFIKASI / ALASAN', 'AKSI']} rows={visibleRequests.map((item) => [
              <><strong>REQ-{String(item.id).padStart(4, '0')}</strong><small>{item.created_at ? new Date(item.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</small></>,
              <><strong>{item.requester?.name ?? 'Pengguna'}</strong><small>{item.requester?.role ?? 'Staff'}</small></>,
              <><strong>{item.purpose}</strong><small>{item.category?.name ?? 'Tanpa kategori'}</small>{item.description && <small>{item.description}</small>}</>,
              <strong className="owner-amount">{currency(item.amount)}</strong>,
              <><span className={`business-status status-${item.status}`}>{requestStatusLabels[item.status] ?? item.status}</span><small>{item.wallet?.name ?? '-'}</small></>,
              <small>{item.decision_note || (item.status === 'pending' ? 'Menunggu keputusan Supervisor' : item.decider?.name ? `Diputuskan oleh ${item.decider.name}` : item.transaction_id ? `Transaksi #${item.transaction_id}` : 'Tidak ada catatan')}</small>,
              item.has_attachment ? <button className="business-button secondary" type="button" onClick={() => downloadEvidence(item)}>↓ Bukti</button> : '-',
            ])} /> : <div className="business-list">{visibleRequests.map((item) => <article className="business-panel business-list-item" key={item.id}>
              <div><strong>{item.purpose}</strong><span>{item.requester?.name} · {item.category?.name ?? 'Tanpa kategori'} · {item.wallet?.name}</span><small>{item.description}</small></div>
              <div className="business-request-value"><strong>{currency(item.amount)}</strong><span className={`business-status status-${item.status}`}>{requestStatusLabels[item.status] ?? item.status}</span></div>
              {item.has_attachment && <button className="business-button secondary" onClick={() => downloadEvidence(item)}>Unduh bukti</button>}
              {isSupervisor && item.status === 'pending' && <div className="business-actions">
                <button className="business-button" onClick={() => decide(item.id, 'approve')}>Setujui</button>
                <button className="business-button secondary" onClick={() => decide(item.id, 'reject')}>Tolak</button>
              </div>}
              {user?.role === 'staff' && item.status === 'approved' && <button className="business-button" onClick={() => payRequest(item)}>Catat sudah dibayar</button>}
              {item.decision_note && <small className="business-decision-note">Catatan: {item.decision_note}</small>}
              {item.transaction_id && <small>Transaksi #{item.transaction_id} · saldo sudah diperbarui</small>}
            </article>)}{!visibleRequests.length && <p className="business-muted">Tidak ada pengajuan yang sesuai.</p>}</div>}
            <PageControls pageInfo={shownPageInfo} onPageChange={changePage} />
            </section>
          </>
        )}

        {section === 'users' && isOwner && <UserManagement />}

        {section === 'debts' && (
          <>
            <div className="owner-page-heading debt-page-heading">
              <div>
                <span className="owner-kicker">BUKU PEMBANTU UTANG PIUTANG · AP / AR</span>
                <h2>Manajemen Utang & Piutang Usaha</h2>
                <p>Pantau sisa kewajiban, tagihan, serta jatuh tempo; setiap pelunasan dicatat sebagai transaksi kas yang dapat ditelusuri.</p>
              </div>
              <div className="owner-heading-actions">
                <button className="business-button secondary" type="button" onClick={() => document.getElementById('debt-ledgers')?.scrollIntoView({ behavior: 'smooth' })}>Lihat buku</button>
                <button className="business-button secondary" type="button" onClick={exportDebts} disabled={exportingDebts}>
                  {exportingDebts ? 'Menyiapkan ekspor…' : 'Ekspor CSV'}
                </button>
                <button className="business-button" type="button" onClick={() => openDebtForm('payable')}>＋ Catat utang</button>
                <button className="business-button secondary" type="button" onClick={() => openDebtForm('receivable')}>＋ Catat piutang</button>
              </div>
            </div>
            {showDebtForm && <form className="business-panel business-form owner-editor debt-editor" onSubmit={submit}>
              <h2>{form.type === 'payable' ? 'Catat utang usaha' : 'Catat piutang usaha'}</h2>
              <p>Pencatatan ini belum mengubah saldo kas. Saldo berubah saat pembayaran atau penerimaan dicatat.</p>
              <div className="business-form-grid">
                <Field label="Jenis"><select name="type" value={form.type ?? 'receivable'} onChange={setField}><option value="payable">Utang usaha</option><option value="receivable">Piutang usaha</option></select></Field>
                <Field label="Supplier / pelanggan"><input name="counterparty" value={form.counterparty ?? ''} onChange={setField} required maxLength="255" /></Field>
                <Field label="Nominal awal"><input name="amount" type="number" min="0.01" step="0.01" value={form.amount ?? ''} onChange={setField} required /></Field>
                <Field label="Jatuh tempo"><input name="due_date" type="date" value={form.due_date ?? ''} onChange={setField} /></Field>
                <Field label="Catatan"><input name="description" value={form.description ?? ''} onChange={setField} maxLength="500" placeholder="Contoh: pembelian bahan baku" /></Field>
              </div>
              <button className="business-button" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan catatan'}</button>
              <button className="business-button secondary" type="button" onClick={() => setShowDebtForm(false)}>Batal</button>
            </form>}
            <div className="owner-metrics debt-metrics">
              <article><span>Total utang terbuka</span><strong>{currency(debtSummary?.payable_open_amount ?? 0)}</strong><small>{debtSummary?.payable_open_count ?? 0} catatan aktif</small></article>
              <article><span>Total piutang terbuka</span><strong>{currency(debtSummary?.receivable_open_amount ?? 0)}</strong><small>{debtSummary?.receivable_open_count ?? 0} catatan aktif</small></article>
              <article><span>Posisi netto (piutang − utang)</span><strong>{currency(debtSummary?.net_position ?? 0)}</strong><small>Belum termasuk transaksi kas lain</small></article>
              <article><span>Perlu tindak lanjut</span><strong>{debtSummary?.overdue_count ?? 0}</strong><small>{currency(debtSummary?.overdue_amount ?? 0)} telah melewati jatuh tempo</small></article>
            </div>
            <section className="business-panel debt-alert-panel">
              <div className="business-section-heading">
                <div><h2>Pengingat jatuh tempo</h2><small>Tagihan terlambat dan yang jatuh tempo dalam 7 hari</small></div>
                <span className="business-status">{debtSummary?.due_next_7_count ?? 0} mendatang</span>
              </div>
              {debtAlerts.length ? <div className="debt-alert-grid">{debtAlerts.map((item) => (
                <article className="debt-alert-card" key={item.id}>
                  <div className="debt-alert-main">
                    <div><span className="business-status">{debtTypeLabels[item.type]}</span><strong>{item.counterparty}</strong><small>{item.description || `Catatan #${item.id}`}</small></div>
                    <div className="debt-alert-amount"><span>{debtDueLabel(item)}</span><strong>{currency(item.remaining_amount)}</strong></div>
                  </div>
                  <div className="debt-alert-footer">
                    <span>Jatuh tempo {dateLabel(item.due_date)}</span>
                    <button className="business-button secondary" type="button" onClick={() => {
                      selectDebtTab({ type: item.type, status: 'open', due_period: 'all', search: '' });
                      settleDebt(item);
                      document.getElementById('debt-ledgers')?.scrollIntoView({ behavior: 'smooth' });
                    }}>{item.type === 'payable' ? 'Catat pembayaran' : 'Catat penerimaan'}</button>
                  </div>
                </article>
              ))}</div> : <p className="business-muted">Tidak ada tagihan terlambat atau yang jatuh tempo dalam 7 hari.</p>}
            </section>
            <section className="business-panel debt-workspace">
              <div className="debt-tabs" role="tablist" aria-label="Jenis catatan utang piutang">
                {[
                  { label: 'Semua aktif', filters: { type: 'all', status: 'open', due_period: 'all' }, count: debtSummary?.open_count },
                  { label: 'Utang supplier', filters: { type: 'payable', status: 'open', due_period: 'all' }, count: debtSummary?.payable_open_count },
                  { label: 'Piutang mitra', filters: { type: 'receivable', status: 'open', due_period: 'all' }, count: debtSummary?.receivable_open_count },
                  { label: 'Jatuh tempo 7 hari', filters: { type: 'all', status: 'open', due_period: 'next_7' }, count: debtSummary?.due_next_7_count },
                  { label: 'Lunas & arsip', filters: { type: 'all', status: 'settled', due_period: 'all' }, count: debtSummary?.settled_count },
                ].map((tab) => {
                  const active = debtFilters.type === tab.filters.type
                    && debtFilters.status === tab.filters.status
                    && debtFilters.due_period === tab.filters.due_period;
                  return <button key={tab.label} type="button" role="tab" aria-selected={active} className={active ? 'active' : ''} onClick={() => selectDebtTab(tab.filters)}>
                    {tab.label}<span>{tab.count ?? 0}</span>
                  </button>;
                })}
              </div>
              <form className="debt-filters" onSubmit={applyDebtFilters}>
                <Field label="Cari rekanan / catatan"><input value={debtFilterDraft.search} onChange={(event) => setDebtFilterDraft((current) => ({ ...current, search: event.target.value }))} placeholder="Nama atau deskripsi..." /></Field>
                <Field label="Status"><select value={debtFilterDraft.status} onChange={(event) => setDebtFilterDraft((current) => ({ ...current, status: event.target.value }))}><option value="all">Semua</option><option value="open">Belum lunas</option><option value="settled">Lunas</option></select></Field>
                <Field label="Jatuh tempo"><select value={debtFilterDraft.due_period} onChange={(event) => setDebtFilterDraft((current) => ({ ...current, due_period: event.target.value }))}><option value="all">Semua tanggal</option><option value="overdue">Terlambat</option><option value="today">Hari ini</option><option value="next_7">7 hari ke depan</option><option value="later">Lebih dari 7 hari</option><option value="no_due">Tanpa tanggal</option></select></Field>
                <div className="debt-filter-actions"><button className="business-button" type="submit">Terapkan</button><button className="business-button secondary" type="button" onClick={resetDebtFilters}>Reset</button></div>
              </form>
              <div id="debt-ledgers" className="debt-ledger-grid">
                {(debtFilters.type === 'all' || debtFilters.type === 'payable') && <section className="debt-ledger">
                  <div className="debt-ledger-heading"><div><h2>Utang usaha · Accounts Payable</h2><small>{debtSummary?.payable_open_count ?? 0} catatan belum lunas</small></div><strong>{currency(debtSummary?.payable_open_amount ?? 0)}</strong></div>
                  <DataTable headers={['ID / Dicatat', 'Supplier / Catatan', 'Nominal / Terbayar', 'Sisa kewajiban', 'Jatuh tempo', 'Aksi']} rows={debtTableRows('payable')} />
                </section>}
                {(debtFilters.type === 'all' || debtFilters.type === 'receivable') && <section className="debt-ledger">
                  <div className="debt-ledger-heading"><div><h2>Piutang mitra · Accounts Receivable</h2><small>{debtSummary?.receivable_open_count ?? 0} catatan belum lunas</small></div><strong>{currency(debtSummary?.receivable_open_amount ?? 0)}</strong></div>
                  <DataTable headers={['ID / Dicatat', 'Pelanggan / Catatan', 'Nominal / Terbayar', 'Sisa tagihan', 'Jatuh tempo', 'Aksi']} rows={debtTableRows('receivable')} />
                </section>}
              </div>
              <PageControls pageInfo={shownPageInfo} onPageChange={changePage} />
            </section>
            <section className="debt-insights-grid">
              <div className="business-panel debt-aging-panel">
                <div className="business-section-heading"><div><h2>Umur kewajiban supplier</h2><small>Distribusi sisa utang berdasarkan tanggal jatuh tempo</small></div></div>
                {[
                  { label: 'Terlambat', amount: debtSummary?.payable_overdue_amount ?? 0 },
                  { label: '0–7 hari', amount: debtSummary?.payable_due_0_7_amount ?? 0 },
                  { label: '8–14 hari', amount: debtSummary?.payable_due_8_14_amount ?? 0 },
                  { label: 'Lebih dari 14 hari', amount: debtSummary?.payable_due_15_plus_amount ?? 0 },
                  { label: 'Tanpa tanggal', amount: debtSummary?.payable_no_due_amount ?? 0 },
                ].map((bucket) => {
                  const amount = Number(bucket.amount);
                  const total = Number(debtSummary?.payable_open_amount ?? 0);
                  const percent = total ? Math.min(100, Math.round((amount / total) * 100)) : 0;
                  return <div className="debt-aging-row" key={bucket.label}>
                    <div><span>{bucket.label}</span><strong>{currency(amount)}</strong></div>
                    <div className="debt-aging-track"><i style={{ width: `${percent}%` }} /></div>
                  </div>;
                })}
                <p className="debt-insight-note">Tidak ada simulasi diskon atau jadwal pembayaran pada data saat ini.</p>
              </div>
              <div className="business-panel debt-policy-panel">
                <div className="business-section-heading"><div><h2>Alur pencatatan</h2><small>Nilai saldo mengikuti pembayaran yang dicatat</small></div></div>
                <ul>
                  <li>Utang mengurangi saldo sumber dana saat pembayaran dicatat.</li>
                  <li>Piutang menambah saldo sumber dana saat penerimaan dicatat.</li>
                  <li>Pembayaran sebagian menyisakan kewajiban/tagihan terbuka sampai lunas.</li>
                </ul>
                <p className="debt-insight-note">Pilih sumber kas/rekening pada saat mencatat pembayaran. Catatan utang/piutang belum memiliki rekening tetap.</p>
              </div>
            </section>
          </>
        )}

        {section === 'reconciliations' && (
          <>
            <div className="owner-page-heading reconciliation-heading">
              <div><span className="owner-kicker">KONTROL SALDO KAS & REKENING</span><h2>Rekonsiliasi Kas</h2><p>Bandingkan saldo sistem dengan hasil hitung dan tindak lanjuti melalui review Supervisor.</p></div>
              <div className="owner-heading-actions">
                {isOwner && <button className="business-button secondary" type="button" onClick={() => navigate('/audit')}>Lihat audit trail</button>}
                <button className="business-button secondary" type="button" onClick={exportReconciliations} disabled={exportingReconciliations}>
                  {exportingReconciliations ? 'Menyiapkan ekspor…' : '↓ Ekspor CSV'}
                </button>
                {isOwner && <button className="business-button" type="button" onClick={() => {
                  const nextVisible = !reconciliationFormOpen;
                  setShowReconciliationForm(nextVisible);
                  if (!nextVisible && location.state?.openReconciliationForm) navigate(location.pathname, { replace: true, state: null });
                }}>{reconciliationFormOpen ? 'Tutup form' : '＋ Input hasil hitung'}</button>}
              </div>
            </div>
            {(!isOwner || reconciliationFormOpen) && <form className="business-panel business-form owner-editor" onSubmit={submit}>
              <h2>Input hasil hitung kas/rekening</h2>
              <p>Pengajuan rekonsiliasi tidak mengubah saldo; hasilnya menunggu review sesuai izin role.</p>
              <div className="business-form-grid">
                <Field label="Kas/rekening"><select name="wallet_id" value={form.wallet_id ?? ''} onChange={setField} required><option value="">Pilih sumber dana</option>{activeWallets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
                <Field label="Tanggal"><input name="reconciled_at" type="date" value={form.reconciled_at || today()} onChange={setField} required /></Field>
                <Field label="Saldo hasil hitung"><input name="counted_balance" type="number" min="0" step="0.01" value={form.counted_balance ?? ''} onChange={setField} required /></Field>
                <Field label="Catatan"><input name="notes" value={form.notes ?? ''} onChange={setField} /></Field>
              </div>
              <button className="business-button" disabled={saving}>Kirim untuk review</button>
              {isOwner && <button className="business-button secondary" type="button" onClick={() => {
                setShowReconciliationForm(false);
                if (location.state?.openReconciliationForm) navigate(location.pathname, { replace: true, state: null });
              }}>Batal</button>}
            </form>}
            <div className="owner-metrics">
              <article><span>Total hasil hitung</span><strong>{reconciliationSummary?.total_count ?? 0}</strong></article>
              <article><span>Menunggu review</span><strong>{reconciliationSummary?.pending_count ?? 0}</strong></article>
              <article><span>Sudah direview</span><strong>{reconciliationSummary?.reviewed_count ?? 0}</strong></article>
              <article><span>Total nilai selisih</span><strong>{currency(reconciliationSummary?.total_absolute_difference ?? 0)}</strong></article>
            </div>
            {pendingDifference && <section className="reconciliation-alert" role="status">
              <div><strong>Perlu ditinjau Supervisor</strong><span>
                {pendingDifference.wallet?.name ?? 'Sumber dana'} · {pendingDifference.reconciled_at} · selisih {currency(pendingDifference.difference)}
              </span></div>
              {isSupervisor && <button className="business-button secondary" type="button" onClick={() => reviewReconciliation(pendingDifference.id)}>Review hasil</button>}
            </section>}
            <section className="reconciliation-overview">
              <div className="business-panel reconciliation-breakdown">
                <div className="business-section-heading"><div><h2>Hasil perbandingan</h2><small>Distribusi untuk tanggal dan sumber dana yang dipilih</small></div></div>
                {[
                  { label: 'Sesuai', count: reconciliationSummary?.matched_count },
                  { label: 'Kurang', count: reconciliationSummary?.shortage_count },
                  { label: 'Lebih', count: reconciliationSummary?.surplus_count },
                ].map((item) => (
                  <div className="reconciliation-breakdown-row" key={item.label}>
                    <span>{item.label}</span>
                    <div className="reconciliation-breakdown-track"><i style={{ width: `${reconciliationPercent(item.count)}%` }} /></div>
                    <strong>{item.count ?? 0}</strong>
                  </div>
                ))}
                <small className="reconciliation-summary-note">Selisih neto: {currency(reconciliationSummary?.net_difference ?? 0)}. Ini catatan perbandingan, bukan perubahan saldo kas.</small>
              </div>
              <div className="business-panel reconciliation-protocol">
                <div className="business-section-heading"><div><h2>Alur rekonsiliasi</h2><small>Catatan dan audit tetap dapat ditelusuri</small></div></div>
                <ol>
                  <li>Catat saldo aktual hasil hitung untuk tanggal dan kas/rekening.</li>
                  <li>Sistem membandingkannya dengan saldo pada tanggal tersebut.</li>
                  <li>Supervisor meninjau hasil; review tidak mengubah saldo atau membuat transaksi.</li>
                </ol>
              </div>
            </section>
            <section className="business-panel owner-section">
              <div className="business-section-heading reconciliation-list-heading">
                <div><h2>Riwayat rekonsiliasi</h2><small>{shownPageInfo?.total ?? reconciliationRows.length} hasil ditemukan</small></div>
              </div>
              <form className="reconciliation-filters" onSubmit={applyReconciliationFilters}>
                <Field label="Cari"><input value={reconciliationFilterDraft.search} onChange={(event) => setReconciliationFilterDraft((current) => ({ ...current, search: event.target.value }))} placeholder="ID, catatan, pencatat..." /></Field>
                <Field label="Status"><select value={reconciliationFilterDraft.status} onChange={(event) => setReconciliationFilterDraft((current) => ({ ...current, status: event.target.value }))}><option value="all">Semua status</option><option value="pending">Menunggu review</option><option value="reviewed">Sudah direview</option></select></Field>
                <Field label="Kas/rekening"><select value={reconciliationFilterDraft.wallet_id} onChange={(event) => setReconciliationFilterDraft((current) => ({ ...current, wallet_id: event.target.value }))}><option value="">Semua sumber dana</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></Field>
                <Field label="Dari tanggal"><input type="date" value={reconciliationFilterDraft.date_from} onChange={(event) => setReconciliationFilterDraft((current) => ({ ...current, date_from: event.target.value }))} /></Field>
                <Field label="Sampai tanggal"><input type="date" value={reconciliationFilterDraft.date_to} onChange={(event) => setReconciliationFilterDraft((current) => ({ ...current, date_to: event.target.value }))} /></Field>
                <div className="reconciliation-filter-actions"><button className="business-button" type="submit">Terapkan</button><button className="business-button secondary" type="button" onClick={resetReconciliationFilters}>Reset</button></div>
              </form>
              <DataTable headers={['ID / Tanggal', 'Sumber dana', 'Saldo sistem', 'Hasil hitung', 'Selisih', 'Status', 'Catatan', 'Pencatat / reviewer', '']} rows={visibleReconciliations.map((item) => [
                <><strong>REC-{String(item.id).padStart(4, '0')}</strong><br />{item.reconciled_at}</>, item.wallet?.name ?? '-',
                currency(item.system_balance), currency(item.counted_balance),
                <strong className={Number(item.difference) === 0 ? '' : 'reconciliation-difference'}>{currency(item.difference)}</strong>,
                <span className={`business-status status-${item.status}`}>{reconciliationStatusLabels[item.status] ?? item.status}</span>,
                item.notes || '-', `${item.creator?.name ?? 'Pengguna'}${item.reviewer?.name ? ` / ${item.reviewer.name}` : ''}`,
                isSupervisor && item.status === 'pending' ? <button className="business-button secondary" type="button" onClick={() => reviewReconciliation(item.id)}>Review</button> : '-',
              ])} />
              <PageControls pageInfo={shownPageInfo} onPageChange={changePage} />
            </section>
          </>
        )}

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

    </div>
  );

  return <SupervisorFrame active={section} onLogout={logoutUser}>{workspaceContent}</SupervisorFrame>;
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

function PageControls({ pageInfo, onPageChange }) {
  if (!pageInfo || pageInfo.lastPage <= 1) return null;
  return (
    <nav className="owner-pagination" aria-label="Halaman data">
      <span>Halaman {pageInfo.currentPage} dari {pageInfo.lastPage} · {pageInfo.total} data</span>
      <div>
        <button className="business-button secondary" type="button" disabled={pageInfo.currentPage <= 1} onClick={() => onPageChange(pageInfo.currentPage - 1)}>Sebelumnya</button>
        <button className="business-button secondary" type="button" disabled={pageInfo.currentPage >= pageInfo.lastPage} onClick={() => onPageChange(pageInfo.currentPage + 1)}>Berikutnya</button>
      </div>
    </nav>
  );
}

export default BusinessWorkspace;
