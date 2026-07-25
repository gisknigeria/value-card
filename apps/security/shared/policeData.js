/**
 * Bodija Community Security — role definitions.
 * Three roles only: Super Admin, Admin, Access Point Officer.
 */

export const SECURITY_ROLES = ['Super Admin', 'Admin', 'Access Point'];

export const ROLE_LABELS = {
  'Super Admin':    'System Administrator',
  'Admin':          'Control Room Admin',
  'Access Point':   'Access Point Officer',
};

// ── Legacy stubs — kept so imports in App.jsx don't break while we transition ──
export const POLICE_RANK_GROUPS = [];
export const POLICE_RANKS       = [];
export const rankLevel          = () => 999;
export const ranksBelow         = () => [];
export const canManageRank      = () => false;

export const OYO_POLICE_UNITS   = [];
export const normalizeCommand   = (c) => String(c || '');
export const OYO_COMMANDS       = ['Bodija Community'];
export const divisionsForCommand = () => [];
export const UNIT_TYPES         = ['Gate'];
