import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  BarChart2,
  Bell,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  LogOut,
  MapPin,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Tag,
  Trash2,
  UserRound,
  Users,
  XCircle,
  ZapOff,
} from 'lucide-react';
import {
  registerMerchant,
  loginMerchant,
  getMerchantMe,
  changeMerchantPassword,
  listMerchantStaff,
  inviteMerchantStaff,
  deactivateMerchantStaff,
  listMerchantOffers,
  createMerchantOffer,
  updateMerchantOffer,
  pauseMerchantOffer,
  resumeMerchantOffer,
  archiveMerchantOffer,
  getMerchantOffer,
  merchantScan,
  logTransaction,
  listMerchantTransactions,
  reverseTransaction,
  redeemReward,
  getMerchantReport,
  getMerchantWalkIns,
  acknowledgeWalkIn,
  type MerchantSession,
  type MerchantUserProfile,
  type MerchantOffer,
  type MerchantOfferDetail,
  type BenefitType,
  type RedemptionModel,
  type ScanResult,
  type MerchantTransaction,
  type MerchantReport,
  type WalkInLog,
} from './api';

const MERCHANT_TOKEN_KEY = 'bodija-merchant-token';

// ── Brand ─────────────────────────────────────────────────────────────
function MerchantBrand() {
  return (
    <div className="admin-brand">
      <div className="brand-mark"><span>B</span></div>
      <div><strong>Merchant Portal</strong><small>Bodija Value Card</small></div>
    </div>
  );
}

// ── Approval status banner ────────────────────────────────────────────
function ApprovalBanner({ mu }: { mu: MerchantUserProfile }) {
  const status = mu.merchant.approvalStatus;
  const reason = mu.merchant.statusReason;

  if (status === 'APPROVED') return null;

  const cfg = {
    PENDING:   { cls: 'timeline-pending',   Icon: Clock3,         label: 'Application under BERA review' },
    REJECTED:  { cls: 'timeline-rejected',  Icon: XCircle,        label: 'Application not approved' },
    SUSPENDED: { cls: 'timeline-suspended', Icon: AlertTriangle,  label: 'Account suspended by BERA' },
  }[status] ?? { cls: 'timeline-pending', Icon: Clock3, label: 'Under review' };

  const { cls, Icon, label } = cfg;
  return (
    <div className={`approval-timeline ${cls}`} style={{ margin: '0 0 20px' }}>
      <span className="timeline-icon"><Icon size={18} /></span>
      <div className="timeline-body">
        <strong>{label}</strong>
        {reason && <p>{reason}</p>}
        {status === 'PENDING' && !reason && (
          <p>Your merchant registration is awaiting BERA approval. You will be notified once reviewed.</p>
        )}
      </div>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────
function MerchantRegister({ onSwitch, onAuth }: {
  onSwitch: () => void;
  onAuth: (s: MerchantSession) => void;
}) {
  const [form, setForm] = useState({
    businessName: '', category: '', contactPerson: '', phone: '',
    email: '', location: '', password: '', consent: false,
  });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const session = await registerMerchant({
        businessName: form.businessName,
        category: form.category,
        contactPerson: form.contactPerson,
        phone: form.phone,
        email: form.email || undefined,
        location: form.location,
        password: form.password,
        consent: form.consent,
      });
      onAuth(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register');
    } finally { setLoading(false); }
  };

  return (
    <main className="auth-page">
      <section className="auth-context">
        <div className="auth-brand">
          <div className="brand-mark"><span>B</span></div>
          <div><strong>Bodija</strong><small>Value Card</small></div>
        </div>
        <div className="auth-message">
          <span className="auth-kicker">Bodija merchant membership</span>
          <h1>Reach verified residents with approved offers.</h1>
          <p>Register your business to offer discounts and rewards to Bodija resident cardholders.</p>
        </div>
        <div className="auth-trust">
          <span><CheckCircle2 size={17} /> BERA-approved merchants only</span>
          <span><CheckCircle2 size={17} /> Verified resident base</span>
          <span><CheckCircle2 size={17} /> Secure benefit logging</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form-wrap">
          <div className="auth-mobile-brand">
            <div className="brand-mark"><span>B</span></div>
            <div><strong>Bodija</strong><small>Value Card</small></div>
          </div>
          <div className="auth-heading">
            <span>Merchant portal</span>
            <h2>Register your business</h2>
            <p>Your application will be reviewed by BERA before going live.</p>
          </div>
          <form className="auth-form" onSubmit={submit}>
            <label><span>Business name</span>
              <div className="auth-input"><Store size={18} /><input required value={form.businessName} onChange={e => set('businessName', e.target.value)} placeholder="e.g. Cedar Pharmacy" /></div>
            </label>
            <div className="auth-field-row">
              <label><span>Category</span>
                <div className="auth-input"><Store size={18} /><input required value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Pharmacy" /></div>
              </label>
              <label><span>Contact person</span>
                <div className="auth-input"><UserRound size={18} /><input required value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} placeholder="Full name" /></div>
              </label>
            </div>
            <div className="auth-field-row">
              <label><span>Phone number</span>
                <div className="auth-input"><Phone size={18} /><input required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0803 000 0000" /></div>
              </label>
              <label><span>Email (optional)</span>
                <div className="auth-input"><UserRound size={18} /><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@business.com" /></div>
              </label>
            </div>
            <label><span>Location / service area</span>
              <div className="auth-input"><MapPin size={18} /><input required value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Awolowo Avenue, Bodija" /></div>
            </label>
            <label><span>Password</span>
              <div className="auth-input">
                <LockKeyhole size={18} />
                <input required minLength={8} type={showPw ? 'text' : 'password'} value={form.password} onChange={e => set('password', e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
                <button type="button" className="password-toggle" onClick={() => setShowPw(p => !p)} aria-label={showPw ? 'Hide' : 'Show'}>
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <label className="consent-row">
              <input type="checkbox" required checked={form.consent} onChange={e => set('consent', e.target.checked)} />
              <span>I consent to BERA storing my business details for verification and benefit logging.</span>
            </label>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button className="auth-submit" disabled={loading}>
              <span>{loading ? 'Submitting…' : 'Submit registration'}</span>
            </button>
          </form>
          <p className="demo-login">Already registered? <button type="button" className="text-button" onClick={onSwitch}>Sign in</button></p>
        </div>
      </section>
    </main>
  );
}

// ── Login ─────────────────────────────────────────────────────────────
function MerchantLogin({ onSwitch, onAuth }: {
  onSwitch: () => void;
  onAuth: (s: MerchantSession) => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const session = await loginMerchant(identifier, password);
      onAuth(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally { setLoading(false); }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-context">
        <MerchantBrand />
        <div>
          <span>Merchant portal</span>
          <h1>Manage your resident offers and verify cardholders.</h1>
          <p>Sign in to access your merchant dashboard, log benefits, and manage staff.</p>
        </div>
        <small>Approved Bodija merchants only</small>
      </section>
      <section className="admin-login-form">
        <form onSubmit={submit}>
          <div className="admin-login-icon"><Store size={25} /></div>
          <span>Merchant sign in</span>
          <h2>Welcome back</h2>
          <p>Use your registered phone number or email address.</p>
          <label><span>Phone or email</span>
            <input required autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="0803 000 0000 or you@business.com" />
          </label>
          <label><span>Password</span>
            <div style={{ position: 'relative' }}>
              <input required minLength={8} type={showPw ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" style={{ width: '100%', paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPw(p => !p)} aria-label={showPw ? 'Hide' : 'Show'} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', cursor: 'pointer', color: '#697a84' }}>
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button disabled={loading}>{loading ? 'Signing in…' : 'Sign in to portal'}</button>
          <p style={{ marginTop: 16, fontSize: 11, textAlign: 'center', color: '#76858e' }}>
            New merchant? <button type="button" className="text-button" onClick={onSwitch}>Register your business</button>
          </p>
          <a href="/">Return to resident portal</a>
        </form>
      </section>
    </main>
  );
}

// ── Change password panel ─────────────────────────────────────────────
function ChangePasswordPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.next !== form.confirm) { setError('New passwords do not match'); return; }
    setLoading(true); setError(''); setSuccess('');
    try {
      await changeMerchantPassword(token, form.current, form.next);
      setSuccess('Password changed successfully.');
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change password');
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="chpw-title">
      <div className="modal-card">
        <div className="modal-icon" style={{ background: '#e2eaf4', color: '#355e8c' }}><KeyRound size={22} /></div>
        <h3 id="chpw-title">Change password</h3>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {error && <div className="auth-error" role="alert">{error}</div>}
          {success && <div className="profile-success" role="status">{success}</div>}
          {(['current', 'next', 'confirm'] as const).map(field => (
            <label key={field}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>
                {field === 'current' ? 'Current password' : field === 'next' ? 'New password' : 'Confirm new password'}
              </span>
              <div className="auth-input">
                <LockKeyhole size={16} />
                <input required minLength={field === 'current' ? 1 : 8} type={showPw ? 'text' : 'password'}
                  value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
              </div>
            </label>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#5e707b' }}>
            <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} />
            Show passwords
          </label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Staff management panel ────────────────────────────────────────────
function StaffPanel({ token, isOwner }: { token: string; isOwner: boolean }) {
  const [staff, setStaff] = useState<MerchantUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ fullName: '', phone: '', password: '', role: 'STAFF' as 'OWNER' | 'STAFF' });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [removingId, setRemovingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { staff: items } = await listMerchantStaff(token);
      setStaff(items);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load staff'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setInviting(true); setInviteError('');
    try {
      await inviteMerchantStaff(token, inviteForm);
      setShowInvite(false);
      setInviteForm({ fullName: '', phone: '', password: '', role: 'STAFF' });
      await load();
    } catch (e) { setInviteError(e instanceof Error ? e.message : 'Unable to add staff'); }
    finally { setInviting(false); }
  };

  const remove = async (userId: string, name: string) => {
    if (!window.confirm(`Deactivate ${name}?`)) return;
    setRemovingId(userId); setError('');
    try {
      await deactivateMerchantStaff(token, userId);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to deactivate staff'); }
    finally { setRemovingId(''); }
  };

  return (
    <section className="profile-form" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Staff accounts</h3>
        {isOwner && (
          <button className="primary-button" onClick={() => setShowInvite(true)} style={{ minHeight: 34, fontSize: 12 }}>
            <Plus size={15} /> Add staff
          </button>
        )}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 14px' }}>
        Staff can log transactions and verify residents. Only owners can manage staff accounts.
      </p>

      {showInvite && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-icon" style={{ background: '#e4f0e9', color: '#356b4d' }}><Users size={22} /></div>
            <h3>Add staff member</h3>
            <form onSubmit={invite} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {inviteError && <div className="auth-error" role="alert">{inviteError}</div>}
              <label>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Full name</span>
                <div className="auth-input"><UserRound size={16} /><input required value={inviteForm.fullName} onChange={e => setInviteForm(f => ({ ...f, fullName: e.target.value }))} /></div>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Phone number</span>
                <div className="auth-input"><Phone size={16} /><input required value={inviteForm.phone} onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="0803 000 0000" /></div>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Temporary password</span>
                <div className="auth-input"><LockKeyhole size={16} /><input required minLength={8} type="text" value={inviteForm.password} onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))} /></div>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Role</span>
                <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as 'OWNER' | 'STAFF' }))} style={{ width: '100%', height: 45, padding: '0 12px', border: '1px solid #cad4da', borderRadius: 6, font: 'inherit', fontSize: 14 }}>
                  <option value="STAFF">Sales staff</option>
                  <option value="OWNER">Co-owner</option>
                </select>
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setShowInvite(false)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={inviting}>{inviting ? 'Adding…' : 'Add staff'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {error && <div className="auth-error" role="alert">{error}</div>}
      {loading && <div style={{ color: 'var(--muted)', fontSize: 12 }}>Loading staff…</div>}
      {!loading && staff.map(s => {
        const name = s.user.displayName || s.user.phone;
        const initials = s.user.displayName
          ? s.user.displayName.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
          : s.user.phone.slice(-2);
        const roleLabel = s.role === 'OWNER' ? 'Owner' : 'Sales staff';
        return (
          <div key={s.id} className="dependant-card" style={{ marginBottom: 8 }}>
            <div className="dependant-avatar" style={{ fontSize: 12 }}>
              {initials}
            </div>
            <div className="dependant-info">
              <strong>{name}</strong>
              <span style={{ fontSize: 11 }}>{roleLabel} · {s.user.phone}{s.user.email ? ` · ${s.user.email}` : ''}</span>
              <div className={`dependant-status-badge ${s.isActive ? 'timeline-approved' : 'timeline-rejected'}`}>
                {s.isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                <span>{s.isActive ? 'Active' : 'Deactivated'}</span>
              </div>
            </div>
            {isOwner && s.isActive && (
              <div className="dependant-actions">
                <button className="icon-button" title="Deactivate" disabled={removingId === s.user.id} onClick={() => remove(s.user.id, name)}>
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {!loading && staff.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>No staff accounts yet. Add staff to let them log transactions.</p>
      )}
    </section>
  );
}

// ── Scan panel ────────────────────────────────────────────────────────

function ScanPanel({ token, offers }: { token: string; offers: MerchantOffer[] }) {
  const [cardToken, setCardToken] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState('');

  // Transaction logging state
  const [offerId, setOfferId] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [logging, setLogging] = useState(false);
  const [logResult, setLogResult] = useState<{ benefitValue: string; redemptionModel: string } | null>(null);
  const [logError, setLogError] = useState('');

  // Reward redemption state
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState('');

  const activeOffers = offers.filter(o => o.status === 'ACTIVE');

  const scan = async (e: FormEvent) => {
    e.preventDefault();
    setScanResult(null); setScanError(''); setLogResult(null); setLogError('');
    setScanning(true);
    try {
      const result = await merchantScan(token, cardToken.trim(), `scan-${cardToken}-${Date.now()}`);
      setScanResult(result);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to verify card');
    } finally { setScanning(false); }
  };

  const logTxn = async (e: FormEvent) => {
    e.preventDefault();
    if (!scanResult?.resident || !offerId) { setLogError('Select an offer first'); return; }
    setLogging(true); setLogError('');
    try {
      const { benefitValue, transaction } = await logTransaction(token, {
        cardToken: cardToken.trim(),
        offerId,
        purchaseAmount: purchaseAmount.trim() || undefined,
        idempotencyKey: `txn-${cardToken}-${offerId}-${Date.now()}`,
      });
      setLogResult({ benefitValue, redemptionModel: transaction.redemptionModel });
      setPurchaseAmount(''); setOfferId('');
    } catch (err) {
      setLogError(err instanceof Error ? err.message : 'Unable to log transaction');
    } finally { setLogging(false); }
  };

  const doRedeem = async (e: FormEvent) => {
    e.preventDefault();
    setRedeeming(true); setRedeemError('');
    try {
      const { redeemed, newBalance } = await redeemReward(token, cardToken.trim(), redeemAmount.trim());
      setRedeemResult(`NGN ${redeemed} redeemed. New balance: NGN ${newBalance}`);
      setRedeemAmount('');
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : 'Unable to redeem reward');
    } finally { setRedeeming(false); }
  };

  const reset = () => {
    setCardToken(''); setScanResult(null); setScanError('');
    setLogResult(null); setLogError(''); setRedeemResult(null); setRedeemError('');
  };

  return (
    <section style={{ marginTop: 24 }}>
      <div className="admin-workspace" style={{ overflow: 'hidden' }}>
        <div className="admin-toolbar">
          <strong style={{ fontSize: 14 }}>Verify resident card</strong>
          {scanResult && <button className="secondary-button" style={{ fontSize: 12, minHeight: 32 }} onClick={reset}><RefreshCw size={14} /> New scan</button>}
        </div>
        <div style={{ padding: '20px' }}>
          {!scanResult && (
            <form onSubmit={scan} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <label style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 6 }}>Membership ID or QR token</span>
                <div className="auth-input"><Search size={16} /><input required value={cardToken} onChange={e => setCardToken(e.target.value)} placeholder="BVC-26-123456 or paste QR token" autoComplete="off" /></div>
              </label>
              <button type="submit" className="primary-button" disabled={scanning} style={{ minHeight: 45, whiteSpace: 'nowrap' }}>
                <ShieldCheck size={16} /> {scanning ? 'Checking…' : 'Verify card'}
              </button>
            </form>
          )}
          {scanError && <div className="auth-error" role="alert" style={{ marginTop: 12 }}>{scanError}</div>}

          {scanResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Verification result */}
              <div className={`approval-timeline ${scanResult.allowed ? 'timeline-approved' : 'timeline-rejected'}`}>
                <span className="timeline-icon">{scanResult.allowed ? <CheckCircle2 size={18} /> : <ZapOff size={18} />}</span>
                <div className="timeline-body">
                  <strong>{scanResult.allowed ? 'Card verified — resident eligible' : `Access denied — ${scanResult.status.toLowerCase().replace(/_/g,' ')}`}</strong>
                  <p>{scanResult.resident.fullName} · {scanResult.resident.memberCategory} · {scanResult.resident.neighbourhood}</p>
                  <small>Membership: {scanResult.resident.membershipId}{scanResult.expiresAt ? ` · Expires ${new Date(scanResult.expiresAt).toLocaleDateString('en-GB')}` : ''}</small>
                </div>
              </div>

              {scanResult.allowed && (
                <>
                  {/* Log a transaction */}
                  <div>
                    <h4 style={{ fontSize: 13, margin: '0 0 10px' }}>Log benefit transaction</h4>
                    <form onSubmit={logTxn} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {logError && <div className="auth-error" role="alert">{logError}</div>}
                      {logResult && (
                        <div className="profile-success" role="status">
                          Transaction logged. Benefit: NGN {logResult.benefitValue} ({logResult.redemptionModel.toLowerCase()})
                        </div>
                      )}
                      <div className="auth-field-row">
                        <label>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Select offer *</span>
                          <select required value={offerId} onChange={e => setOfferId(e.target.value)}
                            style={{ width: '100%', height: 42, padding: '0 10px', border: '1px solid #cad4da', borderRadius: 6, font: 'inherit', fontSize: 12 }}>
                            <option value="">— choose offer —</option>
                            {activeOffers.map(o => <option key={o.id} value={o.id}>{o.title} ({o.displayValue})</option>)}
                          </select>
                        </label>
                        <label>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Purchase amount (NGN, optional)</span>
                          <div className="auth-input"><input type="number" min="0" step="0.01" value={purchaseAmount} onChange={e => setPurchaseAmount(e.target.value)} placeholder="e.g. 24600" /></div>
                        </label>
                      </div>
                      <button type="submit" className="primary-button" disabled={logging || !offerId} style={{ alignSelf: 'flex-start', fontSize: 12 }}>
                        {logging ? 'Logging…' : 'Log transaction'}
                      </button>
                    </form>
                  </div>

                  {/* Redeem reward */}
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                    <h4 style={{ fontSize: 13, margin: '0 0 10px' }}>Redeem accumulated reward</h4>
                    <form onSubmit={doRedeem} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                      {redeemError && <div className="auth-error" role="alert" style={{ flex: '1 1 100%' }}>{redeemError}</div>}
                      {redeemResult && <div className="profile-success" role="status" style={{ flex: '1 1 100%' }}>{redeemResult}</div>}
                      <label style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Amount to redeem (NGN) *</span>
                        <div className="auth-input"><input required type="number" min="1" step="0.01" value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)} placeholder="e.g. 2000" /></div>
                      </label>
                      <button type="submit" className="secondary-button" disabled={redeeming || !redeemAmount} style={{ minHeight: 42, whiteSpace: 'nowrap', fontSize: 12 }}>
                        {redeeming ? 'Processing…' : 'Redeem balance'}
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Transactions panel ────────────────────────────────────────────────

function TransactionsPanel({ token }: { token: string }) {
  const [transactions, setTransactions] = useState<MerchantTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reversingId, setReversingId] = useState('');
  const [reverseReason, setReverseReason] = useState('');
  const [showReverseModal, setShowReverseModal] = useState<MerchantTransaction | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { transactions: items } = await listMerchantTransactions(token, { from: from || undefined, to: to || undefined });
      setTransactions(items);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load transactions'); }
    finally { setLoading(false); }
  }, [token, from, to]);

  useEffect(() => { void load(); }, [load]);

  const doReverse = async () => {
    if (!showReverseModal || !reverseReason.trim()) return;
    setReversingId(showReverseModal.id);
    try {
      await reverseTransaction(token, showReverseModal.id, reverseReason);
      setShowReverseModal(null); setReverseReason('');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to reverse transaction'); }
    finally { setReversingId(''); }
  };

  return (
    <section style={{ marginTop: 24 }}>
      {showReverseModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-icon modal-reject"><RefreshCw size={22} /></div>
            <h3>Reverse transaction?</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              This reversal will be logged as a separate record. The original transaction is preserved for audit purposes.
            </p>
            <label className="modal-reason-label">
              <span>Reason for reversal *</span>
              <textarea required rows={3} maxLength={300} value={reverseReason} onChange={e => setReverseReason(e.target.value)} placeholder="e.g. Customer returned purchase" />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => { setShowReverseModal(null); setReverseReason(''); }}>Cancel</button>
              <button className="primary-button modal-reject" disabled={!reverseReason.trim() || !!reversingId} onClick={doReverse}>
                {reversingId ? 'Reversing…' : 'Confirm reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 4 }}>From</span>
          <div className="auth-input" style={{ height: 38 }}><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        </label>
        <label>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 4 }}>To</span>
          <div className="auth-input" style={{ height: 38 }}><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        </label>
        <button className="secondary-button" style={{ fontSize: 12, minHeight: 38 }} onClick={() => { setFrom(''); setTo(''); }}>Clear</button>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading transactions…</div>}
      {!loading && transactions.length === 0 && (
        <div className="admin-workspace" style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No transactions in this period.</p>
        </div>
      )}
      {!loading && transactions.map(txn => (
        <div key={txn.id} className="activity-item" style={{ marginBottom: 6, borderRadius: 6, border: '1px solid var(--line)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: '12px 14px' }}>
          <div>
            <strong style={{ fontSize: 13 }}>{txn.resident.fullName}</strong>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>{txn.resident.card?.membershipId}</span>
            {txn.offer && <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0' }}>{txn.offer.title} · {txn.offer.displayValue}</p>}
            <p style={{ fontSize: 11, margin: '3px 0 0' }}>
              Benefit: <strong style={{ color: '#8a6029' }}>NGN {txn.benefitValue}</strong>
              {txn.purchaseAmount && <span style={{ color: 'var(--muted)' }}> on NGN {txn.purchaseAmount}</span>}
              <span style={{ color: 'var(--muted)', marginLeft: 6 }}>· {txn.redemptionModel.toLowerCase()}</span>
            </p>
            <small style={{ color: 'var(--muted)', fontSize: 10 }}>
              {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(txn.createdAt))}
              {txn.reversedAt && <span style={{ color: '#8b3028', marginLeft: 6 }}>· REVERSED</span>}
            </small>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {!txn.reversedAt && txn.auditStatus !== 'REVERSAL' && (
              <button className="icon-button" title="Reverse transaction" onClick={() => setShowReverseModal(txn)}>
                <RefreshCw size={15} />
              </button>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Reports panel ─────────────────────────────────────────────────────

function ReportsPanel({ token }: { token: string }) {
  const [report, setReport] = useState<MerchantReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const data = await getMerchantReport(token, from || undefined, to || undefined);
      setReport(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (v: string) => `NGN ${Number(v).toLocaleString('en-NG')}`;

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 4 }}>From</span>
          <div className="auth-input" style={{ height: 38 }}><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        </label>
        <label>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 4 }}>To</span>
          <div className="auth-input" style={{ height: 38 }}><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        </label>
        <button className="primary-button" style={{ fontSize: 12, minHeight: 38 }} onClick={load} disabled={loading}>
          <BarChart2 size={15} /> {loading ? 'Loading…' : 'Generate report'}
        </button>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {report && (
        <>
          <div className="admin-metrics" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 20 }}>
            {[
              { label: 'Total visits', value: report.summary.totalVisits.toString() },
              { label: 'Total benefit value', value: fmt(report.summary.totalBenefitValue) },
              { label: 'Immediate discounts', value: fmt(report.summary.immediateValue) },
              { label: 'Accumulated issued', value: fmt(report.summary.accumulatedIssued) },
              { label: 'Reward liability', value: fmt(report.summary.totalRewardLiability) },
              { label: 'Residents with balance', value: report.summary.totalResidentsWithBalance.toString() },
            ].map(({ label, value }) => (
              <div key={label} className="admin-metric">
                <span className="pending"><BarChart2 size={17} /></span>
                <div><small>{label}</small><strong style={{ fontSize: 14 }}>{value}</strong></div>
              </div>
            ))}
          </div>
          {report.offerUsage.length > 0 && (
            <div className="admin-workspace">
              <div className="admin-toolbar"><strong style={{ fontSize: 13 }}>Offer usage breakdown</strong></div>
              <div className="admin-list-head" style={{ gridTemplateColumns: '1fr .5fr .5fr' }}>
                <span>Offer</span><span>Uses</span><span>Total value</span>
              </div>
              {report.offerUsage.map(o => (
                <div key={o.offerId ?? 'no-offer'} style={{ display: 'grid', gridTemplateColumns: '1fr .5fr .5fr', gap: 16, padding: '12px 16px', borderTop: '1px solid var(--line)', fontSize: 12 }}>
                  <div><strong>{o.offerTitle}</strong><small style={{ color: 'var(--muted)', display: 'block' }}>{o.displayValue}</small></div>
                  <span>{o.count}</span>
                  <span style={{ color: '#8a6029', fontWeight: 700 }}>{fmt(o.totalValue)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Offers panel ──────────────────────────────────────────────────────

const BENEFIT_TYPE_LABELS: Record<BenefitType, string> = {
  PERCENTAGE_DISCOUNT: 'Percentage discount',
  FIXED_RATE:          'Fixed rate',
  FREE_SERVICE:        'Free service',
  LOYALTY_POINTS:      'Loyalty points',
  MERCHANT_CREDIT:     'Merchant credit',
  VOUCHER:             'Voucher',
};

const BENEFIT_TYPES: BenefitType[] = [
  'PERCENTAGE_DISCOUNT', 'FIXED_RATE', 'FREE_SERVICE',
  'LOYALTY_POINTS', 'MERCHANT_CREDIT', 'VOUCHER',
];

type OfferFormState = {
  title: string; benefitType: BenefitType; value: string;
  displayValue: string; redemptionModel: RedemptionModel;
  redemptionRule: string; validFrom: string; validUntil: string;
  changeNote: string;
};

const EMPTY_OFFER: OfferFormState = {
  title: '', benefitType: 'PERCENTAGE_DISCOUNT', value: '',
  displayValue: '', redemptionModel: 'IMMEDIATE',
  redemptionRule: '', validFrom: '', validUntil: '', changeNote: '',
};

const VALUE_REQUIRED: BenefitType[] = ['PERCENTAGE_DISCOUNT', 'FIXED_RATE', 'LOYALTY_POINTS', 'MERCHANT_CREDIT'];

function statusBadge(s: string) {
  const map: Record<string, string> = { ACTIVE: 'timeline-approved', PENDING: 'timeline-pending', PAUSED: 'timeline-suspended' };
  return map[s] ?? 'timeline-pending';
}

function OfferFormModal({ initial, onSave, onClose, isEdit }: {
  initial: OfferFormState;
  onSave: (f: OfferFormState) => Promise<void>;
  onClose: () => void;
  isEdit: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof OfferFormState, v: string) => setForm(f => ({ ...f, [k]: v }));
  const needsValue = VALUE_REQUIRED.includes(form.benefitType);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (needsValue && !form.value.trim()) { setError('Value is required for this benefit type'); return; }
    setSaving(true); setError('');
    try { await onSave(form); }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to save offer'); setSaving(false); }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card" style={{ maxWidth: 560, width: '100%' }}>
        <h3>{isEdit ? 'Edit offer' : 'Create offer'}</h3>
        {isEdit && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: -8 }}>Changes to benefit type, value, redemption model, or validity dates will pause the offer for BERA re-approval.</p>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <label>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Offer title *</span>
            <div className="auth-input"><input required maxLength={120} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. 7.5% off all purchases" /></div>
          </label>
          <div className="auth-field-row">
            <label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Benefit type *</span>
              <select value={form.benefitType} onChange={e => set('benefitType', e.target.value as BenefitType)}
                style={{ width: '100%', height: 45, padding: '0 12px', border: '1px solid #cad4da', borderRadius: 6, font: 'inherit', fontSize: 13 }}>
                {BENEFIT_TYPES.map(t => <option key={t} value={t}>{BENEFIT_TYPE_LABELS[t]}</option>)}
              </select>
            </label>
            <label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Redemption model *</span>
              <select value={form.redemptionModel} onChange={e => set('redemptionModel', e.target.value as RedemptionModel)}
                style={{ width: '100%', height: 45, padding: '0 12px', border: '1px solid #cad4da', borderRadius: 6, font: 'inherit', fontSize: 13 }}>
                <option value="IMMEDIATE">Immediate</option>
                <option value="ACCUMULATED">Accumulated</option>
              </select>
            </label>
          </div>
          <div className="auth-field-row">
            <label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>{needsValue ? 'Value *' : 'Value (optional)'}</span>
              <div className="auth-input"><input required={needsValue} value={form.value} onChange={e => set('value', e.target.value)} placeholder={form.benefitType === 'PERCENTAGE_DISCOUNT' ? 'e.g. 7.5' : 'e.g. 1500'} /></div>
            </label>
            <label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Display value *</span>
              <div className="auth-input"><input required maxLength={60} value={form.displayValue} onChange={e => set('displayValue', e.target.value)} placeholder="e.g. 7.5% off" /></div>
            </label>
          </div>
          <label>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Redemption rule *</span>
            <div className="auth-input"><input required maxLength={300} value={form.redemptionRule} onChange={e => set('redemptionRule', e.target.value)} placeholder="e.g. Orders above NGN 10,000" /></div>
          </label>
          <div className="auth-field-row">
            <label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Valid from *</span>
              <div className="auth-input"><input required type="date" value={form.validFrom} onChange={e => set('validFrom', e.target.value)} /></div>
            </label>
            <label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Valid until (optional)</span>
              <div className="auth-input"><input type="date" value={form.validUntil} onChange={e => set('validUntil', e.target.value)} /></div>
            </label>
          </div>
          {isEdit && (
            <label>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 5 }}>Change note (optional)</span>
              <div className="auth-input"><input maxLength={300} value={form.changeNote} onChange={e => set('changeNote', e.target.value)} placeholder="Brief reason for this change" /></div>
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Save changes' : 'Submit for approval'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OffersPanel({ token, isApproved }: { token: string; isApproved: boolean }) {
  const [offers, setOffers] = useState<MerchantOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOffer, setEditingOffer] = useState<MerchantOffer | null>(null);
  const [detailOffer, setDetailOffer] = useState<MerchantOfferDetail | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { offers: items } = await listMerchantOffers(token);
      setOffers(items);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load offers'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (form: OfferFormState) => {
    await createMerchantOffer(token, {
      title: form.title, benefitType: form.benefitType,
      value: form.value.trim() || undefined,
      displayValue: form.displayValue,
      redemptionModel: form.redemptionModel,
      redemptionRule: form.redemptionRule,
      validFrom: form.validFrom,
      validUntil: form.validUntil || undefined,
    });
    setShowForm(false);
    await load();
  };

  const handleEdit = async (form: OfferFormState) => {
    if (!editingOffer) return;
    const { requiresReApproval } = await updateMerchantOffer(token, editingOffer.id, {
      title: form.title, benefitType: form.benefitType,
      value: form.value.trim() || undefined,
      displayValue: form.displayValue,
      redemptionModel: form.redemptionModel,
      redemptionRule: form.redemptionRule,
      validFrom: form.validFrom,
      validUntil: form.validUntil || undefined,
      changeNote: form.changeNote || undefined,
    });
    setEditingOffer(null);
    await load();
    if (requiresReApproval) setActionError('Offer updated and sent back to BERA for re-approval due to material changes.');
  };

  const action = async (id: string, act: 'pause' | 'resume' | 'archive') => {
    setActionError('');
    try {
      if (act === 'pause') await pauseMerchantOffer(token, id);
      else if (act === 'resume') await resumeMerchantOffer(token, id);
      else await archiveMerchantOffer(token, id);
      await load();
    } catch (e) { setActionError(e instanceof Error ? e.message : `Unable to ${act} offer`); }
  };

  const showDetail = async (offer: MerchantOffer) => {
    try {
      const { offer: detail } = await getMerchantOffer(token, offer.id);
      setDetailOffer(detail);
    } catch { setDetailOffer({ ...offer, versions: [] }); }
  };

  if (!isApproved) {
    return (
      <section style={{ marginTop: 24 }}>
        <div className="admin-workspace" style={{ padding: '28px 24px', textAlign: 'center' }}>
          <Tag size={32} style={{ color: 'var(--muted)', margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Offers available after BERA approval</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Once your merchant account is approved, you can create and manage resident benefit offers here.</p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ marginTop: 24 }}>
      {showForm && <OfferFormModal initial={EMPTY_OFFER} onSave={handleCreate} onClose={() => setShowForm(false)} isEdit={false} />}
      {editingOffer && (
        <OfferFormModal
          isEdit
          initial={{ title: editingOffer.title, benefitType: editingOffer.benefitType, value: editingOffer.value ?? '', displayValue: editingOffer.displayValue, redemptionModel: editingOffer.redemptionModel, redemptionRule: editingOffer.redemptionRule, validFrom: editingOffer.validFrom.slice(0, 10), validUntil: editingOffer.validUntil?.slice(0, 10) ?? '', changeNote: '' }}
          onSave={handleEdit}
          onClose={() => setEditingOffer(null)}
        />
      )}
      {detailOffer && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <h3>{detailOffer.title}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                ['Type', BENEFIT_TYPE_LABELS[detailOffer.benefitType]],
                ['Value', detailOffer.displayValue],
                ['Model', detailOffer.redemptionModel],
                ['Rule', detailOffer.redemptionRule],
                ['Valid from', new Date(detailOffer.validFrom).toLocaleDateString('en-GB')],
                ['Valid until', detailOffer.validUntil ? new Date(detailOffer.validUntil).toLocaleDateString('en-GB') : 'Open-ended'],
              ].map(([l, v]) => (
                <div key={l}><p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 2px' }}>{l}</p><p style={{ fontSize: 13, margin: 0 }}>{v}</p></div>
              ))}
            </div>
            {detailOffer.versions.length > 0 && (
              <>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Version history</h4>
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detailOffer.versions.map(v => (
                    <div key={v.id} style={{ padding: '8px 10px', background: '#f5f7f9', borderRadius: 5, fontSize: 11 }}>
                      <strong>{v.displayValue}</strong> · {v.status} · {new Date(v.createdAt).toLocaleDateString('en-GB')}
                      {v.changeNote && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>— {v.changeNote}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="primary-button" onClick={() => setDetailOffer(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div><h3 style={{ fontSize: 16, margin: 0 }}>Benefit offers</h3><p style={{ color: 'var(--muted)', fontSize: 12, margin: '3px 0 0' }}>New offers and material changes require BERA approval before going live.</p></div>
        <button className="primary-button" onClick={() => setShowForm(true)} style={{ fontSize: 12, minHeight: 34 }}><Plus size={15} /> New offer</button>
      </div>

      {error && <div className="auth-error" role="alert">{error}</div>}
      {actionError && <div className="profile-success" role="status">{actionError}</div>}

      {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading offers…</div>}
      {!loading && offers.length === 0 && (
        <div className="admin-workspace" style={{ padding: '24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No offers yet. Create your first resident benefit offer.</p>
        </div>
      )}
      {!loading && offers.map(offer => (
        <div key={offer.id} className="dependant-card" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
          <div className="dependant-avatar" style={{ borderRadius: 6, background: '#e8d6b4', color: '#845f2e', fontSize: 11 }}>
            {offer.benefitType.slice(0, 2)}
          </div>
          <div className="dependant-info" style={{ flex: 1 }}>
            <strong>{offer.title}</strong>
            <span>{offer.displayValue} · {BENEFIT_TYPE_LABELS[offer.benefitType]}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{offer.redemptionModel} · {offer.redemptionRule}</span>
            <div className={`dependant-status-badge ${statusBadge(offer.status)}`} style={{ marginTop: 4 }}>
              {offer.status === 'ACTIVE' ? <CheckCircle2 size={12} /> : offer.status === 'PENDING' ? <Clock3 size={12} /> : <Pause size={12} />}
              <span>{offer.status.toLowerCase()}</span>
            </div>
          </div>
          <div className="dependant-actions" style={{ flexDirection: 'column', gap: 4 }}>
            <button className="icon-button" title="View history" onClick={() => showDetail(offer)}><Tag size={15} /></button>
            <button className="icon-button" title="Edit" onClick={() => setEditingOffer(offer)}><Pencil size={15} /></button>
            {offer.status === 'ACTIVE' && <button className="icon-button" title="Pause" onClick={() => action(offer.id, 'pause')}><Pause size={15} /></button>}
            {offer.status === 'PAUSED' && <button className="icon-button" title="Resume (re-approval required)" onClick={() => action(offer.id, 'resume')}><Play size={15} /></button>}
            {offer.status !== 'PAUSED' && <button className="icon-button" title="Archive" onClick={() => { if (window.confirm('Archive this offer?')) action(offer.id, 'archive'); }}><Trash2 size={15} /></button>}
          </div>
        </div>
      ))}
    </section>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────
type MerchantView = 'overview' | 'scan' | 'offers' | 'transactions' | 'reports' | 'walkins' | 'staff' | 'profile';

function MerchantDashboard({ session, logout }: { session: MerchantSession; logout: () => void }) {
  const [view, setView] = useState<MerchantView>('overview');
  const [showChangePw, setShowChangePw] = useState(false);
  const [offers, setOffers] = useState<MerchantOffer[]>([]);
  const [pendingWalkIns, setPendingWalkIns] = useState(0);
  const mu = session.merchantUser;
  const m = mu.merchant;
  const isOwner = mu.role === 'OWNER';
  const isApproved = m.approvalStatus === 'APPROVED';
  const socketRef = useRef<any>(null);

  // Pre-load offers so ScanPanel can use them
  useEffect(() => {
    if (!isApproved) return;
    listMerchantOffers(session.accessToken)
      .then(({ offers: items }) => setOffers(items))
      .catch(() => {});
  }, [isApproved, session.accessToken]);

  // Poll for unacknowledged walk-ins + socket connection to receive live notifications
  useEffect(() => {
    if (!isApproved) return;

    const loadPending = () => {
      getMerchantWalkIns(session.accessToken, m.id)
        .then(({ walkIns }) => setPendingWalkIns(walkIns.filter(w => !w.acknowledged).length))
        .catch(() => {});
    };
    loadPending();

    // Connect to security server socket to receive real-time walk-in alerts
    const securityUrl = (import.meta as any).env?.VITE_SECURITY_API_URL || '';
    if (securityUrl) {
      try {
        // Dynamic import to avoid bundling issues if socket.io-client not in web app
        import('socket.io-client').then(({ io }) => {
          const socket = io(securityUrl, { transports: ['polling', 'websocket'] });
          socketRef.current = socket;
          socket.on('connect', () => socket.emit('merchant:register', { merchantId: m.id }));
          socket.on('walkin:arriving', () => { loadPending(); setPendingWalkIns(n => n + 1); });
          socket.on('walkin:acknowledged', () => loadPending());
        }).catch(() => {});
      } catch { /* no socket available */ }
    }

    return () => { socketRef.current?.disconnect(); };
  }, [isApproved, m.id, session.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="admin-shell">
      {showChangePw && (
        <ChangePasswordPanel token={session.accessToken} onClose={() => setShowChangePw(false)} />
      )}

      <header className="admin-header">
        <MerchantBrand />
        <div className="admin-account">
          <div><strong>{m.businessName}</strong><small>{mu.role === 'OWNER' ? 'Owner' : 'Sales staff'} · {m.category}</small></div>
          <button onClick={() => setShowChangePw(true)} title="Change password" aria-label="Change password" style={{ marginRight: 6 }}><KeyRound size={18} /></button>
          <button onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-title">
          <div>
            <span>Merchant portal</span>
            <h1>{m.businessName}</h1>
            <p>{m.category} · {m.location}</p>
          </div>
          <div className="admin-live">
            <i style={{ background: isApproved ? '#4e936d' : '#c49a54' }} />
            {isApproved ? 'Active merchant' : m.approvalStatus.toLowerCase()}
          </div>
        </section>

        <ApprovalBanner mu={mu} />

        {/* Section tabs */}
        <div className="admin-section-tabs">
          <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>
            <Store size={16} /> Overview
          </button>
          {isApproved && (
            <button className={view === 'scan' ? 'active' : ''} onClick={() => setView('scan')}>
              <ShieldCheck size={16} /> Scan & log
            </button>
          )}
          <button className={view === 'offers' ? 'active' : ''} onClick={() => setView('offers')}>
            <Tag size={16} /> Offers
          </button>
          {isApproved && (
            <button className={view === 'transactions' ? 'active' : ''} onClick={() => setView('transactions')}>
              <RefreshCw size={16} /> Transactions
            </button>
          )}
          {isApproved && (
            <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
              <BarChart2 size={16} /> Reports
            </button>
          )}
          {isApproved && (
            <button
              className={view === 'walkins' ? 'active' : ''}
              onClick={() => { setView('walkins'); setPendingWalkIns(0); }}
              style={{ position: 'relative' }}
            >
              <Bell size={16} /> Walk-ins
              {pendingWalkIns > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, background: '#dc2626', color: '#fff', fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 3px' }}>
                  {pendingWalkIns}
                </span>
              )}
            </button>
          )}
          <button className={view === 'staff' ? 'active' : ''} onClick={() => setView('staff')}>
            <Users size={16} /> Staff
          </button>
          <button className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}>
            <UserRound size={16} /> Profile
          </button>
        </div>

        {view === 'overview'     && <MerchantOverview m={m} isApproved={isApproved} setView={setView} pendingWalkIns={pendingWalkIns} />}
        {view === 'scan'         && <ScanPanel token={session.accessToken} offers={offers} />}
        {view === 'offers'       && <OffersPanel token={session.accessToken} isApproved={isApproved} />}
        {view === 'transactions' && <TransactionsPanel token={session.accessToken} />}
        {view === 'reports'      && <ReportsPanel token={session.accessToken} />}
        {view === 'walkins'      && <WalkInsPanel token={session.accessToken} merchantId={m.id} />}
        {view === 'staff'        && <StaffPanel token={session.accessToken} isOwner={isOwner} />}
        {view === 'profile'      && <MerchantProfile m={m} mu={mu} />}
      </main>
    </div>
  );
}

// ── Overview panel ────────────────────────────────────────────────────
function MerchantOverview({ m, isApproved, setView, pendingWalkIns }: {
  m: MerchantUserProfile['merchant'];
  isApproved: boolean;
  setView: (v: MerchantView) => void;
  pendingWalkIns: number;
}) {
  return (
    <section style={{ marginTop: 24 }}>
      {!isApproved && (
        <div className="admin-workspace" style={{ padding: '28px 24px', textAlign: 'center' }}>
          <ShieldCheck size={36} style={{ color: 'var(--muted)', margin: '0 auto 12px', display: 'block' }} />
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Awaiting BERA approval</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, maxWidth: 420, margin: '0 auto' }}>
            Your merchant registration is under review. Once approved, you can verify
            resident cards, log transactions, and manage offers from this portal.
          </p>
        </div>
      )}
      {isApproved && (
        <div className="admin-metrics" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="admin-metric" style={{ cursor: 'pointer' }} onClick={() => setView('scan')}>
            <span className="approved"><ShieldCheck size={19} /></span>
            <div><small>Scan &amp; log</small><strong style={{ fontSize: 13 }}>Verify residents</strong></div>
          </div>
          <div className="admin-metric" style={{ cursor: 'pointer', position: 'relative' }} onClick={() => setView('walkins')}>
            <span className={pendingWalkIns > 0 ? 'pending' : 'approved'}><Bell size={19} /></span>
            <div>
              <small>Walk-ins</small>
              <strong style={{ fontSize: 13 }}>
                {pendingWalkIns > 0 ? `${pendingWalkIns} awaiting` : 'No pending'}
              </strong>
            </div>
            {pendingWalkIns > 0 && (
              <span style={{ position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: '50%', background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>
                {pendingWalkIns}
              </span>
            )}
          </div>
          <div className="admin-metric" style={{ cursor: 'pointer' }} onClick={() => setView('transactions')}>
            <span className="pending"><RefreshCw size={19} /></span>
            <div><small>Transactions</small><strong style={{ fontSize: 13 }}>View history</strong></div>
          </div>
          <div className="admin-metric" style={{ cursor: 'pointer' }} onClick={() => setView('reports')}>
            <span className="pending"><BarChart2 size={19} /></span>
            <div><small>Reports</small><strong style={{ fontSize: 13 }}>Benefit summary</strong></div>
          </div>
        </div>
      )}
      <div className="admin-workspace" style={{ marginTop: 16 }}>
        <div className="admin-toolbar">
          <strong style={{ fontSize: 14 }}>Quick links</strong>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            Use <strong>Scan &amp; log</strong> to verify a resident card and record a benefit transaction.
          </p>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
            Check <strong>Walk-ins</strong> to see guests sent by the access point. Acknowledge them to generate their exit code.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Walk-ins panel ────────────────────────────────────────────────────
function WalkInsPanel({ token, merchantId }: { token: string; merchantId: string }) {
  const [walkIns, setWalkIns] = useState<WalkInLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ackingId, setAckingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { walkIns: items } = await getMerchantWalkIns(token, merchantId);
      setWalkIns(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load walk-ins. Check VITE_SECURITY_API_URL is set.');
    } finally { setLoading(false); }
  }, [token, merchantId]);

  useEffect(() => { void load(); }, [load]);

  const acknowledge = async (id: string) => {
    setAckingId(id);
    try {
      const { walkIn } = await acknowledgeWalkIn(token, id);
      setWalkIns(old => old.map(w => w.id === id ? walkIn : w));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to acknowledge walk-in.');
    } finally { setAckingId(''); }
  };

  const pending  = walkIns.filter(w => !w.acknowledged && !w.exitTime);
  const active   = walkIns.filter(w =>  w.acknowledged && !w.exitTime);
  const exited   = walkIns.filter(w =>  w.exitTime);

  const fmt = (iso: string) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso));

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, margin: 0 }}>Walk-in guests</h3>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>
            Guests logged by the access point heading to your business. Acknowledge to generate their exit code.
          </p>
        </div>
        <button className="secondary-button" style={{ fontSize: 12, minHeight: 34 }} onClick={load} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="auth-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      {loading && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}

      {/* Pending acknowledgement */}
      {pending.length > 0 && (
        <div className="admin-workspace" style={{ marginBottom: 16, border: '1px solid #fca5a5' }}>
          <div className="admin-toolbar" style={{ background: '#fef2f2' }}>
            <Bell size={15} style={{ color: '#dc2626' }} />
            <strong style={{ fontSize: 13, color: '#dc2626' }}>Needs acknowledgement ({pending.length})</strong>
          </div>
          {pending.map(w => (
            <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '14px 16px', borderTop: '1px solid var(--line)', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: 14 }}>{w.guestName}</strong>
                {w.guestPhone && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{w.guestPhone}</span>}
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '3px 0 0' }}>
                  Entered at {fmt(w.entryTime)} · Gate: {w.gate}
                  {w.notes && <span> · {w.notes}</span>}
                </p>
              </div>
              <button
                className="primary-button"
                style={{ fontSize: 12, minHeight: 36, whiteSpace: 'nowrap' }}
                disabled={ackingId === w.id}
                onClick={() => acknowledge(w.id)}
              >
                <CheckCircle2 size={15} />
                {ackingId === w.id ? 'Processing…' : 'Acknowledge & generate exit code'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Acknowledged — inside, waiting to exit */}
      {active.length > 0 && (
        <div className="admin-workspace" style={{ marginBottom: 16 }}>
          <div className="admin-toolbar">
            <strong style={{ fontSize: 13 }}>Currently inside ({active.length})</strong>
          </div>
          {active.map(w => (
            <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--line)', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: 13 }}>{w.guestName}</strong>
                {w.guestPhone && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{w.guestPhone}</span>}
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '3px 0 0' }}>
                  Entered {fmt(w.entryTime)} · Acknowledged {w.acknowledgedAt ? fmt(w.acknowledgedAt) : ''}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 2px' }}>Exit code</p>
                <strong style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 3, color: '#1a5c3a' }}>
                  {w.exitCode}
                </strong>
                <p style={{ fontSize: 10, color: 'var(--muted)', margin: '2px 0 0' }}>Give this code to the guest</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No active walk-ins */}
      {!loading && pending.length === 0 && active.length === 0 && (
        <div className="admin-workspace" style={{ padding: '28px 20px', textAlign: 'center' }}>
          <Bell size={28} style={{ color: 'var(--muted)', margin: '0 auto 10px', display: 'block' }} />
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No active walk-in guests right now.</p>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '6px 0 0' }}>When the access point logs a guest heading to your business, they will appear here.</p>
        </div>
      )}

      {/* Exited today */}
      {exited.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 13, color: 'var(--muted)', cursor: 'pointer', padding: '6px 0' }}>
            {exited.length} guest{exited.length !== 1 ? 's' : ''} already exited today
          </summary>
          <div className="admin-workspace" style={{ marginTop: 8 }}>
            {exited.map(w => (
              <div key={w.id} style={{ display: 'flex', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', alignItems: 'center' }}>
                <CheckCircle2 size={14} style={{ color: '#4e936d', flexShrink: 0 }} />
                <span><strong style={{ color: 'var(--text)' }}>{w.guestName}</strong> · entered {fmt(w.entryTime)} · exited {w.exitTime ? fmt(w.exitTime) : ''}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

// ── Profile panel ─────────────────────────────────────────────────────
function MerchantProfile({ m, mu }: { m: MerchantUserProfile['merchant']; mu: MerchantUserProfile }) {
  return (
    <section className="profile-form" style={{ marginTop: 24 }}>
      <div className="profile-summary" style={{ padding: 0, marginBottom: 16 }}>
        <div className="admin-avatar" style={{ width: 52, height: 52, fontSize: 16, borderRadius: 8, background: '#e8d6b4', color: '#845f2e', flexShrink: 0 }}>
          {m.businessName.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()}
        </div>
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 3 }}>{m.businessName}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>{m.category} · {mu.role === 'OWNER' ? 'Owner' : 'Sales staff'}</p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { label: 'Contact person', value: m.contactPerson },
          { label: 'Phone', value: m.phone },
          { label: 'Email', value: m.email ?? '—' },
          { label: 'Location', value: m.location },
          { label: 'Registration date', value: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(m.createdAt)) },
          { label: 'Approval status', value: m.approvalStatus },
        ].map(({ label, value }) => (
          <div key={label}>
            <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 3px' }}>{label}</p>
            <p style={{ fontSize: 13, margin: 0, fontWeight: 500 }}>{value}</p>
          </div>
        ))}
      </div>
      {m.statusReason && (
        <div className="approval-timeline timeline-suspended" style={{ marginTop: 16 }}>
          <span className="timeline-icon"><AlertTriangle size={18} /></span>
          <div className="timeline-body"><strong>Status note</strong><p>{m.statusReason}</p></div>
        </div>
      )}
    </section>
  );
}

// ── Root ──────────────────────────────────────────────────────────────
export default function MerchantApp() {
  const [session, setSession] = useState<MerchantSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  useEffect(() => {
    const token = localStorage.getItem(MERCHANT_TOKEN_KEY);
    if (!token) { setChecking(false); return; }
    getMerchantMe(token)
      .then(({ merchantUser }) => setSession({ accessToken: token, merchantUser }))
      .catch(() => localStorage.removeItem(MERCHANT_TOKEN_KEY))
      .finally(() => setChecking(false));
  }, []);

  const auth = (s: MerchantSession) => {
    localStorage.setItem(MERCHANT_TOKEN_KEY, s.accessToken);
    setSession(s);
  };

  const logout = () => {
    localStorage.removeItem(MERCHANT_TOKEN_KEY);
    setSession(null);
  };

  if (checking) {
    return (
      <div className="session-loading">
        <div className="brand-mark"><span>B</span></div>
        <span>Loading merchant portal…</span>
      </div>
    );
  }

  if (session) return <MerchantDashboard session={session} logout={logout} />;

  return authMode === 'login'
    ? <MerchantLogin onSwitch={() => setAuthMode('register')} onAuth={auth} />
    : <MerchantRegister onSwitch={() => setAuthMode('login')} onAuth={auth} />;
}
