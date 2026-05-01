import { useQuery } from '@tanstack/react-query';
import { Globe, Server, Users, Activity, Clock } from 'lucide-react';
import { accountsApi, domainsApi, usersApi, logsApi } from '../api';
import type { Domain } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { AuditLogList } from '../components/AuditLogList';
import { useRealtimeData } from '../hooks/useRealtimeData';

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { isAdmin } = useAuth();
  const { t } = useI18n();

  // 实时数据：仪表盘统计信息
  useRealtimeData({
    queryKey: ['accounts'],
    websocketEventTypes: ['account_created', 'account_updated', 'account_deleted'],
    pollingInterval: 120000, // 2分钟
  });
  
  useRealtimeData({
    queryKey: ['domains-dashboard'],
    websocketEventTypes: ['domain_created', 'domain_updated', 'domain_deleted'],
    pollingInterval: 60000, // 1分钟
  });
  
  if (isAdmin) {
    useRealtimeData({
      queryKey: ['users'],
      websocketEventTypes: ['user_created', 'user_updated', 'user_deleted'],
      pollingInterval: 120000, // 2分钟
    });
    
    useRealtimeData({
      queryKey: ['audit-logs'],
      websocketEventTypes: ['audit_log_created'],
      pollingInterval: 60000, // 1分钟
    });
  }

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data ?? []),
  });

  const { data: domainsData } = useQuery<{ list: Domain[]; total: number; page: number; pageSize: number; totalPages: number }>({
    queryKey: ['domains-dashboard'],
    queryFn: () => domainsApi.list({ pageSize: 100000 }).then((r) => r.data.data ?? { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
  });
  const domains = domainsData?.list ?? [];
  const totalDomainsCount = domainsData?.total ?? 0;

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data.data ?? []),
    enabled: isAdmin,
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: () => logsApi.list({ pageSize: 10 }).then((r) => r.data.data?.list ?? []),
  });

  const totalRecords = domains?.reduce((s, d) => s + (d.record_count ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Globe} label={t('dashboard.totalDomains')} value={totalDomainsCount} color="bg-blue-600" />
        <StatCard icon={Activity} label={t('dashboard.totalRecords')} value={totalRecords} color="bg-indigo-600" />
        <StatCard icon={Server} label={t('dashboard.dnsAccounts')} value={accounts?.length ?? 0} color="bg-violet-600" />
        {isAdmin && <StatCard icon={Users} label={t('dashboard.activeUsers')} value={users?.filter((u) => u.status !== 0).length ?? 0} color="bg-emerald-600" />}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">{t('dashboard.recentOperations')}</h2>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.recentItems', { count: 10 })}</span>
        </div>
        {logsLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !logs || logs.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">{t('dashboard.noRecentActivity')}</p>
        ) : (
          <AuditLogList logs={logs} compact />
        )}
      </div>
    </div>
  );
}
