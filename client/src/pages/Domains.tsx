import { useState } from 'react';
import { List, Activity, ShieldCheck, Calendar } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { DomainListTab } from './domains/DomainListTab';
import { FailoverTab } from './domains/FailoverTab';
import { NSMonitorTab } from './domains/NSMonitorTab';
import { DomainRenewalTab } from './domains/DomainRenewalTab';

export function Domains() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'list' | 'failover' | 'ns-monitor' | 'renewal'>('list');

  const tabs = [
    { id: 'list', label: t('domains.tabs.list'), icon: List },
    { id: 'failover', label: t('domains.tabs.failover'), icon: Activity },
    { id: 'ns-monitor', label: t('domains.tabs.nsMonitor'), icon: ShieldCheck },
    { id: 'renewal', label: t('domainRenewal.title'), icon: Calendar },
  ];

  return (
    <div className="w-full max-w-none">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('domains.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('domains.subtitle')}</p>
      </div>

      {/* Tabs navigation */}
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
      {activeTab === 'list' && <DomainListTab />}
      {activeTab === 'failover' && <FailoverTab />}
      {activeTab === 'ns-monitor' && <NSMonitorTab />}
      {activeTab === 'renewal' && <DomainRenewalTab />}
    </div>
  );
}
