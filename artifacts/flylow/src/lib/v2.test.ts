import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, applyFilters, evaluateAll, settingsToPolicy, settingsToQuery } from './results';
import { createProviders, type FlightProvider } from './providers';
import { createAuthority, invalidateOnPolicyEdit, revokeAuthority, runPurchase, validatePurchase, type Authority } from './authority';
import { parseRequest } from './nlParse';
import { createTracker, checkTracker } from './tracker';
import { addReceiptIfNew, emptyState, parseStoredState, serializeState } from './store';
import type { FlightOffer, BookingReceipt } from './types';

const now = new Date('2026-10-14T03:00:00Z');
const policyResult = settingsToPolicy(DEFAULT_SETTINGS);
if (!policyResult.ok) throw new Error('Invalid demo defaults');
const policy = policyResult.policy;
function authority(threshold = 62500): Authority {
  const a = createAuthority({ policy, scope: { passengers: 1, cabin: 'economy', airlines: [] }, expiresAt: '2027-04-30', spendCapCents: 65000, confirmThresholdCents: threshold }, now);
  if (!a.ok) throw new Error(a.errors.join('; '));
  return a.authority;
}
async function fixture() {
  const providers = createProviders();
  const offers = await providers.demo.searchFlights(settingsToQuery(DEFAULT_SETTINGS));
  const a = offers.find(o => o.fixtureId === 'A');
  assert.ok(a);
  return { providers, offers, a };
}
function purchase(provider: FlightProvider, offer: FlightOffer, auth = authority(), overrides: Record<string, unknown> = {}) {
  return runPurchase({
    provider, offer, authority: auth, now, scenario: 'unchanged', confirmed: false,
    vault: { connected: true, vaultRef: 'vault_pay_demo_4242', travelerLabel: 'Demo Traveler', cardDisplay: 'Visa ending 4242' },
    existingReceipts: [], ...overrides,
  });
}

test('A matches, B fails, C needs review; hard filters actually remove offers', async () => {
  const { offers } = await fixture();
  const ev = evaluateAll(offers, DEFAULT_SETTINGS);
  assert.equal(ev.ok, true);
  for (const [id, verdict] of [['A', 'match'], ['B', 'fail'], ['C', 'review']]) {
    assert.equal(ev.explained.find(e => e.offer.fixtureId === id)?.verdict, verdict);
  }
  const f = applyFilters(offers, { ...DEFAULT_SETTINGS, maxStops: 0 });
  assert.ok(f.hidden.length);
  assert.ok(f.visible.every(o => o.stopsOutbound === 0 && o.stopsReturn === 0));
});

test('ambiguous Chicago and dates require explicit clarification; answers create validated draft', () => {
  const text = 'Find me a cheap flight from Chicago to Dublin in late May, returning mid August, under $650, one checked bag, no basic economy.';
  const first = parseRequest(text);
  assert.equal(first.complete, false);
  assert.ok(first.clarifications.some(c => c.id === 'origin'));
  assert.ok(first.clarifications.some(c => c.id === 'year'));
  const final = parseRequest(text, { origin: 'ORD', year: '2027', outbound: '2027-05-20/2027-05-27', return: '2027-08-10/2027-08-17' });
  assert.equal(final.complete, true);
  assert.equal(final.draft.budgetUsd, '650');
  assert.equal(final.draft.allowBasicEconomy, false);
  assert.equal(parseRequest('').complete, false);
});

test('mock providers all return local offers and remain visibly disconnected', async () => {
  const providers = createProviders();
  for (const p of Object.values(providers)) {
    assert.equal(p.info.mock, true);
    assert.equal(p.info.connected, false);
    assert.ok((await p.searchFlights(settingsToQuery(DEFAULT_SETTINGS))).length > 0);
  }
});

test('authority blocks expired, revoked, edited, switched off, or missing vault', async () => {
  const { a } = await fixture();
  const base = authority();
  const gate = (auth: Authority, connected = true) => validatePurchase({ authority: auth, offer: a, now, vaultConnected: connected, confirmed: false }).decision;
  assert.equal(gate(base), 'BOOK');
  assert.equal(gate({ ...base, expiresAt: '2020-01-01' }), 'BLOCK');
  assert.equal(gate({ ...base, expiresAt: 'not-a-date' }), 'BLOCK');
  assert.equal(gate(revokeAuthority(base, now)), 'BLOCK');
  assert.equal(gate(invalidateOnPolicyEdit(base, { ...policy, checkedBags: 2 }, now)), 'BLOCK');
  assert.equal(gate({ ...base, enabled: false }), 'BLOCK');
  assert.equal(gate(base, false), 'BLOCK');
});

test('reprice above cap rejects and unknown bag/fare requires review without order', async () => {
  const { providers, a } = await fixture();
  const risen = await purchase(providers.demo, a, authority(), { scenario: 'risen' });
  assert.equal(risen.outcome, 'REJECTED');
  assert.equal(risen.receipt, null);
  const missing = await purchase(providers.demo, a, authority(), { scenario: 'missing' });
  assert.equal(missing.outcome, 'NEEDS_REVIEW');
  assert.equal(missing.receipt, null);
});

test('threshold needs confirmation; final reprice revalidates, stale confirmation cannot book', async () => {
  const { providers, a } = await fixture();
  const auth = authority(60000);
  assert.equal((await purchase(providers.demo, a, auth)).outcome, 'NEEDS_CONFIRMATION');
  assert.notEqual((await purchase(providers.demo, a, auth, { confirmed: true })).outcome, 'BOOKED');
  const yes = await purchase(providers.demo, a, auth, { confirmed: true, confirmedTotalCents: a.totalCents });
  assert.equal(yes.outcome, 'BOOKED');
  const rise = await purchase(providers.demo, a, auth, { confirmed: true, confirmedTotalCents: a.totalCents, finalScenario: 'risen' });
  assert.equal(rise.outcome, 'REJECTED');
});

test('unavailable final fare and inconsistent provider totals cannot create receipt', async () => {
  const { providers, a } = await fixture();
  let calls = 0;
  const unavailable: FlightProvider = {
    searchFlights: q => providers.demo.searchFlights(q),
    priceOffer: async (id, opts) => ({ ...await providers.demo.priceOffer(id, opts), available: ++calls < 2 }),
    createOrder: () => { throw new Error('Should not create order'); },
  };
  assert.notEqual((await purchase(unavailable, a, authority(60000), { confirmed: true, confirmedTotalCents: a.totalCents })).outcome, 'BOOKED');
  const inconsistent: FlightProvider = {
    ...unavailable,
    priceOffer: async (id, opts) => ({ ...await providers.demo.priceOffer(id, opts), totalCents: 100 }),
  };
  assert.notEqual((await purchase(inconsistent, a)).outcome, 'BOOKED');
});

test('receipt is simulated, auditable, idempotent and survives serialized local state', async () => {
  const { providers, a } = await fixture();
  const auth = authority();
  const first = await purchase(providers.demo, a, auth);
  assert.equal(first.outcome, 'BOOKED');
  assert.ok(first.receipt);
  const receipt = first.receipt as BookingReceipt;
  assert.equal(receipt.mock, true);
  assert.match(receipt.disclaimer, /No ticket issued/);
  assert.ok(receipt.audit.some(e => e.kind === 'reprice.1'));
  const repeat = await purchase(providers.demo, a, auth, { existingReceipts: [receipt] });
  assert.equal(repeat.outcome, 'DUPLICATE');
  let state = addReceiptIfNew(emptyState(), receipt);
  state = addReceiptIfNew(state, receipt);
  assert.equal(state.receipts.length, 1);
  assert.equal(parseStoredState(serializeState(state)).receipts.length, 1);
  assert.equal(parseStoredState('{broken').recovered, true);
  assert.equal(parseStoredState('{"version":99}').receipts.length, 0);
});

test('tracker checks produce actual local samples and mock alert preferences', async () => {
  const tracker = createTracker(DEFAULT_SETTINGS, now);
  const r = await checkTracker(tracker, createProviders(), now);
  assert.ok(r.sample.matchCount > 0);
  assert.ok(r.sample.bestCents !== null);
  assert.equal(r.sample.checkedAt, now.toISOString());
  assert.ok(r.notifications.some(n => n.kind === 'price'));
  assert.deepEqual(r.notifications[0].channels, ['email', 'push']);
});
