import { useEffect, useState } from 'react';
import { Smartphone, LogOut, Copy, Check, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { startRegistration } from '@simplewebauthn/browser';
import { authApi } from '../api';
import type { WebAuthnResponse } from '../api';
import { useRealtimeData } from '../hooks/useRealtimeData';

interface Session {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

interface TOTPSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

import { useI18n } from '../contexts/I18nContext';

export function Security() {
  const { t } = useI18n();
  const toast = useToast();

  // 实时数据：会话和安全设置变更
  useRealtimeData({
    queryKey: ['user-security'],
    websocketEventTypes: ['2fa_enabled', '2fa_disabled', 'trusted_device_removed'],
    pollingInterval: 120000, // 2分钟
  });

  const [sessions, setSessions] = useState<Session[]>([]);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(0);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TOTPSetup | null>(null);
  const [totpToken, setTotpToken] = useState('');
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disable2FAToken, setDisable2FAToken] = useState('');

  useEffect(() => {
    loadSessions();
    loadTotpStatus();
    loadPasskeys();
  }, []);

  const loadPasskeys = async () => {
    try {
      const res = await authApi.webauthnCreds();
      if (res.data.code === 0) setPasskeys(res.data.data || []);
    } catch (e) {
      console.error('Failed to load passkeys', e);
    }
  };

  const handleAddPasskey = async () => {
    setLoading(true);
    try {
      const optsRes = await authApi.webauthnRegOptions();
      if (optsRes.data.code !== 0) throw new Error(optsRes.data.msg);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attResp = await startRegistration({ optionsJSON: optsRes.data.data.options as any });

      const verifyRes = await authApi.webauthnRegVerify({
        credential: attResp as unknown as WebAuthnResponse
      });
      if (verifyRes.data.code === 0) {
        toast.success(t('passkeys.addSuccess'));
        await loadPasskeys();
      } else {
        throw new Error(verifyRes.data.msg);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('passkeys.addFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!confirm(t('passkeys.confirmRemove'))) return;
    setLoading(true);
    try {
      const res = await authApi.webauthnDeleteCred(id);
      if (res.data.code === 0) {
        toast.success(t('passkeys.removeSuccess'));
        await loadPasskeys();
      } else {
        throw new Error(res.data.msg);
      }
    } catch (e: any) {
      toast.error(e.message || t('passkeys.removeFailed'));
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/security/sessions', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadTotpStatus = async () => {
    try {
      // Check TOTP status
      const totpResponse = await fetch('/api/security/2fa/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      
      // Check WebAuthn status
      const webauthnResponse = await fetch('/api/webauthn/credentials', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      
      let totpEnabled = false;
      let backupCodesRemaining = 0;
      let webauthnEnabled = false;
      
      if (totpResponse.ok) {
        const totpData = await totpResponse.json();
        totpEnabled = totpData.data.enabled;
        backupCodesRemaining = totpData.data.backupCodesRemaining;
      }
      
      if (webauthnResponse.ok) {
        const webauthnData = await webauthnResponse.json();
        webauthnEnabled = webauthnData.data && webauthnData.data.length > 0;
      }
      
      // 2FA is enabled if either TOTP or WebAuthn is enabled
      setTotpEnabled(totpEnabled || webauthnEnabled);
      setBackupCodesRemaining(backupCodesRemaining);
    } catch (error) {
      console.error('Failed to load 2FA status:', error);
    }
  };

  const handleSetupTotp = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/security/2fa/setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTotpSetup(data.data);
      }
    } catch (error) {
      toast.error(t('security.setupFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTotp = async () => {
    if (!totpSetup || !totpToken) {
      toast.error(t('security.enterVerificationCode'));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/security/2fa/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          secret: totpSetup.secret,
          token: totpToken,
          backupCodes: totpSetup.backupCodes,
        }),
      });

      if (response.ok) {
        toast.success(t('security.enableSuccess'));
        setShowTotpSetup(false);
        setTotpToken('');
        setTotpSetup(null);
        await loadTotpStatus();
      } else {
        toast.error(t('security.enableFailed'));
      }
    } catch (error) {
      toast.error(t('security.enableFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutSession = async (sessionId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/security/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        toast.success(t('security.sessionLoggedOut'));
        await loadSessions();
      }
    } catch (error) {
      toast.error(t('security.logoutFailed'));
    } finally {
      setLoading(false);
      setShowConfirmLogout(false);
      setSelectedSessionId(null);
    }
  };

  const handleLogoutOthers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/security/sessions/logout-others', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      if (response.ok) {
        toast.success(t('security.othersLoggedOut'));
        await loadSessions();
      }
    } catch (error) {
      toast.error(t('security.logoutOthersFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disable2FAToken || disable2FAToken.length !== 6) {
      toast.error(t('security.enterVerificationCode'));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/security/2fa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ token: disable2FAToken }),
      });

      if (response.ok) {
        toast.success(t('security.disable2faSuccess'));
        setShowDisable2FA(false);
        setDisable2FAToken('');
        await loadTotpStatus();
      } else {
        const data = await response.json();
        toast.error(data.message || t('security.disable2faFailed'));
      }
    } catch (error) {
      toast.error(t('security.disable2faFailed'));
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const downloadBackupCodes = () => {
    if (!totpSetup || !totpSetup.backupCodes || totpSetup.backupCodes.length === 0) {
      toast.error(t('security.noBackupCodes'));
      return;
    }

    // Create text content with backup codes
    const content = `DNSMgr Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\n${totpSetup.backupCodes.join('\n')}\n\nImportant: Store these codes in a safe place. Each code can only be used once.`;
    
    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dnsmgr-backup-codes-${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    toast.success(t('security.backupCodesDownloaded'));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('security.title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">{t('security.subtitle')}</p>
      </div>

      {/* 2FA Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('security.twoFactorAuth')}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {totpEnabled ? t('security.twoFactorEnabled', { count: backupCodesRemaining }) : t('security.twoFactorDisabled')}
              </p>
            </div>
          </div>
          {!totpEnabled ? (
            <button
              onClick={() => {
                setShowTotpSetup(true);
                handleSetupTotp();
              }}
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {t('security.enable2fa')}
            </button>
          ) : (
            <button
              onClick={() => setShowDisable2FA(true)}
              disabled={loading}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {t('security.disable2fa')}
            </button>
          )}
        </div>
      </div>

      {/* Passkeys Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <KeyRound className="w-6 h-6 text-green-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('passkeys.title')}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('passkeys.desc')}</p>
            </div>
          </div>
          <button
            onClick={handleAddPasskey}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> {t('passkeys.add')}
          </button>
        </div>

        {passkeys.length > 0 ? (
          <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
            {passkeys.map((pk) => (
              <div key={pk.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{pk.name}</p>
                  <p className="text-sm text-gray-500">{t('passkeys.addedOn')} {new Date(pk.created_at).toLocaleDateString()}</p>
                </div>
                <button
                  onClick={() => handleDeletePasskey(pk.id)}
                  disabled={loading}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">{t('passkeys.none')}</p>
        )}
      </div>

      {/* Sessions Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <LogOut className="w-6 h-6 text-green-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('security.activeSessions')}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('security.sessionsCount', { count: sessions.length })}</p>
            </div>
          </div>
          {sessions.length > 1 && (
            <button
              onClick={handleLogoutOthers}
              disabled={loading}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              {t('security.logoutOthers')}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{session.userAgent}</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">{session.ipAddress}</p>
                <p className="text-xs text-gray-500 dark:text-gray-500">
                  {t('security.lastActive')} {new Date(session.lastActivityAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedSessionId(session.id);
                  setShowConfirmLogout(true);
                }}
                disabled={loading}
                className="ml-4 px-3 py-1 text-sm bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800 disabled:opacity-50"
              >
                {t('security.logout')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2FA Setup Modal */}
      {showTotpSetup && totpSetup && (
        <Modal title={t('security.setup2fa')} onClose={() => setShowTotpSetup(false)}>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('security.scanQrCode')}
              </p>
              <img src={totpSetup.qrCode} alt="QR Code" className="w-48 h-48 mx-auto" />
            </div>

            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{t('security.enterSecretManually')}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">
                  {totpSetup.secret}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(totpSetup.secret);
                    toast.success(t('security.copied'));
                  }}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                {t('security.enterVerificationCode')}
              </label>
              <input
                type="text"
                value={totpToken}
                onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-2xl tracking-widest"
              />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{t('security.backupCodes')}</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {totpSetup.backupCodes.map((code) => (
                  <div
                    key={code}
                    className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono"
                  >
                    <span>{code}</span>
                    <button
                      onClick={() => copyBackupCode(code)}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                    >
                      {copiedCode === code ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                {t('security.backupCodesDesc')}
              </p>
              
              {/* Download button */}
              <button
                onClick={downloadBackupCodes}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t('security.downloadBackupCodes') || 'Download as .txt file'}
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowTotpSetup(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleEnableTotp}
                disabled={loading || totpToken.length !== 6}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? t('security.enabling') : t('security.enable2fa')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Disable 2FA Modal */}
      {showDisable2FA && (
        <Modal title={t('security.disable2fa')} onClose={() => setShowDisable2FA(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('security.disable2faWarning')}
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                {t('security.enterVerificationCode')}
              </label>
              <input
                type="text"
                value={disable2FAToken}
                onChange={(e) => setDisable2FAToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-2xl tracking-widest"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDisable2FA(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDisable2FA}
                disabled={loading || disable2FAToken.length !== 6}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                {loading ? t('security.disabling') : t('security.disable2fa')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Logout Confirmation Dialog */}
      {showConfirmLogout && selectedSessionId && (
        <ConfirmDialog
          message={t('security.confirmLogoutSession')}
          onConfirm={() => handleLogoutSession(selectedSessionId)}
          onCancel={() => {
            setShowConfirmLogout(false);
            setSelectedSessionId(null);
          }}
          isLoading={loading}
          confirmLabel={t('security.logout')}
        />
      )}
    </div>
  );
}
