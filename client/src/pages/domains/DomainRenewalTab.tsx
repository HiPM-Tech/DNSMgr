import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Calendar, AlertCircle, CheckCircle, Clock, Plus, Trash2 } from 'lucide-react';
import { domainRenewalApi, dnsAccountsApi } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { Table } from '../../components/Table';
import { Badge } from '../../components/Badge';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PaginatedSelect } from '../../components/PaginatedSelect';

export function DomainRenewalTab() {
  const toast = useToast();
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [renewing, setRenewing] = useState<number | null>(null);
  
  // 添加续期域名相关状态
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedProviderType, setSelectedProviderType] = useState<string>('dnshe');
  const [deleteDomain, setDeleteDomain] = useState<any | null>(null);

  // 获取 DNS 账号列表（用于选择提供商）
  const { data: accounts = [] } = useQuery({
    queryKey: ['dns-accounts'],
    queryFn: () => dnsAccountsApi.list().then(r => r.data.data || []),
    enabled: isAddModalOpen,
  });

  // 添加续期域名 mutation
  const addMutation = useMutation({
    mutationFn: (data: {
      account_id: number;
      provider_type: string;
      domain_name: string;
      third_id: string;
      full_domain: string;
      expires_at?: string;
      remark?: string;
    }) => domainRenewalApi.addRenewableDomain(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewable-domains'] });
      setIsAddModalOpen(false);
      setSelectedAccountId(null);
      toast.success(t('domainRenewal.addSuccess'));
    },
    onError: () => {
      toast.error(t('domainRenewal.addFailed'));
    },
  });

  // 删除续期域名 mutation
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

  // 检查是否为管理员或超级管理员
  const isAdmin = user?.role === 2 || user?.role === 3;

  // 获取支持续期的域名列表（从所有支持续期的提供商获取）
  const { data: renewableDomains = [], isLoading } = useQuery({
    queryKey: ['renewable-domains'],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await domainRenewalApi.getRenewableDomains();
      return res.data.data || [];
    },
  });

  // 续期 mutation
  const renewMutation = useMutation({
    mutationFn: ({ domainId, subdomainId }: { domainId: number; subdomainId: number }) => 
      domainRenewalApi.renew(domainId, subdomainId),
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

  // 计算到期状态
  const getExpiryStatus = (expiresAt: string) => {
    if (!expiresAt) return { label: t('common.unknown'), color: 'gray' as const };
    
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft < 0) {
      return { label: t('domains.expired'), color: 'red' as const, daysLeft };
    } else if (daysLeft <= 7) {
      return { label: t('domainRenewal.expiringSoon'), color: 'red' as const, daysLeft };
    } else if (daysLeft <= 30) {
      return { label: t('domainRenewal.expiringMonth'), color: 'yellow' as const, daysLeft };
    } else {
      return { label: t('domainRenewal.active'), color: 'green' as const, daysLeft };
    }
  };

  // 处理添加续期域名
  const handleAddDomain = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const accountId = parseInt(formData.get('account_id') as string);
    const domainName = formData.get('domain_name') as string;
    const thirdId = formData.get('third_id') as string;
    const fullDomain = formData.get('full_domain') as string;
    const expiresAt = formData.get('expires_at') as string;
    const remark = formData.get('remark') as string;
    
    if (!accountId || !domainName || !thirdId || !fullDomain) {
      toast.error(t('nsMonitor.selectDomain'));
      return;
    }
    
    // 获取账号的 provider_type
    const account = accounts.find((a: any) => a.id === accountId);
    if (!account) {
      toast.error(t('accounts.notFound'));
      return;
    }
    
    addMutation.mutate({
      account_id: accountId,
      provider_type: account.type,
      domain_name: domainName,
      third_id: thirdId,
      full_domain: fullDomain,
      expires_at: expiresAt || undefined,
      remark: remark || undefined,
    });
  };

  // 表格列定义
  const columns = [
    {
      key: 'name',
      label: t('common.name'),
      render: (row: any) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {row.name}
        </span>
      ),
    },
    {
      key: 'account_name',
      label: t('accounts.provider'),
      render: (row: any) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {row.account_name || 'DNSHE'}
        </span>
      ),
    },
    {
      key: 'expires_at',
      label: t('domainRenewal.expiresAt'),
      render: (row: any) => {
        const expiresAt = (row as any).expires_at;
        if (!expiresAt) {
          return <span className="text-gray-400">{t('common.unknown')}</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-900 dark:text-white">
              {new Date(expiresAt).toLocaleDateString()}
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: t('common.status'),
      render: (row: any) => {
        const expiresAt = (row as any).expires_at;
        const status = getExpiryStatus(expiresAt);
        return (
          <Badge variant={status.color}>
            {status.label}
            {status.daysLeft !== undefined && status.daysLeft >= 0 && (
              <span className="ml-1">({status.daysLeft}{t('domainRenewal.days')})</span>
            )}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (row: any) => {
        const subdomainId = (row as any).third_id || row.id;
        
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (subdomainId) {
                  setRenewing(Number(subdomainId));
                  renewMutation.mutate({ 
                    domainId: row.id, 
                    subdomainId: Number(subdomainId) 
                  });
                }
              }}
              disabled={!subdomainId || renewing === Number(subdomainId)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm rounded-lg transition-colors"
            >
              {renewing === Number(subdomainId) ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t('domainRenewal.renewing')}
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  {t('domainRenewal.renew')}
                </>
              )}
            </button>
            <button
              onClick={() => setDeleteDomain(row)}
              disabled={deleteMutation.isPending}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title={t('common.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  // 非管理员显示无权限提示
  if (!isAdmin) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
              {t('common.permissionDenied')}
            </h3>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
              {t('domainRenewal.notSupportedDesc')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 统计信息
  const activeCount = renewableDomains.filter((d: any) => {
    const status = getExpiryStatus((d as any).expires_at);
    return status.color === 'green';
  }).length;

  const expiringCount = renewableDomains.filter((d: any) => {
    const status = getExpiryStatus((d as any).expires_at);
    return status.color === 'red' || status.color === 'yellow';
  }).length;

  const expiredCount = renewableDomains.filter((d: any) => {
    const status = getExpiryStatus((d as any).expires_at);
    return status.color === 'red' && (d as any).expires_at && new Date((d as any).expires_at) < new Date();
  }).length;

  return (
    <div className="space-y-6">
      {/* 标题和添加按钮 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('domainRenewal.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('domainRenewal.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('domainRenewal.addDomain')}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('domainRenewal.activeDomains')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{activeCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('domainRenewal.expiringDomains')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{expiringCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{t('domainRenewal.expiredDomains')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{expiredCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 域名列表 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <Table
          columns={columns}
          data={renewableDomains}
          loading={isLoading}
          rowKey={(r) => r.id}
          emptyText={t('domainRenewal.noDomains')}
        />
      </div>

      {/* 自动续期说明 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
              {t('domainRenewal.autoRenewal')}
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              {t('domainRenewal.autoRenewalDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
