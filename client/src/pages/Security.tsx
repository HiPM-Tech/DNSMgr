import { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Form, Input, Space } from 'tdesign-react';
import { AddIcon, CheckIcon, CopyIcon, DeleteIcon, DownloadIcon, KeyIcon, LockOnIcon, LogoutIcon, MobileIcon } from 'tdesign-icons-react';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { startRegistration } from '@simplewebauthn/browser';
import { authApi } from '../api';
import type { WebAuthnResponse } from '../api';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { useI18n } from '../contexts/I18nContext';

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

interface Passkey {
  id: string;
  name: string;
  created_at: string;
}

export function Security() {
  const { t } = useI18n();
  const toast = useToast();

  useRealtimeData({
    queryKey: ['user-security'],
    websocketEventTypes: ['2fa_enabled', '2fa_disabled', 'trusted_device_removed'],
    pollingInterval: 120000,
  });

  const [sessions, setSessions] = useState<Session[]>([]);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [twoFAValidationEnabled, setTwoFAValidationEnabled] = useState(true);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(0);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpSetup, setTotpSetup] = useState<TOTPSetup | null>(null);
  const [totpToken, setTotpToken] = useState('');
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyToDelete, setPasskeyToDelete] = useState<string | null>(null);
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
        credential: attResp as unknown as WebAuthnResponse,
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
    setLoading(true);
    try {
      const res = await authApi.webauthnDeleteCred(id);
      if (res.data.code === 0) {
        toast.success(t('passkeys.removeSuccess'));
        await loadPasskeys();
      } else {
        throw new Error(res.data.msg);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('passkeys.removeFailed'));
    } finally {
      setLoading(false);
      setPasskeyToDelete(null);
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
      const totpResponse = await fetch('/api/security/2fa/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      const webauthnResponse = await fetch('/api/webauthn/credentials', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });

      let nextTotpEnabled = false;
      let nextBackupCodesRemaining = 0;
      let webauthnEnabled = false;
      let validationEnabled = true;

      if (totpResponse.ok) {
        const totpData = await totpResponse.json();
        validationEnabled = Boolean(totpData.data.validationEnabled ?? true);
        nextTotpEnabled = totpData.data.enabled;
        nextBackupCodesRemaining = totpData.data.backupCodesRemaining;
      }

      if (webauthnResponse.ok) {
        const webauthnData = await webauthnResponse.json();
        webauthnEnabled = webauthnData.data && webauthnData.data.length > 0;
      }

      setTwoFAValidationEnabled(validationEnabled);
      setTotpEnabled(validationEnabled && (nextTotpEnabled || webauthnEnabled));
      setBackupCodesRemaining(nextBackupCodesRemaining);
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
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

    const content = `DNSMgr Backup Codes\nGenerated: ${new Date().toLocaleString()}\n\n${totpSetup.backupCodes.join('\n')}\n\nImportant: Store these codes in a safe place. Each code can only be used once.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hidns-backup-codes-${new Date().getTime()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success(t('security.backupCodesDownloaded'));
  };

  const openTotpSetup = () => {
    setShowTotpSetup(true);
    handleSetupTotp();
  };

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h1>{t('security.title')}</h1>
          <p>{t('security.subtitle')}</p>
        </div>
      </section>

      <Card bordered={false} shadow={false}>
        <div className="security-card-header">
          <div className="security-card-title">
            <MobileIcon />
            <div>
              <strong>{t('security.twoFactorAuth')}</strong>
              <span>
                {!twoFAValidationEnabled
                  ? t('security.twoFactorSystemDisabled')
                  : totpEnabled
                    ? t('security.twoFactorEnabled', { count: backupCodesRemaining })
                    : t('security.twoFactorDisabled')}
              </span>
            </div>
          </div>
          {!totpEnabled ? (
            <Button theme="primary" loading={loading} disabled={!twoFAValidationEnabled} onClick={openTotpSetup}>
              {t('security.enable2fa')}
            </Button>
          ) : (
            <Button theme="danger" loading={loading} onClick={() => setShowDisable2FA(true)}>
              {t('security.disable2fa')}
            </Button>
          )}
        </div>
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><KeyIcon />{t('passkeys.title')}</Space>}
        subtitle={t('passkeys.desc')}
        actions={<Button theme="primary" icon={<AddIcon />} loading={loading} onClick={handleAddPasskey}>{t('passkeys.add')}</Button>}
      >
        {passkeys.length > 0 ? (
          <div className="page-list">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="page-list-item">
                <div className="page-list-item__main">
                  <strong>{passkey.name}</strong>
                  <span>{t('passkeys.addedOn')} {new Date(passkey.created_at).toLocaleDateString()}</span>
                </div>
                <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} loading={loading} onClick={() => setPasskeyToDelete(passkey.id)} />
              </div>
            ))}
          </div>
        ) : (
          <Empty description={t('passkeys.none')} />
        )}
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><LogoutIcon />{t('security.activeSessions')}</Space>}
        subtitle={t('security.sessionsCount', { count: sessions.length })}
        actions={sessions.length > 1 && (
          <Button theme="danger" variant="outline" loading={loading} onClick={handleLogoutOthers}>
            {t('security.logoutOthers')}
          </Button>
        )}
      >
        {sessions.length === 0 ? (
          <Empty description={t('security.sessionsCount', { count: 0 })} />
        ) : (
          <div className="page-list">
            {sessions.map((session) => (
              <div key={session.id} className="page-list-item">
                <div className="page-list-item__main">
                  <strong>{session.userAgent}</strong>
                  <span>{session.ipAddress}</span>
                  <span>{t('security.lastActive')} {new Date(session.lastActivityAt).toLocaleString()}</span>
                </div>
                <Button
                  size="small"
                  theme="danger"
                  variant="outline"
                  loading={loading}
                  onClick={() => {
                    setSelectedSessionId(session.id);
                    setShowConfirmLogout(true);
                  }}
                >
                  {t('security.logout')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showTotpSetup && totpSetup && (
        <Modal title={t('security.setup2fa')} onClose={() => setShowTotpSetup(false)} size="lg">
          <div className="page-shell">
            <Alert theme="info" message={t('security.scanQrCode')} />
            <img src={totpSetup.qrCode} alt="QR Code" className="security-qr" />

            <div>
              <p className="page-muted">{t('security.enterSecretManually')}</p>
              <div className="security-code-box">
                <code>{totpSetup.secret}</code>
                <Button
                  shape="square"
                  variant="outline"
                  icon={<CopyIcon />}
                  onClick={() => {
                    navigator.clipboard.writeText(totpSetup.secret);
                    toast.success(t('security.copied'));
                  }}
                />
              </div>
            </div>

            <Form layout="vertical" colon={false} requiredMark={false}>
              <Form.FormItem label={t('security.enterVerificationCode')}>
                <Input
                  align="center"
                  value={totpToken}
                  onChange={(value) => setTotpToken(String(value).replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxlength={6}
                  className="security-token-input"
                />
              </Form.FormItem>
            </Form>

            <Card bordered title={t('security.backupCodes')}>
              <div className="backup-code-list">
                {totpSetup.backupCodes.map((code) => (
                  <div key={code} className="security-code-box">
                    <code>{code}</code>
                    <Button shape="square" variant="text" icon={copiedCode === code ? <CheckIcon /> : <CopyIcon />} onClick={() => copyBackupCode(code)} />
                  </div>
                ))}
              </div>
              <p className="page-muted">{t('security.backupCodesDesc')}</p>
              <Button block variant="outline" icon={<DownloadIcon />} onClick={downloadBackupCodes}>
                {t('security.downloadBackupCodes')}
              </Button>
            </Card>

            <Space className="record-form__actions">
              <Button variant="outline" onClick={() => setShowTotpSetup(false)}>{t('common.cancel')}</Button>
              <Button theme="primary" loading={loading} disabled={totpToken.length !== 6} onClick={handleEnableTotp}>
                {loading ? t('security.enabling') : t('security.enable2fa')}
              </Button>
            </Space>
          </div>
        </Modal>
      )}

      {showDisable2FA && (
        <Modal title={t('security.disable2fa')} onClose={() => setShowDisable2FA(false)} size="sm">
          <div className="page-shell">
            <Alert theme="warning" message={t('security.disable2faWarning')} />
            <Form layout="vertical" colon={false} requiredMark={false}>
              <Form.FormItem label={t('security.enterVerificationCode')}>
                <Input
                  align="center"
                  value={disable2FAToken}
                  onChange={(value) => setDisable2FAToken(String(value).replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxlength={6}
                  className="security-token-input"
                />
              </Form.FormItem>
            </Form>
            <Space className="record-form__actions">
              <Button variant="outline" onClick={() => setShowDisable2FA(false)}>{t('common.cancel')}</Button>
              <Button theme="danger" loading={loading} disabled={disable2FAToken.length !== 6} onClick={handleDisable2FA}>
                {loading ? t('security.disabling') : t('security.disable2fa')}
              </Button>
            </Space>
          </div>
        </Modal>
      )}

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

      {passkeyToDelete && (
        <ConfirmDialog
          message={t('passkeys.confirmRemove')}
          onConfirm={() => handleDeletePasskey(passkeyToDelete)}
          onCancel={() => setPasskeyToDelete(null)}
          isLoading={loading}
          confirmLabel={t('common.delete')}
        />
      )}
    </div>
  );
}
