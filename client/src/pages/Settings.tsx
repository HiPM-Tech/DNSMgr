import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Lock, CheckCircle } from 'lucide-react';
import { authApi } from '../api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { useI18n } from '../contexts/I18nContext';
import { localeOptions } from '../i18n';

export function Settings() {
  const { user } = useAuth();
  const toast = useToast();
  const { locale, setLocale, t } = useI18n();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

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

  const inputClass = 'w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="max-w-lg space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('settings.profile')}</h3>
        <div className="flex items-center gap-4">
          <Avatar username={user?.username} email={user?.email} size={56} textClassName="text-xl" />
          <div>
            <p className="font-semibold text-gray-900">{user?.username}</p>
            <p className="text-sm text-gray-500">{user?.email || t('common.noEmailSet')}</p>
            <p className="text-xs text-gray-400 capitalize mt-0.5">{user?.role}</p>
          </div>
        </div>
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
    </div>
  );
}
