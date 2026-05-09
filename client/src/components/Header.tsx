import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Layout as TLayout, Popup, Space } from 'tdesign-react';
import type { DropdownOption } from 'tdesign-react';
import {
  ChevronDownIcon,
  DesktopIcon,
  LogoGithubIcon,
  LogoutIcon,
  ModeDarkIcon,
  ModeLightIcon,
  SettingIcon,
  UserCircleIcon,
  ViewListIcon,
} from 'tdesign-icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import './Header.css';

interface HeaderProps {
  collapsed: boolean;
  onMenuClick?: () => void;
  onToggleCollapse?: () => void;
}

export function Header({ collapsed, onMenuClick, onToggleCollapse }: HeaderProps) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const displayName = user?.nickname || user?.username || t('common.unknown');

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
    security: t('common.security'),
    tokens: t('common.tokens'),
    tunnels: t('tunnels.title'),
  };

  const pageKey = segments.length ? segments[segments.length - 1] : '';
  const pageTitle = breadcrumbMap[pageKey] ?? pageKey ?? t('common.dashboard');
  const ThemeIcon = theme === 'light' ? ModeLightIcon : theme === 'dark' ? ModeDarkIcon : DesktopIcon;
  const nextTheme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  const repoUrl = 'https://github.com/HiPM-Tech/DNSMgr';

  const userOptions: DropdownOption[] = [
    { content: t('common.settings'), value: 'settings', prefixIcon: <SettingIcon /> },
    { content: t('common.security'), value: 'security', prefixIcon: <UserCircleIcon /> },
    { content: t('common.logout'), value: 'logout', prefixIcon: <LogoutIcon />, divider: true },
  ];

  const handleUserAction = (option: DropdownOption) => {
    if (option.value === 'settings') {
      navigate('/settings');
      return;
    }

    if (option.value === 'security') {
      navigate('/security');
      return;
    }

    if (option.value === 'logout') {
      setShowLogoutConfirm(true);
    }
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      <TLayout.Header className="app-header">
        <div className="app-header__left">
          <Button
            className="app-header__mobile-menu"
            shape="square"
            variant="text"
            size="large"
            icon={<ViewListIcon />}
            onClick={onMenuClick}
          />
          <Button
            className="app-header__collapse"
            shape="square"
            variant="text"
            size="large"
            icon={<ViewListIcon />}
            onClick={onToggleCollapse}
            title={collapsed ? t('common.expand') || 'Expand' : t('common.collapse') || 'Collapse'}
          />
          <div className="app-header__title-wrap">
            <h1 className="app-header__title">{pageTitle}</h1>
          </div>
        </div>

        <Space align="center" size="small" className="app-header__actions">
          <Popup content="GitHub" placement="bottom" showArrow destroyOnClose>
            <Button
              shape="square"
              variant="text"
              size="large"
              icon={<LogoGithubIcon />}
              onClick={() => window.open(repoUrl, '_blank', 'noopener,noreferrer')}
            />
          </Popup>
          <Popup content={theme === 'auto' ? `Auto · ${resolvedTheme === 'dark' ? 'Dark' : 'Light'}` : theme === 'light' ? 'Light' : 'Dark'} placement="bottom" showArrow destroyOnClose>
            <Button
              shape="square"
              variant="text"
              size="large"
              icon={<ThemeIcon />}
              onClick={() => setTheme(nextTheme)}
            />
          </Popup>
          <Dropdown trigger="click" placement="bottom-right" options={userOptions} onClick={handleUserAction}>
            <Button variant="text" className="app-header__user">
              <Avatar username={displayName} email={user?.email} size={28} />
              <span className="app-header__user-name">{displayName}</span>
              <ChevronDownIcon />
            </Button>
          </Dropdown>
        </Space>
      </TLayout.Header>

      {showLogoutConfirm && (
        <ConfirmDialog
          message={t('common.logoutConfirm')}
          confirmLabel={t('common.logout')}
          onConfirm={handleConfirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </>
  );
}
