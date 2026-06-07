import { DomainListTab } from './domains/DomainListTab';
import { ServiceMonitorTab } from './domains/ServiceMonitorTab';
import { NSMonitorTab } from './domains/NSMonitorTab';
import { DomainRenewalTab } from './domains/DomainRenewalTab';

type DomainTab = 'list' | 'servicemonitor' | 'ns-monitor' | 'renewal';

interface DomainsProps {
  activeTab: DomainTab;
}

export function Domains({ activeTab }: DomainsProps) {
  return (
    <div className="page-shell">
      {activeTab === 'list' && <DomainListTab />}
      {activeTab === 'servicemonitor' && <ServiceMonitorTab />}
      {activeTab === 'ns-monitor' && <NSMonitorTab />}
      {activeTab === 'renewal' && <DomainRenewalTab />}
    </div>
  );
}
