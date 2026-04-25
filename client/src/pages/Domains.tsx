import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ExternalLink, Search, Activity, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { domainsApi, accountsApi } from '../api';
import type { Domain, DnsAccount } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';
import { isApexDomain } from '../utils/domain-utils';

interface AddDomainFormProps {
  accounts: DnsAccount[];
  onClose: () => void;
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
      qc.invalidateQueries({ queryKey: ['domains'] });
      onClose();
      toast.success(res.data.msg || t('domains.addDomainSuccess'));
    },
    onError: () => toast.error(t('domains.addDomainFailed')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'sync') {
      const domains = providerDomains.filter((d) => selectedProviders.includes(d.third_id));
      if (domains.length === 0) return;
      createMutation.mutate({ account_id: accountId, domains, remark });
    } else {
      const normalizedName = name.trim().toLowerCase();
      if (!normalizedName) return;
      createMutation.mutate({ name: normalizedName, account_id: accountId, third_id: thirdId || undefined, remark });
    }
  };

  const toggleProvider = (thirdIdValue: string) => {
    setSelectedProviders((current) => (
      current.includes(thirdIdValue)
        ? current.filter((id) => id !== thirdIdValue)
        : [...current, thirdIdValue]
    ));
  };

  const handleSelectAll = () => {
    setSelectedProviders(providerDomains.map((d) => d.third_id));
  };

  const handleInvertSelection = () => {
    setSelectedProviders(providerDomains
      .filter((d) => !selectedProviders.includes(d.third_id))
      .map((d) => d.third_id));
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  if (accounts.length === 0) {
    return (
      <div className="py-8 text-center space-y-4">
        <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">{t('domains.noAccounts')}</h3>
          <p className="text-sm text-gray-500 mt-1">{t('domains.noAccountsDesc')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            navigate('/accounts');
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('domains.goToAddAccount')}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('domains.dnsAccount')}</label>
        <select value={accountId} onChange={(e) => { setAccountId(Number(e.target.value)); setSelectedProviders([]); }} className={inputClass}>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('domains.addMethod')}</label>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button type="button" onClick={() => setMode('manual')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            {t('domains.manual')}
          </button>
          <button type="button" onClick={() => setMode('sync')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'sync' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            {t('domains.syncFromProvider')}
          </button>
        </div>
      </div>

      {mode === 'manual' ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.domainName')}</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="example.com" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.providerDomainId')}</label>
            <input value={thirdId} onChange={(e) => setThirdId(e.target.value)} placeholder={t('domains.providerDomainIdPlaceholder')} className={inputClass} />
          </div>
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('domains.selectDomains')}</label>
            {providerDomains.length > 0 && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleSelectAll}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700">
                  {t('common.selectAll')}
                </button>
                <button type="button" onClick={handleInvertSelection}
                  className="text-xs font-medium text-gray-600 hover:text-gray-800">
                  {t('common.invert')}
                </button>
              </div>
            )}
          </div>
          {loadingDomains ? (
            <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : providerDomains.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">{t('domains.noProviderDomains')}</p>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
              {providerDomains.map((d) => (
                <label key={d.third_id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                  <input type="checkbox" checked={selectedProviders.includes(d.third_id)}
                    onChange={() => toggleProvider(d.third_id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm">{d.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{d.third_id}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.remark')}</label>
        <input value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={t('common.optionalRemark')} className={inputClass} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="submit" disabled={createMutation.isPending || (mode === 'sync' && selectedProviders.length === 0)}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
          {createMutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {mode === 'sync' && selectedProviders.length > 1 ? t('domains.addDomains', { count: selectedProviders.length }) : t('domains.addDomain')}
        </button>
      </div>
    </form>
  );
}

function FailoverConfigModal({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['failover', domain.id],
    queryFn: () => domainsApi.getFailover(domain.id).then(r => r.data.data),
  });

  const [primaryIp, setPrimaryIp] = useState('');
  const [backupIps, setBackupIps] = useState<string[]>([]);
  const [checkMethod, setCheckMethod] = useState<'http' | 'tcp' | 'ping'>('http');
  const [checkInterval, setCheckInterval] = useState(300);
  const [checkPort, setCheckPort] = useState(80);
  const [checkPath, setCheckPath] = useState('');
  const [autoSwitchBack, setAutoSwitchBack] = useState(true);

  // Initialize form when data loads
  useEffect(() => {
    if (data?.config) {
      setPrimaryIp(data.config.primaryIp);
      setBackupIps(data.config.backupIps);
      setCheckMethod(data.config.checkMethod);
      setCheckInterval(data.config.checkInterval);
      setCheckPort(data.config.checkPort);
      setCheckPath(data.config.checkPath || '');
      setAutoSwitchBack(data.config.autoSwitchBack);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (cfg: any) => domainsApi.saveFailover(domain.id, cfg),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['failover', domain.id] });
      toast.success(t('domains.configSaved'));
      onClose();
    },
    onError: () => toast.error(t('domains.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => domainsApi.deleteFailover(domain.id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['failover', domain.id] });
      toast.success(t('domains.configDeleted'));
      onClose();
    },
  });

  if (isLoading) return <div className="p-4 text-center">{t('common.loading')}</div>;

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      saveMutation.mutate({ primaryIp, backupIps, checkMethod, checkInterval, checkPort, checkPath, autoSwitchBack });
    }} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.primaryIp')}</label>
        <input value={primaryIp} onChange={e => setPrimaryIp(e.target.value)} required
          className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.backupIps')}</label>
        <input value={backupIps.join(',')} onChange={e => setBackupIps(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.checkMethod')}</label>
          <select value={checkMethod} onChange={e => setCheckMethod(e.target.value as any)}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800">
            <option value="http">HTTP</option>
            <option value="tcp">TCP</option>
            <option value="ping">PING</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.checkPort')}</label>
          <input type="number" value={checkPort} onChange={e => setCheckPort(Number(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800" />
        </div>
      </div>
      {checkMethod === 'http' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.checkPath')}</label>
          <input value={checkPath} onChange={e => setCheckPath(e.target.value)} placeholder="/"
            className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800" />
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.checkInterval')}</label>
        <input type="number" value={checkInterval} onChange={e => setCheckInterval(Number(e.target.value))}
          className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-gray-800" />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={autoSwitchBack} onChange={e => setAutoSwitchBack(e.target.checked)} id="autoSwitchBack" />
        <label htmlFor="autoSwitchBack" className="text-sm font-medium text-gray-700">{t('domains.autoSwitchBack')}</label>
      </div>

      {data?.status && (
        <div className="p-3 bg-gray-50 rounded-lg text-sm space-y-1">
          <p><strong>{t('domains.currentIp')}:</strong> {data.status.currentIp}</p>
          <p><strong>{t('common.status')}:</strong> {data.status.lastCheckStatus ? t('domains.healthy') : t('domains.unhealthy')}</p>
          <p><strong>{t('domains.lastCheck')}:</strong> {new Date(data.status.lastCheckAt).toLocaleString()}</p>
          <p><strong>{t('domains.switchCount')}:</strong> {data.status.switchCount}</p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        {data?.config ? (
          <button type="button" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
            className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
            {t('domains.deleteConfig')}
          </button>
        ) : <div />}
        <button type="submit" disabled={saveMutation.isPending}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
          {t('domains.saveConfig')}
        </button>
      </div>
    </form>
  );
}

export function Domains() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { isAdmin: isActuallyAdmin } = useAuth();
  const canManage = isActuallyAdmin;
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Domain | null>(null);
  const [deleting, setDeleting] = useState<Domain | null>(null);
  const [configuringFailover, setConfiguringFailover] = useState<Domain | null>(null);
  const [accountFilter, setAccountFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [domainTypeFilter, setDomainTypeFilter] = useState<'all' | 'apex' | 'subdomain'>('all');

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains', accountFilter, keyword, domainTypeFilter],
    queryFn: () => domainsApi.list({
      account_id: accountFilter ? Number(accountFilter) : undefined,
      keyword: keyword || undefined,
      domain_type: domainTypeFilter !== 'all' ? domainTypeFilter : undefined,
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
      toast.success(t('domains.updateSuccess'));
    },
    onError: () => toast.error(t('domains.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => domainsApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['domains'] });
      setDeleting(null);
      toast.success(t('domains.deleteSuccess'));
    },
    onError: () => toast.error(t('domains.deleteFailed')),
  });

  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const columns = [
    {
      key: 'name', label: t('domains.domainName'),
      render: (row: Domain) => {
        const isApex = isApexDomain(row.name);
        return (
          <button onClick={() => navigate(`/domains/${row.id}/records`)}
            className="flex items-center gap-2 font-medium text-blue-600 hover:text-blue-800 transition-colors">
            {row.name}
            {!isApex && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                <Layers className="w-3 h-3" />
                {t('domains.subdomain')}
              </span>
            )}
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        );
      },
    },
    {
      key: 'account_id', label: t('domains.account'),
      render: (row: Domain) => <span className="text-gray-700">{accountMap[row.account_id]?.name ?? `#${row.account_id}`}</span>,
    },
    {
      key: 'record_count', label: t('domains.records'),
      render: (row: Domain) => (
        <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
          {row.record_count ?? 0}
        </span>
      ),
    },
    {
      key: 'expires_at', label: t('domains.expires'),
      render: (row: Domain) => {
        if (!row.expires_at) return <span className="text-gray-400 text-xs">{t('domains.unknown')}</span>;
        const expiry = new Date(row.expires_at);
        const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        
        let colorClass = 'text-gray-600 dark:text-gray-400';
        if (daysLeft < 0) colorClass = 'text-red-600 font-medium';
        else if (daysLeft <= 30) colorClass = 'text-yellow-600 font-medium';
        else if (daysLeft <= 90) colorClass = 'text-blue-600 font-medium';
        
        // 检查是否有根域名到期时间（子域名情况）
        const hasApexExpiry = !!row.apex_expires_at;
        const apexExpiry = hasApexExpiry ? new Date(row.apex_expires_at!) : null;
        
        return (
          <div className="flex flex-col">
            {/* 子域名到期时间（大字） */}
            <span className={`text-sm ${colorClass}`}>
              {expiry.toLocaleDateString()}
            </span>
            
            {/* 根域名到期时间（小字，仅对子域名显示） */}
            {hasApexExpiry && apexExpiry && (
              <span className="text-xs text-gray-400 mt-0.5">
                {t('domains.apexDomainExpiry')}: {apexExpiry.toLocaleDateString()}
              </span>
            )}
            
            {/* 剩余天数提示 */}
            {daysLeft >= 0 && (
              <span className={`text-xs ${daysLeft <= 30 ? 'text-yellow-600' : 'text-gray-500'}`}>
                {t('domains.daysLeft', { days: daysLeft })}
              </span>
            )}
            {daysLeft < 0 && (
              <span className="text-xs text-red-600">{t('domains.expired')}</span>
            )}
          </div>
        );
      },
    },
    { key: 'remark', label: t('domains.remark'), render: (row: Domain) => <span className="text-gray-500">{row.remark || t('domains.emptyRemark')}</span> },
    {
      key: 'actions', label: t('domains.actions'),
      render: (row: Domain) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(row)} disabled={!canManage}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => setConfiguringFailover(row)} disabled={!canManage} title="Failover Config"
            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <Activity className="w-4 h-4" />
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('domains.title')}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('domains.subtitle')}</p>
        </div>
        <button onClick={() => setShowAdd(true)} disabled={!canManage}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          <Plus className="w-4 h-4" /> {t('domains.addDomain')}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('domains.searchPlaceholder')} className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
        </div>
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          <option value="">{t('domains.allAccounts')}</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={domainTypeFilter} onChange={(e) => setDomainTypeFilter(e.target.value as 'all' | 'apex' | 'subdomain')}
          className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          <option value="all">{t('domains.allDomains')}</option>
          <option value="apex">{t('domains.apexDomains')}</option>
          <option value="subdomain">{t('domains.subdomains')}</option>
        </select>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <Table columns={columns} data={domains} loading={isLoading} rowKey={(r) => r.id} emptyText={t('domains.noDomainsFound')} />
      </div>

      {showAdd && canManage && (
        <Modal title={t('domains.addDomain')} onClose={() => setShowAdd(false)}>
          <AddDomainForm accounts={accounts} onClose={() => setShowAdd(false)} />
        </Modal>
      )}

      {editing && canManage && (
        <Modal title={t('domains.editDomain')} onClose={() => setEditing(null)} size="sm">
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({ id: editing.id, remark: (e.target as HTMLFormElement).remark.value }); }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.domain')}</label>
              <p className="text-sm font-semibold text-gray-900">{editing.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('domains.remark')}</label>
              <input name="remark" defaultValue={editing.remark}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="submit" disabled={updateMutation.isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                {t('common.save')}
              </button>
            </div>
          </form>
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

      {configuringFailover && canManage && (
        <Modal title={t('domains.failoverTitle', { name: configuringFailover.name })} onClose={() => setConfiguringFailover(null)}>
          <FailoverConfigModal domain={configuringFailover} onClose={() => setConfiguringFailover(null)} />
        </Modal>
      )}
    </div>
  );
}
