import { useState } from 'react';
import { Link } from 'wouter';
import { RefreshCw, Trash2, Bell } from 'lucide-react';
import { PageTitle, Pill } from '@/components/shell';
import { mutate, useAppState } from '@/lib/store';
import { type AlertPrefs, type Tracker, checkTracker } from '@/lib/tracker';
import { fmtRange, fmtTime, SOURCE_LABELS, usd } from '@/lib/types';
import { PROVIDERS } from '@/lib/providers';

function TrackerCard({ t }: { t: Tracker }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const last = t.samples[0];
  const setAlert = (k: keyof AlertPrefs, v: boolean) =>
    mutate((s) => ({ ...s, trackers: s.trackers.map((x) => (x.id === t.id ? { ...x, alerts: { ...x.alerts, [k]: v } } : x)) }));
  const check = async () => {
    setBusy(true); setErr('');
    try {
      const now = new Date();
      const r = await checkTracker(t, PROVIDERS, now);
      if (r.errors.length) setErr(r.errors.join('; '));
      mutate((s) => ({
        ...s,
        trackers: s.trackers.map((x) => (x.id === t.id ? { ...x, samples: [r.sample, ...x.samples].slice(0, 50) } : x)),
        notifications: [...r.notifications, ...s.notifications].slice(0, 100),
      }));
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  };
  const status = !last ? 'Not checked yet' : last.bestCents !== null ? 'Match found' : last.reviewCount > 0 ? 'Needs review' : 'No match';
  const tone = !last ? 'neutral' : last.bestCents !== null ? 'ok' : last.reviewCount > 0 ? 'warn' : 'bad';
  const s = t.settings;
  return (
    <article className="fl-card p-5" data-testid={`card-tracker-${t.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-2xl">{s.origin} to {s.destination}</h3>
          <p className="text-sm text-muted-foreground">{fmtRange(s.outboundStart, s.outboundEnd)} / {fmtRange(s.returnStart, s.returnEnd)} / Target under ${s.budgetUsd}</p>
        </div>
        <Pill tone={tone} testId={`status-tracker-${t.id}`}>{status}</Pill>
      </div>
      <div className="mt-3 grid sm:grid-cols-3 gap-3 text-sm">
        <div><span className="fl-label">Current best match</span><span className="font-serif text-2xl" data-testid={`text-best-${t.id}`}>{last?.bestCents != null ? usd(last.bestCents) : '-'}</span>
          {last?.bestAirline && <span className="text-xs text-muted-foreground block">{last.bestAirline} via {last.bestSource ? SOURCE_LABELS[last.bestSource] : ''}</span>}</div>
        <div><span className="fl-label">Last checked</span>{last ? fmtTime(last.checkedAt) : 'Never'}<span className="text-xs text-muted-foreground block">User-triggered only. No background service.</span></div>
        <div><span className="fl-label">Alerts (mock, in-app only)</span>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(['email', 'sms', 'push', 'autoBook'] as const).map((k) => (
              <label key={k} className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="checkbox" checked={t.alerts[k]} onChange={(e) => setAlert(k, e.target.checked)} data-testid={`toggle-${k}-${t.id}`} className="accent-[hsl(var(--primary))]" />
                {k === 'autoBook' ? 'Auto-book' : k === 'sms' ? 'SMS' : k[0].toUpperCase() + k.slice(1)}
              </label>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="fl-btn" onClick={check} disabled={busy} data-testid={`button-check-${t.id}`}><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> {busy ? 'Checking' : 'Check offers now'}</button>
        <button className="fl-btn danger" onClick={() => mutate((x) => ({ ...x, trackers: x.trackers.filter((y) => y.id !== t.id) }))} data-testid={`button-delete-${t.id}`}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
      </div>
      {err && <p className="text-sm text-destructive mt-2">{err}</p>}
      <details className="mt-4">
        <summary className="text-sm cursor-pointer font-medium">Check history ({t.samples.length})</summary>
        {t.samples.length === 0 ? <p className="text-sm text-muted-foreground mt-2">No checks yet. Each check you run records one real local sample here.</p> : (
          <table className="w-full text-sm mt-2" data-testid={`table-history-${t.id}`}>
            <thead><tr className="text-left text-xs text-muted-foreground"><th>Checked</th><th>Offers</th><th>Match</th><th>Review</th><th>Best match</th><th>Cheapest any</th></tr></thead>
            <tbody>{t.samples.map((x) => (
              <tr key={x.id} className="border-t border-border"><td className="py-1">{fmtTime(x.checkedAt)}</td><td>{x.offersSeen}</td><td>{x.matchCount}</td><td>{x.reviewCount}</td>
                <td>{x.bestCents != null ? usd(x.bestCents) : '-'}</td><td>{x.cheapestOverallCents != null ? usd(x.cheapestOverallCents) : '-'}</td></tr>
            ))}</tbody>
          </table>
        )}
      </details>
    </article>
  );
}

export default function TrackerPage() {
  const st = useAppState();
  return (
    <div>
      <PageTitle kicker="Track" title="Saved trackers" sub="Trackers are stored in this browser. A check runs only when you press the button; alert preferences only create in-app notices below. No email, SMS or push is ever sent." />
      {st.trackers.length === 0 ? (
        <div className="fl-card p-10 text-center" data-testid="empty-trackers">
          <Bell className="h-8 w-8 mx-auto text-accent" />
          <p className="font-serif text-2xl mt-2">Nothing tracked yet</p>
          <p className="text-sm text-muted-foreground mt-1">Run a search and press Track price on any result.</p>
          <Link href="/search" className="fl-btn mt-4" data-testid="link-start-search">Start a search</Link>
        </div>
      ) : <div className="space-y-4">{st.trackers.map((t) => <TrackerCard key={t.id} t={t} />)}</div>}

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl">Mock notifications</h2>
          {st.notifications.length > 0 && <button className="fl-btn ghost !py-1" onClick={() => mutate((s) => ({ ...s, notifications: [] }))} data-testid="button-clear-notifications">Clear</button>}
        </div>
        {st.notifications.length === 0 ? <p className="text-sm text-muted-foreground mt-2" data-testid="empty-notifications">No notifications. Run a tracker check.</p> : (
          <ul className="mt-3 space-y-2" data-testid="list-notifications">
            {st.notifications.map((n) => (
              <li key={n.id} className="fl-card p-3 text-sm flex flex-wrap gap-2 items-center">
                <Pill tone={n.kind === 'price' || n.kind === 'eligible' ? 'ok' : n.kind === 'review' ? 'warn' : 'neutral'}>{n.kind}</Pill>
                <span className="flex-1">{n.text}</span>
                <span className="text-xs text-muted-foreground">{fmtTime(n.at)} / {n.channels.length ? `mock ${n.channels.join(', ')} preference` : 'in-app only'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
