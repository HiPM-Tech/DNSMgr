import { useEffect, useState, type ReactNode } from 'react';
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
  PoweroffIcon,
  RootListIcon,
  SearchIcon,
} from 'tdesign-icons-react';
import { useNavigate } from 'react-router-dom';
import { domainsApi, accountsApi, authApi } from '../../api';
import type { Domain, DnsAccount, ProviderDomainOption, WhoisInfo } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { isApexDomain } from '../../utils/domain-utils';
import { formatDomainName } from '../../utils/domain';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useRealtimeData } from '../../hooks/useRealtimeData';

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

const ControlField = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <label style={{ fontSize: '14px', fontWeight: 500, color: 'var(--td-text-color-primary)' }}>{label}</label>
    {children}
  </div>
);

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
                    <strong>{formatDomainName(domain.name)}</strong>
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
  const [editRemark, setEditRemark] = useState('');
  const [editRemarkDirty, setEditRemarkDirty] = useState(false);
  const [deleting, setDeleting] = useState<Domain | null>(null);
  const [accountFilter, setAccountFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [domainTypeFilter, setDomainTypeFilter] = useState<'all' | 'apex' | 'subdomain'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useLocalStorage('domainsPageSize', 20);
  
  // ← 批量操作功能已禁用
  // const [selectedRowKeys, setSelectedRowKeys] = useState<(string | number)[]>([]);
  // const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  useRealtimeData({
    queryKey: ['domains'],
    websocketEventTypes: ['domain_created', 'domain_updated', 'domain_deleted', 'domain_whois_updated', 'pinned_domains_updated'],
    pollingInterval: 60000,
  });

  const { data: pinnedDomainsData } = useQuery({
    queryKey: ['pinnedDomains'],
    queryFn: () => authApi.getPinnedDomains().then((r) => r.data.data?.pinnedDomains ?? []),
    staleTime: 5 * 60 * 1000,
  });
  const pinnedDomains = pinnedDomainsData ?? [];

  const { data: domainsData, isLoading } = useQuery<{ list: Domain[]; total: number; page: number; pageSize: number; totalPages: number }>({
    queryKey: ['domains', accountFilter, keyword, domainTypeFilter, statusFilter, page, pageSize],
    queryFn: async () => {
      // 使用后端分页和过滤
      const res = await domainsApi.list({
        account_id: accountFilter ? Number(accountFilter) : undefined,
        keyword: keyword || undefined,
        domain_type: domainTypeFilter !== 'all' ? domainTypeFilter : undefined,
        domain_status: statusFilter,  // 'enabled' | 'disabled' | 'all'
        pinned_domains: pinnedDomains.length > 0 ? pinnedDomains.join(',') : undefined,  // ← 传递置顶域名 ID 列表
        page,
        pageSize,
      });
      
      return res.data.data ?? { list: [], total: 0, page: 1, pageSize, totalPages: 1 };
    },
    staleTime: 30 * 1000,
  });

  const domains = domainsData?.list ?? [];
  const total = domainsData?.total ?? 0;
  
  // ← 后端已经按置顶排序，前端不需要再排序
  const sortedDomains = domains;

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data ?? []),
    staleTime: 5 * 60 * 1000,
  });

  // 使用数据库中的WHOIS状态（由后端定时任务同步）
  const apexDomains = domains.filter((d) => isApexDomain(d.name));
  
  // 构建WHOIS状态映射（直接从数据库读取）
  const whoisMap: Record<string, WhoisInfo> = {};
  for (const domain of apexDomains) {
    if (domain.whois_status) {
      whoisMap[domain.name] = {
        domain: domain.name,
        status: domain.whois_status,
      };
    }
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, remark }: { id: number; remark: string }) => domainsApi.update(id, { remark }),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['domains'], refetchType: 'active' });
      setEditing(null);
      setEditRemark('');
      setEditRemarkDirty(false);
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
      // ← 同时刷新置顶列表和域名列表
      qc.invalidateQueries({ queryKey: ['pinnedDomains'], refetchType: 'active' });
      qc.invalidateQueries({ queryKey: ['domains'], refetchType: 'active' });
      toast.success(t('domains.pinSuccess'));
    },
    onError: () => toast.error(t('domains.pinFailed')),
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: number }) => {
      console.log('[DomainList] Toggling enabled status:', { id, enabled });
      return domainsApi.update(id, { enabled });
    },
    onSuccess: (res) => {
      console.log('[DomainList] Toggle success:', res.data);
      if (res.data.code !== 0) { 
        toast.error(res.data.msg || t('domains.toggleStatusFailed')); 
        return; 
      }
      qc.invalidateQueries({ queryKey: ['domains'], refetchType: 'active' });
      toast.success(t('domains.toggleStatusSuccess'));
    },
    onError: (error) => {
      console.error('[DomainList] Toggle failed:', error);
      toast.error(t('domains.toggleStatusFailed'));
    },
  });

  // ← 批量删除 mutation 已禁用
  // const batchDeleteMutation = useMutation({
  //   mutationFn: (domainIds: number[]) => domainsApi.batchDelete(domainIds),
  //   onSuccess: (res) => {
  //     if (res.data.code !== 0) {
  //       toast.error(res.data.msg || t('domains.batchDeleteFailed'));
  //       return;
  //     }
  //     const { deleted, failed, inaccessibleCount } = res.data.data;
  //     
  //     if (deleted > 0) {
  //       qc.invalidateQueries({ queryKey: ['domains'], refetchType: 'active' });
  //       setSelectedRowKeys([]);  // 清空选择
  //       
  //       if (failed === 0 && !inaccessibleCount) {
  //         toast.success(t('domains.batchDeleteSuccess', { count: deleted }));
  //       } else {
  //         let message = t('domains.batchDeletePartialSuccess', { deleted, failed });
  //         if (inaccessibleCount) {
  //           message += ` ${t('domains.batchDeleteSkipped', { count: inaccessibleCount })}`;
  //         }
  //         toast.info(message);
  //       }
  //     } else {
  //       toast.error(t('domains.batchDeleteFailed'));
  //     }
  //   },
  //   onError: () => {
  //     toast.error(t('domains.batchDeleteFailed'));
  //   },
  // });

  const accountMap = Object.fromEntries(accounts.map((account) => [account.id, account]));
  const editingDomain = editing ? sortedDomains.find((domain) => domain.id === editing.id) ?? editing : null;
  const getListedRemark = (domainId: number, fallback?: string | null) => {
    const listedDomain = sortedDomains.find((item) => item.id === domainId);
    return listedDomain?.remark ?? fallback ?? '';
  };

  useEffect(() => {
    if (!editingDomain || editRemarkDirty) return;
    setEditRemark(getListedRemark(editingDomain.id, editingDomain.remark));
  }, [editingDomain, sortedDomains, editRemarkDirty]);

  const openEdit = (domain: Domain) => {
    setEditRemarkDirty(false);
    setEditRemark(getListedRemark(domain.id, domain.remark));
    setEditing(domain);
  };

  const columns = [
    {
      key: 'name',
      label: t('domains.domainName'),
      width: 250,
      render: (row: Domain) => {
        const isApex = isApexDomain(row.name);
        const displayName = formatDomainName(row.name);
        return (
          <Space size="small">
            <Button className="domain-name-button" variant="text" theme="primary" icon={<JumpIcon />} onClick={() => navigate(`/dash/domains/${row.id}/records`)} title={displayName}>
              {displayName}
            </Button>
            {!isApex && <Tag theme="warning" variant="light" icon={<LayersIcon />}>{t('domains.subdomain')}</Tag>}
          </Space>
        );
      },
    },
    {
      key: 'local_status',
      label: t('domains.localStatus'),
      render: (row: Domain) => {
        const isEnabled = row.enabled !== 0;
        const localStatusText = isEnabled ? t('common.enabled') : t('common.disabled');
        const localStatusTheme = isEnabled ? 'success' : 'default';
        return (
          <Tag theme={localStatusTheme} variant="light" size="small">
            {localStatusText}
          </Tag>
        );
      },
    },
    {
      key: 'whois_status',
      label: t('domains.domainStatus'),
      render: (row: Domain) => {
        const isApex = isApexDomain(row.name);
        if (!isApex) {
          return <span className="page-muted">-</span>;
        }
        
        // WHOIS 状态
        const whoisInfo = whoisMap[row.name];
        
        if (whoisInfo?.status) {
          // 分割多个状态（用换行符分隔）
          const statuses = whoisInfo.status.split('\n').filter(Boolean);
          
          // 调试日志
          if (statuses.length > 1) {
            console.log('[DomainList] Multiple WHOIS statuses for', row.name, ':', statuses);
          }
          
          // 根据状态设置标签颜色
          const getStatusTheme = (status: string) => {
            const lowerStatus = status.toLowerCase();
            if (lowerStatus === 'ok' || lowerStatus === 'active') return 'success';
            if (lowerStatus.includes('hold') || lowerStatus.includes('prohibited')) return 'danger';
            if (lowerStatus.includes('pending')) return 'warning';
            return 'default';
          };
          
          // 获取状态的翻译文本
          const getStatusLabel = (status: string) => {
            // 移除 URL 部分（如 https://icann.org/epp#clientTransferProhibited）
            let cleanStatus = status.split(' ')[0].split('#').pop() || status;
            
            // 如果包含空格，转换为驼峰命名（如 "client transfer prohibited" -> "clientTransferProhibited"）
            if (status.includes(' ')) {
              cleanStatus = status
                .toLowerCase()
                .split(' ')
                .map((word, index) => {
                  if (index === 0) return word;
                  return word.charAt(0).toUpperCase() + word.slice(1);
                })
                .join('');
            }
            
            const camelCaseStatus = cleanStatus.charAt(0).toLowerCase() + cleanStatus.slice(1);
            const translationKey = `domains.whoisStatus.${camelCaseStatus}`;
            const translated = t(translationKey);
            return translated === translationKey ? status : translated;
          };
          
          // 渲染所有状态标签
          return (
            <Space direction="vertical" size="small">
              {statuses.map((status, index) => (
                <Tag key={index} theme={getStatusTheme(status)} variant="light" size="small">
                  {getStatusLabel(status)}
                </Tag>
              ))}
            </Space>
          );
        } else {
          return <span className="page-muted">{t('domains.unknown')}</span>;
        }
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
        const isEnabled = row.enabled !== 0;
        return (
          <Space size="small">
            <Button
              shape="square"
              variant="text"
              theme={isEnabled ? 'default' : 'success'}
              icon={<PoweroffIcon />}
              onClick={() => {
                console.log('[DomainList] Button clicked:', { id: row.id, currentEnabled: isEnabled, canManage });
                toggleEnabledMutation.mutate({ id: row.id, enabled: isEnabled ? 0 : 1 });
              }}
              disabled={!canManage}
              title={!canManage ? t('common.permissionDenied') : (isEnabled ? t('domains.disable') : t('domains.enable'))}
            />
            <Button
              shape="square"
              variant="text"
              theme={isPinned ? 'warning' : 'default'}
              icon={<PinIcon />}
              onClick={() => pinMutation.mutate({ domainId: row.id, isPinned: !isPinned })}
            />
            <Button shape="square" variant="text" icon={<RootListIcon />} onClick={() => navigate(`/dash/domains/${row.id}/records`)} />
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
        <div className="records-toolbar domain-list-card__toolbar">
          {/* 搜索框和高级筛选按钮 */}
          <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
            <Input
              clearable
              type="search"
              name="domain-list-search"
              autocomplete="off"
              value={keyword}
              prefixIcon={<SearchIcon />}
              placeholder={t('domains.searchPlaceholder')}
              onChange={(value) => { setKeyword(String(value)); setPage(1); }}
              style={{ flex: 1, maxWidth: '400px' }}
            />
            <Button 
              variant="outline" 
              onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
            >
              {showAdvancedFilter ? t('common.collapse') : t('common.expand')} {t('domains.advancedFilter')}
            </Button>
          </div>
          
          {/* ← 批量操作按钮已禁用 */}
        </div>

        {/* 高级筛选面板 */}
        {showAdvancedFilter && (
          <div className="advanced-filter-panel" style={{ 
            padding: '16px', 
            marginBottom: '16px',
            backgroundColor: 'var(--td-bg-color-container)',
            borderRadius: '3px',
            border: '1px solid var(--td-border-level-1-color)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <ControlField label={t('domains.dnsAccount')}>
                <Select
                  value={accountFilter}
                  options={[
                    { label: t('domains.allAccounts'), value: '' }, 
                    ...accounts
                      .filter((account) => account.enabled !== false)  // ← 只显示启用的账号（true 或 undefined 都视为启用）
                      .map((account) => ({ 
                        label: `${account.name} (${account.type})`,  // ← 显示账号名称和类型
                        value: String(account.id) 
                      }))
                  ]}
                  onChange={(value) => { setAccountFilter(selectValue(value)); setPage(1); }}
                  style={{ width: '100%' }}
                />
              </ControlField>
              <ControlField label={t('domains.domainType')}>
                <Select
                  value={domainTypeFilter}
                  options={[
                    { label: t('domains.allDomains'), value: 'all' },
                    { label: t('domains.apexDomains'), value: 'apex' },
                    { label: t('domains.subdomains'), value: 'subdomain' },
                  ]}
                  onChange={(value) => { setDomainTypeFilter(selectValue(value) as 'all' | 'apex' | 'subdomain'); setPage(1); }}
                  style={{ width: '100%' }}
                />
              </ControlField>
              <ControlField label={t('domains.localStatus')}>
                <Select
                  value={statusFilter}
                  options={[
                    { label: t('domains.allStatus'), value: 'all' },
                    { label: t('domains.enabled'), value: 'enabled' },
                    { label: t('domains.disabled'), value: 'disabled' },
                  ]}
                  onChange={(value) => { setStatusFilter(selectValue(value) as 'all' | 'enabled' | 'disabled'); setPage(1); }}
                  style={{ width: '100%' }}
                />
              </ControlField>
            </div>
          </div>
        )}
                <Table
                  columns={columns} 
                  data={sortedDomains} 
                  loading={isLoading} 
                  rowKey={(row) => row.id} 
                  emptyText={t('domains.noDomainsFound')}
                  // ← 批量操作已禁用：selectable, selectedRowKeys, onSelectChange
                />
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
          key={`domain-edit-${editingDomain.id}`}
          title={t('domains.editDomain')}
          onClose={() => {
            setEditing(null);
            setEditRemark('');
            setEditRemarkDirty(false);
          }}
          size="md"
        >
          <Form
            layout="vertical"
            colon={false}
            requiredMark={false}
            className="page-shell"
            onSubmit={({ e }) => {
              e?.preventDefault();
              updateMutation.mutate({ id: editingDomain.id, remark: editRemark });
            }}
          >
            <Form.FormItem label={t('domains.domain')}>
              <span className="page-strong">{editingDomain.name}</span>
            </Form.FormItem>
            <Form.FormItem label={t('domains.dnsAccount')}>
              <span className="page-strong">
                {accountMap[editingDomain.account_id]
                  ? `${accountMap[editingDomain.account_id].name} (${accountMap[editingDomain.account_id].type})`
                  : `#${editingDomain.account_id}`}
              </span>
            </Form.FormItem>
            <Form.FormItem label={t('domains.providerDomainId')}>
              <span className="page-muted">{editingDomain.third_id || '-'}</span>
            </Form.FormItem>
            {dialogField(t('domains.remark'),
              <Input
                value={editRemark}
                onChange={(value) => {
                  setEditRemarkDirty(true);
                  setEditRemark(String(value));
                }}
                placeholder={t('common.optionalRemark')}
              />
            )}
            <Space className="record-form__actions">
              <Button type="submit" theme="primary" loading={updateMutation.isPending}>
                {t('common.save')}
              </Button>
            </Space>
          </Form>
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
      
      {/* ← 批量删除确认对话框已禁用 */}
    </div>
  );
}
