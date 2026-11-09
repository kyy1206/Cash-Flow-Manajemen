import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const from = location.state?.from?.pathname || '/dashboard';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      if (isMounted.current) navigate(from, { replace: true });
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Login gagal. Periksa email dan password.';
      if (isMounted.current) setError(message);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  // Styles (inline untuk cepat; pindahkan ke CSS jika diperlukan)
  const pageStyle = {
    minHeight: '100vh',
    background: '#f5f7fb',
    display: 'flex',
    flexDirection: 'column'
  };

  const topbarStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 40px',
    maxWidth: 1100,
    width: '100%',
    margin: '0 auto',
    boxSizing: 'border-box'
  };

  const logoSmallStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: '#111827',
    fontWeight: 700,
    fontSize: 14
  };

  const containerStyle = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px'
  };

  const cardStyle = {
    width: 420,
    maxWidth: '92%',
    background: '#ffffff',
    borderRadius: 12,
    boxShadow: '0 10px 30px rgba(16,24,40,0.08)',
    padding: '28px',
    boxSizing: 'border-box'
  };

  const titleStyle = {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#111827',
    textAlign: 'center'
  };

  const descStyle = {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 1.4
  };

  const inputWrapStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#f4f7fb',
    borderRadius: 8,
    padding: '10px 12px',
    border: '1px solid rgba(99,102,241,0.06)'
  };

  const inputStyle = {
    border: 'none',
    background: 'transparent',
    outline: 'none',
    width: '100%',
    fontSize: 14,
    color: '#111827'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: 8,
    fontSize: 13,
    color: '#374151',
    fontWeight: 600
  };

  const buttonStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: 8,
    border: 'none',
    background: 'linear-gradient(90deg,#6c63ff 0%,#764ba2 100%)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: loading ? 'not-allowed' : 'pointer',
    boxShadow: '0 8px 18px rgba(108,99,255,0.18)'
  };

  const smallLinkStyle = {
    fontSize: 13,
    color: '#4f46e5',
    fontWeight: 600,
    textDecoration: 'none'
  };

  return (
    <div style={pageStyle}>
      {/* Top bar: small logo left, small link right */}
      <header style={topbarStyle}>
        <div style={logoSmallStyle}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            background: '#111827',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: 14
          }}>
            BH
          </div>
          <div style={{ fontSize: 14 }}>Bocor Halus</div>
        </div>

        <div style={{ fontSize: 13, color: '#6b7280' }}>
          <a href="#" style={{ color: '#6b7280', textDecoration: 'none' }}>Akun & Perusahaan</a>
        </div>
      </header>

      <main style={containerStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {/* Card */}
          <div style={cardStyle} role="region" aria-labelledby="login-title">
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                background: '#eef2ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4f46e5',
                fontWeight: 700,
                marginBottom: 12
              }}>
                BH
              </div>
            </div>

            <h2 id="login-title" style={titleStyle}>Selamat Datang Kembali</h2>
            <p style={descStyle}>
              Masuk ke akun Anda untuk melanjutkan.               Catat arus kas usaha, pantau saldo, dan kelola persetujuan pengeluaran.
            </p>

            {error && (
              <div role="alert" style={{
                background: '#fff1f2',
                color: '#b91c1c',
                padding: '10px 12px',
                borderRadius: 8,
                marginBottom: 12,
                fontSize: 13,
                border: '1px solid rgba(185,28,28,0.08)'
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: 12 }}>
                <label htmlFor="email" style={labelStyle}>Email</label>
                <div style={inputWrapStyle}>
                  {/* email icon */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M3 7.5v9A2.5 2.5 0 0 0 5.5 19h13A2.5 2.5 0 0 0 21 16.5v-9" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M21 7.5L12 13 3 7.5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@email.com"
                    required
                    autoComplete="email"
                    style={inputStyle}
                    aria-label="Email"
                  />
                </div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label htmlFor="password" style={labelStyle}>Password</label>
                  <Link to="/forgot-password" style={{ fontSize: 13, color: '#6b7280', textDecoration: 'none' }}>Lupa Password?</Link>
                </div>
                <div style={inputWrapStyle}>
                  {/* lock icon */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="3.5" y="10.5" width="17" height="9" rx="2" stroke="#9CA3AF" strokeWidth="1.5" />
                    <path d="M7 10.5V8a5 5 0 0 1 10 0v2.5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    style={{ ...inputStyle, marginRight: 6 }}
                    aria-label="Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#4f46e5',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: 13,
                      padding: '6px'
                    }}
                  >
                    {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '14px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
                  <input type="checkbox" style={{ width: 16, height: 16 }} />
                  Ingat saya
                </label>
                <div />
              </div>

              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                style={{ ...buttonStyle, opacity: loading ? 0.9 : 1 }}
              >
                {loading ? 'Memproses...' : 'Masuk'}
              </button>
            </form>

            <p style={{ marginTop: 14, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
              Belum punya akun?{' '}
              <Link to="/register" style={smallLinkStyle}>Daftarkan Owner</Link>
            </p>
          </div>

          {/* Small caption on the right side or additional illustration slot (keperluan layout mirip contoh) */}
        </div>
      </main>

      <footer style={{ padding: '14px 40px', maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box', color: '#9ca3af', fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>© {new Date().getFullYear()} Bocor Halus. Hak cipta dilindungi.</div>
          <div>
            <a href="#" style={{ color: '#9ca3af', textDecoration: 'none', marginRight: 12 }}>Privasi</a>
            <a href="#" style={{ color: '#9ca3af', textDecoration: 'none' }}>Syarat & Ketentuan</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Login;