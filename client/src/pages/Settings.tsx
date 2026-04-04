import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Lock, CheckCircle, Database, Globe, Clock, Package, Server } from 'lucide-react';
import { authApi, systemApi } from '../api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { roleLabelKey } from '../utils/roles';
import { Avatar } from '../components/Avatar';
import { useI18n } from '../contexts/I18nContext';
import { localeOptions } from '../i18n';

export function Settings() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const { locale, setLocale, t } = useI18n();
  const displayName = user?.nickname || user?.username;
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Fetch system info
  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const res = await systemApi.info();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setNickname(user?.nickname ?? '');
    setEmail(user?.email ?? '');
  }, [user?.id, user?.nickname, user?.email]);

  const profileMutation = useMutation({
    mutationFn: () => authApi.updateProfile({ nickname: nickname.trim(), email: email.trim() }),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      if (res.data.data) updateUser(res.data.data);
      toast.success(t('settings.profileUpdated'));
    },
    onError: () => toast.error(t('settings.profileUpdateFailed')),
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
    profileMutation.mutate();
  };

  const inputClass = 'w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const hasProfileChanges = (nickname !== (user?.nickname ?? '')) || (email !== (user?.email ?? ''));

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('settings.profile')}</h3>
        <div className="flex items-center gap-4">
          <Avatar username={displayName} email={user?.email} size={56} textClassName="text-xl" />
          <div>
            <p className="font-semibold text-gray-900">{displayName}</p>
            <p className="text-sm text-gray-500">{user?.email || t('common.noEmailSet')}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t(roleLabelKey(user?.role))}</p>
          </div>
        </div>
        <form onSubmit={handleProfileSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('settings.nickname')}</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('settings.nicknamePlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('settings.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('settings.emailPlaceholder')}
              className={inputClass}
            />
          </div>
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

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('settings.language')}</h3>
        <div className="space-y-2">
          <select value={locale} onChange={(e) => setLocale(e.target.value)} className={inputClass}>
            {localeOptions.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
          <p className="text-sm text-gray-500">{t('settings.languageHint')}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('settings.currentPassword')}</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('settings.newPassword')}</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('settings.confirmPassword')}</label>
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

      {/* About Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-5">
          <Server className="w-4 h-4 text-gray-400" />
          <h3 className="text-base font-semibold text-gray-900">{t('settings.about')}</h3>
        </div>

        <div className="space-y-4">
          {/* Version */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <Package className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-gray-600">{t('settings.version')}</span>
            </div>
            <span className="text-sm font-medium text-gray-900">{systemInfo?.version || '0.1-beta'}</span>
          </div>

          {/* Database Type */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <Database className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-600">{t('settings.databaseType')}</span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {systemInfo?.database?.type ? t(`settings.db.${systemInfo.database.type}`) : t('common.loading')}
            </span>
          </div>

          {/* Database Version */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center">
                <span className="text-[10px] text-purple-600 font-bold">V</span>
              </div>
              <span className="text-sm text-gray-600">{t('settings.databaseVersion')}</span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {systemInfo?.database?.version || t('common.loading')}
            </span>
          </div>

          {/* Driver Version */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="text-[10px] text-orange-600 font-bold">D</span>
              </div>
              <span className="text-sm text-gray-600">{t('settings.driverVersion')}</span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {systemInfo?.database?.driverVersion || t('common.loading')}
            </span>
          </div>

          {/* Timezone */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-yellow-500" />
              <span className="text-sm text-gray-600">{t('settings.timezone')}</span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {systemInfo?.timezone || t('common.loading')}
            </span>
          </div>

          {/* Current Time */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-indigo-500" />
              <span className="text-sm text-gray-600">{t('settings.currentTime')}</span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {currentTime.toLocaleString(locale)}
            </span>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 text-cyan-500" />
              <span className="text-sm text-gray-600">{t('settings.language')}</span>
            </div>
            <span className="text-sm font-medium text-gray-900">
              {localeOptions.find(opt => opt.code === locale)?.label || locale}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
