import { useState } from 'react';
import { Tabs } from 'tdesign-react';
import {
  ActivityIcon,
  CalendarIcon,
  RootListIcon,
  SecuredIcon,
} from 'tdesign-icons-react';
import { useI18n } from '../contexts/I18nContext';
import { DomainListTab } from './domains/DomainListTab';
import { FailoverTab } from './domains/FailoverTab';
import { NSMonitorTab } from './domains/NSMonitorTab';
import { DomainRenewalTab } from './domains/DomainRenewalTab';

type DomainTab = 'list' | 'failover' | 'ns-monitor' | 'renewal';

export function Domains() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<DomainTab>('list');

  const tabs = [
    { value: 'list', label: <span className="page-actions"><RootListIcon />{t('domains.tabs.list')}</span> },
    { value: 'failover', label: <span className="page-actions"><ActivityIcon />{t('domains.tabs.failover')}</span> },
    { value: 'ns-monitor', label: <span className="page-actions"><SecuredIcon />{t('domains.tabs.nsMonitor')}</span> },
    { value: 'renewal', label: <span className="page-actions"><CalendarIcon />{t('domains.tabs.renewal')}</span> },
  ];

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h1>{t('domains.title')}</h1>
          <p>{t('domains.subtitle')}</p>
        </div>
      </section>

      <Tabs
        className="page-tabs"
        theme="card"
        value={activeTab}
        list={tabs}
        onChange={(value) => setActiveTab(value as DomainTab)}
      />

      {activeTab === 'list' && <DomainListTab />}
      {activeTab === 'failover' && <FailoverTab />}
      {activeTab === 'ns-monitor' && <NSMonitorTab />}
      {activeTab === 'renewal' && <DomainRenewalTab />}
    </div>
  );
}
