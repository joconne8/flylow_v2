// Transparent deterministic request parser. Rules, not a model. Produces an editable draft,
// a field-by-field provenance list, and clarification questions. It never approves anything.
import { type PolicyDraft, EMPTY_DRAFT, isValidIsoDate, validatePolicy } from './policy';

export interface Clarification {
  id: 'origin' | 'destination' | 'year' | 'outbound' | 'return' | 'budget';
  question: string;
  options: { value: string; label: string }[];
  custom?: 'year' | 'number';
}
export type FieldSource = 'text' | 'answer' | 'assumed' | 'missing';
export interface ParsedField { key: keyof PolicyDraft; label: string; value: string; source: FieldSource; snippet?: string }
export interface ParseResult {
  draft: PolicyDraft;
  fields: ParsedField[];
  clarifications: Clarification[];
  complete: boolean; // no open clarifications and draft validates
}
export type Answers = Partial<Record<Clarification['id'], string>>;

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_RE = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)';
const DATE_SRC = `\\b(?:(early|mid|late)[\\s-]+)?${MONTH_RE}\\b\\.?(?:\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:\\s*(?:-|–|—|to)\\s*(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?)?)?(?:,?\\s+(20\\d{2}))?`;

export const DEMO_DEFAULT_YEAR = '2027';
const NUMWORDS: Record<string, number> = { no: 0, zero: 0, one: 1, a: 1, two: 2, three: 3 };

const DEST_NAMES: [RegExp, string][] = [
  [/\bdublin\b/, 'DUB'], [/\blondon\b/, 'LHR'], [/\bparis\b/, 'CDG'], [/\bamsterdam\b/, 'AMS'],
  [/\bfrankfurt\b/, 'FRA'], [/\bmadrid\b/, 'MAD'], [/\blisbon\b/, 'LIS'], [/\banywhere\b|\bsomewhere\b|\bany destination\b/, 'ANY'], [/\beurope\b/, 'EUR'],
];
const DEST_OPTIONS = [
  { value: 'ANY', label: 'Anywhere (7 demo routes)' }, { value: 'EUR', label: 'Europe (7 demo routes)' },
  ...['DUB', 'LHR', 'CDG', 'AMS', 'FRA', 'MAD', 'LIS'].map((c) => ({ value: c, label: c })),
];

interface Phrase { index: number; end: number; mod?: string; month: number; d1?: number; d2?: number; year?: number; text: string }

function daysIn(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const validPair = (v: string | undefined) => {
  if (!v) return null;
  const [a, b] = v.split('/');
  return a && b && isValidIsoDate(a) && isValidIsoDate(b) && b >= a ? ([a, b] as const) : null;
};

export function extractDatePhrases(text: string): Phrase[] {
  const out: Phrase[] = [];
  for (const m of text.matchAll(new RegExp(DATE_SRC, 'gi'))) {
    const month = MONTHS[m[2].toLowerCase()];
    const mod = m[1]?.toLowerCase();
    if (m[2].toLowerCase() === 'may' && !mod && m[3] === undefined) continue; // the verb, not the month
    out.push({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, mod, month, d1: m[3] ? Number(m[3]) : undefined, d2: m[4] ? Number(m[4]) : undefined, year: m[5] ? Number(m[5]) : undefined, text: m[0].trim() });
  }
  return out;
}

export function parseRequest(raw: string, answers: Answers = {}): ParseResult {
  const text = raw.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const d: PolicyDraft = { ...EMPTY_DRAFT };
  const fields: ParsedField[] = [];
  const clar: Clarification[] = [];
  const put = (key: keyof PolicyDraft, label: string, value: string, source: FieldSource, snippet?: string) => {
    (d as unknown as Record<string, unknown>)[key] = value;
    fields.push({ key, label, value, source, snippet });
  };
  const miss = (key: keyof PolicyDraft, label: string) => fields.push({ key, label, value: '', source: 'missing' });

  // Origin
  let origin: string | null = null; let oSrc: FieldSource = 'text'; let oSnip = '';
  const oc = lower.match(/\b(ord|mdw|jfk)\b/);
  if (answers.origin && ['ORD', 'MDW', 'JFK'].includes(answers.origin)) { origin = answers.origin; oSrc = 'answer'; oSnip = 'your answer'; }
  else if (oc) { origin = oc[1].toUpperCase(); oSnip = oc[0]; }
  else if (/o'?hare/.test(lower)) { origin = 'ORD'; oSnip = "O'Hare"; }
  else if (/midway/.test(lower)) { origin = 'MDW'; oSnip = 'Midway'; }
  else if (/new york|\bnyc\b/.test(lower)) { origin = 'JFK'; oSnip = 'New York'; }
  else if (/chicago/.test(lower)) {
    clar.push({ id: 'origin', question: "Did you mean Chicago O'Hare (ORD) or Chicago Midway (MDW)?", options: [{ value: 'ORD', label: "O'Hare (ORD)" }, { value: 'MDW', label: 'Midway (MDW)' }] });
  } else clar.push({ id: 'origin', question: 'Which origin airport? The demo catalog serves ORD, MDW and JFK.', options: [{ value: 'ORD', label: 'ORD' }, { value: 'MDW', label: 'MDW' }, { value: 'JFK', label: 'JFK' }] });
  if (origin) put('origin', 'Origin', origin, oSrc, oSnip); else miss('origin', 'Origin');

  // Destination
  let dest: string | null = null; let dSrc: FieldSource = 'text'; let dSnip = '';
  const dcode = lower.match(/\b(dub|lhr|cdg|ams|fra|mad|lis)\b/);
  if (answers.destination && DEST_OPTIONS.some((o) => o.value === answers.destination)) { dest = answers.destination; dSrc = 'answer'; dSnip = 'your answer'; }
  else if (dcode) { dest = dcode[1].toUpperCase(); dSnip = dcode[0]; }
  else {
    for (const [re, code] of DEST_NAMES) { const m = lower.match(re); if (m) { dest = code; dSnip = m[0]; break; } }
  }
  if (dest) put('destination', 'Destination', dest, dSrc, dSnip);
  else {
    miss('destination', 'Destination');
    clar.push({ id: 'destination', question: 'Where to? Only these demo destinations are available.', options: DEST_OPTIONS });
  }

  // Dates
  const phrases = extractDatePhrases(text);
  let outP: Phrase | undefined; let retP: Phrase | undefined;
  let prevEnd = 0;
  for (const p of phrases) {
    const between = text.slice(Math.max(prevEnd, p.index - 40), p.index).toLowerCase();
    const isRet = /return|back|home/.test(between);
    if (isRet && !retP) retP = p; else if (!outP && !isRet) outP = p; else if (!retP) retP = p;
    prevEnd = p.end;
  }
  const yearAns = answers.year && /^20\d{2}$/.test(answers.year.trim()) ? answers.year.trim() : null;
  const needsYear = [outP, retP].some((p) => p && p.year === undefined);
  if (needsYear && !yearAns) {
    clar.push({
      id: 'year', question: 'Which year? A year is required; no date is guessed.', custom: 'year',
      options: [{ value: DEMO_DEFAULT_YEAR, label: `Use demo default ${DEMO_DEFAULT_YEAR} (confirm)` }],
    });
  }
  const resolve = (p: Phrase | undefined, role: 'outbound' | 'return', label: string, a: keyof PolicyDraft, b: keyof PolicyDraft) => {
    if (!p) { miss(a, `${label} start`); miss(b, `${label} end`); clar.push({ id: role, question: `When is the ${role} window? Name a month and days, e.g. "May 20-27, 2027".`, options: [] }); return; }
    const y = p.year ?? (yearAns ? Number(yearAns) : null);
    const ans = validPair(answers[role]);
    if (ans) { put(a, `${label} start`, ans[0], 'answer', 'your answer'); put(b, `${label} end`, ans[1], 'answer', 'your answer'); return; }
    if (y === null) { miss(a, `${label} start`); miss(b, `${label} end`); return; }
    const last = daysIn(y, p.month);
    const mk = (x: number, z: number) => `${iso(y, p.month, x)}/${iso(y, p.month, Math.min(z, last))}`;
    const lab = (x: number, z: number) => `${p.text.replace(/\s+\d.*$/, '').replace(/^(early|mid|late)[\s-]+/i, '')} ${x}-${Math.min(z, last)}, ${y}`;
    if (p.d1 !== undefined && !p.mod) {
      const e = p.d2 ?? p.d1;
      const s0 = iso(y, p.month, p.d1); const e0 = iso(y, p.month, e);
      if (isValidIsoDate(s0) && isValidIsoDate(e0) && e0 >= s0) { put(a, `${label} start`, s0, 'text', p.text); put(b, `${label} end`, e0, 'text', p.text); return; }
      miss(a, `${label} start`); miss(b, `${label} end`);
      clar.push({ id: role, question: `"${p.text}" is not a real date range. Pick one.`, options: [{ value: mk(1, 31), label: `Whole month (${lab(1, 31)})` }] });
      return;
    }
    miss(a, `${label} start`); miss(b, `${label} end`);
    const opts = p.mod === 'late' ? [[20, 27, ' (demo default)'], [20, 31, '']] : p.mod === 'mid' ? [[10, 17, ' (demo default)'], [10, 20, ''], [8, 22, '']] : p.mod === 'early' ? [[1, 10, ' (demo default)'], [1, 15, '']] : [[1, 31, ' (whole month)']];
    clar.push({
      id: role, question: `Is "${p.text}" ${p.mod ? `${p.mod} ${p.month}` : 'a whole month'} - which exact days? Choose, or set exact dates in the JSON.`,
      options: (opts as [number, number, string][]).map(([x, z, s]) => ({ value: mk(x, z), label: `${lab(x, z)}${s}` })),
    });
  };
  resolve(outP, 'outbound', 'Outbound', 'outboundStart', 'outboundEnd');
  resolve(retP, 'return', 'Return', 'returnStart', 'returnEnd');

  // Budget
  const bm = answers.budget && /^\d+(\.\d{1,2})?$/.test(answers.budget.trim()) ? [answers.budget, answers.budget] : (text.match(/(?:under|below|less than|max(?:imum)?|up to|budget(?: of)?|within|<)\s*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i) ?? text.match(/\$\s*(\d[\d,]*(?:\.\d{1,2})?)/));
  if (bm) put('budgetUsd', 'Max total (USD)', bm[1].replace(/,/g, ''), answers.budget ? 'answer' : 'text', bm[0]);
  else { miss('budgetUsd', 'Max total (USD)'); clar.push({ id: 'budget', question: 'What is the maximum all-in total in USD?', options: [], custom: 'number' }); }

  // Bags
  const nb = lower.match(/\bno (?:checked )?bags?\b|carry-?on only/);
  const pb = lower.match(/\b(one|two|three|a|\d)\s+(?:checked\s+)?(?:bags?|suitcases?)\b/);
  if (nb) put('checkedBags', 'Checked bags', '0', 'text', nb[0]);
  else if (pb) put('checkedBags', 'Checked bags', String(NUMWORDS[pb[1]] ?? Number(pb[1])), 'text', pb[0]);
  else put('checkedBags', 'Checked bags', '0', 'assumed');

  const tog = (key: 'allowBasicEconomy' | 'allowSelfTransfer' | 'allowOvernight', label: string, no: RegExp, yes: RegExp) => {
    const n = lower.match(no); const y = lower.match(yes);
    if (n) { put(key, label, '', 'text', n[0]); d[key] = false; }
    else if (y) { put(key, label, '', 'text', y[0]); d[key] = true; }
    else { put(key, label, '', 'assumed'); d[key] = false; }
    fields[fields.length - 1].value = d[key] ? 'allowed' : 'blocked';
  };
  tog('allowBasicEconomy', 'Basic economy', /(?:no|avoid|not|without|exclude) basic/, /allow basic|basic(?: economy)? (?:is )?(?:ok|fine|okay)/);
  tog('allowSelfTransfer', 'Self-transfer', /(?:no|avoid|without) self[- ]?transfer/, /self[- ]?transfer (?:is )?(?:ok|fine|allowed)|allow self/);
  tog('allowOvernight', 'Overnight layover', /(?:no|avoid|without) overnight/, /overnight (?:is )?(?:ok|fine|allowed)|allow overnight/);

  // Stops
  let stops: string | null = null; let ss = '';
  if (/non-?stop|\bdirect\b/.test(lower)) { stops = '0'; ss = 'nonstop'; }
  else { const sm = lower.match(/\b(one|two|zero|no|\d)\s+stops?\b/); if (sm) { stops = String(NUMWORDS[sm[1]] ?? Number(sm[1])); ss = sm[0]; } }
  if (stops !== null) { put('maxStopsOutbound', 'Max stops outbound', stops, 'text', ss); put('maxStopsReturn', 'Max stops return', stops, 'text', ss); }
  else { put('maxStopsOutbound', 'Max stops outbound', '1', 'assumed'); put('maxStopsReturn', 'Max stops return', '1', 'assumed'); }

  const lm = lower.match(/(\d+(?:\.\d+)?)[\s-]*(?:hour|hr|h)s?\s+(?:max\s+)?layover/) ?? lower.match(/layover (?:of |under |max |up to |at most )?(\d+(?:\.\d+)?)/);
  if (lm) put('maxLayoverHours', 'Max layover (h)', lm[1], 'text', lm[0]); else put('maxLayoverHours', 'Max layover (h)', '4', 'assumed');

  const complete = clar.length === 0 && validatePolicy(d).ok;
  return { draft: d, fields, clarifications: clar, complete };
}
