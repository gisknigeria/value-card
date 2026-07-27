import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BarChart2,
  BadgeCheck,
  Ban,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  LogOut,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  XCircle,
} from 'lucide-react';
import {
  apiRequest,
  adminListMerchants,
  adminUpdateMerchantStatus,
  adminListOffers,
  adminUpdateOfferStatus,
  adminListUsers,
  adminUpdateUserPosition,
  listRenewals,
  processRenewal,
  listMerchantsForWalkIn,
  logWalkIn,
  type ApprovalStatus,
  type MerchantProfile,
  type AdminMerchantListResponse,
  type AdminOfferItem,
  type AdminOffersResponse,
  type OfferStatus,
  type AdminRole,
  type AdminUserPosition,
  type UserRole,
  type MerchantListItem,
  type WalkInLog,
} from './api';
import { PagerBar, ResidentDetailModal, ComplaintsPanel, TransactionAuditPanel, AdminReportsPanel } from './AdminPanels';

const ADMIN_TOKEN_KEY = 'bodija-admin-token';

// ── Types ─────────────────────────────────────────────────────────────

interface AdminIdentity {
  id: string;
  email: string;
  role: 'ADMIN';
  adminRole: AdminRole | null;
  associationName: string | null;
}

interface AdminResident {
  id: string;
  fullName: string;
  neighbourhood: string;
  memberCategory: string;
  approvalStatus: ApprovalStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  consentedAt: string;
  createdAt: string;
  user: { phone: string; email: string | null };
  card: { membershipId: string; status: string; issuedAt: string | null; expiresAt: string | null } | null;
}

interface ResidentsResponse {
  residents: AdminResident[];
  total?: number;
  page?: number;
  pageSize?: number;
  counts: { pending: number; approved: number; rejected: number; suspended: number };
}

interface AdminDependant {
  id: string;
  fullName: string;
  relationship: string;
  phone: string | null;
  approvalStatus: ApprovalStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  resident: {
    id: string;
    fullName: string;
    neighbourhood: string;
    approvalStatus: ApprovalStatus;
    card: { membershipId: string; status: string } | null;
  };
}

interface DependantsAdminResponse {
  dependants: AdminDependant[];
  counts: { pending: number; approved: number; rejected: number; suspended: number };
}

interface AdminRenewalItem {
  id: string;
  status: ApprovalStatus;
  reason: string | null;
  note: string | null;
  processedBy: string | null;
  requestedAt: string;
  processedAt: string | null;
  resident: {
    id: string;
    fullName: string;
    neighbourhood: string;
    approvalStatus: ApprovalStatus;
    card: { membershipId: string; status: string; issuedAt: string | null; expiresAt: string | null } | null;
  };
}

interface RenewalsAdminResponse {
  renewals: AdminRenewalItem[];
  counts: { pending: number; approved: number; rejected: number };
}

// ── Shared helpers ────────────────────────────────────────────────────

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function AdminBrand() {
  return (
    <div className="admin-brand">
      <div className="brand-mark"><span>B</span></div>
      <div><strong>BERA Admin</strong><small>Bodija Value Card</small></div>
    </div>
  );
}

// ── Reason modal ──────────────────────────────────────────────────────

function ReasonModal({
  action, subjectName, onConfirm, onCancel,
}: {
  action: 'REJECTED' | 'SUSPENDED';
  subjectName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const label = action === 'REJECTED' ? 'Reject' : 'Suspend';
  const tone = action === 'REJECTED' ? 'modal-reject' : 'modal-suspend';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card">
        <div className={`modal-icon ${tone}`}>
          {action === 'REJECTED' ? <UserX size={22} /> : <Ban size={22} />}
        </div>
        <h3 id="modal-title">{label} {subjectName}?</h3>
        <p>
          {action === 'REJECTED'
            ? 'This will mark the application as rejected.'
            : 'This will suspend access and block gate and merchant benefits.'}
        </p>
        <label className="modal-reason-label">
          <span>Reason <em>(optional — shown to the resident)</em></span>
          <textarea
            rows={3} maxLength={500}
            placeholder={action === 'REJECTED' ? 'e.g. Incomplete identity verification' : 'e.g. Account under investigation'}
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="secondary-button" onClick={onCancel}>Cancel</button>
          <button className={`primary-button ${tone}`} onClick={() => onConfirm(reason)}>
            {label} application
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Resident row ──────────────────────────────────────────────────────

function ResidentDetailRow({ resident, updatingId, onAction, onDetail }: {
  resident: AdminResident;
  updatingId: string;
  onAction: (r: AdminResident, s: Exclude<ApprovalStatus, 'PENDING'>) => void;
  onDetail?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="admin-resident-row">
      <div className="admin-resident-identity">
        <div className="admin-avatar">{resident.fullName.split(/\s+/).slice(0, 2).map(p => p[0]).join('')}</div>
        <div>
          <strong>{resident.fullName}</strong>
          <span>{resident.user.email || resident.user.phone}</span>
          <small>{resident.neighbourhood} · {resident.memberCategory}</small>
        </div>
      </div>
      <div className="admin-membership">
        <strong>{resident.card?.membershipId || 'Not issued'}</strong>
        <span>{resident.user.phone}</span>
      </div>
      <div className="admin-application">
        <span className={`admin-status ${resident.approvalStatus.toLowerCase()}`}>{resident.approvalStatus}</span>
        <small>Applied {formatDate(resident.createdAt)}</small>
        {resident.statusReason && (
          <button className="admin-reason-toggle" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Hide reason' : 'View reason'}
          </button>
        )}
      </div>
      <div className="admin-row-actions">
        {onDetail && (
          <button className="outline-button" style={{ minHeight: 32, fontSize: 11 }} onClick={onDetail} title="View full details">
            View
          </button>
        )}
        {resident.approvalStatus !== 'APPROVED' && (
          <button className="approve" disabled={updatingId === resident.id} onClick={() => onAction(resident, 'APPROVED')} title="Approve">
            <Check size={17} /><span>Approve</span>
          </button>
        )}
        {resident.approvalStatus !== 'REJECTED' && (
          <button disabled={updatingId === resident.id} onClick={() => onAction(resident, 'REJECTED')} title="Reject">
            <UserX size={17} />
          </button>
        )}
        {resident.approvalStatus === 'APPROVED' && (
          <button disabled={updatingId === resident.id} onClick={() => onAction(resident, 'SUSPENDED')} title="Suspend">
            <Ban size={17} />
          </button>
        )}
      </div>
      {expanded && resident.statusReason && (
        <div className="admin-reason-panel">
          <AlertTriangle size={14} />
          <span>{resident.statusReason}</span>
        </div>
      )}
    </article>
  );
}

// ── Residents panel ───────────────────────────────────────────────────

function ResidentsPanel({ token }: { token: string }) {
  const [data, setData] = useState<ResidentsResponse>({ residents: [], counts: { pending: 0, approved: 0, rejected: 0, suspended: 0 } });
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<ApprovalStatus | 'ALL'>('PENDING');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [pendingAction, setPendingAction] = useState<{ resident: AdminResident; status: Exclude<ApprovalStatus, 'PENDING'> } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const p = new URLSearchParams();
    if (status !== 'ALL') p.set('status', status);
    if (query.trim()) p.set('query', query.trim());
    p.set('page', String(page));
    try {
      const res = await apiRequest<ResidentsResponse & { total?: number }>(`/api/admin/residents?${p}`, { headers: { Authorization: `Bearer ${token}` } });
      setData(res);
      setTotal(res.total ?? res.residents.length);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load residents'); }
    finally { setLoading(false); }
  }, [status, query, page, token]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);
  useEffect(() => setPage(1), [status, query]);

  const requestAction = (resident: AdminResident, next: Exclude<ApprovalStatus, 'PENDING'>) => {
    if (next === 'APPROVED') { if (!window.confirm(`Approve ${resident.fullName}'s application?`)) return; void exec(resident.id, next, ''); }
    else setPendingAction({ resident, status: next });
  };

  const exec = async (id: string, next: Exclude<ApprovalStatus, 'PENDING'>, reason: string) => {
    setUpdatingId(id); setError('');
    try {
      await apiRequest(`/api/admin/residents/${id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: next, reason: reason.trim() || undefined }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update'); }
    finally { setUpdatingId(''); }
  };

  return (
    <section className="admin-workspace">
      {detailId && <ResidentDetailModal token={token} residentId={detailId} onClose={() => setDetailId(null)} />}
      {pendingAction && (
        <ReasonModal
          action={pendingAction.status as 'REJECTED' | 'SUSPENDED'}
          subjectName={pendingAction.resident.fullName}
          onConfirm={r => { const { resident, status: s } = pendingAction; setPendingAction(null); void exec(resident.id, s, r); }}
          onCancel={() => setPendingAction(null)}
        />
      )}
      <div className="admin-toolbar">
        <div className="admin-status-tabs">
          {(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ALL'] as const).map(s => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
              {s === 'ALL' ? 'All residents' : s[0] + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <label className="admin-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, phone or membership ID" /></label>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-list-head" style={{ gridTemplateColumns: 'minmax(250px,1.5fr) minmax(150px,.8fr) minmax(150px,.75fr) minmax(180px,.8fr)' }}>
        <span>Resident</span><span>Membership</span><span>Application</span><span>Actions</span>
      </div>
      <div className="admin-list">
        {loading && <div className="admin-empty"><span>Loading applications…</span></div>}
        {!loading && data.residents.map(r => (
          <ResidentDetailRow key={r.id} resident={r} updatingId={updatingId} onAction={requestAction}
            onDetail={() => setDetailId(r.id)} />
        ))}
        {!loading && data.residents.length === 0 && <div className="admin-empty"><Users size={25} /><strong>No matching residents</strong><span>New applications will appear here automatically.</span></div>}
      </div>
      <PagerBar page={page} total={total} pageSize={25} onPage={setPage} />
    </section>
  );
}

// ── Dependants panel ──────────────────────────────────────────────────

function DependantsPanel({ token }: { token: string }) {
  const [data, setData] = useState<DependantsAdminResponse>({ dependants: [], counts: { pending: 0, approved: 0, rejected: 0, suspended: 0 } });
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'ALL'>('PENDING');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [pendingAction, setPendingAction] = useState<{ dep: AdminDependant; status: Exclude<ApprovalStatus, 'PENDING'> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const p = new URLSearchParams();
    if (statusFilter !== 'ALL') p.set('status', statusFilter);
    if (query.trim()) p.set('query', query.trim());
    try {
      const res = await apiRequest<DependantsAdminResponse>(`/api/admin/dependants?${p}`, { headers: { Authorization: `Bearer ${token}` } });
      setData(res);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load dependants'); }
    finally { setLoading(false); }
  }, [statusFilter, query, token]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  const requestAction = (dep: AdminDependant, next: Exclude<ApprovalStatus, 'PENDING'>) => {
    if (next === 'APPROVED') { if (!window.confirm(`Approve ${dep.fullName} as dependant of ${dep.resident.fullName}?`)) return; void exec(dep.id, next, ''); }
    else setPendingAction({ dep, status: next });
  };

  const exec = async (id: string, next: Exclude<ApprovalStatus, 'PENDING'>, reason: string) => {
    setUpdatingId(id); setError('');
    try {
      await apiRequest(`/api/admin/dependants/${id}/status`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: next, reason: reason.trim() || undefined }) });
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update dependant'); }
    finally { setUpdatingId(''); }
  };

  const statusIcon = (s: string) => {
    if (s === 'APPROVED') return <CheckCircle2 size={13} />;
    if (s === 'REJECTED') return <XCircle size={13} />;
    if (s === 'SUSPENDED') return <AlertTriangle size={13} />;
    return <Clock3 size={13} />;
  };

  return (
    <section className="admin-workspace">
      {pendingAction && (
        <ReasonModal
          action={pendingAction.status as 'REJECTED' | 'SUSPENDED'}
          subjectName={`${pendingAction.dep.fullName} (dependant of ${pendingAction.dep.resident.fullName})`}
          onConfirm={r => { const { dep, status: s } = pendingAction; setPendingAction(null); void exec(dep.id, s, r); }}
          onCancel={() => setPendingAction(null)}
        />
      )}
      <div className="admin-toolbar">
        <div className="admin-status-tabs">
          {(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ALL'] as const).map(s => (
            <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
              {s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}
              {s !== 'ALL' && data.counts[s.toLowerCase() as keyof typeof data.counts] > 0 && (
                <span className="dep-count-badge">{data.counts[s.toLowerCase() as keyof typeof data.counts]}</span>
              )}
            </button>
          ))}
        </div>
        <label className="admin-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search dependant or primary resident name" /></label>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-list-head dep-list-head">
        <span>Dependant</span><span>Primary resident</span><span>Status</span><span>Actions</span>
      </div>
      <div className="admin-list">
        {loading && <div className="admin-empty"><span>Loading dependants…</span></div>}
        {!loading && data.dependants.map(dep => (
          <article key={dep.id} className="admin-resident-row dep-row">
            <div className="admin-resident-identity">
              <div className="admin-avatar">{dep.fullName.split(/\s+/).slice(0, 2).map(p => p[0]).join('')}</div>
              <div>
                <strong>{dep.fullName}</strong>
                <span>{dep.relationship}{dep.phone ? ` · ${dep.phone}` : ''}</span>
                <small>Submitted {formatDate(dep.createdAt)}</small>
              </div>
            </div>
            <div className="dep-primary-col">
              <strong>{dep.resident.fullName}</strong>
              <span>{dep.resident.neighbourhood}</span>
              <small>{dep.resident.card?.membershipId ?? 'No card issued'}</small>
            </div>
            <div className="admin-application">
              <span className={`admin-status ${dep.approvalStatus.toLowerCase()} dep-status-inline`}>
                {statusIcon(dep.approvalStatus)} {dep.approvalStatus}
              </span>
              {dep.statusReason && <small className="dep-status-reason">{dep.statusReason}</small>}
            </div>
            <div className="admin-row-actions">
              {dep.approvalStatus !== 'APPROVED' && (
                <button className="approve" disabled={updatingId === dep.id} onClick={() => requestAction(dep, 'APPROVED')} title="Approve">
                  <Check size={17} /><span>Approve</span>
                </button>
              )}
              {dep.approvalStatus !== 'REJECTED' && (
                <button disabled={updatingId === dep.id} onClick={() => requestAction(dep, 'REJECTED')} title="Reject"><UserX size={17} /></button>
              )}
              {dep.approvalStatus === 'APPROVED' && (
                <button disabled={updatingId === dep.id} onClick={() => requestAction(dep, 'SUSPENDED')} title="Suspend"><Ban size={17} /></button>
              )}
            </div>
          </article>
        ))}
        {!loading && data.dependants.length === 0 && (
          <div className="admin-empty"><Users size={25} /><strong>No matching dependants</strong><span>Dependant submissions will appear here once residents add them.</span></div>
        )}
      </div>
    </section>
  );
}

// ── Renewals panel ───────────────────────────────────────────────────

function RenewalsPanel({ token }: { token: string }) {
  const [data, setData] = useState<RenewalsAdminResponse>({ renewals: [], counts: { pending: 0, approved: 0, rejected: 0 } });
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'ALL'>('PENDING');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [pendingAction, setPendingAction] = useState<{ renewal: AdminRenewalItem; status: Exclude<ApprovalStatus, 'PENDING'> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await listRenewals(token, statusFilter, query);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load renewal queue');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, query, token]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  const requestAction = (renewal: AdminRenewalItem, next: Exclude<ApprovalStatus, 'PENDING'>) => {
    if (next === 'APPROVED') {
      if (!window.confirm(`Approve renewal for ${renewal.resident.fullName}?`)) return;
      void exec(renewal.id, next, '');
      return;
    }
    setPendingAction({ renewal, status: next });
  };

  const exec = async (id: string, next: Exclude<ApprovalStatus, 'PENDING'>, reason: string) => {
    setUpdatingId(id); setError('');
    try {
      await processRenewal(token, id, next, reason);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update renewal');
    } finally {
      setUpdatingId('');
    }
  };

  return (
    <section className="admin-workspace">
      {pendingAction && (
        <ReasonModal
          action="REJECTED"
          subjectName={pendingAction.renewal.resident.fullName}
          onConfirm={r => { const { renewal, status } = pendingAction; setPendingAction(null); void exec(renewal.id, status, r); }}
          onCancel={() => setPendingAction(null)}
        />
      )}
      <div className="admin-toolbar">
        <div className="admin-status-tabs">
          {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(s => (
            <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
              {s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}
              {s !== 'ALL' && data.counts[s.toLowerCase() as keyof typeof data.counts] > 0 && (
                <span className="dep-count-badge">{data.counts[s.toLowerCase() as keyof typeof data.counts]}</span>
              )}
            </button>
          ))}
        </div>
        <label className="admin-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search resident or membership ID" /></label>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-list-head dep-list-head">
        <span>Resident</span><span>Membership</span><span>Status</span><span>Actions</span>
      </div>
      <div className="admin-list">
        {loading && <div className="admin-empty"><span>Loading renewals…</span></div>}
        {!loading && data.renewals.map(item => (
          <article key={item.id} className="admin-resident-row dep-row">
            <div className="admin-resident-identity">
              <div className="admin-avatar">{item.resident.fullName.split(/\s+/).slice(0, 2).map(p => p[0]).join('')}</div>
              <div>
                <strong>{item.resident.fullName}</strong>
                <small>{item.resident.neighbourhood}</small>
              </div>
            </div>
            <div className="dep-primary-col">
              <strong>{item.resident.card?.membershipId || 'No card'}</strong>
              <span>{item.resident.card?.expiresAt ? formatDate(item.resident.card.expiresAt) : 'No expiry'}</span>
            </div>
            <div className="admin-application">
              <span className={`admin-status ${item.status.toLowerCase()}`}>{item.status}</span>
              <small>Requested {formatDate(item.requestedAt)}</small>
              {item.reason && <small className="dep-status-reason">{item.reason}</small>}
            </div>
            <div className="admin-row-actions">
              {item.status !== 'APPROVED' && (
                <button className="approve" disabled={updatingId === item.id} onClick={() => requestAction(item, 'APPROVED')} title="Approve">
                  <Check size={17} /><span>Approve</span>
                </button>
              )}
              {item.status !== 'REJECTED' && (
                <button disabled={updatingId === item.id} onClick={() => requestAction(item, 'REJECTED')} title="Reject"><UserX size={17} /></button>
              )}
            </div>
          </article>
        ))}
        {!loading && data.renewals.length === 0 && <div className="admin-empty"><Clock3 size={25} /><strong>No matching renewals</strong><span>Resident renewal requests will appear here when submitted.</span></div>}
      </div>
    </section>
  );
}

// ── Merchants panel ───────────────────────────────────────────────────

function PositionsPanel({ token, admin }: { token: string; admin: AdminIdentity }) {
  const [users, setUsers] = useState<AdminUserPosition[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const canAssign = admin.adminRole === 'SUPER_ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminListUsers(token, query);
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  }, [token, query]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  const updatePosition = async (user: AdminUserPosition, changes: Partial<Pick<AdminUserPosition, 'role' | 'adminRole' | 'associationName'>>) => {
    if (!canAssign) return;
    const nextRole = changes.role ?? user.role;
    const nextAdminRole = nextRole === 'ADMIN' ? (changes.adminRole ?? user.adminRole ?? 'SUPPORT') : undefined;
    const nextAssociationName = changes.associationName ?? user.associationName ?? user.resident?.neighbourhood ?? '';
    setSavingId(user.id);
    setError('');
    try {
      const { user: updated } = await adminUpdateUserPosition(token, user.id, {
        role: nextRole,
        adminRole: nextAdminRole,
        associationName: nextAdminRole === 'ASSOCIATION_REP' ? nextAssociationName : nextAssociationName || undefined,
      });
      setUsers(prev => prev.map(item => item.id === user.id ? updated : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update position');
    } finally {
      setSavingId('');
    }
  };

  const adminRoles: AdminRole[] = ['SUPER_ADMIN', 'ASSOCIATION_REP', 'RESIDENT_REVIEWER', 'MERCHANT_REVIEWER', 'SUPPORT', 'AUDITOR', 'REPORTER'];
  const roles: UserRole[] = ['RESIDENT', 'SECURITY', 'ADMIN', 'MERCHANT'];

  return (
    <section className="admin-workspace">
      <div className="admin-toolbar">
        <div>
          <strong style={{ fontSize: 13 }}>Assign positions</strong>
          <p style={{ margin: '3px 0 0', color: 'var(--muted)', fontSize: 11 }}>
            Association reps can approve residents only inside their assigned community cluster.
          </p>
        </div>
        <label className="admin-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, phone or email" /></label>
      </div>
      {!canAssign && <div className="admin-alert" role="alert">Only a super admin can assign positions.</div>}
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-list-head dep-list-head" style={{ gridTemplateColumns: 'minmax(220px,1.4fr) minmax(120px,.7fr) minmax(170px,.9fr) minmax(170px,.9fr)' }}>
        <span>User</span><span>Portal role</span><span>Admin position</span><span>Association</span>
      </div>
      <div className="admin-list">
        {loading && <div className="admin-empty"><span>Loading users...</span></div>}
        {!loading && users.map(user => (
          <article key={user.id} className="admin-resident-row dep-row" style={{ gridTemplateColumns: 'minmax(220px,1.4fr) minmax(120px,.7fr) minmax(170px,.9fr) minmax(170px,.9fr)' }}>
            <div className="admin-resident-identity">
              <div className="admin-avatar">{(user.resident?.fullName || user.email || user.phone).split(/\s+/).slice(0, 2).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</div>
              <div>
                <strong>{user.resident?.fullName || user.email || user.phone}</strong>
                <span>{user.email || user.phone}</span>
                <small>{user.resident?.neighbourhood || 'No resident profile'}</small>
              </div>
            </div>
            <select
              value={user.role}
              disabled={!canAssign || savingId === user.id}
              onChange={e => updatePosition(user, { role: e.target.value as UserRole })}
              style={{ height: 36, alignSelf: 'center', border: '1px solid var(--line)', borderRadius: 6 }}
            >
              {roles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
            <select
              value={user.adminRole ?? ''}
              disabled={!canAssign || savingId === user.id || user.role !== 'ADMIN'}
              onChange={e => updatePosition(user, { adminRole: e.target.value as AdminRole })}
              style={{ height: 36, alignSelf: 'center', border: '1px solid var(--line)', borderRadius: 6 }}
            >
              <option value="">Not admin</option>
              {adminRoles.map(role => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
            </select>
            <input
              value={user.associationName ?? ''}
              disabled={!canAssign || savingId === user.id || user.role !== 'ADMIN'}
              onChange={e => setUsers(prev => prev.map(item => item.id === user.id ? { ...item, associationName: e.target.value } : item))}
              onBlur={e => updatePosition(user, { associationName: e.target.value })}
              placeholder="e.g. Old Bodija"
              style={{ height: 36, alignSelf: 'center', border: '1px solid var(--line)', borderRadius: 6, padding: '0 9px' }}
            />
          </article>
        ))}
        {!loading && users.length === 0 && <div className="admin-empty"><Users size={25} /><strong>No users found</strong><span>Registered residents and admins will appear here.</span></div>}
      </div>
    </section>
  );
}

function MerchantsPanel({ token }: { token: string }) {
  const [data, setData] = useState<AdminMerchantListResponse>({
    merchants: [],
    counts: { pending: 0, approved: 0, rejected: 0, suspended: 0 },
  });
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'ALL'>('PENDING');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [pendingAction, setPendingAction] = useState<{
    merchant: MerchantProfile;
    status: Exclude<ApprovalStatus, 'PENDING'>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await adminListMerchants(token, statusFilter, query);
      setData(res);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load merchants'); }
    finally { setLoading(false); }
  }, [statusFilter, query, token]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  const requestAction = (merchant: MerchantProfile, status: Exclude<ApprovalStatus, 'PENDING'>) => {
    if (status === 'APPROVED') {
      if (!window.confirm(`Approve ${merchant.businessName}?`)) return;
      void exec(merchant.id, status, '');
    } else {
      setPendingAction({ merchant, status });
    }
  };

  const exec = async (id: string, status: Exclude<ApprovalStatus, 'PENDING'>, reason: string) => {
    setUpdatingId(id); setError('');
    try {
      await adminUpdateMerchantStatus(token, id, status, reason);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update merchant'); }
    finally { setUpdatingId(''); }
  };

  const statusIcon = (s: string) => {
    if (s === 'APPROVED') return <CheckCircle2 size={13} />;
    if (s === 'REJECTED') return <XCircle size={13} />;
    if (s === 'SUSPENDED') return <AlertTriangle size={13} />;
    return <Clock3 size={13} />;
  };

  return (
    <section className="admin-workspace">
      {pendingAction && (
        <ReasonModal
          action={pendingAction.status as 'REJECTED' | 'SUSPENDED'}
          subjectName={pendingAction.merchant.businessName}
          onConfirm={r => { const { merchant, status: s } = pendingAction; setPendingAction(null); void exec(merchant.id, s, r); }}
          onCancel={() => setPendingAction(null)}
        />
      )}
      <div className="admin-toolbar">
        <div className="admin-status-tabs">
          {(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'ALL'] as const).map(s => (
            <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
              {s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}
              {s !== 'ALL' && data.counts[s.toLowerCase() as keyof typeof data.counts] > 0 && (
                <span className="dep-count-badge">{data.counts[s.toLowerCase() as keyof typeof data.counts]}</span>
              )}
            </button>
          ))}
        </div>
        <label className="admin-search">
          <Search size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search business name, category or contact" />
        </label>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-list-head dep-list-head" style={{ gridTemplateColumns: 'minmax(220px,1.6fr) minmax(140px,.8fr) minmax(140px,.8fr) minmax(130px,.6fr)' }}>
        <span>Business</span><span>Category</span><span>Status</span><span>Actions</span>
      </div>
      <div className="admin-list">
        {loading && <div className="admin-empty"><span>Loading merchants…</span></div>}
        {!loading && data.merchants.map(m => (
          <article key={m.id} className="admin-resident-row dep-row" style={{ gridTemplateColumns: 'minmax(220px,1.6fr) minmax(140px,.8fr) minmax(140px,.8fr) minmax(130px,.6fr)' }}>
            <div className="admin-resident-identity">
              <div className="admin-avatar">{m.businessName.split(/\s+/).slice(0, 2).map(p => p[0]).join('')}</div>
              <div>
                <strong>{m.businessName}</strong>
                <span>{m.contactPerson}</span>
                <small>{m.phone}{m.email ? ` · ${m.email}` : ''}</small>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', fontSize: 12 }}>
              <strong>{m.category}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{m.location}</span>
            </div>
            <div className="admin-application">
              <span className={`admin-status ${m.approvalStatus.toLowerCase()} dep-status-inline`}>
                {statusIcon(m.approvalStatus)} {m.approvalStatus}
              </span>
              {m.statusReason && <small className="dep-status-reason">{m.statusReason}</small>}
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>Registered {formatDate(m.createdAt)}</small>
            </div>
            <div className="admin-row-actions">
              {m.approvalStatus !== 'APPROVED' && (
                <button className="approve" disabled={updatingId === m.id} onClick={() => requestAction(m, 'APPROVED')} title="Approve">
                  <Check size={17} /><span>Approve</span>
                </button>
              )}
              {m.approvalStatus !== 'REJECTED' && (
                <button disabled={updatingId === m.id} onClick={() => requestAction(m, 'REJECTED')} title="Reject"><UserX size={17} /></button>
              )}
              {m.approvalStatus === 'APPROVED' && (
                <button disabled={updatingId === m.id} onClick={() => requestAction(m, 'SUSPENDED')} title="Suspend"><Ban size={17} /></button>
              )}
            </div>
          </article>
        ))}
        {!loading && data.merchants.length === 0 && (
          <div className="admin-empty">
            <Store size={25} />
            <strong>No matching merchants</strong>
            <span>Merchant registrations will appear here once submitted.</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Admin offers panel ────────────────────────────────────────────────

const BENEFIT_TYPE_SHORT: Record<string, string> = {
  PERCENTAGE_DISCOUNT: 'Discount %',
  FIXED_RATE:          'Fixed rate',
  FREE_SERVICE:        'Free service',
  LOYALTY_POINTS:      'Loyalty pts',
  MERCHANT_CREDIT:     'Credit',
  VOUCHER:             'Voucher',
};

function AdminOffersPanel({ token }: { token: string }) {
  const [data, setData] = useState<AdminOffersResponse>({
    offers: [], counts: { pending: 0, active: 0, paused: 0 },
  });
  const [statusFilter, setStatusFilter] = useState<OfferStatus | 'ALL'>('PENDING');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [rejectModal, setRejectModal] = useState<AdminOfferItem | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await adminListOffers(token, statusFilter, undefined, query);
      setData(res);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load offers'); }
    finally { setLoading(false); }
  }, [statusFilter, query, token]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);

  const act = async (id: string, action: 'approve' | 'reject' | 'pause', note?: string) => {
    setUpdatingId(id); setError('');
    try {
      await adminUpdateOfferStatus(token, id, action, note);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : `Unable to ${action} offer`); }
    finally { setUpdatingId(''); }
  };

  return (
    <section className="admin-workspace">
      {rejectModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-icon modal-reject"><UserX size={22} /></div>
            <h3>Reject offer: {rejectModal.title}?</h3>
            <p>The merchant will be notified. The offer will be paused.</p>
            <label className="modal-reason-label">
              <span>Reason <em>(optional — visible to merchant)</em></span>
              <textarea rows={3} maxLength={300} value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="e.g. Benefit value exceeds approved limit" />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => { setRejectModal(null); setRejectNote(''); }}>Cancel</button>
              <button className="primary-button modal-reject" onClick={() => {
                const id = rejectModal.id; setRejectModal(null);
                void act(id, 'reject', rejectNote); setRejectNote('');
              }}>Reject offer</button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-toolbar">
        <div className="admin-status-tabs">
          {(['PENDING', 'ACTIVE', 'PAUSED', 'ALL'] as const).map(s => (
            <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
              {s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}
              {s !== 'ALL' && (data.counts as Record<string, number>)[s.toLowerCase()] > 0 && (
                <span className="dep-count-badge">{(data.counts as Record<string, number>)[s.toLowerCase()]}</span>
              )}
            </button>
          ))}
        </div>
        <label className="admin-search">
          <Search size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search offer title or business name" />
        </label>
      </div>

      {error && <div className="admin-alert" role="alert">{error}</div>}

      <div className="admin-list-head dep-list-head" style={{ gridTemplateColumns: 'minmax(200px,1.6fr) minmax(150px,1fr) minmax(120px,.65fr) minmax(130px,.6fr)' }}>
        <span>Offer</span><span>Merchant</span><span>Status</span><span>Actions</span>
      </div>

      <div className="admin-list">
        {loading && <div className="admin-empty"><span>Loading offers…</span></div>}
        {!loading && data.offers.map(offer => (
          <article key={offer.id} className="admin-resident-row dep-row"
            style={{ gridTemplateColumns: 'minmax(200px,1.6fr) minmax(150px,1fr) minmax(120px,.65fr) minmax(130px,.6fr)' }}>
            <div className="admin-resident-identity">
              <div className="admin-avatar" style={{ borderRadius: 6, background: '#e8d6b4', color: '#845f2e', fontSize: 10 }}>
                {BENEFIT_TYPE_SHORT[offer.benefitType] ?? 'Offer'}
              </div>
              <div>
                <strong>{offer.title}</strong>
                <span>{offer.displayValue} · {offer.redemptionModel.toLowerCase()}</span>
                <small>{offer.redemptionRule}</small>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', fontSize: 12 }}>
              <strong>{offer.merchant.businessName}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{offer.merchant.category}</span>
            </div>
            <div className="admin-application">
              <span className={`admin-status ${offer.status.toLowerCase()}`}>{offer.status}</span>
              <small style={{ color: 'var(--muted)', fontSize: 10 }}>
                {offer.validFrom ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(offer.validFrom)) : ''}
                {offer.validUntil ? ` → ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(offer.validUntil))}` : ' → open-ended'}
              </small>
            </div>
            <div className="admin-row-actions">
              {offer.status === 'PENDING' && (
                <>
                  <button className="approve" disabled={updatingId === offer.id} onClick={() => act(offer.id, 'approve')} title="Approve offer">
                    <Check size={17} /><span>Approve</span>
                  </button>
                  <button disabled={updatingId === offer.id} onClick={() => { setRejectModal(offer); setRejectNote(''); }} title="Reject offer">
                    <UserX size={17} />
                  </button>
                </>
              )}
              {offer.status === 'ACTIVE' && (
                <button disabled={updatingId === offer.id} onClick={() => act(offer.id, 'pause')} title="Pause offer">
                  <Ban size={17} />
                </button>
              )}
            </div>
          </article>
        ))}
        {!loading && data.offers.length === 0 && (
          <div className="admin-empty">
            <Store size={25} />
            <strong>No matching offers</strong>
            <span>Offer submissions will appear here once merchants create them.</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Admin login ───────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: (token: string, admin: AdminIdentity) => void }) {
  const [email, setEmail] = useState('gisknigeria@gmail.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await apiRequest<{ accessToken: string; admin: AdminIdentity }>('/api/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: email, password }),
      });
      onLogin(res.accessToken, res.admin);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in'); }
    finally { setLoading(false); }
  };

  return (
    <main className="admin-login-page">
      <section className="admin-login-context">
        <AdminBrand />
        <div>
          <span>Community administration</span>
          <h1>Resident verification and card control.</h1>
          <p>Review applications carefully. Approved cards become valid for community gate verification immediately.</p>
        </div>
        <small>Authorized BERA personnel only</small>
      </section>
      <section className="admin-login-form">
        <form onSubmit={submit}>
          <div className="admin-login-icon"><ShieldCheck size={25} /></div>
          <span>Secure administration</span>
          <h2>Administrator sign in</h2>
          <p>Use your authorized BERA account to continue.</p>
          <label><span>Email address</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
          <label><span>Password</span><input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password" /></label>
          {error && <div className="auth-error" role="alert">{error}</div>}
          <button disabled={loading}>{loading ? 'Signing in...' : 'Sign in to admin'}</button>
          <a href="/">Return to resident portal</a>
        </form>
      </section>
    </main>
  );
}

// ── Admin Walk-in Panel ───────────────────────────────────────────────

const GATES = ['Main Gate', 'Awolowo Avenue Gate', 'Housing Road Gate', 'Market Gate'];

function AdminWalkInPanel({ token }: { token: string }) {
  const [merchants, setMerchants] = useState<MerchantListItem[]>([]);
  const [loadingMerchants, setLoadingMerchants] = useState(true);
  const [merchantError, setMerchantError] = useState('');

  const [form, setForm] = useState({ guestName: '', guestPhone: '', merchantId: '', gate: 'Main Gate', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ guestName: string; destination: string } | null>(null);

  const [recentWalkIns, setRecentWalkIns] = useState<WalkInLog[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Load merchant list from security server
  useEffect(() => {
    setLoadingMerchants(true);
    listMerchantsForWalkIn(token)
      .then(({ merchants: m }) => setMerchants(m))
      .catch(() => setMerchantError('Could not load merchants. Check VITE_SECURITY_API_URL is set.'))
      .finally(() => setLoadingMerchants(false));
  }, [token]);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const securityUrl = ((import.meta as any).env?.VITE_SECURITY_API_URL || '').replace(/\/$/, '');
      const res = await fetch(`${securityUrl}/api/walkin`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setRecentWalkIns((data.walkIns ?? []).slice(0, 20));
      }
    } catch { /* non-critical */ }
    finally { setLoadingRecent(false); }
  }, [token]);

  useEffect(() => { void loadRecent(); }, [loadRecent]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.guestName.trim() || !form.merchantId) { setError('Guest name and destination are required.'); return; }
    setBusy(true); setError(''); setResult(null);
    const merchant = merchants.find(m => m.id === form.merchantId);
    try {
      await logWalkIn(token, {
        guestName: form.guestName.trim(),
        guestPhone: form.guestPhone.trim() || undefined,
        merchantId: form.merchantId,
        merchantName: merchant?.name ?? 'Unknown',
        gate: form.gate,
        notes: form.notes.trim() || undefined,
      });
      setResult({ guestName: form.guestName.trim(), destination: merchant?.name ?? 'Unknown' });
      setForm(f => ({ ...f, guestName: '', guestPhone: '', notes: '' }));
      void loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log walk-in.');
    } finally { setBusy(false); }
  };

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(iso));

  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>Log walk-in guest</h3>
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 0' }}>
          Log a visitor heading to a merchant. The merchant will be notified and must acknowledge before the guest can exit.
        </p>
      </div>

      <div className="admin-walkin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Log form ── */}
        <div className="admin-workspace" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <UserPlus size={18} style={{ color: '#c6974c' }} />
            <strong style={{ fontSize: 14 }}>New walk-in</strong>
          </div>

          {merchantError && <div className="auth-error" style={{ marginBottom: 12 }}>{merchantError}</div>}

          {result && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#166534', fontWeight: 600, fontSize: 13 }}>
                <CheckCircle2 size={16} /> Logged successfully
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#166534' }}>
                {result.guestName} is heading to {result.destination}. Merchant has been notified.
              </p>
            </div>
          )}

          {error && <div className="auth-error" style={{ marginBottom: 12 }}>{error}</div>}

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span>Guest full name <span style={{ color: '#ef4444' }}>*</span></span>
              <div className="auth-input">
                <UserPlus size={16} />
                <input
                  required
                  value={form.guestName}
                  onChange={e => set('guestName', e.target.value)}
                  placeholder="e.g. Ade Balogun"
                  maxLength={120}
                />
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span>Guest phone <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></span>
              <div className="auth-input">
                <Phone size={16} />
                <input
                  value={form.guestPhone}
                  onChange={e => set('guestPhone', e.target.value)}
                  placeholder="0803 000 0000"
                  maxLength={30}
                />
              </div>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span>Destination merchant <span style={{ color: '#ef4444' }}>*</span></span>
              <select
                required
                value={form.merchantId}
                onChange={e => set('merchantId', e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13, background: 'var(--surface)' }}
                disabled={loadingMerchants}
              >
                <option value="">{loadingMerchants ? 'Loading merchants…' : 'Select merchant'}</option>
                {merchants.map(m => (
                  <option key={m.id} value={m.id}>{m.name} — {m.category}</option>
                ))}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span>Gate</span>
              <select
                value={form.gate}
                onChange={e => set('gate', e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13, background: 'var(--surface)' }}
              >
                {GATES.map(g => <option key={g}>{g}</option>)}
              </select>
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span>Notes <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></span>
              <div className="auth-input">
                <MapPin size={16} />
                <input
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Any notes about the visit"
                  maxLength={300}
                />
              </div>
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={busy || loadingMerchants}
              style={{ marginTop: 4 }}
            >
              <UserPlus size={15} />
              {busy ? 'Logging…' : 'Log walk-in & notify merchant'}
            </button>
          </form>
        </div>

        {/* ── Recent walk-ins ── */}
        <div className="admin-workspace">
          <div className="admin-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={15} />
              <strong style={{ fontSize: 13 }}>Active walk-ins</strong>
            </div>
            <button className="secondary-button" style={{ fontSize: 11, minHeight: 28 }} onClick={loadRecent} disabled={loadingRecent}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {loadingRecent && <p style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 16px' }}>Loading…</p>}

          {!loadingRecent && recentWalkIns.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <Bell size={24} style={{ color: 'var(--muted)', margin: '0 auto 8px', display: 'block' }} />
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>No active walk-ins right now.</p>
            </div>
          )}

          {recentWalkIns.map(w => (
            <div key={w.id} style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong>{w.guestName}</strong>
                  {w.guestPhone && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>{w.guestPhone}</span>}
                  <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 0' }}>
                    → {w.merchantName} · {w.gate} · {fmt(w.entryTime)}
                  </p>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 12,
                  background: w.exitTime ? '#f0fdf4' : w.acknowledged ? '#eff6ff' : '#fef2f2',
                  color: w.exitTime ? '#166534' : w.acknowledged ? '#1d4ed8' : '#dc2626',
                }}>
                  {w.exitTime ? 'EXITED' : w.acknowledged ? 'INSIDE' : 'PENDING'}
                </span>
              </div>
              {w.acknowledged && !w.exitTime && w.exitCode && (
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)' }}>
                  Exit code: <strong style={{ fontFamily: 'monospace', letterSpacing: 2, color: '#1a5c3a' }}>{w.exitCode}</strong>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Admin dashboard ───────────────────────────────────────────────────

type AdminSection = 'residents' | 'dependants' | 'positions' | 'renewals' | 'merchants' | 'offers' | 'complaints' | 'transactions' | 'reports' | 'walkins';

function AdminDashboard({ token, admin, logout }: { token: string; admin: AdminIdentity; logout: () => void }) {
  const [section, setSection] = useState<AdminSection>('residents');
  const [data, setData] = useState<ResidentsResponse>({ residents: [], counts: { pending: 0, approved: 0, rejected: 0, suspended: 0 } });

  // Load resident counts for the metrics bar
  const loadCounts = useCallback(async () => {
    try {
      const res = await apiRequest<ResidentsResponse>('/api/admin/residents?status=PENDING', { headers: { Authorization: `Bearer ${token}` } });
      setData(res);
    } catch { /* non-critical */ }
  }, [token]);

  useEffect(() => { void loadCounts(); }, [loadCounts]);

  const metrics = useMemo(() => [
    { label: 'Pending review', value: data.counts.pending, icon: Clock3, tone: 'pending' },
    { label: 'Active residents', value: data.counts.approved, icon: UserCheck, tone: 'approved' },
    { label: 'Rejected', value: data.counts.rejected, icon: UserX, tone: 'rejected' },
    { label: 'Suspended', value: data.counts.suspended, icon: Ban, tone: 'suspended' },
  ], [data.counts]);

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <AdminBrand />
        <div className="admin-account">
          <div><strong>{admin.email}</strong><small>{admin.adminRole ? admin.adminRole.replace(/_/g, ' ') : 'Administrator'}</small></div>
          <button onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="admin-main">
        <section className="admin-title">
          <div>
            <span>BERA administration</span>
            <h1>Applications and card access</h1>
            <p>Review identity details and control which cards are valid at community gates.</p>
          </div>
          <div className="admin-live"><i /> Shared Neon database</div>
        </section>

        <section className="admin-metrics">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <div className="admin-metric" key={label}>
              <span className={tone}><Icon size={19} /></span>
              <div><small>{label}</small><strong>{value}</strong></div>
            </div>
          ))}
        </section>

        {/* Section tab switcher */}
        <div className="admin-section-tabs">
          <button className={section === 'residents' ? 'active' : ''} onClick={() => setSection('residents')}>
            <UserCheck size={16} /> Residents
          </button>
          <button className={section === 'dependants' ? 'active' : ''} onClick={() => setSection('dependants')}>
            <Users size={16} /> Dependants
          </button>
          <button className={section === 'positions' ? 'active' : ''} onClick={() => setSection('positions')}>
            <ShieldCheck size={16} /> Positions
          </button>
          <button className={section === 'renewals' ? 'active' : ''} onClick={() => setSection('renewals')}>
            <Clock3 size={16} /> Renewals
          </button>
          <button className={section === 'merchants' ? 'active' : ''} onClick={() => setSection('merchants')}>
            <Store size={16} /> Merchants
          </button>
          <button className={section === 'offers' ? 'active' : ''} onClick={() => setSection('offers')}>
            <CheckCircle2 size={16} /> Offers
          </button>
          <button className={section === 'complaints' ? 'active' : ''} onClick={() => setSection('complaints')}>
            <MessageSquare size={16} /> Complaints
          </button>
          <button className={section === 'transactions' ? 'active' : ''} onClick={() => setSection('transactions')}>
            <BarChart2 size={16} /> Transactions
          </button>
          <button className={section === 'reports' ? 'active' : ''} onClick={() => setSection('reports')}>
            <BadgeCheck size={16} /> Reports
          </button>
          <button className={section === 'walkins' ? 'active' : ''} onClick={() => setSection('walkins')}>
            <Bell size={16} /> Walk-ins
          </button>
        </div>

        {section === 'residents'    && <ResidentsPanel token={token} />}
        {section === 'dependants'   && <DependantsPanel token={token} />}
        {section === 'positions'    && <PositionsPanel token={token} admin={admin} />}
        {section === 'renewals'     && <RenewalsPanel token={token} />}
        {section === 'merchants'    && <MerchantsPanel token={token} />}
        {section === 'offers'       && <AdminOffersPanel token={token} />}
        {section === 'complaints'   && <ComplaintsPanel token={token} />}
        {section === 'transactions' && <TransactionAuditPanel token={token} />}
        {section === 'reports'      && <AdminReportsPanel token={token} />}
        {section === 'walkins'      && <AdminWalkInPanel token={token} />}
      </main>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────

export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) || '');
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [checking, setChecking] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;
    apiRequest<{ admin: AdminIdentity }>('/api/auth/admin/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setAdmin(res.admin))
      .catch(() => { localStorage.removeItem(ADMIN_TOKEN_KEY); setToken(''); })
      .finally(() => setChecking(false));
  }, [token]);

  const login = (nextToken: string, identity: AdminIdentity) => {
    localStorage.setItem(ADMIN_TOKEN_KEY, nextToken);
    setToken(nextToken); setAdmin(identity); setChecking(false);
  };

  const logout = () => { localStorage.removeItem(ADMIN_TOKEN_KEY); setToken(''); setAdmin(null); };

  if (checking) return <div className="session-loading"><BadgeCheck size={24} /><span>Checking administrator session...</span></div>;
  return token && admin ? <AdminDashboard token={token} admin={admin} logout={logout} /> : <AdminLogin onLogin={login} />;
}
