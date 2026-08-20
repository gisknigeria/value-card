import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  MapPin,
  Phone,
  Store,
  UserRound,
  Users,
  TicketCheck,
} from 'lucide-react';
import { getRegistrationSticker, loginPortal, registerMerchant, registerResident, type AuthSession, type MerchantSession, type RegistrationSticker } from './api';

type Mode = 'login' | 'register';
type Role = 'resident' | 'merchant';

interface AuthScreenProps {
  onAuthenticated: (session: AuthSession) => void;
  onMerchantAuthenticated?: (session: MerchantSession) => void;
  defaultRole?: Role;
}

export default function AuthScreen({ onAuthenticated, onMerchantAuthenticated, defaultRole = 'resident' }: AuthScreenProps) {
  const stickerFromQr = new URLSearchParams(window.location.search).get('sticker') || '';
  const [mode, setMode] = useState<Mode>(stickerFromQr ? 'register' : 'login');
  const [role, setRole] = useState<Role>(stickerFromQr ? 'resident' : defaultRole);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    stickerCode: stickerFromQr.toUpperCase(),
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
    businessName: '',
    category: '',
    contactPerson: '',
    location: '',
    associationName: '',
  });
  const [familyMembers, setFamilyMembers] = useState([
    { fullName: '', relationship: '', phone: '', dateOfBirth: '', isMinor: false },
  ]);
  const [stickerInfo, setStickerInfo] = useState<RegistrationSticker | null>(null);
  const [stickerError, setStickerError] = useState('');
  const [stickerChecking, setStickerChecking] = useState(false);
  useEffect(() => {
    if (mode !== 'register' || form.stickerCode.trim().length < 8) {
      setStickerInfo(null);
      setStickerError('');
      return;
    }
    const timer = window.setTimeout(() => {
      setStickerChecking(true);
      getRegistrationSticker(form.stickerCode)
        .then(info => { setStickerInfo(info); setStickerError(''); })
        .catch(err => { setStickerInfo(null); setStickerError(err instanceof Error ? err.message : 'Sticker code not found'); })
        .finally(() => setStickerChecking(false));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [form.stickerCode, mode]);

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
        const session = await loginPortal(form.email || form.phone, form.password);
        if (session.accountRole === 'MERCHANT') {
          if (!onMerchantAuthenticated) throw new Error('Merchant access is unavailable');
          onMerchantAuthenticated(session);
          return;
        }
        onAuthenticated(session);
        return;
      }

      if (role === 'merchant') {
        if (!onMerchantAuthenticated) throw new Error('Merchant access is unavailable');
        onMerchantAuthenticated(await registerMerchant({
          businessName: form.businessName,
          category: form.category,
          contactPerson: form.contactPerson,
          phone: form.phone,
          email: form.email || undefined,
          location: form.location,
          streetName: form.streetName,
          associationName: form.associationName,
          password: form.password,
          consent: form.consent,
        }));
        return;
      }

      const session = await registerResident({
            stickerCode: form.stickerCode,
            fullName: form.fullName,
            phone: form.phone,
            email: form.email || undefined,
            password: form.password,
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
          <span className="auth-kicker">Bodija community membership</span>
          <h1>One verified card for everyday community benefits.</h1>
          <p>Residents and merchants use one secure account entry point for community identity and benefits.</p>
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
            <h2>{mode === 'login' ? 'Welcome back' : role === 'resident' ? 'Create your resident account' : 'Register your business'}</h2>
            <p>{mode === 'login' ? 'Sign in with your email address or phone number. We will take you to the correct portal.' : role === 'resident' ? 'Use the code on the community sticker issued for your street.' : 'Your application will be reviewed by BERA before going live.'}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => changeMode('register')}>Register</button>
          </div>

          {mode === 'register' && (
            <label className="auth-account-type">
              <span>Register as</span>
              <div className="auth-input">
                <UserRound size={18} />
                <select value={role} onChange={event => { setRole(event.target.value as Role); setError(''); }}>
                  <option value="resident">Resident</option>
                  <option value="merchant">Merchant</option>
                </select>
              </div>
            </label>
          )}

          <form className="auth-form" onSubmit={submit}>
            {mode === 'register' && role === 'resident' && (
              <>
                <label>
                  <span>Community sticker code</span>
                  <div className="auth-input"><TicketCheck size={18} /><input required autoComplete="off" value={form.stickerCode} onChange={event => update('stickerCode', event.target.value.toUpperCase())} placeholder="BVC-ABC-1234-0001" /></div>
                </label>
                {stickerChecking && <small>Checking sticker code…</small>}
                {stickerInfo && <div className="sticker-code-confirmed"><CheckCircle2 size={18} /><div><strong>Sticker confirmed · {stickerInfo.streetCode}</strong><span>{stickerInfo.streetName}{stickerInfo.associationName ? ` — ${stickerInfo.associationName}` : ''}</span></div></div>}
                {stickerError && <div className="auth-error" role="alert">{stickerError}</div>}
                <label>
                  <span>Full name</span>
                  <div className="auth-input"><UserRound size={18} /><input autoComplete="name" value={form.fullName} onChange={event => update('fullName', event.target.value)} placeholder="Can be completed after login" /></div>
                </label>
                <div className="auth-field-row">
                  <label>
                    <span>Phone number</span>
                    <div className="auth-input"><Phone size={18} /><input required autoComplete="tel" value={form.phone} onChange={event => update('phone', event.target.value)} placeholder="0803 000 0000" /></div>
                  </label>
                </div>
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

            {mode === 'register' && role === 'merchant' && (
              <>
                <label><span>Business name</span><div className="auth-input"><Store size={18} /><input required value={form.businessName} onChange={event => update('businessName', event.target.value)} placeholder="e.g. Cedar Pharmacy" /></div></label>
                <div className="auth-field-row">
                  <label><span>Category</span><div className="auth-input"><Store size={18} /><input required value={form.category} onChange={event => update('category', event.target.value)} placeholder="e.g. Pharmacy" /></div></label>
                  <label><span>Contact person</span><div className="auth-input"><UserRound size={18} /><input required value={form.contactPerson} onChange={event => update('contactPerson', event.target.value)} placeholder="Full name" /></div></label>
                </div>
                <label><span>Location / service area</span><div className="auth-input"><MapPin size={18} /><input required value={form.location} onChange={event => update('location', event.target.value)} placeholder="e.g. Awolowo Avenue, Bodija" /></div></label>
                <div className="auth-field-row">
                  <label><span>Business street</span><div className="auth-input"><MapPin size={18} /><input required value={form.streetName} onChange={event => update('streetName', event.target.value)} placeholder="Street name" /></div></label>
                  <label><span>Association</span><div className="auth-input"><MapPin size={18} /><input required value={form.associationName} onChange={event => update('associationName', event.target.value)} placeholder="Association name" /></div></label>
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

            <button className="auth-submit" disabled={loading} aria-label={loading ? 'Loading' : undefined}>
              {loading ? <span className="loading-spinner light" role="status" aria-label="Loading" /> : <><span>{mode === 'login' ? 'Sign in to portal' : 'Submit registration'}</span><ArrowRight size={18} /></>}
            </button>
          </form>

          {mode === 'login' && <p className="demo-login">Your account type is detected automatically after sign in.</p>}
        </div>
      </section>
    </main>
  );
}
