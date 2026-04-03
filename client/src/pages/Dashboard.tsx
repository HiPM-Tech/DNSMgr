import { useQuery } from '@tanstack/react-query';
import { Globe, Server, Users, Activity, Clock } from 'lucide-react';
import { accountsApi, domainsApi, usersApi, logsApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Badge } from '../components/Badge';

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { isAdmin } = useAuth();

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data ?? []),
  });

  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: () => domainsApi.list().then((r) => r.data.data ?? []),
  });

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
        <StatCard icon={Globe} label="Total Domains" value={domains?.length ?? 0} color="bg-blue-600" />
        <StatCard icon={Activity} label="Total Records" value={totalRecords} color="bg-indigo-600" />
        <StatCard icon={Server} label="DNS Accounts" value={accounts?.length ?? 0} color="bg-violet-600" />
        {isAdmin && <StatCard icon={Users} label="Active Users" value={users?.filter((u) => u.status !== 0).length ?? 0} color="bg-emerald-600" />}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Recent Operations</h2>
        </div>
        {logsLoading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !logs || logs.length === 0 ? (
          <p className="text-center text-gray-400 py-10 text-sm">No recent activity</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-4 px-6 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {log.username && <Badge variant="blue">{log.username}</Badge>}
                    <span className="text-sm font-medium text-gray-800">{log.action}</span>
                    {log.target && <span className="text-sm text-gray-500 truncate">{log.target}</span>}
                  </div>
                  {log.detail && <p className="text-xs text-gray-400 mt-0.5 truncate">{log.detail}</p>}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
