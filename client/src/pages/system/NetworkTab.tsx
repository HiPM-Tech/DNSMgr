import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Server, User, RefreshCw, MapPin, Network, Settings, Shield, CheckCircle } from 'lucide-react';
import { networkApi } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';

interface IpInfo {
  ip: string;
  type: 'v4' | 'v6';
  source: string;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
}

interface ProxyConfig {
  enabled: boolean;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

interface NetworkInfo {
  server: {
    v4: IpInfo | null;
    v6: IpInfo | null;
  };
  serverDirect: {
    v4: IpInfo | null;
    v6: IpInfo | null;
  };
  client: {
    v4: IpInfo | null;
    v6: IpInfo | null;
  };
  proxy: {
    enabled: boolean;
    type: 'socks5' | 'http';
    host: string;
    port: number;
  } | null;
}

export function NetworkTab() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showProxyConfig, setShowProxyConfig] = useState(false);

  // Proxy form state
  const [proxyForm, setProxyForm] = useState<ProxyConfig>({
    enabled: false,
    type: 'http',
    host: '',
    port: 8080,
    username: '',
    password: '',
  });

  const { data: networkInfo, isLoading, refetch } = useQuery<NetworkInfo>({
    queryKey: ['network-info'],
    queryFn: async () => {
      const res = await networkApi.getInfo();
      if (res.data.code !== 0) {
        throw new Error(res.data.msg || 'Failed to fetch network info');
      }
      return res.data.data;
    },
    refetchInterval: 60000,
  });

  useQuery<ProxyConfig | null>({
    queryKey: ['proxy-config'],
    queryFn: async () => {
      const res = await networkApi.getProxy();
      if (res.data.code === 0 && res.data.data) {
        setProxyForm(res.data.data);
        return res.data.data;
      }
      return null;
    },
  });

  const updateProxyMutation = useMutation({
    mutationFn: (config: ProxyConfig) => networkApi.updateProxy(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-config'] });
      queryClient.invalidateQueries({ queryKey: ['network-info'] });
      toast.success(t('network.proxySaveSuccess'));
      setShowProxyConfig(false);
    },
    onError: () => {
      toast.error(t('network.proxySaveFailed'));
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success(t('network.refreshSuccess'));
    } catch (error) {
      toast.error(t('network.refreshFailed'));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveProxy = () => {
    updateProxyMutation.mutate(proxyForm);
  };

  const IpCard = ({
    title,
    icon: Icon,
    ipInfo,
    type,
    badge,
  }: {
    title: string;
    icon: React.ElementType;
    ipInfo: IpInfo | null;
    type: 'v4' | 'v6';
    badge?: string;
  }) => (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${type === 'v4' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
          <Icon className={`w-5 h-5 ${type === 'v4' ? 'text-blue-600' : 'text-purple-600'}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            {badge && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">
                {badge}
              </span>
            )}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${type === 'v4' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'}`}>
            IPv{type === 'v4' ? '4' : '6'}
          </span>
        </div>
      </div>

      {ipInfo ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-semibold text-gray-900 dark:text-white break-all">
              {ipInfo.ip}
            </span>
          </div>

          {(ipInfo.country || ipInfo.city) && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <MapPin className="w-4 h-4" />
              <span>
                {[ipInfo.country, ipInfo.region, ipInfo.city].filter(Boolean).join(', ')}
              </span>
            </div>
          )}

          {ipInfo.isp && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              ISP: {ipInfo.isp}
            </div>
          )}

          <div className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-700">
            {t('network.source')}: {ipInfo.source}
          </div>
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="text-gray-400 dark:text-gray-500 mb-2">
            <Network className="w-12 h-12 mx-auto opacity-50" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('network.noIpAvailable')}
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('network.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('network.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProxyConfig(!showProxyConfig)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg transition-colors"
          >
            <Settings className="w-4 h-4" />
            {t('network.proxyConfig')}
            {networkInfo?.proxy?.enabled && (
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
            )}
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
            {t('network.refresh')}
          </button>
        </div>
      </div>

      {/* Proxy Config Panel */}
      {showProxyConfig && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <Shield className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('network.proxySettings')}</h3>
              <p className="text-sm text-gray-500">{t('network.proxySettingsDesc')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={proxyForm.enabled}
                  onChange={(e) => setProxyForm({ ...proxyForm, enabled: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                {t('network.proxyEnabled')}
              </label>
            </div>

            <select
              value={proxyForm.type}
              onChange={(e) => setProxyForm({ ...proxyForm, type: e.target.value as 'socks5' | 'http' })}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="http">HTTP(S) Proxy</option>
              <option value="socks5">SOCKS5 Proxy</option>
            </select>

            <input
              type="text"
              value={proxyForm.host}
              onChange={(e) => setProxyForm({ ...proxyForm, host: e.target.value })}
              placeholder={t('network.proxyHost')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />

            <input
              type="number"
              value={proxyForm.port}
              onChange={(e) => setProxyForm({ ...proxyForm, port: parseInt(e.target.value) || 0 })}
              placeholder={t('network.proxyPort')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />

            <input
              type="text"
              value={proxyForm.username || ''}
              onChange={(e) => setProxyForm({ ...proxyForm, username: e.target.value })}
              placeholder={t('network.proxyUsername')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />

            <input
              type="password"
              value={proxyForm.password || ''}
              onChange={(e) => setProxyForm({ ...proxyForm, password: e.target.value })}
              placeholder={t('network.proxyPassword')}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveProxy}
              disabled={updateProxyMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm rounded-lg"
            >
              <CheckCircle className="w-4 h-4" />
              {updateProxyMutation.isPending ? t('network.saving') : t('network.saveProxy')}
            </button>
          </div>
        </div>
      )}

      {/* Proxy Status */}
      {networkInfo?.proxy?.enabled && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-sm font-medium text-green-800 dark:text-green-300">
              {t('network.proxyActive')}: {networkInfo.proxy.type.toUpperCase()} {networkInfo.proxy.host}:{networkInfo.proxy.port}
            </span>
          </div>
        </div>
      )}

      {/* Server IPs - Direct */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-gray-500" />
          {t('network.serverIpDirect')}
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {t('network.directConnection')}
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IpCard
            title={t('network.serverIpv4')}
            icon={Globe}
            ipInfo={networkInfo?.serverDirect?.v4 || null}
            type="v4"
          />
          <IpCard
            title={t('network.serverIpv6')}
            icon={Globe}
            ipInfo={networkInfo?.serverDirect?.v6 || null}
            type="v6"
          />
        </div>
      </div>

      {/* Server IPs - Via Proxy */}
      {networkInfo?.proxy?.enabled && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-gray-500" />
            {t('network.serverIp')}
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/50 dark:text-orange-300">
              {t('network.viaProxy')}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <IpCard
              title={t('network.serverIpv4')}
              icon={Globe}
              ipInfo={networkInfo?.server?.v4 || null}
              type="v4"
              badge={t('network.proxy')}
            />
            <IpCard
              title={t('network.serverIpv6')}
              icon={Globe}
              ipInfo={networkInfo?.server?.v6 || null}
              type="v6"
              badge={t('network.proxy')}
            />
          </div>
        </div>
      )}

      {/* Client IPs */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <User className="w-5 h-5 text-gray-500" />
          {t('network.clientIp')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <IpCard
            title={t('network.clientIpv4')}
            icon={Globe}
            ipInfo={networkInfo?.client?.v4 || null}
            type="v4"
          />
          <IpCard
            title={t('network.clientIpv6')}
            icon={Globe}
            ipInfo={networkInfo?.client?.v6 || null}
            type="v6"
          />
        </div>
      </div>

      {/* IP Services Info */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('network.dataSources')}
        </h4>
        <div className="flex flex-wrap gap-2">
          {['ipinfo.tw', 'ipinfo.hinswu', 'ipapi.co', 'cloudflare'].map((source) => (
            <span
              key={source}
              className="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-400"
            >
              {source}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
