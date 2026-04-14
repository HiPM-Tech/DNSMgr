import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Menu } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
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
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 lg:px-6 gap-4">
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">{pageTitle}</h1>
        {crumbs.length > 1 && (
          <nav className="hidden sm:flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {crumbs.map((c, i) => (
              <span key={c.to} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 flex-shrink-0" />}
                {i < crumbs.length - 1 ? (
                  <Link to={c.to} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate">{c.label}</Link>
                ) : (
                  <span className="text-gray-700 dark:text-gray-300 font-medium truncate">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
