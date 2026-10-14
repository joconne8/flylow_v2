// Synthetic Demo Air offers. Not real fares.

export interface Offer {
  id: 'A' | 'B' | 'C';
  airline: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  currency: string;
  totalCents: number; // includes taxes and bags
  includesTaxesAndBags: boolean;
  stopsOutbound: number;
  stopsReturn: number;
  selfTransfer: boolean;
  overnightLayover: boolean;
  longestLayoverHours: number;
  fareBrand: 'standard_economy' | 'basic_economy' | null;
  checkedBags: number | null;
  note: string;
}

const base = {
  airline: 'Demo Air',
  origin: 'ORD',
  destination: 'DUB',
  departDate: '2027-05-23',
  returnDate: '2027-08-13',
  currency: 'USD',
  includesTaxesAndBags: true,
  stopsOutbound: 1,
  stopsReturn: 1,
  selfTransfer: false,
  overnightLayover: false,
  longestLayoverHours: 2,
} as const;

export const OFFERS: readonly Offer[] = [
  { ...base, id: 'A', totalCents: 61200, fareBrand: 'standard_economy', checkedBags: 1, note: 'Fits the brief on paper.' },
  { ...base, id: 'B', totalCents: 65100, fareBrand: 'standard_economy', checkedBags: 1, note: 'One dollar over a $650 cap.' },
  { ...base, id: 'C', totalCents: 60000, fareBrand: null, checkedBags: null, note: 'Cheapest, but fare brand and bags are not disclosed.' },
];

export function getOffer(id: string): Offer | undefined {
  return OFFERS.find((o) => o.id === id);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
