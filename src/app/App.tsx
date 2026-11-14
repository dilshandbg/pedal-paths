import { AppProviders } from '@/app/providers/AppProviders';
import { DashboardRoute } from '@/app/routes/DashboardRoute';

export function App() {
  return (
    <AppProviders>
      <DashboardRoute />
    </AppProviders>
  );
}
