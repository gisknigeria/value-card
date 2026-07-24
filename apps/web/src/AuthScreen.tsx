import { useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  MapPin,
  Phone,
  UserRound,
} from 'lucide-react';
import { loginAdmin, loginResident, registerResident, type AuthSession } from './api';

type Mode = 'login' | 'register';

interface AuthScreenProps {
  onAuthenticated: (session: AuthSession) => void;
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    neighbourhood: '',
    memberCategory: 'Resident member',
    consent: false,
  });

  const update = (field: keyof typeof form, value: string | boolean) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        try {
          const session = await loginResident(form.email || form.phone, form.password);
          onAuthenticated(session);
          return;
        } catch (residentError) {
          try {
            const adminSession = await loginAdmin(form.email || form.phone, form.password);
            localStorage.setItem('bodija-admin-token', adminSession.accessToken);
            window.location.assign('/admin');
            return;
          } catch {
            throw residentError;
          }
        }
      }

      const session = await registerResident({
            fullName: form.fullName,
            phone: form.phone,
            email: form.email || undefined,
            password: form.password,
            neighbourhood: form.neighbourhood,
            memberCategory: form.memberCategory,
            consent: form.consent,
          });
      onAuthenticated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to continue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-context">
        <div className="auth-brand">
          <div className="brand-mark"><span>B</span></div>
          <div><strong>Bodija</strong><small>Value Card</small></div>
        </div>
        <div className="auth-message">
          <span className="auth-kicker">Bodija resident membership</span>
          <h1>One verified card for everyday community benefits.</h1>
          <p>Access approved merchant offers and carry a secure resident identity that can be verified at community gates.</p>
        </div>
        <div className="auth-trust">
          <span><CheckCircle2 size={17} /> Private resident profile</span>
          <span><CheckCircle2 size={17} /> Live card verification</span>
          <span><CheckCircle2 size={17} /> BERA approved benefits</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand">
            <div className="brand-mark"><span>B</span></div>
            <div><strong>Bodija</strong><small>Value Card</small></div>
          </div>
          <div className="auth-heading">
            <span>Resident portal</span>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your resident account'}</h2>
            <p>{mode === 'login' ? 'Sign in with your email address or phone number.' : 'Create your login first, then complete your resident profile for approval.'}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>Register</button>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && (
              <>
                <label>
                  <span>Full name</span>
                  <div className="auth-input"><UserRound size={18} /><input autoComplete="name" value={form.fullName} onChange={event => update('fullName', event.target.value)} placeholder="Can be completed after login" /></div>
                </label>
                <div className="auth-field-row">
                  <label>
                    <span>Phone number</span>
                    <div className="auth-input"><Phone size={18} /><input required autoComplete="tel" value={form.phone} onChange={event => update('phone', event.target.value)} placeholder="0803 000 0000" /></div>
                  </label>
                  <label>
                    <span>Neighbourhood</span>
                    <div className="auth-input"><MapPin size={18} /><input value={form.neighbourhood} onChange={event => update('neighbourhood', event.target.value)} placeholder="Old Bodija" /></div>
                  </label>
                </div>
              </>
            )}

            <label>
              <span>{mode === 'login' ? 'Email or phone number' : 'Email address (optional)'}</span>
              <div className="auth-input"><UserRound size={18} /><input required={mode === 'login'} autoComplete="email" value={form.email} onChange={event => update('email', event.target.value)} placeholder={mode === 'login' ? 'you@example.com or 0803...' : 'you@example.com'} /></div>
            </label>

            <label>
              <span>Password</span>
              <div className="auth-input">
                <LockKeyhole size={18} />
                <input required minLength={8} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={event => update('password', event.target.value)} placeholder="At least 8 characters" />
                <button type="button" className="password-toggle" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>

            {mode === 'register' && (
              <label className="consent-row">
                <input type="checkbox" checked={form.consent} onChange={event => update('consent', event.target.checked)} required />
                <span>I consent to BERA storing my membership details for card issuance and secure verification.</span>
              </label>
            )}

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button className="auth-submit" disabled={loading}>
              <span>{loading ? 'Please wait...' : mode === 'login' ? 'Sign in to portal' : 'Submit registration'}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          {mode === 'login' && <p className="demo-login">Demo: <strong>tolulope.adeyemi@example.com</strong> / <strong>resident123</strong></p>}
        </div>
      </section>
    </main>
  );
}
