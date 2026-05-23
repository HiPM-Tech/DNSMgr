import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Dialog, Divider, Form, Input, Loading, Space } from 'tdesign-react';
import {
  FingerprintIcon,
  KeyIcon,
  LockOnIcon,
  MailIcon,
  SecuredIcon,
  UserIcon,
} from 'tdesign-icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { authApi, initApi } from '../api';
import type { WebAuthnResponse } from '../api';
import { useToast } from '../hooks/useToast';
import { startAuthentication } from '@simplewebauthn/browser';
import { encryptPassword } from '../utils/rsaEncrypt';
import './Login.css';

type ApiErrorPayload = {
  msg?: string;
  message?: string;
};

function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: ApiErrorPayload } }).response;
    const message = response?.data?.msg ?? response?.data?.message;
    if (message) return message;
  }

  return error instanceof Error ? error.message : fallback;
}

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
  const [require2FA, setRequire2FA] = useState(false);
  const [supported2FATypes, setSupported2FATypes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');

  useEffect(() => {
    initApi.status()
      .then((res) => {
        if (!res.data.data.initialized) {
          navigate('/setup');
        }
      })
      .catch(() => {
        // If status cannot be checked, keep the login page available.
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
      .catch(() => {
        setOauthEnabled(false);
        setOauthProviders([]);
      });
  }, []);

  const submitLogin = async () => {
    if (!username || !password) {
      setError(t('login.required'));
      return;
    }
    if (require2FA && !useBackupCode && !totpCode) {
      setError(t('login.authCodeRequired'));
      return;
    }
    if (require2FA && useBackupCode && !backupCode) {
      setError(t('login.backupCodeRequired'));
      return;
    }

    setError('');
    setLoading(true);
    try {
      // Encrypt password before sending
      let passwordToSend: string;
      try {
        passwordToSend = await encryptPassword(password);
      } catch (encryptError) {
        console.warn('Password encryption failed, falling back to plain text:', encryptError);
        passwordToSend = password; // Fallback to plain text if encryption fails
      }
      
      await login(
        username,
        passwordToSend,
        require2FA && !useBackupCode ? totpCode : undefined,
        require2FA && useBackupCode ? backupCode : undefined,
        undefined,
        true, // encrypted flag
      );
      navigate('/dash');
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startAuthentication({ optionsJSON: optsRes.data.data.options as any });
      
      // Encrypt password for WebAuthn login too
      let passwordToSend: string;
      try {
        passwordToSend = await encryptPassword(password);
      } catch (encryptError) {
        console.warn('Password encryption failed, falling back to plain text:', encryptError);
        passwordToSend = password;
      }
      
      await login(username, passwordToSend, undefined, undefined, attResp as unknown as WebAuthnResponse, true);
      navigate('/dash');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('login.failed'));
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
      // Encrypt password before sending
      let encryptedPassword: string;
      try {
        encryptedPassword = await encryptPassword(resetNewPassword);
      } catch (encryptError) {
        console.warn('Password encryption failed, falling back to plain text:', encryptError);
        encryptedPassword = resetNewPassword;
      }
      
      const res = await authApi.confirmPasswordReset(resetEmail.trim(), resetCode.trim(), encryptedPassword, true);
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
    setError('');
    const isProviderReady = oauthEnabled && (
      provider ? oauthProviders.some((item) => item.key === provider) : oauthProviders.length > 0
    );

    if (!isProviderReady) {
      setError(provider === 'logto' ? t('login.logtoUnavailable') : t('login.oauthUnavailable'));
      return;
    }

    setOauthLoading(true);
    try {
      const res = await authApi.oauthStart(provider);
      if (res.data.code !== 0) {
        setError(res.data.msg || t('login.oauthFailed'));
        return;
      }
      window.location.href = res.data.data.authUrl;
    } catch (e) {
      setError(getApiErrorMessage(e, t('login.oauthFailed')));
    } finally {
      setOauthLoading(false);
    }
  };

  if (checking) {
    return (
      <main className="login-page login-page--checking">
        <Loading loading size="large" text={t('common.loading')} />
      </main>
    );
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-identity" aria-label="HiDNS">
          <div className="login-brand">
            <span className="login-brand__mark">
              <img src="/favicon.ico" alt="" />
            </span>
            <div>
              <strong>HiDNS</strong>
              <span>{t('login.subtitle')}</span>
            </div>
          </div>

          <div className="login-identity__copy">
            <h1>{t('login.consoleTitle')}</h1>
            <p>{t('login.consoleSubtitle')}</p>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-panel__heading">
            <h2 id="login-title">{require2FA ? t('login.verify2FA') : t('login.title')}</h2>
            <p>{require2FA ? t('login.twoFactorHint') : t('login.accountHint')}</p>
          </div>

          <Form
            className="login-form"
            layout="vertical"
            labelAlign="top"
            labelWidth={0}
            requiredMark={false}
            onSubmit={() => {
              void submitLogin();
            }}
          >
            <Space direction="vertical" size={18} className="login-form__stack">
              {error && <Alert theme="error" message={error} />}

              {!require2FA ? (
                <>
                  <Form.FormItem label={t('login.usernameOrEmail')}>
                    <Input
                      size="large"
                      clearable
                      value={username}
                      onChange={(value) => setUsername(value)}
                      placeholder={t('login.usernameOrEmailPlaceholder')}
                      autocomplete="username"
                      prefixIcon={<UserIcon />}
                    />
                  </Form.FormItem>

                  <Form.FormItem label={t('login.password')}>
                    <Input
                      size="large"
                      type="password"
                      clearable
                      value={password}
                      onChange={(value) => setPassword(value)}
                      placeholder={t('login.passwordPlaceholder')}
                      autocomplete="current-password"
                      prefixIcon={<LockOnIcon />}
                    />
                  </Form.FormItem>
                </>
              ) : (
                <div className="login-two-factor">
                  {supported2FATypes.includes('webauthn') && (
                    <Button
                      type="button"
                      theme="success"
                      variant="outline"
                      size="large"
                      block
                      icon={<FingerprintIcon />}
                      loading={loading}
                      onClick={handlePasskeyLogin}
                    >
                      {t('passkeys.usePasskey')}
                    </Button>
                  )}

                  {supported2FATypes.includes('webauthn') && supported2FATypes.includes('totp') && (
                    <Divider>OR</Divider>
                  )}

                  {supported2FATypes.includes('totp') && (
                    <>
                      {!useBackupCode ? (
                        <Form.FormItem label={t('login.authCode')}>
                          <Input
                            size="large"
                            align="center"
                            value={totpCode}
                            onChange={(value) => setTotpCode(value.replace(/\D/g, ''))}
                            placeholder={t('login.enterAuthCode')}
                            autocomplete="one-time-code"
                            maxlength={6}
                            prefixIcon={<KeyIcon />}
                            inputClass="login-code-input"
                          />
                          <Button
                            type="button"
                            variant="text"
                            theme="primary"
                            className="login-switch-code"
                            onClick={() => setUseBackupCode(true)}
                          >
                            {t('login.useBackupCode')}
                          </Button>
                        </Form.FormItem>
                      ) : (
                        <Form.FormItem label={t('login.backupCode')}>
                          <Input
                            size="large"
                            align="center"
                            value={backupCode}
                            onChange={(value) => setBackupCode(value)}
                            placeholder={t('login.enterBackupCode')}
                            prefixIcon={<KeyIcon />}
                            inputClass="login-code-input"
                          />
                          <Button
                            type="button"
                            variant="text"
                            theme="primary"
                            className="login-switch-code"
                            onClick={() => setUseBackupCode(false)}
                          >
                            {t('login.useAuthCode')}
                          </Button>
                        </Form.FormItem>
                      )}
                    </>
                  )}
                </div>
              )}

              <Button type="submit" theme="primary" size="large" block loading={loading}>
                {t('login.signIn')}
              </Button>
            </Space>
          </Form>

          <div className="login-panel__footer">
            <Button type="button" variant="text" theme="primary" className="login-footer-action" onClick={() => setShowReset(true)}>
              {t('login.forgotPassword')}
            </Button>
            
            {/* 动态显示 Logto 登录（仅当后端配置了 Logto） */}
            {oauthEnabled && oauthProviders.some((provider) => provider.key === 'logto') && (
              <Button
                type="button"
                variant="text"
                theme="primary"
                className="login-footer-action"
                disabled={oauthLoading}
                onClick={() => startOauthLogin('logto')}
              >
                <SecuredIcon />
                <span>{t('login.logtoSignIn')}</span>
              </Button>
            )}
          </div>

          {/* 动态显示其他 OAuth 提供商 */}
          {oauthEnabled && oauthProviders.some((provider) => provider.key !== 'logto') && (
            <div className="login-external-providers" aria-label="OAuth">
              {oauthProviders.filter((provider) => provider.key !== 'logto').map((provider) => (
                <Button
                  key={provider.key}
                  type="button"
                  variant="text"
                  theme="primary"
                  className="login-footer-action"
                  disabled={oauthLoading}
                  onClick={() => startOauthLogin(provider.key)}
                >
                  {t('login.oauthSignIn', { provider: provider.providerName })}
                </Button>
              ))}
            </div>
          )}
        </section>
      </div>

      <Dialog
        visible={showReset}
        header={t('login.resetPassword')}
        width={460}
        placement="center"
        dialogClassName="app-td-dialog app-login-dialog"
        confirmBtn={{ content: t('login.resetPassword'), theme: 'primary' }}
        cancelBtn={t('common.cancel')}
        confirmLoading={resetLoading}
        onClose={() => setShowReset(false)}
        onCancel={() => setShowReset(false)}
        onConfirm={() => {
          void confirmReset();
        }}
      >
        <Space direction="vertical" size={16} className="login-reset-dialog">
          <Input
            size="large"
            type="text"
            value={resetEmail}
            onChange={(value) => setResetEmail(value)}
            placeholder={t('login.resetEmailPlaceholder')}
            autocomplete="email"
            prefixIcon={<MailIcon />}
          />
          <div className="login-reset-code-row">
            <Input
              size="large"
              value={resetCode}
              onChange={(value) => setResetCode(value)}
              placeholder={t('login.resetCodePlaceholder')}
            />
            <Button
              type="button"
              size="large"
              variant="outline"
              loading={resetLoading}
              className="login-reset-code-button"
              onClick={sendResetCode}
            >
              {t('login.sendResetCode')}
            </Button>
          </div>
          <Input
            size="large"
            type="password"
            value={resetNewPassword}
            onChange={(value) => setResetNewPassword(value)}
            placeholder={t('login.resetNewPasswordPlaceholder')}
            autocomplete="new-password"
            prefixIcon={<LockOnIcon />}
          />
        </Space>
      </Dialog>
    </main>
  );
}
