import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/useAuth';
import SupervisorFrame from '../components/SupervisorFrame';
import './ProfileSecurity.css';

const roleLabels = {
  owner: 'Owner',
  supervisor: 'Supervisor',
  staff: 'Staf',
};

const errorMessage = (requestError, fallback) => (
  Object.values(requestError.response?.data?.errors ?? {}).flat()[0]
  ?? requestError.response?.data?.message
  ?? fallback
);

const dateTimeLabel = (value) => {
  if (!value) return 'Belum tercatat';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Waktu tidak tersedia';
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ProfileSecurity = () => {
  const { user, updateUser } = useAuth();
  const isOwner = user?.role === 'owner';
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    password: '',
    password_confirmation: '',
  });
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadPage = async () => {
      setLoading(true);
      setLoadError('');
      setSessionError('');
      const [profileResult, sessionsResult] = await Promise.allSettled([
        api.get('/profile', { signal: controller.signal }),
        api.get('/profile/sessions', { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;

      if (profileResult.status === 'fulfilled') {
        const account = profileResult.value.data.data;
        setProfile(account);
        setProfileForm({ name: account.name ?? '', email: account.email ?? '' });
        updateUser(account);
      } else if (profileResult.reason.code !== 'ERR_CANCELED') {
        setLoadError(errorMessage(profileResult.reason, 'Profil gagal dimuat. Coba lagi.'));
      }

      if (sessionsResult.status === 'fulfilled') {
        setSessions(sessionsResult.value.data.data ?? []);
      } else if (sessionsResult.reason.code !== 'ERR_CANCELED') {
        setSessionError(errorMessage(sessionsResult.reason, 'Daftar sesi gagal dimuat.'));
      }
      setLoading(false);
    };

    loadPage();
    return () => controller.abort();
  }, [refreshKey, updateUser]);

  const currentSession = sessions.find((session) => session.is_current);
  const otherSessions = sessions.filter((session) => !session.is_current);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    setNotice('');
    try {
      const response = await api.patch('/profile', {
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
      });
      const updatedProfile = response.data.data;
      setProfile(updatedProfile);
      setProfileForm({ name: updatedProfile.name, email: updatedProfile.email });
      updateUser(updatedProfile);
      setNotice('Informasi profil berhasil diperbarui.');
    } catch (requestError) {
      setProfileError(errorMessage(requestError, 'Profil gagal disimpan. Coba lagi.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event) => {
    event.preventDefault();
    setChangingPassword(true);
    setPasswordError('');
    setNotice('');
    try {
      await api.patch('/profile', passwordForm);
      setPasswordForm({ current_password: '', password: '', password_confirmation: '' });
      setNotice('Kata sandi berhasil diubah.');
    } catch (requestError) {
      setPasswordError(errorMessage(requestError, 'Kata sandi gagal diubah. Coba lagi.'));
    } finally {
      setChangingPassword(false);
    }
  };

  const revokeSession = async (session) => {
    if (!window.confirm(`Cabut sesi akses #${session.id}? Perangkat tersebut harus login kembali.`)) return;
    setRevokingSessionId(session.id);
    setSessionError('');
    setNotice('');
    try {
      await api.delete(`/profile/sessions/${session.id}`);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setNotice(`Sesi akses #${session.id} berhasil dicabut.`);
    } catch (requestError) {
      setSessionError(errorMessage(requestError, 'Sesi gagal dicabut. Coba lagi.'));
    } finally {
      setRevokingSessionId(null);
    }
  };

  const revokeOtherSessions = async () => {
    if (!window.confirm(`Cabut ${otherSessions.length} sesi lain? Sesi ini tetap aktif.`)) return;
    setRevokingOthers(true);
    setSessionError('');
    setNotice('');
    try {
      const response = await api.post('/profile/sessions/revoke-others');
      setSessions((current) => current.filter((session) => session.is_current));
      setNotice(`${response.data.revoked_count} sesi lain berhasil dicabut.`);
    } catch (requestError) {
      setSessionError(errorMessage(requestError, 'Sesi lain gagal dicabut. Coba lagi.'));
    } finally {
      setRevokingOthers(false);
    }
  };

  const businessName = profile?.business?.business_name ?? user?.business?.business_name;

  return (
    <SupervisorFrame active="profile">
      <div className="profile-security-page">
        <section className="profile-security-heading">
          <div>
            <div className="profile-security-breadcrumb">
              <span>SISTEM</span><b>/</b><strong>PROFIL &amp; KEAMANAN</strong>
              <span className="profile-security-role-tag">MODE {isOwner ? 'OWNER' : (roleLabels[user?.role] ?? 'PENGGUNA').toUpperCase()}</span>
            </div>
            <h1>Profil &amp; Keamanan Akun</h1>
            <p>Kelola informasi akun, ubah kata sandi, dan tinjau sesi akses yang masih tersimpan.</p>
          </div>
          <div className="profile-security-heading-actions">
            <button
              className="profile-security-button secondary"
              type="button"
              onClick={() => document.getElementById('profile-sessions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Lihat sesi akses
            </button>
            <button className="profile-security-button primary" type="submit" form="profile-form" disabled={loading || savingProfile || !profile}>
              {savingProfile ? 'Menyimpan...' : 'Simpan profil'}
            </button>
          </div>
        </section>

        {loadError && (
          <div className="profile-security-message error" role="alert">
            <span>{loadError}</span>
            <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>Coba lagi</button>
          </div>
        )}
        {notice && <div className="profile-security-message success" role="status">{notice}</div>}
        {loading && <div className="profile-security-loading" role="status">Memuat profil dan sesi...</div>}

        <section className="profile-security-banner">
          <div className="profile-security-shield" aria-hidden="true">⌑</div>
          <div className="profile-security-banner-copy">
            <span className="profile-security-eyebrow">STATUS AKUN</span>
            <h2>{profile?.is_active ? 'Akun aktif' : profile ? 'Akun tidak aktif' : 'Memuat status akun'}</h2>
            <p>
              Proteksi yang tersedia: autentikasi kata sandi dan pencabutan sesi login.
              Verifikasi dua langkah, PIN otorisasi, dan whitelist IP belum tersedia.
            </p>
          </div>
          <div className="profile-security-banner-meta">
            <span>Aktivitas sesi ini</span>
            <strong>{currentSession ? dateTimeLabel(currentSession.last_used_at) : 'Belum teridentifikasi'}</strong>
          </div>
        </section>

        <section className="profile-security-metrics" aria-label="Ringkasan keamanan akun">
          <article>
            <span>Peran akun</span>
            <strong>{roleLabels[profile?.role] ?? '—'}</strong>
            <small>Akses sesuai peran terdaftar</small>
          </article>
          <article>
            <span>Status akun</span>
            <strong>{profile ? (profile.is_active ? 'Aktif' : 'Nonaktif') : '—'}</strong>
            <small>Dikelola sesuai kebijakan usaha</small>
          </article>
          <article>
            <span>Sesi akses tersimpan</span>
            <strong>{sessions.length}</strong>
            <small>Sesi saat ini dan sesi lain</small>
          </article>
          <article>
            <span>Verifikasi 2 langkah</span>
            <strong>Belum tersedia</strong>
            <small>Tidak ada biometrik atau passkey aktif</small>
          </article>
        </section>

        <div className="profile-security-columns">
          <div className="profile-security-column">
            <section className="profile-security-card">
              <header className="profile-security-card-heading">
                <span className="profile-security-card-icon" aria-hidden="true">♙</span>
                <div><h2>Informasi profil</h2><p>Perbarui nama dan email akun yang digunakan untuk masuk.</p></div>
              </header>
              {profileError && <p className="profile-security-inline-error" role="alert">{profileError}</p>}
              <form id="profile-form" className="profile-security-form" onSubmit={saveProfile}>
                <label>
                  Nama lengkap
                  <input
                    value={profileForm.name}
                    onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
                    autoComplete="name"
                    maxLength="255"
                    required
                    disabled={loading || savingProfile}
                  />
                </label>
                <label>
                  Email akun
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                    autoComplete="email"
                    maxLength="255"
                    required
                    disabled={loading || savingProfile}
                  />
                  <small>Email dipakai untuk login. Perubahan email tidak mengirim OTP verifikasi dari aplikasi.</small>
                </label>
                <button className="profile-security-button primary" type="submit" disabled={loading || savingProfile || !profile}>
                  {savingProfile ? 'Menyimpan...' : 'Simpan profil'}
                </button>
              </form>
            </section>

            <section className="profile-security-card" id="profile-sessions">
              <header className="profile-security-card-heading">
                <span className="profile-security-card-icon" aria-hidden="true">⌂</span>
                <div><h2>Identitas usaha</h2><p>Nama usaha berasal dari data usaha yang terhubung ke akun.</p></div>
              </header>
              <div className="profile-security-business-name">
                <span>Nama usaha</span>
                <strong>{businessName || 'Belum ada usaha terhubung'}</strong>
              </div>
              <p className="profile-security-hint">NPWP, NIB, alamat legal, dan dokumen badan usaha belum dikelola pada halaman ini.</p>
              {isOwner && <Link className="profile-security-related-link" to="/settings">Kelola nama usaha <span>→</span></Link>}
            </section>
          </div>

          <div className="profile-security-column">
            <section className="profile-security-card">
              <header className="profile-security-card-heading">
                <span className="profile-security-card-icon" aria-hidden="true">⌑</span>
                <div><h2>Ubah kata sandi</h2><p>Konfirmasi kata sandi saat ini untuk menyimpan perubahan.</p></div>
              </header>
              {passwordError && <p className="profile-security-inline-error" role="alert">{passwordError}</p>}
              <form className="profile-security-form" onSubmit={changePassword}>
                <label>
                  Kata sandi saat ini
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={passwordForm.current_password}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, current_password: event.target.value }))}
                    required
                    disabled={changingPassword}
                  />
                </label>
                <div className="profile-security-form-grid">
                  <label>
                    Kata sandi baru
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength="8"
                      value={passwordForm.password}
                      onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                      required
                      disabled={changingPassword}
                    />
                  </label>
                  <label>
                    Konfirmasi kata sandi baru
                    <input
                      type="password"
                      autoComplete="new-password"
                      minLength="8"
                      value={passwordForm.password_confirmation}
                      onChange={(event) => setPasswordForm((current) => ({ ...current, password_confirmation: event.target.value }))}
                      required
                      disabled={changingPassword}
                    />
                  </label>
                </div>
                <p className="profile-security-hint">Kata sandi baru minimal 8 karakter dan harus sama dengan konfirmasi.</p>
                <button className="profile-security-button secondary" type="submit" disabled={changingPassword}>
                  {changingPassword ? 'Memperbarui...' : 'Perbarui kata sandi'}
                </button>
              </form>
            </section>

            <section className="profile-security-card">
              <header className="profile-security-session-heading">
                <div className="profile-security-card-heading">
                  <span className="profile-security-card-icon" aria-hidden="true">▣</span>
                  <div><h2>Sesi akses</h2><p>Perangkat dan alamat IP tidak dicatat oleh sistem.</p></div>
                </div>
                <button
                  className="profile-security-button danger-outline"
                  type="button"
                  onClick={revokeOtherSessions}
                  disabled={!currentSession || !otherSessions.length || revokingOthers}
                  title={!currentSession ? 'Sesi ini tidak dapat diidentifikasi sebagai token akses' : undefined}
                >
                  {revokingOthers ? 'Mencabut...' : 'Cabut sesi lain'}
                </button>
              </header>
              {sessionError && (
                <p className="profile-security-inline-error" role="alert">
                  {sessionError}
                  <button type="button" onClick={() => setRefreshKey((current) => current + 1)}>Muat ulang</button>
                </p>
              )}
              {sessions.length === 0 && !sessionError ? (
                <p className="profile-security-empty">Tidak ada sesi token yang tercatat.</p>
              ) : (
                <div className="profile-security-session-list">
                  {sessions.map((session) => (
                    <article className="profile-security-session" key={session.id}>
                      <span className="profile-security-session-icon" aria-hidden="true">▣</span>
                      <div>
                        <div className="profile-security-session-title">
                          <strong>{session.is_current ? 'Sesi ini' : `Sesi akses #${session.id}`}</strong>
                          {session.is_current && <span>Saat ini</span>}
                        </div>
                        <small>Dibuat {dateTimeLabel(session.created_at)} · Terakhir digunakan {dateTimeLabel(session.last_used_at)}</small>
                      </div>
                      {!session.is_current && (
                        <button
                          className="profile-security-revoke"
                          type="button"
                          onClick={() => revokeSession(session)}
                          disabled={revokingSessionId === session.id || revokingOthers}
                        >
                          {revokingSessionId === session.id ? 'Mencabut...' : 'Cabut'}
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
              {!currentSession && !sessionError && (
                <p className="profile-security-hint">Sesi saat ini tidak teridentifikasi sebagai token akses, jadi aksi pencabutan sesi lain dinonaktifkan.</p>
              )}
            </section>
          </div>
        </div>

        <section className="profile-security-boundary">
          <span aria-hidden="true">i</span>
          <div>
            <strong>Keamanan tambahan belum tersedia</strong>
            <p>Autentikasi dua langkah/biometrik, PIN master, whitelist IP, riwayat perangkat terperinci, serta pembekuan darurat tidak tersedia di aplikasi. Halaman ini tidak mengklaim fitur tersebut aktif.</p>
          </div>
        </section>
      </div>
    </SupervisorFrame>
  );
};

export default ProfileSecurity;
