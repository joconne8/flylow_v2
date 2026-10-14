// Deterministic, pure evaluation of a synthetic offer against an approved policy.
import { type ApprovalSnapshot, type PolicyDraft, approvalMatches, type Policy } from './policy';
import { type Offer, formatCents } from './fixtures';

export type RuleStatus = 'pass' | 'fail' | 'unknown';
export type Decision = 'BLOCK' | 'REJECT' | 'NEEDS_REVIEW' | 'BOOK_SIMULATED';

export interface RuleResult {
  id: string;
  label: string;
  status: RuleStatus;
  explanation: string;
}

export interface Receipt {
  reference: string;
  offerId: Offer['id'];
  airline: string;
  route: string;
  departDate: string;
  returnDate: string;
  fareBrand: string;
  checkedBags: number;
  totalCents: number;
  capCents: number;
  approvedAt: string;
  passedChecks: string[];
  disclaimer: string;
}

export interface Evaluation {
  decision: Decision;
  offerId: Offer['id'];
  rules: RuleResult[];
  reasons: string[];
  receipt: Receipt | null;
}

export const RECEIPT_DISCLAIMER = 'SIMULATED BOOKING - no ticket issued, no payment taken.';

const inWindow = (d: string, a: string, b: string) => d >= a && d <= b;

export function checkRules(offer: Offer, p: Policy): RuleResult[] {
  const r: RuleResult[] = [];
  const add = (id: string, label: string, status: RuleStatus, explanation: string) =>
    r.push({ id, label, status, explanation });

  const routeOk = offer.origin === p.origin && offer.destination === p.destination;
  add('route', 'Route', routeOk ? 'pass' : 'fail',
    `Offer ${offer.origin}-${offer.destination}; policy ${p.origin}-${p.destination}.`);

  add('outbound', 'Outbound window', inWindow(offer.departDate, p.outboundStart, p.outboundEnd) ? 'pass' : 'fail',
    `Departs ${offer.departDate}; allowed ${p.outboundStart} to ${p.outboundEnd}.`);

  add('return', 'Return window', inWindow(offer.returnDate, p.returnStart, p.returnEnd) ? 'pass' : 'fail',
    `Returns ${offer.returnDate}; allowed ${p.returnStart} to ${p.returnEnd}.`);

  if (offer.totalCents == null || !Number.isFinite(offer.totalCents)) add('total', 'Currency and total', 'unknown', 'All-in total is missing or unknown.');
  else if (offer.currency !== 'USD') add('total', 'Currency and total', 'fail', `Offer priced in ${offer.currency}; policy cap is USD.`);
  else if (!offer.includesTaxesAndBags) add('total', 'Currency and total', 'unknown', 'Total does not confirm taxes and bags are included.');
  else {
    const ok = Number.isSafeInteger(offer.totalCents) && offer.totalCents >= 0 && offer.totalCents <= p.budgetCents;
    add('total', 'Currency and total', ok ? 'pass' : 'fail',
      `All-in ${formatCents(offer.totalCents)} vs cap ${formatCents(p.budgetCents)} (${offer.totalCents} ${ok ? '<=' : '>'} ${p.budgetCents} cents).`);
  }

  if (offer.checkedBags === null) add('bags', 'Checked bags', 'unknown', `Bag allowance not disclosed; policy needs ${p.checkedBags}.`);
  else add('bags', 'Checked bags', offer.checkedBags >= p.checkedBags ? 'pass' : 'fail',
    `Includes ${offer.checkedBags}; policy needs ${p.checkedBags}.`);

  if (offer.fareBrand === null) add('fare', 'Fare brand', 'unknown', 'Fare brand not disclosed, so basic economy cannot be ruled out.');
  else if (offer.fareBrand === 'basic_economy')
    add('fare', 'Fare brand', p.allowBasicEconomy ? 'pass' : 'fail',
      `Basic economy; policy ${p.allowBasicEconomy ? 'allows' : 'blocks'} it.`);
  else add('fare', 'Fare brand', 'pass', 'Standard economy.');

  add('stopsOut', 'Stops outbound', offer.stopsOutbound <= p.maxStopsOutbound ? 'pass' : 'fail',
    `${offer.stopsOutbound} stop(s); max ${p.maxStopsOutbound}.`);
  add('stopsRet', 'Stops return', offer.stopsReturn <= p.maxStopsReturn ? 'pass' : 'fail',
    `${offer.stopsReturn} stop(s); max ${p.maxStopsReturn}.`);

  add('selfTransfer', 'Self-transfer', !offer.selfTransfer || p.allowSelfTransfer ? 'pass' : 'fail',
    offer.selfTransfer ? `Requires self-transfer; policy ${p.allowSelfTransfer ? 'allows' : 'blocks'} it.` : 'Protected connection, no self-transfer.');
  add('overnight', 'Overnight layover', !offer.overnightLayover || p.allowOvernight ? 'pass' : 'fail',
    offer.overnightLayover ? `Includes an overnight layover; policy ${p.allowOvernight ? 'allows' : 'blocks'} it.` : 'No overnight layover.');
  add('layover', 'Max layover', offer.longestLayoverHours <= p.maxLayoverHours ? 'pass' : 'fail',
    `Longest ${offer.longestLayoverHours}h; max ${p.maxLayoverHours}h.`);
  return r;
}

/**
 * Precedence: BLOCK (no matching valid approval) > REJECT (any fail) > NEEDS_REVIEW (any unknown) > BOOK_SIMULATED.
 */
export function evaluateOffer(offer: Offer, draft: PolicyDraft, approval: ApprovalSnapshot | null): Evaluation {
  if (!approval || !approvalMatches(draft, approval)) {
    return {
      decision: 'BLOCK', offerId: offer.id, rules: [], receipt: null,
      reasons: ['No valid approval matches the current policy. Approve the policy before evaluating.'],
    };
  }
  const p = approval.policy;
  const rules = checkRules(offer, p);
  const fails = rules.filter((x) => x.status === 'fail');
  const unknowns = rules.filter((x) => x.status === 'unknown');
  if (fails.length) return { decision: 'REJECT', offerId: offer.id, rules, receipt: null, reasons: fails.map((f) => `${f.label}: ${f.explanation}`) };
  if (unknowns.length) return { decision: 'NEEDS_REVIEW', offerId: offer.id, rules, receipt: null, reasons: unknowns.map((f) => `${f.label}: ${f.explanation}`) };
  return { decision: 'BOOK_SIMULATED', offerId: offer.id, rules, reasons: [], receipt: buildReceipt(offer, approval, rules) };
}

export function buildReceipt(offer: Offer, approval: ApprovalSnapshot, rules: RuleResult[]): Receipt {
  return {
    reference: `DEMO-${offer.id}`,
    offerId: offer.id,
    airline: offer.airline,
    route: `${offer.origin} - ${offer.destination}`,
    departDate: offer.departDate,
    returnDate: offer.returnDate,
    fareBrand: offer.fareBrand === 'basic_economy' ? 'Basic economy' : 'Standard economy',
    checkedBags: offer.checkedBags ?? 0,
    totalCents: offer.totalCents,
    capCents: approval.policy.budgetCents,
    approvedAt: approval.approvedAt,
    passedChecks: rules.filter((r) => r.status === 'pass').map((r) => r.label),
    disclaimer: RECEIPT_DISCLAIMER,
  };
}
