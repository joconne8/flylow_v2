import { useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ShieldCheck, ShieldOff, Search as SearchIcon, ArrowRight } from 'lucide-react';
import { PageTitle, Pill } from '@/components/shell';
import { RuleList } from '@/components/rule-list';
import {
  type Authority, DEFAULT_CONFIRM_CENTS, authorityState, createAuthority, invalidateOnPolicyEdit, revokeAuthority, runPurchase, type PurchaseResult,
} from '@/lib/authority';
import { PROVIDERS, searchAll } from '@/lib/providers';
import { DEFAULT_SETTINGS, evaluateAll, policyToSettings, settingsToPolicy, settingsToQuery, type Explained } from '@/lib/results';
import { addReceiptIfNew, appendAudit, getState, mutate, useAppState, VAULT_PROFILE } from '@/lib/store';
import { type RepriceScenario, addDays, fmtDate, fmtRange, fmtTime, usd } from '@/lib/types';
import { type Policy } from '@/lib/policy';

const STATE_UI: Record<string, { tone: 'ok' | 'bad' | 'warn' | 'neutral'; text: string }> = {
  active: { tone: 'ok', text: 'Active' }, revoked: { tone: 'bad', text: 'Revoked' }, invalidated: { tone: 'bad', text: 'Invalidated by policy edit' },
  expired: { tone: 'bad', text: 'Expired' }, disabled: { tone: 'warn', text: 'Switched off' }, vault_missing: { tone: 'warn', text: 'Vault not connected' }, tampered: { tone: 'bad', text: 'Integrity check failed' },
};
const SCENARIOS: { v: RepriceScenario; label: string }[] = [
  { v: 'unchanged', label: 'Price unchanged' }, { v: 'risen', label: 'Price rises above cap' }, { v: 'missing', label: 'Bag or fare goes missing' },
];

function PolicySummary({ p }: { p: Policy }) {
  return (
    <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
      <div><dt className="inline text-muted-foreground">Route: </dt><dd className="inline">{p.origin} to {p.destination}</dd></div>
      <div><dt className="inline text-muted-foreground">Outbound: </dt><dd className="inline">{fmtRange(p.outboundStart, p.outboundEnd, true)}</dd></div>
      <div><dt className="inline text-muted-foreground">Return: </dt><dd className="inline">{fmtRange(p.returnStart, p.returnEnd, true)}</dd></div>
      <div><dt className="inline text-muted-foreground">Max total: </dt><dd className="inline">${p.budgetUsd}</dd></div>
      <div><dt className="inline text-muted-foreground">Required: </dt><dd className="inline">{p.checkedBags} checked bag(s)</dd></div>
      <div><dt className="inline text-muted-foreground">Max stops: </dt><dd className="inline">{p.maxStopsOutbound} out / {p.maxStopsReturn} back, layover {p.maxLayoverHours}h</dd></div>
      <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Blocked: </dt>
        <dd className="inline">{[!p.allowBasicEconomy && 'basic economy', !p.allowSelfTransfer && 'self-transfer', !p.allowOvernight && 'overnight layover'].filter(Boolean).join(', ') || 'nothing'}</dd></div>
    </dl>
  );
}

function AuthorityCard({ a, selected, onSelect }: { a: Authority; selected: boolean; onSelect: () => void }) {
  const st = useAppState();
  const state = authorityState(a, new Date(), st.vault.connected);
  const ui = STATE_UI[state];
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState(String(a.policy.budgetUsd));
  const [bags, setBags] = useState(String(a.policy.checkedBags));
  const log = (kind: string, message: string) => (s: ReturnType<typeof getState>) => appendAudit(s, [{ at: new Date().toISOString(), kind, message }]);
  const update = (fn: (x: Authority) => Authority, kind: string, msg: string) =>
    mutate((s) => log(kind, msg)({ ...s, authorities: s.authorities.map((x) => (x.id === a.id ? fn(x) : x)) }));
  const applyEdit = () => {
    const b = Number(budget); const g = Number(bags);
    if (!Number.isFinite(b) || b <= 0 || !Number.isInteger(g) || g < 0) return;
    const edited: Policy = { ...a.policy, budgetUsd: b, budgetCents: Math.round(b * 100), checkedBags: g };
    update((x) => invalidateOnPolicyEdit(x, edited), 'authority.invalidated', `Policy edit on ${a.id} invalidated the authority.`);
    setEditing(false);
  };
  return (
    <article className={`fl-card p-5 ${selected ? 'ring-2 ring-primary' : ''}`} data-testid={`card-authority-${a.id}`}>
      <div className="flex flex-wrap justify-between gap-2 items-start">
        <div>
          <p className="font-mono text-xs text-muted-foreground">{a.id}</p>
          <h3 className="font-serif text-xl">{a.policy.origin} to {a.policy.destination} round trip</h3>
        </div>
        <Pill tone={ui.tone} testId={`status-authority-${a.id}`}>{ui.text}</Pill>
      </div>
      <div className="mt-3"><PolicySummary p={a.policy} /></div>
      <p className="text-sm mt-2" data-testid={`text-scope-${a.id}`}>Travelers <strong>{a.scope.passengers}</strong> / Cabin <strong>{a.scope.cabin}</strong> / Airlines <strong>{a.scope.airlines.length ? a.scope.airlines.join(', ') : 'any'}</strong></p>
      <p className="text-sm mt-1">Spending cap <strong>{usd(a.spendCapCents)}</strong> / Expires <strong>{fmtDate(a.expiresAt, true)}</strong> / Confirmation required over <strong>{usd(a.confirmThresholdCents)}</strong>: yes</p>
      <p className="text-xs text-muted-foreground mt-1">Approved snapshot is immutable (fingerprint {a.fingerprint}). Approved {fmtTime(a.createdAt)}.{a.invalidatedReason ? ` ${a.invalidatedReason}` : ''}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="fl-btn ghost" onClick={onSelect} disabled={state !== 'active'} data-testid={`button-select-${a.id}`}>Use for monitoring</button>
        <button className="fl-btn ghost" disabled={!!a.revokedAt || !!a.invalidatedAt} onClick={() => update((x) => ({ ...x, enabled: !x.enabled }), 'authority.toggle', `Authority ${a.id} ${a.enabled ? 'switched off' : 'switched on'}.`)} data-testid={`button-toggle-${a.id}`}>{a.enabled ? 'Switch off' : 'Switch on'}</button>
        <button className="fl-btn ghost" disabled={!!a.revokedAt || !!a.invalidatedAt} onClick={() => setEditing((v) => !v)} data-testid={`button-edit-${a.id}`}>Edit policy</button>
        {!a.revokedAt && (confirmRevoke
          ? <><button className="fl-btn danger" onClick={() => { update((x) => revokeAuthority(x), 'authority.revoked', `Authority ${a.id} revoked.`); setConfirmRevoke(false); }} data-testid={`button-confirm-revoke-${a.id}`}>Confirm revoke</button>
              <button className="fl-btn ghost" onClick={() => setConfirmRevoke(false)}>Cancel</button></>
          : <button className="fl-btn danger" onClick={() => setConfirmRevoke(true)} data-testid={`button-revoke-${a.id}`}><ShieldOff className="h-3.5 w-3.5" /> Revoke</button>)}
      </div>
      {editing && (
        <div className="mt-3 rounded-lg border border-accent/60 bg-accent/10 p-3 text-sm" data-testid={`panel-edit-${a.id}`}>
          <p className="mb-2">Editing the approved policy invalidates this authority. You will need to approve a new one.</p>
          <div className="flex flex-wrap gap-2 items-end">
            <label><span className="fl-label">Max total USD</span><input className="fl-input !w-28" value={budget} onChange={(e) => setBudget(e.target.value)} data-testid={`input-edit-budget-${a.id}`} /></label>
            <label><span className="fl-label">Bags</span><input className="fl-input !w-20" value={bags} onChange={(e) => setBags(e.target.value)} /></label>
            <button className="fl-btn amber" onClick={applyEdit} data-testid={`button-apply-edit-${a.id}`}>Apply edit and invalidate</button>
          </div>
        </div>
      )}
    </article>
  );
}

interface Attempt { offerId: string; result: PurchaseResult }

export default function AutobookPage() {
  const st = useAppState();
  const pol = settingsToPolicy(st.settings);
  const [expires, setExpires] = useState(() => addDays(new Date().toISOString().slice(0, 10), 60));
  const [cap, setCap] = useState(() => st.settings.budgetUsd);
  const [thr, setThr] = useState(String(DEFAULT_CONFIRM_CENTS / 100));
  const [consent, setConsent] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [scenario, setScenario] = useState<RepriceScenario>('unchanged');
  const [finalScenario, setFinalScenario] = useState<RepriceScenario>('unchanged');
  const [found, setFound] = useState<Explained[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  const sel = st.authorities.find((a) => a.id === selected) ?? null;
  const selState = sel ? authorityState(sel, new Date(), st.vault.connected) : null;

  const approve = () => {
    if (!pol.ok) { setErrs(['Current search rules are invalid. Fix them on the Search page.']); return; }
    if (!consent) { setErrs(['Tick the consent box to approve this exact authority.']); return; }
    if (!st.vault.connected) { setErrs(['Connect the mock vault first.']); return; }
    const r = createAuthority({ policy: pol.policy, scope: { passengers: st.settings.passengers, cabin: st.settings.cabin, airlines: [...st.settings.airlines] }, expiresAt: expires, spendCapCents: Math.round(Number(cap) * 100), confirmThresholdCents: Math.round(Number(thr) * 100) });
    if (!r.ok) { setErrs(r.errors); return; }
    setErrs([]);
    mutate((s) => appendAudit({ ...s, authorities: [r.authority, ...s.authorities] }, [{ at: r.authority.createdAt, kind: 'authority.approved', message: `Authority ${r.authority.id} approved: cap ${usd(r.authority.spendCapCents)}, expires ${r.authority.expiresAt}.` }]));
    setSelected(r.authority.id); setConsent(false);
  };

  const find = async () => {
    if (!sel) return;
    setFinding(true); setAttempt(null);
    const s = policyToSettings(sel.policy, { ...DEFAULT_SETTINGS, passengers: sel.scope.passengers, cabin: sel.scope.cabin, airlines: [...sel.scope.airlines], maxStops: sel.policy.maxStopsOutbound });
    const r = await searchAll(settingsToQuery(s), PROVIDERS);
    const ev = evaluateAll(r.offers, s);
    setFound(ev.ok ? ev.explained.filter((e) => e.verdict === 'match') : []);
    setFinding(false);
  };

  const attemptBuy = async (offerId: string, confirmed: boolean) => {
    if (!sel || busy.current) return;
    const ex = found?.find((f) => f.offer.id === offerId);
    if (!ex) return;
    busy.current = true; setPending(true);
    try {
      const fresh = getState();
      const result = await runPurchase({
        provider: PROVIDERS[ex.offer.source], authority: sel, offer: ex.offer, scenario, finalScenario, now: new Date(), confirmed,
        confirmedTotalCents: confirmed ? attempt?.result.pricedCents ?? undefined : undefined,
        vault: { connected: fresh.vault.connected, vaultRef: VAULT_PROFILE.paymentRef, travelerLabel: VAULT_PROFILE.traveler, cardDisplay: VAULT_PROFILE.card },
        existingReceipts: fresh.receipts,
      });
      mutate((s) => {
        let n = appendAudit(s, result.audit);
        if (result.receipt && result.outcome === 'BOOKED') n = addReceiptIfNew(n, result.receipt);
        return n;
      });
      setAttempt({ offerId, result });
    } finally { busy.current = false; setPending(false); }
  };

  const OUT: Record<string, { tone: 'ok' | 'bad' | 'warn'; text: string }> = {
    BOOKED: { tone: 'ok', text: 'Simulated order created' }, DUPLICATE: { tone: 'warn', text: 'Duplicate suppressed: existing order returned' },
    NEEDS_CONFIRMATION: { tone: 'warn', text: 'Waiting for your confirmation' }, REJECTED: { tone: 'bad', text: 'Rejected after repricing' },
    NEEDS_REVIEW: { tone: 'warn', text: 'Needs review after repricing' }, BLOCKED: { tone: 'bad', text: 'Blocked by authority checks' }, ERROR: { tone: 'bad', text: 'Provider error' },
  };
  const sortedAudit = useMemo(() => st.audit.slice(0, 12), [st.audit]);

  return (
    <div>
      <PageTitle kicker="Auto-book" title="Limited authority, in writing"
        sub="FlyLow may act only inside the exact policy you approve here. It reprices through the provider right before any purchase, re-checks every rule, and asks you above the confirmation threshold. Everything is a simulation." />

      <section className="fl-card p-5" data-testid="form-authority">
        <h2 className="font-serif text-2xl">Approve auto-book authority</h2>
        <p className="text-sm text-muted-foreground mb-3">From your current search rules. <Link href="/search" className="underline">Change them</Link></p>
        {pol.ok && <p className="text-sm mt-2" data-testid="text-draft-scope">Travelers <strong>{st.settings.passengers}</strong> / Cabin <strong>{st.settings.cabin}</strong> / Airlines <strong>{st.settings.airlines.length ? st.settings.airlines.join(', ') : 'any'}</strong></p>}
        <p className="text-xs text-muted-foreground mt-1" data-testid="text-immutable-note">Changing your search later creates a new draft here. It never alters an authority you already approved; use Edit on an authority to invalidate it.</p>
        {pol.ok ? <PolicySummary p={pol.policy} /> : <p className="text-sm text-destructive" data-testid="error-authority-policy">Search rules are invalid; fix them first.</p>}
        <div className="grid gap-3 sm:grid-cols-3 mt-4">
          <label><span className="fl-label">Expires (date)</span><input type="date" className="fl-input" value={expires} onChange={(e) => setExpires(e.target.value)} data-testid="input-expiry" /></label>
          <label><span className="fl-label">Spending cap (USD)</span><input className="fl-input" value={cap} onChange={(e) => setCap(e.target.value)} data-testid="input-cap" /></label>
          <label><span className="fl-label">Require confirmation over (USD)</span><input className="fl-input" value={thr} onChange={(e) => setThr(e.target.value)} data-testid="input-threshold" /></label>
        </div>
        <div className="mt-3 text-sm flex flex-wrap items-center gap-2">
          Mock vault: {st.vault.connected ? <Pill tone="ok">Connected</Pill> : <Pill tone="bad">Not connected</Pill>}
          {!st.vault.connected && <Link href="/vault" className="underline" data-testid="link-connect-vault">Connect it first</Link>}
        </div>
        <label className="flex gap-2 items-start text-sm mt-3 cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-[hsl(var(--primary))]" data-testid="checkbox-consent" />
          I approve FlyLow to simulate booking only within these exact rules, up to the cap, until expiry. I can revoke at any time.
        </label>
        {errs.length > 0 && <ul className="text-sm text-destructive list-disc pl-5 mt-2" data-testid="list-authority-errors">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        <button className="fl-btn amber mt-3" onClick={approve} disabled={!st.vault.connected || !pol.ok} data-testid="button-approve-authority"><ShieldCheck className="h-4 w-4" /> Approve auto-book authority</button>
      </section>

      <section className="mt-8">
        <h2 className="font-serif text-2xl mb-3">Authorities</h2>
        {st.authorities.length === 0 ? (
          <div className="fl-card p-8 text-center" data-testid="empty-authorities"><p className="font-serif text-xl">No authority granted</p><p className="text-sm text-muted-foreground">Until you approve one, FlyLow cannot book anything, even in simulation.</p></div>
        ) : <div className="space-y-3">{st.authorities.map((a) => <AuthorityCard key={a.id} a={a} selected={selected === a.id} onSelect={() => { setSelected(a.id); setFound(null); setAttempt(null); }} />)}</div>}
      </section>

      {sel && (
        <section className="mt-8 fl-card p-5" data-testid="panel-monitor">
          <h2 className="font-serif text-2xl">Monitor and attempt</h2>
          <p className="text-sm text-muted-foreground">Authority {sel.id}{selState !== 'active' && selState ? ` is ${STATE_UI[selState].text.toLowerCase()}; purchases will be blocked.` : ''}</p>
          <div className="grid sm:grid-cols-2 gap-4 mt-3">
            <fieldset><legend className="fl-label">Repricing scenario (first reprice)</legend>
              {SCENARIOS.map((x) => <label key={x.v} className="flex gap-2 text-sm"><input type="radio" name="sc" checked={scenario === x.v} onChange={() => setScenario(x.v)} data-testid={`radio-scenario-${x.v}`} />{x.label}</label>)}</fieldset>
            <fieldset><legend className="fl-label">Final reprice (after confirmation)</legend>
              {SCENARIOS.map((x) => <label key={x.v} className="flex gap-2 text-sm"><input type="radio" name="fsc" checked={finalScenario === x.v} onChange={() => setFinalScenario(x.v)} data-testid={`radio-final-${x.v}`} />{x.label}</label>)}</fieldset>
          </div>
          <button className="fl-btn mt-3" onClick={find} disabled={finding} data-testid="button-find"><SearchIcon className="h-4 w-4" /> {finding ? 'Checking' : 'Check for matching fares now'}</button>
          {found && found.length === 0 && <p className="text-sm mt-3" data-testid="empty-found">No fare currently matches every rule.</p>}
          {found && found.length > 0 && (
            <ul className="mt-3 divide-y divide-border" data-testid="list-found">
              {found.slice(0, 8).map((f) => (
                <li key={f.offer.id} className="py-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{f.offer.airline}</span><span>{f.offer.origin} <ArrowRight className="inline h-3 w-3" /> {f.offer.destination}</span>
                  <span className="text-muted-foreground">{fmtDate(f.offer.departDate)} - {fmtDate(f.offer.returnDate)}</span>
                  <span className="font-serif text-lg ml-auto">{usd(f.offer.totalCents)}</span>
                  <button className="fl-btn" disabled={pending} onClick={() => attemptBuy(f.offer.id, false)} data-testid={`button-autobook-${f.offer.id}`}>Auto-book</button>
                </li>
              ))}
            </ul>
          )}
          {attempt && (
            <div className="mt-4 rounded-xl border border-border p-4 bg-muted/40" data-testid="panel-attempt">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={OUT[attempt.result.outcome].tone} testId="status-outcome">{OUT[attempt.result.outcome].text}</Pill>
                {attempt.result.pricedCents !== null && <span className="text-sm">Repriced total {usd(attempt.result.pricedCents)}</span>}
              </div>
              {attempt.result.gate && <div className="mt-2"><RuleList rules={attempt.result.gate.checks} /></div>}
              {attempt.result.outcome === 'NEEDS_CONFIRMATION' && (
                <div className="mt-3 flex gap-2">
                  <button className="fl-btn amber" disabled={pending} onClick={() => attemptBuy(attempt.offerId, true)} data-testid="button-confirm-purchase">Confirm and reprice again</button>
                  <button className="fl-btn ghost" onClick={() => setAttempt(null)} data-testid="button-decline-purchase">Decline</button>
                </div>
              )}
              {attempt.result.receipt && <Link href={`/receipt/${attempt.result.receipt.id}`} className="fl-btn mt-3" data-testid="link-receipt">View receipt and audit log</Link>}
              <details className="mt-3"><summary className="text-sm cursor-pointer">Audit entries for this attempt</summary>
                <ul className="text-xs font-mono mt-1 space-y-0.5">{attempt.result.audit.map((a, i) => <li key={i}>{a.kind}: {a.message}</li>)}</ul></details>
            </div>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-serif text-2xl mb-2">Recent audit log</h2>
        {sortedAudit.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="empty-audit">No decisions recorded yet.</p> : (
          <ul className="text-xs font-mono space-y-1" data-testid="list-audit">{sortedAudit.map((a, i) => <li key={i}><span className="text-muted-foreground">{fmtTime(a.at)}</span> {a.kind} - {a.message}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
