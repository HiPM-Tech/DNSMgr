
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Lock, Shield, Settings, Eye, EyeOff, Copy } from 'lucide-react';
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
    <div className="columns-1 xl:columns-2 xl:[column-gap:1.5rem]">
      <div className="contents">
        {/* JWT Secret */}
        <div className="break-inside-avoid mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Lock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.jwtSecret')}</h3>
              <p className="text-sm text-gray-500">{t('system.jwtSecretDesc')}</p>
            </div>
          </div>
          <div className="flex gap-2 mb-3">
            <input
              type="password"
              value={jwtPassword}
              onChange={(e) => setJwtPassword(e.target.value)}
              placeholder={t('system.jwtPasswordPlaceholder')}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              onClick={() => setShowJwtSecret((v) => !v)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              title={showJwtSecret ? t('system.hideJwtSecret') : t('system.showJwtSecret')}
            >
              {showJwtSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={handleCopyJwtSecret}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              title={t('system.copyJwtSecret')}
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* OAuth2 / OIDC Config */}
        <div className="break-inside-avoid mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-3">
          <div className="mb-4 flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Shield className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.oauthConfig')}</h3>
              <p className="text-sm text-gray-500">{t('system.oauthConfigDesc')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={oauthForm.template} onChange={(e) => setOauthForm((v) => ({ ...v, template: e.target.value as 'generic' | 'logto' }))} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500">
              <option value="generic">{t('system.oauthTemplateGeneric')}</option>
              <option value="logto">{t('system.oauthTemplateLogto')}</option>
            </select>
            <input value={oauthForm.providerName} onChange={(e) => setOauthForm((v) => ({ ...v, providerName: e.target.value }))} placeholder={t('system.oauthProvider')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            {oauthForm.template === 'logto' && (
              <input value={oauthForm.logtoDomain} onChange={(e) => setOauthForm((v) => ({ ...v, logtoDomain: e.target.value }))} placeholder={t('system.oauthLogtoDomain')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            )}
            <input value={oauthForm.issuer} onChange={(e) => setOauthForm((v) => ({ ...v, issuer: e.target.value }))} placeholder={t('system.oauthIssuer')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={oauthForm.subjectKey} onChange={(e) => setOauthForm((v) => ({ ...v, subjectKey: e.target.value }))} placeholder={t('system.oauthSubjectKey')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={oauthForm.emailKey} onChange={(e) => setOauthForm((v) => ({ ...v, emailKey: e.target.value }))} placeholder={t('system.oauthEmailKey')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={oauthForm.clientId} onChange={(e) => setOauthForm((v) => ({ ...v, clientId: e.target.value }))} placeholder={t('system.oauthClientId')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input type="password" value={oauthForm.clientSecret} onChange={(e) => setOauthForm((v) => ({ ...v, clientSecret: e.target.value }))} placeholder={t('system.oauthClientSecret')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={oauthForm.authorizationEndpoint} onChange={(e) => setOauthForm((v) => ({ ...v, authorizationEndpoint: e.target.value }))} placeholder={t('system.oauthAuthEndpoint')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={oauthForm.tokenEndpoint} onChange={(e) => setOauthForm((v) => ({ ...v, tokenEndpoint: e.target.value }))} placeholder={t('system.oauthTokenEndpoint')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={oauthForm.userInfoEndpoint} onChange={(e) => setOauthForm((v) => ({ ...v, userInfoEndpoint: e.target.value }))} placeholder={t('system.oauthUserInfoEndpoint')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={oauthForm.jwksUri} onChange={(e) => setOauthForm((v) => ({ ...v, jwksUri: e.target.value }))} placeholder={t('system.oauthJwksUri')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={oauthForm.scopes} onChange={(e) => setOauthForm((v) => ({ ...v, scopes: e.target.value }))} placeholder={t('system.oauthScopes')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center overflow-hidden">
              <span className="truncate" title={`${window.location.origin}/oauth/callback`}>
                {t('system.oauthRedirectUri')}: {window.location.origin}/oauth/callback
              </span>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={oauthForm.enabled} onChange={(e) => setOauthForm((v) => ({ ...v, enabled: e.target.checked }))} />
            {t('system.oauthEnabled')}
          </label>
          <div className="flex gap-2">
            <button onClick={() => discoverOidcMutation.mutate()} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg">{t('system.oidcAutoDiscover')}</button>
            <button onClick={() => updateOauthMutation.mutate()} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">{t('system.oauthSave')}</button>
          </div>
        </div>

        {/* Logto OAuth Config */}
        <div className="break-inside-avoid mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-3">
          <div className="mb-4 flex items-center gap-3">
            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <Settings className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.oauthLogtoConfig')}</h3>
              <p className="text-sm text-gray-500">{t('system.oauthLogtoConfigDesc')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center">
              <span className="font-medium">Logto</span>
              <span className="text-xs text-gray-500 ml-2">({t('system.oauthProviderFixed')})</span>
            </div>
            <input value={logtoForm.logtoDomain} onChange={(e) => setLogtoForm((v) => ({ ...v, logtoDomain: e.target.value }))} placeholder={t('system.oauthLogtoDomain')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={logtoForm.clientId} onChange={(e) => setLogtoForm((v) => ({ ...v, clientId: e.target.value }))} placeholder={t('system.oauthClientId')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input type="password" value={logtoForm.clientSecret} onChange={(e) => setLogtoForm((v) => ({ ...v, clientSecret: e.target.value }))} placeholder={t('system.oauthClientSecret')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <input value={logtoForm.scopes} onChange={(e) => setLogtoForm((v) => ({ ...v, scopes: e.target.value }))} placeholder={t('system.oauthScopes')} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
            <div className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 flex items-center overflow-hidden">
              <span className="truncate" title={`${window.location.origin}/oauth/callback`}>
                {t('system.oauthRedirectUri')}: {window.location.origin}/oauth/callback
              </span>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" checked={logtoForm.enabled} onChange={(e) => setLogtoForm((v) => ({ ...v, enabled: e.target.checked }))} />
            {t('system.oauthEnabled')}
          </label>
          <div className="flex gap-2">
            <button onClick={() => updateLogtoOauthMutation.mutate()} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg">{t('system.oauthSave')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
