// Trackers: user-triggered local checks only. No background service, no real notifications.
import { type FlightProvider, searchAll } from './providers';
import { type SearchSettings, evaluateAll, settingsToQuery, normalizeSettings } from './results';
import { type FlightOffer, type SourceId, fnv, usd, fmtRange } from './types';

export interface AlertPrefs { email: boolean; sms: boolean; push: boolean; autoBook: boolean }
export interface Sample {
  id: string; checkedAt: string; offersSeen: number; matchCount: number; reviewCount: number;
  bestCents: number | null; bestOfferId: string | null; bestAirline: string | null; bestSource: SourceId | null;
  cheapestOverallCents: number | null;
}
export interface Tracker { id: string; createdAt: string; label: string; settings: SearchSettings; alerts: AlertPrefs; samples: Sample[] }
export interface AppNotification {
  id: string; at: string; trackerId: string | null; kind: 'price' | 'review' | 'eligible' | 'info'; text: string; channels: string[];
}

export function trackerLabel(s0: SearchSettings): string {
  const s = normalizeSettings(s0);
  return `${s.origin} to ${s.destination}, ${fmtRange(s.outboundStart, s.outboundEnd)} / ${fmtRange(s.returnStart, s.returnEnd)}, under $${s.budgetUsd}`;
}

export function createTracker(s: SearchSettings, now: Date = new Date()): Tracker {
  const n = normalizeSettings(s);
  return {
    id: `trk_${fnv(`${JSON.stringify(n)}|${now.toISOString()}`)}`, createdAt: now.toISOString(), label: trackerLabel(n),
    settings: n, alerts: { email: true, sms: false, push: true, autoBook: false }, samples: [],
  };
}

export function channelsOf(a: AlertPrefs): string[] {
  return [a.email && 'email', a.sms && 'sms', a.push && 'push'].filter((x): x is string => !!x);
}

/** Pure: summarize evaluated offers into a sample and notifications. */
export function buildSample(offers: FlightOffer[], s: SearchSettings, now: Date): { sample: Sample; best: FlightOffer | null; reviewBest: FlightOffer | null } {
  const ev = evaluateAll(offers, s);
  const matches = ev.explained.filter((e) => e.verdict === 'match').sort((a, b) => a.offer.totalCents - b.offer.totalCents);
  const reviews = ev.explained.filter((e) => e.verdict === 'review').sort((a, b) => a.offer.totalCents - b.offer.totalCents);
  const best = matches[0]?.offer ?? null;
  const cheapest = [...ev.explained].sort((a, b) => a.offer.totalCents - b.offer.totalCents)[0]?.offer ?? null;
  return {
    best, reviewBest: reviews[0]?.offer ?? null,
    sample: {
      id: `smp_${fnv(now.toISOString() + (best?.id ?? ''))}`, checkedAt: now.toISOString(), offersSeen: ev.explained.length,
      matchCount: matches.length, reviewCount: reviews.length, bestCents: best?.totalCents ?? null, bestOfferId: best?.id ?? null,
      bestAirline: best?.airline ?? null, bestSource: best?.source ?? null, cheapestOverallCents: cheapest?.totalCents ?? null,
    },
  };
}

export function notificationsFor(t: Tracker, best: FlightOffer | null, reviewBest: FlightOffer | null, now: Date): AppNotification[] {
  const ch = channelsOf(t.alerts);
  const cap = Math.round(Number(t.settings.budgetUsd) * 100);
  const n: AppNotification[] = [];
  const mk = (kind: AppNotification['kind'], text: string) => n.push({ id: `ntf_${fnv(`${t.id}${kind}${now.toISOString()}`)}`, at: now.toISOString(), trackerId: t.id, kind, text, channels: ch });
  if (best) {
    mk('price', `Price alert: ${best.origin}-${best.destination} is now ${usd(best.totalCents)}, ${usd(cap - best.totalCents)} under your cap.`);
    if (t.alerts.autoBook) mk('eligible', `Auto-book eligible: ${best.airline} ${usd(best.totalCents)} matches every rule. Open Auto-book to run the gate.`);
  } else if (reviewBest) {
    mk('review', `Review needed: ${usd(reviewBest.totalCents)} fare found on ${reviewBest.origin}-${reviewBest.destination}, but bag or fare brand is unknown.`);
  } else mk('info', `No matching fare for ${t.label} in this check.`);
  return n;
}

export async function checkTracker(t: Tracker, providers?: Record<SourceId, FlightProvider>, now: Date = new Date()) {
  const r = await searchAll(settingsToQuery(t.settings), providers);
  const { sample, best, reviewBest } = buildSample(r.offers, t.settings, now);
  return { sample, notifications: notificationsFor(t, best, reviewBest, now), errors: r.errors };
}
