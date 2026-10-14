import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Plane, BellRing } from 'lucide-react';
import { useAppState } from '@/lib/store';

const NAV = [
  { href: '/search', label: 'Search', match: (l: string) => l === '/' || l.startsWith('/search') },
  { href: '/results', label: 'Results', match: (l: string) => l.startsWith('/results') },
  { href: '/tracker', label: 'Track', match: (l: string) => l.startsWith('/tracker') },
  { href: '/autobook', label: 'Auto-book', match: (l: string) => l.startsWith('/autobook') || l.startsWith('/receipt') },
  { href: '/vault', label: 'Vault', match: (l: string) => l.startsWith('/vault') },
  { href: '/basic', label: 'Basic demo', match: (l: string) => l === '/basic' },
];

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const st = useAppState();
  const unread = st.notifications.length;
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <div className="bg-primary text-primary-foreground text-xs px-4 py-1.5 text-center tracking-wide" data-testid="banner-sandbox">
        Prototype mode: sample and sandbox flight data. No live booking or payment.
      </div>
      {st.persistError && <div role="alert" className="bg-destructive text-destructive-foreground text-xs px-4 py-1.5 text-center" data-testid="banner-persist-error">{st.persistError}</div>}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto max-w-6xl flex items-center gap-4 px-4 py-3">
          <Link href="/search" className="flex items-center gap-2 font-serif text-xl" data-testid="link-home">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground -rotate-6"><Plane className="h-4 w-4" /></span>
            FlyLow
          </Link>
          <nav className="flex gap-1 ml-2 overflow-x-auto">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase()}`}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${n.match(loc) ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/tracker" className="ml-auto flex items-center gap-1 text-xs text-muted-foreground" data-testid="link-notifications">
            <BellRing className="h-4 w-4" /> {unread}
          </Link>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</main>
      <footer className="border-t border-border bg-sidebar px-4 py-5 text-xs text-muted-foreground">
        <div className="mx-auto max-w-6xl space-y-1">
          <p data-testid="text-sources"><strong className="text-foreground">Sources:</strong> Demo Air (sample data), Amadeus Sandbox (MOCK adapter, not connected), Duffel Sandbox (MOCK adapter, not connected).</p>
          <p>Prototype mode: sample and sandbox flight data. No live booking or payment. No network providers, accounts, real card data or personal data.</p>
        </div>
      </footer>
    </div>
  );
}

export function PageTitle({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <div className="mb-6 rise">
      <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-primary">{kicker}</p>
      <h1 className="font-serif text-3xl sm:text-4xl leading-tight mt-1">{title}</h1>
      {sub && <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{sub}</p>}
    </div>
  );
}

export function Pill({ tone, children, testId }: { tone: 'ok' | 'bad' | 'warn' | 'neutral'; children: ReactNode; testId?: string }) {
  return <span className={`fl-pill ${tone}`} data-testid={testId}>{children}</span>;
}
