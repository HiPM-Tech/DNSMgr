
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, XCircle, Lock, Unlock, Users, Server, Smartphone } from 'lucide-react';
import { settingsApi, securityApi } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';

export function SecurityTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [unlockIdentifier, setUnlockIdentifier] = useState('');

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

  const [auditRules, setAuditRules] = useState({
    enabled: true,
    maxDeletionsPerHour: 10,
    maxFailedLogins: 5,
    offHoursStart: '22:00',
    offHoursEnd: '06:00'
  });

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

  const { data: loginLimitConfig } = useQuery({
    queryKey: ['login-limit-config'],
    queryFn: async () => {
      const res = await settingsApi.getLoginLimit();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const { data: loginStats } = useQuery({
    queryKey: ['login-attempt-stats'],
    queryFn: async () => {
      const res = await settingsApi.getLoginAttemptStats();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: async () => {
      const res = await securityApi.getPolicy();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const updateSecurityPolicyMutation = useMutation({
    mutationFn: (data: Parameters<typeof securityApi.updatePolicy>[0]) => securityApi.updatePolicy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-policy'] });
      toast.success(t('system.configUpdated'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('system.configUpdateFailed'));
    },
  });

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

  useQuery({
    queryKey: ['audit-rules'],
    queryFn: async () => {
      const res = await settingsApi.getAuditRules();
      if (res.data.code === 0 && res.data.data) {
        setAuditRules(res.data.data);
      }
      return res.data.data;
    },
  });

  const updateAuditRulesMutation = useMutation({
    mutationFn: (rules: any) => settingsApi.updateAuditRules(rules),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('system.auditRulesSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.auditRulesSaveFailed')),
  });

  return (
    <div className="columns-1 xl:columns-3 xl:[column-gap:1.5rem]">
          <div className="contents">
            {/* Login Limit Configuration */}
            <div className="break-inside-avoid mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Lock className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.loginLimitConfig')}</h3>
                <p className="text-sm text-gray-500">{t('system.loginLimitConfigDesc')}</p>
              </div>
            </div>

            {/* Enable/Disable Toggle */}
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.enableLoginLimit')}</p>
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
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.maxAttempts')}</p>
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
                  className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-700"
                />
                <span className="text-sm text-gray-500">{t('system.attempts')}</span>
              </div>
            </div>

            {/* Lockout Duration */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.lockoutDuration')}</p>
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
                  className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-700"
                />
                <span className="text-sm text-gray-500">{t('system.minutes')}</span>
              </div>
            </div>
            </div>
            
            {/* Audit Rules */}
            <div className="break-inside-avoid mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.auditRules')}</h3>
                  <p className="text-sm text-gray-500">{t('system.auditRulesDesc')}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.enableAlerts')}</p>
                    <p className="text-xs text-gray-500">{t('system.enableAlertsDesc')}</p>
                  </div>
                  <button
                    onClick={() => {
                      const next = { ...auditRules, enabled: !auditRules.enabled };
                      setAuditRules(next);
                      updateAuditRulesMutation.mutate(next);
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      auditRules.enabled ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        auditRules.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="w-2/3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.maxDeletions')}</p>
                    <p className="text-xs text-gray-500">{t('system.maxDeletionsDesc')}</p>
                  </div>
                  <input
                    type="number"
                    value={auditRules.maxDeletionsPerHour}
                    onChange={(e) => setAuditRules({ ...auditRules, maxDeletionsPerHour: parseInt(e.target.value) || 0 })}
                    onBlur={() => updateAuditRulesMutation.mutate(auditRules)}
                    className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="w-2/3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.maxFailedLogins')}</p>
                    <p className="text-xs text-gray-500">{t('system.maxFailedLoginsDesc')}</p>
                  </div>
                  <input
                    type="number"
                    value={auditRules.maxFailedLogins}
                    onChange={(e) => setAuditRules({ ...auditRules, maxFailedLogins: parseInt(e.target.value) || 0 })}
                    onBlur={() => updateAuditRulesMutation.mutate(auditRules)}
                    className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-center bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center justify-between py-2">
                  <div className="w-2/3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.offHoursAlert')}</p>
                    <p className="text-xs text-gray-500">{t('system.offHoursAlertDesc')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={auditRules.offHoursStart}
                      onChange={(e) => setAuditRules({ ...auditRules, offHoursStart: e.target.value })}
                      onBlur={() => updateAuditRulesMutation.mutate(auditRules)}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <span className="text-gray-500">-</span>
                    <input
                      type="time"
                      value={auditRules.offHoursEnd}
                      onChange={(e) => setAuditRules({ ...auditRules, offHoursEnd: e.target.value })}
                      onBlur={() => updateAuditRulesMutation.mutate(auditRules)}
                      className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Login Attempt Statistics */}
            <div className="break-inside-avoid mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.loginStats')}</h3>
                <p className="text-sm text-gray-500">{t('system.loginStatsDesc')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">{t('system.lockedAccounts')}</p>
                <p className="text-lg font-semibold text-red-600">{loginStats?.totalLocked || 0}</p>
              </div>
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">{t('system.recentFailedAttempts')}</p>
                <p className="text-lg font-semibold text-yellow-600">{loginStats?.recentAttempts || 0}</p>
              </div>
            </div>

            {/* Unlock Account */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{t('system.manualUnlock')}</p>
              <p className="text-xs text-gray-500 mb-3">{t('system.manualUnlockDesc')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={unlockIdentifier}
                  onChange={(e) => setUnlockIdentifier(e.target.value)}
                  placeholder={t('system.unlockPlaceholder')}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
          </div>

          <div className="contents">
            <div className="contents">
              <div className="break-inside-avoid mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-3">
                <div className="mb-4 flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <Server className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.smtpConfig')}</h3>
                    <p className="text-sm text-gray-500">{t('system.smtpConfigDesc')}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={smtpForm.host} onChange={(e) => setSmtpForm((v) => ({ ...v, host: e.target.value }))} placeholder={t('system.smtpHost')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                  <input type="number" value={smtpForm.port} onChange={(e) => setSmtpForm((v) => ({ ...v, port: Number(e.target.value) || 0 }))} placeholder={t('system.smtpPort')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                  <input value={smtpForm.username} onChange={(e) => setSmtpForm((v) => ({ ...v, username: e.target.value }))} placeholder={t('system.smtpUser')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                  <input type="password" value={smtpForm.password} onChange={(e) => setSmtpForm((v) => ({ ...v, password: e.target.value }))} placeholder={t('system.smtpPass')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                  <input value={smtpForm.fromEmail} onChange={(e) => setSmtpForm((v) => ({ ...v, fromEmail: e.target.value }))} placeholder={t('system.smtpFromEmail')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                  <input value={smtpForm.fromName} onChange={(e) => setSmtpForm((v) => ({ ...v, fromName: e.target.value }))} placeholder={t('system.smtpFromName')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={smtpForm.enabled} onChange={(e) => setSmtpForm((v) => ({ ...v, enabled: e.target.checked }))} />
                  {t('system.smtpEnabled')}
                </label>
                <div className="flex gap-2">
                  <button onClick={() => updateSmtpMutation.mutate()} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">{t('system.smtpSave')}</button>
                  <input value={smtpForm.testTo} onChange={(e) => setSmtpForm((v) => ({ ...v, testTo: e.target.value }))} placeholder={user?.email || t('system.smtpTestTo')} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                  <button onClick={() => testSmtpMutation.mutate()} className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg">{t('system.smtpTest')}</button>
                </div>
              </div>
              <div className="break-inside-avoid mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-3">
                <div className="mb-4 flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                    <Smartphone className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.securityPolicy')}</h3>
                    <p className="text-sm text-gray-500">{t('system.securityPolicyDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.require2FAGlobal')}</p>
                    <p className="text-xs text-gray-500">{t('system.require2FAGlobalDesc')}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={securityPolicy?.require2FAGlobal ?? false}
                      onChange={(e) => updateSecurityPolicyMutation.mutate({ require2FAGlobal: e.target.checked })}
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-3">
                <div className="mb-4 flex items-center gap-3">
                  <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <XCircle className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.comingSoon')}</h3>
                    <p className="text-sm text-gray-500">{t('system.comingSoonDesc')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('system.forceHttps')}</p>
                    <p className="text-xs text-gray-500">{t('system.forceHttpsDesc')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-500">{t('system.comingSoon')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
  );
}
