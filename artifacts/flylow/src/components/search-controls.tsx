import { type ReactNode } from 'react';
import { AIRLINES, DESTINATIONS, ORIGINS, PSEUDO_DESTINATIONS } from '@/lib/catalog';
import { type SearchSettings, type SortKey } from '@/lib/results';
import { type Cabin } from '@/lib/types';

export type SetFn = <K extends keyof SearchSettings>(k: K, v: SearchSettings[K]) => void;

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <label className={className}><span className="fl-label">{label}</span>{children}</label>;
}

export function Toggle({ label, on, set, id }: { label: string; on: boolean; set: (v: boolean) => void; id: string }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} data-testid={`toggle-${id}`} className="h-4 w-4 accent-[hsl(var(--primary))]" />
      {label}
    </label>
  );
}

export function PrimaryFields({ s, set }: { s: SearchSettings; set: SetFn }) {
  const exact = s.dateMode === 'exact';
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <Field label="Where from?" className="lg:col-span-1">
        <select className="fl-input" value={s.origin} onChange={(e) => set('origin', e.target.value)} data-testid="select-origin">
          {ORIGINS.map((o) => <option key={o.code} value={o.code}>{o.code} {o.name}</option>)}
        </select>
      </Field>
      <Field label="Where to?" className="lg:col-span-1">
        <select className="fl-input" value={s.destination} onChange={(e) => set('destination', e.target.value)} data-testid="select-destination">
          {PSEUDO_DESTINATIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
          {DESTINATIONS.map((d) => <option key={d.code} value={d.code}>{d.code} {d.city}</option>)}
        </select>
      </Field>
      <div className="lg:col-span-2">
        <span className="fl-label">Depart {exact ? '(exact date)' : '(window)'}</span>
        <div className="flex gap-1.5">
          <input type="date" className="fl-input" value={s.outboundStart} onChange={(e) => set('outboundStart', e.target.value)} data-testid="input-outbound-start" />
          {!exact && <input type="date" className="fl-input" value={s.outboundEnd} onChange={(e) => set('outboundEnd', e.target.value)} data-testid="input-outbound-end" />}
        </div>
      </div>
      <div className="lg:col-span-2">
        <span className="fl-label">Return {exact ? '(exact date)' : '(window)'}</span>
        <div className="flex gap-1.5">
          <input type="date" className="fl-input" value={s.returnStart} onChange={(e) => set('returnStart', e.target.value)} data-testid="input-return-start" />
          {!exact && <input type="date" className="fl-input" value={s.returnEnd} onChange={(e) => set('returnEnd', e.target.value)} data-testid="input-return-end" />}
        </div>
      </div>
    </div>
  );
}

export function SecondaryFields({ s, set, showAirlines = true }: { s: SearchSettings; set: SetFn; showAirlines?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Field label="Budget (USD, all travelers)">
          <input className="fl-input" inputMode="decimal" value={s.budgetUsd} onChange={(e) => set('budgetUsd', e.target.value)} data-testid="input-budget" />
        </Field>
        <Field label="Travelers">
          <input type="number" min={1} max={9} className="fl-input" value={s.passengers} onChange={(e) => set('passengers', Math.min(9, Math.max(1, Math.round(Number(e.target.value) || 1))))} data-testid="input-passengers" />
        </Field>
        <Field label="Cabin">
          <select className="fl-input" value={s.cabin} onChange={(e) => set('cabin', e.target.value as Cabin)} data-testid="select-cabin">
            <option value="economy">Economy</option><option value="premium">Premium economy</option><option value="business">Business</option>
          </select>
        </Field>
        <Field label="Checked bags needed">
          <input type="number" min={0} max={5} className="fl-input" value={s.checkedBags} onChange={(e) => set('checkedBags', Math.min(5, Math.max(0, Math.round(Number(e.target.value) || 0))))} data-testid="input-bags" />
        </Field>
        <Field label="Max stops each way">
          <select className="fl-input" value={s.maxStops} onChange={(e) => set('maxStops', Number(e.target.value))} data-testid="select-stops">
            <option value={0}>Nonstop only</option><option value={1}>Up to 1 stop</option><option value={2}>Up to 2 stops</option>
          </select>
        </Field>
        <Field label="Max layover (hours)">
          <input type="number" min={0} max={48} step={0.5} className="fl-input" value={s.maxLayoverHours} onChange={(e) => set('maxLayoverHours', Math.max(0, Number(e.target.value) || 0))} data-testid="input-layover" />
        </Field>
        <Field label="Sort by">
          <select className="fl-input" value={s.sort} onChange={(e) => set('sort', e.target.value as SortKey)} data-testid="select-sort">
            <option value="best">Best match</option><option value="price">Cheapest</option><option value="duration">Shortest</option><option value="stops">Fewest stops</option>
          </select>
        </Field>
        <div>
          <span className="fl-label">Dates</span>
          <div className="flex rounded-lg border border-input overflow-hidden text-sm" role="group">
            {(['flexible', 'exact'] as const).map((m) => (
              <button key={m} type="button" onClick={() => set('dateMode', m)} data-testid={`button-datemode-${m}`}
                className={`flex-1 py-2 font-medium ${s.dateMode === m ? 'bg-primary text-primary-foreground' : 'bg-card'}`}>{m === 'flexible' ? 'Flexible window' : 'Exact dates'}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Toggle id="basic" label="Allow basic economy" on={s.allowBasicEconomy} set={(v) => set('allowBasicEconomy', v)} />
        <Toggle id="selftransfer" label="Allow self-transfer" on={s.allowSelfTransfer} set={(v) => set('allowSelfTransfer', v)} />
        <Toggle id="overnight" label="Allow overnight layover" on={s.allowOvernight} set={(v) => set('allowOvernight', v)} />
      </div>
      {showAirlines && (
        <div>
          <span className="fl-label">Airlines {s.airlines.length === 0 ? '(all)' : `(${s.airlines.length} selected)`}</span>
          <div className="flex flex-wrap gap-1.5">
            {AIRLINES.map((a) => {
              const on = s.airlines.includes(a);
              return (
                <button key={a} type="button" onClick={() => set('airlines', on ? s.airlines.filter((x) => x !== a) : [...s.airlines, a])} data-testid={`chip-airline-${a.replace(/\s+/g, '-').toLowerCase()}`}
                  className={`fl-pill ${on ? 'ok' : 'neutral'} cursor-pointer`}>{a}</button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
