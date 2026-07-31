import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import svgPaths from '../utils/loginSvgPaths';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { authApi } from '../api';
import type { WebAuthnResponse } from '../api';
import { useToast } from '../hooks/useToast';
import { startAuthentication } from '@simplewebauthn/browser';
import { encryptPassword } from '../utils/rsaEncrypt';
import { Dropdown } from 'tdesign-react';
import type { DropdownOption } from 'tdesign-react';
import { CheckIcon, TranslateIcon } from 'tdesign-icons-react';
import { localeOptions } from '../i18n';
import { Modal } from '../components/Modal';
import './Login.css';

const SYS = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

type ApiErrorPayload = { msg?: string; message?: string };
function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: ApiErrorPayload } }).response;
    const message = response?.data?.msg ?? response?.data?.message;
    if (message) return message;
  }
  return fallback;
}

function getUserFriendlyError(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: ApiErrorPayload } }).response;
    const message = response?.data?.msg ?? response?.data?.message;
    if (message && message.length < 200) return message;
  }
  return fallback;
}

/**
 * Try RSA-encrypt the password.
 * On HTTPS: encryption failure is fatal (password must not be sent in plaintext).
 * On HTTP: encryption failure triggers a confirmation dialog; if the user
 *          confirms, the plaintext password is returned so login can proceed
 *          over plain HTTP (the server must still accept it).
 */
async function encryptWithFallback(
  password: string,
  confirmFn: () => Promise<boolean>,
  encryptionFailed: string,
): Promise<{ encrypted: string; plaintext: boolean }> {
  try {
    const encrypted = await encryptPassword(password);
    return { encrypted, plaintext: false };
  } catch {
    if (window.location.protocol === 'https:') {
      throw new Error(encryptionFailed);
    }
    const confirmed = await confirmFn();
    if (!confirmed) throw new Error(encryptionFailed);
    return { encrypted: password, plaintext: true };
  }
}

/* ─── SVG icons ──────────────────────────────────────────────────────────── */
function GlobePurple() {
  return (
    <div className="lc-icon-24">
      <div className="lc-icon-inset">
        <svg width="100%" height="100%" viewBox="0 0 20 20" fill="none" preserveAspectRatio="none">
          <path d={svgPaths.pdb50800} fill="#8533FF" />
        </svg>
      </div>
    </div>
  );
}

function ArrowForward() {
  return (
    <div className="lc-icon-22">
      <div className="lc-icon-inset">
        <svg width="100%" height="100%" viewBox="0 0 14.6667 14.6667" fill="none" preserveAspectRatio="none">
          <path d={svgPaths.p1640b480} fill="#FFF6F6" />
        </svg>
      </div>
    </div>
  );
}

function ArrowBack() {
  return (
    <div className="lc-icon-30">
      <div className="lc-icon-inset">
        <svg width="100%" height="100%" viewBox="0 0 20 18" fill="none" preserveAspectRatio="none">
          <path d={svgPaths.p157ad100} fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

/* ─── Left branding panel ───────────────────────────────────────────────── */
function BrandingPanel() {
  const { t } = useI18n();
  return (
    <div className="lc-branding">
      <div className="lc-branding__logo">
        <span className="lc-branding__hi">Hi</span>
        <GlobePurple />
      </div>
      <p className="lc-branding__dns">DNS</p>
      <div className="lc-branding__headline">
        <p className="lc-branding__line">{t('login.brandLine1', { defaultValue: '登录以继续使用' })}</p>
        <p className="lc-branding__line">
          <span className="lc-branding__hicolor">HiDNS</span>
          {t('login.brandLine2Suffix', { defaultValue: ' 管理' })}
        </p>
        <p className="lc-branding__line">{t('login.brandLine3', { defaultValue: '您的域名' })}</p>
      </div>
    </div>
  );
}

/* ─── SSO row ───────────────────────────────────────────────────────────── */
function SsoRow({ icon, label, brand, onClick, disabled }: {
  icon: ReactNode; label: string; brand: string; onClick?: () => void; disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="lc-sso"
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 14, color: 'var(--lc-text)' }}>
        {label} <span style={{ fontWeight: 600 }}>{brand}</span> {t('login.toContinue', { defaultValue: '继续' })}
      </span>
    </button>
  );
}

/* ─── Step: Username ─────────────────────────────────────────────────────── */
function UsernamePanel({ username, setUsername, onContinue, loading, oauthEnabled, oauthProviders, onOauthLogin, oauthLoading, inputRef }: {
  username: string; setUsername: (v: string) => void; onContinue: () => void; loading: boolean;
  oauthEnabled: boolean; oauthProviders: Array<{ key: 'custom' | 'logto'; providerName: string }>;
  onOauthLogin: (provider?: 'custom' | 'logto') => void; oauthLoading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  return (
    <div className="lc-step">
      <div className="lc-step__heading">
        <p>{t('login.usernameStepLine1', { defaultValue: '输入用户名' })}</p>
        <p>{t('login.usernameStepLine2', { defaultValue: '以继续' })}</p>
      </div>
      <div className="lc-input-wrap">
        <input
          type="text"
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && username.trim() && onContinue()}
          placeholder={t('login.usernameOrEmailPlaceholder')}
          className="lc-input"
        />
      </div>
      <button
        type="button"
        className="lc-btn-primary"
        onClick={onContinue}
        disabled={!username.trim() || loading}
      >
        {loading ? (
          <span className="lc-spinner" />
        ) : (
          <>
            <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 16, color: '#fff' }}>{t('login.continue')}</span>
            <ArrowForward />
          </>
        )}
      </button>
      {oauthEnabled && (
        <div className="lc-sso-row">
          <SsoRow
            icon={<GlobePurple />}
            label={t('login.oauthSignIn', { defaultValue: '通过 OAuth 登录' })}
            brand=""
            onClick={() => onOauthLogin('custom')}
            disabled={oauthLoading || loading}
          />
          {oauthProviders.some((p) => p.key === 'logto') && (
            <SsoRow
              icon={<GlobePurple />}
              label={t('login.logtoSignIn', { defaultValue: '用 Logto 登录' })}
              brand=""
              onClick={() => onOauthLogin('logto')}
              disabled={oauthLoading || loading}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Step: Password ─────────────────────────────────────────────────────── */
function PasswordPanel({ password, setPassword, onBack, onSubmit, loading, username, onForgotPassword, onPasskeyLogin, supported2FATypes, inputRef }: {
  password: string; setPassword: (v: string) => void; onBack: () => void; onSubmit: () => void; loading: boolean;
  username: string; onForgotPassword: () => void; onPasskeyLogin: () => void; supported2FATypes: string[];
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  return (
    <div className="lc-step">
      <button type="button" className="lc-back" onClick={onBack}>
        <ArrowBack />
        <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 20, color: 'var(--lc-text)' }}>
          {t('login.back')}
        </span>
      </button>
      <div className="lc-step__heading">
        <p>{t('login.passwordStepLine1', { defaultValue: '输入' })}</p>
        <p>{t('login.passwordStepLine2', { defaultValue: '您的密码' })}</p>
      </div>
      <div className="lc-input-wrap">
        <input
          type="password"
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && password.trim() && onSubmit()}
          placeholder={t('login.passwordPlaceholder')}
          className="lc-input"
          autoComplete="current-password"
        />
      </div>
      <button
        type="button"
        className="lc-btn-primary"
        onClick={onSubmit}
        disabled={loading}
      >
        {loading ? (
          <span className="lc-spinner" />
        ) : (
          <>
            <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 16, color: '#fff' }}>{t('login.signIn')}</span>
            <ArrowForward />
          </>
        )}
      </button>
      <button type="button" className="lc-sso" onClick={onForgotPassword}>
        <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 14, color: 'var(--lc-text)' }}>？{t('login.forgotPassword')}</span>
      </button>
      {supported2FATypes.includes('webauthn') && (
        <button type="button" className="lc-sso" onClick={onPasskeyLogin} disabled={loading || !username.trim()}>
          <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 14, color: 'var(--lc-text)' }}>{t('passkeys.usePasskey')}</span>
        </button>
      )}
    </div>
  );
}

/* ─── Step: 2FA ──────────────────────────────────────────────────────────── */
function TwoFactorPanel({ onBack, totpCode, setTotpCode, onSubmit, loading, useBackupCode, setUseBackupCode, backupCode, setBackupCode, onPasskeyLogin, supported2FATypes, username, inputRef }: {
  onBack: () => void; totpCode: string; setTotpCode: (v: string) => void; onSubmit: () => void; loading: boolean;
  useBackupCode: boolean; setUseBackupCode: (v: boolean) => void; backupCode: string; setBackupCode: (v: string) => void;
  onPasskeyLogin: () => void; supported2FATypes: string[]; username: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  return (
    <div className="lc-step">
      <button type="button" className="lc-back" onClick={onBack}>
        <ArrowBack />
        <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 20, color: 'var(--lc-text)' }}>
          {t('login.back')}
        </span>
      </button>
      <div className="lc-step__heading">
        <p>{t('login.verify2FA')}</p>
        <p>{t('login.twoFactorHint')}</p>
      </div>
      {supported2FATypes.includes('webauthn') && (
        <button type="button" className="lc-sso" onClick={onPasskeyLogin} disabled={loading || !username.trim()}>
          <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 14, color: 'var(--lc-text)' }}>{t('passkeys.usePasskey')}</span>
        </button>
      )}
      {supported2FATypes.includes('webauthn') && supported2FATypes.includes('totp') && (
        <div className="lc-divider"><span>OR</span></div>
      )}
      {!useBackupCode ? (
        <div className="lc-input-wrap">
          <input
            type="text"
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && totpCode.trim() && onSubmit()}
            placeholder={t('login.enterAuthCode')}
            className="lc-input lc-input--center"
            maxLength={6}
            autoComplete="one-time-code"
          />
        </div>
      ) : (
        <div className="lc-input-wrap">
          <input
            type="text"
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && backupCode.trim() && onSubmit()}
            placeholder={t('login.enterBackupCode')}
            className="lc-input lc-input--center"
            autoComplete="one-time-code"
          />
        </div>
      )}
      <button type="button" className="lc-switch-code" onClick={() => setUseBackupCode(!useBackupCode)}>
        {useBackupCode ? t('login.useAuthCode') : t('login.useBackupCode')}
      </button>
      <button type="button" className="lc-btn-primary" onClick={onSubmit} disabled={loading}>
        {loading ? <span className="lc-spinner" /> : (
          <>
            <span style={{ fontFamily: SYS, fontWeight: 500, fontSize: 16, color: '#fff' }}>{t('login.signIn')}</span>
            <ArrowForward />
          </>
        )}
      </button>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
type Phase = 'idle' | 'exit-fwd' | 'exit-bwd';
type ViewStep = 'username' | 'password' | '2fa';

export default function LoginCard() {
  const { login } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const toast = useToast();
  const [viewStep, setViewStep] = useState<ViewStep>('username');
  const [phase, setPhase] = useState<Phase>('idle');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [require2FA, setRequire2FA] = useState(false);
  const [supported2FATypes, setSupported2FATypes] = useState<string[]>([]);
  const [totpCode, setTotpCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [oauthEnabled, setOauthEnabled] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<Array<{ key: 'custom' | 'logto'; providerName: string }>>([]);
  const [oauthLoading, setOauthLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const totpInputRef = useRef<HTMLInputElement | null>(null);
  const httpWarningResolveRef = useRef<((value: boolean) => void) | null>(null);
  const [httpWarningOpen, setHttpWarningOpen] = useState(false);

  const EXIT_DUR = 480;
  const EASE_OUT = 'cubic-bezier(0.55,0,0.8,0.45)';
  const EASE_IN = 'cubic-bezier(0.22,1,0.36,1)';

  useEffect(() => {
    authApi.oauthStatus()
      .then((res) => {
        if (res.data.code === 0 && res.data.data.enabled) {
          setOauthEnabled(true);
          setOauthProviders(res.data.data.providers || []);
        }
      })
      .catch(() => {});
  }, []);

  const showHttpWarningModal = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      httpWarningResolveRef.current = resolve;
      setHttpWarningOpen(true);
    });
  }, []);

  const resolveHttpWarning = (confirmed: boolean) => {
    httpWarningResolveRef.current?.(confirmed);
    httpWarningResolveRef.current = null;
    setHttpWarningOpen(false);
  };

  const languageOptions = useMemo<DropdownOption[]>(() => localeOptions.map((option) => ({
    content: option.label,
    value: option.code,
    active: option.code === locale,
    prefixIcon: option.code === locale ? <CheckIcon /> : undefined,
  })), [locale]);

  const goForward = () => {
    if (phase !== 'idle' || !username.trim()) return;
    setPhase('exit-fwd');
    timer.current = setTimeout(() => {
      setViewStep('password');
      setPhase('idle');
    }, EXIT_DUR);
  };

  const goBack = () => {
    if (phase !== 'idle') return;
    setPhase('exit-bwd');
    timer.current = setTimeout(() => {
      setViewStep('username');
      setPhase('idle');
    }, EXIT_DUR);
  };

  const goTo2FA = () => {
    if (phase !== 'idle') return;
    setPhase('exit-fwd');
    timer.current = setTimeout(() => {
      setViewStep('2fa');
      setPhase('idle');
    }, EXIT_DUR);
  };

  const goBackFrom2FA = () => {
    if (phase !== 'idle') return;
    setPhase('exit-bwd');
    timer.current = setTimeout(() => {
      setRequire2FA(false);
      setViewStep('password');
      setPhase('idle');
    }, EXIT_DUR);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useEffect(() => {
    if (phase !== 'idle') return;
    const id = setTimeout(() => {
      if (viewStep === 'username') usernameInputRef.current?.focus();
      else if (viewStep === 'password') passwordInputRef.current?.focus();
      else if (viewStep === '2fa') totpInputRef.current?.focus();
    }, 60);
    return () => clearTimeout(id);
  }, [viewStep, phase]);

  const usernameTransform = (): React.CSSProperties => {
    if (viewStep === 'username' && phase === 'idle') {
      return { transform: 'translateX(0)', opacity: 1, transition: `transform 0.44s ${EASE_IN}, opacity 0.32s ease-out` };
    }
    if (phase === 'exit-fwd') {
      return { transform: 'translateX(-115%)', opacity: 0, transition: `transform ${EXIT_DUR}ms ${EASE_OUT}, opacity ${EXIT_DUR * 0.8}ms ${EASE_OUT}` };
    }
    return { transform: 'translateX(-115%)', opacity: 0, transition: 'none' };
  };

  const passwordTransform = (): React.CSSProperties => {
    if (viewStep === 'password' && phase === 'idle') {
      return { transform: 'translateX(0)', opacity: 1, transition: `transform 0.44s ${EASE_IN}, opacity 0.32s ease-out` };
    }
    if (phase === 'exit-bwd') {
      return { transform: 'translateX(115%)', opacity: 0, transition: `transform ${EXIT_DUR}ms ${EASE_OUT}, opacity ${EXIT_DUR * 0.8}ms ${EASE_OUT}` };
    }
    if (phase === 'exit-fwd') {
      return { transform: 'translateX(-115%)', opacity: 0, transition: 'none' };
    }
    return { transform: 'translateX(115%)', opacity: 0, transition: 'none' };
  };

  const twoFactorTransform = (): React.CSSProperties => {
    if (viewStep === '2fa' && phase === 'idle') {
      return { transform: 'translateX(0)', opacity: 1, transition: `transform 0.44s ${EASE_IN}, opacity 0.32s ease-out` };
    }
    if (phase === 'exit-bwd') {
      return { transform: 'translateX(115%)', opacity: 0, transition: `transform ${EXIT_DUR}ms ${EASE_OUT}, opacity ${EXIT_DUR * 0.8}ms ${EASE_OUT}` };
    }
    if (phase === 'exit-fwd') {
      return { transform: 'translateX(-115%)', opacity: 0, transition: 'none' };
    }
    return { transform: 'translateX(115%)', opacity: 0, transition: 'none' };
  };

  const submitLogin = async () => {
    if (!username || !password) { setError(t('login.required')); return; }
    setError('');
    setLoading(true);
    try {
      let passwordToSend: string;
      try { passwordToSend = (await encryptWithFallback(password, showHttpWarningModal, t('login.encryptionFailed'))).encrypted; } catch { setLoading(false); return; }
      await login(username, passwordToSend, undefined, undefined, undefined, true);
      toast.success(t('login.signIn', { defaultValue: '登录成功' }));
    } catch (err: any) {
      if (err.message === '2FA_REQUIRED') {
        setRequire2FA(true);
        setSupported2FATypes(err.types || ['totp']);
        goTo2FA();
        setError('');
      } else {
        setError(getUserFriendlyError(err, t('login.failed')));
      }
    } finally {
      setLoading(false);
    }
  };

  const submit2FA = async () => {
    if (require2FA && !useBackupCode && !totpCode) { setError(t('login.authCodeRequired')); return; }
    if (require2FA && useBackupCode && !backupCode) { setError(t('login.backupCodeRequired')); return; }
    setError('');
    setLoading(true);
    try {
      let passwordToSend: string;
      try { passwordToSend = (await encryptWithFallback(password, showHttpWarningModal, t('login.encryptionFailed'))).encrypted; } catch { setLoading(false); return; }
      await login(
        username, passwordToSend,
        !useBackupCode ? totpCode : undefined,
        useBackupCode ? backupCode : undefined,
        undefined, true,
      );
      toast.success(t('login.signIn', { defaultValue: '登录成功' }));
    } catch (err: any) {
      setError(getUserFriendlyError(err, t('login.failed')));
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
      const attResp = await startAuthentication({ optionsJSON: optsRes.data.data.options as any });
      let passwordToSend: string;
      try { passwordToSend = (await encryptWithFallback(password, showHttpWarningModal, t('login.encryptionFailed'))).encrypted; } catch { setLoading(false); return; }
      await login(username, passwordToSend, undefined, undefined, attResp as unknown as WebAuthnResponse, true);
      toast.success(t('login.signIn', { defaultValue: '登录成功' }));
    } catch (e: unknown) {
      setError(getUserFriendlyError(e, t('login.failed')));
    } finally {
      setLoading(false);
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
      if (res.data.code !== 0) { setError(res.data.msg || t('login.oauthFailed')); return; }
      window.location.href = res.data.data.authUrl;
    } catch (e) {
      setError(getApiErrorMessage(e, t('login.oauthFailed')));
    } finally {
      setOauthLoading(false);
    }
  };

  const sendResetCode = async () => {
    if (!resetEmail.trim()) { toast.error(t('login.resetEmailRequired')); return; }
    setResetLoading(true);
    try {
      const res = await authApi.requestPasswordReset(resetEmail.trim());
      if (res.data.code !== 0) { toast.error(res.data.msg || t('login.resetRequestFailed')); return; }
      toast.success(t('login.resetCodeSent'));
    } catch (e) {
      toast.error(getUserFriendlyError(e, t('login.resetRequestFailed')));
    } finally {
      setResetLoading(false);
    }
  };

  const confirmReset = async () => {
    if (!resetEmail.trim() || !resetCode.trim() || !resetNewPassword.trim()) {
      toast.error(t('login.resetFieldsRequired')); return;
    }
    setResetLoading(true);
    try {
      let encrypted: string;
      try { encrypted = (await encryptWithFallback(resetNewPassword, showHttpWarningModal, t('login.encryptionFailed'))).encrypted; } catch { setResetLoading(false); return; }
      const res = await authApi.confirmPasswordReset(resetEmail.trim(), resetCode.trim(), encrypted, true);
      if (res.data.code !== 0) { toast.error(res.data.msg || t('login.resetConfirmFailed')); return; }
      toast.success(t('login.resetPasswordSuccess'));
      setShowReset(false); setResetCode(''); setResetNewPassword('');
    } catch (e) {
      toast.error(getUserFriendlyError(e, t('login.resetConfirmFailed')));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="lc-card">
      <div className="lc-lang">
        <Dropdown
          trigger="click"
          placement="bottom-right"
          options={languageOptions}
          maxHeight={320}
          minColumnWidth={168}
          maxColumnWidth={220}
          popupProps={{ overlayClassName: 'lc-lang__menu' }}
          onClick={(option) => setLocale(String(option.value))}
        >
          <button type="button" className="lc-lang-btn" title={t('settings.language')} aria-label={t('settings.language')}>
            <TranslateIcon />
          </button>
        </Dropdown>
      </div>
      <BrandingPanel />
      <div className="lc-card__right">
        {error && <div className="lc-error">{error}</div>}
        <div className="lc-card__right-viewport">
          <div className="lc-card__panel" aria-hidden={!(viewStep === 'username' && phase === 'idle')} style={{ pointerEvents: viewStep === 'username' && phase === 'idle' ? 'auto' : 'none', ...usernameTransform() }}>
            <UsernamePanel
              username={username} setUsername={setUsername} onContinue={goForward} loading={loading}
              oauthEnabled={oauthEnabled} oauthProviders={oauthProviders}
              onOauthLogin={startOauthLogin} oauthLoading={oauthLoading} inputRef={usernameInputRef}
            />
          </div>
          <div className="lc-card__panel" aria-hidden={!(viewStep === 'password' && phase === 'idle')} style={{ pointerEvents: viewStep === 'password' && phase === 'idle' ? 'auto' : 'none', ...passwordTransform() }}>
            <PasswordPanel
              password={password} setPassword={setPassword} onBack={goBack} onSubmit={submitLogin} loading={loading}
              username={username} onForgotPassword={() => setShowReset(true)} onPasskeyLogin={handlePasskeyLogin}
              supported2FATypes={supported2FATypes} inputRef={passwordInputRef}
            />
          </div>
          <div className="lc-card__panel" aria-hidden={!(viewStep === '2fa' && phase === 'idle')} style={{ pointerEvents: viewStep === '2fa' && phase === 'idle' ? 'auto' : 'none', ...twoFactorTransform() }}>
            <TwoFactorPanel
              onBack={goBackFrom2FA} totpCode={totpCode} setTotpCode={setTotpCode} onSubmit={submit2FA} loading={loading}
              useBackupCode={useBackupCode} setUseBackupCode={setUseBackupCode} backupCode={backupCode} setBackupCode={setBackupCode}
              onPasskeyLogin={handlePasskeyLogin} supported2FATypes={supported2FATypes} username={username} inputRef={totpInputRef}
            />
          </div>
        </div>
      </div>

      {showReset && (
        <div className="lc-reset-overlay">
          <div className="lc-reset-dialog">
            <h3>{t('login.resetPassword')}</h3>
            <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder={t('login.resetEmailPlaceholder')} className="lc-input" />
            <div className="lc-reset-code-row">
              <input type="text" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder={t('login.resetCodePlaceholder')} className="lc-input" />
              <button type="button" className="lc-btn-outline" onClick={sendResetCode} disabled={resetLoading}>
                {resetLoading ? <span className="lc-spinner lc-spinner--sm" /> : t('login.sendResetCode')}
              </button>
            </div>
            <input type="password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} placeholder={t('login.resetNewPasswordPlaceholder')} className="lc-input" autoComplete="new-password" />
            <div className="lc-reset-actions">
              <button type="button" className="lc-btn-outline" onClick={() => setShowReset(false)}>{t('common.cancel')}</button>
              <button type="button" className="lc-btn-primary" onClick={confirmReset} disabled={resetLoading}>
                {resetLoading ? <span className="lc-spinner" /> : t('login.resetPassword')}
              </button>
            </div>
          </div>
        </div>
      )}
      {httpWarningOpen && (
        <Modal title={t('login.httpWarningTitle')} onClose={() => resolveHttpWarning(false)} size="sm">
          <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6 }}>{t('login.httpWarning')}</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="lc-btn-outline" onClick={() => resolveHttpWarning(false)}>{t('login.httpWarningCancel')}</button>
            <button type="button" className="lc-btn-primary" onClick={() => resolveHttpWarning(true)}>{t('login.httpWarningConfirm')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
