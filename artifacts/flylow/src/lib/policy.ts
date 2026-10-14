// Pure policy model, validation and sample handling. No side effects.

export interface Policy {
  origin: string;
  destination: string;
  outboundStart: string; // YYYY-MM-DD
  outboundEnd: string;
  returnStart: string;
  returnEnd: string;
  budgetUsd: number;
  budgetCents: number;
  checkedBags: number;
  allowBasicEconomy: boolean;
  maxStopsOutbound: number;
  maxStopsReturn: number;
  allowSelfTransfer: boolean;
  allowOvernight: boolean;
  maxLayoverHours: number;
}

/** Editable form state: text for inputs, explicit boolean or null (unset) for toggles. */
export interface PolicyDraft {
  origin: string;
  destination: string;
  outboundStart: string;
  outboundEnd: string;
  returnStart: string;
  returnEnd: string;
  budgetUsd: string;
  checkedBags: string;
  allowBasicEconomy: boolean | null;
  maxStopsOutbound: string;
  maxStopsReturn: string;
  allowSelfTransfer: boolean | null;
  allowOvernight: boolean | null;
  maxLayoverHours: string;
}

export type PolicyField = keyof PolicyDraft;
export type FieldErrors = Partial<Record<PolicyField, string>>;
export type ValidationResult =
  | { ok: true; policy: Policy; errors: FieldErrors }
  | { ok: false; policy: null; errors: FieldErrors };

export const SAMPLE_REQUEST =
  'Fly ORD to DUB May 20–27, 2027, return August 10–17, 2027, under $650 all-in, one checked bag, no basic economy, no self-transfer or overnight layover, at most one stop each way and max 4-hour layover. Auto-book only in simulation.';

export const UNSUPPORTED_MESSAGE = 'Use the sample or edit the policy fields below.';

export const EMPTY_DRAFT: PolicyDraft = {
  origin: '', destination: '', outboundStart: '', outboundEnd: '', returnStart: '', returnEnd: '',
  budgetUsd: '', checkedBags: '', allowBasicEconomy: null, maxStopsOutbound: '', maxStopsReturn: '',
  allowSelfTransfer: null, allowOvernight: null, maxLayoverHours: '',
};

/** Synthetic defaults that correspond exactly to SAMPLE_REQUEST. */
export const SAMPLE_DRAFT: PolicyDraft = {
  origin: 'ORD', destination: 'DUB',
  outboundStart: '2027-05-20', outboundEnd: '2027-05-27',
  returnStart: '2027-08-10', returnEnd: '2027-08-17',
  budgetUsd: '650', checkedBags: '1', allowBasicEconomy: false,
  maxStopsOutbound: '1', maxStopsReturn: '1',
  allowSelfTransfer: false, allowOvernight: false, maxLayoverHours: '4',
};

export function normalizeRequest(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function isSampleRequest(text: string): boolean {
  return normalizeRequest(text) === normalizeRequest(SAMPLE_REQUEST);
}

/** Only the exact sample is supported. Never parses arbitrary text. */
export function createDemoPolicy(text: string):
  | { ok: true; draft: PolicyDraft }
  | { ok: false; message: string } {
  if (isSampleRequest(text)) return { ok: true, draft: { ...SAMPLE_DRAFT } };
  return { ok: false, message: UNSUPPORTED_MESSAGE };
}

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function nonNegInt(s: string, label: string): [number | null, string | undefined] {
  const t = s.trim();
  if (t === '') return [null, `${label} is required.`];
  if (!/^\d+$/.test(t)) return [null, `${label} must be a whole number of 0 or more.`];
  if (!Number.isSafeInteger(Number(t))) return [null, `${label} must be a safe whole number.`];
  return [Number(t), undefined];
}

export function dollarsToCents(usd: number): number {
  return Math.round(usd * 100);
}

export function validatePolicy(d: PolicyDraft): ValidationResult {
  const e: FieldErrors = {};
  const origin = d.origin.trim().toUpperCase();
  const destination = d.destination.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin)) e.origin = 'Use a 3-letter airport code.';
  if (!/^[A-Z]{3}$/.test(destination)) e.destination = 'Use a 3-letter airport code.';
  if (!e.origin && !e.destination && origin === destination)
    e.destination = 'Destination must differ from origin.';

  const dates: [PolicyField, string][] = [
    ['outboundStart', 'Outbound start'], ['outboundEnd', 'Outbound end'],
    ['returnStart', 'Return start'], ['returnEnd', 'Return end'],
  ];
  for (const [k, label] of dates) {
    const v = (d[k] as string).trim();
    if (v === '') e[k] = `${label} is required.`;
    else if (!isValidIsoDate(v)) e[k] = `${label} must be a real date (YYYY-MM-DD).`;
  }
  if (!e.outboundStart && !e.outboundEnd && d.outboundEnd < d.outboundStart)
    e.outboundEnd = 'Outbound end must be on or after outbound start.';
  if (!e.returnStart && !e.returnEnd && d.returnEnd < d.returnStart)
    e.returnEnd = 'Return end must be on or after return start.';
  if (!e.outboundEnd && !e.returnStart && !e.outboundStart && d.returnStart <= d.outboundEnd)
    e.returnStart = 'Return window must start after the outbound window ends.';

  let budgetUsd = NaN;
  const b = d.budgetUsd.trim();
  if (b === '') e.budgetUsd = 'Budget is required.';
  else if (!/^\d+(\.\d{1,2})?$/.test(b)) e.budgetUsd = 'Use a positive amount with at most 2 decimals.';
  else {
    budgetUsd = Number(b);
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) e.budgetUsd = 'Budget must be greater than 0.';
    else if (!Number.isSafeInteger(dollarsToCents(budgetUsd))) e.budgetUsd = 'Budget is too large.';
  }

  const [bags, bagsErr] = nonNegInt(d.checkedBags, 'Checked bags');
  if (bagsErr) e.checkedBags = bagsErr;
  const [so, soErr] = nonNegInt(d.maxStopsOutbound, 'Outbound stops');
  if (soErr) e.maxStopsOutbound = soErr;
  const [sr, srErr] = nonNegInt(d.maxStopsReturn, 'Return stops');
  if (srErr) e.maxStopsReturn = srErr;

  let layover = NaN;
  const l = d.maxLayoverHours.trim();
  if (l === '') e.maxLayoverHours = 'Max layover is required.';
  else if (!/^\d+(\.\d+)?$/.test(l)) e.maxLayoverHours = 'Use a number of hours, 0 or more.';
  else {
    layover = Number(l);
    if (!Number.isFinite(layover) || layover < 0) e.maxLayoverHours = 'Use a number of hours, 0 or more.';
  }

  if (typeof d.allowBasicEconomy !== 'boolean') e.allowBasicEconomy = 'Choose allow or block.';
  if (typeof d.allowSelfTransfer !== 'boolean') e.allowSelfTransfer = 'Choose allow or block.';
  if (typeof d.allowOvernight !== 'boolean') e.allowOvernight = 'Choose allow or block.';

  if (Object.keys(e).length > 0) return { ok: false, policy: null, errors: e };
  return {
    ok: true,
    errors: {},
    policy: {
      origin, destination,
      outboundStart: d.outboundStart.trim(), outboundEnd: d.outboundEnd.trim(),
      returnStart: d.returnStart.trim(), returnEnd: d.returnEnd.trim(),
      budgetUsd, budgetCents: dollarsToCents(budgetUsd),
      checkedBags: bags as number,
      allowBasicEconomy: d.allowBasicEconomy as boolean,
      maxStopsOutbound: so as number, maxStopsReturn: sr as number,
      allowSelfTransfer: d.allowSelfTransfer as boolean,
      allowOvernight: d.allowOvernight as boolean,
      maxLayoverHours: layover,
    },
  };
}

export interface ApprovalSnapshot {
  policy: Policy;
  approvedAt: string; // ISO
}

export function approvePolicy(draft: PolicyDraft, consent: boolean, now: Date = new Date()):
  | { ok: true; approval: ApprovalSnapshot }
  | { ok: false; reason: string } {
  if (!consent) return { ok: false, reason: 'Consent checkbox is required.' };
  const v = validatePolicy(draft);
  if (!v.ok) return { ok: false, reason: 'Policy has invalid fields.' };
  return { ok: true, approval: { policy: v.policy, approvedAt: now.toISOString() } };
}

export function policiesEqual(a: Policy, b: Policy): boolean {
  return (Object.keys(a) as (keyof Policy)[]).every((k) => a[k] === b[k]);
}

/** True only if the approval exists and matches the currently valid draft exactly. */
export function approvalMatches(draft: PolicyDraft, approval: ApprovalSnapshot | null): boolean {
  if (!approval) return false;
  const v = validatePolicy(draft);
  return v.ok && policiesEqual(v.policy, approval.policy);
}
