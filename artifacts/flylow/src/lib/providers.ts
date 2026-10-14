// FlightProvider interface plus three MOCK implementations. No network, no credentials.
import { buildOffers } from './catalog';
import {
  type BookingReceipt, type BookingRequest, type FlightOffer, type FlightSearchQuery, type PriceOptions,
  type PricedOffer, type SourceId, RECEIPT_DISCLAIMER_V2, fnv,
} from './types';

export interface FlightProvider {
  searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]>;
  priceOffer(offerId: string, opts?: PriceOptions): Promise<PricedOffer>;
  createOrder(request: BookingRequest): Promise<BookingReceipt>;
}

export interface ProviderInfo { id: SourceId; label: string; connected: false; mock: true; flow: string }

abstract class MockProvider implements FlightProvider {
  abstract readonly info: ProviderInfo;
  protected abstract orderRef(key: string): string;
  private known = new Map<string, FlightOffer>();

  async searchFlights(query: FlightSearchQuery): Promise<FlightOffer[]> {
    const offers = buildOffers(query, this.info.id);
    for (const o of offers) this.known.set(o.id, o);
    return offers;
  }

  async priceOffer(offerId: string, opts: PriceOptions = {}): Promise<PricedOffer> {
    const base = this.known.get(offerId) ?? (opts.snapshot && opts.snapshot.id === offerId ? opts.snapshot : undefined);
    if (!base) throw new Error(`Unknown offer ${offerId} for ${this.info.label}`);
    const scenario = opts.scenario ?? 'unchanged';
    let offer: FlightOffer = { ...base };
    if (scenario === 'risen') {
      offer.totalCents = Math.max(base.totalCents + 4500, (opts.capCents ?? 0) + 100);
    } else if (scenario === 'missing') {
      offer = { ...offer, checkedBags: null, fareBrand: null };
    }
    return {
      offerId, offer, totalCents: offer.totalCents, currency: offer.currency, scenario,
      pricedAt: (opts.now ?? new Date()).toISOString(), available: true, source: this.info.id, mock: true,
    };
  }

  async createOrder(req: BookingRequest): Promise<BookingReceipt> {
    const base = req.snapshot && req.snapshot.id === req.offerId ? req.snapshot : this.known.get(req.offerId);
    if (!base) throw new Error(`Unknown offer ${req.offerId}`);
    if (base.source !== this.info.id) throw new Error('Offer belongs to a different provider');
    if (!Number.isSafeInteger(req.expectedTotalCents) || req.expectedTotalCents !== base.totalCents) throw new Error('Expected total does not match the repriced snapshot');
    const at = (req.now ?? new Date()).toISOString();
    const h = fnv(req.idempotencyKey);
    return {
      id: `rcpt_${h}`, reference: this.orderRef(req.idempotencyKey), idempotencyKey: req.idempotencyKey,
      offerId: base.id, source: this.info.id, airline: base.airline, origin: base.origin, destination: base.destination,
      departDate: base.departDate, returnDate: base.returnDate,
      fareBrand: base.fareBrand === 'basic_economy' ? 'Basic economy' : base.fareBrand ? 'Standard economy' : 'Undisclosed',
      checkedBags: base.checkedBags ?? 0, totalCents: req.expectedTotalCents, capCents: null, createdAt: at,
      vaultRef: req.vaultRef, travelerLabel: req.travelerLabel, cardDisplay: req.cardDisplay,
      authorityId: req.authorityId ?? null, disclaimer: RECEIPT_DISCLAIMER_V2, mock: true, audit: [],
    };
  }
}

export class DemoProvider extends MockProvider {
  readonly info: ProviderInfo = { id: 'demo', label: 'Demo Air', connected: false, mock: true, flow: 'local sample data' };
  protected orderRef(k: string) { return `DEMO-${fnv(k).slice(0, 6).toUpperCase()}`; }
}
export class AmadeusSandboxProvider extends MockProvider {
  readonly info: ProviderInfo = { id: 'amadeus-sandbox', label: 'Amadeus Sandbox', connected: false, mock: true, flow: 'flight-offers-search, flight-offers-pricing, flight-orders (shape only)' };
  protected orderRef(k: string) { return `MOCK-AMD-${fnv(k).slice(0, 6).toUpperCase()}`; }
}
export class DuffelSandboxProvider extends MockProvider {
  readonly info: ProviderInfo = { id: 'duffel-sandbox', label: 'Duffel Sandbox', connected: false, mock: true, flow: 'offer_requests, offers, orders (shape only)' };
  protected orderRef(k: string) { return `ord_mock_${fnv(k).slice(0, 8)}`; }
}

export function createProviders(): Record<SourceId, MockProvider> {
  return { demo: new DemoProvider(), 'amadeus-sandbox': new AmadeusSandboxProvider(), 'duffel-sandbox': new DuffelSandboxProvider() };
}
/** Shared singleton registry used by the UI. */
export const PROVIDERS = createProviders();

export async function searchAll(query: FlightSearchQuery, providers: Record<SourceId, FlightProvider> = PROVIDERS) {
  const ids = Object.keys(providers) as SourceId[];
  const settled = await Promise.allSettled(ids.map((id) => providers[id].searchFlights(query)));
  const offers: FlightOffer[] = [];
  const errors: string[] = [];
  settled.forEach((r, i) => (r.status === 'fulfilled' ? offers.push(...r.value) : errors.push(`${ids[i]}: ${String(r.reason)}`)));
  return { offers, errors, refreshedAt: new Date().toISOString() };
}
