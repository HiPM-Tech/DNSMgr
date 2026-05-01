import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Lock, CheckCircle, Image, X } from 'lucide-react';
import { authApi } from '../api';
import type { OAuthBinding } from '../api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { roleLabelKey } from '../utils/roles';
import { Avatar } from '../components/Avatar';
import { useI18n } from '../contexts/I18nContext';
import { localeOptions } from '../i18n';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useRealtimeData } from '../hooks/useRealtimeData';

export function Settings() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const { locale, setLocale, t } = useI18n();
  
  // 实时数据：用户信息更新
  useRealtimeData({
    queryKey: ['user-profile'],
    websocketEventTypes: ['user_updated'],
    pollingInterval: 300000, // 5分钟
  });
  
  const displayName = user?.nickname || user?.username;
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [showTunnels, setShowTunnels] = useLocalStorage('showTunnels', false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [oauthProviderName, setOauthProviderName] = useState('OIDC');
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<Array<{ key: 'custom' | 'logto'; providerName: string }>>([]);
  const [selectedOauthProvider, setSelectedOauthProvider] = useState<'custom' | 'logto'>('custom');
  const [oauthBindings, setOauthBindings] = useState<OAuthBinding[]>([]);
  const [backgroundImage, setBackgroundImage] = useState('');

  useEffect(() => {
    setNickname(user?.nickname ?? '');
    setEmail(user?.email ?? '');
  }, [user?.id, user?.nickname, user?.email]);

  // 获取用户偏好设置
  const preferencesQuery = useQuery({
    queryKey: ['userPreferences'],
    queryFn: async () => {
      const res = await authApi.getPreferences();
      if (res.data.code === 0) {
        setBackgroundImage(res.data.data.backgroundImage || '');
        return res.data.data;
      }
      return null;
    },
  });

  // 更新背景图
  const updateBackgroundMutation = useMutation({
    mutationFn: (imageUrl: string) => authApi.updatePreferences({ backgroundImage: imageUrl }),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('settings.backgroundImageUpdated'));
      preferencesQuery.refetch();
    },
    onError: () => toast.error(t('settings.backgroundImageUpdateFailed')),
  });

  useEffect(() => {
    authApi.oauthStatus()
      .then((res) => {
        if (res.data.code === 0) {
          setOauthEnabled(res.data.data.enabled);
          setOauthProviderName(res.data.data.providerName || 'OIDC');
          const providers = res.data.data.providers || [];
          setOauthProviders(providers);
          if (providers.length > 0) setSelectedOauthProvider(providers[0].key);
        }
      })
      .catch(() => undefined);
  }, []);

  const loadBindings = () => {
    authApi.oauthBindings()
      .then((res) => {
        if (res.data.code === 0) {
          setOauthBindings(res.data.data || []);
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    loadBindings();
  }, []);

  const profileMutation = useMutation({
    mutationFn: () => authApi.updateProfile({ nickname: nickname.trim(), email: email.trim(), emailCode: emailCode.trim() || undefined }),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      if (res.data.data) updateUser(res.data.data);
      setEmailCode('');
      toast.success(t('settings.profileUpdated'));
    },
    onError: () => toast.error(t('settings.profileUpdateFailed')),
  });

  const sendEmailCodeMutation = useMutation({
    mutationFn: () => authApi.sendEmailVerificationCode(email.trim()),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('settings.emailCodeSent'));
    },
    onError: () => toast.error(t('settings.emailCodeSendFailed')),
  });

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(oldPassword, newPassword),
    onSuccess: (res) => {
      if (res.data.code !== 0) { setError(res.data.msg); return; }
      setSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('settings.passwordChanged'));
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: () => setError(t('settings.passwordChangeFailed')),
  });

  const bindOauthMutation = useMutation({
    mutationFn: () => authApi.oauthStartBind(selectedOauthProvider),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg || t('settings.oauthBindStartFailed'));
        return;
      }
      window.location.href = res.data.data.authUrl;
    },
    onError: () => toast.error(t('settings.oauthBindStartFailed')),
  });

  const unbindOauthMutation = useMutation({
    mutationFn: (provider: string) => authApi.unbindOAuth(provider),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg || t('settings.oauthUnbindFailed'));
        return;
      }
      toast.success(t('settings.oauthUnbound'));
      loadBindings();
    },
    onError: () => toast.error(t('settings.oauthUnbindFailed')),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError(t('settings.passwordTooShort')); return; }
    if (newPassword !== confirmPassword) { setError(t('settings.passwordMismatch')); return; }
    mutation.mutate();
  };

  const handleProfileSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (email.trim() !== (user.email || '') && !emailCode.trim()) {
      toast.error(t('settings.emailCodeRequired'));
      return;
    }
    profileMutation.mutate();
  };

  const handleSendEmailCode = () => {
    if (!email.trim()) {
      toast.error(t('settings.emailCodeRequired'));
      return;
    }
    sendEmailCodeMutation.mutate();
  };

  const inputClass = 'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const hasProfileChanges = (nickname !== (user?.nickname ?? '')) || (email !== (user?.email ?? ''));

  return (
    <div className="max-w-6xl">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings.profile')}</h3>
            <div className="flex items-center gap-4">
              <Avatar username={displayName} email={user?.email} size={56} textClassName="text-xl" />
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{displayName}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email || t('common.noEmailSet')}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t(roleLabelKey(user?.role))}</p>
              </div>
            </div>
            <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('settings.nickname')}</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder={t('settings.nicknamePlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('settings.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('settings.emailPlaceholder')}
                  className={inputClass}
                />
              </div>
              {email.trim() !== (user?.email ?? '') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('settings.emailCode')}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value)}
                      placeholder={t('settings.emailCodePlaceholder')}
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={handleSendEmailCode}
                      disabled={sendEmailCodeMutation.isPending}
                      className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm whitespace-nowrap"
                    >
                      {t('settings.sendEmailCode')}
                    </button>
                  </div>
                </div>
              )}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={profileMutation.isPending || !hasProfileChanges}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {profileMutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {t('settings.updateProfile')}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center gap-2 mb-5">
              <Lock className="w-4 h-4 text-gray-400" />
              <h3 className="text-base font-semibold text-gray-900">{t('settings.changePassword')}</h3>
            </div>

            {success && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">
                <CheckCircle className="w-4 h-4" />
                {t('settings.passwordChanged')}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('settings.currentPassword')}</label>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  required
                  placeholder={t('settings.currentPasswordPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('settings.newPassword')}</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder={t('settings.newPasswordPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('settings.confirmPassword')}</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder={t('settings.confirmPasswordPlaceholder')}
                  className={inputClass}
                />
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {mutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {t('settings.updatePassword')}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings.cloudflareTunnels')}</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{t('settings.showTunnels')}</p>
                <p className="text-sm text-gray-500">{t('settings.showTunnelsDesc')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTunnels(!showTunnels)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${
                  showTunnels ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    showTunnels ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings.language')}</h3>
            <div className="space-y-2">
              <select value={locale} onChange={(e) => setLocale(e.target.value)} className={inputClass}>
                {localeOptions.map((option) => (
                  <option key={option.code} value={option.code}>{option.label}</option>
                ))}
              </select>
              <p className="text-sm text-gray-500">{t('settings.languageHint')}</p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Image className="w-4 h-4" />
              {t('settings.backgroundImage')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('settings.backgroundImageUrl')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={backgroundImage}
                    onChange={(e) => setBackgroundImage(e.target.value)}
                    placeholder={t('settings.backgroundImagePlaceholder')}
                    className={inputClass}
                  />
                  {backgroundImage && (
                    <button
                      type="button"
                      onClick={() => setBackgroundImage('')}
                      className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-sm"
                      title={t('common.clear')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1.5">{t('settings.backgroundImageHint')}</p>
              </div>
              
              {backgroundImage && (
                <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <img
                    src={backgroundImage}
                    alt="Background preview"
                    className="w-full h-32 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f3f4f6"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12"%3EInvalid Image%3C/text%3E%3C/svg%3E';
                    }}
                  />
                </div>
              )}
              
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => updateBackgroundMutation.mutate(backgroundImage)}
                  disabled={updateBackgroundMutation.isPending || backgroundImage === (preferencesQuery.data?.backgroundImage || '')}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2"
                >
                  {updateBackgroundMutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {t('settings.updateBackgroundImage')}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('settings.oauthBindingTitle')}</h3>
            {!oauthEnabled ? (
              <p className="text-sm text-gray-500">{t('settings.oauthDisabledTip')}</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">{t('settings.oauthBindingDesc', { provider: oauthProviderName })}</p>
                {oauthProviders.length > 1 && (
                  <select
                    value={selectedOauthProvider}
                    onChange={(e) => setSelectedOauthProvider(e.target.value as 'custom' | 'logto')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    {oauthProviders.map((provider) => (
                      <option key={provider.key} value={provider.key}>{provider.providerName}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => bindOauthMutation.mutate()}
                  disabled={bindOauthMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-60"
                >
                  {t('settings.bindOauth')}
                </button>
                <div className="space-y-2">
                  {oauthBindings.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('settings.noOauthBound')}</p>
                  ) : oauthBindings.map((binding) => (
                    <div key={`${binding.provider}:${binding.subject}`} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900 dark:text-white">{binding.provider}</p>
                        <p className="text-gray-500">{binding.email || binding.subject}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => unbindOauthMutation.mutate(binding.provider)}
                        disabled={unbindOauthMutation.isPending}
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100 disabled:opacity-60"
                      >
                        {t('settings.unbindOauth')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
