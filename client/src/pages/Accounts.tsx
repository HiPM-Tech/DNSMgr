import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Select, Space, Switch, Tag } from 'tdesign-react';
import type { SelectValue } from 'tdesign-react/es/select';
import { AddIcon, DeleteIcon, EditIcon } from 'tdesign-icons-react';
import { accountsApi } from '../api';
import type { DnsAccount, Provider, ProviderField } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { isAdmin } from '../utils/roles';
import { useRealtimeData } from '../hooks/useRealtimeData';

const PROVIDER_THEMES: Record<string, 'default' | 'primary' | 'warning' | 'danger' | 'success'> = {
  aliyun: 'primary',
  dnspod: 'primary',
  cloudflare: 'warning',
  huaweicloud: 'danger',
  tencentcloud: 'primary',
  route53: 'warning',
  godaddy: 'success',
  namesilo: 'default',
};

function ProviderBadge({ type }: { type: string }) {
  return <Tag theme={PROVIDER_THEMES[type] ?? 'default'} variant="light">{type}</Tag>;
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
  const [type, setType] = useState(initial?.type ?? providers[0]?.type ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [remark, setRemark] = useState(initial?.remark ?? '');
  const [useProxy, setUseProxy] = useState(() => {
    const raw = initial?.config?.useProxy;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') return raw === 'true';
    return false;
  });
  const [config, setConfig] = useState<Record<string, string>>(
    initial?.config ? Object.fromEntries(Object.keys(initial.config).filter((key) => key !== 'useProxy').map((key) => [key, String(initial.config[key] || '')])) : {}
  );

  const provider = providers.find((item) => item.type === type);
  const providerOptions = providers.map((item) => ({ label: item.name, value: item.type }));

  const handleTypeChange = (nextType: string) => {
    setType(nextType);
    setConfig({});
    setUseProxy(false);
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
            value={value}
            options={[
              { label: t('common.pleaseSelect'), value: '' },
              ...field.options.map((option) => ({ label: option.label, value: option.value })),
            ]}
            onChange={(nextValue) => setConfig((current) => ({ ...current, [field.key]: selectToString(nextValue) }))}
          />
        ) : (
          <Input
            clearable
            type={field.type === 'password' && value === '***' ? 'password' : 'text'}
            value={value}
            onChange={(nextValue) => setConfig((current) => ({ ...current, [field.key]: String(nextValue) }))}
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
      onSubmit={({ e }) => {
        e?.preventDefault();
        submitAccount();
      }}
    >
      <Form.FormItem label={t('accounts.providerType')}>
        <Select value={type} options={providerOptions} onChange={(value) => handleTypeChange(selectToString(value))} />
      </Form.FormItem>
      <Form.FormItem label={t('accounts.accountName')}>
        <Input
          clearable
          value={name}
          onChange={(value) => setName(String(value))}
          placeholder={t('accounts.accountNamePlaceholder')}
        />
      </Form.FormItem>

      {(provider?.configFields ?? []).map(renderField)}

      <Form.FormItem label={t('accounts.useProxy')} help={t('accounts.useProxyHint')}>
        <Switch value={useProxy} onChange={setUseProxy} />
      </Form.FormItem>
      <Form.FormItem label={t('common.remark')}>
        <Input
          clearable
          value={remark}
          onChange={(value) => setRemark(String(value))}
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
  const [editing, setEditing] = useState<DnsAccount | null>(null);
  const [deleting, setDeleting] = useState<DnsAccount | null>(null);

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
      setEditing(null);
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
          <Button shape="square" variant="text" icon={<EditIcon />} disabled={!canManage} onClick={() => setEditing(row)} />
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
