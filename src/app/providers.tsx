'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiRequestError } from '@/lib/api-client';

export function Providers({ children }: { children: ReactNode }) {
  // Created in state so each browser session gets exactly one client, and so it is
  // never shared across requests on the server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Operational numbers. Fresh for half a minute, refreshed when the user
            // comes back to the tab, and polled while they are looking at it.
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            refetchInterval: 60_000,
            retry: (failureCount, error) => {
              // A 503 means Mongo is down — retrying twice is useful. A contract error
              // will never fix itself, so fail fast and show it.
              if (error instanceof ApiRequestError && error.status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
