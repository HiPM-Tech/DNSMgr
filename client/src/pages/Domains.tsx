import { DomainListTab } from './domains/DomainListTab';
import { FailoverTab } from './domains/FailoverTab';
import { NSMonitorTab } from './domains/NSMonitorTab';
import { DomainRenewalTab } from './domains/DomainRenewalTab';

type DomainTab = 'list' | 'failover' | 'ns-monitor' | 'renewal';

interface DomainsProps {
  activeTab: DomainTab;
}

export function Domains({ activeTab }: DomainsProps) {
  return (
    <div className="page-shell">
      {activeTab === 'list' && <DomainListTab />}
      {activeTab === 'failover' && <FailoverTab />}
      {activeTab === 'ns-monitor' && <NSMonitorTab />}
      {activeTab === 'renewal' && <DomainRenewalTab />}
    </div>
  );
}
