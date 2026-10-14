import { useMemo, useState, type ReactNode } from 'react';
import { Check, X, CircleHelp, ShieldCheck, ShieldAlert, Plane, RotateCcw, FileText, Lock, ArrowRight } from 'lucide-react';
import {
  type ApprovalSnapshot, type PolicyDraft, type PolicyField,
  EMPTY_DRAFT, SAMPLE_REQUEST, createDemoPolicy, validatePolicy, approvePolicy, approvalMatches,
} from '@/lib/policy';
import { OFFERS, formatCents, type Offer } from '@/lib/fixtures';
import { evaluateOffer, type Evaluation, type RuleStatus } from '@/lib/evaluateOffer';

function Step({ n, title, sub, children, locked }: { n: string; title: string; sub: string; children: ReactNode; locked?: boolean }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rise relative rounded-2xl border border-card-border bg-card p-5 sm:p-7 shadow-[0_1px_0_hsl(38_20%_80%),0_12px_30px_-18px_hsl(189_40%_20%/0.25)]">
      <header className="mb-5 flex items-start gap-4">
        <span className="font-mono text-xs font-semibold tracking-widest text-primary border border-primary/30 rounded-md px-2 py-1">{n}</span>
        <div className="flex-1">
          <h2 id={`step-${n}`} className="font-serif text-2xl leading-tight">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{sub}</p>
        </div>
        {locked && <Lock aria-hidden className="h-4 w-4 text-muted-foreground mt-2" />}
      </header>
      {children}
    </section>
  );
}

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100';
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`;
const btnGhost = `${btn} border border-input bg-card hover:bg-secondary`;

function TextField({ id, label, value, onChange, error, type = 'text', inputMode, hint }: {
  id: PolicyField; label: string; value: string; onChange: (v: string) => void; error?: string; type?: string; inputMode?: 'decimal' | 'numeric' | 'text'; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        id={id} type={type} inputMode={inputMode} value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
        data-testid={`input-${id}`}
        className={`rounded-lg border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors focus:ring-2 focus:ring-ring ${error ? 'border-destructive' : 'border-input'}`}
      />
      {error ? <p id={`${id}-err`} className="text-xs text-destructive" data-testid={`error-${id}`}>{error}</p>
        : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function BoolField({ id, label, value, onChange, error }: { id: PolicyField; label: string; value: boolean | null; onChange: (v: boolean) => void; error?: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{label}</legend>
      <div className={`inline-flex rounded-lg border p-0.5 bg-background w-fit ${error ? 'border-destructive' : 'border-input'}`}>
        {([['Block', false], ['Allow', true]] as const).map(([t, v]) => (
          <label key={t} className={`cursor-pointer rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${value === v ? (v ? 'bg-accent text-accent-foreground' : 'bg-primary text-primary-foreground') : 'text-muted-foreground hover:text-foreground'}`}>
            <input type="radio" className="sr-only" name={id} checked={value === v} onChange={() => onChange(v)} data-testid={`radio-${id}-${t.toLowerCase()}`} />
            {t}
          </label>
        ))}
      </div>
      {error && <p id={`${id}-err`} className="text-xs text-destructive">{error}</p>}
    </fieldset>
  );
}

const statusMeta: Record<RuleStatus, { icon: typeof Check; cls: string; text: string }> = {
  pass: { icon: Check, cls: 'text-chart-3 bg-chart-3/10', text: 'Pass' },
  fail: { icon: X, cls: 'text-destructive bg-destructive/10', text: 'Fail' },
  unknown: { icon: CircleHelp, cls: 'text-[hsl(30_70%_34%)] bg-accent/20', text: 'Unknown' },
};

function OfferCard({ o, selected, onSelect, cap }: { o: Offer; selected: boolean; onSelect: () => void; cap: number | null }) {
  const over = cap !== null && o.totalCents > cap;
  return (
    <label className={`perf relative block cursor-pointer rounded-xl border-2 p-4 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${selected ? 'border-primary bg-primary/[0.04]' : 'border-dashed border-border hover:border-input'}`} data-testid={`card-offer-${o.id}`}>
      <input type="radio" name="offer" className="sr-only" checked={selected} onChange={onSelect} data-testid={`radio-offer-${o.id}`} aria-label={`Offer ${o.id}, ${formatCents(o.totalCents)}`} />
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs tracking-widest text-muted-foreground">OFFER {o.id} / DEMO AIR</span>
        {selected && <span className="text-xs font-semibold text-primary">Selected</span>}
      </div>
      <div className="mt-2 flex items-center gap-2 font-serif text-xl">ORD <Plane aria-hidden className="h-4 w-4 text-accent" /> DUB</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${over ? 'text-destructive' : ''}`}>{formatCents(o.totalCents)}</div>
      <p className="text-xs text-muted-foreground">USD all-in, taxes and bags included</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Dates</dt><dd className="font-mono">May 23 / Aug 13</dd>
        <dt className="text-muted-foreground">Stops</dt><dd className="font-mono">1 out, 1 back</dd>
        <dt className="text-muted-foreground">Longest layover</dt><dd className="font-mono">2h, daytime</dd>
        <dt className="text-muted-foreground">Fare brand</dt><dd className="font-mono">{o.fareBrand === null ? 'not disclosed' : 'standard'}</dd>
        <dt className="text-muted-foreground">Checked bags</dt><dd className="font-mono">{o.checkedBags === null ? 'not disclosed' : o.checkedBags}</dd>
      </dl>
      <p className="mt-3 text-xs italic text-muted-foreground">{o.note}</p>
    </label>
  );
}

const decisionCopy = {
  BLOCK: { title: 'Blocked: no matching approval', cls: 'border-destructive/40 bg-destructive/5', icon: Lock },
  REJECT: { title: 'Rejected: this offer breaks your policy', cls: 'border-destructive/40 bg-destructive/5', icon: ShieldAlert },
  NEEDS_REVIEW: { title: 'Needs review: required details are unknown', cls: 'border-accent/60 bg-accent/10', icon: CircleHelp },
  BOOK_SIMULATED: { title: 'Simulated booking placed', cls: 'border-chart-3/40 bg-chart-3/5', icon: ShieldCheck },
} as const;

export default function BasicPage() {
  const [request, setRequest] = useState('');
  const [requestMsg, setRequestMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<PolicyDraft>(EMPTY_DRAFT);
  const [hasPolicy, setHasPolicy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [approval, setApproval] = useState<ApprovalSnapshot | null>(null);
  const [selected, setSelected] = useState<Offer['id'] | null>(null);
  const [result, setResult] = useState<Evaluation | null>(null);

  const validation = useMemo(() => validatePolicy(draft), [draft]);
  const approved = approvalMatches(draft, approval);
  const errorCount = Object.keys(validation.errors).length;
  const revoke = () => { setApproval(null); setConsent(false); setResult(null); };
  const edit = <K extends PolicyField>(k: K, v: PolicyDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setHasPolicy(true);
    revoke();
  };
  const createPolicy = () => {
    const r = createDemoPolicy(request);
    if (r.ok) { setDraft(r.draft); setHasPolicy(true); setRequestMsg(null); revoke(); }
    else setRequestMsg(r.message);
  };
  const approve = () => {
    const r = approvePolicy(draft, consent);
    if (r.ok) setApproval(r.approval);
  };
  const evaluate = () => {
    const o = OFFERS.find((x) => x.id === selected);
    if (o) setResult(evaluateOffer(o, draft, approval));
  };
  const reset = () => {
    setRequest(''); setRequestMsg(null); setDraft(EMPTY_DRAFT); setHasPolicy(false);
    setConsent(false); setApproval(null); setSelected(null); setResult(null);
  };
  const e = hasPolicy ? validation.errors : {};
  const cap = validation.ok ? validation.policy.budgetCents : null;

  return (
    <div className="paper-grain min-h-[100dvh] bg-background">
      <div role="note" className="sticky top-0 z-30 bg-foreground text-background text-center font-mono text-[11px] sm:text-xs tracking-wider py-2 px-3" data-testid="banner-prototype">
        Basic course prototype • simulated AI and booking • no live fares
      </div>
      <main className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 pb-24">
        <header className="pt-12 pb-10 sm:pt-16">
          <div className="flex items-center justify-between">
            <span className="font-serif text-xl font-semibold tracking-tight">Fly<span className="text-accent">Low</span> <span className="font-sans text-xs text-muted-foreground">Basic prototype</span></span>
            <a href="/" className={btnGhost} data-testid="link-flylow-v2">Explore FlyLow v2</a>
          </div>
          <h1 className="mt-10 font-serif text-4xl sm:text-6xl leading-[1.02] tracking-tight max-w-2xl">
            Set your limits <em className="text-primary">first.</em><br />Then let the fare come to you.
          </h1>
          <p className="mt-5 max-w-xl text-muted-foreground">
            FlyLow is not a search engine. You write the rules, approve them, and nothing gets booked unless an offer clears every one. Here, every booking is a simulation.
          </p>
        </header>
        <div className="flex flex-col gap-6">
          <Step n="01" title="Describe the trip" sub="This basic prototype only understands the sample trip. It never guesses at other text.">
            <label htmlFor="request" className="sr-only">Trip request</label>
            <textarea id="request" rows={4} value={request} onChange={(ev) => { setRequest(ev.target.value); setRequestMsg(null); }}
              placeholder="Load the sample trip to begin"
              className="w-full rounded-lg border border-input bg-background p-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ring" data-testid="input-request" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btnGhost} onClick={() => { setRequest(SAMPLE_REQUEST); setRequestMsg(null); }} data-testid="button-load-sample">Load sample trip</button>
              <button type="button" className={btnPrimary} onClick={createPolicy} disabled={!request.trim()} data-testid="button-create-policy">Create demo policy <ArrowRight className="h-4 w-4" aria-hidden /></button>
            </div>
            <p role="status" aria-live="polite" className="mt-3 text-sm text-destructive min-h-[1.25rem]" data-testid="text-request-message">{requestMsg}</p>
          </Step>
          <Step n="02" title="Your buying limits" sub="Every field is yours to change. Any edit revokes approval and clears results.">
            {hasPolicy && (
              <p className="mb-5 rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground" data-testid="text-synthetic-defaults">
                <strong>Synthetic defaults</strong> from the sample trip. Auto-book applies only in simulation.
              </p>
            )}
            <div className="grid gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField id="origin" label="From (airport)" value={draft.origin} onChange={(v) => edit('origin', v)} error={e.origin} />
                <TextField id="destination" label="To (airport)" value={draft.destination} onChange={(v) => edit('destination', v)} error={e.destination} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField id="outboundStart" type="date" label="Outbound earliest" value={draft.outboundStart} onChange={(v) => edit('outboundStart', v)} error={e.outboundStart} />
                <TextField id="outboundEnd" type="date" label="Outbound latest" value={draft.outboundEnd} onChange={(v) => edit('outboundEnd', v)} error={e.outboundEnd} />
                <TextField id="returnStart" type="date" label="Return earliest" value={draft.returnStart} onChange={(v) => edit('returnStart', v)} error={e.returnStart} />
                <TextField id="returnEnd" type="date" label="Return latest" value={draft.returnEnd} onChange={(v) => edit('returnEnd', v)} error={e.returnEnd} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <TextField id="budgetUsd" inputMode="decimal" label="Cap, USD all-in" value={draft.budgetUsd} onChange={(v) => edit('budgetUsd', v)} error={e.budgetUsd} />
                <TextField id="checkedBags" inputMode="numeric" label="Checked bags" value={draft.checkedBags} onChange={(v) => edit('checkedBags', v)} error={e.checkedBags} />
                <TextField id="maxLayoverHours" inputMode="decimal" label="Max layover, hours" value={draft.maxLayoverHours} onChange={(v) => edit('maxLayoverHours', v)} error={e.maxLayoverHours} />
                <TextField id="maxStopsOutbound" inputMode="numeric" label="Max stops out" value={draft.maxStopsOutbound} onChange={(v) => edit('maxStopsOutbound', v)} error={e.maxStopsOutbound} />
                <TextField id="maxStopsReturn" inputMode="numeric" label="Max stops back" value={draft.maxStopsReturn} onChange={(v) => edit('maxStopsReturn', v)} error={e.maxStopsReturn} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <BoolField id="allowBasicEconomy" label="Basic economy" value={draft.allowBasicEconomy} onChange={(v) => edit('allowBasicEconomy', v)} error={e.allowBasicEconomy} />
                <BoolField id="allowSelfTransfer" label="Self-transfer" value={draft.allowSelfTransfer} onChange={(v) => edit('allowSelfTransfer', v)} error={e.allowSelfTransfer} />
                <BoolField id="allowOvernight" label="Overnight layover" value={draft.allowOvernight} onChange={(v) => edit('allowOvernight', v)} error={e.allowOvernight} />
              </div>
            </div>
          </Step>
          <Step n="03" title="Approve the policy" sub="Approval is a snapshot. It only holds while the fields stay exactly as approved.">
            <label className="flex items-start gap-3 cursor-pointer text-sm">
              <input type="checkbox" checked={consent} onChange={(ev) => setConsent(ev.target.checked)} disabled={approved}
                className="mt-0.5 h-4 w-4 accent-[hsl(189_62%_24%)]" data-testid="checkbox-consent" />
              I approve this policy for simulated bookings only
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={btnPrimary} onClick={approve} disabled={!consent || !validation.ok || approved} data-testid="button-approve">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Approve simulation policy
              </button>
              <p role="status" aria-live="polite" className="text-sm" data-testid="status-approval">
                {approved && approval ? <span className="text-chart-3 font-medium">Approved at {new Date(approval.approvedAt).toLocaleTimeString()}. Snapshot locked.</span>
                  : !validation.ok ? <span className="text-muted-foreground">{hasPolicy ? `Fix ${errorCount} field${errorCount === 1 ? '' : 's'} before approving.` : 'Create or fill in a policy first.'}</span>
                  : <span className="text-muted-foreground">Not approved.</span>}
              </p>
            </div>
          </Step>
          <Step n="04" title="Check a synthetic offer" sub="Three Demo Air offers. Pick one, then run it against your approved policy.">
            <fieldset>
              <legend className="sr-only">Synthetic offers</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {OFFERS.map((o) => (
                  <OfferCard key={o.id} o={o} cap={cap} selected={selected === o.id} onSelect={() => { setSelected(o.id); setResult(null); }} />
                ))}
              </div>
            </fieldset>
            <button type="button" className={`${btnPrimary} mt-5`} onClick={evaluate} disabled={!selected} data-testid="button-evaluate">
              Evaluate {selected ? `offer ${selected}` : 'offer'}
            </button>
            <div aria-live="polite">
              {result && <Outcome result={result} />}
            </div>
          </Step>
        </div>
        <footer className="mt-16 text-center font-mono text-[11px] text-muted-foreground">
          Demo Air and all fares are synthetic. Nothing is stored; refreshing clears everything.
        </footer>
      </main>
    </div>
  );
}

function Outcome({ result }: { result: Evaluation }) {
  const c = decisionCopy[result.decision];
  const Icon = c.icon;
  return (
    <div key={`${result.offerId}-${result.decision}`} className="rise mt-6 flex flex-col gap-5" data-testid="result-panel">
      <div className={`rounded-xl border p-4 ${c.cls}`}>
        <div className="flex items-center gap-2 font-semibold"><Icon className="h-5 w-5" aria-hidden />
          <span data-testid="text-decision">{c.title}</span>
          <span className="ml-auto font-mono text-xs opacity-70">{result.decision}</span>
        </div>
        {result.reasons.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm space-y-1" data-testid="list-reasons">
            {result.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
        {result.decision !== 'BOOK_SIMULATED' && (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="text-guidance">
            {result.decision === 'BLOCK'
              ? 'Check the consent box and approve your policy in step 03, then evaluate again.'
              : 'Nothing was booked and there is no override. Edit the policy and reapprove it, or try another offer.'}
          </p>
        )}
      </div>
      {result.rules.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm" data-testid="table-rules">
            <caption className="sr-only">Rule checks for offer {result.offerId}</caption>
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th scope="col" className="px-3 py-2">Rule</th><th scope="col" className="px-3 py-2">Result</th><th scope="col" className="px-3 py-2">Why</th></tr>
            </thead>
            <tbody>
              {result.rules.map((r) => {
                const m = statusMeta[r.status];
                const I = m.icon;
                return (
                  <tr key={r.id} className="border-t border-border" data-testid={`row-rule-${r.id}`}>
                    <th scope="row" className="px-3 py-2 font-medium whitespace-nowrap">{r.label}</th>
                    <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${m.cls}`}><I className="h-3 w-3" aria-hidden />{m.text}</span></td>
                    <td className="px-3 py-2 text-muted-foreground">{r.explanation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {result.receipt && (
        <article className="perf rounded-2xl border-2 border-dashed border-primary/40 bg-background p-5 sm:p-6" data-testid="receipt">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-serif text-lg"><FileText className="h-4 w-4" aria-hidden /> Simulated receipt</span>
            <span className="font-mono text-lg font-semibold text-primary" data-testid="text-receipt-ref">{result.receipt.reference}</span>
          </div>
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {([
              ['Route', result.receipt.route], ['Outbound', result.receipt.departDate], ['Return', result.receipt.returnDate],
              ['Fare', result.receipt.fareBrand], ['Checked bags', String(result.receipt.checkedBags)],
              ['Total', formatCents(result.receipt.totalCents)], ['Cap', formatCents(result.receipt.capCents)],
              ['Approved', new Date(result.receipt.approvedAt).toLocaleString()],
            ] as const).map(([k, v]) => (
              <div key={k}><dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt><dd className="font-mono">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">Passed checks: {result.receipt.passedChecks.join(', ')}</p>
          <p className="mt-4 rounded-md bg-foreground px-3 py-2 text-center font-mono text-xs font-semibold tracking-wider text-background" data-testid="text-receipt-disclaimer">
            {result.receipt.disclaimer}
          </p>
        </article>
      )}
    </div>
  );
}
