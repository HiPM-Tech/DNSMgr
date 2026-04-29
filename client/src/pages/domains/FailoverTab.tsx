import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { domainsApi } from '../../api';
import type { Domain } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';

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

export function FailoverTab() {
  const { t } = useI18n();
  const { isAdmin: canManage } = useAuth();
  const [configuringFailover, setConfiguringFailover] = useState<Domain | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Get all domains
  const { data: domainsData, isLoading } = useQuery<{ list: Domain[]; total: number }>({
    queryKey: ['domains-all'],
    queryFn: () => domainsApi.list({ pageSize: 1000 }).then(r => r.data.data ?? { list: [], total: 0 }),
  });

  const domains = domainsData?.list ?? [];
  
  // Calculate pagination
  const totalPages = Math.ceil(domains.length / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, domains.length);
  const paginatedDomains = domains.slice(startIndex, endIndex);

  const columns = [
    {
      key: 'name',
      label: t('domains.domainName'),
      render: (row: Domain) => (
        <span className="font-medium">{row.name}</span>
      ),
    },
    {
      key: 'account_id',
      label: t('domains.account'),
      render: (row: Domain) => (
        <span className="text-gray-700">#{row.account_id}</span>
      ),
    },
    {
      key: 'remark',
      label: t('domains.remark'),
      render: (row: Domain) => (
        <span className="text-gray-500">{row.remark || t('domains.emptyRemark')}</span>
      ),
    },
    {
      key: 'actions',
      label: t('domains.actions'),
      render: (row: Domain) => (
        <button
          onClick={() => setConfiguringFailover(row)}
          disabled={!canManage}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Activity className="w-4 h-4" />
          {t('domains.configureFailover')}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <Table
          columns={columns}
          data={paginatedDomains}
          loading={isLoading}
          rowKey={(r) => r.id}
          emptyText={t('domains.noDomainsFound')}
        />
      </div>
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500">
            显示 {startIndex + 1}-{endIndex} / 共 {domains.length} 项
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              上一页
            </button>
            <span className="text-sm text-gray-500">
              第 {page} / {totalPages} 页
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              下一页
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {configuringFailover && canManage && (
        <Modal
          title={t('domains.failoverTitle', { name: configuringFailover.name })}
          onClose={() => setConfiguringFailover(null)}
        >
          <FailoverConfigModal
            domain={configuringFailover}
            onClose={() => setConfiguringFailover(null)}
          />
        </Modal>
      )}
    </div>
  );
}
