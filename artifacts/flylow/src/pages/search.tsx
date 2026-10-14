import { useState } from 'react';
import { useLocation } from 'wouter';
import { Search as SearchIcon } from 'lucide-react';
import { PageTitle } from '@/components/shell';
import { NlPanel } from '@/components/nl-panel';
import { PrimaryFields, SecondaryFields, type SetFn } from '@/components/search-controls';
import { DEMO_ROUTE_DISCLOSURE } from '@/lib/catalog';
import { draftToSettings, settingsToPolicy, normalizeSettings, type SearchSettings } from '@/lib/results';
import { getState, mutate } from '@/lib/store';

export default function SearchPage() {
  const [, nav] = useLocation();
  const [s, setS] = useState<SearchSettings>(() => getState().settings);
  const [errors, setErrors] = useState<string[]>([]);
  const set: SetFn = (k, v) => setS((p) => ({ ...p, [k]: v }));

  const submit = () => {
    const n = normalizeSettings(s);
    const v = settingsToPolicy(n);
    if (!v.ok) { setErrors(Object.values(v.errors).filter((x): x is string => !!x)); return; }
    setErrors([]);
    mutate((st) => ({ ...st, settings: n }));
    nav('/results');
  };

  return (
    <div>
      <PageTitle kicker="Search / Track / Auto-book" title="Describe the trip once. FlyLow does the checking."
        sub="Flexible travelers get a marketplace-style search, a tracker that you trigger yourself, and an auto-book authority that can only act inside rules you can read." />
      <div className="mb-6">
        <NlPanel onApply={(d) => setS((p) => draftToSettings(d, p))} />
      </div>
      <section className="fl-card p-5 space-y-5" data-testid="form-search">
        <PrimaryFields s={s} set={set} />
        <SecondaryFields s={s} set={set} />
        {errors.length > 0 && <ul className="text-sm text-destructive list-disc pl-5" data-testid="list-search-errors">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="fl-btn amber !px-6 !py-3 !text-base" onClick={submit} data-testid="button-search"><SearchIcon className="h-4 w-4" /> Search flights</button>
          <p className="text-xs text-muted-foreground max-w-xl">{DEMO_ROUTE_DISCLOSURE}</p>
        </div>
      </section>
    </div>
  );
}
