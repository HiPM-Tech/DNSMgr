import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Drawer, Menu } from 'tdesign-react';
import type { MenuValue } from 'tdesign-react';
import {
  DashboardIcon,
  FileSearchIcon,
  InfoCircleIcon,
  InternetIcon,
  KeyIcon,
  LinkIcon,
  LockOnIcon,
  ServerIcon,
  SettingIcon,
  SystemSettingIcon,
  UserSettingIcon,
  UsergroupIcon,
} from 'tdesign-icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import './Sidebar.css';

const { MenuItem, MenuGroup } = Menu;

interface NavItem {
  to: string;
  icon: ReactElement;
  key: string;
  end?: boolean;
}

const primaryItems: NavItem[] = [
  { to: '/', icon: <DashboardIcon />, key: 'common.dashboard', end: true },
  { to: '/accounts', icon: <ServerIcon />, key: 'common.dnsAccounts' },
  { to: '/domains', icon: <InternetIcon />, key: 'common.domains' },
  { to: '/teams', icon: <UsergroupIcon />, key: 'common.teams' },
  { to: '/tokens', icon: <KeyIcon />, key: 'common.tokens' },
];

const adminItems: NavItem[] = [
  { to: '/users', icon: <UserSettingIcon />, key: 'common.users' },
  { to: '/audit', icon: <FileSearchIcon />, key: 'common.audit' },
  { to: '/system', icon: <SystemSettingIcon />, key: 'common.system' },
];

const accountItems: NavItem[] = [
  { to: '/settings', icon: <SettingIcon />, key: 'common.settings' },
  { to: '/security', icon: <LockOnIcon />, key: 'common.security' },
  { to: '/about', icon: <InfoCircleIcon />, key: 'common.about' },
];

function getActivePath(pathname: string, menuItems: NavItem[]) {
  const match = [...menuItems]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)));

  return match?.to ?? '/';
}

interface AppMenuProps {
  collapsed: boolean;
  onClose?: () => void;
}

function AppMenu({ collapsed, onClose }: AppMenuProps) {
  const { isAdmin } = useAuth();
  const { t } = useI18n();
  const { isDark } = useTheme();
  const [showTunnels] = useLocalStorage('showTunnels', false);
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = useMemo(() => {
    const items = [...primaryItems];
    if (showTunnels) {
      items.push({ to: '/tunnels', icon: <LinkIcon />, key: 'tunnels.title' });
    }
    return [...items, ...(isAdmin ? adminItems : []), ...accountItems];
  }, [isAdmin, showTunnels]);

  const activePath = getActivePath(location.pathname, menuItems);

  const handleChange = (value: MenuValue) => {
    const target = String(value);
    navigate(target);
    onClose?.();
  };

  const renderItems = (items: NavItem[]) => items.map((item) => (
    <MenuItem key={item.to} value={item.to} icon={item.icon}>
      {t(item.key)}
    </MenuItem>
  ));

  return (
    <Menu
      width={['232px', '72px']}
      className="app-sidebar__menu"
      value={activePath}
      collapsed={collapsed}
      theme={isDark ? 'dark' : 'light'}
      onChange={handleChange}
    >
      <MenuGroup title={!collapsed ? t('common.dashboard') : undefined}>
        {renderItems(primaryItems)}
        {showTunnels && (
          <MenuItem value="/tunnels" icon={<LinkIcon />}>
            {t('tunnels.title')}
          </MenuItem>
        )}
      </MenuGroup>

      {isAdmin && (
        <MenuGroup title={!collapsed ? t('common.admin') : undefined}>
          {renderItems(adminItems)}
        </MenuGroup>
      )}

      <MenuGroup title={!collapsed ? t('common.account') : undefined}>
        {renderItems(accountItems)}
      </MenuGroup>
    </Menu>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  isMobile?: boolean;
  visible?: boolean;
  onClose?: () => void;
}

export function Sidebar({ collapsed, isMobile = false, visible = false, onClose }: SidebarProps) {
  if (isMobile) {
    return (
      <Drawer
        className="app-sidebar-drawer"
        visible={visible}
        placement="left"
        size="260px"
        header={false}
        footer={false}
        closeBtn={false}
        destroyOnClose
        onClose={onClose}
      >
        <AppMenu collapsed={false} onClose={onClose} />
      </Drawer>
    );
  }

  return (
    <aside className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}>
      <AppMenu collapsed={collapsed} />
    </aside>
  );
}
