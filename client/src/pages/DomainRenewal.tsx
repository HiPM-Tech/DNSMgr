import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Calendar, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { domainsApi, accountsApi, domainRenewalApi, type Domain } from '../api';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { Table } from '../components/Table';
import { Badge } from '../components/Badge';

export function DomainRenewal() {
  const { id: domainId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [renewing, setRenewing] = useState<number | null>(null);
  
  const domainIdNum = domainId ? Number(domainId) : undefined;

  // 获取域名信息
  const { data: domain } = useQuery({
    queryKey: ['domain', domainId],
    enabled: Boolean(domainIdNum),
    queryFn: () => domainsApi.get(domainIdNum!).then((r) => r.data.data),
  });

  // 获取账号信息
  const { data: account } = useQuery({
    queryKey: ['account-for-domain', domain?.account_id],
    enabled: Boolean(domain?.account_id),
    queryFn: () => accountsApi.get(domain!.account_id).then((r) => r.data.data),
  });

  // 检查是否为 DNSHE 提供商
  const isDnshe = account?.type === 'dnshe';

  // 获取子域名列表（仅 DNSHE）
  const { data: subdomains = [], isLoading } = useQuery({
    queryKey: ['dnshe-subdomains', domainId],
    enabled: isDnshe && Boolean(domainId),
    queryFn: async () => {
      const res = await domainsApi.list({ 
        account_id: domain?.account_id ? Number(domain.account_id) : undefined,
        keyword: domain?.name 
      });
      // 过滤出当前域名的所有子域名
      const allDomains = res.data.data?.list ?? [];
      return allDomains.filter(d => 
        d.name === domain?.name || d.name.endsWith(`.${domain?.name}`)
      );
    },
  });

  // 续期 mutation
  const renewMutation = useMutation({
    mutationFn: (subdomainId: number) => 
      domainRenewalApi.renew(Number(domainId!), subdomainId),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        toast.success(t('domainRenewal.renewSuccess'));
        queryClient.invalidateQueries({ queryKey: ['dnshe-subdomains'] });
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

  // 表格列定义
  const columns = [
    {
      key: 'name',
      label: t('common.name'),
      render: (row: Domain) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {row.name}
        </span>
      ),
    },
    {
      key: 'expires_at',
      label: t('domainRenewal.expiresAt'),
      render: (row: Domain) => {
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
      render: (row: Domain) => {
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
      render: (row: Domain) => {
        const expiresAt = (row as any).expires_at;
        const isExpired = expiresAt && new Date(expiresAt) < new Date();
        const canRenew = !isExpired || isExpired; // 允许续期已过期的域名
        
        return (
          <button
            onClick={() => {
              const subdomainId = (row as any).third_id || row.id;
              if (subdomainId) {
                setRenewing(Number(subdomainId));
                renewMutation.mutate(Number(subdomainId));
              }
            }}
            disabled={!canRenew || renewing === Number((row as any).third_id || row.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm rounded-lg transition-colors"
          >
            {renewing === Number((row as any).third_id || row.id) ? (
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
        );
      },
    },
  ];

  if (!isDnshe) {
    return (
      <div className="p-6">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => navigate('/domains')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('domainRenewal.title')}</h1>
            <p className="text-sm text-gray-500">{t('domainRenewal.subtitle')}</p>
          </div>
        </div>
        
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
                {t('domainRenewal.notSupported')}
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {t('domainRenewal.notSupportedDesc')}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/domains')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('domainRenewal.title')}</h1>
            <p className="text-sm text-gray-500">{domain?.name}</p>
          </div>
        </div>
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
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {subdomains.filter(d => {
                  const status = getExpiryStatus((d as any).expires_at);
                  return status.color === 'green';
                }).length}
              </p>
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
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {subdomains.filter(d => {
                  const status = getExpiryStatus((d as any).expires_at);
                  return status.color === 'red' || status.color === 'yellow';
                }).length}
              </p>
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
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {subdomains.filter(d => {
                  const status = getExpiryStatus((d as any).expires_at);
                  return status.color === 'red';
                }).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 子域名列表 */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <Table
          columns={columns}
          data={subdomains}
          loading={isLoading}
          rowKey={(r) => r.id}
          emptyText={t('domainRenewal.noDomains')}
        />
      </div>
    </div>
  );
}
