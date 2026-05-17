import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Space, Switch, Tag, TimeRangePicker } from 'tdesign-react';
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
import { settingsApi, securityApi, type LoginLimitConfig, type SecurityConfig, type SecurityPolicy, type SmtpConfig } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { toBoolean, toNumber, toString } from '../../utils/formHelpers';

type SmtpFormState = SmtpConfig & { testTo: string };
type AuditRulesFormState = {
  enabled: boolean;
  maxDeletionsPerHour: number;
  maxFailedLogins: number;
  offHoursStart: string;
  offHoursEnd: string;
};
type SecurityPolicyFormState = Pick<SecurityPolicy, 'require2FAGlobal'>;
type SecurityConfigFormState = SecurityConfig;

const DEFAULT_LOGIN_LIMIT_FORM: LoginLimitConfig = {
  enabled: true,
  maxAttempts: 10,
  lockoutDuration: 60,
};

const DEFAULT_SMTP_FORM: SmtpFormState = {
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

const DEFAULT_AUDIT_RULES: AuditRulesFormState = {
  enabled: true,
  maxDeletionsPerHour: 10,
  maxFailedLogins: 5,
  offHoursStart: '22:00',
  offHoursEnd: '06:00',
};

const DEFAULT_SECURITY_POLICY_FORM: SecurityPolicyFormState = {
  require2FAGlobal: false,
};

const DEFAULT_SECURITY_CONFIG_FORM: SecurityConfigFormState = {
  jwtViewEmailNotify: false,
  domainExpiryNotify: false,
  domainExpiryDays: 30,
  showDnsProviderSecrets: false,
};

const securityField = (label: string, control: ReactNode, tips?: string) => (
  <div className="settings-control-field">
    <span>{label}</span>
    {control}
    {tips && <small className="settings-control-field__tip">{tips}</small>}
  </div>
);

function readValue(source: Record<string, any> | undefined | null, ...keys: string[]) {
  if (!source) return undefined;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function unwrapConfig<T extends Record<string, any>>(config?: Partial<T> | null): Record<string, any> | null {
  if (!config) return null;
  const raw = config as Record<string, any>;
  if (raw.data && typeof raw.data === 'object') return raw.data;
  if (raw.config && typeof raw.config === 'object') return raw.config;
  if (raw.rules && typeof raw.rules === 'object') return raw.rules;
  return raw;
}

function normalizeLoginLimitConfig(config?: Partial<LoginLimitConfig> | null): LoginLimitConfig {
  const raw = unwrapConfig<LoginLimitConfig>(config);
  return {
    enabled: toBoolean(readValue(raw, 'enabled'), DEFAULT_LOGIN_LIMIT_FORM.enabled),
    maxAttempts: toNumber(readValue(raw, 'maxAttempts', 'max_attempts'), DEFAULT_LOGIN_LIMIT_FORM.maxAttempts),
    lockoutDuration: toNumber(readValue(raw, 'lockoutDuration', 'lockout_duration'), DEFAULT_LOGIN_LIMIT_FORM.lockoutDuration),
  };
}

function normalizeSmtpConfig(config?: Partial<SmtpFormState> | null): SmtpFormState {
  const raw = unwrapConfig<SmtpFormState>(config);
  return {
    enabled: toBoolean(readValue(raw, 'enabled'), DEFAULT_SMTP_FORM.enabled),
    host: toString(readValue(raw, 'host')),
    port: toNumber(readValue(raw, 'port'), DEFAULT_SMTP_FORM.port),
    secure: toBoolean(readValue(raw, 'secure'), DEFAULT_SMTP_FORM.secure),
    username: toString(readValue(raw, 'username', 'user')),
    password: toString(readValue(raw, 'password')),
    fromEmail: toString(readValue(raw, 'fromEmail', 'from_email')),
    fromName: toString(readValue(raw, 'fromName', 'from_name'), DEFAULT_SMTP_FORM.fromName) || DEFAULT_SMTP_FORM.fromName,
    testTo: toString(readValue(raw, 'testTo', 'test_to')),
  };
}

function normalizeAuditRules(rules?: Partial<AuditRulesFormState> | null): AuditRulesFormState {
  const raw = unwrapConfig<AuditRulesFormState>(rules);
  return {
    enabled: toBoolean(readValue(raw, 'enabled'), DEFAULT_AUDIT_RULES.enabled),
    maxDeletionsPerHour: toNumber(readValue(raw, 'maxDeletionsPerHour', 'max_deletions_per_hour'), DEFAULT_AUDIT_RULES.maxDeletionsPerHour),
    maxFailedLogins: toNumber(readValue(raw, 'maxFailedLogins', 'max_failed_logins'), DEFAULT_AUDIT_RULES.maxFailedLogins),
    offHoursStart: toString(readValue(raw, 'offHoursStart', 'off_hours_start'), DEFAULT_AUDIT_RULES.offHoursStart) || DEFAULT_AUDIT_RULES.offHoursStart,
    offHoursEnd: toString(readValue(raw, 'offHoursEnd', 'off_hours_end'), DEFAULT_AUDIT_RULES.offHoursEnd) || DEFAULT_AUDIT_RULES.offHoursEnd,
  };
}

function normalizeSecurityPolicy(policy?: Partial<SecurityPolicy> | null): SecurityPolicyFormState {
  const raw = unwrapConfig<SecurityPolicy>(policy);
  return {
    require2FAGlobal: toBoolean(readValue(raw, 'require2FAGlobal', 'require_2fa_global'), DEFAULT_SECURITY_POLICY_FORM.require2FAGlobal),
  };
}

function normalizeSecurityConfig(config?: Partial<SecurityConfig> | null): SecurityConfigFormState {
  const raw = unwrapConfig<SecurityConfig>(config);
  return {
    jwtViewEmailNotify: toBoolean(readValue(raw, 'jwtViewEmailNotify', 'jwt_view_email_notify'), DEFAULT_SECURITY_CONFIG_FORM.jwtViewEmailNotify),
    domainExpiryNotify: toBoolean(readValue(raw, 'domainExpiryNotify', 'domain_expiry_notify'), DEFAULT_SECURITY_CONFIG_FORM.domainExpiryNotify),
    domainExpiryDays: toNumber(readValue(raw, 'domainExpiryDays', 'domain_expiry_days'), DEFAULT_SECURITY_CONFIG_FORM.domainExpiryDays),
    showDnsProviderSecrets: toBoolean(readValue(raw, 'showDnsProviderSecrets', 'show_dns_provider_secrets'), DEFAULT_SECURITY_CONFIG_FORM.showDnsProviderSecrets),
  };
}

export function SecurityTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [unlockIdentifier, setUnlockIdentifier] = useState('');
  const [smtpForm, setSmtpForm] = useState<SmtpFormState>(DEFAULT_SMTP_FORM);
  const [loginLimitForm, setLoginLimitForm] = useState<LoginLimitConfig>(DEFAULT_LOGIN_LIMIT_FORM);
  const [auditRules, setAuditRules] = useState<AuditRulesFormState>(DEFAULT_AUDIT_RULES);
  const [securityPolicyForm, setSecurityPolicyForm] = useState<SecurityPolicyFormState>(DEFAULT_SECURITY_POLICY_FORM);
  const [securityConfigForm, setSecurityConfigForm] = useState<SecurityConfigFormState>(DEFAULT_SECURITY_CONFIG_FORM);

  const { data: smtpConfig, dataUpdatedAt: smtpConfigUpdatedAt } = useQuery({
    queryKey: ['smtp-config'],
    queryFn: async () => {
      const res = await settingsApi.getSmtpConfig();
      if (res.data.code === 0) return normalizeSmtpConfig(res.data.data);
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
      if (res.data.code === 0) return normalizeLoginLimitConfig(res.data.data);
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 0,
  });

  const { data: loginStats } = useQuery({
    queryKey: ['login-attempt-stats'],
    queryFn: async () => {
      const res = await settingsApi.getLoginAttemptStats();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const { data: securityPolicyConfig, dataUpdatedAt: securityPolicyUpdatedAt } = useQuery({
    queryKey: ['security-policy'],
    queryFn: async () => {
      const res = await securityApi.getPolicy();
      if (res.data.code === 0) return normalizeSecurityPolicy(res.data.data);
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 0,
  });

  const { data: securityConfigData, dataUpdatedAt: securityConfigUpdatedAt } = useQuery({
    queryKey: ['security-config'],
    queryFn: async () => {
      const res = await settingsApi.getSecurityConfig();
      if (res.data.code === 0) return normalizeSecurityConfig(res.data.data);
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 0,
  });

  const { data: auditRulesConfig, dataUpdatedAt: auditRulesUpdatedAt } = useQuery({
    queryKey: ['audit-rules'],
    queryFn: async () => {
      const res = await settingsApi.getAuditRules();
      if (res.data.code === 0) return normalizeAuditRules(res.data.data);
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 0,
  });

  useEffect(() => {
    if (!smtpConfig) return;
    setSmtpForm((prev) => ({ ...prev, ...smtpConfig, testTo: prev.testTo }));
  }, [smtpConfig, smtpConfigUpdatedAt]);

  useEffect(() => {
    if (!loginLimitConfig) return;
    setLoginLimitForm((prev) => ({ ...prev, ...loginLimitConfig }));
  }, [loginLimitConfig, loginLimitUpdatedAt]);

  useEffect(() => {
    if (!auditRulesConfig) return;
    setAuditRules((prev) => ({ ...prev, ...auditRulesConfig }));
  }, [auditRulesConfig, auditRulesUpdatedAt]);

  useEffect(() => {
    if (!securityPolicyConfig) return;
    setSecurityPolicyForm((prev) => ({ ...prev, ...securityPolicyConfig }));
  }, [securityPolicyConfig, securityPolicyUpdatedAt]);

  useEffect(() => {
    if (!securityConfigData) return;
    setSecurityConfigForm((prev) => ({ ...prev, ...securityConfigData }));
  }, [securityConfigData, securityConfigUpdatedAt]);

  const updateSecurityPolicyMutation = useMutation({
    mutationFn: (data: Parameters<typeof securityApi.updatePolicy>[0]) => securityApi.updatePolicy(data),
    onSuccess: (res) => {
      if (res.data.code === 0 && res.data.data) {
        const nextPolicy = normalizeSecurityPolicy(res.data.data);
        setSecurityPolicyForm((prev) => ({ ...prev, ...nextPolicy }));
        queryClient.setQueryData(['security-policy'], nextPolicy);
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
        const nextConfig = normalizeSecurityConfig(res.data.data);
        setSecurityConfigForm((prev) => ({ ...prev, ...nextConfig }));
        queryClient.setQueryData(['security-config'], nextConfig);
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
      if (res.data.code === 0 && res.data.data) {
        const nextConfig = normalizeLoginLimitConfig(res.data.data);
        setLoginLimitForm((prev) => ({ ...prev, ...nextConfig }));
        queryClient.setQueryData(['login-limit-config'], nextConfig);
      }
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

  const handleToggleLoginLimit = (enabled: boolean) => {
    setLoginLimitForm((prev) => ({ ...prev, enabled }));
    updateLoginLimitMutation.mutate({ enabled });
  };

  const handleUpdateMaxAttempts = (value: number) => {
    setLoginLimitForm((prev) => ({ ...prev, maxAttempts: value }));
    if (value >= 1 && value <= 100) {
      updateLoginLimitMutation.mutate({ maxAttempts: value });
    }
  };

  const handleUpdateLockoutDuration = (value: number) => {
    setLoginLimitForm((prev) => ({ ...prev, lockoutDuration: value }));
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
        const normalized = normalizeSmtpConfig({ ...nextConfig, testTo: smtpForm.testTo });
        setSmtpForm((prev) => ({ ...prev, ...normalized, testTo: prev.testTo }));
        queryClient.setQueryData(['smtp-config'], normalized);
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
    mutationFn: (rules: any) => settingsApi.updateAuditRules(rules),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      if (res.data.data) {
        const nextRules = normalizeAuditRules(res.data.data);
        setAuditRules((prev) => ({ ...prev, ...nextRules }));
        queryClient.setQueryData(['audit-rules'], nextRules);
      }
      queryClient.invalidateQueries({ queryKey: ['audit-rules'] });
      toast.success(t('system.auditRulesSaved'));
    },
    onError: (error: Error) => toast.error(error.message || t('system.auditRulesSaveFailed')),
  });

  const saveAuditRules = () => {
    updateAuditRulesMutation.mutate(normalizeAuditRules(auditRules));
  };

  const cardTitle = (icon: ReactNode, title: string, subtitle: string) => (
    <Space size="small" align="start">
      <span className="metric-icon metric-icon--primary">{icon}</span>
      <span>
        <span className="page-card-title">{title}</span>
        <span className="page-card-subtitle">{subtitle}</span>
      </span>
    </Space>
  );

  const require2FAEnabled = Boolean(securityPolicyForm.require2FAGlobal);

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
              onChange={(checked: any) => handleToggleLoginLimit(Boolean(checked))}
            />
          </div>

          <div className="notification-form-grid">
            {securityField(t('system.maxAttempts'), (
              <Input
                type="number"
                value={String(loginLimitForm.maxAttempts ?? DEFAULT_LOGIN_LIMIT_FORM.maxAttempts)}
                suffix={t('system.attempts')}
                disabled={updateLoginLimitMutation.isPending || !loginLimitForm.enabled}
                onChange={(value: any) => handleUpdateMaxAttempts(Number(value))}
              />
            ), t('system.maxAttemptsDesc'))}
            {securityField(t('system.lockoutDuration'), (
              <Input
                type="number"
                value={String(loginLimitForm.lockoutDuration ?? DEFAULT_LOGIN_LIMIT_FORM.lockoutDuration)}
                suffix={t('system.minutes')}
                disabled={updateLoginLimitMutation.isPending || !loginLimitForm.enabled}
                onChange={(value: any) => handleUpdateLockoutDuration(Number(value))}
              />
            ), t('system.lockoutDurationDesc'))}
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
                setAuditRules(nextRules);
                updateAuditRulesMutation.mutate(nextRules);
              }}
            />
          </div>

          <div className="notification-form-grid">
            {securityField(t('system.maxDeletions'), (
              <Input
                type="number"
                value={String(auditRules.maxDeletionsPerHour ?? 10)}
                onChange={(value: any) => setAuditRules((prev) => ({ ...prev, maxDeletionsPerHour: Number(value) || 0 }))}
                onBlur={() => saveAuditRules()}
              />
            ), t('system.maxDeletionsDesc'))}
            {securityField(t('system.maxFailedLogins'), (
              <Input
                type="number"
                value={String(auditRules.maxFailedLogins ?? 5)}
                onChange={(value: any) => setAuditRules((prev) => ({ ...prev, maxFailedLogins: Number(value) || 0 }))}
                onBlur={() => saveAuditRules()}
              />
            ), t('system.maxFailedLoginsDesc'))}
            {securityField(t('system.offHoursAlert'), (
              <TimeRangePicker
                allowInput
                format="HH:mm"
                value={[auditRules.offHoursStart ?? '22:00', auditRules.offHoursEnd ?? '06:00']}
                onChange={(value: any) => {
                  setAuditRules({
                    ...normalizeAuditRules(auditRules),
                    offHoursStart: value?.[0] || '22:00',
                    offHoursEnd: value?.[1] || '06:00',
                  });
                }}
                onBlur={() => saveAuditRules()}
              />
            ), t('system.offHoursAlertDesc'))}
          </div>
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

          <div className="page-shell">
            {securityField(t('system.manualUnlock'), (
              <Input
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
            ), t('system.manualUnlockDesc'))}
          </div>
        </Card>

        <Card bordered={false} shadow={false} title={cardTitle(<ServerIcon />, t('system.smtpConfig'), t('system.smtpConfigDesc'))}>
          <div className="page-shell">
            <div className="notification-form-grid">
              {securityField(t('system.smtpHost'), (
                <Input value={String(smtpForm.host ?? '')} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, host: String(value) }))} placeholder={t('system.smtpHost')} />
              ))}
              {securityField(t('system.smtpPort'), (
                <Input type="number" value={String(smtpForm.port ?? 587)} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, port: Number(value) || 0 }))} placeholder={t('system.smtpPort')} />
              ))}
              {securityField(t('system.smtpUser'), (
                <Input value={String(smtpForm.username ?? '')} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, username: String(value) }))} placeholder={t('system.smtpUser')} />
              ))}
              {securityField(t('system.smtpPass'), (
                <Input type="password" value={String(smtpForm.password ?? '')} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, password: String(value) }))} placeholder={t('system.smtpPass')} />
              ))}
              {securityField(t('system.smtpFromEmail'), (
                <Input value={String(smtpForm.fromEmail ?? '')} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, fromEmail: String(value) }))} placeholder={t('system.smtpFromEmail')} />
              ))}
              {securityField(t('system.smtpFromName'), (
                <Input value={String(smtpForm.fromName || 'DNSMgr')} onChange={(value: any) => setSmtpForm((prev) => ({ ...prev, fromName: String(value) }))} placeholder={t('system.smtpFromName')} />
              ))}
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
                value={String(smtpForm.testTo ?? '')}
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
              onChange={(checked: any) => {
                const next = Boolean(checked);
                setSecurityPolicyForm((prev) => ({ ...prev, require2FAGlobal: next }));
                queryClient.setQueryData(['security-policy'], normalizeSecurityPolicy({ require2FAGlobal: next }));
                updateSecurityPolicyMutation.mutate({ require2FAGlobal: next });
              }}
            />
          </div>
          <div className="settings-switch-row">
            <div>
              <strong>{t('system.showDnsProviderSecrets')}</strong>
              <span>{t('system.showDnsProviderSecretsDesc')}</span>
            </div>
            <Switch
              value={securityConfigForm.showDnsProviderSecrets ?? false}
              loading={updateSecurityConfigMutation.isPending}
              onChange={(checked: any) => {
                const nextConfig = normalizeSecurityConfig({ ...securityConfigForm, showDnsProviderSecrets: Boolean(checked) });
                setSecurityConfigForm((prev) => ({ ...prev, ...nextConfig }));
                queryClient.setQueryData(['security-config'], nextConfig);
                updateSecurityConfigMutation.mutate(nextConfig);
              }}
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
