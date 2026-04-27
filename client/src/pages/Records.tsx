import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, ArrowLeft, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { recordsApi, domainsApi, accountsApi } from '../api';
import type { DnsRecord } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { TunnelList } from '../components/TunnelList';
import { MailSetupModal } from './MailSetupModal';
import { RecordForm, COMMON_RECORD_TYPES, CLOUDFLARE_RECORD_TYPES } from '../components/RecordForm';

export function Records() {
  const { id } = useParams<{ id: string }>();
  const domainId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const formatApiError = (msg?: string) => {
    if (!msg) return t('common.error');
    if (msg === 'Permission denied') return t('common.permissionDenied');
    if (msg === 'Permission denied for subdomain') return t('common.permissionDeniedSubdomain');
    return msg;
  };

  const [showAdd, setShowAdd] = useState(false);
  const [showMailSetup, setShowMailSetup] = useState(false);
  const [editing, setEditing] = useState<DnsRecord | null>(null);
  const [deleting, setDeleting] = useState<DnsRecord | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<'records' | 'tunnels'>('records');
  const [showTunnels] = useLocalStorage('showTunnels', false);
  
  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: domain } = useQuery({
    queryKey: ['domain', domainId],
    queryFn: () => domainsApi.get(domainId).then((r) => r.data.data),
  });

  const { data: account } = useQuery({
    queryKey: ['account-for-domain', domain?.account_id],
    enabled: Boolean(domain?.account_id),
    queryFn: () => accountsApi.get(domain!.account_id).then((r) => r.data.data),
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: () => accountsApi.providers().then((r) => r.data.data),
  });

  const currentProvider = useMemo(() => {
    if (!account) return undefined;
    return providers.find(p => p.type === account.type);
  }, [account, providers]);

  const providerRecordTypes = useMemo(() => {
    const base = account?.type === 'cloudflare' ? [...CLOUDFLARE_RECORD_TYPES] : [...COMMON_RECORD_TYPES];
    if (editing?.type && !base.includes(editing.type)) base.push(editing.type);
    return base;
  }, [account?.type, editing?.type]);

  useEffect(() => {
    if (typeFilter && !providerRecordTypes.includes(typeFilter)) {
      setTypeFilter('');
    }
  }, [providerRecordTypes, typeFilter]);

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['records', domainId, typeFilter, keyword, page, pageSize],
    queryFn: () => recordsApi.list(domainId, {
      type: typeFilter || undefined,
      keyword: keyword || undefined,
      page,
      pageSize,
    }).then((r) => r.data.data ?? { total: 0, list: [] }),
  });
  
  const records = recordsData?.list ?? [];
  const total = recordsData?.total ?? 0;
  
  // 计算总页数
  const totalPages = Math.ceil(total / pageSize);

  const { data: lines = [] } = useQuery({
    queryKey: ['lines', domainId],
    queryFn: () => domainsApi.lines(domainId).then((r) => r.data.data ?? []),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<DnsRecord>) => recordsApi.create(domainId, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(formatApiError(res.data.msg)); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setShowAdd(false);
      toast.success(t('records.addSuccess'));
    },
    onError: () => toast.error(t('records.addFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: Partial<DnsRecord> }) =>
      recordsApi.update(domainId, recordId, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(formatApiError(res.data.msg)); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setEditing(null);
      toast.success(t('records.updateSuccess'));
    },
    onError: () => toast.error(t('records.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => recordsApi.delete(domainId, recordId),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(formatApiError(res.data.msg)); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setDeleting(null);
      toast.success(t('records.deleteSuccess'));
    },
    onError: () => toast.error(t('records.deleteFailed')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ recordId, status }: { recordId: string; status: number }) =>
      recordsApi.setStatus(domainId, recordId, status),
    onSuccess: (res, { recordId }) => {
      if (res.data.code !== 0) { toast.error(formatApiError(res.data.msg)); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      toast.success(t('records.toggled', { status: records.find((r) => r.id === recordId)?.status === 1 ? t('common.disabled') : t('common.enabled') }));
    },
    onError: () => toast.error(t('records.toggleFailed')),
  });

  const lineMap = Object.fromEntries(lines.map((l) => [l.id, l.name]));

  const isCloudflare = account?.type === 'cloudflare';
  const isAliyunESA = account?.type === 'aliyunesa';
  // Providers with proxy mode (similar to Cloudflare)
  const hasProxyMode = isCloudflare || isAliyunESA;
  
  // Check if provider supports multi-line routing
  const hasMultiLine = lines.length > 1 && !hasProxyMode;

  const columns = [
    { key: 'name', label: t('common.host'), render: (r: DnsRecord) => <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">{r.name}</span> },
    {
      key: 'type', label: t('common.type'),
      render: (r: DnsRecord) => (
        <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-bold">{r.type}</span>
      ),
    },
    {
      key: 'value', label: t('common.value'),
      render: (r: DnsRecord) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-700 max-w-xs truncate block" title={r.value}>{r.value}</span>
          {r.type === 'MX' && r.mx !== undefined && (
            <span className="inline-flex items-center px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded text-xs font-medium" title={t('records.mxPriority')}>
              {r.mx}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'line', label: hasProxyMode ? t('records.proxy') : (hasMultiLine ? t('common.line') : t('records.defaultLine')),
      render: (r: DnsRecord) => {
        // Cloudflare & Aliyun ESA: 显示代理状态（是/否）
        if (hasProxyMode) {
          const proxied = r.line === '1';
          return (
            <span className={`text-xs font-medium ${proxied ? 'text-orange-500' : 'text-gray-500'}`}>
              {proxied ? t('records.proxied') : t('records.dnsOnly')}
            </span>
          );
        }
        // 其他提供商: 显示线路
        const effectiveLine = r.line;
        
        // 当线路为 '0' 或空时，显示为"默认"
        if (!effectiveLine || effectiveLine === '0') {
          return <span className="text-gray-500 text-xs">{t('records.defaultLine') || '默认'}</span>;
        }
        
        // 显示具体线路名称
        const lineName = lineMap[effectiveLine];
        return (
          <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded text-xs font-medium border border-purple-200 dark:border-purple-800">
            {lineName ?? effectiveLine}
          </span>
        );
      },
    },
    { key: 'ttl', label: t('common.ttl'), render: (r: DnsRecord) => <span className="text-gray-500 text-xs">{r.ttl ?? '-'}</span> },
    {
      key: 'status', label: t('common.status'),
      render: (r: DnsRecord) => <Badge variant={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? t('common.enabled') : t('common.disabled')}</Badge>,
    },
    {
      key: 'actions', label: t('common.actions'),
      render: (r: DnsRecord) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => statusMutation.mutate({ recordId: r.id, status: r.status === 1 ? 0 : 1 })}
            title={r.status === 1 ? t('common.disable') : t('common.enable')}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            {r.status === 1 ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={() => setEditing(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => setDeleting(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/domains')} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{domain?.name ?? t('records.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('records.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'records' && (
            <>
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ['records', domainId] })}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> {t('records.refresh')}
              </button>
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> {t('records.addRecord')}
              </button>
              <button onClick={() => setShowMailSetup(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors">
                {t('mail.title')}
              </button>
            </>
          )}
        </div>
      </div>

      {showTunnels && currentProvider?.type === 'cloudflare' && (
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('records')}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'records'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('records.dnsRecords')}
            </button>
            <button
              onClick={() => setActiveTab('tunnels')}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'tunnels'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {t('records.tunnels')}
            </button>
          </nav>
        </div>
      )}

      {activeTab === 'records' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                placeholder={t('common.searchRecords')} className="pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">{t('records.allTypes')}</option>
              {providerRecordTypes.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
            <Table columns={columns} data={records} loading={isLoading} rowKey={(r) => r.id} emptyText={t('records.noRecords')} />
          </div>
          
          {/* 分页控件 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t('common.total')} {total} {t('common.items')}, {page} / {totalPages} {t('common.page')}
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="ml-2 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-gray-500 dark:text-gray-400">{t('common.perPage')}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                
                {/* 页码按钮 */}
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    // 显示当前页附近的页码
                    let pageNum = i + 1;
                    if (totalPages > 5) {
                      if (page > 3) {
                        pageNum = page - 3 + i;
                      }
                      if (pageNum > totalPages - 4 && page > totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      }
                    }
                    if (pageNum < 1 || pageNum > totalPages) return null;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`min-w-[2rem] px-2 py-1 text-sm rounded-lg ${
                          page === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'tunnels' && (
        <TunnelList accountId={domain?.account_id} />
      )}

      {showAdd && (
        <Modal title={t('records.addRecordFor', { name: domain?.name ?? '' })} onClose={() => setShowAdd(false)} size="lg">
          <RecordForm domainId={domainId} lines={lines} recordTypes={providerRecordTypes} provider={currentProvider} existingRecords={records} onSubmit={(data) => createMutation.mutate(data)} isLoading={createMutation.isPending} />
        </Modal>
      )}

      {showMailSetup && (
        <MailSetupModal domainId={domainId} domainName={domain?.name ?? ''} onClose={() => setShowMailSetup(false)} existingRecords={records} />
      )}

      {editing && (
        <Modal title={t('records.editRecord')} onClose={() => setEditing(null)} size="lg">
          <RecordForm domainId={domainId} lines={lines} recordTypes={providerRecordTypes} provider={currentProvider} existingRecords={records} initial={editing}
            onSubmit={(data) => updateMutation.mutate({ recordId: editing.id, data })}
            isLoading={updateMutation.isPending} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={t('records.deleteConfirm', { name: deleting.name, type: deleting.type, value: deleting.value })}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
