import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, CheckCircle, Globe, Play, Loader2, AlertCircle, Clock, XCircle } from 'lucide-react';
import { networkApi, type ConnectivityResult } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';

interface ProxyConfig {
  enabled: boolean;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export function NetworkTab() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  // Proxy form state
  const [proxyForm, setProxyForm] = useState<ProxyConfig>({
    enabled: false,
    type: 'http',
    host: '',
    port: 8080,
    username: '',
    password: '',
  });

  const { data: proxyConfig } = useQuery<ProxyConfig | null>({
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

  // Connectivity test query - 手动触发
  const [shouldTest, setShouldTest] = useState(false);
  const { data: connectivityData, isLoading: isTesting, error: connectivityError } = useQuery({
    queryKey: ['network-connectivity'],
    queryFn: async () => {
      const res = await networkApi.testConnectivity();
      if (res.data.code === 0) {
        return res.data.data;
      }
      throw new Error(res.data.msg);
    },
    enabled: shouldTest,
    staleTime: 0,
    gcTime: 0,
  });

  const updateProxyMutation = useMutation({
    mutationFn: (config: ProxyConfig) => networkApi.updateProxy(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-config'] });
      toast.success(t('network.proxySaveSuccess'));
    },
    onError: () => {
      toast.error(t('network.proxySaveFailed'));
    },
  });

  const handleSaveProxy = () => {
    updateProxyMutation.mutate(proxyForm);
  };

  const handleTestConnectivity = () => {
    setShouldTest(true);
    queryClient.invalidateQueries({ queryKey: ['network-connectivity'] });
  };

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'timeout':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  // 获取状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'ok':
        return t('network.statusOk') || '正常';
      case 'timeout':
        return t('network.statusTimeout') || '超时';
      case 'error':
        return t('network.statusError') || '错误';
      default:
        return t('network.statusUnknown') || '未知';
    }
  };

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
      </div>

      {/* Proxy Status */}
      {proxyConfig?.enabled && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-sm font-medium text-green-800 dark:text-green-300">
              {t('network.proxyActive')}: {proxyConfig.type.toUpperCase()} {proxyConfig.host}:{proxyConfig.port}
            </span>
          </div>
        </div>
      )}

      {/* Connectivity Test Panel */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Globe className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('network.connectivityTest') || '网络连通性测试'}</h3>
              <p className="text-sm text-gray-500">{t('network.connectivityTestDesc') || '测试与各大网络服务的连接状态'}</p>
            </div>
          </div>
          <button
            onClick={handleTestConnectivity}
            disabled={isTesting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm rounded-lg"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isTesting ? t('network.testing') || '测试中...' : t('network.startTest') || '开始测试'}
          </button>
        </div>

        {/* Test Results */}
        {connectivityData && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
              <span>{t('network.proxyMode') || '代理模式'}:</span>
              <span className={connectivityData.proxyEnabled ? 'text-green-600 font-medium' : 'text-gray-500'}>
                {connectivityData.proxyEnabled ? (t('network.viaProxy') || '通过代理') : (t('network.directConnection') || '直连')}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {connectivityData.results.map((result: ConnectivityResult) => (
                <div
                  key={result.name}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.status)}
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{result.name}</div>
                      <div className="text-xs text-gray-500">{getStatusText(result.status)}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono text-gray-700 dark:text-gray-300">
                      {result.latency}ms
                    </div>
                    {result.error && (
                      <div className="text-xs text-red-500 truncate max-w-[150px]" title={result.error}>
                        {result.error}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {connectivityError && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span>{t('network.testError') || '测试失败'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Proxy Config Panel */}
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
    </div>
  );
}
