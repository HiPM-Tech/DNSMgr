import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { tunnelsApi } from '../api';
import { Table } from './Table';
import { useToast } from '../hooks/useToast';
import { Badge } from './Badge';

export function TunnelList({ accountId }: { accountId?: number }) {
  const toast = useToast();
  const qc = useQueryClient();

  const { data: tunnels = [], isLoading } = useQuery({
    queryKey: ['tunnels'],
    queryFn: () => tunnelsApi.list().then(r => r.data.data ?? []),
  });

  const filteredTunnels = accountId ? tunnels.filter((t: any) => t.account_id === accountId) : tunnels;

  const deleteMutation = useMutation({
    mutationFn: ({ accId, tunnelId }: { accId: string; tunnelId: string }) =>
      tunnelsApi.delete(accId, tunnelId),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      qc.invalidateQueries({ queryKey: ['tunnels'] });
      toast.success('Tunnel deleted');
    },
    onError: () => toast.error('Failed to delete tunnel'),
  });

  const columns = [
    { key: 'name', label: 'Name', render: (r: any) => <span className="font-medium text-gray-900 dark:text-white">{r.name}</span> },
    { key: 'status', label: 'Status', render: (r: any) => <Badge variant={r.status === 'active' ? 'green' : 'gray'}>{r.status}</Badge> },
    { key: 'account', label: 'Account', render: (r: any) => <span className="text-gray-500 text-sm">{r.account_name}</span> },
    { key: 'created_at', label: 'Created At', render: (r: any) => <span className="text-gray-500 text-sm">{new Date(r.created_at).toLocaleString()}</span> },
    {
      key: 'actions', label: 'Actions', render: (r: any) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm(`Delete tunnel ${r.name}?`)) {
                deleteMutation.mutate({ accId: r.account_id, tunnelId: r.id });
              }
            }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <Table columns={columns} data={filteredTunnels} loading={isLoading} rowKey={(r) => r.id} emptyText="No tunnels found" />
    </div>
  );
}
