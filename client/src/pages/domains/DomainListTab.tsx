import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Checkbox, Empty, Form, Input, Loading, Pagination, Radio, Select, Space, Tag } from 'tdesign-react';
import {
  ActivityIcon,
  AddIcon,
  DeleteIcon,
  EditIcon,
  JumpIcon,
  LayersIcon,
  PinIcon,
  RootListIcon,
  SearchIcon,
} from 'tdesign-icons-react';
import { useNavigate } from 'react-router-dom';
import { domainsApi, accountsApi, authApi } from '../../api';
import type { Domain, DnsAccount, ProviderDomainOption } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { isApexDomain } from '../../utils/domain-utils';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useFormSync } from '../../hooks/useFormSync';

interface AddDomainFormProps {
  accounts: DnsAccount[];
  onClose: () => void;
}

function selectValue(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '');
}

const dialogField = (label: string, control: ReactNode, tips?: ReactNode) => (
  <div className="settings-control-field">
    <span>{label}</span>
    {control}
    {tips && <small className="settings-control-field__tip">{tips}</small>}
  </div>
);

type DomainEditFormState = {
  id: number;
  name: string;
  account_id: number;
  third_id: string;
  remark: string;
};

const DEFAULT_DOMAIN_EDIT_FORM: DomainEditFormState = {
  id: 0,
  name: '',
  account_id: 0,
  third_id: '',
  remark: '',
};

function normalizeDomainEditForm(domain?: Partial<Domain> | null, fallback?: Partial<Domain> | null): DomainEditFormState {
  const source = domain ?? fallback ?? {};
  return {
    id: Number(source.id ?? fallback?.id ?? 0),
    name: String(source.name ?? fallback?.name ?? ''),
    account_id: Number(source.account_id ?? fallback?.account_id ?? 0),
    third_id: String(source.third_id ?? fallback?.third_id ?? ''),
    remark: String(source.remark ?? fallback?.remark ?? ''),
  };
}

function AddDomainForm({ accounts, onClose }: AddDomainFormProps) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [accountId, setAccountId] = useState<number>(accounts[0]?.id ?? 0);
  const [mode, setMode] = useState<'manual' | 'sync'>('manual');
  const [name, setName] = useState('');
  const [thirdId, setThirdId] = useState('');
  const [remark, setRemark] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);

  const { data: providerDomains = [], isFetching: loadingDomains } = useQuery({
    queryKey: ['provider-domains', accountId],
    queryFn: () => domainsApi.listFromProvider(accountId).then((r) => r.data.data ?? []),
    enabled: mode === 'sync' && accountId > 0,
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof domainsApi.create>[0]) => domainsApi.create(data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['domains'], refetchType: 'active' });
      onClose();
      toast.success(res.data.msg || t('domains.addDomainSuccess'));
    },
    onError: () => toast.error(t('domains.addDomainFailed')),
  });

  const handleSubmit = () => {
    if (mode === 'sync') {
      const domains = providerDomains.filter((domain) => selectedProviders.includes(domain.third_id));
      if (domains.length === 0) return;
      createMutation.mutate({ account_id: accountId, domains, remark });
    } else {
      const normalizedName = name.trim().toLowerCase();
      if (!normalizedName) return;
      createMutation.mutate({ name: normalizedName, account_id: accountId, third_id: thirdId || undefined, remark });
    }
  };

  const toggleProvider = (thirdIdValue: string, checked: boolean) => {
    setSelectedProviders((current) => (
      checked
        ? [...new Set([...current, thirdIdValue])]
        : current.filter((id) => id !== thirdIdValue)
    ));
  };

  if (accounts.length === 0) {
    return (
      <div className="page-state">
        <div className="empty-action">
          <ActivityIcon />
          <h3>{t('domains.noAccounts')}</h3>
          <p>{t('domains.noAccountsDesc')}</p>
          <Button
            theme="primary"
            icon={<AddIcon />}
            onClick={() => {
              onClose();
              navigate('/accounts');
            }}
          >
            {t('domains.goToAddAccount')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form layout="vertical" colon={false} requiredMark={false} className="page-shell" onSubmit={({ e }) => { e?.preventDefault(); handleSubmit(); }}>
      <Form.FormItem label={t('domains.dnsAccount')}>
        <Select
          value={accountId}
          options={accounts.map((account) => ({ label: `${account.name} (${account.type})`, value: account.id }))}
          onChange={(value) => {
            setAccountId(Number(selectValue(value)));
            setSelectedProviders([]);
          }}
        />
      </Form.FormItem>

      <Form.FormItem label={t('domains.addMethod')}>
        <Radio.Group
          value={mode}
          variant="primary-filled"
          options={[
            { label: t('domains.manual'), value: 'manual' },
            { label: t('domains.syncFromProvider'), value: 'sync' },
          ]}
          onChange={(value) => setMode(value as 'manual' | 'sync')}
        />
      </Form.FormItem>

      {mode === 'manual' ? (
        <>
          <Form.FormItem label={t('domains.domainName')}>
            <Input value={name} onChange={(value) => setName(String(value))} placeholder="example.com" />
          </Form.FormItem>
          <Form.FormItem label={t('domains.providerDomainId')}>
            <Input value={thirdId} onChange={(value) => setThirdId(String(value))} placeholder={t('domains.providerDomainIdPlaceholder')} />
          </Form.FormItem>
        </>
      ) : (
        <Card bordered title={t('domains.selectDomains')} actions={providerDomains.length > 0 && (
          <Space size="small">
            <Button size="small" variant="outline" onClick={() => setSelectedProviders(providerDomains.map((domain) => domain.third_id))}>
              {t('common.selectAll')}
            </Button>
            <Button
              size="small"
              variant="outline"
              onClick={() => setSelectedProviders(providerDomains.filter((domain) => !selectedProviders.includes(domain.third_id)).map((domain) => domain.third_id))}
            >
              {t('common.invert')}
            </Button>
          </Space>
        )}>
          {loadingDomains ? (
            <div className="page-state"><Loading loading size="small" /></div>
          ) : providerDomains.length === 0 ? (
            <Empty description={t('domains.noProviderDomains')} />
          ) : (
            <div className="page-list page-list--scroll">
              {providerDomains.map((domain: ProviderDomainOption) => (
                <label key={domain.third_id} className="token-domain-option">
                  <Checkbox
                    checked={selectedProviders.includes(domain.third_id)}
                    onChange={(checked) => toggleProvider(domain.third_id, Boolean(checked))}
                  />
                  <span className="page-list-item__main">
                    <strong>{domain.name}</strong>
                    <span>{domain.third_id}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </Card>
      )}

      <Form.FormItem label={t('domains.remark')}>
        <Input value={remark} onChange={(value) => setRemark(String(value))} placeholder={t('common.optionalRemark')} />
      </Form.FormItem>

      <Space className="record-form__actions">
        <Button
          type="submit"
          theme="primary"
          loading={createMutation.isPending}
          disabled={mode === 'sync' && selectedProviders.length === 0}
        >
          {mode === 'sync' && selectedProviders.length > 1 ? t('domains.addDomains', { count: selectedProviders.length }) : t('domains.addDomain')}
        </Button>
      </Space>
    </Form>
  );
}

export function DomainListTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAdmin: isActuallyAdmin } = useAuth();
  const canManage = isActuallyAdmin;
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Domain | null>(null);
  const [editAutoReset, setEditAutoReset] = useState(true);
  const [deleting, setDeleting] = useState<Domain | null>(null);
  const [accountFilter, setAccountFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [domainTypeFilter, setDomainTypeFilter] = useState<'all' | 'apex' | 'subdomain'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage('domainsPageSize', 20);

  useRealtimeData({
    queryKey: ['domains'],
    websocketEventTypes: ['domain_created', 'domain_updated', 'domain_deleted'],
    pollingInterval: 60000,
  });

  const { data: pinnedDomainsData } = useQuery({
    queryKey: ['pinnedDomains'],
    queryFn: () => authApi.getPinnedDomains().then((r) => r.data.data?.pinnedDomains ?? []),
    staleTime: 5 * 60 * 1000,
  });
  const pinnedDomains = pinnedDomainsData ?? [];

  const { data: domainsData, isLoading } = useQuery<{ list: Domain[]; total: number; page: number; pageSize: number; totalPages: number }>({
    queryKey: ['domains', accountFilter, keyword, domainTypeFilter, page, pageSize],
    queryFn: () => domainsApi.list({
      account_id: accountFilter ? Number(accountFilter) : undefined,
      keyword: keyword || undefined,
      domain_type: domainTypeFilter !== 'all' ? domainTypeFilter : undefined,
      page,
      pageSize,
    }).then((r) => r.data.data ?? { list: [], total: 0, page: 1, pageSize, totalPages: 1 }),
    staleTime: 30 * 1000,
  });

  const domains = domainsData?.list ?? [];
  const total = domainsData?.total ?? 0;
  const sortedDomains = [...domains].sort((a, b) => {
    const aPinned = pinnedDomains.includes(a.id);
    const bPinned = pinnedDomains.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  const editingId = editing?.id ?? 0;
  const { data: editingDomainDetail, dataUpdatedAt: editingDomainDetailUpdatedAt } = useQuery({
    queryKey: ['domain', editingId],
    queryFn: async () => {
      const res = await domainsApi.get(editingId);
      if (res.data.code === 0 && res.data.data) {
        return res.data.data;
      }
      throw new Error(res.data.msg || t('domains.updateFailed'));
    },
    enabled: editingId > 0,
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 0,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, remark }: { id: number; remark: string }) => domainsApi.update(id, { remark }),
    onSuccess: (res, variables) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.setQueryData<Domain | undefined>(['domain', variables.id], (current) => (
        current ? { ...current, remark: variables.remark } : current
      ));
      qc.invalidateQueries({ queryKey: ['domains'], refetchType: 'active' });
      setEditing(null);
      setEditAutoReset(true);
      toast.success(t('domains.updateSuccess'));
    },
    onError: () => toast.error(t('domains.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => domainsApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['domains'], refetchType: 'active' });
      setDeleting(null);
      toast.success(t('domains.deleteSuccess'));
    },
    onError: () => toast.error(t('domains.deleteFailed')),
  });

  const pinMutation = useMutation({
    mutationFn: async ({ domainId, isPinned }: { domainId: number; isPinned: boolean }) => {
      const currentPinned = pinnedDomainsData ?? [];
      const newPinned = isPinned
        ? [...currentPinned.filter((id: number) => id !== domainId), domainId]
        : currentPinned.filter((id: number) => id !== domainId);
      return authApi.updatePinnedDomains(newPinned);
    },
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['pinnedDomains'] });
      toast.success('操作成功');
    },
    onError: () => toast.error('操作失败'),
  });

  const accountMap = Object.fromEntries(accounts.map((account) => [account.id, account]));
  const editingDomain = editing ? sortedDomains.find((domain) => domain.id === editing.id) ?? editing : null;
  const editingFormSource = editingDomain
    ? normalizeDomainEditForm(editingDomainDetail ?? editingDomain, editingDomain)
    : undefined;
  const {
    formState: editForm,
    updateField: updateEditField,
    updateFields: updateEditFields,
  } = useFormSync<DomainEditFormState>(
    editingFormSource,
    DEFAULT_DOMAIN_EDIT_FORM,
    {
      fields: ['id', 'name', 'account_id', 'third_id', 'remark'],
      transformers: {
        id: (value: unknown) => Number(value ?? 0),
        name: (value: unknown) => String(value ?? ''),
        account_id: (value: unknown) => Number(value ?? 0),
        third_id: (value: unknown) => String(value ?? ''),
        remark: (value: unknown) => String(value ?? ''),
      },
      autoReset: editAutoReset,
    },
  );

  const openEdit = (domain: Domain) => {
    const next = normalizeDomainEditForm(domain, domain);
    setEditAutoReset(true);
    updateEditFields(next);
    setEditing(domain);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditAutoReset(true);
  };

  const columns = [
    {
      key: 'name',
      label: t('domains.domainName'),
      render: (row: Domain) => {
        const isApex = isApexDomain(row.name);
        return (
          <Space size="small">
            <Button variant="text" theme="primary" icon={<JumpIcon />} onClick={() => navigate(`/domains/${row.id}/records`)}>
              {row.name}
            </Button>
            {!isApex && <Tag theme="warning" variant="light" icon={<LayersIcon />}>{t('domains.subdomain')}</Tag>}
          </Space>
        );
      },
    },
    {
      key: 'account_id',
      label: t('domains.account'),
      render: (row: Domain) => {
        const account = accountMap[row.account_id];
        if (!account) return <span className="page-muted">#{row.account_id}</span>;
        return <Space size="small"><span className="page-strong">{account.name}</span><Tag theme="primary" variant="light">{account.type}</Tag></Space>;
      },
    },
    { key: 'record_count', label: t('domains.records'), render: (row: Domain) => <Tag variant="light">{row.record_count ?? 0}</Tag> },
    {
      key: 'expires_at',
      label: t('domains.expires'),
      render: (row: Domain) => {
        if (!row.expires_at) return <span className="page-muted">{t('domains.unknown')}</span>;
        const expiry = new Date(row.expires_at);
        const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const theme = daysLeft < 0 ? 'danger' : daysLeft <= 30 ? 'warning' : daysLeft <= 90 ? 'primary' : 'success';
        const apexExpiry = row.apex_expires_at ? new Date(row.apex_expires_at) : null;
        return (
          <div className="domain-expiry">
            <Tag theme={theme as any} variant="light">{expiry.toLocaleDateString()}</Tag>
            {apexExpiry && <span>{t('domains.apexDomainExpiry')}: {apexExpiry.toLocaleDateString()}</span>}
            <span>{daysLeft >= 0 ? t('domains.daysLeft', { days: daysLeft }) : t('domains.expired')}</span>
          </div>
        );
      },
    },
    { key: 'remark', label: t('domains.remark'), render: (row: Domain) => <span className="page-muted">{row.remark || t('domains.emptyRemark')}</span> },
    {
      key: 'actions',
      label: t('domains.actions'),
      render: (row: Domain) => {
        const isPinned = pinnedDomains.includes(row.id);
        return (
          <Space size="small">
            <Button
              shape="square"
              variant="text"
              theme={isPinned ? 'warning' : 'default'}
              icon={<PinIcon />}
              onClick={() => pinMutation.mutate({ domainId: row.id, isPinned: !isPinned })}
            />
            <Button shape="square" variant="text" icon={<RootListIcon />} onClick={() => navigate(`/domains/${row.id}/records`)} />
            <Button shape="square" variant="text" icon={<EditIcon />} disabled={!canManage} onClick={() => openEdit(row)} />
            <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} disabled={!canManage} onClick={() => setDeleting(row)} />
          </Space>
        );
      },
    },
  ];

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h2>{t('domains.tabs.list')}</h2>
          <p>{t('domains.tabs.listSubtitle')}</p>
        </div>
        <Button theme="primary" icon={<AddIcon />} disabled={!canManage} onClick={() => setShowAdd(true)}>
          {t('domains.addDomain')}
        </Button>
      </section>

      <Card bordered={false} shadow={false} className="page-card domain-list-card">
        <div className="records-toolbar domain-filter-grid domain-list-card__toolbar">
          <Input
            clearable
            type="search"
            name="domain-list-search"
            autocomplete="off"
            value={keyword}
            prefixIcon={<SearchIcon />}
            placeholder={t('domains.searchPlaceholder')}
            onChange={(value) => { setKeyword(String(value)); setPage(1); }}
          />
          <Select
            value={accountFilter}
            options={[{ label: t('domains.allAccounts'), value: '' }, ...accounts.map((account) => ({ label: account.name, value: String(account.id) }))]}
            onChange={(value) => { setAccountFilter(selectValue(value)); setPage(1); }}
          />
          <Select
            value={domainTypeFilter}
            options={[
              { label: t('domains.allDomains'), value: 'all' },
              { label: t('domains.apexDomains'), value: 'apex' },
              { label: t('domains.subdomains'), value: 'subdomain' },
            ]}
            onChange={(value) => { setDomainTypeFilter(selectValue(value) as 'all' | 'apex' | 'subdomain'); setPage(1); }}
          />
        </div>
        <Table columns={columns} data={sortedDomains} loading={isLoading} rowKey={(row) => row.id} emptyText={t('domains.noDomainsFound')} />
        <div className="records-pagination">
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            pageSizeOptions={[10, 20, 50, 100]}
            onCurrentChange={(current) => setPage(current)}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize);
              setPage(1);
            }}
          />
        </div>
      </Card>

      {showAdd && canManage && (
        <Modal title={t('domains.addDomain')} onClose={() => setShowAdd(false)} size="lg">
          <AddDomainForm accounts={accounts} onClose={() => setShowAdd(false)} />
        </Modal>
      )}

      {editingDomain && canManage && (
        <Modal
          key={`domain-edit-${editingDomain.id}-${editingDomainDetailUpdatedAt}`}
          title={t('domains.editDomain')}
          onClose={closeEdit}
          size="md"
        >
          {(() => {
            const editDomainId = Number(editForm.id ?? 0);
            const editAccountId = Number(editForm.account_id ?? 0);
            const editRemark = String(editForm.remark ?? '');
            const editName = String(editForm.name ?? '');
            const editThirdId = String(editForm.third_id ?? '');
            const accountLabel = accountMap[editAccountId]
              ? `${accountMap[editAccountId].name} (${accountMap[editAccountId].type})`
              : editAccountId
                ? `#${editAccountId}`
                : '';

            return (
          <form
            className="page-shell"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editDomainId) return;
              updateMutation.mutate({ id: editDomainId, remark: editRemark });
            }}
          >
            {dialogField(t('domains.domain'), (
              <Input readonly value={editName} />
            ))}
            {dialogField(t('domains.dnsAccount'), (
              <Input readonly value={accountLabel} />
            ))}
            {dialogField(t('domains.providerDomainId'), (
              <Input readonly value={editThirdId || '-'} />
            ))}
            {dialogField(
              t('domains.remark'),
              <Input
                value={editRemark}
                onChange={(value) => {
                  setEditAutoReset(false);
                  updateEditField('remark', String(value));
                }}
                placeholder={t('common.optionalRemark')}
              />,
            )}
            <Space className="record-form__actions">
              <Button type="submit" theme="primary" loading={updateMutation.isPending}>
                {t('common.save')}
              </Button>
            </Space>
          </form>
            );
          })()}
        </Modal>
      )}

      {deleting && canManage && (
        <ConfirmDialog
          message={t('domains.deleteConfirm', { name: deleting.name })}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
