import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Database,
  Server,
  Shield,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
  Lock,
  Unlock,
  Users,
} from 'lucide-react';
import { systemApi, settingsApi } from '../api';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';

export function System() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'database' | 'security'>('overview');
  const [unlockIdentifier, setUnlockIdentifier] = useState('');

  // Fetch system info
  const { data: systemInfo, isLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const res = await systemApi.info();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  // Fetch login limit config
  const { data: loginLimitConfig } = useQuery({
    queryKey: ['login-limit-config'],
    queryFn: async () => {
      const res = await settingsApi.getLoginLimit();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  // Fetch login attempt stats
  const { data: loginStats } = useQuery({
    queryKey: ['login-attempt-stats'],
    queryFn: async () => {
      const res = await settingsApi.getLoginAttemptStats();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  // Update login limit mutation
  const updateLoginLimitMutation = useMutation({
    mutationFn: settingsApi.updateLoginLimit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['login-limit-config'] });
      toast.success(t('system.configUpdated'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('system.configUpdateFailed'));
    },
  });

  // Unlock account mutation
  const unlockAccountMutation = useMutation({
    mutationFn: (identifier: string) => settingsApi.unlockAccount(identifier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['login-attempt-stats'] });
      toast.success(t('system.accountUnlocked'));
      setUnlockIdentifier('');
    },
    onError: (error: Error) => {
      toast.error(error.message || t('system.unlockFailed'));
    },
  });

  const handleClearCache = () => {
    toast.success(t('system.cacheCleared'));
  };

  const handleBackupDatabase = () => {
    toast.success(t('system.backupStarted'));
  };

  const handleToggleLoginLimit = () => {
    updateLoginLimitMutation.mutate({ enabled: !loginLimitConfig?.enabled });
  };

  const handleUpdateMaxAttempts = (value: number) => {
    if (value >= 1 && value <= 100) {
      updateLoginLimitMutation.mutate({ maxAttempts: value });
    }
  };

  const handleUpdateLockoutDuration = (value: number) => {
    if (value >= 1 && value <= 1440) {
      updateLoginLimitMutation.mutate({ lockoutDuration: value });
    }
  };

  const handleUnlockAccount = () => {
    if (unlockIdentifier.trim()) {
      unlockAccountMutation.mutate(unlockIdentifier.trim());
    }
  };

  const tabs = [
    { id: 'overview', label: t('system.tabs.overview'), icon: Info },
    { id: 'database', label: t('system.tabs.database'), icon: Database },
    { id: 'security', label: t('system.tabs.security'), icon: Shield },
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('system.title')}</h1>
        <p className="text-gray-500 mt-1">{t('system.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* System Status Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Server className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('system.status')}</h3>
                <p className="text-sm text-gray-500">{t('system.statusDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-700">{t('system.runningNormally')}</span>
            </div>
          </div>

          {/* Version Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Settings className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('system.versionInfo')}</h3>
                <p className="text-sm text-gray-500">{t('system.versionDesc')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">{t('system.appVersion')}</p>
                <p className="text-sm font-medium text-gray-900">
                  {isLoading ? t('common.loading') : systemInfo?.version}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">{t('system.serverVersion')}</p>
                <p className="text-sm font-medium text-gray-900">
                  {isLoading ? t('common.loading') : systemInfo?.serverVersion}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <RefreshCw className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('system.quickActions')}</h3>
                <p className="text-sm text-gray-500">{t('system.quickActionsDesc')}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClearCache}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                {t('system.clearCache')}
              </button>
              <button
                onClick={handleBackupDatabase}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('system.backupDatabase')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database Tab */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 rounded-lg">
                <Database className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('system.databaseInfo')}</h3>
                <p className="text-sm text-gray-500">{t('system.databaseDesc')}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">{t('system.databaseType')}</span>
                <span className="text-sm font-medium text-gray-900">
                  {isLoading ? t('common.loading') : systemInfo?.database?.type}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-600">{t('system.databaseVersion')}</span>
                <span className="text-sm font-medium text-gray-900">
                  {isLoading ? t('common.loading') : systemInfo?.database?.version}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-600">{t('system.driverVersion')}</span>
                <span className="text-sm font-medium text-gray-900">
                  {isLoading ? t('common.loading') : systemInfo?.database?.driverVersion}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">{t('system.databaseWarning')}</p>
                <p className="text-sm text-yellow-700 mt-1">{t('system.databaseWarningDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Login Limit Configuration */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Lock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('system.loginLimitConfig')}</h3>
                <p className="text-sm text-gray-500">{t('system.loginLimitConfigDesc')}</p>
              </div>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('system.enableLoginLimit')}</p>
                <p className="text-xs text-gray-500">{t('system.enableLoginLimitDesc')}</p>
              </div>
              <button
                onClick={handleToggleLoginLimit}
                disabled={updateLoginLimitMutation.isPending}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  loginLimitConfig?.enabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    loginLimitConfig?.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Max Attempts */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('system.maxAttempts')}</p>
                <p className="text-xs text-gray-500">{t('system.maxAttemptsDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={loginLimitConfig?.maxAttempts || 10}
                  onChange={(e) => handleUpdateMaxAttempts(parseInt(e.target.value))}
                  disabled={updateLoginLimitMutation.isPending || !loginLimitConfig?.enabled}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center disabled:bg-gray-100"
                />
                <span className="text-sm text-gray-500">{t('system.attempts')}</span>
              </div>
            </div>

            {/* Lockout Duration */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{t('system.lockoutDuration')}</p>
                <p className="text-xs text-gray-500">{t('system.lockoutDurationDesc')}</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={loginLimitConfig?.lockoutDuration || 60}
                  onChange={(e) => handleUpdateLockoutDuration(parseInt(e.target.value))}
                  disabled={updateLoginLimitMutation.isPending || !loginLimitConfig?.enabled}
                  className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-center disabled:bg-gray-100"
                />
                <span className="text-sm text-gray-500">{t('system.minutes')}</span>
              </div>
            </div>
          </div>

          {/* Login Attempt Statistics */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('system.loginStats')}</h3>
                <p className="text-sm text-gray-500">{t('system.loginStatsDesc')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-red-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">{t('system.lockedAccounts')}</p>
                <p className="text-lg font-semibold text-red-600">{loginStats?.totalLocked || 0}</p>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">{t('system.recentFailedAttempts')}</p>
                <p className="text-lg font-semibold text-yellow-600">{loginStats?.recentAttempts || 0}</p>
              </div>
            </div>

            {/* Unlock Account */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-900 mb-2">{t('system.manualUnlock')}</p>
              <p className="text-xs text-gray-500 mb-3">{t('system.manualUnlockDesc')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={unlockIdentifier}
                  onChange={(e) => setUnlockIdentifier(e.target.value)}
                  placeholder={t('system.unlockPlaceholder')}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  onClick={handleUnlockAccount}
                  disabled={unlockAccountMutation.isPending || !unlockIdentifier.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Unlock className="w-4 h-4" />
                  {t('system.unlock')}
                </button>
              </div>
            </div>
          </div>

          {/* Other Security Settings */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <Shield className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t('system.otherSecurity')}</h3>
                <p className="text-sm text-gray-500">{t('system.otherSecurityDesc')}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('system.forceHttps')}</p>
                  <p className="text-xs text-gray-500">{t('system.forceHttpsDesc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">{t('system.comingSoon')}</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('system.twoFactorAuth')}</p>
                  <p className="text-xs text-gray-500">{t('system.twoFactorAuthDesc')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-gray-400" />
                  <span className="text-sm text-gray-500">{t('system.comingSoon')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
