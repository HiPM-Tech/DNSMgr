import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Server, Globe, Users, UserCog, Settings, LogOut, Zap, FileText,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { roleLabelKey } from '../utils/roles';
import { Avatar } from './Avatar';
import { useI18n } from '../contexts/I18nContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, key: 'common.dashboard' },
  { to: '/accounts', icon: Server, key: 'common.dnsAccounts' },
  { to: '/domains', icon: Globe, key: 'common.domains' },
  { to: '/teams', icon: Users, key: 'common.teams' },
];

const adminItems = [
  { to: '/users', icon: UserCog, key: 'common.users' },
  { to: '/audit', icon: FileText, label: '审计' },
];

export function Sidebar() {
  const { user, logout, isAdmin } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const displayName = user?.nickname || user?.username;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-white border-r border-gray-200 flex flex-col z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-600 rounded-lg">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-base">DNSMgr</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map(({ to, icon: Icon, key }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {t(key)}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('common.admin')}</span>
              </div>
              {adminItems.map(({ to, icon: Icon, key, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {key ? t(key) : label}
                </NavLink>
              ))}
            </>
          )}

          <div className="pt-3 pb-1 px-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('common.account')}</span>
          </div>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {t('common.settings')}
          </NavLink>
        </div>
      </nav>

      {/* User Footer */}
      <div className="px-3 py-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar username={displayName} email={user?.email} size={28} textClassName="text-xs" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">{displayName}</p>
            <p className="text-xs text-gray-500">{t(roleLabelKey(user?.role))}</p>
          </div>
          <button onClick={handleLogout} title={t('common.logout')}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
