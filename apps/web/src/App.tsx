import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  ChevronDown,
  CircleHelp,
  Clock3,
  CreditCard,
  Gift,
  History,
  Home,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Tag,
  UserRound,
  WalletCards,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  BellOff,
  Users,
  Plus,
  Pencil,
  Trash2,
  Phone,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import AuthScreen from './AuthScreen';
import {
  getResident,
  updateResidentProfile,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getDependants,
  createDependant,
  updateDependant,
  removeDependant,
  getResidentDashboard,
  getComplaints,
  createComplaint,
  listCategories,
  listOffers,
  type AuthSession,
  type ResidentProfile,
  type AppNotification,
  type Dependant,
  type ResidentDashboardResponse,
  type ResidentDashboardOffer,
  type ResidentDashboardActivity,
  type ResidentRewardBalance,
  type ComplaintRecord,
  getMyRenewals,
  requestRenewal,
  type ResidentRenewalsResponse,
} from './api';

type View = 'home' | 'directory' | 'card' | 'activity' | 'profile' | 'dependants' | 'support';

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Overview', icon: Home },
  { id: 'directory', label: 'Explore benefits', icon: Store },
  { id: 'card', label: 'My value card', icon: CreditCard },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'dependants', label: 'Dependants', icon: Users },
];

const TOKEN_KEY = 'bodija-resident-token';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Awaiting approval';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatRenewalWindow(days: number | null) {
  if (days === null) return 'No expiry date';
  if (days <= 0) return 'Expired';
  if (days === 1) return '1 day remaining';
  return `${days} days remaining`;
}

function humanStatus(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/^\w/, letter => letter.toUpperCase());
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><span>B</span></div>
      <div><strong>Bodija</strong><small>Value Card</small></div>
    </div>
  );
}

function Sidebar({ view, setView, open, close, resident, logout }: { view: View; setView: (v: View) => void; open: boolean; close: () => void; resident: ResidentProfile; logout: () => void }) {
  return (
    <>
      {open && <button className="scrim" aria-label="Close menu" onClick={close} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-head"><Brand /><button className="icon-button mobile-only" onClick={close} aria-label="Close menu"><X size={20} /></button></div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? 'active' : ''} onClick={() => { setView(id); close(); }}>
              <Icon size={19} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button onClick={() => { setView('support'); close(); }}><CircleHelp size={18} /><span>Help and support</span></button>
          <button onClick={() => { setView('profile'); close(); }}><UserRound size={18} /><span>My profile</span></button>
          <button onClick={logout}><LogOut size={18} /><span>Sign out</span></button>
          <div className="resident-mini"><div className="avatar">{initials(resident.fullName)}</div><div><strong>{resident.fullName}</strong><small>{resident.memberCategory}</small></div><ChevronDown size={16} /></div>
        </div>
      </aside>
    </>
  );
}

function Header({ title, openMenu, resident, unreadCount, onBellClick }: { title: string; openMenu: () => void; resident: ResidentProfile; unreadCount: number; onBellClick: () => void }) {
  return (
    <header className="topbar">
      <button className="icon-button menu-button" onClick={openMenu} aria-label="Open menu"><Menu size={21} /></button>
      <div><span className="eyebrow">Resident portal</span><h1>{title}</h1></div>
      <div className="top-actions">
        <button className="icon-button notification" aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`} onClick={onBellClick}>
          <Bell size={20} />
          {unreadCount > 0 && <i />}
        </button>
        <div className="top-avatar">{initials(resident.fullName)}</div>
      </div>
    </header>
  );
}

function notificationIcon(type: string) {
  if (type.includes('APPROVED')) return <CheckCircle2 size={18} />;
  if (type.includes('REJECTED')) return <XCircle size={18} />;
  if (type.includes('SUSPENDED')) return <AlertTriangle size={18} />;
  return <Info size={18} />;
}

function notificationTone(type: string): string {
  if (type.includes('APPROVED')) return 'notif-approved';
  if (type.includes('REJECTED')) return 'notif-rejected';
  if (type.includes('SUSPENDED')) return 'notif-suspended';
  return 'notif-info';
}

function NotificationPanel({
  open,
  close,
  notifications,
  onMarkRead,
  onMarkAllRead,
}: {
  open: boolean;
  close: () => void;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  if (!open) return null;
  const hasUnread = notifications.some(n => !n.isRead);
  return (
    <>
      <button className="scrim" aria-label="Close notifications" onClick={close} />
      <aside className="notif-panel" role="dialog" aria-label="Notifications">
        <div className="notif-header">
          <h2>Notifications</h2>
          <div className="notif-header-actions">
            {hasUnread && (
              <button className="text-button" onClick={onMarkAllRead}>Mark all read</button>
            )}
            <button className="icon-button" onClick={close} aria-label="Close"><X size={18} /></button>
          </div>
        </div>
        <div className="notif-list">
          {notifications.length === 0 && (
            <div className="notif-empty">
              <BellOff size={26} />
              <span>No notifications yet</span>
            </div>
          )}
          {notifications.map(n => (
            <button
              key={n.id}
              className={`notif-item ${n.isRead ? '' : 'unread'}`}
              onClick={() => !n.isRead && onMarkRead(n.id)}
            >
              <span className={`notif-icon ${notificationTone(n.type)}`}>{notificationIcon(n.type)}</span>
              <div className="notif-body">
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <small>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(n.createdAt))}</small>
              </div>
              {!n.isRead && <span className="notif-dot" aria-hidden="true" />}
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

function ApprovalTimeline({ resident }: { resident: ResidentProfile }) {
  const status = resident.approvalStatus;
  const reason = resident.statusReason;
  const changedAt = resident.statusChangedAt
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(resident.statusChangedAt))
    : null;

  if (status === 'APPROVED' && !reason) return null;

  const config: Record<string, { tone: string; icon: typeof Info; label: string }> = {
    PENDING: { tone: 'timeline-pending', icon: Clock3, label: 'Under review' },
    APPROVED: { tone: 'timeline-approved', icon: CheckCircle2, label: 'Approved by BERA' },
    REJECTED: { tone: 'timeline-rejected', icon: XCircle, label: 'Not approved' },
    SUSPENDED: { tone: 'timeline-suspended', icon: AlertTriangle, label: 'Suspended by BERA' },
  };
  const { tone, icon: Icon, label } = config[status] ?? config['PENDING'];

  return (
    <div className={`approval-timeline ${tone}`}>
      <span className="timeline-icon"><Icon size={18} /></span>
      <div className="timeline-body">
        <strong>{label}</strong>
        {status === 'PENDING' && !reason && (
          <p>Your application is in the BERA review queue. You will be notified once a decision is made.</p>
        )}
        {reason && <p>{reason}</p>}
        {changedAt && <small>Status updated {changedAt}</small>}
        {status === 'PENDING' && !changedAt && (
          <small>Applied {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(resident.createdAt))}</small>
        )}
      </div>
    </div>
  );
}

function ValueCard({ resident, compact = false }: { resident: ResidentProfile; compact?: boolean }) {
  const card = resident.card;
  const isActive = card?.status === 'ACTIVE';
  return (
    <div className={`value-card ${compact ? 'compact' : ''}`}>
      <div className="card-glow" />
      <div className="card-top"><Brand /><span className={`card-active ${isActive ? '' : 'pending'}`}><i /> {card ? humanStatus(card.status) : 'Not issued'}</span></div>
      <div className="member-details">
        <small>{resident.memberCategory}</small>
        <h2>{resident.fullName}</h2>
        <span>{card?.membershipId || 'Membership pending'}</span>
      </div>
      <div className="card-bottom">
        <div><small>Cluster</small><strong>{resident.neighbourhood}</strong></div>
        <div><small>Valid until</small><strong>{formatDate(card?.expiresAt)}</strong></div>
        {card && <div className="qr"><QRCode value={card.qrToken} size={58} bgColor="transparent" fgColor="#12344d" /></div>}
      </div>
    </div>
  );
}

function BenefitRow({ item }: { item: ResidentDashboardOffer }) {
  return (
    <article className="benefit-row">
      <div className={`merchant-logo ${item.tone}`}>{item.initials}</div>
      <div className="merchant-main"><strong>{item.merchant}</strong><span><MapPin size={13} />{item.location}</span></div>
      <div className="category-cell"><span>{item.category}</span></div>
      <div className="benefit-value"><strong>{item.value}</strong><small>{item.model}</small></div>
      <div className="rule-cell"><span>{item.rule}</span><small>Valid to {item.validUntil ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(item.validUntil)) : 'Open-ended'}</small></div>
      <button className="outline-button">View</button>
    </article>
  );
}

function overviewCurrency(value: number) {
  return `NGN ${Math.round(value).toLocaleString('en-NG')}`;
}

function Overview({ setView, resident, dashboard }: { setView: (v: View) => void; resident: ResidentProfile; dashboard: ResidentDashboardResponse | null }) {
  const cardActive = resident.card?.status === 'ACTIVE';
  const metrics = dashboard?.metrics;
  const offers = dashboard?.offers.slice(0, 3) ?? [];
  const activity = dashboard?.recentActivity.slice(0, 2) ?? [];
  return (
    <div className="page-content">
      <section className="welcome-line"><div><h2>Welcome, {firstName(resident.fullName)}</h2><p>{cardActive ? 'Your card is active and ready to use across approved Bodija merchants.' : 'Your digital card has been created and will activate after your resident application is approved.'}</p></div><button className="primary-button" onClick={() => setView(cardActive ? 'directory' : 'card')}>{cardActive ? <Search size={17} /> : <CreditCard size={17} />} {cardActive ? 'Find a benefit' : 'View my card'}</button></section>
      <section className="overview-grid">
        <ValueCard resident={resident} compact />
        <div className="metrics">
          <div className="metric"><span className="metric-icon savings"><Tag size={19} /></span><div><small>Saved this month</small><strong>{overviewCurrency(metrics?.savedThisMonth ?? 0)}</strong><em>{dashboard?.recentActivity.length ? `Across ${dashboard.recentActivity.length} recent interactions` : 'No recorded savings yet'}</em></div></div>
          <div className="metric"><span className="metric-icon rewards"><Gift size={19} /></span><div><small>Reward balance</small><strong>{overviewCurrency(metrics?.rewardBalance ?? 0)}</strong><em>{dashboard?.rewardBalances.length ? `At ${dashboard.rewardBalances.length} merchants` : 'No active merchant reward balances'}</em></div></div>
          <div className="metric"><span className="metric-icon visits"><LayoutGrid size={19} /></span><div><small>Available offers</small><strong>{metrics?.availableOffers ?? 0}</strong><em>Across {metrics?.categories ?? 0} categories</em></div></div>
          <div className="metric"><span className="metric-icon renewal"><Clock3 size={19} /></span><div><small>Resident support</small><strong>{dashboard?.complaintsCount ?? 0}</strong><em>Active complaints or dispute records</em></div></div>
        </div>
      </section>
      <section className="section-block">
        <div className="section-title"><div><h3>Popular near you</h3><p>Approved offers residents are using this week</p></div><button className="text-button" onClick={() => setView('directory')}>View all offers</button></div>
        <div className="offer-strip">{offers.map(item => <BenefitRow key={item.id} item={item} />)}</div>
      </section>
      <section className="bottom-grid">
        <div className="section-block compact-section"><div className="section-title"><div><h3>Recent activity</h3><p>Your latest recorded benefits</p></div><button className="text-button" onClick={() => setView('activity')}>See history</button></div>{activity.map((item) => <div className="activity-item" key={item.id}><span className="activity-icon"><WalletCards size={17} /></span><div><strong>{item.merchant}</strong><small>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</small></div><div className="activity-saving"><strong>{overviewCurrency(item.saved)}</strong><small>{item.kind}</small></div></div>)}</div>
        <div className="verification-note"><ShieldCheck size={27} /><div><h3>Your privacy is protected</h3><p>Card checks only show your name, membership status and cluster. Your private address is never shared with merchants.</p></div></div>
      </section>
    </div>
  );
}

function Directory({ token }: { token: string }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [model, setModel] = useState('All benefits');
  const [offers, setOffers] = useState<ResidentDashboardOffer[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 4;

  const loadOffersAndCategories = useCallback(async () => {
    setLoading(true);
    try {
      const [items, nextCategories] = await Promise.all([
        listOffers(token, category === 'All categories' ? undefined : category),
        listCategories(token),
      ]);
      setOffers(items);
      setCategories(['All categories', ...nextCategories]);
    } catch {
      setOffers([]);
      setCategories(['All categories']);
    } finally {
      setLoading(false);
    }
  }, [category, token]);

  useEffect(() => {
    void loadOffersAndCategories();
  }, [loadOffersAndCategories]);

  const filtered = useMemo(() => offers.filter(item => {
    const searchMatch = `${item.merchant} ${item.category} ${item.value}`.toLowerCase().includes(query.toLowerCase());
    return searchMatch && (category === 'All categories' || item.category === category) && (model === 'All benefits' || item.model === model);
  }), [offers, query, category, model]);

  useEffect(() => setPage(1), [query, category, model]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="page-content">
      <section className="directory-intro"><div><h2>Compare resident benefits</h2><p>Find the best approved offer by category, value and redemption type.</p></div><div className="trust-label"><BadgeCheck size={18} /> BERA approved merchants</div></section>
      <section className="filter-bar">
        <label className="search-field"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search merchant or benefit" /></label>
        <label className="select-wrap"><Store size={17} /><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={15} /></label>
        <label className="select-wrap"><SlidersHorizontal size={17} /><select value={model} onChange={e => setModel(e.target.value)}><option>All benefits</option><option>Immediate</option><option>Accumulated</option></select><ChevronDown size={15} /></label>
      </section>
      <div className="result-head"><span>{filtered.length} approved offers</span><small>Offers are subject to each merchant's stated terms.</small></div>
      {loading && <div className="admin-empty" style={{ minHeight: 160 }}><span>Loading offers…</span></div>}
      {!loading && (
        <>
          <section className="directory-list">{visible.map(item => <BenefitRow key={item.id} item={item} />)}{visible.length === 0 && <div className="empty-state"><Search size={26} /><h3>No matching benefits</h3><p>Try a different category or search term.</p></div>}</section>
          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <button className="secondary-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button className="secondary-button" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}

function CardPage({ resident, token }: { resident: ResidentProfile; token: string }) {
  const card = resident.card;
  const active = card?.status === 'ACTIVE';
  const rejected = resident.approvalStatus === 'REJECTED';
  const suspended = resident.approvalStatus === 'SUSPENDED' || card?.status === 'SUSPENDED';
  const [renewalState, setRenewalState] = useState<ResidentRenewalsResponse | null>(null);
  const [loadingRenewals, setLoadingRenewals] = useState(false);
  const [renewalError, setRenewalError] = useState<string | null>(null);
  const [requestingRenewal, setRequestingRenewal] = useState(false);

  const loadRenewals = useCallback(async () => {
    setLoadingRenewals(true);
    setRenewalError(null);
    try {
      const data = await getMyRenewals(token);
      setRenewalState(data);
    } catch (error) {
      setRenewalError(error instanceof Error ? error.message : 'Unable to load renewal details.');
    } finally {
      setLoadingRenewals(false);
    }
  }, [token]);

  useEffect(() => {
    void loadRenewals();
  }, [loadRenewals]);

  const requestRenewalNow = async () => {
    if (!window.confirm('Request a renewal for your resident card?')) return;
    setRequestingRenewal(true);
    setRenewalError(null);
    try {
      await requestRenewal(token);
      await loadRenewals();
    } catch (error) {
      setRenewalError(error instanceof Error ? error.message : 'Unable to submit your renewal request.');
    } finally {
      setRequestingRenewal(false);
    }
  };

  const latestRenewal = renewalState?.renewals[0];
  const canRequestRenewal = Boolean(card && resident.approvalStatus === 'APPROVED' && !renewalState?.hasPendingRenewal);

  return (
    <div className="page-content narrow-page">
      <div className="card-page-head">
        <h2>Your digital value card</h2>
        <p>{active
          ? 'Present this QR code to an approved merchant or security officer for live verification.'
          : rejected
            ? 'Your application was not approved. Please review the details below and contact BERA if you have questions.'
            : suspended
              ? 'Your card has been suspended by BERA. Gate access and merchant benefits are currently paused.'
              : 'Your QR code is ready, but access remains disabled until BERA approves your application.'
        }</p>
      </div>
      <ApprovalTimeline resident={resident} />
      {/* Expiry reminder banner — shown when ≤30 days remain on an active card */}
      {active && renewalState !== null && renewalState.daysUntilExpiry !== null && renewalState.daysUntilExpiry <= 30 && renewalState.daysUntilExpiry > 0 && (
        <div className="approval-timeline timeline-suspended" style={{ marginBottom: 16 }}>
          <span className="timeline-icon"><AlertTriangle size={18} /></span>
          <div className="timeline-body">
            <strong>Card expiring soon</strong>
            <p>Your card expires in {renewalState.daysUntilExpiry} day{renewalState.daysUntilExpiry === 1 ? '' : 's'}. Submit a renewal request now to avoid losing access.</p>
          </div>
        </div>
      )}
      {/* Expired card banner */}
      {card?.status === 'EXPIRED' && (
        <div className="approval-timeline timeline-rejected" style={{ marginBottom: 16 }}>
          <span className="timeline-icon"><XCircle size={18} /></span>
          <div className="timeline-body">
            <strong>Card expired</strong>
            <p>Your resident card has expired. Submit a renewal request below to restore your access.</p>
          </div>
        </div>
      )}
      <ValueCard resident={resident} />
      <div className="card-actions">
        <button className="primary-button" disabled={!active}>
          <ShieldCheck size={17} /> {active ? 'Show verification code' : suspended ? 'Card suspended' : rejected ? 'Application rejected' : 'Approval pending'}
        </button>
        <button className="secondary-button" type="button" onClick={requestRenewalNow} disabled={!canRequestRenewal || requestingRenewal}>
          <Clock3 size={17} /> {requestingRenewal ? 'Submitting…' : renewalState?.hasPendingRenewal ? 'Renewal pending' : 'Request renewal'}
        </button>
      </div>
      <div className="status-panel">
        <div><span className={`status-dot ${active ? '' : 'pending'}`} /><div><strong>Membership {humanStatus(card?.status || resident.approvalStatus)}</strong><small>{active ? `Verified by BERA on ${formatDate(card?.issuedAt)}` : 'BERA will review the submitted resident details'}</small></div></div>
        <div><span>Issue date</span><strong>{formatDate(card?.issuedAt)}</strong></div>
        <div><span>Expiry date</span><strong>{formatDate(card?.expiresAt)}</strong></div>
        <div><span>Renewal window</span><strong>{loadingRenewals ? 'Loading…' : formatRenewalWindow(renewalState?.daysUntilExpiry ?? null)}</strong></div>
      </div>
      {renewalError && <div className="auth-error" role="alert">{renewalError}</div>}
      {latestRenewal && (
        <div className="status-panel" style={{ marginTop: 12 }}>
          <div><span>Latest renewal</span><strong>{latestRenewal.status}</strong></div>
          <div><span>Requested</span><strong>{formatDate(latestRenewal.requestedAt)}</strong></div>
          <div><span>Processed by</span><strong>{latestRenewal.processedBy || 'Pending review'}</strong></div>
          <div><span>Reason</span><strong>{latestRenewal.reason || latestRenewal.note || '—'}</strong></div>
        </div>
      )}
    </div>
  );
}

function ActivityPage({ activity, rewardBalances }: { activity: ResidentDashboardActivity[]; rewardBalances: ResidentRewardBalance[] }) {
  return <div className="page-content"><section className="directory-intro"><div><h2>Benefit activity</h2><p>A record of discounts, rewards and credits logged with your card.</p></div><button className="secondary-button"><SlidersHorizontal size={17} /> Filter history</button></section><div className="activity-table"><div className="table-head"><span>Merchant</span><span>Purchase</span><span>Value received</span><span>Date</span></div>{activity.map(item => <div className="table-row" key={item.id}><div><span className="activity-icon"><WalletCards size={17} /></span><strong>{item.merchant}</strong></div><span>{item.amount !== null ? overviewCurrency(item.amount) : '—'}</span><strong className="positive">{overviewCurrency(item.saved)}</strong><span>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</span></div>)}{rewardBalances.length > 0 && <div className="table-row"><div><span className="activity-icon"><Gift size={17} /></span><strong>Reward balances</strong></div><span>—</span><strong className="positive">{overviewCurrency(rewardBalances.reduce((sum, item) => sum + item.balance, 0))}</strong><span>{rewardBalances.length} merchants</span></div>}</div></div>;
}

function ProfilePage({ resident, token, onProfileUpdated }: { resident: ResidentProfile; token: string; onProfileUpdated: (resident: ResidentProfile) => void }) {
  const [form, setForm] = useState({
    fullName: resident.fullName,
    phone: resident.user.phone,
    email: resident.user.email || '',
    neighbourhood: resident.neighbourhood,
    memberCategory: resident.memberCategory,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Detect whether the current changes will trigger re-approval
  const sensitiveFieldChanged =
    form.fullName.trim() !== resident.fullName ||
    form.neighbourhood.trim() !== resident.neighbourhood;
  const willTriggerReApproval = sensitiveFieldChanged && resident.approvalStatus === 'APPROVED';

  const patch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { resident: updatedResident, requiresReApproval } = await updateResidentProfile(token, form);
      onProfileUpdated(updatedResident);
      setSuccessMessage(
        requiresReApproval
          ? 'Profile saved. Your name or address changed, so your card has been paused for BERA re-verification.'
          : 'Profile saved successfully.',
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to save your profile right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content narrow-page">
      <section className="profile-summary">
        <div className="avatar large-avatar">{initials(resident.fullName)}</div>
        <div>
          <h2>{resident.fullName}</h2>
          <p>{resident.card?.membershipId || 'Membership pending'} · {resident.approvalStatus.toLowerCase().replace(/_/g, ' ')}</p>
        </div>
      </section>

      <ApprovalTimeline resident={resident} />

      <form className="profile-form" onSubmit={patch}>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {successMessage && <div className="profile-success" role="status">{successMessage}</div>}

        {willTriggerReApproval && (
          <div className="profile-reapproval-warning" role="alert">
            <AlertTriangle size={16} />
            <span>Changing your name or address will pause your card and require BERA re-verification.</span>
          </div>
        )}

        <div className="auth-field-row">
          <label>
            <span>Full name</span>
            <div className="auth-input">
              <input
                value={form.fullName}
                onChange={event => setForm(current => ({ ...current, fullName: event.target.value }))}
              />
            </div>
          </label>
          <label>
            <span>Phone number</span>
            <div className="auth-input">
              <input
                value={form.phone}
                onChange={event => setForm(current => ({ ...current, phone: event.target.value }))}
              />
            </div>
          </label>
        </div>
        <div className="auth-field-row">
          <label>
            <span>Email</span>
            <div className="auth-input">
              <input
                type="email"
                value={form.email}
                onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
                placeholder="Optional"
              />
            </div>
          </label>
          <label>
            <span>Community cluster</span>
            <div className="auth-input">
              <input
                value={form.neighbourhood}
                onChange={event => setForm(current => ({ ...current, neighbourhood: event.target.value }))}
              />
            </div>
          </label>
        </div>
        <label>
          <span>Member category</span>
          <div className="auth-input">
            <input
              value={form.memberCategory}
              onChange={event => setForm(current => ({ ...current, memberCategory: event.target.value }))}
            />
          </div>
        </label>
        <div className="profile-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Dependants page ────────────────────────────────────────────────────
type DependantFormState = { fullName: string; relationship: string; phone: string };
const EMPTY_FORM: DependantFormState = { fullName: '', relationship: '', phone: '' };

function dependantStatusTone(status: string) {
  if (status === 'APPROVED') return 'timeline-approved';
  if (status === 'REJECTED') return 'timeline-rejected';
  if (status === 'SUSPENDED') return 'timeline-suspended';
  return 'timeline-pending';
}

function DependantsPage({ token }: { token: string }) {
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [primaryStatus, setPrimaryStatus] = useState<string>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form / modal state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DependantFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { dependants: items, primaryStatus: ps } = await getDependants(token);
      setDependants(items);
      setPrimaryStatus(ps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load dependants');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setEditingId(null); setForm(EMPTY_FORM); setFormError(null); setShowForm(true); };
  const openEdit = (d: Dependant) => {
    if (d.approvalStatus === 'APPROVED') return; // blocked — approved are read-only
    setEditingId(d.id);
    setForm({ fullName: d.fullName, relationship: d.relationship, phone: d.phone ?? '' });
    setFormError(null);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.relationship.trim()) {
      setFormError('Full name and relationship are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        relationship: form.relationship.trim(),
        phone: form.phone.trim() || undefined,
      };
      if (editingId) {
        const { dependant } = await updateDependant(token, editingId, payload);
        setDependants(prev => prev.map(d => d.id === editingId ? dependant : d));
      } else {
        const { dependant } = await createDependant(token, payload);
        setDependants(prev => [...prev, dependant]);
      }
      closeForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Unable to save dependant.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d: Dependant) => {
    if (!window.confirm(`Remove ${d.fullName} from your dependants?`)) return;
    setRemovingId(d.id);
    try {
      await removeDependant(token, d.id);
      setDependants(prev => prev.filter(x => x.id !== d.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to remove dependant.');
    } finally {
      setRemovingId(null);
    }
  };

  const primaryPaused = primaryStatus !== 'APPROVED';

  return (
    <div className="page-content narrow-page">
      <section className="directory-intro">
        <div>
          <h2>Dependants</h2>
          <p>
            Add household members who share your resident status. Approved dependants
            can be verified at community gates through your resident card.
          </p>
        </div>
        <button className="primary-button" onClick={openAdd}>
          <Plus size={16} /> Add dependant
        </button>
      </section>

      {primaryPaused && (
        <div className="approval-timeline timeline-pending" style={{ marginBottom: 18 }}>
          <span className="timeline-icon"><AlertTriangle size={18} /></span>
          <div className="timeline-body">
            <strong>Primary card not active</strong>
            <p>Dependants can only be gate-verified once your own resident card is approved and active.</p>
          </div>
        </div>
      )}

      {error && <div className="auth-error" role="alert">{error}</div>}

      {/* Dependant form modal */}
      {showForm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="dep-form-title">
          <div className="modal-card">
            <h3 id="dep-form-title">{editingId ? 'Edit dependant' : 'Add dependant'}</h3>
            <p>
              {editingId
                ? 'Update the details below. The dependant will be re-submitted for BERA review.'
                : 'Dependants are verified through your card. BERA must approve each one.'}
            </p>
            <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {formError && <div className="auth-error" role="alert">{formError}</div>}
              <label>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 6 }}>Full name *</span>
                <div className="auth-input">
                  <UserRound size={16} />
                  <input
                    required
                    value={form.fullName}
                    onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    placeholder="As on ID"
                    maxLength={100}
                  />
                </div>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 6 }}>Relationship *</span>
                <div className="auth-input">
                  <Users size={16} />
                  <input
                    required
                    value={form.relationship}
                    onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
                    placeholder="e.g. Spouse, Child, Parent"
                    maxLength={60}
                  />
                </div>
              </label>
              <label>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2a4454', display: 'block', marginBottom: 6 }}>Phone number (optional)</span>
                <div className="auth-input">
                  <Phone size={16} />
                  <input
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="0803 000 0000"
                  />
                </div>
              </label>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeForm}>Cancel</button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Submit for approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dependants list */}
      {loading && <div className="admin-empty" style={{ minHeight: 160 }}><span>Loading dependants…</span></div>}
      {!loading && dependants.length === 0 && (
        <div className="empty-state">
          <Users size={28} />
          <h3>No dependants yet</h3>
          <p>Add household members to register them under your resident account.</p>
        </div>
      )}
      {!loading && dependants.length > 0 && (
        <div className="dependant-list">
          {dependants.map(d => {
            const tone = dependantStatusTone(d.approvalStatus);
            const isApproved = d.approvalStatus === 'APPROVED';
            return (
              <article key={d.id} className="dependant-card">
                <div className="dependant-avatar">{initials(d.fullName)}</div>
                <div className="dependant-info">
                  <strong>{d.fullName}</strong>
                  <span>{d.relationship}{d.phone ? ` · ${d.phone}` : ''}</span>
                  <div className={`dependant-status-badge ${tone}`}>
                    {d.approvalStatus === 'APPROVED' && <CheckCircle2 size={12} />}
                    {d.approvalStatus === 'PENDING' && <Clock3 size={12} />}
                    {d.approvalStatus === 'REJECTED' && <XCircle size={12} />}
                    {d.approvalStatus === 'SUSPENDED' && <AlertTriangle size={12} />}
                    <span>{d.approvalStatus.toLowerCase().replace(/_/g, ' ')}</span>
                  </div>
                  {d.statusReason && (
                    <p className="dependant-reason">{d.statusReason}</p>
                  )}
                </div>
                <div className="dependant-actions">
                  {!isApproved && (
                    <button
                      className="icon-button"
                      title="Edit dependant"
                      onClick={() => openEdit(d)}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  <button
                    className="icon-button"
                    title="Remove dependant"
                    disabled={removingId === d.id}
                    onClick={() => remove(d)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="dependant-note">
        <ShieldCheck size={16} />
        <span>
          Approved dependants are verified through your card. Gate scans show only your name and membership status — dependant details are never disclosed to merchants.
        </span>
      </div>
    </div>
  );
}

function SupportPage({ token }: { token: string }) {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getComplaints(token);
      setComplaints(data.complaints);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load support requests.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadComplaints();
  }, [loadComplaints]);

  const submitComplaint = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required.');
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { complaint } = await createComplaint(token, { subject: subject.trim(), description: description.trim() });
      setComplaints(prev => [complaint, ...prev]);
      setSubject('');
      setDescription('');
      setSuccess('Your support request has been submitted. BERA will review it shortly.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to submit your support request right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content narrow-page">
      <section className="directory-intro">
        <div>
          <h2>Help and support</h2>
          <p>Report a merchant issue, dispute, or resident card concern and keep track of its status.</p>
        </div>
      </section>
      <form className="profile-form" onSubmit={submitComplaint}>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {success && <div className="profile-success" role="status">{success}</div>}
        <label>
          <span>Subject</span>
          <div className="auth-input"><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Example: Incorrect merchant discount" /></div>
        </label>
        <label>
          <span>Description</span>
          <div className="auth-input"><textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell us what happened and what outcome you need." rows={5} /></div>
        </label>
        <div className="profile-actions">
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit support request'}</button>
        </div>
      </form>
      <div className="section-block compact-section" style={{ marginTop: 20 }}>
        <div className="section-title"><div><h3>Your support requests</h3><p>Recent resident complaints and disputes</p></div></div>
        {loading && <div className="admin-empty" style={{ minHeight: 120 }}><span>Loading requests…</span></div>}
        {!loading && complaints.length === 0 && <div className="empty-state"><CircleHelp size={24} /><h3>No requests yet</h3><p>Submit a support ticket and BERA will review it.</p></div>}
        {!loading && complaints.map(item => (
          <div className="activity-item" key={item.id}>
            <span className="activity-icon"><Info size={17} /></span>
            <div><strong>{item.subject}</strong><small>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.createdAt))}</small></div>
            <div className="activity-saving"><strong>{item.status}</strong><small>{item.description.slice(0, 72)}{item.description.length > 72 ? '…' : ''}</small></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResidentPortal({ session, logout }: { session: AuthSession; logout: () => void }) {
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [resident, setResident] = useState(session.resident);
  const [dashboard, setDashboard] = useState<ResidentDashboardResponse | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await getResidentDashboard(session.accessToken);
      setDashboard(data);
      setResident(data.resident);
    } catch {
      // Non-critical — resident dashboard is optional for initial page render
    }
  }, [session.accessToken]);

  const loadNotifications = useCallback(async () => {
    try {
      const { notifications: items, unreadCount: count } = await getNotifications(session.accessToken);
      setNotifications(items);
      setUnreadCount(count);
    } catch {
      // Non-critical — silent fail
    }
  }, [session.accessToken]);

  useEffect(() => {
    void loadDashboard();
    loadNotifications();
    // Poll every 60 seconds for new notifications
    const timer = setInterval(loadNotifications, 60_000);
    return () => clearInterval(timer);
  }, [loadDashboard, loadNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(session.accessToken, id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(session.accessToken);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const titles: Record<View, string> = { home: 'Overview', directory: 'Explore benefits', card: 'My value card', activity: 'Activity', profile: 'My profile', dependants: 'Dependants', support: 'Help and support' };

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} open={menuOpen} close={() => setMenuOpen(false)} resident={resident} logout={logout} />
      <main className="main-area">
        <Header
          title={titles[view]}
          openMenu={() => setMenuOpen(true)}
          resident={resident}
          unreadCount={unreadCount}
          onBellClick={() => setNotifOpen(true)}
        />
        <NotificationPanel
          open={notifOpen}
          close={() => setNotifOpen(false)}
          notifications={notifications}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
        />
        {view === 'home' && <Overview setView={setView} resident={resident} dashboard={dashboard} />}
        {view === 'directory' && <Directory token={session.accessToken} />}
        {view === 'card' && <CardPage resident={resident} token={session.accessToken} />}
        {view === 'activity' && <ActivityPage activity={dashboard?.recentActivity ?? []} rewardBalances={dashboard?.rewardBalances ?? []} />}
        {view === 'dependants' && <DependantsPage token={session.accessToken} />}
        {view === 'support' && <SupportPage token={session.accessToken} />}
        {view === 'profile' && (
          <ProfilePage
            resident={resident}
            token={session.accessToken}
            onProfileUpdated={nextResident => {
              setResident(nextResident);
              // Reload notifications — re-approval will have added one
              loadNotifications();
            }}
          />
        )}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>
            <Icon size={19} /><span>{label === 'Explore benefits' ? 'Benefits' : label.replace('My value ', '')}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setCheckingSession(false);
      return;
    }

    getResident(token)
      .then(({ resident }) => setSession({ accessToken: token, resident }))
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setCheckingSession(false));
  }, []);

  const authenticated = (nextSession: AuthSession) => {
    localStorage.setItem(TOKEN_KEY, nextSession.accessToken);
    setSession(nextSession);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
  };

  if (checkingSession) {
    return <div className="session-loading"><div className="brand-mark"><span>B</span></div><span>Loading resident portal...</span></div>;
  }

  return session ? <ResidentPortal session={session} logout={logout} /> : <AuthScreen onAuthenticated={authenticated} />;
}
