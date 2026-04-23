import { useState } from 'react';
import { Info, Database, Shield, Bell, Key, Globe } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

import { OverviewTab } from './system/OverviewTab';
import { DatabaseTab } from './system/DatabaseTab';
import { SecurityTab } from './system/SecurityTab';
import { AccessTab } from './system/AccessTab';
import { NetworkTab } from './system/NetworkTab';
import { NotificationChannels } from '../components/NotificationChannels';

export function System() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'overview' | 'database' | 'security' | 'access' | 'network' | 'notifications'>('overview');

  const tabs = [
    { id: 'overview', label: t('system.tabs.overview'), icon: Info },
    { id: 'database', label: t('system.tabs.database'), icon: Database },
    { id: 'security', label: t('system.tabs.security'), icon: Shield },
    { id: 'access', label: t('system.tabs.access'), icon: Key },
    { id: 'network', label: t('system.tabs.network'), icon: Globe },
    { id: 'notifications', label: t('system.tabs.notifications'), icon: Bell },
  ];

  return (
    <div className="w-full max-w-none">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('system.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('system.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg w-fit overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'database' && <DatabaseTab />}
      {activeTab === 'security' && <SecurityTab />}
      {activeTab === 'access' && <AccessTab />}
      {activeTab === 'network' && <NetworkTab />}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          <NotificationChannels />
        </div>
      )}
    </div>
  );
}
