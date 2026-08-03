/**
 * Extra admin panels: Resident Detail, Complaints, Transaction Audit, Reports.
 * Imported and rendered from AdminApp.tsx.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, BarChart2, Ban, Check, CheckCircle2,
  ChevronLeft, ChevronRight, Clock3, MessageSquare,
  Search, UserX, XCircle,
} from 'lucide-react';
import {
  getAdminResidentDetail,
  adminListComplaints,
  adminUpdateComplaint,
  adminListTransactions,
  adminAuditTransaction,
  getAdminReports,
  type AdminResidentDetail,
  type AdminComplaint,
  type AdminComplaintsResponse,
  type AdminTransactionsResponse,
  type AdminTransactionItem,
  type AdminReport,
  type ApprovalStatus,
  type ComplaintStatus,
} from './api';

// ── Shared: pagination bar ─────────────────────────────────────────────
export function PagerBar({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)' }}>
      <span>{total} total · page {page} of {totalPages}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="secondary-button" style={{ minHeight: 30, padding: '0 10px', fontSize: 11 }} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} />
        </button>
        <button className="secondary-button" style={{ minHeight: 30, padding: '0 10px', fontSize: 11 }} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Resident detail modal ─────────────────────────────────────────────
export function ResidentDetailModal({ token, residentId, onClose }: { token: string; residentId: string; onClose: () => void }) {
  const [resident, setResident] = useState<AdminResidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'card' | 'transactions' | 'renewals' | 'complaints'>('overview');

  useEffect(() => {
    getAdminResidentDetail(token, residentId)
      .then(({ resident: r }) => setResident(r))
      .finally(() => setLoading(false));
  }, [token, residentId]);

  const fmtDate = (v: string | null | undefined) => v ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(v)) : '—';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" style={{ alignItems: 'flex-start', paddingTop: 40 }}>
      <div className="modal-card" style={{ maxWidth: 700, width: '100%', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>{loading ? <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : resident?.fullName}</h3>
          <button className="secondary-button" style={{ minHeight: 30, fontSize: 12 }} onClick={onClose}>Close</button>
        </div>
        {resident && (
          <>
            <div className="admin-section-tabs" style={{ margin: '8px 0' }}>
              {(['overview','card','transactions','renewals','complaints'] as const).map(t => (
                <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} style={{ fontSize: 12 }}>{t[0].toUpperCase() + t.slice(1)}</button>
              ))}
            </div>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
              {tab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {[
                    ['Phone', resident.user.phone], ['Email', resident.user.email ?? '—'],
                    ['Neighbourhood', resident.neighbourhood], ['Category', resident.memberCategory],
                    ['Status', resident.approvalStatus], ['Reason', resident.statusReason ?? '—'],
                    ['Consented', fmtDate(resident.consentedAt)], ['Registered', fmtDate(resident.createdAt)],
                    ['Dependants', String(resident.dependants.length)],
                  ].map(([l, v]) => (
                    <div key={l}><p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 2px' }}>{l}</p><p style={{ fontSize: 13, margin: 0 }}>{v}</p></div>
                  ))}
                </div>
              )}
              {tab === 'card' && resident.card && (
                <div>
                  <p style={{ fontSize: 13 }}><strong>{resident.card.membershipId}</strong> · {resident.card.status} · expires {fmtDate(resident.card.expiresAt)}</p>
                  <h4 style={{ fontSize: 13, margin: '12px 0 6px' }}>Card history ({resident.card.history.length})</h4>
                  {resident.card.history.map(h => (
                    <div key={h.id} style={{ fontSize: 11, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                      <strong>{h.status}</strong> · issued {fmtDate(h.issuedAt)} → {fmtDate(h.expiresAt)}
                      {h.note && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>— {h.note}</span>}
                    </div>
                  ))}
                  <h4 style={{ fontSize: 13, margin: '12px 0 6px' }}>Recent scans ({resident.card.scans.length})</h4>
                  {resident.card.scans.map(s => (
                    <div key={s.id} style={{ fontSize: 11, padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                      <span className={s.result.startsWith('ALLOWED') ? 'admin-status approved' : 'admin-status rejected'} style={{ fontSize: 10, padding: '2px 6px' }}>{s.result}</span>
                      <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{fmtDate(s.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'transactions' && (
                <div>
                  {resident.transactions.map(t => (
                    <div key={t.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                      <strong>{t.merchant.businessName}</strong> · {t.offer?.title ?? 'No offer'} · <span style={{ color: '#8a6029' }}>NGN {t.benefitValue}</span>
                      {t.purchaseAmount && <span style={{ color: 'var(--muted)' }}> on {t.purchaseAmount}</span>}
                      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>· {fmtDate(t.createdAt)}</span>
                      <span className={`admin-status ${t.auditStatus.toLowerCase()}`} style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px' }}>{t.auditStatus}</span>
                    </div>
                  ))}
                  {resident.transactions.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No transactions recorded.</p>}
                </div>
              )}
              {tab === 'renewals' && (
                <div>
                  {resident.renewals.map(r => (
                    <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                      <span className={`admin-status ${r.status.toLowerCase()}`} style={{ fontSize: 10, padding: '2px 6px' }}>{r.status}</span>
                      <span style={{ color: 'var(--muted)', marginLeft: 8 }}>Requested {fmtDate(r.requestedAt)}</span>
                      {r.processedAt && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>· Processed {fmtDate(r.processedAt)}</span>}
                      {r.reason && <p style={{ margin: '3px 0 0', color: '#7a5718', fontSize: 11 }}>{r.reason}</p>}
                    </div>
                  ))}
                  {resident.renewals.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No renewal requests.</p>}
                </div>
              )}
              {tab === 'complaints' && (
                <div>
                  {resident.complaints.map(c => (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 12 }}>
                      <strong>{c.subject}</strong>
                      <span className={`admin-status ${c.status.toLowerCase()}`} style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px' }}>{c.status}</span>
                      <span style={{ color: 'var(--muted)', marginLeft: 6 }}>· {fmtDate(c.createdAt)}</span>
                      {c.adminNote && <p style={{ margin: '3px 0 0', color: 'var(--muted)', fontSize: 11 }}>Note: {c.adminNote}</p>}
                    </div>
                  ))}
                  {resident.complaints.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No complaints.</p>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Complaints panel ──────────────────────────────────────────────────
export function ComplaintsPanel({ token }: { token: string }) {
  const [data, setData] = useState<AdminComplaintsResponse>({ complaints: [], total: 0, page: 1, pageSize: 25, counts: { open: 0, investigating: 0, resolved: 0, closed: 0 } });
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'ALL'>('OPEN');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AdminComplaint | null>(null);
  const [editForm, setEditForm] = useState({ status: 'OPEN' as ComplaintStatus, adminNote: '', assignedTo: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await adminListComplaints(token, statusFilter, query, page);
      setData(res);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load complaints'); }
    finally { setLoading(false); }
  }, [statusFilter, query, page, token]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);
  useEffect(() => setPage(1), [statusFilter, query]);

  const openEdit = (c: AdminComplaint) => { setEditing(c); setEditForm({ status: c.status, adminNote: c.adminNote ?? '', assignedTo: c.assignedTo ?? '' }); };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await adminUpdateComplaint(token, editing.id, editForm);
      setEditing(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update complaint'); }
    finally { setSaving(false); }
  };

  const statusTone = (s: string) => ({ OPEN: 'pending', INVESTIGATING: 'pending', RESOLVED: 'approved', CLOSED: 'approved' }[s] ?? 'pending');
  const statusIcon = (s: string) => ({ OPEN: <MessageSquare size={13} />, INVESTIGATING: <Clock3 size={13} />, RESOLVED: <CheckCircle2 size={13} />, CLOSED: <Ban size={13} /> }[s] ?? <Clock3 size={13} />);

  return (
    <section className="admin-workspace">
      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-icon" style={{ background: '#e2eaf4', color: '#355e8c' }}><MessageSquare size={22} /></div>
            <h3>Update complaint</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -8 }}>{editing.subject} · {editing.resident.fullName}</p>
            <label className="modal-reason-label">
              <span>Status</span>
              <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as ComplaintStatus }))}
                style={{ width: '100%', height: 42, padding: '0 10px', border: '1px solid #cad4da', borderRadius: 6, font: 'inherit', fontSize: 13 }}>
                {(['OPEN','INVESTIGATING','RESOLVED','CLOSED'] as ComplaintStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="modal-reason-label" style={{ marginTop: 10 }}>
              <span>Assigned to <em>(optional)</em></span>
              <input value={editForm.assignedTo} onChange={e => setEditForm(f => ({ ...f, assignedTo: e.target.value }))} style={{ width: '100%', height: 40, padding: '0 10px', border: '1px solid #cad4da', borderRadius: 6, font: 'inherit', fontSize: 13 }} placeholder="Admin name or ID" />
            </label>
            <label className="modal-reason-label" style={{ marginTop: 10 }}>
              <span>Admin note <em>(optional — visible in resident view)</em></span>
              <textarea rows={3} maxLength={500} value={editForm.adminNote} onChange={e => setEditForm(f => ({ ...f, adminNote: e.target.value }))} placeholder="Resolution notes or action taken" />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary-button" disabled={saving} onClick={save}>{saving ? <div className="loading-spinner" /> : 'Update'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="admin-toolbar">
        <div className="admin-status-tabs">
          {(['OPEN','INVESTIGATING','RESOLVED','CLOSED','ALL'] as const).map(s => (
            <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}>
              {s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}
              {s !== 'ALL' && (data.counts as Record<string, number>)[s.toLowerCase()] > 0 && (
                <span className="dep-count-badge">{(data.counts as Record<string, number>)[s.toLowerCase()]}</span>
              )}
            </button>
          ))}
        </div>
        <label className="admin-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search subject or resident name" /></label>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-list-head dep-list-head" style={{ gridTemplateColumns: 'minmax(220px,1.8fr) minmax(150px,1fr) minmax(120px,.6fr) minmax(100px,.5fr)' }}>
        <span>Complaint</span><span>Resident</span><span>Status</span><span>Actions</span>
      </div>
      <div className="admin-list">
        {loading && <div className="admin-empty"><div className="loading-spinner" /></div>}
        {!loading && data.complaints.map(c => (
          <article key={c.id} className="admin-resident-row dep-row" style={{ gridTemplateColumns: 'minmax(220px,1.8fr) minmax(150px,1fr) minmax(120px,.6fr) minmax(100px,.5fr)' }}>
            <div className="admin-resident-identity">
              <div className="admin-avatar" style={{ background: '#e2eaf4', color: '#355e8c', fontSize: 11 }}><MessageSquare size={16} /></div>
              <div>
                <strong>{c.subject}</strong>
                {c.merchant && <span style={{ color: 'var(--muted)', fontSize: 11 }}>{c.merchant.businessName}</span>}
                <small>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(c.createdAt))}</small>
              </div>
            </div>
            <div className="dep-primary-col">
              <strong>{c.resident.fullName}</strong>
              <span>{c.resident.neighbourhood}</span>
              <small>{c.resident.card?.membershipId ?? 'No card'}</small>
            </div>
            <div className="admin-application">
              <span className={`admin-status ${statusTone(c.status)} dep-status-inline`}>{statusIcon(c.status)} {c.status}</span>
              {c.assignedTo && <small className="dep-status-reason">Assigned: {c.assignedTo}</small>}
            </div>
            <div className="admin-row-actions">
              <button className="approve" onClick={() => openEdit(c)} title="Update complaint"><Check size={17} /><span>Update</span></button>
            </div>
          </article>
        ))}
        {!loading && data.complaints.length === 0 && <div className="admin-empty"><MessageSquare size={25} /><strong>No matching complaints</strong><span>Resident complaints will appear here.</span></div>}
      </div>
      <PagerBar page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
    </section>
  );
}

// ── Transaction audit panel ───────────────────────────────────────────
export function TransactionAuditPanel({ token }: { token: string }) {
  const [data, setData] = useState<AdminTransactionsResponse>({ transactions: [], total: 0, page: 1, pageSize: 25 });
  const [auditFilter, setAuditFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AdminTransactionItem | null>(null);
  const [editForm, setEditForm] = useState({ auditStatus: 'PENDING', auditFlag: '', auditNote: '' });
  const [saving, setSaving] = useState(false);

  const AUDIT_STATUSES = ['ALL', 'PENDING', 'REVIEWED', 'FLAGGED', 'INVESTIGATING', 'APPROVED', 'REVERSED'];

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await adminListTransactions(token, auditFilter === 'ALL' ? undefined : auditFilter, query, page);
      setData(res);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load transactions'); }
    finally { setLoading(false); }
  }, [auditFilter, query, page, token]);

  useEffect(() => { const t = window.setTimeout(load, 250); return () => window.clearTimeout(t); }, [load]);
  useEffect(() => setPage(1), [auditFilter, query]);

  const openEdit = (t: AdminTransactionItem) => {
    setEditing(t); setEditForm({ auditStatus: t.auditStatus, auditFlag: t.auditFlag ?? '', auditNote: t.auditNote ?? '' });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await adminAuditTransaction(token, editing.id, editForm);
      setEditing(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to update transaction'); }
    finally { setSaving(false); }
  };

  const fmtDate = (v: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v));

  return (
    <section className="admin-workspace">
      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-icon" style={{ background: '#f5e7c4', color: '#8b6520' }}><BarChart2 size={22} /></div>
            <h3>Audit transaction</h3>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -8 }}>
              {editing.resident.fullName} · {editing.merchant.businessName} · NGN {editing.benefitValue}
            </p>
            <label className="modal-reason-label">
              <span>Audit status</span>
              <select value={editForm.auditStatus} onChange={e => setEditForm(f => ({ ...f, auditStatus: e.target.value }))}
                style={{ width: '100%', height: 42, padding: '0 10px', border: '1px solid #cad4da', borderRadius: 6, font: 'inherit', fontSize: 13 }}>
                {['PENDING','REVIEWED','FLAGGED','INVESTIGATING','APPROVED','REVERSED'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="modal-reason-label" style={{ marginTop: 10 }}>
              <span>Flag category <em>(optional)</em></span>
              <input value={editForm.auditFlag} onChange={e => setEditForm(f => ({ ...f, auditFlag: e.target.value }))}
                style={{ width: '100%', height: 40, padding: '0 10px', border: '1px solid #cad4da', borderRadius: 6, font: 'inherit', fontSize: 13 }}
                placeholder="e.g. SUSPECTED_FRAUD, DUPLICATE" />
            </label>
            <label className="modal-reason-label" style={{ marginTop: 10 }}>
              <span>Audit note <em>(optional)</em></span>
              <textarea rows={3} maxLength={500} value={editForm.auditNote} onChange={e => setEditForm(f => ({ ...f, auditNote: e.target.value }))} placeholder="Investigation notes" />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary-button" disabled={saving} onClick={save}>{saving ? <div className="loading-spinner" /> : 'Update audit'}</button>
            </div>
          </div>
        </div>
      )}
      <div className="admin-toolbar">
        <div className="admin-status-tabs">
          {AUDIT_STATUSES.map(s => (
            <button key={s} className={auditFilter === s ? 'active' : ''} onClick={() => setAuditFilter(s)}
              style={{ fontSize: 10 }}>
              {s === 'ALL' ? 'All' : s[0] + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <label className="admin-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search resident or merchant" /></label>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-list-head dep-list-head" style={{ gridTemplateColumns: 'minmax(200px,1.5fr) minmax(160px,1fr) minmax(120px,.7fr) minmax(100px,.5fr)' }}>
        <span>Transaction</span><span>Resident · Merchant</span><span>Audit status</span><span>Actions</span>
      </div>
      <div className="admin-list">
        {loading && <div className="admin-empty"><div className="loading-spinner" /></div>}
        {!loading && data.transactions.map(t => (
          <article key={t.id} className="admin-resident-row dep-row" style={{ gridTemplateColumns: 'minmax(200px,1.5fr) minmax(160px,1fr) minmax(120px,.7fr) minmax(100px,.5fr)' }}>
            <div className="admin-resident-identity">
              <div className="admin-avatar" style={{ background: '#f5e7c4', color: '#8b6520', fontSize: 10 }}>NGN</div>
              <div>
                <strong style={{ color: '#8a6029' }}>NGN {t.benefitValue}</strong>
                {t.purchaseAmount && <span style={{ color: 'var(--muted)', fontSize: 11 }}> on {t.purchaseAmount}</span>}
                <span style={{ color: 'var(--muted)', fontSize: 11, display: 'block' }}>{t.offer?.title ?? 'No offer'} · {t.redemptionModel.toLowerCase()}</span>
                <small>{fmtDate(t.createdAt)}{t.reversedAt ? ' · REVERSED' : ''}</small>
              </div>
            </div>
            <div className="dep-primary-col">
              <strong>{t.resident.fullName}</strong>
              <span>{t.merchant.businessName}</span>
              <small>{t.resident.card?.membershipId ?? ''} · {t.loggedBy.phone}</small>
            </div>
            <div className="admin-application">
              <span className={`admin-status ${t.auditStatus === 'APPROVED' ? 'approved' : t.auditStatus === 'FLAGGED' || t.auditStatus === 'INVESTIGATING' ? 'suspended' : 'pending'} dep-status-inline`}>
                {t.auditStatus}
              </span>
              {t.auditFlag && <small className="dep-status-reason">{t.auditFlag}</small>}
            </div>
            <div className="admin-row-actions">
              <button className="approve" onClick={() => openEdit(t)} title="Audit"><Check size={17} /><span>Audit</span></button>
            </div>
          </article>
        ))}
        {!loading && data.transactions.length === 0 && <div className="admin-empty"><BarChart2 size={25} /><strong>No matching transactions</strong><span>Transaction logs will appear here.</span></div>}
      </div>
      <PagerBar page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} />
    </section>
  );
}

// ── Reports panel ─────────────────────────────────────────────────────
export function AdminReportsPanel({ token }: { token: string }) {
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminReports(token)
      .then(r => setReport(r))
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load reports'))
      .finally(() => setLoading(false));
  }, [token]);

  const fmtNgn = (v: string) => `NGN ${Number(v).toLocaleString('en-NG')}`;

  if (loading) return <div className="admin-empty" style={{ minHeight: 200 }}><div className="loading-spinner" /></div>;
  if (error) return <div className="admin-alert" role="alert">{error}</div>;
  if (!report) return null;

  const sections = [
    {
      title: 'Residents',
      metrics: [
        { label: 'Total', value: report.residents.total },
        { label: 'Active', value: report.residents.approved },
        { label: 'Pending', value: report.residents.pending },
        { label: 'Rejected', value: report.residents.rejected },
        { label: 'Suspended', value: report.residents.suspended },
      ],
    },
    {
      title: 'Merchants & Offers',
      metrics: [
        { label: 'Merchants', value: report.merchants.total },
        { label: 'Approved', value: report.merchants.approved },
        { label: 'Pending', value: report.merchants.pending },
        { label: 'Total offers', value: report.offers.total },
        { label: 'Active offers', value: report.offers.active },
        { label: 'Offers pending', value: report.offers.pending },
      ],
    },
    {
      title: 'Activity',
      metrics: [
        { label: 'Transactions', value: report.transactions.total },
        { label: 'This month', value: report.transactions.thisMonth },
        { label: 'Renewals', value: report.renewals.total },
        { label: 'Renewals pending', value: report.renewals.pending },
        { label: 'Complaints', value: report.complaints.total },
        { label: 'Open complaints', value: report.complaints.open },
      ],
    },
    {
      title: 'Rewards & Scans',
      metrics: [
        { label: 'Reward liability', value: fmtNgn(report.rewards.totalLiability) },
        { label: 'Total scans', value: report.scans.total },
        { label: 'Denied scans', value: report.scans.denied },
      ],
    },
  ];

  return (
    <section style={{ marginTop: 8 }}>
      {sections.map(sec => (
        <div key={sec.title} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, marginBottom: 10, color: '#2a4454' }}>{sec.title}</h3>
          <div className="admin-metrics" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
            {sec.metrics.map(({ label, value }) => (
              <div key={label} className="admin-metric">
                <span className="pending"><BarChart2 size={17} /></span>
                <div>
                  <small>{label}</small>
                  <strong style={{ fontSize: 16, fontFamily: 'Manrope, Arial, sans-serif' }}>{value}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 16 }}>
        Reports reflect current database totals. Refresh the page for updated figures.
      </p>
    </section>
  );
}

// ── BERA Gate Events panel (read-only SIGAR view) ────────────────────
export function GateEventsPanel({ token }: { token: string }) {
  const [events, setEvents] = useState<{
    id: string; membershipId: string; residentName: string;
    direction: string; gate: string; decision: string;
    reason: string; scannedAt: string;
  }[]>([]);
  const [total, setTotal]   = useState(0);
  const [page,  setPage]    = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filterGate,     setFilterGate]     = useState('');
  const [filterDecision, setFilterDecision] = useState('');
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const PAGE_SIZE = 25;

  const sigarUrl = (import.meta.env.VITE_SIGAR_URL || '').replace(/\/$/, '');

  const load = useCallback(async (pg: number) => {
    setLoading(true); setError('');
    try {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pg * PAGE_SIZE) });
      if (filterGate)     p.set('gate',     filterGate);
      if (filterDecision) p.set('decision', filterDecision);
      if (from) p.set('from', from);
      if (to)   p.set('to',   to);
      const res = await fetch(`${sigarUrl}/api/bera/gate-events?${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`SIGAR returned ${res.status}`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
      setPage(pg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load gate events. Check VITE_SIGAR_URL is configured.');
    } finally { setLoading(false); }
  }, [token, filterGate, filterDecision, from, to, sigarUrl]);

  useEffect(() => { void load(0); }, [load]);

  const decTone = (d: string) => {
    if (d === 'ALLOWED') return 'approved';
    if (d === 'OVERRIDE_ALLOWED') return 'pending';
    return 'rejected';
  };

  const fmtDate = (v: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(v));

  return (
    <section className="admin-workspace">
      <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
        <strong style={{ fontSize: 13 }}>Gate access events (SIGAR read-only)</strong>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <select value={filterGate} onChange={e => setFilterGate(e.target.value)} style={{ height: 34, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 5, font: 'inherit', fontSize: 11 }}>
            <option value="">All gates</option>
            {['Main Gate','Awolowo Avenue Gate','Housing Road Gate','Market Gate'].map(g => <option key={g}>{g}</option>)}
          </select>
          <select value={filterDecision} onChange={e => setFilterDecision(e.target.value)} style={{ height: 34, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 5, font: 'inherit', fontSize: 11 }}>
            <option value="">All decisions</option>
            <option value="ALLOWED">Allowed</option>
            <option value="OVERRIDE_ALLOWED">Override allowed</option>
            <option value="DENIED">Denied</option>
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ height: 34, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 5, font: 'inherit', fontSize: 11 }} />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ height: 34, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 5, font: 'inherit', fontSize: 11 }} />
          <button className="secondary-button" style={{ minHeight: 34, fontSize: 11 }} onClick={() => void load(0)}>Apply</button>
          <button className="secondary-button" style={{ minHeight: 34, fontSize: 11 }} onClick={() => { setFilterGate(''); setFilterDecision(''); setFrom(''); setTo(''); }}>Clear</button>
        </div>
      </div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      <div className="admin-list-head dep-list-head" style={{ gridTemplateColumns: 'minmax(160px,1.2fr) minmax(140px,1fr) minmax(100px,.6fr) minmax(100px,.5fr)' }}>
        <span>Resident</span><span>Gate · Direction</span><span>Decision</span><span>Time</span>
      </div>
      <div className="admin-list">
        {loading && <div className="admin-empty"><div className="loading-spinner" /></div>}
        {!loading && events.map(e => (
          <article key={e.id} className="admin-resident-row dep-row" style={{ gridTemplateColumns: 'minmax(160px,1.2fr) minmax(140px,1fr) minmax(100px,.6fr) minmax(100px,.5fr)' }}>
            <div className="dep-primary-col">
              <strong>{e.residentName || '—'}</strong>
              <small>{e.membershipId}</small>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center', fontSize: 12 }}>
              <strong>{e.gate}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{e.direction}</span>
            </div>
            <div className="admin-application">
              <span className={`admin-status ${decTone(e.decision)} dep-status-inline`}>{e.decision === 'OVERRIDE_ALLOWED' ? 'OVERRIDE' : e.decision}</span>
              {e.reason && <small className="dep-status-reason">{e.reason}</small>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>{fmtDate(e.scannedAt)}</div>
          </article>
        ))}
        {!loading && events.length === 0 && <div className="admin-empty"><span>No gate events found.</span></div>}
      </div>
      <PagerBar page={page} total={total} pageSize={PAGE_SIZE} onPage={load} />
    </section>
  );
}
