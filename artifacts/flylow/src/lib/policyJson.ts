// Structured JSON view of a policy: build, parse, validate. Never approves anything.
import { type Policy, type PolicyDraft, validatePolicy } from './policy';

export interface PolicyJson {
  origin: string;
  destination: string;
  outboundWindow: { start: string; end: string };
  returnWindow: { start: string; end: string };
  maxPriceUsd: number;
  checkedBags: number;
  allowBasicEconomy: boolean;
  allowSelfTransfer: boolean;
  allowOvernightLayover: boolean;
  maxStopsEachWay: number;
  maxLayoverHours: number;
}

export function policyToJson(p: Policy): PolicyJson {
  return {
    origin: p.origin, destination: p.destination,
    outboundWindow: { start: p.outboundStart, end: p.outboundEnd }, returnWindow: { start: p.returnStart, end: p.returnEnd },
    maxPriceUsd: p.budgetUsd, checkedBags: p.checkedBags, allowBasicEconomy: p.allowBasicEconomy,
    allowSelfTransfer: p.allowSelfTransfer, allowOvernightLayover: p.allowOvernight,
    maxStopsEachWay: Math.min(p.maxStopsOutbound, p.maxStopsReturn), maxLayoverHours: p.maxLayoverHours,
  };
}

export function draftToJsonText(d: PolicyDraft): string {
  return JSON.stringify({
    origin: d.origin, destination: d.destination,
    outboundWindow: { start: d.outboundStart, end: d.outboundEnd }, returnWindow: { start: d.returnStart, end: d.returnEnd },
    maxPriceUsd: d.budgetUsd === '' ? null : Number(d.budgetUsd), checkedBags: d.checkedBags === '' ? null : Number(d.checkedBags),
    allowBasicEconomy: d.allowBasicEconomy, allowSelfTransfer: d.allowSelfTransfer, allowOvernightLayover: d.allowOvernight,
    maxStopsEachWay: d.maxStopsOutbound === '' ? null : Number(d.maxStopsOutbound),
    maxLayoverHours: d.maxLayoverHours === '' ? null : Number(d.maxLayoverHours),
  }, null, 2);
}

export type JsonValidation =
  | { ok: true; policy: Policy; draft: PolicyDraft }
  | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

export function validatePolicyJson(text: string): JsonValidation {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, errors: ['Not valid JSON.'] }; }
  if (!isObj(raw)) return { ok: false, errors: ['Top level must be an object.'] };
  const errors: string[] = [];
  const win = (k: string) => {
    const w = raw[k];
    if (!isObj(w) || typeof w.start !== 'string' || typeof w.end !== 'string') { errors.push(`${k} needs string start and end.`); return { start: '', end: '' }; }
    return { start: w.start, end: w.end };
  };
  const str = (k: string) => { if (typeof raw[k] !== 'string') errors.push(`${k} must be a string.`); return String(raw[k] ?? ''); };
  const num = (k: string) => { const v = raw[k]; if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${k} must be a number.`); return ''; } return String(v); };
  const bool = (k: string) => { const v = raw[k]; if (typeof v !== 'boolean') { errors.push(`${k} must be true or false.`); return null; } return v; };
  const ow = win('outboundWindow'); const rw = win('returnWindow');
  const stops = num('maxStopsEachWay');
  const draft: PolicyDraft = {
    origin: str('origin'), destination: str('destination'), outboundStart: ow.start, outboundEnd: ow.end,
    returnStart: rw.start, returnEnd: rw.end, budgetUsd: num('maxPriceUsd'), checkedBags: num('checkedBags'),
    allowBasicEconomy: bool('allowBasicEconomy'), maxStopsOutbound: stops, maxStopsReturn: stops,
    allowSelfTransfer: bool('allowSelfTransfer'), allowOvernight: bool('allowOvernightLayover'), maxLayoverHours: num('maxLayoverHours'),
  };
  if (errors.length) return { ok: false, errors };
  const v = validatePolicy(draft);
  if (!v.ok) return { ok: false, errors: Object.values(v.errors).filter((x): x is string => !!x) };
  return { ok: true, policy: v.policy, draft };
}
