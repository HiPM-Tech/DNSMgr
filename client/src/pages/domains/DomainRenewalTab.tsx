import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Empty, Input, Loading, Pagination, Select, Space, Tag } from 'tdesign-react';
import { AddIcon, CalendarIcon, CheckCircleIcon, DeleteIcon, ErrorCircleIcon, RefreshIcon, SearchIcon, TimeIcon, StopCircleIcon, PlayCircleIcon } from 'tdesign-icons-react';
import { domainRenewalApi, accountsApi, api } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { formatDomainName } from '../../utils/domain';

function selectValue(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '');
}

export function DomainRenewalTab() {
  const toast = useToast();
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [renewing, setRenewing] = useState<number | null>(null);

  useRealtimeData({
    queryKey: ['renewable-domains'],
    websocketEventTypes: ['domain_renewed'],
    pollingInterval: 120000,
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedDomainIds, setSelectedDomainIds] = useState<Set<string>>(new Set());
  const [deleteDomain, setDeleteDomain] = useState<any | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: accounts = [] } = useQuery({
    queryKey: ['dns-accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data || []),
    enabled: isAddModalOpen,
  });

  const { data: availableDomains = [], isLoading: isLoadingAvailableDomains } = useQuery({
    queryKey: ['provider-renewable-domains', selectedAccountId],
    queryFn: async () => {
      if (!selectedAccountId) return [];
      const account = accounts.find((a: any) => a.id === selectedAccountId);
      if (!account) return [];
      const res = await api.get(`/providers/${account.type}/renewable-domains`);
      const allDomains = res.data.data || [];
      return allDomains.filter((domain: any) => domain.account_id === selectedAccountId);
    },
    enabled: !!selectedAccountId && isAddModalOpen,
  });

  const batchAddMutation = useMutation({
    mutationFn: async ({ accountId, subdomains }: { accountId: number; subdomains: any[] }) => {
      const account = accounts.find((a: any) => a.id === accountId);
      if (!account) throw new Error('Account not found');

      const promises = subdomains.map((sub) => domainRenewalApi.addRenewableDomain({
        account_id: accountId,
        provider_type: account.type,
        domain_name: sub.name || sub.full_domain.split('.')[0],
        third_id: String(sub.id),
        full_domain: sub.full_domain,
        expires_at: sub.expires_at,
        remark: `Added from ${account.name}`,
      }));

      const results = await Promise.allSettled(promises);
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      return { successCount, total: subdomains.length };
    },
    onSuccess: ({ successCount, total }) => {
      queryClient.invalidateQueries({ queryKey: ['renewable-domains'] });
      queryClient.refetchQueries({ queryKey: ['renewable-domains'] });
      setIsAddModalOpen(false);
      setSelectedAccountId(null);
      setSelectedDomainIds(new Set());
      toast.success(`${t('domainRenewal.addSuccess')} (${successCount}/${total})`);
    },
    onError: () => {
      toast.error(t('domainRenewal.addFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => domainRenewalApi.deleteRenewableDomain(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewable-domains'] });
      setDeleteDomain(null);
      toast.success(t('domainRenewal.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('domainRenewal.deleteFailed'));
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => 
      domainRenewalApi.toggleEnabled(id, enabled),
    onSuccess: (_, { enabled }) => {
      queryClient.invalidateQueries({ queryKey: ['renewable-domains'] });
      toast.success(enabled ? t('common.enabled') : t('common.disabled'));
    },
    onError: () => {
      toast.error(t('common.operationFailed'));
    },
  });

  const isAdmin = user?.role === 2 || user?.role === 3;

  const { data: renewableData, isLoading } = useQuery({
    queryKey: ['renewable-domains', page, pageSize, searchKeyword],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await domainRenewalApi.getRenewableDomains({ page, pageSize, keyword: searchKeyword || undefined });
      return res.data.data || { list: [], total: 0 };
    },
  });
  const renewableDomains = renewableData?.list || [];
  const total = renewableData?.total || 0;

  const renewMutation = useMutation({
    mutationFn: ({ domainId, subdomainId }: { domainId: number; subdomainId: number }) => domainRenewalApi.renew(domainId, subdomainId),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        toast.success(t('domainRenewal.renewSuccess'));
        queryClient.invalidateQueries({ queryKey: ['renewable-domains'] });
      } else {
        toast.error(res.data.msg || t('domainRenewal.renewFailed'));
      }
      setRenewing(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || t('domainRenewal.renewFailed'));
      setRenewing(null);
    },
  });

  const getDaysLeft = (expiresAt?: string | null) => {
    if (!expiresAt) return null;

    const expiryDate = new Date(expiresAt);
    if (Number.isNaN(expiryDate.getTime())) return null;

    return Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatus = (expiresAt?: string | null) => {
    if (!expiresAt) return { label: t('common.unknown'), theme: 'default' as const };

    const daysLeft = getDaysLeft(expiresAt);
    if (daysLeft === null) return { label: t('common.unknown'), theme: 'default' as const };

    if (daysLeft < 0) {
      return { label: t('domains.expired'), theme: 'danger' as const, daysLeft };
    }
    if (daysLeft <= 7) {
      return { label: t('domainRenewal.expiringSoon'), theme: 'danger' as const, daysLeft };
    }
    if (daysLeft <= 30) {
      return { label: t('domainRenewal.expiringMonth'), theme: 'warning' as const, daysLeft };
    }
    return { label: t('domainRenewal.active'), theme: 'success' as const, daysLeft };
  };

  const handleBatchAdd = () => {
    if (!selectedAccountId || selectedDomainIds.size === 0) {
      toast.error(t('domainRenewal.selectDomains'));
      return;
    }

    const selectedSubdomains = availableDomains.filter((sub: any) => selectedDomainIds.has(String(sub.id)));
    batchAddMutation.mutate({ accountId: selectedAccountId, subdomains: selectedSubdomains });
  };

  const toggleDomainSelection = (domainId: string) => {
    const newSet = new Set(selectedDomainIds);
    if (newSet.has(domainId)) {
      newSet.delete(domainId);
    } else {
      newSet.add(domainId);
    }
    setSelectedDomainIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedDomainIds.size === availableDomains.length) {
      setSelectedDomainIds(new Set());
    } else {
      setSelectedDomainIds(new Set(availableDomains.map((sub: any) => String(sub.id))));
    }
  };

  const columns = [
    {
      key: 'name',
      label: t('common.name'),
      render: (row: any) => <span className="page-strong">{formatDomainName(row.full_domain || row.domain_name)}</span>,
    },
    {
      key: 'account_name',
      label: t('accounts.provider'),
      render: (row: any) => (
        <Tag theme="primary" variant="light">
          {row.account_name || 'DNSHE'} ({row.provider_type})
        </Tag>
      ),
    },
    {
      key: 'local_status',
      label: t('domainRenewal.localStatus'),
      render: (row: any) => (
        <Tag theme={row.enabled ? 'success' : 'default'} variant="light">
          {row.enabled ? t('common.enabled') : t('common.disabled')}
        </Tag>
      ),
    },
    {
      key: 'expires_at',
      label: t('domainRenewal.expiresAt'),
      render: (row: any) => {
        const expiresAt = row.expires_at;
        if (!expiresAt) return <span className="page-muted">{t('common.unknown')}</span>;
        return (
          <Space size="small">
            <CalendarIcon />
            <span>{new Date(expiresAt).toLocaleDateString()}</span>
          </Space>
        );
      },
    },
    {
      key: 'status',
      label: t('common.status'),
      render: (row: any) => {
        const status = getExpiryStatus(row.expires_at);
        return (
          <Tag theme={status.theme} variant="light">
            {status.label}
            {status.daysLeft !== undefined && status.daysLeft >= 0 && ` (${status.daysLeft}${t('domainRenewal.days')})`}
          </Tag>
        );
      },
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (row: any) => {
        const subdomainId = row.third_id || row.id;
        const isRenewing = renewing === Number(subdomainId);

        return (
          <Space size="small">
            <Button
              theme="primary"
              variant="text"
              icon={<RefreshIcon />}
              loading={isRenewing}
              disabled={!subdomainId || !row.enabled}
              onClick={() => {
                if (subdomainId) {
                  setRenewing(Number(subdomainId));
                  renewMutation.mutate({ domainId: row.id, subdomainId: Number(subdomainId) });
                }
              }}
            >
              {isRenewing ? t('domainRenewal.renewing') : t('domainRenewal.renew')}
            </Button>
            <Button
              shape="square"
              variant="text"
              theme={row.enabled ? 'warning' : 'success'}
              icon={row.enabled ? <StopCircleIcon /> : <PlayCircleIcon />}
              disabled={toggleEnabledMutation.isPending}
              onClick={() => {
                // Toggle enabled state (handle both boolean and number from database)
                const currentEnabled = !!row.enabled;
                toggleEnabledMutation.mutate({ id: row.id, enabled: !currentEnabled });
              }}
            />
            <Button
              shape="square"
              variant="text"
              theme="danger"
              icon={<DeleteIcon />}
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteDomain(row)}
            />
          </Space>
        );
      },
    },
  ];

  if (!isAdmin) {
    return (
      <Alert
        theme="warning"
        title={t('common.permissionDenied')}
        message={t('domainRenewal.notSupportedDesc')}
      />
    );
  }

  const activeCount = renewableDomains.filter((domain: any) => {
    const daysLeft = getDaysLeft(domain.expires_at);
    return daysLeft !== null && daysLeft > 30;
  }).length;
  const expiringCount = renewableDomains.filter((domain: any) => {
    const daysLeft = getDaysLeft(domain.expires_at);
    return daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
  }).length;
  const expiredCount = renewableDomains.filter((domain: any) => {
    const daysLeft = getDaysLeft(domain.expires_at);
    return daysLeft !== null && daysLeft < 0;
  }).length;
  const renewalMetrics = [
    {
      key: 'success',
      icon: <CheckCircleIcon />,
      label: t('domainRenewal.activeDomains'),
      value: activeCount,
    },
    {
      key: 'warning',
      icon: <TimeIcon />,
      label: t('domainRenewal.expiringDomains'),
      value: expiringCount,
    },
    {
      key: 'danger',
      icon: <ErrorCircleIcon />,
      label: t('domainRenewal.expiredDomains'),
      value: expiredCount,
    },
  ] as const;

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h2>{t('domainRenewal.title')}</h2>
          <p>{t('domainRenewal.subtitle')}</p>
        </div>
        <Button theme="primary" icon={<AddIcon />} onClick={() => setIsAddModalOpen(true)}>
          {t('domainRenewal.addDomain')}
        </Button>
      </section>

      <div className="domain-renewal-metrics">
        {renewalMetrics.map((metric) => (
          <Card
            key={metric.key}
            bordered={false}
            shadow={false}
            className={`domain-renewal-metric domain-renewal-metric--${metric.key}`}
          >
            <div className="domain-renewal-metric__content">
              <span className="domain-renewal-metric__label">
                {metric.icon}
                <span>{metric.label}</span>
              </span>
              <strong className="domain-renewal-metric__value">{metric.value}</strong>
            </div>
          </Card>
        ))}
      </div>

      <Card bordered={false} shadow={false} className="page-card">
        <div className="records-toolbar">
          <Input
            clearable
            type="search"
            value={searchKeyword}
            prefixIcon={<SearchIcon />}
            placeholder={t('common.search')}
            onChange={(value: any) => { setSearchKeyword(String(value)); setPage(1); }}
            style={{ width: 240 }}
          />
        </div>
        <Table
          columns={columns}
          data={renewableDomains}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyText={t('domainRenewal.noDomains')}
        />
        <div className="records-pagination">
          <Pagination
            current={page}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50, 100]}
            total={total}
            onCurrentChange={(c: number) => setPage(c)}
            onPageSizeChange={(s: number) => { setPageSize(s); setPage(1); }}
          />
        </div>
      </Card>

      <Alert
        theme="info"
        title={t('domainRenewal.autoRenewal')}
        message={t('domainRenewal.autoRenewalDesc')}
        icon={<TimeIcon />}
      />

      {isAddModalOpen && (
        <Modal
          title={t('domainRenewal.addDomain')}
          onClose={() => {
            setIsAddModalOpen(false);
            setSelectedAccountId(null);
            setSelectedDomainIds(new Set());
          }}
          size="lg"
        >
          {!selectedAccountId ? (
            <div className="page-shell">
              <Select
                value=""
                placeholder={t('domainRenewal.selectProvider')}
                options={accounts
                  .filter((account: any) => account.type === 'dnshe')
                  .map((account: any) => ({ label: `${account.name} (${account.type})`, value: account.id }))}
                onChange={(value) => {
                  const id = Number(selectValue(value));
                  if (id) setSelectedAccountId(id);
                }}
              />
              <Space className="record-form__actions">
                <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
                  {t('common.cancel')}
                </Button>
              </Space>
            </div>
          ) : (
            <div className="page-shell">
              <section className="page-heading page-heading--compact">
                <div>
                  <h3>{t('domainRenewal.selectDomainsToAdd', { count: selectedDomainIds.size })}</h3>
                  <p>{accounts.find((account: any) => account.id === selectedAccountId)?.name}</p>
                </div>
                <Button variant="text" theme="primary" onClick={toggleSelectAll}>
                  {selectedDomainIds.size === availableDomains.length ? t('common.deselectAll') : t('domainRenewal.selectAll')}
                </Button>
              </section>

              {isLoadingAvailableDomains ? (
                <div className="page-state"><Loading loading text={t('domainRenewal.loadingDomains')} /></div>
              ) : availableDomains.length === 0 ? (
                <Empty description={t('domainRenewal.noAvailableDomains')} />
              ) : (
                <div className="page-list page-list--scroll">
                  {availableDomains.map((sub: any) => (
                    <label key={sub.id} className="token-domain-option">
                      <Checkbox
                        checked={selectedDomainIds.has(String(sub.id))}
                        onChange={() => toggleDomainSelection(String(sub.id))}
                      />
                      <span className="page-list-item__main">
                        <strong>{formatDomainName(sub.full_domain)}</strong>
                        <span>
                          ID: {sub.id}
                          {sub.expires_at && ` | ${t('domainRenewal.expires')}: ${new Date(sub.expires_at).toLocaleDateString()}`}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <Space className="record-form__actions">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedAccountId(null);
                    setSelectedDomainIds(new Set());
                  }}
                >
                  {t('domainRenewal.back')}
                </Button>
                <Button
                  theme="primary"
                  loading={batchAddMutation.isPending}
                  disabled={selectedDomainIds.size === 0}
                  onClick={handleBatchAdd}
                >
                  {`${t('domainRenewal.addSelected')} (${selectedDomainIds.size})`}
                </Button>
              </Space>
            </div>
          )}
        </Modal>
      )}

      {deleteDomain && (
        <ConfirmDialog
          message={t('domainRenewal.deleteConfirm', { domain: deleteDomain.full_domain || deleteDomain.name })}
          onConfirm={() => deleteMutation.mutate(deleteDomain.id)}
          onCancel={() => setDeleteDomain(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
