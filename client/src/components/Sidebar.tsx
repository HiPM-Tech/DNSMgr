import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Server, Globe, Users, UserCog, Settings, LogOut, Zap, FileText, Info, Cpu, Sun, Moon, Monitor, Key, X, Menu, Shield, ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { roleLabelKey } from '../utils/roles';
import { Avatar } from './Avatar';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalStorage } from '../hooks/useLocalStorage';

const navItems = [
  { to: '/', icon: LayoutDashboard, key: 'common.dashboard' },
  { to: '/accounts', icon: Server, key: 'common.dnsAccounts' },
  { to: '/domains', icon: Globe, key: 'common.domains' },
  { to: '/ns-monitor', icon: ShieldCheck, key: 'common.nsMonitor' },
  { to: '/teams', icon: Users, key: 'common.teams' },
  { to: '/tokens', icon: Key, key: 'common.tokens' },
];

const adminItems = [
  { to: '/users', icon: UserCog, key: 'common.users' },
  { to: '/audit', icon: FileText, key: 'common.audit' },
  { to: '/system', icon: Cpu, key: 'common.system' },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isMobile?: boolean;
}

export function Sidebar({ isOpen, onClose, isMobile }: SidebarProps) {
  const { user, logout, isAdmin } = useAuth();
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [showTunnels] = useLocalStorage('showTunnels', false);
  const navigate = useNavigate();
  const displayName = user?.nickname || user?.username;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const cycleTheme = () => {
    if (theme === 'auto') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('auto');
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600 rounded-lg">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white text-base">DNSMgr</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={cycleTheme}
              title={theme === 'auto' ? 'Auto (system)' : theme === 'light' ? 'Light' : 'Dark'}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ThemeIcon className="w-4 h-4" />
            </button>
            {isMobile && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map(({ to, icon: Icon, key }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={isMobile ? onClose : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {t(key)}
            </NavLink>
          ))}

          {showTunnels && (
            <NavLink
              to="/tunnels"
              onClick={isMobile ? onClose : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                }`
              }
            >
              <Globe className="w-4 h-4 flex-shrink-0" />
              {t('tunnels.title')}
            </NavLink>
          )}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1 px-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('common.admin')}</span>
              </div>
              {adminItems.map(({ to, icon: Icon, key }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={isMobile ? onClose : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {t(key)}
                </NavLink>
              ))}
            </>
          )}

          <div className="pt-3 pb-1 px-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{t('common.account')}</span>
          </div>
          <NavLink
            to="/settings"
            onClick={isMobile ? onClose : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`
            }
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            {t('common.settings')}
          </NavLink>
          <NavLink
            to="/security"
            onClick={isMobile ? onClose : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`
            }
          >
            <Shield className="w-4 h-4 flex-shrink-0" />
            {t('common.security')}
          </NavLink>
          <NavLink
            to="/about"
            onClick={isMobile ? onClose : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`
            }
          >
            <Info className="w-4 h-4 flex-shrink-0" />
            {t('common.about')}
          </NavLink>
        </div>
      </nav>

      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar username={displayName} email={user?.email} size={28} textClassName="text-xs" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{displayName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t(roleLabelKey(user?.role))}</p>
          </div>
          <button
            onClick={handleLogout}
            title={t('common.logout')}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors rounded"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  // 移动端抽屉
  if (isMobile) {
    return (
      <>
        {/* 遮罩层 */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
          />
        )}
        {/* 抽屉 */}
        <aside
          className={`fixed left-0 top-0 h-full w-[220px] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col z-50 transform transition-transform duration-300 lg:hidden ${
            isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      </>
    );
  }

  // 桌面端固定侧边栏
  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-full w-[220px] bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-col z-30">
      {sidebarContent}
    </aside>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}
