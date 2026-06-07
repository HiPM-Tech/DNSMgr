import { FailoverTab } from './domains/FailoverTab';
import { ServiceMonitorTab } from './domains/ServiceMonitorTab';
import { NSMonitorTab } from './domains/NSMonitorTab';
import { DomainRenewalTab } from './domains/DomainRenewalTab';

type DomainTab = 'list' | 'failover' | 'servicemonitor' | 'ns-monitor' | 'renewal';

interface DomainsProps {
  activeTab: DomainTab;
}

export function Domains({ activeTab }: DomainsProps) {
  return (
    <div className="page-shell">
      {activeTab === 'list' && <DomainListTab />}
      {activeTab === 'failover' && <FailoverTab />}
      {activeTab === 'servicemonitor' && <ServiceMonitorTab />}
      {activeTab === 'ns-monitor' && <NSMonitorTab />}
      {activeTab === 'renewal' && <DomainRenewalTab />}
    </div>
  );
}
