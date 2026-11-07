import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Register() {
  const { setupOwner, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [setupRequired, setSetupRequired] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', business_name: '', password: '', password_confirmation: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/setup/status')
      .then(({ data }) => setSetupRequired(data.owner_setup_required))
      .catch(() => setError('Status setup tidak dapat diperiksa. Coba muat ulang halaman.'));
  }, []);

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  if (setupRequired === false) return <Navigate to="/login" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.password !== form.password_confirmation) {
      setError('Konfirmasi password tidak cocok.');
      return;
    }

    setSaving(true);
    try {
      await setupOwner(form);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(Object.values(requestError?.response?.data?.errors ?? {})[0]?.[0]
        ?? requestError?.response?.data?.message
        ?? 'Setup Owner gagal.');
    } finally {
      setSaving(false);
    }
  };

  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  return (
    <main className="setup-page">
      <form className="setup-card" onSubmit={submit}>
        <div className="setup-mark">BH</div>
        <span className="setup-eyebrow">PENYIAPAN SATU KALI</span>
        <h1>Buat akun Owner</h1>
        <p>Akun Owner pertama mengatur usaha dan membuat akun Supervisor serta Staff.</p>
        {error && <div className="setup-error" role="alert">{error}</div>}
        {setupRequired === null && <div className="setup-loading">Memeriksa status setup...</div>}
        <label>Nama Owner<input name="name" value={form.name} onChange={change} autoComplete="name" required /></label>
        <label>Email<input name="email" type="email" value={form.email} onChange={change} autoComplete="email" required /></label>
        <label>Nama usaha<input name="business_name" value={form.business_name} onChange={change} required /></label>
        <label>Password<input name="password" type="password" minLength="8" value={form.password} onChange={change} autoComplete="new-password" required /></label>
        <label>Konfirmasi password<input name="password_confirmation" type="password" minLength="8" value={form.password_confirmation} onChange={change} autoComplete="new-password" required /></label>
        <button type="submit" disabled={saving || setupRequired !== true}>{saving ? 'Menyiapkan...' : 'Siapkan usaha'}</button>
        <Link to="/login">Sudah memiliki akun? Masuk</Link>
      </form>
      <style>{`
        .setup-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; background: #f5f7fb; color: #172033; font-family: inherit; }
        .setup-card { width: min(100%, 430px); display: grid; gap: 14px; padding: 30px; border: 1px solid #e8ebf1; border-radius: 14px; background: #fff; box-shadow: 0 12px 32px #0f172a0d; }
        .setup-mark { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 11px; background: #5146e5; color: #fff; font-size: 13px; font-weight: 800; }
        .setup-eyebrow { color: #5146e5; font-size: 10px; font-weight: 800; letter-spacing: .1em; }
        .setup-card h1 { margin: -8px 0 0; font-size: 24px; }
        .setup-card p { margin: -8px 0 4px; color: #718096; font-size: 13px; line-height: 1.5; }
        .setup-card label { display: grid; gap: 6px; color: #475569; font-size: 12px; font-weight: 650; }
        .setup-card input { box-sizing: border-box; width: 100%; min-height: 40px; padding: 9px 10px; border: 1px solid #dfe5ee; border-radius: 7px; font: inherit; }
        .setup-card button { min-height: 42px; border: 0; border-radius: 8px; background: #5146e5; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
        .setup-card button:disabled { opacity: .55; cursor: wait; }
        .setup-card > a { color: #5146e5; font-size: 12px; text-align: center; text-decoration: none; }
        .setup-error { padding: 10px; border: 1px solid #fecaca; border-radius: 7px; background: #fff1f2; color: #b91c1c; font-size: 12px; }
        .setup-loading { color: #718096; font-size: 12px; }
      `}</style>
    </main>
  );
}

export default Register;
