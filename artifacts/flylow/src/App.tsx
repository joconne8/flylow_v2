import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Shell } from '@/components/shell';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import SearchPage from '@/pages/search';
import ResultsPage from '@/pages/results';
import TrackerPage from '@/pages/tracker';
import AutobookPage from '@/pages/autobook';
import VaultPage from '@/pages/vault';
import ReceiptPage from '@/pages/receipt';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={SearchPage} />
          <Route path="/search" component={SearchPage} />
          <Route path="/results" component={ResultsPage} />
          <Route path="/tracker" component={TrackerPage} />
          <Route path="/autobook" component={AutobookPage} />
          <Route path="/vault" component={VaultPage} />
          <Route path="/receipt/:id" component={ReceiptPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
