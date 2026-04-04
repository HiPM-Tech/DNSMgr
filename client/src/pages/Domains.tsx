import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ExternalLink, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { domainsApi, accountsApi } from '../api';
import type { Domain, DnsAccount } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';

interface AddDomainFormProps {
  accounts: DnsAccount[];
  onClose: () => void;
}

function AddDomainForm({ accounts, onClose }: AddDomainFormProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id ?? 0);
  const [mode, setMode] = useState<'manual' | 'sync'>('manual');
  const [name, setName] = useState('');
  const [thirdId, setThirdId] = useState('');
  const [remark, setRemark] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<Array<{ name: string; third_id: string }>>([]);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);

  const { data: providerDomains = [], isFetching: loadingDomains } = useQuery({
    queryKey: ['provider-domains', accountId],
    queryFn: () => domainsApi.listFromProvider(accountId).then((r) => r.data.data ?? []),
    enabled: mode === 'sync' && accountId > 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof domainsApi.create>[0]) => domainsApi.create(data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['domains'] });
      onClose();
      toast.success('Domain added successfully');
    },
    onError: () => toast.error('Failed to add domain'),
  });

  const toggleProvider = (provider: { name: string; third_id: string }) => {
    setSelectedProviders((prev) => {
      const exists = prev.some((p) => p.name === provider.name && p.third_id === provider.third_id);
      if (exists) {
        return prev.filter((p) => !(p.name === provider.name && p.third_id === provider.third_id));
      }
      return [...prev, provider];
    });
  };

  const selectAllProviders = () => {
    if (providerDomains.length === 0) return;
    setSelectedProviders(providerDomains.map((d) => ({ name: d.name, third_id: d.third_id })));
  };

  const invertProviderSelection = () => {
    if (providerDomains.length === 0) return;
    setSelectedProviders(
      providerDomains.filter(
        (d) => !selectedProviders.some((p) => p.name === d.name && p.third_id === d.third_id)
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'sync') {
      if (selectedProviders.length === 0 || isBatchSubmitting) return;
      setIsBatchSubmitting(true);
      Promise.allSettled(
        selectedProviders.map((d) =>
          domainsApi.create({ name: d.name, account_id: accountId, third_id: d.third_id, remark })
        )
      )
        .then((results) => {
          let success = 0;
          let duplicate = 0;
          let failed = 0;
          for (const result of results) {
            if (result.status === 'fulfilled') {
              if (result.value.data.code === 0) {
                success++;
              } else if ((result.value.data.msg ?? '').toLowerCase().includes('already exists')) {
                duplicate++;
              } else {
                failed++;
              }
            } else {
              failed++;
            }
          }
          qc.invalidateQueries({ queryKey: ['domains'] });
          if (failed === 0 && duplicate === 0) {
            toast.success(`Added ${success} domain(s)`);
            onClose();
            return;
          }
          toast.error(`Added ${success}, duplicate ${duplicate}, failed ${failed}`);
          if (success > 0) onClose();
        })
        .finally(() => setIsBatchSubmitting(false));
      return;
    }

    {
      if (!name) return;
      createMutation.mutate({ name, account_id: accountId, third_id: thirdId || undefined, remark });
    }
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">DNS Account *</label>
        <select value={accountId} onChange={(e) => { setAccountId(Number(e.target.value)); setSelectedProviders([]); }} className={inputClass}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Add Method</label>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button type="button" onClick={() => setMode('manual')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            Manual
          </button>
          <button type="button" onClick={() => setMode('sync')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'sync' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            Sync from Provider
          </button>
        </div>
      </div>

      {mode === 'manual' ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Domain Name *</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="example.com" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Provider Domain ID</label>
            <input value={thirdId} onChange={(e) => setThirdId(e.target.value)} placeholder="Optional third-party ID" className={inputClass} />
          </div>
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-700">Select Domain</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllProviders}
                disabled={loadingDomains || providerDomains.length === 0}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={invertProviderSelection}
                disabled={loadingDomains || providerDomains.length === 0}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                Invert
              </button>
            </div>
          </div>
          {loadingDomains ? (
            <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : providerDomains.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No domains found from provider</p>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {providerDomains.map((d) => (
                <label key={`${d.name}-${d.third_id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProviders.some((p) => p.name === d.name && p.third_id === d.third_id)}
                    onChange={() => toggleProvider(d)}
                    className="text-blue-600"
                  />
                  <span className="text-sm">{d.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{d.third_id}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Remark</label>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional remark" className={inputClass} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="submit" disabled={createMutation.isPending || isBatchSubmitting || (mode === 'sync' && selectedProviders.length === 0)}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
          {(createMutation.isPending || isBatchSubmitting) && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {mode === 'sync' ? `Add Selected (${selectedProviders.length})` : 'Add Domain'}
        </button>
      </div>
    </form>
  );
}

export function Domains() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Domain | null>(null);
  const [deleting, setDeleting] = useState<Domain | null>(null);
  const [accountFilter, setAccountFilter] = useState('');
  const [keyword, setKeyword] = useState('');

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains', accountFilter, keyword],
    queryFn: () => domainsApi.list({
      account_id: accountFilter ? Number(accountFilter) : undefined,
      keyword: keyword || undefined,
    }).then((r) => r.data.data ?? []),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data ?? []),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, remark }: { id: number; remark: string }) => domainsApi.update(id, { remark }),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['domains'] });
      setEditing(null);
      toast.success('Domain updated');
    },
    onError: () => toast.error('Failed to update domain'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => domainsApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['domains'] });
      setDeleting(null);
      toast.success('Domain deleted');
    },
    onError: () => toast.error('Failed to delete domain'),
  });

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const columns = [
    {
      key: 'name', label: 'Domain Name',
      render: (row: Domain) => (
        <button onClick={() => navigate(`/domains/${row.id}/records`)}
          className="flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-800 transition-colors">
          {row.name}
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      ),
    },
    {
      key: 'account_id', label: 'Account',
      render: (row: Domain) => <span className="text-gray-700">{accountMap[row.account_id]?.name ?? `#${row.account_id}`}</span>,
    },
    {
      key: 'record_count', label: 'Records',
      render: (row: Domain) => (
        <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
          {row.record_count ?? 0}
        </span>
      ),
    },
    { key: 'remark', label: 'Remark', render: (row: Domain) => <span className="text-gray-500">{row.remark || '—'}</span> },
    {
      key: 'actions', label: 'Actions',
      render: (row: Domain) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(row)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => setDeleting(row)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Domains</h2>
          <p className="text-sm text-gray-500">Manage DNS zones across all providers</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Domain
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search domains..." className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56" />
        </div>
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          <option value="">All Accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={domains} loading={isLoading} rowKey={(r) => r.id} emptyText="No domains found." />
      </div>

      {showAdd && (
        <Modal title="Add Domain" onClose={() => setShowAdd(false)}>
          <AddDomainForm accounts={accounts} onClose={() => setShowAdd(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Domain" onClose={() => setEditing(null)} size="sm">
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({ id: editing.id, remark: (e.target as HTMLFormElement).remark.value }); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Domain</label>
              <p className="text-sm font-semibold text-gray-900">{editing.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Remark</label>
              <input name="remark" defaultValue={editing.remark}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="submit" disabled={updateMutation.isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Delete domain "${deleting.name}"? All associated records will be removed.`}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
