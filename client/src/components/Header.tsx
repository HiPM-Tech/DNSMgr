import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const breadcrumbMap: Record<string, string> = {
  '': 'Dashboard',
  accounts: 'DNS Accounts',
  domains: 'Domains',
  records: 'Records',
  users: 'Users',
  teams: 'Teams',
  settings: 'Settings',
};

export function Header() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  const crumbs = [
    { label: 'Dashboard', to: '/' },
    ...segments.map((seg, idx) => ({
      label: breadcrumbMap[seg] ?? seg,
      to: '/' + segments.slice(0, idx + 1).join('/'),
    })),
  ];

  const pageTitle = crumbs[crumbs.length - 1]?.label ?? 'Dashboard';

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
      <div className="flex-1">
        <h1 className="text-base font-semibold text-gray-900">{pageTitle}</h1>
        {crumbs.length > 1 && (
          <nav className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
            {crumbs.map((c, i) => (
              <span key={c.to} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {i < crumbs.length - 1 ? (
                  <Link to={c.to} className="hover:text-blue-600 transition-colors">{c.label}</Link>
                ) : (
                  <span className="text-gray-700 font-medium">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
