import { useState } from 'react';
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { PageTitle, Pill } from '@/components/shell';
import { appendAudit, mutate, resetAll, useAppState, VAULT_PROFILE } from '@/lib/store';
import { fmtTime } from '@/lib/types';

export default function VaultPage() {
  const st = useAppState();
  const [confirmReset, setConfirmReset] = useState(false);
  const toggle = () => mutate((s) => {
    const now = new Date().toISOString();
    return appendAudit({ ...s, vault: { connected: !s.vault.connected, connectedAt: s.vault.connected ? null : now } }, [{ at: now, kind: s.vault.connected ? 'vault.disconnected' : 'vault.connected', message: `Mock vault ${s.vault.connected ? 'disconnected' : 'connected'}.` }]);
  });
  return (
    <div>
      <PageTitle kicker="Vault" title="A vault with nothing real in it"
        sub="This is a mock. There are no input fields on purpose: FlyLow never asks for, stores or transmits a password, card number, CVV or passport. Only fake references exist." />
      <section className="fl-card p-5" data-testid="panel-vault">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl flex items-center gap-2"><KeyRound className="h-5 w-5 text-accent" /> Secure vault (mock)</h2>
          {st.vault.connected ? <Pill tone="ok" testId="status-vault">Vault connected {st.vault.connectedAt ? `at ${fmtTime(st.vault.connectedAt)}` : ''}</Pill> : <Pill tone="bad" testId="status-vault">Vault not connected</Pill>}
        </div>
        <dl className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
          <div><dt className="fl-label">Traveler profile</dt><dd data-testid="text-traveler">{VAULT_PROFILE.traveler} (fictional)</dd><dd className="font-mono text-xs text-muted-foreground">{VAULT_PROFILE.travelerRef}</dd></div>
          <div><dt className="fl-label">Payment profile</dt><dd data-testid="text-card">{VAULT_PROFILE.card} (display only)</dd><dd className="font-mono text-xs text-muted-foreground">{VAULT_PROFILE.paymentRef}</dd></div>
          {VAULT_PROFILE.credentials.map((c) => (
            <div key={c.vaultCredentialId} className="sm:col-span-2"><dt className="fl-label">Airline login: stored as secure token reference</dt>
              <dd className="font-mono text-xs bg-muted rounded-lg p-3 whitespace-pre" data-testid="text-credential">{JSON.stringify(c, null, 2)}</dd></div>
          ))}
        </dl>
        <button className={`fl-btn mt-4 ${st.vault.connected ? 'danger' : 'amber'}`} onClick={toggle} data-testid="button-toggle-vault">
          <ShieldCheck className="h-4 w-4" /> {st.vault.connected ? 'Disconnect vault' : 'Connect mock vault'}
        </button>
        <div className="mt-5 text-xs text-muted-foreground border-t border-border pt-3">
          <p className="font-semibold text-foreground">Never stored here: raw password, card number, CVV, passport scan, real airline credentials.</p>
          <p className="mt-1">A real system would use supplier OAuth or API credentials, tokenized payment methods through a PCI-compliant provider, a user-controlled secret vault, short-lived tokens and step-up authentication.</p>
        </div>
      </section>

      <section className="fl-card p-5 mt-6" data-testid="panel-reset">
        <h2 className="font-serif text-xl">Local data</h2>
        <p className="text-sm text-muted-foreground">{st.trackers.length} tracker(s), {st.authorities.length} authority(ies), {st.receipts.length} receipt(s) stored in this browser only.{st.recovered ? ' Some unreadable stored entries were dropped on load.' : ''}</p>
        {confirmReset ? (
          <div className="mt-3 flex gap-2 items-center"><span className="text-sm">Erase everything FlyLow stored here?</span>
            <button className="fl-btn danger" onClick={() => { resetAll(); setConfirmReset(false); }} data-testid="button-confirm-reset"><Trash2 className="h-3.5 w-3.5" /> Yes, erase</button>
            <button className="fl-btn ghost" onClick={() => setConfirmReset(false)} data-testid="button-cancel-reset">Cancel</button></div>
        ) : <button className="fl-btn danger mt-3" onClick={() => setConfirmReset(true)} data-testid="button-reset">Reset local data</button>}
      </section>
    </div>
  );
}
