export type MembershipCardTone = 'resident' | 'homeowner' | 'tenant' | 'household' | 'leadership';

export interface MembershipCardTheme {
  tone: MembershipCardTone;
  className: string;
  qrColor: string;
}

/**
 * Membership categories are configurable free text, so match common role names
 * while keeping a safe, consistent resident fallback.
 */
export function getMembershipCardTheme(category?: string | null): MembershipCardTheme {
  const role = (category || '').trim().toLowerCase();

  if (/executive|official|association|committee|chair|secretary|leadership/.test(role)) {
    return { tone: 'leadership', className: 'card-theme-leadership', qrColor: '#6f1838' };
  }
  if (/home\s*owner|homeowner|property\s*owner|landlord|owner\s*occupier/.test(role)) {
    return { tone: 'homeowner', className: 'card-theme-homeowner', qrColor: '#173b55' };
  }
  if (/tenant|renter|leaseholder/.test(role)) {
    return { tone: 'tenant', className: 'card-theme-tenant', qrColor: '#075a66' };
  }
  if (/dependant|dependent|family|household|spouse|child|youth/.test(role)) {
    return { tone: 'household', className: 'card-theme-household', qrColor: '#4d347f' };
  }

  return { tone: 'resident', className: 'card-theme-resident', qrColor: '#26345e' };
}
