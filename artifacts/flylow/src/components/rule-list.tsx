import { Check, X, CircleHelp, Hourglass } from 'lucide-react';

export function RuleList({ rules }: { rules: { id: string; label: string; status: string; explanation?: string; detail?: string }[] }) {
  return (
    <ul className="divide-y divide-border text-sm">
      {rules.map((r) => (
        <li key={r.id} className="flex gap-3 py-2" data-testid={`rule-${r.id}`}>
          <span className={`mt-0.5 grid place-items-center h-5 w-5 rounded-full shrink-0 ${r.status === 'pass' ? 'bg-primary text-primary-foreground' : r.status === 'fail' ? 'bg-destructive text-destructive-foreground' : 'bg-accent text-accent-foreground'}`}>
            {r.status === 'pass' ? <Check className="h-3 w-3" /> : r.status === 'fail' ? <X className="h-3 w-3" /> : r.status === 'hold' ? <Hourglass className="h-3 w-3" /> : <CircleHelp className="h-3 w-3" />}
          </span>
          <div>
            <span className="font-medium">{r.label}</span>
            <span className="text-muted-foreground"> - {r.explanation ?? r.detail}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
