import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import { accountsApi } from '../api';
import type { DnsAccount, Provider, ProviderField } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../utils/roles';

const PROVIDER_COLORS: Record<string, string> = {
  aliyun: 'blue', dnspod: 'blue', cloudflare: 'yellow', huaweicloud: 'red',
  tencentcloud: 'blue', route53: 'yellow', godaddy: 'green', namesilo: 'gray',
};

function ProviderBadge({ type }: { type: string }) {
  const color = (PROVIDER_COLORS[type] ?? 'gray') as 'blue' | 'yellow' | 'green' | 'gray' | 'red';
  return <Badge variant={color}>{type}</Badge>;
}

interface AccountFormProps {
  providers: Provider[];
  initial?: DnsAccount;
  onSubmit: (data: { type: string; name: string; config: Record<string, string>; remark: string }) => void;
  isLoading: boolean;
}

function AccountForm({ providers, initial, onSubmit, isLoading }: AccountFormProps) {
  const { t } = useI18n();
  const [type, setType] = useState(initial?.type ?? providers[0]?.type ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [remark, setRemark] = useState(initial?.remark ?? '');
  const [config, setConfig] = useState<Record<string, string>>(
    initial?.config ? Object.fromEntries(Object.keys(initial.config).map((k) => [k, ''])) : {}
  );

  const provider = providers.find((p) => p.type === type);

  const handleTypeChange = (nextType: string) => {
    setType(nextType);
    setConfig({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ type, name, config, remark });
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounts.providerType')}</label>
        <select value={type} onChange={(e) => handleTypeChange(e.target.value)} className={inputClass}>
          {providers.map((p) => (
            <option key={p.type} value={p.type}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('accounts.accountName')}</label>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('accounts.accountNamePlaceholder')} className={inputClass} />
      </div>
      {(provider?.configFields ?? []).map((field: ProviderField) => (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {field.label}{field.required !== false && ' *'}
          </label>
          <input
            type={field.type === 'password' ? 'password' : 'text'}
            required={field.required !== false}
            value={config[field.key] ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, [field.key]: e.target.value }))}
            placeholder={t('accounts.fieldPlaceholder', { label: field.label })}
            className={inputClass}
          />
        </div>
      ))}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.remark')}</label>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={t('common.optionalRemark')} className={inputClass} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="submit" disabled={isLoading}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
          {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {initial ? t('accounts.saveChanges') : t('accounts.addAccount')}
        </button>
      </div>
    </form>
  );
}

export function Accounts() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const { user: me } = useAuth();
  const canManage = isAdmin(me?.role);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<DnsAccount | null>(null);
  const [deleting, setDeleting] = useState<DnsAccount | null>(null);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data ?? []),
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: () => accountsApi.providers().then((r) => r.data.data ?? []),
  });
  const visibleProviders = providers.filter((p) => !p.isStub);

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof accountsApi.create>[0]) => accountsApi.create(data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setShowAdd(false);
      toast.success(t('accounts.addSuccess'));
    },
    onError: () => toast.error(t('accounts.addFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof accountsApi.update>[1] }) =>
      accountsApi.update(id, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setEditing(null);
      toast.success(t('accounts.updateSuccess'));
    },
    onError: () => toast.error(t('accounts.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountsApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['accounts'] });
      setDeleting(null);
      toast.success(t('accounts.deleteSuccess'));
    },
    onError: () => toast.error(t('accounts.deleteFailed')),
  });

  const columns = [
    { key: 'name', label: t('common.name'), render: (row: DnsAccount) => <span className="font-medium text-gray-900">{row.name}</span> },
    { key: 'type', label: t('accounts.provider'), render: (row: DnsAccount) => <ProviderBadge type={row.type} /> },
    { key: 'remark', label: t('common.remark'), render: (row: DnsAccount) => <span className="text-gray-500">{row.remark || '-'}</span> },
    { key: 'created_at', label: t('common.created'), render: (row: DnsAccount) => <span className="text-gray-500 text-xs">{new Date(row.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions', label: t('common.actions'),
      render: (row: DnsAccount) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(row)} disabled={!canManage}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => setDeleting(row)} disabled={!canManage}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
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
          <h2 className="text-lg font-semibold text-gray-900">{t('accounts.title')}</h2>
          <p className="text-sm text-gray-500">{t('accounts.subtitle')}</p>
        </div>
        <button onClick={() => setShowAdd(true)} disabled={!canManage}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> {t('accounts.addAccount')}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table
          columns={columns}
          data={accounts}
          loading={isLoading}
          rowKey={(r) => r.id}
          emptyText={t('accounts.noAccounts')}
        />
      </div>

      {showAdd && canManage && visibleProviders.length > 0 && (
        <Modal title={t('accounts.addDnsAccount')} onClose={() => setShowAdd(false)}>
          <AccountForm
            providers={visibleProviders}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        </Modal>
      )}

      {editing && canManage && visibleProviders.length > 0 && (
        <Modal title={t('accounts.editDnsAccount')} onClose={() => setEditing(null)}>
          <AccountForm
            providers={visibleProviders}
            initial={editing}
            onSubmit={(data) => updateMutation.mutate({ id: editing.id, data })}
            isLoading={updateMutation.isPending}
          />
        </Modal>
      )}

      {deleting && canManage && (
        <ConfirmDialog
          message={t('accounts.deleteConfirm', { name: deleting.name })}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
