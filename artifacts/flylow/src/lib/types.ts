// Shared types and tiny pure helpers for FlyLow v2. Mock/sandbox only.

export type Cabin = 'economy' | 'premium' | 'business';
export type SourceId = 'demo' | 'amadeus-sandbox' | 'duffel-sandbox';
export type FareBrand = 'standard_economy' | 'basic_economy' | null;
export type RepriceScenario = 'unchanged' | 'risen' | 'missing';

export const SOURCE_LABELS: Record<SourceId, string> = {
  demo: 'Demo Air (sample data)',
  'amadeus-sandbox': 'Amadeus Sandbox (MOCK adapter)',
  'duffel-sandbox': 'Duffel Sandbox (MOCK adapter)',
};

export interface FlightOffer {
  id: string;
  source: SourceId;
  providerRef: string;
  airline: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  currency: string;
  totalCents: number; // all travelers, taxes included
  includesTaxesAndBags: boolean;
  stopsOutbound: number;
  stopsReturn: number;
  selfTransfer: boolean;
  overnightLayover: boolean;
  longestLayoverHours: number;
  fareBrand: FareBrand;
  checkedBags: number | null;
  cabin: Cabin;
  passengers: number;
  durationOutMin: number;
  durationRetMin: number;
  note: string;
  fixtureId?: 'A' | 'B' | 'C';
}

export interface FlightSearchQuery {
  origins: string[];
  destinations: string[];
  outboundStart: string;
  outboundEnd: string;
  returnStart: string;
  returnEnd: string;
  passengers: number;
  cabin: Cabin;
}

export interface PriceOptions {
  scenario?: RepriceScenario;
  capCents?: number;
  snapshot?: FlightOffer;
  now?: Date;
}

export interface PricedOffer {
  offerId: string;
  offer: FlightOffer;
  totalCents: number;
  currency: string;
  scenario: RepriceScenario;
  pricedAt: string;
  available: boolean;
  source: SourceId;
  mock: true;
}

export interface AuditEntry {
  at: string;
  kind: string;
  message: string;
}

export interface BookingRequest {
  offerId: string;
  expectedTotalCents: number;
  idempotencyKey: string;
  vaultRef: string;
  travelerLabel: string;
  cardDisplay: string;
  authorityId?: string;
  snapshot?: FlightOffer;
  now?: Date;
}

export interface BookingReceipt {
  id: string;
  reference: string;
  idempotencyKey: string;
  offerId: string;
  source: SourceId;
  airline: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  fareBrand: string;
  checkedBags: number;
  totalCents: number;
  capCents: number | null;
  createdAt: string;
  vaultRef: string;
  travelerLabel: string;
  cardDisplay: string;
  authorityId: string | null;
  disclaimer: string;
  mock: true;
  audit: AuditEntry[];
}

export const RECEIPT_DISCLAIMER_V2 = 'SIMULATED ORDER - sandbox only. No ticket issued, no payment taken, no provider contacted.';

export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const f = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((f(b) - f(a)) / 86400000);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(iso: string, withYear = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '-';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MON[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
}
export function fmtRange(a: string, b: string, withYear = false): string {
  return a === b ? fmtDate(a, withYear) : `${fmtDate(a)}-${fmtDate(b, withYear)}`;
}
export function fmtDuration(min: number): string {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}
export function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}
export function usdExact(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function stopsLabel(n: number): string { return n === 0 ? 'Nonstop' : n === 1 ? '1 stop' : `${n} stops`; }
