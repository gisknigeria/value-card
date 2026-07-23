export type Benefit = {
  id: number;
  merchant: string;
  initials: string;
  category: string;
  value: string;
  model: 'Immediate' | 'Accumulated';
  rule: string;
  location: string;
  validUntil: string;
  tone: string;
};

export const benefits: Benefit[] = [
  { id: 1, merchant: 'Bodija Market Fresh', initials: 'BM', category: 'Supermarkets', value: '7.5% off', model: 'Immediate', rule: 'Orders above NGN 10,000', location: 'Old Bodija', validUntil: '31 Dec 2026', tone: 'green' },
  { id: 2, merchant: 'Cedar Pharmacy', initials: 'CP', category: 'Pharmacies', value: '5% credit', model: 'Accumulated', rule: 'Redeem from NGN 2,000', location: 'Awolowo Avenue', validUntil: '30 Sep 2026', tone: 'blue' },
  { id: 3, merchant: 'The Courtyard Kitchen', initials: 'CK', category: 'Restaurants', value: 'Free delivery', model: 'Immediate', rule: 'Orders above NGN 15,000', location: 'Aare Avenue', validUntil: '31 Aug 2026', tone: 'coral' },
  { id: 4, merchant: 'Oakfield Diagnostics', initials: 'OD', category: 'Clinics', value: '10% off', model: 'Immediate', rule: 'Selected laboratory tests', location: 'Housing Road', validUntil: '31 Dec 2026', tone: 'violet' },
  { id: 5, merchant: 'NeatNest Laundry', initials: 'NL', category: 'Laundry', value: 'NGN 1,500 credit', model: 'Accumulated', rule: 'After every five orders', location: 'Bodija Estate', validUntil: '30 Nov 2026', tone: 'gold' },
  { id: 6, merchant: 'AutoSure Garage', initials: 'AG', category: 'Auto and repair', value: 'Fixed rate', model: 'Immediate', rule: 'NGN 8,000 basic service labour', location: 'Secretariat Road', validUntil: '31 Oct 2026', tone: 'slate' },
];

export const recentActivity = [
  { merchant: 'Bodija Market Fresh', date: '14 Jul, 4:32 PM', amount: 'NGN 24,600', saved: 'NGN 1,845', kind: 'Discount' },
  { merchant: 'Cedar Pharmacy', date: '09 Jul, 11:08 AM', amount: 'NGN 12,400', saved: 'NGN 620', kind: 'Credit earned' },
  { merchant: 'The Courtyard Kitchen', date: '02 Jul, 7:16 PM', amount: 'NGN 18,800', saved: 'Free delivery', kind: 'Benefit' },
];
