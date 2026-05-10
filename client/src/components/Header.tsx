import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Dropdown, Input, Layout as TLayout, Popup, Space } from 'tdesign-react';
import type { DropdownOption } from 'tdesign-react';
import {
  ChevronDownIcon,
  CheckIcon,
  DesktopIcon,
  LogoGithubIcon,
  LogoutIcon,
  ModeDarkIcon,
  ModeLightIcon,
  SearchIcon,
  SettingIcon,
  TranslateIcon,
  UserCircleIcon,
  ViewListIcon,
} from 'tdesign-icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { localeOptions } from '../i18n';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import './Header.css';

interface HeaderProps {
  collapsed: boolean;
  avatarImage?: string | null;
  onMenuClick?: () => void;
  onToggleCollapse?: () => void;
}

interface HeaderSearchItem {
  title: string;
  group: string;
  path: string;
  keywords: string[];
}

export function Header({ collapsed, avatarImage, onMenuClick, onToggleCollapse }: HeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const { user, logout, isAdmin } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [showTunnels] = useLocalStorage('showTunnels', false);
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

  const searchItems = useMemo<HeaderSearchItem[]>(() => {
    const items: HeaderSearchItem[] = [
      { title: t('common.dashboard'), group: t('common.dashboard'), path: '/', keywords: ['dashboard', 'home', '首页', '仪表盘', '看板', '总览'] },
      { title: t('common.dnsAccounts'), group: t('common.dashboard'), path: '/accounts', keywords: ['dns', 'account', 'provider', '账号', '服务商', '凭据'] },
      { title: t('domains.tabs.list'), group: t('common.domains'), path: '/domains', keywords: ['domain', 'list', '域名', '列表', '解析记录'] },
      { title: t('domains.tabs.failover'), group: t('common.domains'), path: '/domains/failover', keywords: ['failover', 'fallback', '故障', '故障转移', '主备', '健康检查'] },
      { title: t('domains.tabs.nsMonitor'), group: t('common.domains'), path: '/domains/ns-monitor', keywords: ['ns', 'monitor', 'nameserver', '监测', '污染', '劫持'] },
      { title: t('domains.tabs.renewal'), group: t('common.domains'), path: '/domains/renewal', keywords: ['renewal', 'whois', '续期', '过期', '到期'] },
      { title: t('common.teams'), group: t('common.dashboard'), path: '/teams', keywords: ['team', 'member', 'permission', '团队', '成员', '权限'] },
      { title: t('common.tokens'), group: t('common.dashboard'), path: '/tokens', keywords: ['api', 'token', 'key', '令牌', '密钥'] },
      { title: t('settings.profileTitle'), group: t('common.settings'), path: '/settings', keywords: ['profile', 'user', '个人资料', '昵称', '邮箱'] },
      { title: t('settings.avatarImageUrl'), group: t('common.settings'), path: '/settings', keywords: ['avatar', '头像', '图片'] },
      { title: t('settings.changePassword'), group: t('common.settings'), path: '/settings', keywords: ['password', '密码', '修改密码'] },
      { title: t('settings.backgroundImage'), group: t('common.settings'), path: '/settings', keywords: ['background', 'wallpaper', '背景', '背景图'] },
      { title: t('settings.oauthBindingTitle'), group: t('common.settings'), path: '/settings', keywords: ['oauth', 'logto', 'oidc', '绑定', '第三方登录'] },
      { title: t('common.security'), group: t('common.account'), path: '/security', keywords: ['2fa', 'totp', 'webauthn', '安全', '双因素', '会话'] },
      { title: t('common.about'), group: t('common.account'), path: '/about', keywords: ['about', 'version', 'license', '关于', '版本', '开源'] },
    ];

    if (showTunnels) {
      items.push({ title: t('tunnels.title'), group: t('common.dashboard'), path: '/tunnels', keywords: ['tunnel', 'cloudflare', '隧道'] });
    }

    if (isAdmin) {
      items.push(
        { title: t('common.users'), group: t('common.admin'), path: '/users', keywords: ['user', 'role', '用户', '角色', '管理员'] },
        { title: t('common.audit'), group: t('common.admin'), path: '/audit', keywords: ['audit', 'log', '审计', '日志', '操作'] },
        { title: t('system.tabs.overview'), group: t('common.system'), path: '/system', keywords: ['system', 'overview', '系统', '概览'] },
        { title: t('system.tabs.database'), group: t('common.system'), path: '/system/database', keywords: ['database', 'sqlite', 'mysql', 'postgresql', '数据库'] },
        { title: t('system.tabs.security'), group: t('common.system'), path: '/system/security', keywords: ['security policy', '2fa', 'login', '安全策略', '登录'] },
        { title: t('system.tabs.access'), group: t('common.system'), path: '/system/access', keywords: ['access', 'oauth', 'logto', 'smtp', '访问', '登录方式'] },
        { title: t('system.tabs.network'), group: t('common.system'), path: '/system/network', keywords: ['network', 'proxy', '网络', '代理'] },
        { title: t('system.tabs.notifications'), group: t('common.system'), path: '/system/notifications', keywords: ['notification', 'smtp', 'email', '通知', '邮件'] },
      );
    }

    return items;
  }, [isAdmin, showTunnels, t]);

  const filteredSearchItems = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return searchItems.slice(0, 7);

    return searchItems
      .filter((item) => [item.title, item.group, item.path, ...item.keywords].join(' ').toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchItems, searchValue]);

  const userOptions: DropdownOption[] = [
    { content: t('common.settings'), value: 'settings', prefixIcon: <SettingIcon /> },
    { content: t('common.security'), value: 'security', prefixIcon: <UserCircleIcon /> },
    { content: t('common.logout'), value: 'logout', prefixIcon: <LogoutIcon />, divider: true },
  ];

  const languageOptions = useMemo<DropdownOption[]>(() => localeOptions.map((option) => ({
    content: option.label,
    value: option.code,
    active: option.code === locale,
    prefixIcon: option.code === locale ? <CheckIcon /> : <span className="app-header__language-placeholder" />,
  })), [locale]);

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

  const handleSearchNavigate = (item: HeaderSearchItem) => {
    navigate(item.path);
    setSearchValue('');
    setSearchFocused(false);
  };

  const handleSearchEnter = () => {
    const [firstItem] = filteredSearchItems;
    if (firstItem) handleSearchNavigate(firstItem);
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

        <div className="app-header__right">
          <div className="app-header__search">
            <Input
              clearable
              value={searchValue}
              prefixIcon={<SearchIcon />}
              placeholder={t('common.globalSearchPlaceholder')}
              onChange={(value) => setSearchValue(String(value))}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              onEnter={handleSearchEnter}
              onKeydown={(_, context) => {
                if (context.e.key === 'Escape') {
                  setSearchFocused(false);
                }
              }}
            />
            {searchFocused && (
              <div className="app-header__search-panel" role="listbox">
                {filteredSearchItems.length > 0 ? (
                  filteredSearchItems.map((item) => (
                    <button
                      key={item.path + item.title}
                      type="button"
                      className="app-header__search-item"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSearchNavigate(item)}
                    >
                      <span className="app-header__search-item-title">{item.title}</span>
                      <span className="app-header__search-item-group">{item.group}</span>
                    </button>
                  ))
                ) : (
                  <div className="app-header__search-empty">{t('common.searchNoResult')}</div>
                )}
              </div>
            )}
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
            <Dropdown
              trigger="click"
              placement="bottom-right"
              options={languageOptions}
              maxHeight={320}
              minColumnWidth={168}
              maxColumnWidth={220}
              popupProps={{ overlayClassName: 'app-header__language-menu' }}
              onClick={(option) => setLocale(String(option.value))}
            >
              <Button
                shape="square"
                variant="text"
                size="large"
                icon={<TranslateIcon />}
                title={t('settings.language')}
              />
            </Dropdown>
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
                <Avatar username={displayName} email={user?.email} image={avatarImage} size={28} />
                <span className="app-header__user-name">{displayName}</span>
                <ChevronDownIcon />
              </Button>
            </Dropdown>
          </Space>
        </div>
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
