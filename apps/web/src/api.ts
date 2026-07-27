export type CardStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'PENDING_VERIFICATION';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export interface ResidentProfile {
  id: string;
  fullName: string;
  neighbourhood: string;
  memberCategory: string;
  approvalStatus: ApprovalStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  consentedAt: string;
  createdAt: string;
  isProfileComplete: boolean;
  user: {
    phone: string;
    email: string | null;
  };
  card: {
    membershipId: string;
    qrToken: string;
    status: CardStatus;
    issuedAt: string | null;
    expiresAt: string | null;
  } | null;
}

export interface AuthSession {
  accessToken: string;
  resident: ResidentProfile;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

export interface RenewalRecord {
  id: string;
  residentId: string;
  status: ApprovalStatus;
  reason: string | null;
  note: string | null;
  processedBy: string | null;
  requestedAt: string;
  processedAt: string | null;
}

export interface CardHistoryEntry {
  id: string;
  membershipId: string;
  status: CardStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  renewalId: string | null;
  note: string | null;
  createdAt: string;
}

export interface ResidentRenewalsResponse {
  card: ResidentProfile['card'];
  renewals: RenewalRecord[];
  cardHistory: CardHistoryEntry[];
  hasPendingRenewal: boolean;
  daysUntilExpiry: number | null;
  approvalStatus: ApprovalStatus;
}

export interface ResidentDashboardOffer {
  id: string;
  merchant: string;
  initials: string;
  category: string;
  value: string;
  model: 'Immediate' | 'Accumulated';
  rule: string;
  location: string;
  validUntil: string | null;
  tone: string;
}

export interface ResidentDashboardActivity {
  id: string;
  merchant: string;
  category: string;
  amount: number | null;
  saved: number;
  kind: string;
  createdAt: string;
}

export interface ResidentRewardBalance {
  merchant: string;
  category: string;
  balance: number;
  updatedAt: string;
}

export interface ResidentDashboardResponse {
  resident: ResidentProfile;
  metrics: {
    savedThisMonth: number;
    rewardBalance: number;
    availableOffers: number;
    categories: number;
  };
  recentActivity: ResidentDashboardActivity[];
  offers: ResidentDashboardOffer[];
  rewardBalances: ResidentRewardBalance[];
  complaintsCount: number;
  totalSaved: number;
}

export interface ComplaintRecord {
  id: string;
  residentId: string;
  merchantId: string | null;
  subject: string;
  description: string;
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export interface ComplaintsResponse {
  complaints: ComplaintRecord[];
}

export interface AdminRenewal {
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
    card: {
      membershipId: string;
      status: CardStatus;
      issuedAt: string | null;
      expiresAt: string | null;
    } | null;
  };
}

export interface AdminRenewalsResponse {
  renewals: AdminRenewal[];
  counts: { pending: number; approved: number; rejected: number };
}

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join('. ')
      : data?.message || 'Something went wrong. Please try again.';
    throw new Error(message);
  }

  return data as T;
}

export function registerResident(input: {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  neighbourhood: string;
  memberCategory: string;
  consent: boolean;
}) {
  return apiRequest<AuthSession>('/api/auth/resident/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function loginResident(identifier: string, password: string) {
  return apiRequest<AuthSession>('/api/auth/resident/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export function loginAdmin(identifier: string, password: string) {
  return apiRequest<{
    accessToken: string;
    admin: {
      id: string;
      email: string | null;
      role: 'ADMIN';
      adminRole: AdminRole | null;
      associationName: string | null;
    };
  }>('/api/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export function getResident(token: string) {
  return apiRequest<{ resident: ResidentProfile }>('/api/auth/resident/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function updateResidentProfile(token: string, input: {
  fullName?: string;
  phone?: string;
  email?: string;
  neighbourhood?: string;
  memberCategory?: string;
}) {
  return apiRequest<{ resident: ResidentProfile; requiresReApproval?: boolean }>('/api/auth/resident/me', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      ...input,
      email: input.email?.trim() ? input.email.trim().toLowerCase() : undefined,
      phone: input.phone?.trim() || undefined,
      fullName: input.fullName?.trim() || undefined,
      neighbourhood: input.neighbourhood?.trim() || undefined,
      memberCategory: input.memberCategory?.trim() || undefined,
    }),
  });
}

export function getResidentDashboard(token: string) {
  return apiRequest<ResidentDashboardResponse>('/api/auth/resident/dashboard', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function listOffers(token: string, category?: string, benefitType?: string) {
  const params = new URLSearchParams();
  if (category?.trim()) params.set('category', category.trim());
  if (benefitType?.trim()) params.set('benefitType', benefitType.trim());
  return apiRequest<ResidentDashboardOffer[]>(`/api/merchants/offers${params.toString() ? `?${params}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function listCategories(token: string) {
  return apiRequest<string[]>('/api/merchants/categories', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getComplaints(token: string) {
  return apiRequest<ComplaintsResponse>('/api/auth/resident/complaints', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createComplaint(token: string, input: { subject: string; description: string; merchantId?: string }) {
  return apiRequest<{ complaint: ComplaintRecord }>('/api/auth/resident/complaints', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function getNotifications(token: string) {
  return apiRequest<NotificationsResponse>('/api/auth/resident/notifications', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function markNotificationRead(token: string, id: string) {
  return apiRequest<{ success: boolean }>(`/api/auth/resident/notifications/${id}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<{ success: boolean }>('/api/auth/resident/notifications/read-all', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Renewals ────────────────────────────────────────────────────────

export function getMyRenewals(token: string) {
  return apiRequest<ResidentRenewalsResponse>('/api/renewals', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function requestRenewal(token: string, note?: string) {
  return apiRequest<{ renewal: RenewalRecord }>('/api/renewals', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
}

// ── Visitor passes ────────────────────────────────────────────────────────

export interface VisitorPass {
  id: string;
  code: string;
  label: string | null;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface VisitorPassesResponse {
  passes: VisitorPass[];
}

export function getMyVisitorPasses(token: string) {
  return apiRequest<VisitorPassesResponse>('/api/auth/resident/visitor-passes', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createVisitorPass(token: string, label?: string) {
  return apiRequest<{ pass: VisitorPass }>('/api/auth/resident/visitor-passes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ label: label?.trim() || undefined }),
  });
}

export function deleteVisitorPass(token: string, id: string) {
  return apiRequest<{ success: boolean }>(`/api/auth/resident/visitor-passes/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Walk-in guest log (merchant side) ─────────────────────────────────────
// These hit the SECURITY server, not the NestJS API

export interface WalkInLog {
  id: string;
  guestName: string;
  guestPhone: string | null;
  merchantId: string;
  merchantName: string;
  gate: string;
  loggedBy: string;
  entryTime: string;
  exitTime: string | null;
  exitCode: string | null;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  notes: string | null;
}

const SECURITY_URL = (typeof import.meta !== 'undefined'
  ? (import.meta as any).env?.VITE_SECURITY_API_URL
  : '') || '';
const securityBase = SECURITY_URL.replace(/\/$/, '');

async function securityRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${securityBase}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).message || `Request failed (${res.status})`);
  return data as T;
}

export function getMerchantWalkIns(token: string, merchantId: string) {
  return securityRequest<{ walkIns: WalkInLog[] }>(
    `/api/walkin?merchantId=${encodeURIComponent(merchantId)}`,
    token,
  );
}

export function acknowledgeWalkIn(token: string, walkInId: string) {
  return securityRequest<{ walkIn: WalkInLog }>(
    `/api/walkin/${walkInId}/acknowledge`,
    token,
    { method: 'POST' },
  );
}

export interface MerchantListItem {
  id: string;
  name: string;
  category: string;
  location: string;
}

export function listMerchantsForWalkIn(token: string) {
  return securityRequest<{ merchants: MerchantListItem[] }>('/api/merchants/list', token);
}

export function logWalkIn(
  token: string,
  input: { guestName: string; guestPhone?: string; merchantId: string; merchantName: string; gate: string; notes?: string },
) {
  return securityRequest<{ walkIn: WalkInLog }>('/api/walkin', token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listRenewals(token: string, status?: ApprovalStatus | 'ALL', query?: string) {
  const params = new URLSearchParams();
  if (status && status !== 'ALL') params.set('status', status);
  if (query?.trim()) params.set('query', query.trim());
  return apiRequest<AdminRenewalsResponse>(`/api/admin/renewals${params.toString() ? `?${params}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function processRenewal(token: string, id: string, status: ApprovalStatus, reason?: string) {
  return apiRequest<{ renewal: RenewalRecord; newExpiresAt: string | null }>('/api/admin/renewals/' + id, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, reason: reason?.trim() || undefined }),
  });
}

// ── Dependants ────────────────────────────────────────────────────────

export interface Dependant {
  id: string;
  residentId: string;
  fullName: string;
  relationship: string;
  phone: string | null;
  approvalStatus: ApprovalStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DependantsResponse {
  dependants: Dependant[];
  /** approval status of the primary resident card */
  primaryStatus: ApprovalStatus;
}

export function getDependants(token: string) {
  return apiRequest<DependantsResponse>('/api/dependants', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createDependant(
  token: string,
  input: { fullName: string; relationship: string; phone?: string },
) {
  return apiRequest<{ dependant: Dependant }>('/api/dependants', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function updateDependant(
  token: string,
  id: string,
  input: { fullName?: string; relationship?: string; phone?: string },
) {
  return apiRequest<{ dependant: Dependant }>(`/api/dependants/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function removeDependant(token: string, id: string) {
  return apiRequest<{ success: boolean }>(`/api/dependants/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Merchant auth ────────────────────────────────────────────────────

export type MerchantUserRole = 'OWNER' | 'STAFF';

export interface MerchantProfile {
  id: string;
  businessName: string;
  category: string;
  contactPerson: string;
  phone: string;
  email: string | null;
  location: string;
  approvalStatus: ApprovalStatus;
  statusReason: string | null;
  statusChangedAt: string | null;
  createdAt: string;
}

export interface MerchantUserProfile {
  id: string;
  role: MerchantUserRole;
  isActive: boolean;
  user: { id: string; phone: string; email: string | null; displayName: string | null };
  merchant: MerchantProfile;
}

export interface MerchantSession {
  accessToken: string;
  merchantUser: MerchantUserProfile;
}

export interface AdminMerchantListResponse {
  merchants: MerchantProfile[];
  counts: { pending: number; approved: number; rejected: number; suspended: number };
}

export type UserRole = 'RESIDENT' | 'MERCHANT' | 'SECURITY' | 'ADMIN';
export type AdminRole =
  | 'SUPER_ADMIN'
  | 'ASSOCIATION_REP'
  | 'RESIDENT_REVIEWER'
  | 'MERCHANT_REVIEWER'
  | 'SUPPORT'
  | 'AUDITOR'
  | 'REPORTER';

export interface AdminUserPosition {
  id: string;
  phone: string;
  email: string | null;
  role: UserRole;
  adminRole: AdminRole | null;
  associationName: string | null;
  isActive: boolean;
  resident: {
    fullName: string;
    neighbourhood: string;
    approvalStatus: ApprovalStatus;
  } | null;
}

export function adminListUsers(token: string, query?: string) {
  const p = new URLSearchParams();
  if (query?.trim()) p.set('query', query.trim());
  return apiRequest<{ users: AdminUserPosition[] }>(`/api/admin/users${p.toString() ? `?${p}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminUpdateUserPosition(token: string, userId: string, input: {
  role: UserRole;
  adminRole?: AdminRole;
  associationName?: string;
}) {
  return apiRequest<{ user: AdminUserPosition }>(`/api/admin/users/${userId}/position`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function registerMerchant(input: {
  businessName: string;
  category: string;
  contactPerson: string;
  phone: string;
  email?: string;
  location: string;
  password: string;
  consent: boolean;
}) {
  return apiRequest<MerchantSession>('/api/merchant-auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function loginMerchant(identifier: string, password: string) {
  return apiRequest<MerchantSession>('/api/merchant-auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export function getMerchantMe(token: string) {
  return apiRequest<{ merchantUser: MerchantUserProfile }>('/api/merchant-auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function changeMerchantPassword(token: string, currentPassword: string, newPassword: string) {
  return apiRequest<{ success: boolean }>('/api/merchant-auth/change-password', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function listMerchantStaff(token: string) {
  return apiRequest<{ staff: MerchantUserProfile[] }>('/api/merchant-auth/staff', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function inviteMerchantStaff(token: string, input: {
  fullName: string; phone: string; password: string; role?: MerchantUserRole;
}) {
  return apiRequest<{ merchantUser: MerchantUserProfile }>('/api/merchant-auth/staff', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function deactivateMerchantStaff(token: string, userId: string) {
  return apiRequest<{ success: boolean }>(`/api/merchant-auth/staff/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminListMerchants(token: string, status?: ApprovalStatus | 'ALL', query?: string) {
  const p = new URLSearchParams();
  if (status && status !== 'ALL') p.set('status', status);
  if (query?.trim()) p.set('query', query.trim());
  return apiRequest<AdminMerchantListResponse>(`/api/admin/merchants${p.toString() ? `?${p}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminUpdateMerchantStatus(token: string, merchantId: string, status: ApprovalStatus, reason?: string) {
  return apiRequest<{ merchant: MerchantProfile }>(`/api/admin/merchants/${merchantId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, reason: reason?.trim() || undefined }),
  });
}

// ── Merchant offers ───────────────────────────────────────────────────

export type BenefitType =
  | 'PERCENTAGE_DISCOUNT'
  | 'FIXED_RATE'
  | 'FREE_SERVICE'
  | 'LOYALTY_POINTS'
  | 'MERCHANT_CREDIT'
  | 'VOUCHER';

export type RedemptionModel = 'IMMEDIATE' | 'ACCUMULATED';
export type OfferStatus = 'ACTIVE' | 'PAUSED' | 'PENDING';

export interface MerchantOffer {
  id: string;
  merchantId: string;
  title: string;
  benefitType: BenefitType;
  value: string | null;
  displayValue: string;
  redemptionModel: RedemptionModel;
  redemptionRule: string;
  validFrom: string;
  validUntil: string | null;
  status: OfferStatus;
  updatedAt: string;
}

export interface OfferVersion {
  id: string;
  title: string;
  benefitType: BenefitType;
  value: string | null;
  displayValue: string;
  redemptionModel: RedemptionModel;
  redemptionRule: string;
  validFrom: string;
  validUntil: string | null;
  status: OfferStatus;
  changeNote: string | null;
  createdAt: string;
}

export interface MerchantOfferDetail extends MerchantOffer {
  versions: OfferVersion[];
}

export interface AdminOfferItem extends MerchantOffer {
  merchant: { id: string; businessName: string; category: string };
}

export interface AdminOffersResponse {
  offers: AdminOfferItem[];
  counts: { pending: number; active: number; paused: number };
}

export function listMerchantOffers(token: string) {
  return apiRequest<{ offers: MerchantOffer[] }>('/api/merchant/offers', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getMerchantOffer(token: string, id: string) {
  return apiRequest<{ offer: MerchantOfferDetail }>(`/api/merchant/offers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function createMerchantOffer(token: string, input: {
  title: string; benefitType: BenefitType; value?: string;
  displayValue: string; redemptionModel: RedemptionModel;
  redemptionRule: string; validFrom: string; validUntil?: string;
}) {
  return apiRequest<{ offer: MerchantOffer }>('/api/merchant/offers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function updateMerchantOffer(token: string, id: string, input: Partial<{
  title: string; benefitType: BenefitType; value: string;
  displayValue: string; redemptionModel: RedemptionModel;
  redemptionRule: string; validFrom: string; validUntil: string; changeNote: string;
}>) {
  return apiRequest<{ offer: MerchantOffer; requiresReApproval: boolean }>(`/api/merchant/offers/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function pauseMerchantOffer(token: string, id: string) {
  return apiRequest<{ offer: MerchantOffer }>(`/api/merchant/offers/${id}/pause`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
  });
}

export function resumeMerchantOffer(token: string, id: string) {
  return apiRequest<{ offer: MerchantOffer }>(`/api/merchant/offers/${id}/resume`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
  });
}

export function archiveMerchantOffer(token: string, id: string) {
  return apiRequest<{ offer: MerchantOffer }>(`/api/merchant/offers/${id}/archive`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminListOffers(token: string, status?: OfferStatus | 'ALL', merchantId?: string, query?: string) {
  const p = new URLSearchParams();
  if (status && status !== 'ALL') p.set('status', status);
  if (merchantId) p.set('merchantId', merchantId);
  if (query?.trim()) p.set('query', query.trim());
  return apiRequest<AdminOffersResponse>(`/api/admin/offers${p.toString() ? `?${p}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminUpdateOfferStatus(token: string, id: string, action: 'approve' | 'reject' | 'pause', note?: string) {
  return apiRequest<{ offer: MerchantOffer }>(`/api/admin/offers/${id}/${action}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ note: note?.trim() || undefined }),
  });
}

// ── Merchant scan, transactions, rewards ─────────────────────────────

export interface ScanResult {
  allowed: boolean;
  status: CardStatus;
  expiresAt: string | null;
  cached: boolean;
  resident: {
    fullName: string;
    membershipId: string;
    memberCategory: string;
    neighbourhood: string;
  };
}

export interface MerchantTransaction {
  id: string;
  purchaseAmount: string | null;
  benefitValue: string;
  redemptionModel: RedemptionModel;
  auditStatus: string;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
  offer: { id: string; title: string; displayValue: string; benefitType: BenefitType } | null;
  resident: { fullName: string; memberCategory: string; card: { membershipId: string } | null };
  loggedBy: { id: string; phone: string };
}

export interface MerchantReport {
  summary: {
    totalVisits: number;
    totalBenefitValue: string;
    immediateValue: string;
    accumulatedIssued: string;
    totalRewardLiability: string;
    totalResidentsWithBalance: number;
  };
  offerUsage: {
    offerId: string | null;
    offerTitle: string;
    displayValue: string;
    count: number;
    totalValue: string;
  }[];
}

export function merchantScan(token: string, cardToken: string, idempotencyKey?: string, deviceInfo?: string) {
  return apiRequest<ScanResult>('/api/merchant/scan', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardToken, idempotencyKey, deviceInfo }),
  });
}

export function logTransaction(token: string, input: {
  cardToken: string; offerId: string; purchaseAmount?: string;
  idempotencyKey?: string; deviceInfo?: string;
}) {
  return apiRequest<{ transaction: MerchantTransaction; cached: boolean; benefitValue: string }>(
    '/api/merchant/transactions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
}

export function listMerchantTransactions(token: string, filters?: { from?: string; to?: string; offerId?: string }) {
  const p = new URLSearchParams();
  if (filters?.from) p.set('from', filters.from);
  if (filters?.to) p.set('to', filters.to);
  if (filters?.offerId) p.set('offerId', filters.offerId);
  return apiRequest<{ transactions: MerchantTransaction[] }>(
    `/api/merchant/transactions${p.toString() ? `?${p}` : ''}`,
    { headers: { Authorization: `Bearer ${token}` } });
}

export function reverseTransaction(token: string, id: string, reason: string) {
  return apiRequest<{ success: boolean }>(`/api/merchant/transactions/${id}/reverse`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  });
}

export function redeemReward(token: string, cardToken: string, amount: string) {
  return apiRequest<{ success: boolean; newBalance: string; redeemed: string }>(
    '/api/merchant/rewards/redeem', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cardToken, amount }),
    });
}

export function getMerchantReport(token: string, from?: string, to?: string) {
  const p = new URLSearchParams();
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  return apiRequest<MerchantReport>(
    `/api/merchant/reports${p.toString() ? `?${p}` : ''}`,
    { headers: { Authorization: `Bearer ${token}` } });
}

// ── Admin extended types ──────────────────────────────────────────────

export type ComplaintStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';

export interface AdminComplaint {
  id: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  assignedTo: string | null;
  adminNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resident: { fullName: string; neighbourhood: string; card: { membershipId: string } | null };
  merchant: { businessName: string } | null;
}

export interface AdminComplaintsResponse {
  complaints: AdminComplaint[];
  total: number;
  page: number;
  pageSize: number;
  counts: { open: number; investigating: number; resolved: number; closed: number };
}

export interface AdminTransactionItem {
  id: string;
  purchaseAmount: string | null;
  benefitValue: string;
  redemptionModel: string;
  auditStatus: string;
  auditFlag: string | null;
  auditNote: string | null;
  reversalOfId: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
  resident: { fullName: string; card: { membershipId: string } | null };
  merchant: { businessName: string; category: string };
  offer: { title: string; displayValue: string } | null;
  loggedBy: { phone: string };
}

export interface AdminTransactionsResponse {
  transactions: AdminTransactionItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminResidentDetail {
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
  card: {
    membershipId: string; status: string; issuedAt: string | null; expiresAt: string | null;
    history: { id: string; status: string; issuedAt: string | null; expiresAt: string | null; note: string | null; createdAt: string }[];
    scans: { id: string; result: string; merchantId: string | null; createdAt: string }[];
  } | null;
  dependants: { id: string; fullName: string; relationship: string; approvalStatus: ApprovalStatus; statusReason: string | null; createdAt: string }[];
  renewals: { id: string; status: ApprovalStatus; reason: string | null; requestedAt: string; processedAt: string | null; processedBy: string | null }[];
  complaints: { id: string; subject: string; status: string; adminNote: string | null; createdAt: string; updatedAt: string }[];
  transactions: { id: string; benefitValue: string; purchaseAmount: string | null; redemptionModel: string; auditStatus: string; createdAt: string; offer: { title: string; displayValue: string } | null; merchant: { businessName: string } }[];
}

export interface AdminReport {
  residents: { total: number; pending: number; approved: number; rejected: number; suspended: number };
  merchants: { total: number; approved: number; pending: number };
  offers: { total: number; active: number; pending: number };
  transactions: { total: number; thisMonth: number };
  complaints: { total: number; open: number };
  renewals: { total: number; pending: number };
  rewards: { totalLiability: string };
  scans: { total: number; denied: number };
}

export function getAdminResidentDetail(token: string, residentId: string) {
  return apiRequest<{ resident: AdminResidentDetail }>(`/api/admin/residents/${residentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminListComplaints(token: string, status?: ComplaintStatus | 'ALL', query?: string, page = 1) {
  const p = new URLSearchParams();
  if (status && status !== 'ALL') p.set('status', status);
  if (query?.trim()) p.set('query', query.trim());
  p.set('page', String(page));
  return apiRequest<AdminComplaintsResponse>(`/api/admin/complaints?${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminUpdateComplaint(token: string, id: string, input: {
  status: ComplaintStatus; adminNote?: string; assignedTo?: string;
}) {
  return apiRequest<AdminComplaint>(`/api/admin/complaints/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function adminListTransactions(token: string, auditStatus?: string, query?: string, page = 1) {
  const p = new URLSearchParams();
  if (auditStatus && auditStatus !== 'ALL') p.set('auditStatus', auditStatus);
  if (query?.trim()) p.set('query', query.trim());
  p.set('page', String(page));
  return apiRequest<AdminTransactionsResponse>(`/api/admin/transactions?${p}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminAuditTransaction(token: string, id: string, input: {
  auditStatus: string; auditFlag?: string; auditNote?: string;
}) {
  return apiRequest<AdminTransactionItem>(`/api/admin/transactions/${id}/audit`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
}

export function getAdminReports(token: string) {
  return apiRequest<AdminReport>('/api/admin/reports', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function adminListResidentsPaged(token: string, status?: ApprovalStatus | 'ALL', query?: string, page = 1) {
  const p = new URLSearchParams();
  if (status && status !== 'ALL') p.set('status', status);
  if (query?.trim()) p.set('query', query.trim());
  p.set('page', String(page));
  return apiRequest<{ residents: AdminResidentDetail[]; total: number; page: number; pageSize: number; counts: { pending: number; approved: number; rejected: number; suspended: number } }>(
    `/api/admin/residents?${p}`, { headers: { Authorization: `Bearer ${token}` } });
}
