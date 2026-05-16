import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Space, Switch, Tag, TimeRangePicker } from 'tdesign-react';
import {
  CloseCircleIcon,
  LockOnIcon,
  MailIcon,
  MobileIcon,
  SecuredIcon,
  ServerIcon,
  UserUnlockedIcon,
  UsergroupIcon,
} from 'tdesign-icons-react';
import { settingsApi, securityApi, type LoginLimitConfig } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { toBoolean, toNumber, toString } from '../../utils/typeConverters';

const DEFAULT_SMTP_FORM = {
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  username: '',
  password: '',
  fromEmail: '',
  fromName: 'DNSMgr',
  testTo: '',
};

interface AuditRules {
  enabled: boolean;
  maxDeletionsPerHour: number;
  maxFailedLogins: number;
  offHoursStart: string;
  offHoursEnd: string;
}

const DEFAULT_AUDIT_RULES: AuditRules = {
  enabled: true,
  maxDeletionsPerHour: 10,
  maxFailedLogins: 5,
  offHoursStart: '22:00',
  offHoursEnd: '06:00',
};

const DEFAULT_LOGIN_LIMIT_CONFIG: LoginLimitConfig = {
  enabled: true,
  maxAttempts: 10,
  lockoutDuration: 60,
};

const smtpField = (label: string, control: ReactNode, tips?: ReactNode) => (
  <label className="settings-control-field">
    <span>{label}</span>
    {control}
    {tips && <small className="settings-control-field__tip">{tips}</small>}
  </label>
);

function normalizeAuditRules(rules?: Partial<AuditRules> | null): AuditRules {
  return {
    enabled: rules?.enabled === undefined ? DEFAULT_AUDIT_RULES.enabled : toBoolean(rules.enabled as any),
    maxDeletionsPerHour: toNumber(rules?.maxDeletionsPerHour, DEFAULT_AUDIT_RULES.maxDeletionsPerHour),
    maxFailedLogins: toNumber(rules?.maxFailedLogins, DEFAULT_AUDIT_RULES.maxFailedLogins),
    offHoursStart: toString(rules?.offHoursStart, DEFAULT_AUDIT_RULES.offHoursStart) || DEFAULT_AUDIT_RULES.offHoursStart,
    offHoursEnd: toString(rules?.offHoursEnd, DEFAULT_AUDIT_RULES.offHoursEnd) || DEFAULT_AUDIT_RULES.offHoursEnd,
  };
}

function normalizeLoginLimitConfig(config?: Partial<LoginLimitConfig> | null): LoginLimitConfig {
  return {
    enabled: config?.enabled === undefined ? DEFAULT_LOGIN_LIMIT_CONFIG.enabled : toBoolean(config.enabled as any),
    maxAttempts: toNumber(config?.maxAttempts, DEFAULT_LOGIN_LIMIT_CONFIG.maxAttempts),
    lockoutDuration: toNumber(config?.lockoutDuration, DEFAULT_LOGIN_LIMIT_CONFIG.lockoutDuration),
  };
}

export function SecurityTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [unlockIdentifier, setUnlockIdentifier] = useState('');
  const [smtpForm, setSmtpForm] = useState(DEFAULT_SMTP_FORM);
  const [loginLimitForm, setLoginLimitForm] = useState<LoginLimitConfig>(DEFAULT_LOGIN_LIMIT_CONFIG);
  const [loginLimitDirty, setLoginLimitDirty] = useState(false);
  const [auditRules, setAuditRules] = useState<AuditRules>(DEFAULT_AUDIT_RULES);
  const [auditRulesDirty, setAuditRulesDirty] = useState(false);

  const { data: smtpConfig, dataUpdatedAt: smtpConfigUpdatedAt } = useQuery({
    queryKey: ['smtp-config'],
    queryFn: async () => {
      const res = await settingsApi.getSmtpConfig();
      if (res.data.code === 0 && res.data.data) {
        return res.data.data;
      }
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 0,
  });

  const { data: loginLimitConfig, dataUpdatedAt: loginLimitUpdatedAt } = useQuery({
    queryKey: ['login-limit-config'],
    queryFn: async () => {
      const res = await settingsApi.getLoginLimit();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
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
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: securityConfig } = useQuery({
    queryKey: ['security-config'],
    queryFn: async () => {
      const res = await settingsApi.getSecurityConfig();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: auditRulesData, dataUpdatedAt: auditRulesUpdatedAt } = useQuery({
    queryKey: ['audit-rules'],
    queryFn: async () => {
      const res = await settingsApi.getAuditRules();
      if (res.data.code === 0 && res.data.data) {
        return res.data.data;
      }
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 0,
  });

  useEffect(() => {
    if (!smtpConfig) return;
    setSmtpForm((prev) => ({ ...prev, ...smtpConfig }));
  }, [smtpConfig, smtpConfigUpdatedAt]);

  useEffect(() => {
    if (!loginLimitConfig) return;
    if (loginLimitDirty) return;
    setLoginLimitForm(normalizeLoginLimitConfig(loginLimitConfig));
  }, [loginLimitConfig, loginLimitUpdatedAt, loginLimitDirty]);

  useEffect(() => {
    if (!auditRulesData) return;
    if (auditRulesDirty) return;
    setAuditRules(normalizeAuditRules(auditRulesData));
  }, [auditRulesData, auditRulesUpdatedAt, auditRulesDirty]);

  const updateSecurityPolicyMutation = useMutation({
    mutationFn: (data: Parameters<typeof securityApi.updatePolicy>[0]) => securityApi.updatePolicy(data),
    onSuccess: (res) => {
      if (res.data.code === 0 && res.data.data) {
        queryClient.setQueryData(['security-policy'], res.data.data);
      }
      queryClient.invalidateQueries({ queryKey: ['security-policy'] });
      toast.success(t('system.configUpdated'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('system.configUpdateFailed'));
    },
  });

  const updateSecurityConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof settingsApi.updateSecurityConfig>[0]) => settingsApi.updateSecurityConfig(data),
    onSuccess: (res) => {
      if (res.data.code === 0 && res.data.data) {
        queryClient.setQueryData(['security-config'], res.data.data);
      }
      queryClient.invalidateQueries({ queryKey: ['security-config'] });
      toast.success(t('system.securitySaved'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('system.securitySaveFailed'));
    },
  });

  const updateLoginLimitMutation = useMutation({
    mutationFn: settingsApi.updateLoginLimit,
    onSuccess: (res) => {
      const nextConfig = normalizeLoginLimitConfig(res.data.data || loginLimitForm);
      if (res.data.code === 0 && res.data.data) {
        queryClient.setQueryData(['login-limit-config'], res.data.data);
      }
      setLoginLimitForm(nextConfig);
      setLoginLimitDirty(false);
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
    const nextConfig = normalizeLoginLimitConfig({ ...loginLimitForm, enabled: !loginLimitForm.enabled });
    setLoginLimitDirty(true);
    setLoginLimitForm(nextConfig);
    updateLoginLimitMutation.mutate(nextConfig);
  };

  const handleUpdateMaxAttempts = (value: number) => {
    if (value >= 1 && value <= 100) {
      setLoginLimitDirty(true);
      setLoginLimitForm((prev) => ({ ...prev, maxAttempts: value }));
    }
  };

  const handleUpdateLockoutDuration = (value: number) => {
    if (value >= 1 && value <= 1440) {
      setLoginLimitDirty(true);
      setLoginLimitForm((prev) => ({ ...prev, lockoutDuration: value }));
    }
  };

  const saveLoginLimit = () => {
    updateLoginLimitMutation.mutate(normalizeLoginLimitConfig(loginLimitForm));
  };

  const handleUnlockAccount = () => {
    if (unlockIdentifier.trim()) {
      unlockAccountMutation.mutate(unlockIdentifier.trim());
    }
  };

  const updateSmtpMutation = useMutation({
    mutationFn: () => settingsApi.updateSmtpConfig({
      enabled: smtpForm.enabled ?? false,
      host: (smtpForm.host || '').trim(),
      port: Number(smtpForm.port || 587),
      secure: smtpForm.secure ?? false,
      username: (smtpForm.username || '').trim(),
      password: smtpForm.password || '',
      fromEmail: (smtpForm.fromEmail || '').trim(),
      fromName: (smtpForm.fromName || 'DNSMgr').trim(),
    }),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      const nextConfig = res.data.data;
      if (nextConfig) {
        setSmtpForm((prev) => ({ ...prev, ...nextConfig }));
        queryClient.setQueryData(['smtp-config'], nextConfig);
      }
      queryClient.invalidateQueries({ queryKey: ['smtp-config'] });
      toast.success(t('system.smtpSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.smtpSaveFailed')),
  });

  const testSmtpMutation = useMutation({
    mutationFn: () => settingsApi.sendSmtpTest((smtpForm.testTo || '').trim() || undefined),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('system.smtpTestSent'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.smtpTestFailed')),
  });

  const updateAuditRulesMutation = useMutation({
    mutationFn: (rules: AuditRules) => settingsApi.updateAuditRules(rules),
    onSuccess: (res, submittedRules) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      const nextRules = normalizeAuditRules(res.data.data || submittedRules);
      setAuditRules(nextRules);
      setAuditRulesDirty(false);
      queryClient.setQueryData(['audit-rules'], nextRules);
      queryClient.invalidateQueries({ queryKey: ['audit-rules'] });
      toast.success(t('system.auditRulesSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.auditRulesSaveFailed')),
  });

  const saveAuditRules = () => {
    updateAuditRulesMutation.mutate(normalizeAuditRules(auditRules));
  };

  const updateAuditRule = <K extends keyof AuditRules>(key: K, value: AuditRules[K]) => {
    setAuditRulesDirty(true);
    setAuditRules((prev) => ({ ...prev, [key]: value }));
  };

  const cardTitle = (icon: React.ReactNode, title: string, subtitle: string) => (
    <Space size="small" align="start">
      <span className="metric-icon metric-icon--primary">{icon}</span>
      <span>
        <span className="page-card-title">{title}</span>
        <span className="page-card-subtitle">{subtitle}</span>
      </span>
    </Space>
  );

  const require2FAEnabled = Boolean(securityPolicy?.require2FAGlobal);

  return (
    <div className="page-shell">
      <div className="access-grid">
        <Card bordered={false} shadow={false} title={cardTitle(<LockOnIcon />, t('system.loginLimitConfig'), t('system.loginLimitConfigDesc'))}>
          <div className="settings-switch-row">
            <div>
              <strong>{t('system.enableLoginLimit')}</strong>
              <span>{t('system.enableLoginLimitDesc')}</span>
            </div>
            <Switch
              value={loginLimitForm.enabled}
              loading={updateLoginLimitMutation.isPending}
              onChange={handleToggleLoginLimit}
            />
          </div>

          <div className="notification-form-grid">
            {smtpField(t('system.maxAttempts'),
              <Input
                name="login-limit-max-attempts"
                autocomplete="off"
                type="number"
                value={String(loginLimitForm.maxAttempts)}
                suffix={t('system.attempts')}
                disabled={updateLoginLimitMutation.isPending || !loginLimitForm.enabled}
                onChange={(value: any) => handleUpdateMaxAttempts(Number(value))}
                onBlur={() => saveLoginLimit()}
              />
            , t('system.maxAttemptsDesc'))}
            {smtpField(t('system.lockoutDuration'),
              <Input
                name="login-limit-lockout-duration"
                autocomplete="off"
                type="number"
                value={String(loginLimitForm.lockoutDuration)}
                suffix={t('system.minutes')}
                disabled={updateLoginLimitMutation.isPending || !loginLimitForm.enabled}
                onChange={(value: any) => handleUpdateLockoutDuration(Number(value))}
                onBlur={() => saveLoginLimit()}
              />
            , t('system.lockoutDurationDesc'))}
          </div>
        </Card>

        <Card bordered={false} shadow={false} title={cardTitle(<SecuredIcon />, t('system.auditRules'), t('system.auditRulesDesc'))}>
          <div className="settings-switch-row">
            <div>
              <strong>{t('system.enableAlerts')}</strong>
              <span>{t('system.enableAlertsDesc')}</span>
            </div>
            <Switch
              value={auditRules.enabled ?? true}
              loading={updateAuditRulesMutation.isPending}
              onChange={(checked: any) => {
                const nextRules = normalizeAuditRules({ ...auditRules, enabled: Boolean(checked) });
                setAuditRulesDirty(true);
                setAuditRules(nextRules);
                updateAuditRulesMutation.mutate(nextRules);
              }}
            />
          </div>

          <Form layout="vertical" colon={false} requiredMark={false} className="notification-form-grid">
            {smtpField(t('system.maxDeletions'),
              <Input
                type="number"
                value={String(auditRules.maxDeletionsPerHour ?? 10)}
                onChange={(value: any) => updateAuditRule('maxDeletionsPerHour', Number(value) || 0)}
                onBlur={() => saveAuditRules()}
              />,
              t('system.maxDeletionsDesc')
            )}
            {smtpField(t('system.maxFailedLogins'),
              <Input
                type="number"
                value={String(auditRules.maxFailedLogins ?? 5)}
                onChange={(value: any) => updateAuditRule('maxFailedLogins', Number(value) || 0)}
                onBlur={() => saveAuditRules()}
              />,
              t('system.maxFailedLoginsDesc')
            )}
            {smtpField(t('system.offHoursAlert'),
              <TimeRangePicker
                allowInput
                format="HH:mm"
                value={[auditRules.offHoursStart ?? '22:00', auditRules.offHoursEnd ?? '06:00']}
                onChange={(value: any) => {
                  setAuditRulesDirty(true);
                  setAuditRules((prev) => normalizeAuditRules({
                    ...prev,
                    offHoursStart: value?.[0] || DEFAULT_AUDIT_RULES.offHoursStart,
                    offHoursEnd: value?.[1] || DEFAULT_AUDIT_RULES.offHoursEnd,
                  }));
                }}
                onBlur={() => saveAuditRules()}
              />,
              t('system.offHoursAlertDesc')
            )}
          </Form>
        </Card>

        <Card bordered={false} shadow={false} title={cardTitle(<UsergroupIcon />, t('system.loginStats'), t('system.loginStatsDesc'))}>
          <div className="metric-grid">
            <div className="metric-tile metric-tile--danger">
              <span>{t('system.lockedAccounts')}</span>
              <strong>{loginStats?.totalLocked || 0}</strong>
            </div>
            <div className="metric-tile metric-tile--warning">
              <span>{t('system.recentFailedAttempts')}</span>
              <strong>{loginStats?.recentAttempts || 0}</strong>
            </div>
          </div>

          <Form layout="vertical" colon={false} requiredMark={false}>
            <Form.FormItem label={t('system.manualUnlock')} help={t('system.manualUnlockDesc')}>
              <Input
                name="login-limit-unlock-identifier"
                autocomplete="off"
                value={unlockIdentifier}
                placeholder={t('system.unlockPlaceholder')}
                onChange={(value: any) => setUnlockIdentifier(String(value))}
                suffixIcon={(
                  <Button
                    shape="square"
                    variant="text"
                    theme="primary"
                    icon={<UserUnlockedIcon />}
                    loading={unlockAccountMutation.isPending}
                    disabled={!unlockIdentifier.trim()}
                    onClick={handleUnlockAccount}
                  />
                )}
              />
            </Form.FormItem>
          </Form>
        </Card>

        <Card bordered={false} shadow={false} title={cardTitle(<ServerIcon />, t('system.smtpConfig'), t('system.smtpConfigDesc'))}>
          <div className="page-shell">
            <div className="notification-form-grid">
              {smtpField(t('system.smtpHost'),
                <Input value={smtpForm.host || ''} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, host: String(value) }))} placeholder={t('system.smtpHost')} />
              )}
              {smtpField(t('system.smtpPort'),
                <Input type="number" value={String(smtpForm.port ?? 587)} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, port: Number(value) || 0 }))} placeholder={t('system.smtpPort')} />
              )}
              {smtpField(t('system.smtpUser'),
                <Input value={smtpForm.username || ''} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, username: String(value) }))} placeholder={t('system.smtpUser')} />
              )}
              {smtpField(t('system.smtpPass'),
                <Input type="password" value={smtpForm.password || ''} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, password: String(value) }))} placeholder={t('system.smtpPass')} />
              )}
              {smtpField(t('system.smtpFromEmail'),
                <Input value={smtpForm.fromEmail || ''} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, fromEmail: String(value) }))} placeholder={t('system.smtpFromEmail')} />
              )}
              {smtpField(t('system.smtpFromName'),
                <Input value={smtpForm.fromName || 'DNSMgr'} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, fromName: String(value) }))} placeholder={t('system.smtpFromName')} />
              )}
            </div>

            <div className="settings-switch-row">
              <div>
                <strong>{t('system.smtpEnabled')}</strong>
                <span>{t('system.smtpConfigDesc')}</span>
              </div>
              <Switch value={smtpForm.enabled ?? false} onChange={(checked: any) => setSmtpForm((prev) => ({ ...prev, enabled: Boolean(checked) }))} />
            </div>

            <Space breakLine className="record-form__actions">
              <Button theme="primary" icon={<MailIcon />} loading={updateSmtpMutation.isPending} onClick={() => updateSmtpMutation.mutate()}>
                {t('system.smtpSave')}
              </Button>
              <Input
                value={smtpForm.testTo || ''}
                onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, testTo: String(value) }))}
                placeholder={user?.email || t('system.smtpTestTo')}
              />
              <Button theme="success" variant="outline" loading={testSmtpMutation.isPending} onClick={() => testSmtpMutation.mutate()}>
                {t('system.smtpTest')}
              </Button>
            </Space>
          </div>
        </Card>

        <Card bordered={false} shadow={false} title={cardTitle(<MobileIcon />, t('system.securityPolicy'), t('system.securityPolicyDesc'))}>
          <div className="settings-switch-row">
            <div>
              <div className="settings-switch-row__heading">
                <strong>{t('system.require2FAGlobal')}</strong>
                <Tag theme={require2FAEnabled ? 'success' : 'default'} variant="light">
                  {t(require2FAEnabled ? 'system.twoFAEnabledStatus' : 'system.twoFADisabledStatus')}
                </Tag>
              </div>
              <span>{t('system.require2FAGlobalDesc')}</span>
            </div>
            <Switch
              value={require2FAEnabled}
              loading={updateSecurityPolicyMutation.isPending}
              onChange={(checked: any) => updateSecurityPolicyMutation.mutate({ require2FAGlobal: Boolean(checked) })}
            />
          </div>
          <div className="settings-switch-row">
            <div>
              <strong>{t('system.showDnsProviderSecrets')}</strong>
              <span>{t('system.showDnsProviderSecretsDesc')}</span>
            </div>
            <Switch
              value={securityConfig?.showDnsProviderSecrets ?? false}
              loading={updateSecurityConfigMutation.isPending}
              onChange={(checked: any) => updateSecurityConfigMutation.mutate({ showDnsProviderSecrets: Boolean(checked) })}
            />
          </div>
        </Card>

        <Card bordered={false} shadow={false} title={cardTitle(<CloseCircleIcon />, t('system.comingSoon'), t('system.comingSoonDesc'))}>
          <div className="settings-switch-row">
            <div>
              <strong>{t('system.forceHttps')}</strong>
              <span>{t('system.forceHttpsDesc')}</span>
            </div>
            <Tag theme="default" variant="light">{t('system.comingSoon')}</Tag>
          </div>
        </Card>
      </div>
    </div>
  );
}
