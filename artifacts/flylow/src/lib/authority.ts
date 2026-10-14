// Auto-book authority, deterministic purchase gate, and idempotent mock purchase flow. Pure except the injected provider.
import { type Policy, policiesEqual, validatePolicy } from './policy';
import { type FlightProvider } from './providers';
import { policyForOffer, policyToDraft, rulesFor } from './results';
import {
  type AuditEntry, type BookingReceipt, type Cabin, type FlightOffer, type PricedOffer, type RepriceScenario, fnv, usd,
} from './types';
import { isValidIsoDate } from './policy';

export const DEFAULT_CONFIRM_CENTS = 62500;

export interface ApprovedScope { passengers: number; cabin: Cabin; airlines: string[] }

export interface Authority {
  id: string;
  scope: ApprovedScope; // approved traveler count, cabin and airline restrictions (immutable with the policy)
  createdAt: string;
  policy: Policy; // immutable approved snapshot
  fingerprint: string;
  expiresAt: string; // YYYY-MM-DD, valid through end of that day (UTC)
  spendCapCents: number;
  confirmThresholdCents: number;
  enabled: boolean;
  vaultRequired: true;
  revokedAt: string | null;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
}

export function fingerprintPolicy(p: Policy): string {
  const keys = Object.keys(p).sort() as (keyof Policy)[];
  return fnv(JSON.stringify(keys.map((k) => [k, p[k]])));
}

/** End-of-day UTC ms for a strictly valid YYYY-MM-DD, else NaN (callers must fail closed). */
export function expiryMs(d: string): number { return typeof d === 'string' && isValidIsoDate(d) ? Date.parse(`${d}T23:59:59.999Z`) : NaN; }
export function isExpired(d: string, now: Date): boolean { const ms = expiryMs(d); return !(ms >= now.getTime()); }
export function validScope(s: unknown): s is ApprovedScope {
  const o = s as ApprovedScope;
  return !!o && Number.isInteger(o.passengers) && o.passengers >= 1 && o.passengers <= 9 && ['economy', 'premium', 'business'].includes(o.cabin)
    && Array.isArray(o.airlines) && o.airlines.every((a) => typeof a === 'string');
}
export const isPosSafeInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;

function deepFreeze<T extends object>(o: T): T { Object.freeze(o); return o; }

export interface AuthorityInput { policy: Policy; scope: ApprovedScope; expiresAt: string; spendCapCents: number; confirmThresholdCents?: number; enabled?: boolean }

export function createAuthority(input: AuthorityInput, now: Date = new Date()):
  { ok: true; authority: Authority } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isValidIsoDate(input.expiresAt)) errors.push('Expiry must be a real date (YYYY-MM-DD).');
  else if (isExpired(input.expiresAt, now)) errors.push('Expiry must not be in the past.');
  if (!isPosSafeInt(input.spendCapCents)) errors.push('Spending cap must be a whole number of cents greater than 0.');
  const th = input.confirmThresholdCents ?? DEFAULT_CONFIRM_CENTS;
  if (!isPosSafeInt(th)) errors.push('Confirmation threshold must be a whole number of cents greater than 0.');
  if (!validScope(input.scope)) errors.push('Traveler count, cabin and airlines are invalid.');
  const pv = input.policy && typeof input.policy === 'object' ? validatePolicy(policyToDraft(input.policy)) : null;
  if (!pv || !pv.ok) errors.push('Policy is invalid.');
  else if (!policiesEqual(pv.policy, input.policy)) errors.push('Policy is not in canonical validated form (check cents and casing).');
  if (errors.length || !pv || !pv.ok) return { ok: false, errors };
  const policy = deepFreeze({ ...pv.policy });
  const scope: ApprovedScope = deepFreeze({ passengers: input.scope.passengers, cabin: input.scope.cabin, airlines: Object.freeze([...input.scope.airlines]) as string[] });
  return {
    ok: true,
    authority: {
      id: `auth_${fnv(`${fingerprintPolicy(policy)}|${now.toISOString()}|${input.spendCapCents}`)}`, createdAt: now.toISOString(),
      policy, scope, fingerprint: fingerprintPolicy(policy), expiresAt: input.expiresAt, spendCapCents: input.spendCapCents,
      confirmThresholdCents: th, enabled: input.enabled ?? true, vaultRequired: true, revokedAt: null, invalidatedAt: null, invalidatedReason: null,
    },
  };
}

export function revokeAuthority(a: Authority, now: Date = new Date()): Authority {
  return a.revokedAt ? a : { ...a, revokedAt: now.toISOString() };
}

/** Any change to the approved policy invalidates the authority; the snapshot itself is never mutated. */
export function invalidateOnPolicyEdit(a: Authority, edited: Policy, now: Date = new Date()): Authority {
  if (a.invalidatedAt || policiesEqual(a.policy, edited)) return a;
  return { ...a, invalidatedAt: now.toISOString(), invalidatedReason: 'Policy was edited after approval. Approve a new authority.' };
}

export type AuthorityState = 'active' | 'revoked' | 'invalidated' | 'expired' | 'disabled' | 'vault_missing' | 'tampered';

export function authorityState(a: Authority, now: Date, vaultConnected: boolean): AuthorityState {
  if (a.revokedAt) return 'revoked';
  if (a.invalidatedAt) return 'invalidated';
  if (fingerprintPolicy(a.policy) !== a.fingerprint) return 'tampered';
  if (isExpired(a.expiresAt, now)) return 'expired';
  if (!a.enabled) return 'disabled';
  if (!vaultConnected) return 'vault_missing';
  return 'active';
}

export type CheckStatus = 'pass' | 'fail' | 'unknown' | 'hold';
export interface GateCheck { id: string; label: string; status: CheckStatus; detail: string }
export type GateDecision = 'BOOK' | 'NEEDS_CONFIRMATION' | 'REJECT' | 'NEEDS_REVIEW' | 'BLOCK';

const STATE_TEXT: Record<AuthorityState, string> = {
  active: 'Authority is approved, enabled and unexpired.', revoked: 'Authority was revoked.', invalidated: 'Policy edited after approval.',
  expired: 'Authority has expired.', disabled: 'Authority is switched off.', vault_missing: 'Mock vault is not connected.', tampered: 'Approved snapshot no longer matches its fingerprint.',
};

export interface GateInput { authority: Authority; offer: FlightOffer; now: Date; vaultConnected: boolean; confirmed: boolean }
export interface GateResult { decision: GateDecision; checks: GateCheck[]; reasons: string[] }

/** Revalidates every rule plus expiry, approval, spend cap, confirmation and vault. Same inputs, same output. */
export function validatePurchase(i: GateInput): GateResult {
  const a = i.authority;
  const st = authorityState(a, i.now, true);
  const checks: GateCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, detail: string) => checks.push({ id, label, status, detail });
  const approvalOk = !a.revokedAt && !a.invalidatedAt && st !== 'tampered';
  add('approval', 'Approval', approvalOk ? 'pass' : 'fail', approvalOk ? 'Approved policy snapshot intact.' : STATE_TEXT[st]);
  const exp = isExpired(a.expiresAt, i.now);
  add('expiry', 'Expiry', exp ? 'fail' : 'pass', exp ? `Expired or invalid expiry (${String(a.expiresAt)}).` : `Valid through ${a.expiresAt}.`);
  add('enabled', 'Enabled', a.enabled ? 'pass' : 'fail', a.enabled ? 'Auto-book is on.' : 'Auto-book is off.');
  add('vault', 'Vault connection', i.vaultConnected ? 'pass' : 'fail', i.vaultConnected ? 'Mock vault connected (fake references only).' : 'Connect the mock vault first.');
  const sc = validScope(a.scope);
  add('scope', 'Approved scope', sc ? 'pass' : 'fail', sc ? 'Approved traveler/cabin/airline scope intact.' : 'Approved scope is missing or invalid.');
  const blocked = checks.some((c) => c.status === 'fail');
  if (sc) {
    const o = i.offer;
    add('travelers', 'Travelers', o.passengers === a.scope.passengers ? 'pass' : 'fail', `Offer for ${o.passengers}; approved ${a.scope.passengers}.`);
    add('cabin', 'Cabin', o.cabin === a.scope.cabin ? 'pass' : 'fail', `Offer ${o.cabin}; approved ${a.scope.cabin}.`);
    const alOk = a.scope.airlines.length === 0 || a.scope.airlines.includes(o.airline);
    add('airline', 'Airline', alOk ? 'pass' : 'fail', a.scope.airlines.length ? `${o.airline}; approved: ${a.scope.airlines.join(', ')}.` : 'Any airline approved.');
  }

  const rules = rulesFor(i.offer, a.policy);
  for (const r of rules) add(`rule:${r.id}`, r.label, r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'unknown', r.explanation);
  const total = i.offer.totalCents;
  const underCap = total <= a.spendCapCents;
  add('spend', 'Spending cap', underCap ? 'pass' : 'fail', `Repriced ${usd(total)} vs cap ${usd(a.spendCapCents)}.`);
  const needsConf = total > a.confirmThresholdCents;
  add('confirm', 'Confirmation threshold', !needsConf ? 'pass' : i.confirmed ? 'pass' : 'hold',
    !needsConf ? `${usd(total)} is within ${usd(a.confirmThresholdCents)}; no confirmation needed.` : i.confirmed ? `Confirmed by user above ${usd(a.confirmThresholdCents)}.` : `${usd(total)} is above ${usd(a.confirmThresholdCents)}; you must confirm.`);

  let decision: GateDecision;
  if (blocked) decision = 'BLOCK';
  else if (checks.some((c) => c.status === 'fail')) decision = 'REJECT';
  else if (checks.some((c) => c.status === 'unknown')) decision = 'NEEDS_REVIEW';
  else if (checks.some((c) => c.status === 'hold')) decision = 'NEEDS_CONFIRMATION';
  else decision = 'BOOK';
  const reasons = checks.filter((c) => c.status !== 'pass').map((c) => `${c.label}: ${c.detail}`);
  return { decision, checks, reasons };
}

export type PurchaseOutcome = 'BOOKED' | 'DUPLICATE' | 'NEEDS_CONFIRMATION' | 'REJECTED' | 'NEEDS_REVIEW' | 'BLOCKED' | 'ERROR';

export interface PurchaseContext {
  provider: FlightProvider;
  authority: Authority;
  offer: FlightOffer;
  scenario: RepriceScenario;
  finalScenario?: RepriceScenario;
  vault: { connected: boolean; vaultRef: string; travelerLabel: string; cardDisplay: string };
  now: Date;
  confirmed: boolean;
  /** Required for any confirmed purchase: the exact total the user saw and confirmed (cents). */
  confirmedTotalCents?: number;
  existingReceipts: BookingReceipt[];
}
export interface PurchaseResult { outcome: PurchaseOutcome; gate: GateResult | null; audit: AuditEntry[]; receipt: BookingReceipt | null; pricedCents: number | null }

export function idempotencyKey(authorityId: string, offerId: string): string { return `${authorityId}|${offerId}`; }

export async function runPurchase(c: PurchaseContext): Promise<PurchaseResult> {
  const audit: AuditEntry[] = [];
  const log = (kind: string, message: string) => audit.push({ at: c.now.toISOString(), kind, message });
  const key = idempotencyKey(c.authority.id, c.offer.id);
  log('purchase.requested', `Auto-book requested for ${c.offer.airline} ${c.offer.origin}-${c.offer.destination} (${c.offer.id}).`);

  const dup = c.existingReceipts.find((r) => r.idempotencyKey === key);
  if (dup) {
    log('order.duplicate_suppressed', `Order already exists (${dup.reference}); no second order created.`);
    return { outcome: 'DUPLICATE', gate: null, audit, receipt: dup, pricedCents: dup.totalCents };
  }
  const cap = c.authority.policy.budgetCents;
  const confirmedTotal = c.confirmed && isPosSafeInt(c.confirmedTotalCents) ? c.confirmedTotalCents : undefined;
  const bad = (p: PricedOffer): string | null => {
    if (p.offerId !== c.offer.id || p.offer.id !== c.offer.id) return 'priced offer id does not match requested offer';
    if (p.source !== c.offer.source || p.offer.source !== c.offer.source) return 'priced source does not match requested offer source';
    if (p.totalCents !== p.offer.totalCents) return 'listed total disagrees with nested priced offer';
    if (p.currency !== p.offer.currency) return 'listed currency disagrees with nested priced offer';
    if (!Number.isSafeInteger(p.totalCents) || p.totalCents <= 0) return 'priced total is not a valid amount';
    return null;
  };
  const stopInconsistent = (why: string): PurchaseResult => { log('decision.rejected', `Pricing response inconsistent: ${why}.`); return { outcome: 'REJECTED', gate: null, audit, receipt: null, pricedCents: null }; };
  try {
    const p1 = await c.provider.priceOffer(c.offer.id, { scenario: c.scenario, capCents: cap, snapshot: c.offer, now: c.now });
    log('reprice.1', `Repriced via ${p1.source}: ${usd(c.offer.totalCents)} listed, ${usd(p1.totalCents)} now (scenario ${p1.scenario}).`);
    const b1 = bad(p1); if (b1) return stopInconsistent(b1);
    if (!p1.available) { log('decision.rejected', 'Offer is no longer available.'); return { outcome: 'REJECTED', gate: null, audit, receipt: null, pricedCents: null }; }
    const g1 = validatePurchase({ authority: c.authority, offer: p1.offer, now: c.now, vaultConnected: c.vault.connected, confirmed: confirmedTotal !== undefined && p1.totalCents <= confirmedTotal });
    log('gate.1', `Gate decision ${g1.decision}${g1.reasons.length ? `: ${g1.reasons.join(' | ')}` : ''}.`);
    const fin = (outcome: PurchaseOutcome, gate: GateResult, priced: number | null): PurchaseResult => ({ outcome, gate, audit, receipt: null, pricedCents: priced });
    if (g1.decision === 'BLOCK') return fin('BLOCKED', g1, p1.totalCents);
    if (g1.decision === 'REJECT') return fin('REJECTED', g1, p1.totalCents);
    if (g1.decision === 'NEEDS_REVIEW') return fin('NEEDS_REVIEW', g1, p1.totalCents);
    if (g1.decision === 'NEEDS_CONFIRMATION') { log('confirmation.required', `Total ${usd(p1.totalCents)} exceeds ${usd(c.authority.confirmThresholdCents)}; waiting for user.`); return fin('NEEDS_CONFIRMATION', g1, p1.totalCents); }

    let priced = p1;
    let gate = g1;
    if (confirmedTotal !== undefined) {
      const p2 = await c.provider.priceOffer(c.offer.id, { scenario: c.finalScenario ?? c.scenario, capCents: cap, snapshot: c.offer, now: c.now });
      log('reprice.final', `Final reprice before order: ${usd(p2.totalCents)} (scenario ${p2.scenario}).`);
      const b2 = bad(p2); if (b2) return stopInconsistent(b2);
      if (!p2.available) { log('decision.rejected', 'Offer unavailable at final reprice.'); return { outcome: 'REJECTED', gate: null, audit, receipt: null, pricedCents: p2.totalCents }; }
      const g2 = validatePurchase({ authority: c.authority, offer: p2.offer, now: c.now, vaultConnected: c.vault.connected, confirmed: true });
      log('gate.final', `Final gate decision ${g2.decision}${g2.reasons.length ? `: ${g2.reasons.join(' | ')}` : ''}.`);
      if (g2.decision !== 'BOOK') return fin(g2.decision === 'BLOCK' ? 'BLOCKED' : g2.decision === 'REJECT' ? 'REJECTED' : g2.decision === 'NEEDS_REVIEW' ? 'NEEDS_REVIEW' : 'NEEDS_CONFIRMATION', g2, p2.totalCents);
      if (p2.totalCents > confirmedTotal) {
        log('confirmation.stale', `Price rose from the confirmed ${usd(confirmedTotal)} to ${usd(p2.totalCents)}; confirm again.`);
        return fin('NEEDS_CONFIRMATION', { ...g2, decision: 'NEEDS_CONFIRMATION', reasons: ['Price changed after confirmation.', ...g2.reasons] }, p2.totalCents);
      }
      priced = p2; gate = g2;
    }
    const receipt = await c.provider.createOrder({
      offerId: c.offer.id, expectedTotalCents: priced.totalCents, idempotencyKey: key, vaultRef: c.vault.vaultRef,
      travelerLabel: c.vault.travelerLabel, cardDisplay: c.vault.cardDisplay, authorityId: c.authority.id, snapshot: priced.offer, now: c.now,
    });
    if (receipt.totalCents !== priced.totalCents || receipt.offerId !== c.offer.id || receipt.idempotencyKey !== key) return stopInconsistent('order receipt disagrees with priced offer');
    log('order.created', `Simulated order ${receipt.reference} for ${usd(receipt.totalCents)}. No payment taken.`);
    const withCap: BookingReceipt = { ...receipt, capCents: cap, audit: [...audit] };
    return { outcome: 'BOOKED', gate, audit, receipt: withCap, pricedCents: priced.totalCents };
  } catch (e) {
    log('error', String(e));
    return { outcome: 'ERROR', gate: null, audit, receipt: null, pricedCents: null };
  }
}

export function offerPolicy(a: Authority, o: FlightOffer): Policy { return policyForOffer(a.policy, o); }
