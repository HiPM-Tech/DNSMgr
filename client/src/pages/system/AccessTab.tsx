import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button, Card, Form, Input, Select, Space, Switch } from 'tdesign-react';
import { BrowseIcon, BrowseOffIcon, CopyIcon, LockOnIcon, SecuredIcon, SettingIcon } from 'tdesign-icons-react';
import { settingsApi } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';

export function AccessTab() {
  const { t } = useI18n();
  const toast = useToast();

  const [showJwtSecret, setShowJwtSecret] = useState(false);
  const [jwtPassword, setJwtPassword] = useState('');
  const [jwtSecretValue, setJwtSecretValue] = useState('');

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

  const { data: logtoConfig } = useQuery({
    queryKey: ['oauth-logto-config'],
    queryFn: async () => {
      const res = await settingsApi.getLogtoOAuthConfig();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const { data: oauthConfigData } = useQuery({
    queryKey: ['oauth-config'],
    queryFn: async () => {
      const res = await settingsApi.getOAuthConfig();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  useEffect(() => {
    if (logtoConfig) {
      setLogtoForm({
        enabled: Boolean(logtoConfig.enabled),
        template: String(logtoConfig.template ?? 'logto') as 'generic' | 'logto',
        providerName: String(logtoConfig.providerName ?? 'Logto'),
        subjectKey: String(logtoConfig.subjectKey ?? 'sub'),
        emailKey: String(logtoConfig.emailKey ?? 'email'),
        logtoDomain: String(logtoConfig.logtoDomain ?? ''),
        clientId: String(logtoConfig.clientId ?? ''),
        clientSecret: String(logtoConfig.clientSecret ?? ''),
        issuer: String(logtoConfig.issuer ?? ''),
        authorizationEndpoint: String(logtoConfig.authorizationEndpoint ?? ''),
        tokenEndpoint: String(logtoConfig.tokenEndpoint ?? ''),
        userInfoEndpoint: String(logtoConfig.userInfoEndpoint ?? ''),
        jwksUri: String(logtoConfig.jwksUri ?? ''),
        scopes: String(logtoConfig.scopes ?? 'openid profile email'),
        redirectUri: String(logtoConfig.redirectUri ?? ''),
      });
    }
  }, [logtoConfig]);

  useEffect(() => {
    if (oauthConfigData) {
      setOauthForm({
        enabled: Boolean(oauthConfigData.enabled),
        template: String(oauthConfigData.template ?? 'generic') as 'generic' | 'logto',
        providerName: String(oauthConfigData.providerName ?? 'default'),
        subjectKey: String(oauthConfigData.subjectKey ?? 'sub'),
        emailKey: String(oauthConfigData.emailKey ?? 'email'),
        logtoDomain: String(oauthConfigData.logtoDomain ?? ''),
        clientId: String(oauthConfigData.clientId ?? ''),
        clientSecret: String(oauthConfigData.clientSecret ?? ''),
        issuer: String(oauthConfigData.issuer ?? ''),
        authorizationEndpoint: String(oauthConfigData.authorizationEndpoint ?? ''),
        tokenEndpoint: String(oauthConfigData.tokenEndpoint ?? ''),
        userInfoEndpoint: String(oauthConfigData.userInfoEndpoint ?? ''),
        jwksUri: String(oauthConfigData.jwksUri ?? ''),
        scopes: String(oauthConfigData.scopes ?? 'openid profile email'),
        redirectUri: String(oauthConfigData.redirectUri ?? ''),
      });
    }
  }, [oauthConfigData]);

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
    onError: (error: Error) => toast.error(error.message || t('system.jwtSecretVerifyFailed')),
  });

  const updateOauthMutation = useMutation({
    mutationFn: () => settingsApi.updateOAuthConfig({
      ...oauthForm,
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

  const handleVerifyAndRevealJwtSecret = () => {
    if (!jwtPassword.trim()) {
      toast.error(t('system.jwtPasswordRequired'));
      return;
    }
    revealJwtSecretMutation.mutate(jwtPassword.trim());
  };

  const handleCopyJwtSecret = async () => {
    if (!jwtSecretValue) {
      toast.error(t('system.jwtSecretEmpty'));
      return;
    }
    try {
      await navigator.clipboard.writeText(jwtSecretValue);
      toast.success(t('system.jwtSecretCopied'));
    } catch {
      toast.error(t('system.jwtSecretCopyFailed'));
    }
  };

  const redirectUri = `${window.location.origin}/oauth/callback`;
  const setOauthField = (key: keyof typeof oauthForm, value: string | boolean) => setOauthForm((form) => ({ ...form, [key]: value }));
  const setLogtoField = (key: keyof typeof logtoForm, value: string | boolean) => setLogtoForm((form) => ({ ...form, [key]: value }));

  return (
    <div className="access-grid">
      <Card bordered={false} shadow={false} title={<Space align="center"><LockOnIcon />{t('system.jwtSecret')}</Space>} subtitle={t('system.jwtSecretDesc')}>
        <div className="page-shell">
          <Space>
            <Input
              type="password"
              value={jwtPassword}
              onChange={(value: any) => setJwtPassword(String(value))}
              placeholder={t('system.jwtPasswordPlaceholder')}
            />
            <Button theme="primary" loading={revealJwtSecretMutation.isPending} onClick={handleVerifyAndRevealJwtSecret}>
              {t('system.verifyAndViewJwt')}
            </Button>
          </Space>
          <Space>
            <Input type={showJwtSecret ? 'text' : 'password'} readonly value={jwtSecretValue} />
            <Button
              shape="square"
              variant="outline"
              icon={showJwtSecret ? <BrowseOffIcon /> : <BrowseIcon />}
              title={showJwtSecret ? t('system.hideJwtSecret') : t('system.showJwtSecret')}
              onClick={() => setShowJwtSecret((value) => !value)}
            />
            <Button shape="square" variant="outline" icon={<CopyIcon />} title={t('system.copyJwtSecret')} onClick={handleCopyJwtSecret} />
          </Space>
        </div>
      </Card>

      <Card bordered={false} shadow={false} title={<Space align="center"><SecuredIcon />{t('system.oauthConfig')}</Space>} subtitle={t('system.oauthConfigDesc')}>
        <Form layout="vertical" colon={false} requiredMark={false} className="page-shell">
          <div className="access-form-grid">
            <Form.FormItem label={t('system.oauthTemplateGeneric')}>
              <Select
                value={oauthForm.template}
                options={[
                  { label: t('system.oauthTemplateGeneric'), value: 'generic' },
                  { label: t('system.oauthTemplateLogto'), value: 'logto' },
                ]}
                onChange={(value: any) => setOauthField('template', String(Array.isArray(value) ? value[0] : value) as 'generic' | 'logto')}
              />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthProvider')}>
              <Input value={String(oauthForm.providerName)} onChange={(value: any) => setOauthField('providerName', String(value))} />
            </Form.FormItem>
            {oauthForm.template === 'logto' && (
              <Form.FormItem label={t('system.oauthLogtoDomain')}>
                <Input value={String(oauthForm.logtoDomain)} onChange={(value: any) => setOauthField('logtoDomain', String(value))} />
              </Form.FormItem>
            )}
            <Form.FormItem label={t('system.oauthIssuer')}>
              <Input value={String(oauthForm.issuer)} onChange={(value: any) => setOauthField('issuer', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthSubjectKey')}>
              <Input value={String(oauthForm.subjectKey)} onChange={(value: any) => setOauthField('subjectKey', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthEmailKey')}>
              <Input value={String(oauthForm.emailKey)} onChange={(value: any) => setOauthField('emailKey', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthClientId')}>
              <Input value={String(oauthForm.clientId)} onChange={(value: any) => setOauthField('clientId', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthClientSecret')}>
              <Input type="password" value={String(oauthForm.clientSecret)} onChange={(value: any) => setOauthField('clientSecret', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthAuthEndpoint')}>
              <Input value={String(oauthForm.authorizationEndpoint)} onChange={(value: any) => setOauthField('authorizationEndpoint', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthTokenEndpoint')}>
              <Input value={String(oauthForm.tokenEndpoint)} onChange={(value: any) => setOauthField('tokenEndpoint', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthUserInfoEndpoint')}>
              <Input value={String(oauthForm.userInfoEndpoint)} onChange={(value: any) => setOauthField('userInfoEndpoint', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthJwksUri')}>
              <Input value={String(oauthForm.jwksUri)} onChange={(value: any) => setOauthField('jwksUri', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthScopes')}>
              <Input value={String(oauthForm.scopes)} onChange={(value: any) => setOauthField('scopes', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthRedirectUri')}>
              <Input readonly value={redirectUri} />
            </Form.FormItem>
          </div>
          <Form.FormItem label={t('system.oauthEnabled')}>
            <Switch value={oauthForm.enabled} onChange={(checked: any) => setOauthField('enabled', Boolean(checked))} />
          </Form.FormItem>
          <Space className="record-form__actions">
            <Button variant="outline" loading={discoverOidcMutation.isPending} onClick={() => discoverOidcMutation.mutate()}>
              {t('system.oidcAutoDiscover')}
            </Button>
            <Button theme="primary" loading={updateOauthMutation.isPending} onClick={() => updateOauthMutation.mutate()}>
              {t('system.oauthSave')}
            </Button>
          </Space>
        </Form>
      </Card>

      <Card bordered={false} shadow={false} title={<Space align="center"><SettingIcon />{t('system.oauthLogtoConfig')}</Space>} subtitle={t('system.oauthLogtoConfigDesc')}>
        <Form layout="vertical" colon={false} requiredMark={false} className="page-shell">
          <div className="access-form-grid">
            <Form.FormItem label={t('system.oauthProvider')}>
              <Input readonly value={`Logto (${t('system.oauthProviderFixed')})`} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthLogtoDomain')}>
              <Input value={String(logtoForm.logtoDomain)} onChange={(value: any) => setLogtoField('logtoDomain', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthClientId')}>
              <Input value={String(logtoForm.clientId)} onChange={(value: any) => setLogtoField('clientId', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthClientSecret')}>
              <Input type="password" value={String(logtoForm.clientSecret)} onChange={(value: any) => setLogtoField('clientSecret', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthScopes')}>
              <Input value={String(logtoForm.scopes)} onChange={(value: any) => setLogtoField('scopes', String(value))} />
            </Form.FormItem>
            <Form.FormItem label={t('system.oauthRedirectUri')}>
              <Input readonly value={redirectUri} />
            </Form.FormItem>
          </div>
          <Form.FormItem label={t('system.oauthEnabled')}>
            <Switch value={logtoForm.enabled} onChange={(checked: any) => setLogtoField('enabled', Boolean(checked))} />
          </Form.FormItem>
          <Space className="record-form__actions">
            <Button theme="primary" loading={updateLogtoOauthMutation.isPending} onClick={() => updateLogtoOauthMutation.mutate()}>
              {t('system.oauthSave')}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
