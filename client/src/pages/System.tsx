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
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';
import { systemApi, settingsApi } from '../api';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';

export function System() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'database' | 'security'>('overview');
  const [unlockIdentifier, setUnlockIdentifier] = useState('');
  const [showJwtSecret, setShowJwtSecret] = useState(false);
  const [jwtPassword, setJwtPassword] = useState('');
  const [jwtSecretValue, setJwtSecretValue] = useState('');
  const [smtpForm, setSmtpForm] = useState({
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromEmail: '',
    fromName: 'DNSMgr',
    testTo: '',
  });
  const [jwtNotifyEnabled, setJwtNotifyEnabled] = useState(true);
  const [oauthForm, setOauthForm] = useState({
    enabled: false,
    template: 'generic' as 'generic' | 'logto',
    providerName: 'default',
    subjectKey: 'sub',
    emailKey: 'email',
    logtoDomain: '',
    clientId: '',
    clientSecret: '',
    issuer: '',
    authorizationEndpoint: '',
    tokenEndpoint: '',
    userInfoEndpoint: '',
    jwksUri: '',
    scopes: 'openid profile email',
    redirectUri: '',
  });
  const [logtoForm, setLogtoForm] = useState({
    enabled: false,
    template: 'logto' as 'generic' | 'logto',
    providerName: 'Logto',
    subjectKey: 'sub',
    emailKey: 'email',
    logtoDomain: '',
    clientId: '',
    clientSecret: '',
    issuer: '',
    authorizationEndpoint: '',
    tokenEndpoint: '',
    userInfoEndpoint: '',
    jwksUri: '',
    scopes: 'openid profile email',
    redirectUri: '',
  });

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
  useQuery({
    queryKey: ['smtp-config'],
    queryFn: async () => {
      const res = await settingsApi.getSmtpConfig();
      if (res.data.code === 0 && res.data.data) {
        setSmtpForm((prev) => ({ ...prev, ...res.data.data }));
      }
      return res.data.data;
    },
  });

  useQuery({
    queryKey: ['oauth-logto-config'],
    queryFn: async () => {
      const res = await settingsApi.getLogtoOAuthConfig();
      if (res.data.code === 0 && res.data.data) {
        setLogtoForm((prev) => ({ ...prev, ...res.data.data }));
      }
      return res.data.data;
    },
  });

  useQuery({
    queryKey: ['oauth-config'],
    queryFn: async () => {
      const res = await settingsApi.getOAuthConfig();
      if (res.data.code === 0 && res.data.data) {
        setOauthForm((prev) => ({ ...prev, ...res.data.data }));
      }
      return res.data.data;
    },
  });

  useQuery({
    queryKey: ['security-config'],
    queryFn: async () => {
      const res = await settingsApi.getSecurityConfig();
      if (res.data.code === 0 && res.data.data) {
        setJwtNotifyEnabled(!!res.data.data.jwtViewEmailNotify);
      }
      return res.data.data;
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

  const revealJwtSecretMutation = useMutation({
    mutationFn: (password: string) => settingsApi.getJwtSecret(password),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        setJwtSecretValue(res.data.data.jwtSecret || '');
        setJwtPassword('');
        toast.success(t('system.jwtSecretVerified'));
      } else {
        toast.error(res.data.msg || t('system.jwtSecretVerifyFailed'));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('system.jwtSecretVerifyFailed'));
    },
  });

  const handleVerifyAndRevealJwtSecret = () => {
    if (!jwtPassword.trim()) {
      toast.error(t('system.jwtPasswordRequired'));
      return;
    }
    revealJwtSecretMutation.mutate(jwtPassword.trim());
  };

  const handleCopyJwtSecret = async () => {
    const value = jwtSecretValue || '';
    if (!value) {
      toast.error(t('system.jwtSecretEmpty'));
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('system.jwtSecretCopied'));
    } catch {
      toast.error(t('system.jwtSecretCopyFailed'));
    }
  };

  const updateSmtpMutation = useMutation({
    mutationFn: () => settingsApi.updateSmtpConfig({
      enabled: smtpForm.enabled,
      host: smtpForm.host.trim(),
      port: Number(smtpForm.port),
      secure: smtpForm.secure,
      username: smtpForm.username.trim(),
      password: smtpForm.password,
      fromEmail: smtpForm.fromEmail.trim(),
      fromName: smtpForm.fromName.trim(),
    }),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('system.smtpSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.smtpSaveFailed')),
  });

  const testSmtpMutation = useMutation({
    mutationFn: () => settingsApi.sendSmtpTest(smtpForm.testTo.trim() || undefined),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('system.smtpTestSent'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.smtpTestFailed')),
  });

  const updateSecurityMutation = useMutation({
    mutationFn: (enabled: boolean) => settingsApi.updateSecurityConfig({ jwtViewEmailNotify: enabled }),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('system.securitySaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.securitySaveFailed')),
  });

  const updateOauthMutation = useMutation({
    mutationFn: () => settingsApi.updateOAuthConfig({
      ...oauthForm,
      template: oauthForm.template,
      providerName: oauthForm.providerName.trim(),
      subjectKey: oauthForm.subjectKey.trim(),
      emailKey: oauthForm.emailKey.trim(),
      logtoDomain: oauthForm.logtoDomain.trim(),
      clientId: oauthForm.clientId.trim(),
      clientSecret: oauthForm.clientSecret.trim(),
      issuer: oauthForm.issuer.trim(),
      authorizationEndpoint: oauthForm.authorizationEndpoint.trim(),
      tokenEndpoint: oauthForm.tokenEndpoint.trim(),
      userInfoEndpoint: oauthForm.userInfoEndpoint.trim(),
      jwksUri: oauthForm.jwksUri.trim(),
      scopes: oauthForm.scopes.trim(),
      redirectUri: oauthForm.redirectUri.trim(),
    }),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('system.oauthSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.oauthSaveFailed')),
  });

  const discoverOidcMutation = useMutation({
    mutationFn: () => settingsApi.discoverOidc(oauthForm.issuer.trim()),
    onSuccess: (res) => {
      if (res.data.code !== 0 || !res.data.data) {
        toast.error(res.data.msg || t('system.oidcDiscoverFailed'));
        return;
      }
      setOauthForm((prev) => ({ ...prev, ...res.data.data }));
      toast.success(t('system.oidcDiscoverSuccess'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.oidcDiscoverFailed')),
  });

  const updateLogtoOauthMutation = useMutation({
    mutationFn: () => settingsApi.updateLogtoOAuthConfig({
      ...logtoForm,
      template: 'logto',
      providerName: logtoForm.providerName.trim(),
      subjectKey: logtoForm.subjectKey.trim(),
      emailKey: logtoForm.emailKey.trim(),
      logtoDomain: logtoForm.logtoDomain.trim(),
      clientId: logtoForm.clientId.trim(),
      clientSecret: logtoForm.clientSecret.trim(),
      redirectUri: logtoForm.redirectUri.trim(),
      scopes: logtoForm.scopes.trim(),
    }),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('system.oauthSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.oauthSaveFailed')),
  });

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
              <div className="py-3 border-b border-gray-100">
                <p className="text-sm font-medium text-gray-900 mb-1">{t('system.jwtSecret')}</p>
                <p className="text-xs text-gray-500 mb-3">{t('system.jwtSecretDesc')}</p>
                <div className="flex gap-2 mb-3">
                  <input
                    type="password"
                    value={jwtPassword}
                    onChange={(e) => setJwtPassword(e.target.value)}
                    placeholder={t('system.jwtPasswordPlaceholder')}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    onClick={handleVerifyAndRevealJwtSecret}
                    disabled={revealJwtSecretMutation.isPending}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm rounded-lg"
                  >
                    {t('system.verifyAndViewJwt')}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type={showJwtSecret ? 'text' : 'password'}
                    readOnly
                    value={jwtSecretValue}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                  />
                  <button
                    onClick={() => setShowJwtSecret((v) => !v)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                    title={showJwtSecret ? t('system.hideJwtSecret') : t('system.showJwtSecret')}
                  >
                    {showJwtSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleCopyJwtSecret}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
                    title={t('system.copyJwtSecret')}
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{t('system.jwtViewNotify')}</p>
                  <p className="text-xs text-gray-500">{t('system.jwtViewNotifyDesc')}</p>
                </div>
                <button
                  onClick={() => {
                    const next = !jwtNotifyEnabled;
                    setJwtNotifyEnabled(next);
                    updateSecurityMutation.mutate(next);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${jwtNotifyEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${jwtNotifyEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="py-3 border-b border-gray-100 space-y-3">
                <p className="text-sm font-medium text-gray-900">{t('system.smtpConfig')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={smtpForm.host} onChange={(e) => setSmtpForm((v) => ({ ...v, host: e.target.value }))} placeholder={t('system.smtpHost')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input type="number" value={smtpForm.port} onChange={(e) => setSmtpForm((v) => ({ ...v, port: Number(e.target.value) || 0 }))} placeholder={t('system.smtpPort')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={smtpForm.username} onChange={(e) => setSmtpForm((v) => ({ ...v, username: e.target.value }))} placeholder={t('system.smtpUser')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input type="password" value={smtpForm.password} onChange={(e) => setSmtpForm((v) => ({ ...v, password: e.target.value }))} placeholder={t('system.smtpPass')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={smtpForm.fromEmail} onChange={(e) => setSmtpForm((v) => ({ ...v, fromEmail: e.target.value }))} placeholder={t('system.smtpFromEmail')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={smtpForm.fromName} onChange={(e) => setSmtpForm((v) => ({ ...v, fromName: e.target.value }))} placeholder={t('system.smtpFromName')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={smtpForm.enabled} onChange={(e) => setSmtpForm((v) => ({ ...v, enabled: e.target.checked }))} />
                  {t('system.smtpEnabled')}
                </label>
                <div className="flex gap-2">
                  <button onClick={() => updateSmtpMutation.mutate()} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">{t('system.smtpSave')}</button>
                  <input value={smtpForm.testTo} onChange={(e) => setSmtpForm((v) => ({ ...v, testTo: e.target.value }))} placeholder={user?.email || t('system.smtpTestTo')} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <button onClick={() => testSmtpMutation.mutate()} className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg">{t('system.smtpTest')}</button>
                </div>
              </div>
              <div className="py-3 border-b border-gray-100 space-y-3">
                <p className="text-sm font-medium text-gray-900">{t('system.oauthConfig')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <select value={oauthForm.template} onChange={(e) => setOauthForm((v) => ({ ...v, template: e.target.value as 'generic' | 'logto' }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                    <option value="generic">{t('system.oauthTemplateGeneric')}</option>
                    <option value="logto">{t('system.oauthTemplateLogto')}</option>
                  </select>
                  <input value={oauthForm.providerName} onChange={(e) => setOauthForm((v) => ({ ...v, providerName: e.target.value }))} placeholder={t('system.oauthProvider')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  {oauthForm.template === 'logto' && (
                    <input value={oauthForm.logtoDomain} onChange={(e) => setOauthForm((v) => ({ ...v, logtoDomain: e.target.value }))} placeholder={t('system.oauthLogtoDomain')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  )}
                  <input value={oauthForm.issuer} onChange={(e) => setOauthForm((v) => ({ ...v, issuer: e.target.value }))} placeholder={t('system.oauthIssuer')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.subjectKey} onChange={(e) => setOauthForm((v) => ({ ...v, subjectKey: e.target.value }))} placeholder={t('system.oauthSubjectKey')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.emailKey} onChange={(e) => setOauthForm((v) => ({ ...v, emailKey: e.target.value }))} placeholder={t('system.oauthEmailKey')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.clientId} onChange={(e) => setOauthForm((v) => ({ ...v, clientId: e.target.value }))} placeholder={t('system.oauthClientId')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input type="password" value={oauthForm.clientSecret} onChange={(e) => setOauthForm((v) => ({ ...v, clientSecret: e.target.value }))} placeholder={t('system.oauthClientSecret')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.authorizationEndpoint} onChange={(e) => setOauthForm((v) => ({ ...v, authorizationEndpoint: e.target.value }))} placeholder={t('system.oauthAuthEndpoint')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.tokenEndpoint} onChange={(e) => setOauthForm((v) => ({ ...v, tokenEndpoint: e.target.value }))} placeholder={t('system.oauthTokenEndpoint')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.userInfoEndpoint} onChange={(e) => setOauthForm((v) => ({ ...v, userInfoEndpoint: e.target.value }))} placeholder={t('system.oauthUserInfoEndpoint')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.jwksUri} onChange={(e) => setOauthForm((v) => ({ ...v, jwksUri: e.target.value }))} placeholder={t('system.oauthJwksUri')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.scopes} onChange={(e) => setOauthForm((v) => ({ ...v, scopes: e.target.value }))} placeholder={t('system.oauthScopes')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={oauthForm.redirectUri} onChange={(e) => setOauthForm((v) => ({ ...v, redirectUri: e.target.value }))} placeholder={t('system.oauthRedirectUri')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={oauthForm.enabled} onChange={(e) => setOauthForm((v) => ({ ...v, enabled: e.target.checked }))} />
                  {t('system.oauthEnabled')}
                </label>
                <div className="flex gap-2">
                  <button onClick={() => discoverOidcMutation.mutate()} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">{t('system.oidcAutoDiscover')}</button>
                  <button onClick={() => updateOauthMutation.mutate()} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">{t('system.oauthSave')}</button>
                </div>
              </div>
              <div className="py-3 border-b border-gray-100 space-y-3">
                <p className="text-sm font-medium text-gray-900">{t('system.oauthLogtoConfig')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <input value={logtoForm.providerName} onChange={(e) => setLogtoForm((v) => ({ ...v, providerName: e.target.value }))} placeholder={t('system.oauthProvider')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={logtoForm.logtoDomain} onChange={(e) => setLogtoForm((v) => ({ ...v, logtoDomain: e.target.value }))} placeholder={t('system.oauthLogtoDomain')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={logtoForm.clientId} onChange={(e) => setLogtoForm((v) => ({ ...v, clientId: e.target.value }))} placeholder={t('system.oauthClientId')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input type="password" value={logtoForm.clientSecret} onChange={(e) => setLogtoForm((v) => ({ ...v, clientSecret: e.target.value }))} placeholder={t('system.oauthClientSecret')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={logtoForm.redirectUri} onChange={(e) => setLogtoForm((v) => ({ ...v, redirectUri: e.target.value }))} placeholder={t('system.oauthRedirectUri')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input value={logtoForm.scopes} onChange={(e) => setLogtoForm((v) => ({ ...v, scopes: e.target.value }))} placeholder={t('system.oauthScopes')} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={logtoForm.enabled} onChange={(e) => setLogtoForm((v) => ({ ...v, enabled: e.target.checked }))} />
                  {t('system.oauthEnabled')}
                </label>
                <div className="flex gap-2">
                  <button onClick={() => updateLogtoOauthMutation.mutate()} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">{t('system.oauthSave')}</button>
                </div>
              </div>
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
