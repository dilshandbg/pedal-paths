import type { ReactNode } from 'react';

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Composition root for app-wide providers. It is deliberately empty: the map needs no provider
 * (ADR-0008).
 */
export function AppProviders({ children }: AppProvidersProps) {
  return <>{children}</>;
}
