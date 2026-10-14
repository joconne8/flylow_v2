// Deterministic demo route catalog. Finite, disclosed routes; nothing here is a real fare.
import { type Cabin, type FareBrand, type FlightOffer, type FlightSearchQuery, type SourceId, addDays, fnv } from './types';

export const ORIGINS = [
  { code: 'ORD', name: "Chicago O'Hare", adj: 0 },
  { code: 'MDW', name: 'Chicago Midway', adj: -15 },
  { code: 'JFK', name: 'New York JFK', adj: -30 },
] as const;

export const DESTINATIONS = [
  { code: 'DUB', city: 'Dublin', base: 560, hours: 8.2 },
  { code: 'LHR', city: 'London Heathrow', base: 520, hours: 8.0 },
  { code: 'CDG', city: 'Paris CDG', base: 540, hours: 8.6 },
  { code: 'AMS', city: 'Amsterdam', base: 530, hours: 8.4 },
  { code: 'FRA', city: 'Frankfurt', base: 550, hours: 8.8 },
  { code: 'MAD', city: 'Madrid', base: 600, hours: 9.2 },
  { code: 'LIS', city: 'Lisbon', base: 620, hours: 8.9 },
] as const;

export const PSEUDO_DESTINATIONS = [
  { code: 'ANY', label: 'Anywhere (all 7 demo routes)' },
  { code: 'EUR', label: 'Europe (all 7 demo routes)' },
] as const;

export const AIRLINES = ['Demo Air', 'Lakeshore Airways', 'Atlantic Reach', 'Nordwind', 'Meridian Jet', 'Shamrock Lines'] as const;

export const DEMO_ROUTE_DISCLOSURE =
  'Finite demo catalog: origins ORD, MDW, JFK; destinations DUB, LHR, CDG, AMS, FRA, MAD, LIS. "Anywhere" and "Europe" both expand to those same 7 routes.';

export function resolveDestinations(code: string): string[] {
  if (code === 'ANY' || code === 'EUR') return DESTINATIONS.map((d) => d.code);
  return DESTINATIONS.some((d) => d.code === code) ? [code] : [];
}
export function isKnownOrigin(code: string): boolean { return ORIGINS.some((o) => o.code === code); }

interface Tpl {
  src: SourceId; airline: string; delta: number; so: number; sr: number; st: boolean; ov: boolean;
  lay: number; brand: FareBrand; bags: number | null; dOut: number; dRet: number; near?: boolean; note: string;
}
const T: Tpl[] = [
  { src: 'demo', airline: 'Demo Air', delta: -20, so: 1, sr: 1, st: false, ov: false, lay: 2, brand: 'standard_economy', bags: 1, dOut: 3, dRet: 3, note: 'Protected connection, bag included.' },
  { src: 'demo', airline: 'Lakeshore Airways', delta: -95, so: 1, sr: 1, st: false, ov: false, lay: 3.5, brand: 'basic_economy', bags: 0, dOut: 1, dRet: 5, note: 'Cheap, but basic economy with no bag.' },
  { src: 'demo', airline: 'Demo Air', delta: 140, so: 0, sr: 0, st: false, ov: false, lay: 0, brand: 'standard_economy', bags: 1, dOut: 6, dRet: 2, note: 'Nonstop both ways.' },
  { src: 'amadeus-sandbox', airline: 'Atlantic Reach', delta: -60, so: 1, sr: 1, st: false, ov: false, lay: 2.5, brand: 'standard_economy', bags: 1, dOut: 4, dRet: 6, note: 'Mock Amadeus-shaped offer.' },
  { src: 'amadeus-sandbox', airline: 'Nordwind', delta: -115, so: 2, sr: 2, st: true, ov: true, lay: 9, brand: 'basic_economy', bags: 0, dOut: 2, dRet: 1, note: 'Self-transfer and overnight; very cheap.' },
  { src: 'amadeus-sandbox', airline: 'Atlantic Reach', delta: 60, so: 0, sr: 1, st: false, ov: false, lay: 2, brand: 'standard_economy', bags: 2, dOut: 5, dRet: 4, note: 'Nonstop out, one stop back, two bags.' },
  { src: 'amadeus-sandbox', airline: 'Meridian Jet', delta: -30, so: 1, sr: 1, st: false, ov: false, lay: 3, brand: null, bags: null, dOut: 7, dRet: 7, note: 'Fare brand and bags not disclosed by supplier.' },
  { src: 'duffel-sandbox', airline: 'Shamrock Lines', delta: -45, so: 1, sr: 1, st: false, ov: false, lay: 1.75, brand: 'standard_economy', bags: 1, dOut: 2, dRet: 8, note: 'Mock Duffel-shaped offer.' },
  { src: 'duffel-sandbox', airline: 'Meridian Jet', delta: 20, so: 1, sr: 1, st: false, ov: false, lay: 5.5, brand: 'standard_economy', bags: 2, dOut: 6, dRet: 3, note: 'Long layover.' },
  { src: 'duffel-sandbox', airline: 'Nordwind', delta: -70, so: 1, sr: 1, st: false, ov: true, lay: 14, brand: 'standard_economy', bags: 1, dOut: 3, dRet: 9, note: 'Overnight layover.' },
  { src: 'duffel-sandbox', airline: 'Shamrock Lines', delta: -15, so: 1, sr: 1, st: false, ov: false, lay: 2, brand: 'standard_economy', bags: 1, dOut: 0, dRet: 0, near: true, note: 'Departs just after your window.' },
  { src: 'demo', airline: 'Atlantic Reach', delta: -50, so: 1, sr: 1, st: false, ov: false, lay: 2, brand: 'standard_economy', bags: 1, dOut: 0, dRet: 0, near: true, note: 'Departs just after your window.' },
];

const CABIN_MULT: Record<Cabin, number> = { economy: 1, premium: 1.6, business: 3.2 };

const FIXTURE_BASE = {
  airline: 'Demo Air', origin: 'ORD', destination: 'DUB', departDate: '2027-05-23', returnDate: '2027-08-13',
  currency: 'USD', includesTaxesAndBags: true, stopsOutbound: 1, stopsReturn: 1, selfTransfer: false,
  overnightLayover: false, longestLayoverHours: 2,
} as const;
const FIXTURES: { id: 'A' | 'B' | 'C'; cents: number; brand: FareBrand; bags: number | null; note: string }[] = [
  { id: 'A', cents: 61200, brand: 'standard_economy', bags: 1, note: 'Fixture A: fits the brief on paper.' },
  { id: 'B', cents: 65100, brand: 'standard_economy', bags: 1, note: 'Fixture B: one dollar over a $650 cap.' },
  { id: 'C', cents: 60000, brand: null, bags: null, note: 'Fixture C: cheapest, fare brand and bags undisclosed.' },
];

/** Pure: offers a given source would return for a query. Same input, same output. */
export function buildOffers(q: FlightSearchQuery, source: SourceId): FlightOffer[] {
  const out: FlightOffer[] = [];
  const outSpan = Math.max(0, Math.round((Date.parse(q.outboundEnd) - Date.parse(q.outboundStart)) / 86400000));
  const retSpan = Math.max(0, Math.round((Date.parse(q.returnEnd) - Date.parse(q.returnStart)) / 86400000));
  if (!Number.isFinite(outSpan) || !Number.isFinite(retSpan)) return out;
  const mult = CABIN_MULT[q.cabin] * q.passengers;
  for (const o of q.origins) {
    const org = ORIGINS.find((x) => x.code === o);
    if (!org) continue;
    for (const dcode of q.destinations) {
      const dest = DESTINATIONS.find((x) => x.code === dcode);
      if (!dest) continue;
      if (source === 'demo' && o === 'ORD' && dcode === 'DUB') {
        for (const f of FIXTURES) {
          out.push({
            ...FIXTURE_BASE, id: `demo:ORD-DUB:fx${f.id}:${q.passengers}${q.cabin}`, source: 'demo', providerRef: `DEMO-${f.id}`,
            totalCents: Math.round(f.cents * mult), fareBrand: f.brand, checkedBags: f.bags, cabin: q.cabin, passengers: q.passengers,
            durationOutMin: 640, durationRetMin: 660, note: f.note, fixtureId: f.id,
          });
        }
      }
      T.forEach((t, i) => {
        if (t.src !== source) return;
        const jitter = (parseInt(fnv(`${dcode}${i}`).slice(0, 4), 16) % 41) - 20;
        const dollars = (dest.base + org.adj + t.delta + jitter) * mult;
        const dep = t.near ? addDays(q.outboundEnd, 9 + (i % 3)) : addDays(q.outboundStart, t.dOut % (outSpan + 1));
        const ret = addDays(q.returnStart, t.dRet % (retSpan + 1));
        const base = Math.round(dest.hours * 60);
        const lay = t.lay * 60;
        const brand: FareBrand = q.cabin !== 'economy' && t.brand === 'basic_economy' ? 'standard_economy' : t.brand;
        out.push({
          id: `${source}:${o}-${dcode}:${i}:${q.passengers}${q.cabin}`, source,
          providerRef: `${source === 'demo' ? 'DEMO' : source === 'amadeus-sandbox' ? 'AMD-SBX' : 'duf_off_sbx'}-${fnv(`${o}${dcode}${i}`).slice(0, 6)}`,
          airline: t.airline, origin: o, destination: dcode, departDate: dep, returnDate: ret, currency: 'USD',
          totalCents: Math.round(dollars) * 100, includesTaxesAndBags: true, stopsOutbound: t.so, stopsReturn: t.sr,
          selfTransfer: t.st, overnightLayover: t.ov, longestLayoverHours: t.lay, fareBrand: brand, checkedBags: t.bags,
          cabin: q.cabin, passengers: q.passengers, durationOutMin: base + t.so * 40 + (t.so ? lay : 0),
          durationRetMin: base + 40 + t.sr * 40 + (t.sr ? lay : 0), note: t.note,
        });
      });
    }
  }
  return out;
}
