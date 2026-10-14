import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { RefreshCw, SlidersHorizontal } from 'lucide-react';
import { PageTitle, Pill } from '@/components/shell';
import { OfferCard } from '@/components/offer-card';
import { PrimaryFields, SecondaryFields, type SetFn } from '@/components/search-controls';
import { PROVIDERS, searchAll } from '@/lib/providers';
import { evaluateAll, settingsToQuery, type SearchSettings } from '@/lib/results';
import { mutate, useAppState } from '@/lib/store';
import { createTracker } from '@/lib/tracker';
import { type FlightOffer, fmtTime, usd } from '@/lib/types';

export default function ResultsPage() {
  const st = useAppState();
  const [, nav] = useLocation();
  const s = st.settings;
  const [offers, setOffers] = useState<FlightOffer[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [refreshed, setRefreshed] = useState('');
  const [nonce, setNonce] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [notice, setNotice] = useState('');
  const set: SetFn = (k, v) => mutate((x) => ({ ...x, settings: { ...x.settings, [k]: v } as SearchSettings }));
  const qKey = JSON.stringify(settingsToQuery(s)) + nonce;

  useEffect(() => {
    let live = true;
    setOffers(null);
    searchAll(settingsToQuery(s), PROVIDERS).then((r) => {
      if (!live) return;
      setOffers(r.offers); setErrors(r.errors); setRefreshed(r.refreshedAt);
    }).catch((e) => { if (live) { setErrors([String(e)]); setOffers([]); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey]);

  const ev = useMemo(() => (offers ? evaluateAll(offers, s) : null), [offers, s]);
  const track = useCallback(() => {
    const t = createTracker(s);
    if (st.trackers.some((x) => x.label === t.label && JSON.stringify(x.settings) === JSON.stringify(t.settings))) { setNotice('Already tracking this search.'); return; }
    mutate((x) => ({ ...x, trackers: [t, ...x.trackers] }));
    setNotice('Tracker saved. Open Track and run a check whenever you like.');
  }, [s, st.trackers]);

  const counts = ev?.ok ? { m: ev.explained.filter((e) => e.verdict === 'match').length, r: ev.explained.filter((e) => e.verdict === 'review').length, f: ev.explained.filter((e) => e.verdict === 'fail').length } : null;

  return (
    <div>
      <PageTitle kicker="Results" title={`${s.origin} to ${s.destination === 'ANY' ? 'Anywhere' : s.destination === 'EUR' ? 'Europe' : s.destination}`}
        sub="Every offer is explained against your rules: match, fail or needs review. Filters remove offers; rules explain the rest." />
      <details className="fl-card p-4 mb-5" open data-testid="panel-filters">
        <summary className="cursor-pointer font-semibold flex items-center gap-2 text-sm"><SlidersHorizontal className="h-4 w-4" /> Search and filters</summary>
        <div className="mt-4 space-y-4"><PrimaryFields s={s} set={set} /><SecondaryFields s={s} set={set} /></div>
      </details>

      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-muted-foreground" data-testid="bar-meta">
        <span>Sources: Demo Air, Amadeus Sandbox (MOCK), Duffel Sandbox (MOCK)</span>
        <span data-testid="text-refreshed">Last refreshed: {refreshed ? fmtTime(refreshed) : '...'}</span>
        <button className="fl-btn ghost !py-1 !text-xs" onClick={() => setNonce((n) => n + 1)} data-testid="button-refresh"><RefreshCw className="h-3 w-3" /> Refresh</button>
        {counts && <><Pill tone="ok" testId="count-match">{counts.m} match</Pill><Pill tone="warn" testId="count-review">{counts.r} review</Pill><Pill tone="bad" testId="count-fail">{counts.f} fail</Pill></>}
        {notice && <span className="text-primary font-medium" data-testid="text-notice">{notice} {notice.startsWith('Tracker') && <Link href="/tracker" className="underline">Go to Track</Link>}</span>}
      </div>

      {errors.length > 0 && (
        <div className="fl-card p-4 mb-4 border-destructive" data-testid="error-search">
          <p className="text-sm">Some sources failed: {errors.join('; ')}</p>
          <button className="fl-btn mt-2" onClick={() => setNonce((n) => n + 1)}>Retry</button>
        </div>
      )}

      {!ev && (
        <div className="space-y-3" data-testid="skeleton-results">{[0, 1, 2].map((i) => <div key={i} className="fl-card h-32 animate-pulse bg-muted" />)}</div>
      )}
      {ev && !ev.ok && (
        <div className="fl-card p-5" data-testid="error-policy">
          <p className="font-semibold">Search rules are incomplete or invalid.</p>
          <ul className="list-disc pl-5 text-sm text-destructive mt-2">{Object.values(ev.errors).map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      {ev?.ok && ev.explained.length === 0 && (
        <div className="fl-card p-8 text-center" data-testid="empty-results">
          <p className="font-serif text-xl">No offers survive these filters.</p>
          <p className="text-sm text-muted-foreground mt-1">{ev.hidden.length} offer(s) were hidden by stops, layover, airline or bag filters. Loosen a filter or check that the route exists in the demo catalog.</p>
        </div>
      )}
      <div className="space-y-3">
        {ev?.ok && ev.explained.map((e) => <OfferCard key={e.offer.id} ex={e} onTrack={track} onApprove={() => nav('/autobook')} />)}
      </div>
      {ev?.ok && ev.hidden.length > 0 && (
        <div className="mt-6">
          <button className="fl-btn ghost" onClick={() => setShowHidden((v) => !v)} data-testid="button-toggle-hidden">{showHidden ? 'Hide' : 'Show'} {ev.hidden.length} filtered-out offers</button>
          {showHidden && (
            <ul className="mt-3 text-sm space-y-1" data-testid="list-hidden">
              {ev.hidden.map((h) => <li key={h.offer.id} className="text-muted-foreground">{h.offer.airline} {h.offer.origin}-{h.offer.destination} {usd(h.offer.totalCents)}: hidden, {h.why.join(', ')}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
