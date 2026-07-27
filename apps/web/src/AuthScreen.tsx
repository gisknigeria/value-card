import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  MapPin,
  Phone,
  UserRound,
  Users,
} from 'lucide-react';
import { getResidentDirectory, loginAdmin, loginResident, registerResident, type AuthSession, type ResidentDirectory } from './api';

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
    streetName: '',
    streetSelection: '',
    memberCategory: 'Resident member',
    registrationType: 'INDIVIDUAL' as 'INDIVIDUAL' | 'FAMILY',
    householdRole: 'TENANT' as 'TENANT' | 'LANDLORD' | 'AGENT',
    consent: false,
  });
  const [familyMembers, setFamilyMembers] = useState([
    { fullName: '', relationship: '', phone: '', dateOfBirth: '', isMinor: false },
  ]);
  const [directory, setDirectory] = useState<ResidentDirectory | null>(null);
  useEffect(() => {
    getResidentDirectory().then(setDirectory).catch(() => {});
  }, []);
  const streetOptions = useMemo(
    () => [
      ...(directory?.associations.flatMap(a => a.streets.map(s => ({ street: s.name, association: a.name }))) || []),
      ...(directory?.unassignedStreets.map(s => ({ street: s.name, association: '' })) || []),
    ].sort((a, b) => a.street.localeCompare(b.street)),
    [directory],
  );

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
            streetName: form.streetName,
            memberCategory: form.memberCategory,
            registrationType: form.registrationType,
            householdRole: form.householdRole,
            familyMembers: form.registrationType === 'FAMILY'
              ? familyMembers.filter(member => member.fullName.trim()).map(member => ({
                  ...member,
                  phone: member.phone || undefined,
                  dateOfBirth: member.dateOfBirth || undefined,
                }))
              : undefined,
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
                    <span>Street</span>
                    <div className="auth-input"><MapPin size={18} /><select required value={form.streetSelection} onChange={event => {
                      const selected = streetOptions[Number(event.target.value)];
                      setForm(current => ({ ...current, streetSelection: event.target.value, streetName: selected?.street || '', neighbourhood: selected?.association || '' }));
                    }}>
                      <option value="">Select your street</option>
                      {streetOptions.map((item, index) => <option key={`${item.street}-${item.association}-${index}`} value={index}>{item.street}{item.association ? ` — ${item.association}` : ''}</option>)}
                    </select></div>
                  </label>
                </div>
                {form.neighbourhood && <small>Your confirming association: <strong>{form.neighbourhood}</strong></small>}
                <div className="auth-field-row">
                  <label>
                    <span>Registration type</span>
                    <div className="auth-input"><Users size={18} /><select value={form.registrationType} onChange={e => update('registrationType', e.target.value)}>
                      <option value="INDIVIDUAL">Register myself only</option>
                      <option value="FAMILY">Register my family</option>
                    </select></div>
                  </label>
                  <label>
                    <span>Your household role</span>
                    <div className="auth-input"><UserRound size={18} /><select value={form.householdRole} onChange={e => update('householdRole', e.target.value)}>
                      <option value="TENANT">Tenant</option>
                      <option value="LANDLORD">Landlord</option>
                      <option value="AGENT">Agent</option>
                    </select></div>
                  </label>
                </div>
                {form.registrationType === 'FAMILY' && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <strong>Family members</strong>
                    {familyMembers.map((member, index) => (
                      <div key={index} style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 8 }}>
                        <div className="auth-field-row">
                          <label><span>Full name</span><div className="auth-input"><input required value={member.fullName} onChange={e => setFamilyMembers(items => items.map((item, i) => i === index ? { ...item, fullName: e.target.value } : item))} /></div></label>
                          <label><span>Relationship</span><div className="auth-input"><input required value={member.relationship} onChange={e => setFamilyMembers(items => items.map((item, i) => i === index ? { ...item, relationship: e.target.value } : item))} placeholder="Child, spouse..." /></div></label>
                        </div>
                        <div className="auth-field-row">
                          <label><span>Date of birth</span><div className="auth-input"><input type="date" value={member.dateOfBirth} onChange={e => setFamilyMembers(items => items.map((item, i) => i === index ? { ...item, dateOfBirth: e.target.value } : item))} /></div></label>
                          <label><span>Phone (optional for minors)</span><div className="auth-input"><input value={member.phone} onChange={e => setFamilyMembers(items => items.map((item, i) => i === index ? { ...item, phone: e.target.value } : item))} /></div></label>
                        </div>
                        <label><input type="checkbox" checked={member.isMinor} onChange={e => setFamilyMembers(items => items.map((item, i) => i === index ? { ...item, isMinor: e.target.checked } : item))} /> This family member is a minor</label>
                        {familyMembers.length > 1 && <button type="button" className="text-button" onClick={() => setFamilyMembers(items => items.filter((_, i) => i !== index))}>Remove</button>}
                      </div>
                    ))}
                    <button type="button" className="secondary-button" onClick={() => setFamilyMembers(items => [...items, { fullName: '', relationship: '', phone: '', dateOfBirth: '', isMinor: false }])}>Add another family member</button>
                  </div>
                )}
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
