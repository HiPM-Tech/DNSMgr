import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { OAuthCallback } from './pages/OAuthCallback';
import { Setup } from './pages/Setup';
import { Dashboard } from './pages/Dashboard';
import { Audit } from './pages/Audit';
import { Accounts } from './pages/Accounts';
import { Domains } from './pages/Domains';
import { Records } from './pages/Records';
import { Users } from './pages/Users';
import { Teams } from './pages/Teams';
import { Settings } from './pages/Settings';
import { Security } from './pages/Security';
import { Tunnels } from './pages/Tunnels';
import { Tokens } from './pages/Tokens';

import { About } from './pages/About';
import { System } from './pages/System';
import { I18nProvider } from './contexts/I18nContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { UiScaleProvider } from './contexts/UiScaleContext';
import { useDialogAutoHideScrollbar } from './hooks/useDialogAutoHideScrollbar';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function App() {
  useDialogAutoHideScrollbar();

  return (
    <ErrorBoundary>
      <UiScaleProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <I18nProvider>
              <AuthProvider>
                <BrowserRouter>
                  <Routes>
                    <Route path="/" element={<Landing />} />
                    <Route path="/setup" element={<Setup />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/oauth/callback" element={<OAuthCallback />} />
                    <Route element={<ProtectedRoute />}>
                      <Route element={<Layout />}>
                        <Route index element={<Dashboard />} />
                        <Route path="accounts" element={<Accounts />} />
                        <Route path="domains" element={<Domains activeTab="list" />} />
                        <Route path="domains/failover" element={<Domains activeTab="failover" />} />
                        <Route path="domains/ns-monitor" element={<Domains activeTab="ns-monitor" />} />
                        <Route path="domains/renewal" element={<Domains activeTab="renewal" />} />
                        <Route path="domains/:id/records" element={<Records />} />
                        <Route path="tunnels" element={<Tunnels />} />
                        <Route path="tokens" element={<Tokens />} />
                        <Route path="teams" element={<Teams />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="security" element={<Security />} />
                        <Route path="about" element={<About />} />
                        <Route element={<AdminRoute />}>
                          <Route path="users" element={<Users />} />
                          <Route path="audit" element={<Audit />} />
                          <Route path="system" element={<System activeTab="overview" />} />
                          <Route path="system/database" element={<System activeTab="database" />} />
                          <Route path="system/security" element={<System activeTab="security" />} />
                          <Route path="system/access" element={<System activeTab="access" />} />
                          <Route path="system/network" element={<System activeTab="network" />} />
                          <Route path="system/notifications" element={<System activeTab="notifications" />} />
                        </Route>
                      </Route>
                    </Route>
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </BrowserRouter>
              </AuthProvider>
            </I18nProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </UiScaleProvider>
    </ErrorBoundary>
  );
}

export default App;
