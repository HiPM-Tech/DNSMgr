const fs = require('fs');

let file = fs.readFileSync('client/src/pages/System.tsx', 'utf8');

// We just extract the Security tab and all its necessary hooks.
let newFile = `
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Shield, AlertTriangle, XCircle, Lock, Unlock, Users, Eye, EyeOff, Copy, Server } from 'lucide-react';
import { settingsApi } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';

export function SecurityTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

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
  const [domainExpiryNotifyEnabled, setDomainExpiryNotifyEnabled] = useState(false);
  const [domainExpiryDays, setDomainExpiryDays] = useState(30);
  
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
        setDomainExpiryNotifyEnabled(!!res.data.data.domainExpiryNotify);
        setDomainExpiryDays(res.data.data.domainExpiryDays || 30);
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

  const updateSecurityMutation = useMutation({
    mutationFn: (data: Partial<{ jwtViewEmailNotify: boolean, domainExpiryNotify: boolean, domainExpiryDays: number }>) => settingsApi.updateSecurityConfig(data),
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

  return (
`;

const securityStartStr = "{/* Security Tab */}";
const securityStartIndex = file.indexOf(securityStartStr);
const securityBlock = file.substring(securityStartIndex);

// find the `columns-1 xl:columns-3 xl:[column-gap:1.5rem]` block inside securityBlock
const match = securityBlock.match(/<div className="columns-1 xl:columns-3 xl:\[column-gap:1\.5rem\]">[\s\S]*?(?=      \{\/\* Notifications Tab \*\/)/);
if (match) {
  newFile += "    " + match[0].trim() + "\n  );\n}\n";
  fs.writeFileSync('client/src/pages/system/SecurityTab.tsx', newFile);
  console.log("Created SecurityTab.tsx");
} else {
  console.log("Could not extract SecurityTab JSX.");
}
