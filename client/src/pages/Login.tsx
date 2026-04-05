import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { authApi, initApi } from '../api';
import { useToast } from '../hooks/useToast';
import { startAuthentication } from '@simplewebauthn/browser';

export function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<Array<{ key: 'custom' | 'logto'; providerName: string }>>([]);
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    // Check if system needs initialization
    initApi.status()
      .then((res) => {
        if (!res.data.data.initialized) {
          navigate('/setup');
        }
      })
      .catch(() => {
        // If we can't check status, continue to login
      })
      .finally(() => {
        setChecking(false);
      });
  }, [navigate]);

  useEffect(() => {
    authApi.oauthStatus()
      .then((res) => {
        if (res.data.code === 0 && res.data.data.enabled) {
          setOauthEnabled(true);
          setOauthProviders(res.data.data.providers || []);
        } else {
          setOauthEnabled(false);
          setOauthProviders([]);
        }
      })
      .catch(() => setOauthEnabled(false));
  }, []);

  const [require2FA, setRequire2FA] = useState(false);
  const [supported2FATypes, setSupported2FATypes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError(t('login.required')); return; }
    if (require2FA && !useBackupCode && !totpCode) { setError('TOTP code is required'); return; }
    if (require2FA && useBackupCode && !backupCode) { setError('Backup code is required'); return; }

    setError('');
    setLoading(true);
    try {
      await login(username, password, require2FA && !useBackupCode ? totpCode : undefined, require2FA && useBackupCode ? backupCode : undefined);
      navigate('/');
    } catch (err: any) {
      if (err.message === '2FA_REQUIRED') {
        setRequire2FA(true);
        setSupported2FATypes(err.types || ['totp']);
        setError('');
      } else {
        setError(err.message || t('login.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const optsRes = await authApi.webauthnLoginOptions(username);
      if (optsRes.data.code !== 0) throw new Error(optsRes.data.msg);
      
      const attResp = await startAuthentication(optsRes.data.data);
      await login(username, password, undefined, undefined, attResp);
      navigate('/');
    } catch (e: any) {
      setError(e.message || t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  const sendResetCode = async () => {
    if (!resetEmail.trim()) {
      toast.error(t('login.resetEmailRequired'));
      return;
    }
    setResetLoading(true);
    try {
      const res = await authApi.requestPasswordReset(resetEmail.trim());
      if (res.data.code !== 0) {
        toast.error(res.data.msg || t('login.resetRequestFailed'));
        return;
      }
      toast.success(t('login.resetCodeSent'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('login.resetRequestFailed'));
    } finally {
      setResetLoading(false);
    }
  };

  const confirmReset = async () => {
    if (!resetEmail.trim() || !resetCode.trim() || !resetNewPassword.trim()) {
      toast.error(t('login.resetFieldsRequired'));
      return;
    }
    setResetLoading(true);
    try {
      const res = await authApi.confirmPasswordReset(resetEmail.trim(), resetCode.trim(), resetNewPassword);
      if (res.data.code !== 0) {
        toast.error(res.data.msg || t('login.resetConfirmFailed'));
        return;
      }
      toast.success(t('login.resetPasswordSuccess'));
      setShowReset(false);
      setResetCode('');
      setResetNewPassword('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('login.resetConfirmFailed'));
    } finally {
      setResetLoading(false);
    }
  };

  const startOauthLogin = async (provider?: 'custom' | 'logto') => {
    setOauthLoading(true);
    setError('');
    try {
      const res = await authApi.oauthStart(provider);
      if (res.data.code !== 0) {
        setError(res.data.msg || t('login.oauthFailed'));
        return;
      }
      window.location.href = res.data.data.authUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('login.oauthFailed'));
      setOauthLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-blue-600 rounded-xl mb-3">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">DNSMgr</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          {!require2FA ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('login.usernameOrEmail')}</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('login.usernameOrEmailPlaceholder')}
                  autoComplete="username"
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('login.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.passwordPlaceholder')}
                  autoComplete="current-password"
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </>
          ) : (
            <>
              <div className="text-center text-sm text-gray-600 dark:text-gray-400 mb-2">
                {t('login.verify2FA')}
              </div>
              
              {supported2FATypes.includes('webauthn') && (
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={loading}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mb-4"
                >
                  {t('passkeys.usePasskey')}
                </button>
              )}

              {supported2FATypes.includes('webauthn') && supported2FATypes.includes('totp') && (
                <div className="relative mb-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white dark:bg-gray-900 text-gray-500">OR</span>
                  </div>
                </div>
              )}

              {supported2FATypes.includes('totp') && (
                  <>
                    {!useBackupCode ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('login.authCode')}</label>
                        <input
                          type="text"
                          value={totpCode}
                          onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder={t('login.enterAuthCode')}
                          autoComplete="one-time-code"
                          className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-center tracking-widest text-lg"
                          maxLength={6}
                        />
                        <button type="button" onClick={() => setUseBackupCode(true)} className="mt-2 text-sm text-blue-600 hover:text-blue-700 w-full text-center">{t('login.useBackupCode')}</button>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('login.backupCode')}</label>
                        <input
                          type="text"
                          value={backupCode}
                          onChange={(e) => setBackupCode(e.target.value)}
                          placeholder={t('login.enterBackupCode')}
                          className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-center tracking-widest text-lg"
                        />
                        <button type="button" onClick={() => setUseBackupCode(false)} className="mt-2 text-sm text-blue-600 hover:text-blue-700 w-full text-center">{t('login.useAuthCode')}</button>
                      </div>
                    )}
                  </>
                )}
            </>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {t('login.signIn')}
          </button>
          {oauthEnabled && (
            <div className="space-y-2 mt-2">
              {oauthProviders.map((provider) => (
                <button
                  key={provider.key}
                  type="button"
                  onClick={() => startOauthLogin(provider.key)}
                  disabled={oauthLoading}
                  className="w-full py-2.5 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {oauthLoading && <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />}
                  {t('login.oauthSignIn', { provider: provider.providerName })}
                </button>
              ))}
            </div>
          )}
        </form>
        <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
          <button
            type="button"
            onClick={() => setShowReset((v) => !v)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            {t('login.forgotPassword')}
          </button>
          {showReset && (
            <div className="mt-3 space-y-2">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder={t('login.resetEmailPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder={t('login.resetCodePlaceholder')}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800"
                />
                <button type="button" onClick={sendResetCode} disabled={resetLoading} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded-lg text-sm">
                  {t('login.sendResetCode')}
                </button>
              </div>
              <input
                type="password"
                value={resetNewPassword}
                onChange={(e) => setResetNewPassword(e.target.value)}
                placeholder={t('login.resetNewPasswordPlaceholder')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800"
              />
              <button type="button" onClick={confirmReset} disabled={resetLoading} className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">
                {t('login.resetPassword')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
