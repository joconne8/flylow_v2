// Search settings <-> policy, deterministic offer explanation, filters, sorting. Pure.
import { type Policy, type PolicyDraft, validatePolicy } from './policy';
import { type Offer } from './fixtures';
import { checkRules, type RuleResult } from './evaluateOffer';
import { type Cabin, type FlightOffer, type FlightSearchQuery, usd } from './types';
import { resolveDestinations } from './catalog';

export type SortKey = 'best' | 'price' | 'duration' | 'stops';

export interface SearchSettings {
  origin: string;
  destination: string; // airport code, 'ANY' or 'EUR'
  dateMode: 'flexible' | 'exact';
  outboundStart: string;
  outboundEnd: string;
  returnStart: string;
  returnEnd: string;
  budgetUsd: string;
  passengers: number;
  cabin: Cabin;
  checkedBags: number;
  maxStops: number;
  maxLayoverHours: number;
  airlines: string[]; // empty = all
  sort: SortKey;
  allowBasicEconomy: boolean;
  allowSelfTransfer: boolean;
  allowOvernight: boolean;
}

export const DEFAULT_SETTINGS: SearchSettings = {
  origin: 'ORD', destination: 'DUB', dateMode: 'flexible',
  outboundStart: '2027-05-20', outboundEnd: '2027-05-27', returnStart: '2027-08-10', returnEnd: '2027-08-17',
  budgetUsd: '650', passengers: 1, cabin: 'economy', checkedBags: 1, maxStops: 1, maxLayoverHours: 4,
  airlines: [], sort: 'best', allowBasicEconomy: false, allowSelfTransfer: false, allowOvernight: false,
};

export function normalizeSettings(s: SearchSettings): SearchSettings {
  return s.dateMode === 'exact' ? { ...s, outboundEnd: s.outboundStart, returnEnd: s.returnStart } : s;
}

export function settingsToDraft(s0: SearchSettings): PolicyDraft {
  const s = normalizeSettings(s0);
  return {
    origin: s.origin, destination: s.destination, outboundStart: s.outboundStart, outboundEnd: s.outboundEnd,
    returnStart: s.returnStart, returnEnd: s.returnEnd, budgetUsd: s.budgetUsd, checkedBags: String(s.checkedBags),
    allowBasicEconomy: s.allowBasicEconomy, maxStopsOutbound: String(s.maxStops), maxStopsReturn: String(s.maxStops),
    allowSelfTransfer: s.allowSelfTransfer, allowOvernight: s.allowOvernight, maxLayoverHours: String(s.maxLayoverHours),
  };
}

export function settingsToPolicy(s: SearchSettings) { return validatePolicy(settingsToDraft(s)); }

export function policyToDraft(p: Policy): PolicyDraft {
  return {
    origin: p.origin, destination: p.destination, outboundStart: p.outboundStart, outboundEnd: p.outboundEnd,
    returnStart: p.returnStart, returnEnd: p.returnEnd, budgetUsd: String(p.budgetUsd), checkedBags: String(p.checkedBags),
    allowBasicEconomy: p.allowBasicEconomy, maxStopsOutbound: String(p.maxStopsOutbound), maxStopsReturn: String(p.maxStopsReturn),
    allowSelfTransfer: p.allowSelfTransfer, allowOvernight: p.allowOvernight, maxLayoverHours: String(p.maxLayoverHours),
  };
}

export function draftToSettings(d: PolicyDraft, base: SearchSettings = DEFAULT_SETTINGS): SearchSettings {
  const n = (v: string, f: number) => (v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : f);
  const exact = d.outboundStart === d.outboundEnd && d.returnStart === d.returnEnd && d.outboundStart !== '';
  return {
    ...base, origin: d.origin.toUpperCase(), destination: d.destination.toUpperCase(),
    dateMode: exact ? 'exact' : 'flexible',
    outboundStart: d.outboundStart, outboundEnd: d.outboundEnd, returnStart: d.returnStart, returnEnd: d.returnEnd,
    budgetUsd: d.budgetUsd, checkedBags: n(d.checkedBags, base.checkedBags),
    maxStops: Math.max(n(d.maxStopsOutbound, base.maxStops), 0),
    maxLayoverHours: n(d.maxLayoverHours, base.maxLayoverHours),
    allowBasicEconomy: d.allowBasicEconomy ?? false, allowSelfTransfer: d.allowSelfTransfer ?? false, allowOvernight: d.allowOvernight ?? false,
  };
}

export function policyToSettings(p: Policy, base: SearchSettings = DEFAULT_SETTINGS) { return draftToSettings(policyToDraft(p), base); }

/** Defensive: coerce unknown stored data into valid SearchSettings, field by field. */
export function sanitizeSettings(x: unknown): SearchSettings {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const str = (k: keyof SearchSettings) => (typeof o[k] === 'string' ? (o[k] as string) : (d[k] as string));
  const num = (k: keyof SearchSettings, lo: number, hi: number) => {
    const v = o[k];
    return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : (d[k] as number);
  };
  const bool = (k: keyof SearchSettings) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : (d[k] as boolean));
  const cabin = ['economy', 'premium', 'business'].includes(o.cabin as string) ? (o.cabin as Cabin) : d.cabin;
  const sort = ['best', 'price', 'duration', 'stops'].includes(o.sort as string) ? (o.sort as SortKey) : d.sort;
  return {
    origin: str('origin'), destination: str('destination'), dateMode: o.dateMode === 'exact' ? 'exact' : 'flexible',
    outboundStart: str('outboundStart'), outboundEnd: str('outboundEnd'), returnStart: str('returnStart'), returnEnd: str('returnEnd'),
    budgetUsd: str('budgetUsd'), passengers: Math.round(num('passengers', 1, 9)), cabin, checkedBags: Math.round(num('checkedBags', 0, 5)),
    maxStops: Math.round(num('maxStops', 0, 2)), maxLayoverHours: num('maxLayoverHours', 0, 48),
    airlines: Array.isArray(o.airlines) ? (o.airlines as unknown[]).filter((a): a is string => typeof a === 'string') : [],
    sort, allowBasicEconomy: bool('allowBasicEconomy'), allowSelfTransfer: bool('allowSelfTransfer'), allowOvernight: bool('allowOvernight'),
  };
}

export function settingsToQuery(s0: SearchSettings): FlightSearchQuery {
  const s = normalizeSettings(s0);
  return {
    origins: s.origin === 'CHI' ? ['ORD', 'MDW'] : [s.origin], destinations: resolveDestinations(s.destination),
    outboundStart: s.outboundStart, outboundEnd: s.outboundEnd, returnStart: s.returnStart, returnEnd: s.returnEnd,
    passengers: s.passengers, cabin: s.cabin,
  };
}

/** Policy used to judge one concrete offer: Anywhere/Europe resolves to the offer's own disclosed route. */
export function policyForOffer(p: Policy, o: Pick<FlightOffer, 'destination'>): Policy {
  return p.destination === 'ANY' || p.destination === 'EUR' ? { ...p, destination: o.destination } : p;
}

export type Verdict = 'match' | 'fail' | 'review';
export interface Explained {
  offer: FlightOffer;
  verdict: Verdict;
  rules: RuleResult[];
  headline: string;
  badges: string[];
  failReasons: string[];
  reviewReasons: string[];
  underBudgetCents: number;
}

export function rulesFor(offer: FlightOffer, policy: Policy): RuleResult[] {
  // checkRules only reads shared structural fields; FlightOffer is a superset of the fixture Offer.
  return checkRules(offer as unknown as Offer, policyForOffer(policy, offer));
}

export function explainOffer(offer: FlightOffer, policy: Policy): Explained {
  const rules = rulesFor(offer, policy);
  const fails = rules.filter((r) => r.status === 'fail');
  const unknowns = rules.filter((r) => r.status === 'unknown');
  const verdict: Verdict = fails.length ? 'fail' : unknowns.length ? 'review' : 'match';
  const under = policy.budgetCents - offer.totalCents;
  const failText = (r: RuleResult) => {
    if (r.id === 'total' && offer.currency === 'USD' && under < 0) return `${usd(-under)} over budget`;
    return `${r.label.toLowerCase()}`;
  };
  const badges: string[] = [];
  if (verdict === 'match') {
    badges.push('Policy match');
    if (under > 0) badges.push(`${usd(under)} under budget`);
  }
  if ((offer.checkedBags ?? 0) >= 1 && rules.find((r) => r.id === 'bags')?.status === 'pass') badges.push('Bag included');
  if (!offer.overnightLayover) badges.push('No overnight');
  if (!offer.selfTransfer) badges.push('Protected');
  const reviewNames = unknowns.map((u) => (u.id === 'bags' ? 'bag unknown' : u.id === 'fare' ? 'fare brand unknown' : u.label.toLowerCase()));
  const headline = verdict === 'match' ? 'Matches every rule' : verdict === 'fail' ? `Fails: ${fails.map(failText).join(', ')}` : `Needs review: ${reviewNames.join(', ')}`;
  return {
    offer, verdict, rules, headline, badges, underBudgetCents: under,
    failReasons: fails.map((f) => `${f.label}: ${f.explanation}`), reviewReasons: unknowns.map((f) => `${f.label}: ${f.explanation}`),
  };
}

export interface FilterResult { visible: FlightOffer[]; hidden: { offer: FlightOffer; why: string[] }[] }

/** Hard result filters: stops, layover, airline, bags. These really remove offers. */
export function applyFilters(offers: FlightOffer[], s: SearchSettings): FilterResult {
  const visible: FlightOffer[] = [];
  const hidden: FilterResult['hidden'] = [];
  for (const o of offers) {
    const why: string[] = [];
    if (o.stopsOutbound > s.maxStops || o.stopsReturn > s.maxStops) why.push(`more than ${s.maxStops} stop(s)`);
    if (o.longestLayoverHours > s.maxLayoverHours) why.push(`layover over ${s.maxLayoverHours}h`);
    if (s.airlines.length && !s.airlines.includes(o.airline)) why.push('airline filtered');
    if (o.checkedBags !== null && o.checkedBags < s.checkedBags) why.push(`fewer than ${s.checkedBags} bag(s)`);
    (why.length ? hidden.push({ offer: o, why }) : visible.push(o));
  }
  return { visible, hidden };
}

export function sortExplained(list: Explained[], key: SortKey): Explained[] {
  const rank = { match: 0, review: 1, fail: 2 } as const;
  const tie = (a: Explained, b: Explained) => a.offer.id.localeCompare(b.offer.id);
  const c = [...list];
  c.sort((a, b) => {
    const p = a.offer.totalCents - b.offer.totalCents;
    if (key === 'price') return p || tie(a, b);
    if (key === 'duration') return (a.offer.durationOutMin + a.offer.durationRetMin) - (b.offer.durationOutMin + b.offer.durationRetMin) || p || tie(a, b);
    if (key === 'stops') return (a.offer.stopsOutbound + a.offer.stopsReturn) - (b.offer.stopsOutbound + b.offer.stopsReturn) || p || tie(a, b);
    return rank[a.verdict] - rank[b.verdict] || p || tie(a, b);
  });
  return c;
}

/** Full pipeline used by results page, trackers and the auto-book monitor. */
export function evaluateAll(offers: FlightOffer[], s: SearchSettings) {
  const v = settingsToPolicy(s);
  if (!v.ok) return { ok: false as const, errors: v.errors, explained: [] as Explained[], hidden: [] as FilterResult['hidden'] };
  const { visible, hidden } = applyFilters(offers, normalizeSettings(s));
  return { ok: true as const, errors: {}, policy: v.policy, explained: sortExplained(visible.map((o) => explainOffer(o, v.policy)), s.sort), hidden };
}
