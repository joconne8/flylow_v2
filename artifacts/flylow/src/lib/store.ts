// Versioned localStorage store with defensive schema load. Holds only fake/mock data.
import { useSyncExternalStore } from 'react';
import { type Authority, type ApprovedScope, fingerprintPolicy, isPosSafeInt, validScope } from './authority';
import { isValidIsoDate } from './policy';
import { DEFAULT_SETTINGS, type SearchSettings, sanitizeSettings, policyToDraft, settingsToDraft } from './results';
import { validatePolicy } from './policy';
import { type AppNotification, type Sample, type Tracker } from './tracker';
import { type AuditEntry, type BookingReceipt } from './types';

export const STORE_KEY = 'flylow.v2.state';
export const STORE_VERSION = 1;

export const VAULT_PROFILE = {
  traveler: 'Demo Traveler', card: 'Visa ending 4242', cardLast4: '4242',
  credentials: [{ vaultCredentialId: 'vault_demo_air_123', displayName: 'Demo Air login', lastFour: null as string | null }],
  travelerRef: 'vault_traveler_demo_001', paymentRef: 'vault_pay_demo_4242',
};

export interface StoredState {
  version: number;
  settings: SearchSettings;
  trackers: Tracker[];
  notifications: AppNotification[];
  authorities: Authority[];
  receipts: BookingReceipt[];
  audit: AuditEntry[];
  vault: { connected: boolean; connectedAt: string | null };
  persistError: string | null; // runtime only, never saved
  recovered: boolean; // true when stored data was missing fields or unreadable
}

export function emptyState(): StoredState {
  return { version: STORE_VERSION, settings: DEFAULT_SETTINGS, trackers: [], notifications: [], authorities: [], receipts: [], audit: [], vault: { connected: false, connectedAt: null }, persistError: null, recovered: false };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

function sampleOf(x: unknown): Sample | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.checkedAt)) return null;
  const n = (v: unknown) => (isNum(v) ? v : null);
  return {
    id: x.id, checkedAt: x.checkedAt, offersSeen: isNum(x.offersSeen) ? x.offersSeen : 0, matchCount: isNum(x.matchCount) ? x.matchCount : 0,
    reviewCount: isNum(x.reviewCount) ? x.reviewCount : 0, bestCents: n(x.bestCents), bestOfferId: isStr(x.bestOfferId) ? x.bestOfferId : null,
    bestAirline: isStr(x.bestAirline) ? x.bestAirline : null,
    bestSource: x.bestSource === 'demo' || x.bestSource === 'amadeus-sandbox' || x.bestSource === 'duffel-sandbox' ? x.bestSource : null,
    cheapestOverallCents: n(x.cheapestOverallCents),
  };
}

function trackerOf(x: unknown): Tracker | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.createdAt) || !isStr(x.label)) return null;
  const a = isObj(x.alerts) ? x.alerts : {};
  const settings = sanitizeSettings(x.settings);
  if (!validatePolicy(settingsToDraft(settings)).ok) return null;
  return {
    id: x.id, createdAt: x.createdAt, label: x.label, settings,
    alerts: { email: a.email === true, sms: a.sms === true, push: a.push === true, autoBook: a.autoBook === true },
    samples: arr(x.samples).map(sampleOf).filter((s): s is Sample => !!s),
  };
}

function notificationOf(x: unknown): AppNotification | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.at) || !isStr(x.text)) return null;
  const kind = x.kind === 'price' || x.kind === 'review' || x.kind === 'eligible' ? x.kind : 'info';
  return { id: x.id, at: x.at, text: x.text, kind, trackerId: isStr(x.trackerId) ? x.trackerId : null, channels: arr(x.channels).filter(isStr) };
}

function auditOf(x: unknown): AuditEntry | null {
  return isObj(x) && isStr(x.at) && isStr(x.kind) && isStr(x.message) ? { at: x.at, kind: x.kind, message: x.message } : null;
}

function authorityOf(x: unknown): Authority | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.createdAt) || !isObj(x.policy) || !isStr(x.expiresAt)) return null;
  const v = validatePolicy(policyToDraft(x.policy as never));
  if (!v.ok || !isPosSafeInt(x.spendCapCents) || !isPosSafeInt(x.confirmThresholdCents)) return null;
  if (!isStr(x.expiresAt) || !isValidIsoDate(x.expiresAt)) return null;
  if (!validScope(x.scope)) return null;
  const scope: ApprovedScope = Object.freeze({ passengers: x.scope.passengers, cabin: x.scope.cabin, airlines: [...x.scope.airlines] });
  const policy = Object.freeze({ ...v.policy });
  const fp = fingerprintPolicy(policy);
  const tampered = x.fingerprint !== fp;
  return {
    id: x.id, createdAt: x.createdAt, policy, scope, fingerprint: isStr(x.fingerprint) ? x.fingerprint : fp, expiresAt: x.expiresAt,
    spendCapCents: x.spendCapCents, confirmThresholdCents: x.confirmThresholdCents, enabled: x.enabled === true, vaultRequired: true,
    revokedAt: isStr(x.revokedAt) ? x.revokedAt : null,
    invalidatedAt: isStr(x.invalidatedAt) ? x.invalidatedAt : tampered ? new Date(0).toISOString() : null,
    invalidatedReason: isStr(x.invalidatedReason) ? x.invalidatedReason : tampered ? 'Stored snapshot failed its integrity check.' : null,
  };
}

function receiptOf(x: unknown): BookingReceipt | null {
  if (!isObj(x) || !isStr(x.id) || !isStr(x.reference) || !isStr(x.idempotencyKey) || !isNum(x.totalCents) || !isStr(x.createdAt)) return null;
  const s = (k: string) => (isStr(x[k]) ? (x[k] as string) : '');
  return {
    id: x.id, reference: x.reference, idempotencyKey: x.idempotencyKey, offerId: s('offerId'),
    source: x.source === 'amadeus-sandbox' || x.source === 'duffel-sandbox' ? x.source : 'demo', airline: s('airline'),
    origin: s('origin'), destination: s('destination'), departDate: s('departDate'), returnDate: s('returnDate'), fareBrand: s('fareBrand'),
    checkedBags: isNum(x.checkedBags) ? x.checkedBags : 0, totalCents: x.totalCents, capCents: isNum(x.capCents) ? x.capCents : null,
    createdAt: x.createdAt, vaultRef: s('vaultRef'), travelerLabel: s('travelerLabel'), cardDisplay: s('cardDisplay'),
    authorityId: isStr(x.authorityId) ? x.authorityId : null, disclaimer: s('disclaimer'), mock: true,
    audit: arr(x.audit).map(auditOf).filter((a): a is AuditEntry => !!a),
  };
}

/** Defensive load. Never throws. Unknown versions or garbage reset to an empty state with recovered=true. */
export function parseStoredState(raw: string | null): StoredState {
  if (raw === null) return emptyState();
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return { ...emptyState(), recovered: true }; }
  if (!isObj(j) || j.version !== STORE_VERSION) return { ...emptyState(), recovered: true };
  const trackers = arr(j.trackers).map(trackerOf);
  const authorities = arr(j.authorities).map(authorityOf);
  const receipts = arr(j.receipts).map(receiptOf);
  const notifications = arr(j.notifications).map(notificationOf);
  const audit = arr(j.audit).map(auditOf);
  const dropped = [trackers, authorities, receipts, notifications, audit].some((l) => l.some((x) => x === null));
  const v = isObj(j.vault) ? j.vault : {};
  return {
    version: STORE_VERSION, settings: sanitizeSettings(j.settings),
    trackers: trackers.filter((x): x is Tracker => !!x), authorities: authorities.filter((x): x is Authority => !!x),
    receipts: receipts.filter((x): x is BookingReceipt => !!x), notifications: notifications.filter((x): x is AppNotification => !!x),
    audit: audit.filter((x): x is AuditEntry => !!x),
    vault: { connected: v.connected === true, connectedAt: isStr(v.connectedAt) ? v.connectedAt : null }, persistError: null, recovered: dropped,
  };
}

export function serializeState(s: StoredState): string { return JSON.stringify({ ...s, persistError: undefined, version: STORE_VERSION }); }

/** Idempotent: a receipt with the same id or idempotency key is never added twice. */
export function addReceiptIfNew(s: StoredState, r: BookingReceipt): StoredState {
  if (s.receipts.some((x) => x.id === r.id || x.idempotencyKey === r.idempotencyKey)) return s;
  return { ...s, receipts: [r, ...s.receipts] };
}

let state: StoredState = (() => {
  try { return typeof localStorage === 'undefined' ? emptyState() : parseStoredState(localStorage.getItem(STORE_KEY)); }
  catch { return { ...emptyState(), persistError: 'Local storage could not be read. Data will not persist.' }; }
})();
const listeners = new Set<() => void>();
function persist(): string | null {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORE_KEY, serializeState(state)); return null; }
  catch { return 'Could not save to local storage (blocked or full). Changes are in memory only and will be lost on reload.'; }
}

export function getState(): StoredState { return state; }
export function mutate(fn: (s: StoredState) => StoredState) {
  state = fn(state);
  state = { ...state, persistError: persist() };
  listeners.forEach((l) => l());
}
export function resetAll() {
  let err: string | null = null;
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORE_KEY); } catch { err = 'Could not clear local storage.'; }
  state = { ...emptyState(), persistError: err };
  listeners.forEach((l) => l());
}
export function useAppState(): StoredState {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getState, getState);
}
export function appendAudit(s: StoredState, entries: AuditEntry[]): StoredState { return { ...s, audit: [...entries, ...s.audit].slice(0, 300) }; }
