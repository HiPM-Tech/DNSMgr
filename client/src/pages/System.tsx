import { useState } from 'react';
import { Tabs } from 'tdesign-react';
import {
  DataBaseIcon,
  InfoCircleIcon,
  InternetIcon,
  KeyIcon,
  NotificationIcon,
  SecuredIcon,
} from 'tdesign-icons-react';
import { useI18n } from '../contexts/I18nContext';
import { useRealtimeData } from '../hooks/useRealtimeData';

import { OverviewTab } from './system/OverviewTab';
import { DatabaseTab } from './system/DatabaseTab';
import { SecurityTab } from './system/SecurityTab';
import { AccessTab } from './system/AccessTab';
import { NetworkTab } from './system/NetworkTab';
import { NotificationChannels } from '../components/NotificationChannels';

type SystemTab = 'overview' | 'database' | 'security' | 'access' | 'network' | 'notifications';

export function System() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SystemTab>('overview');

  useRealtimeData({
    queryKey: ['system-config'],
    websocketEventTypes: ['config_updated', 'smtp_updated', 'oauth_updated', 'security_config_updated'],
    pollingInterval: 300000,
  });

  const tabs = [
    { value: 'overview', label: <span className="page-actions"><InfoCircleIcon />{t('system.tabs.overview')}</span> },
    { value: 'database', label: <span className="page-actions"><DataBaseIcon />{t('system.tabs.database')}</span> },
    { value: 'security', label: <span className="page-actions"><SecuredIcon />{t('system.tabs.security')}</span> },
    { value: 'access', label: <span className="page-actions"><KeyIcon />{t('system.tabs.access')}</span> },
    { value: 'network', label: <span className="page-actions"><InternetIcon />{t('system.tabs.network')}</span> },
    { value: 'notifications', label: <span className="page-actions"><NotificationIcon />{t('system.tabs.notifications')}</span> },
  ];

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h1>{t('system.title')}</h1>
          <p>{t('system.subtitle')}</p>
        </div>
      </section>

      <Tabs
        className="page-tabs"
        theme="card"
        value={activeTab}
        list={tabs}
        onChange={(value) => setActiveTab(value as SystemTab)}
      />

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'database' && <DatabaseTab />}
      {activeTab === 'security' && <SecurityTab />}
      {activeTab === 'access' && <AccessTab />}
      {activeTab === 'network' && <NetworkTab />}
      {activeTab === 'notifications' && <NotificationChannels />}
    </div>
  );
}
