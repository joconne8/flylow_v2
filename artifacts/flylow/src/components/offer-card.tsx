import { useState } from 'react';
import { ArrowRight, BellPlus, ShieldCheck, ChevronDown } from 'lucide-react';
import { type Explained } from '@/lib/results';
import { SOURCE_LABELS, fmtDate, fmtDuration, stopsLabel, usd } from '@/lib/types';
import { Pill } from './shell';
import { RuleList } from './rule-list';

export function OfferCard({ ex, onTrack, onApprove }: { ex: Explained; onTrack: () => void; onApprove: () => void }) {
  const [open, setOpen] = useState(false);
  const o = ex.offer;
  const tone = ex.verdict === 'match' ? 'ok' : ex.verdict === 'fail' ? 'bad' : 'warn';
  const stops = o.stopsOutbound === o.stopsReturn ? `${stopsLabel(o.stopsOutbound)} each way` : `${stopsLabel(o.stopsOutbound)} out, ${stopsLabel(o.stopsReturn)} back`;
  return (
    <article className="fl-card overflow-hidden rise" data-testid={`card-offer-${o.id}`}>
      <div className="grid sm:grid-cols-[1fr_auto]">
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground text-sm" data-testid={`text-airline-${o.id}`}>{o.airline}</span>
            <span>via {SOURCE_LABELS[o.source]}</span>
            {o.fixtureId && <span className="font-mono">fixture {o.fixtureId}</span>}
          </div>
          <div className="mt-2 flex items-center gap-3 font-serif text-2xl">
            <span>{o.origin}</span><ArrowRight className="h-4 w-4 text-accent" /><span>{o.destination}</span>
            <span className="font-sans text-sm text-muted-foreground">{fmtDate(o.departDate)} - {fmtDate(o.returnDate)}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {stops} / {o.longestLayoverHours > 0 ? `${o.longestLayoverHours}h longest layover` : 'no layover'} / {fmtDuration(o.durationOutMin)} out /{' '}
            {o.checkedBags === null ? 'bags unknown' : `${o.checkedBags} checked bag${o.checkedBags === 1 ? '' : 's'} included`} /{' '}
            {o.fareBrand === null ? 'fare brand unknown' : o.fareBrand === 'basic_economy' ? 'Basic economy' : o.cabin === 'economy' ? 'Standard economy' : `${o.cabin[0].toUpperCase()}${o.cabin.slice(1)}`}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ex.badges.map((b) => <Pill key={b} tone={ex.verdict === 'match' ? 'ok' : 'neutral'}>{b}</Pill>)}
            {ex.verdict !== 'match' && <Pill tone={tone} testId={`status-offer-${o.id}`}>{ex.headline}</Pill>}
            {ex.verdict === 'match' && <span data-testid={`status-offer-${o.id}`} className="sr-only">match</span>}
          </div>
        </div>
        <div className="border-t sm:border-t-0 sm:border-l border-dashed border-border p-4 sm:p-5 flex sm:flex-col items-center sm:items-end justify-between gap-2 bg-muted/40">
          <div className="text-right">
            <div className="font-serif text-3xl leading-none" data-testid={`text-price-${o.id}`}>{usd(o.totalCents)}</div>
            <div className="text-xs text-muted-foreground">total, {o.passengers} traveler{o.passengers > 1 ? 's' : ''}</div>
          </div>
          <div className="flex flex-wrap sm:flex-col gap-1.5 sm:items-stretch">
            <button className="fl-btn ghost" onClick={() => setOpen((v) => !v)} data-testid={`button-details-${o.id}`}>
              View details <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            <button className="fl-btn ghost" onClick={onTrack} data-testid={`button-track-${o.id}`}><BellPlus className="h-3.5 w-3.5" /> Track price</button>
            <button className="fl-btn" onClick={onApprove} data-testid={`button-approve-${o.id}`}><ShieldCheck className="h-3.5 w-3.5" /> Approve booking rule</button>
          </div>
        </div>
      </div>
      {open && (
        <div className="border-t border-border p-4 sm:p-5 bg-card" data-testid={`panel-details-${o.id}`}>
          <p className="text-xs text-muted-foreground mb-2">{o.note} Provider ref {o.providerRef}. Every rule is shown, passing or not.</p>
          <RuleList rules={ex.rules} />
        </div>
      )}
    </article>
  );
}
