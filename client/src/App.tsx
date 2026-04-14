import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute, AdminRoute } from './ProtectedRoute';
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
import { Tunnels } from './pages/Tunnels';
import { Tokens } from './pages/Tokens';
import { Certificates } from './pages/Certificates';
import { About } from './pages/About';
import { System } from './pages/System';
import { I18nProvider } from './contexts/I18nContext';
import { ThemeProvider } from './contexts/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/setup" element={<Setup />} />
              <Route path="/login" element={<Login />} />
              <Route path="/oauth/callback" element={<OAuthCallback />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="accounts" element={<Accounts />} />
                  <Route path="domains" element={<Domains />} />
                  <Route path="domains/:id/records" element={<Records />} />
                  <Route path="tunnels" element={<Tunnels />} />
                  <Route path="tokens" element={<Tokens />} />
                  <Route path="certificates" element={<Certificates />} />
                  <Route path="teams" element={<Teams />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="about" element={<About />} />
                  <Route element={<AdminRoute />}>
                    <Route path="users" element={<Users />} />
                    <Route path="audit" element={<Audit />} />
                    <Route path="system" element={<System />} />
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
  );
}

export default App;
