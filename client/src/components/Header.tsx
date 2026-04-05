import { useLocation, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

export function Header() {
  const { t } = useI18n();
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const breadcrumbMap: Record<string, string> = {
    '': t('common.dashboard'),
    accounts: t('common.dnsAccounts'),
    domains: t('common.domains'),
    records: t('common.records'),
    users: t('common.users'),
    audit: t('common.audit'),
    teams: t('common.teams'),
    settings: t('common.settings'),
    about: t('common.about'),
    system: t('common.system'),
  };

  const crumbs = [
    { label: t('common.dashboard'), to: '/' },
    ...segments.map((seg, idx) => ({
      label: breadcrumbMap[seg] ?? seg,
      to: '/' + segments.slice(0, idx + 1).join('/'),
    })),
  ];

  const pageTitle = crumbs[crumbs.length - 1]?.label ?? t('common.dashboard');

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-6 gap-4">
      <div className="flex-1">
        <h1 className="text-base font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
        {crumbs.length > 1 && (
          <nav className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {crumbs.map((c, i) => (
              <span key={c.to} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {i < crumbs.length - 1 ? (
                  <Link to={c.to} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{c.label}</Link>
                ) : (
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
