import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="fl-card p-10 text-center" data-testid="page-not-found">
      <p className="font-mono text-xs tracking-widest text-primary">404</p>
      <h1 className="font-serif text-3xl mt-1">This gate does not exist</h1>
      <Link href="/search" className="fl-btn mt-4">Back to search</Link>
    </div>
  );
}
