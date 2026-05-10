import { useState, useEffect } from 'react';
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
import { settingsApi, securityApi } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { toBoolean, toString, toNumber } from '../../utils/typeConverters';

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
    fromName: 'HiDNS',
    testTo: '',
  });

  const [auditRules, setAuditRules] = useState({
    enabled: true,
    maxDeletionsPerHour: 10,
    maxFailedLogins: 5,
    offHoursStart: '22:00',
    offHoursEnd: '06:00',
  });

  const { data: smtpConfig } = useQuery({
    queryKey: ['smtp-config'],
    queryFn: async () => {
      const res = await settingsApi.getSmtpConfig();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  useEffect(() => {
    if (smtpConfig) {
      setSmtpForm({
        enabled: toBoolean(smtpConfig.enabled),
        host: toString(smtpConfig.host),
        port: toNumber(smtpConfig.port, 587),
        secure: toBoolean(smtpConfig.secure),
        username: toString(smtpConfig.username),
        password: toString(smtpConfig.password),
        fromEmail: toString(smtpConfig.fromEmail),
        fromName: toString(smtpConfig.fromName, 'HiDNS'),
        testTo: '',
      });
    }
  }, [smtpConfig?.host, smtpConfig?.port, smtpConfig?.enabled, smtpConfig?.username, smtpConfig?.password, smtpConfig?.fromEmail, smtpConfig?.fromName, smtpConfig?.secure]);

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

  const { data: securityConfig } = useQuery({
    queryKey: ['security-config'],
    queryFn: async () => {
      const res = await settingsApi.getSecurityConfig();
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

  const updateSecurityConfigMutation = useMutation({
    mutationFn: (data: Parameters<typeof settingsApi.updateSecurityConfig>[0]) => settingsApi.updateSecurityConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-config'] });
      toast.success(t('system.securitySaved'));
    },
    onError: (error: Error) => {
      toast.error(error.message || t('system.securitySaveFailed'));
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

  const saveAuditRules = (next: typeof auditRules) => {
    setAuditRules(next);
    updateAuditRulesMutation.mutate(next);
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
              value={Boolean(loginLimitConfig?.enabled)}
              loading={updateLoginLimitMutation.isPending}
              onChange={handleToggleLoginLimit}
            />
          </div>

          <Form layout="vertical" colon={false} requiredMark={false} className="notification-form-grid">
            <Form.FormItem label={t('system.maxAttempts')} help={t('system.maxAttemptsDesc')}>
              <Input
                type="number"
                value={String(loginLimitConfig?.maxAttempts || 10)}
                suffix={t('system.attempts')}
                disabled={updateLoginLimitMutation.isPending || !loginLimitConfig?.enabled}
                onChange={(value: any) => handleUpdateMaxAttempts(Number(value))}
              />
            </Form.FormItem>
            <Form.FormItem label={t('system.lockoutDuration')} help={t('system.lockoutDurationDesc')}>
              <Input
                type="number"
                value={String(loginLimitConfig?.lockoutDuration || 60)}
                suffix={t('system.minutes')}
                disabled={updateLoginLimitMutation.isPending || !loginLimitConfig?.enabled}
                onChange={(value: any) => handleUpdateLockoutDuration(Number(value))}
              />
            </Form.FormItem>
          </Form>
        </Card>

        <Card bordered={false} shadow={false} title={cardTitle(<SecuredIcon />, t('system.auditRules'), t('system.auditRulesDesc'))}>
          <div className="settings-switch-row">
            <div>
              <strong>{t('system.enableAlerts')}</strong>
              <span>{t('system.enableAlertsDesc')}</span>
            </div>
            <Switch
              value={auditRules.enabled}
              loading={updateAuditRulesMutation.isPending}
              onChange={(checked: any) => saveAuditRules({ ...auditRules, enabled: Boolean(checked) })}
            />
          </div>

          <Form layout="vertical" colon={false} requiredMark={false} className="notification-form-grid">
            <Form.FormItem label={t('system.maxDeletions')} help={t('system.maxDeletionsDesc')}>
              <Input
                type="number"
                value={String(auditRules.maxDeletionsPerHour)}
                onChange={(value: any) => setAuditRules({ ...auditRules, maxDeletionsPerHour: Number(value) || 0 })}
                onBlur={() => updateAuditRulesMutation.mutate(auditRules)}
              />
            </Form.FormItem>
            <Form.FormItem label={t('system.maxFailedLogins')} help={t('system.maxFailedLoginsDesc')}>
              <Input
                type="number"
                value={String(auditRules.maxFailedLogins)}
                onChange={(value: any) => setAuditRules({ ...auditRules, maxFailedLogins: Number(value) || 0 })}
                onBlur={() => updateAuditRulesMutation.mutate(auditRules)}
              />
            </Form.FormItem>
            <Form.FormItem label={t('system.offHoursAlert')} help={t('system.offHoursAlertDesc')}>
              <TimeRangePicker
                allowInput
                format="HH:mm"
                value={[auditRules.offHoursStart, auditRules.offHoursEnd]}
                onChange={(value: any) => setAuditRules({
                  ...auditRules,
                  offHoursStart: value?.[0] || '22:00',
                  offHoursEnd: value?.[1] || '06:00',
                })}
                onBlur={() => updateAuditRulesMutation.mutate(auditRules)}
              />
            </Form.FormItem>
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
          <Form layout="vertical" colon={false} requiredMark={false}>
            <div className="notification-form-grid">
              <Form.FormItem label={t('system.smtpHost')}>
                <Input value={String(smtpForm.host)} onChange={(value: any) => setSmtpForm((v) => ({ ...v, host: String(value) }))} placeholder={t('system.smtpHost')} />
              </Form.FormItem>
              <Form.FormItem label={t('system.smtpPort')}>
                <Input type="number" value={String(smtpForm.port)} onChange={(value: any) => setSmtpForm((v) => ({ ...v, port: Number(value) || 0 }))} placeholder={t('system.smtpPort')} />
              </Form.FormItem>
              <Form.FormItem label={t('system.smtpUser')}>
                <Input value={String(smtpForm.username)} onChange={(value: any) => setSmtpForm((v) => ({ ...v, username: String(value) }))} placeholder={t('system.smtpUser')} />
              </Form.FormItem>
              <Form.FormItem label={t('system.smtpPass')}>
                <Input type="password" value={String(smtpForm.password)} onChange={(value: any) => setSmtpForm((v) => ({ ...v, password: String(value) }))} placeholder={t('system.smtpPass')} />
              </Form.FormItem>
              <Form.FormItem label={t('system.smtpFromEmail')}>
                <Input value={String(smtpForm.fromEmail)} onChange={(value: any) => setSmtpForm((v) => ({ ...v, fromEmail: String(value) }))} placeholder={t('system.smtpFromEmail')} />
              </Form.FormItem>
              <Form.FormItem label={t('system.smtpFromName')}>
                <Input value={String(smtpForm.fromName)} onChange={(value: any) => setSmtpForm((v) => ({ ...v, fromName: String(value) }))} placeholder={t('system.smtpFromName')} />
              </Form.FormItem>
            </div>

            <div className="settings-switch-row">
              <div>
                <strong>{t('system.smtpEnabled')}</strong>
                <span>{t('system.smtpConfigDesc')}</span>
              </div>
              <Switch value={smtpForm.enabled} onChange={(checked: any) => setSmtpForm((v) => ({ ...v, enabled: Boolean(checked) }))} />
            </div>

            <Space breakLine className="record-form__actions">
              <Button theme="primary" icon={<MailIcon />} loading={updateSmtpMutation.isPending} onClick={() => updateSmtpMutation.mutate()}>
                {t('system.smtpSave')}
              </Button>
              <Input
                value={String(smtpForm.testTo)}
                onChange={(value: any) => setSmtpForm((v) => ({ ...v, testTo: String(value) }))}
                placeholder={user?.email || t('system.smtpTestTo')}
              />
              <Button theme="success" variant="outline" loading={testSmtpMutation.isPending} onClick={() => testSmtpMutation.mutate()}>
                {t('system.smtpTest')}
              </Button>
            </Space>
          </Form>
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
