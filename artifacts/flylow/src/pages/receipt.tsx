import { Link, useParams } from 'wouter';
import { PageTitle, Pill } from '@/components/shell';
import { useAppState } from '@/lib/store';
import { fmtDate, fmtTime, usdExact } from '@/lib/types';
import { SOURCE_LABELS } from '@/lib/types';

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const st = useAppState();
  const r = st.receipts.find((x) => x.id === id);
  if (!r) {
    return (
      <div className="fl-card p-10 text-center" data-testid="empty-receipt">
        <p className="font-serif text-2xl">Receipt not found</p>
        <p className="text-sm text-muted-foreground mt-1">It may have been erased with local data, or the link is wrong.</p>
        <Link href="/autobook" className="fl-btn mt-4">Back to Auto-book</Link>
      </div>
    );
  }
  const row = (k: string, v: string, t?: string) => <div className="flex justify-between gap-4 py-1.5 border-b border-dashed border-border text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-right" data-testid={t}>{v}</dd></div>;
  return (
    <div>
      <PageTitle kicker="Receipt" title="Simulated booking" />
      <div className="grid lg:grid-cols-[1fr_1fr] gap-6">
        <section className="fl-card p-6" data-testid="panel-receipt">
          <Pill tone="warn">SIMULATED - no ticket, no payment</Pill>
          <p className="font-mono text-2xl mt-3" data-testid="text-reference">{r.reference}</p>
          <dl className="mt-3">
            {row('Route', `${r.origin} to ${r.destination}`)}{row('Airline', r.airline)}{row('Source', `${SOURCE_LABELS[r.source]}`)}
            {row('Dates', `${fmtDate(r.departDate, true)} - ${fmtDate(r.returnDate, true)}`)}{row('Fare', r.fareBrand)}{row('Checked bags', String(r.checkedBags))}
            {row('Total', usdExact(r.totalCents), 'text-receipt-total')}{r.capCents !== null && row('Approved cap', usdExact(r.capCents))}
            {row('Traveler', r.travelerLabel)}{row('Payment', `${r.cardDisplay} (display only)`)}{row('Vault ref', r.vaultRef)}{row('Authority', r.authorityId ?? 'none')}{row('Created', fmtTime(r.createdAt))}
          </dl>
          <p className="text-xs text-muted-foreground mt-3">{r.disclaimer}</p>
        </section>
        <section className="fl-card p-6" data-testid="panel-audit">
          <h2 className="font-serif text-xl">Audit trail</h2>
          {r.audit.length === 0 ? <p className="text-sm text-muted-foreground mt-2">No audit entries stored.</p> : (
            <ol className="mt-3 space-y-2 border-l-2 border-accent pl-4">
              {r.audit.map((a, i) => <li key={i} className="text-sm" data-testid={`audit-${i}`}><span className="font-mono text-xs text-primary">{a.kind}</span><br />{a.message}</li>)}
            </ol>
          )}
        </section>
      </div>
      <Link href="/autobook" className="fl-btn ghost mt-6">Back to Auto-book</Link>
    </div>
  );
}
