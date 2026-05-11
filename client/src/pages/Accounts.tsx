import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Select, Space, Switch } from 'tdesign-react';
import type { SelectValue } from 'tdesign-react/es/select';
import { AddIcon, DeleteIcon, EditIcon } from 'tdesign-icons-react';
import { accountsApi } from '../api';
import type { DnsAccount, Provider, ProviderField } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ProviderIcon, ProviderSelectLabel } from '../components/ProviderIcon';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../utils/roles';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { useFormSync } from '../hooks/useFormSync';
import { toBoolean, toString } from '../utils/formHelpers';

function ProviderBadge({ type }: { type: string }) {
  return (
    <span className="provider-badge">
      <ProviderIcon type={type} size={16} />
      <span className="provider-badge__text">{type}</span>
    </span>
  );
}

interface AccountFormProps {
  providers: Provider[];
  initial?: DnsAccount;
  onSubmit: (data: { type: string; name: string; config: Record<string, string | boolean>; remark: string }) => void;
  isLoading: boolean;
}

function selectToString(value: SelectValue) {
  return String(Array.isArray(value) ? value[0] ?? '' : value);
}

function AccountForm({ providers, initial, onSubmit, isLoading }: AccountFormProps) {
  const { t } = useI18n();
  
  // Define form type that includes temporary fields
  interface AccountFormState extends Partial<DnsAccount> {
    useProxy?: boolean;
  }
  
  // Use useFormSync for unified form state management
  const { formState, updateField } = useFormSync<AccountFormState>(
    initial,
    {
      type: providers[0]?.type ?? '',
      name: '',
      remark: '',
      useProxy: false,
      config: {} as Record<string, string>,
    },
    {
      transformers: {
        remark: (v) => toString(v),
        useProxy: (v: any) => toBoolean(v),
        config: (v) => {
          if (!v) return {};
          const result: Record<string, string> = {};
          Object.keys(v).forEach(key => {
            if (key !== 'useProxy') {
              result[key] = toString(v[key]);
            }
          });
          return result;
        },
      },
    }
  );

  const type = formState.type || '';
  const name = formState.name || '';
  const remark = formState.remark || '';
  const useProxy = formState.useProxy || false;
  const config = formState.config || {};

  const provider = providers.find((item) => item.type === type);
  const providerOptions = providers.map((item) => ({ label: <ProviderSelectLabel provider={item} />, value: item.type }));

  const handleTypeChange = (nextType: string) => {
    updateField('type', nextType);
    updateField('config', {});
    updateField('useProxy', false);
  };

  const submitAccount = () => {
    onSubmit({ type, name, config: { ...config, useProxy }, remark });
  };

  const renderField = (field: ProviderField) => {
    const required = field.required !== false;
    const value = config[field.key] ?? '';

    return (
      <Form.FormItem key={field.key} label={`${field.label}${required ? ' *' : ''}`}>
        {field.type === 'select' && field.options ? (
          <Select
            value={String(value)}
            options={[
              { label: t('common.pleaseSelect'), value: '' },
              ...field.options.map((option) => ({ label: option.label, value: option.value })),
            ]}
            onChange={(nextValue: any) => {
              const newConfig = { ...config, [field.key]: selectToString(nextValue) };
              updateField('config', newConfig);
            }}
          />
        ) : (
          <Input
            clearable
            type={field.type === 'password' && value === '***' ? 'password' : 'text'}
            value={String(value)}
            onChange={(nextValue: any) => {
              const newConfig = { ...config, [field.key]: String(nextValue) };
              updateField('config', newConfig);
            }}
            placeholder={t('accounts.fieldPlaceholder', { label: field.label })}
          />
        )}
      </Form.FormItem>
    );
  };

  return (
    <Form
      layout="vertical"
      colon={false}
      requiredMark={false}
      className="page-shell"
      onSubmit={({ e }: any) => {
        e?.preventDefault();
        submitAccount();
      }}
    >
      <Form.FormItem label={t('accounts.providerType')}>
        <Select value={type} options={providerOptions} onChange={(value: any) => handleTypeChange(selectToString(value))} />
      </Form.FormItem>
      <Form.FormItem label={t('accounts.accountName')}>
        <Input
          clearable
          value={String(name)}
          onChange={(value: any) => updateField('name', String(value))}
          placeholder={t('accounts.accountNamePlaceholder')}
        />
      </Form.FormItem>

      {(provider?.configFields ?? []).map(renderField)}

      <Form.FormItem label={t('accounts.useProxy')} help={t('accounts.useProxyHint')}>
        <Switch value={Boolean(useProxy)} onChange={(checked: any) => updateField('useProxy', Boolean(checked))} />
      </Form.FormItem>
      <Form.FormItem label={t('common.remark')}>
        <Input
          clearable
          value={String(remark)}
          onChange={(value: any) => updateField('remark', String(value))}
          placeholder={t('common.optionalRemark')}
        />
      </Form.FormItem>
      <Space className="record-form__actions">
        <Button type="submit" theme="primary" loading={isLoading}>
          {initial ? t('accounts.saveChanges') : t('accounts.addAccount')}
        </Button>
      </Space>
    </Form>
  );
}

export function Accounts() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const { user: me } = useAuth();
  const canManage = isAdmin(me?.role);
  const [showAdd, setShowAdd] = useState(false);
  const [deleting, setDeleting] = useState<DnsAccount | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  useRealtimeData({
    queryKey: ['accounts'],
    websocketEventTypes: ['account_created', 'account_updated', 'account_deleted'],
    pollingInterval: 60000,
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data ?? []),
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: () => accountsApi.providers().then((r) => r.data.data ?? []),
  });
  const visibleProviders = providers.filter((provider) => !provider.isStub);

  // Fetch account details when editing
  const { data: editingAccount, isLoading: isLoadingEditing } = useQuery({
    queryKey: ['account', editingId],
    queryFn: async () => {
      if (!editingId) return null;
      const res = await accountsApi.get(editingId);
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
    enabled: !!editingId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { type: string; name: string; config: Record<string, string | boolean>; remark: string }) => accountsApi.create(data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['accounts'], refetchType: 'active' });
      setShowAdd(false);
      toast.success(t('accounts.addSuccess'));
    },
    onError: () => toast.error(t('accounts.addFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name?: string; config?: Record<string, string | boolean>; remark?: string } }) =>
      accountsApi.update(id, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['accounts'], refetchType: 'active' });
      setEditingId(null);
      toast.success(t('accounts.updateSuccess'));
    },
    onError: () => toast.error(t('accounts.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => accountsApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['accounts'], refetchType: 'active' });
      setDeleting(null);
      toast.success(t('accounts.deleteSuccess'));
    },
    onError: () => toast.error(t('accounts.deleteFailed')),
  });

  const columns = [
    { key: 'name', label: t('common.name'), render: (row: DnsAccount) => <span className="page-strong">{row.name}</span> },
    { key: 'type', label: t('accounts.provider'), render: (row: DnsAccount) => <ProviderBadge type={row.type} /> },
    { key: 'remark', label: t('common.remark'), render: (row: DnsAccount) => <span className="page-muted">{row.remark || '-'}</span> },
    { key: 'created_at', label: t('common.created'), render: (row: DnsAccount) => <span className="page-muted">{new Date(row.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (row: DnsAccount) => (
        <Space size="small">
          <Button shape="square" variant="text" icon={<EditIcon />} disabled={!canManage} onClick={() => setEditingId(row.id)} />
          <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} disabled={!canManage} onClick={() => setDeleting(row)} />
        </Space>
      ),
    },
  ];

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h1>{t('accounts.title')}</h1>
          <p>{t('accounts.subtitle')}</p>
        </div>
        <Button theme="primary" icon={<AddIcon />} disabled={!canManage} onClick={() => setShowAdd(true)}>
          {t('accounts.addAccount')}
        </Button>
      </section>

      <Card bordered={false} shadow={false} className="page-card">
        <Table
          columns={columns}
          data={accounts}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyText={t('accounts.noAccounts')}
        />
      </Card>

      {showAdd && canManage && visibleProviders.length > 0 && (
        <Modal title={t('accounts.addDnsAccount')} onClose={() => setShowAdd(false)}>
          <AccountForm
            providers={visibleProviders}
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
          />
        </Modal>
      )}

      {editingId && canManage && visibleProviders.length > 0 && (
        <Modal title={t('accounts.editDnsAccount')} onClose={() => setEditingId(null)}>
          {isLoadingEditing ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : editingAccount ? (
            <AccountForm
              providers={visibleProviders}
              initial={editingAccount}
              onSubmit={(data) => updateMutation.mutate({ id: editingId, data })}
              isLoading={updateMutation.isPending}
            />
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>Failed to load account details</div>
          )}
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
