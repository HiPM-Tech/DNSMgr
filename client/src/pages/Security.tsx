import { useEffect, useState } from 'react';
import { Smartphone, LogOut, Copy, Check } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';

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

export function Security() {
  const toast = useToast();

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

  useEffect(() => {
    loadSessions();
    loadTotpStatus();
  }, []);

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
      const response = await fetch('/api/security/2fa/status', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (response.ok) {
        const data = await response.json();
        setTotpEnabled(data.data.enabled);
        setBackupCodesRemaining(data.data.backupCodesRemaining);
      }
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
      toast.error('Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTotp = async () => {
    if (!totpSetup || !totpToken) {
      toast.error('Please enter the verification code');
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
        toast.success('2FA enabled successfully');
        setShowTotpSetup(false);
        setTotpToken('');
        setTotpSetup(null);
        await loadTotpStatus();
      } else {
        toast.error('Failed to enable 2FA');
      }
    } catch (error) {
      toast.error('Failed to enable 2FA');
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
        toast.success('Session logged out');
        await loadSessions();
      }
    } catch (error) {
      toast.error('Failed to logout session');
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
        toast.success('Other sessions logged out');
        await loadSessions();
      }
    } catch (error) {
      toast.error('Failed to logout other sessions');
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Security Settings</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your account security and sessions</p>
      </div>

      {/* 2FA Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Smartphone className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Two-Factor Authentication</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {totpEnabled ? `Enabled (${backupCodesRemaining} backup codes remaining)` : 'Not enabled'}
              </p>
            </div>
          </div>
          {!totpEnabled && (
            <button
              onClick={() => {
                setShowTotpSetup(true);
                handleSetupTotp();
              }}
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              Enable 2FA
            </button>
          )}
        </div>
      </div>

      {/* Sessions Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <LogOut className="w-6 h-6 text-green-500" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Active Sessions</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{sessions.length} active session(s)</p>
            </div>
          </div>
          {sessions.length > 1 && (
            <button
              onClick={handleLogoutOthers}
              disabled={loading}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              Logout Others
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
                  Last active: {new Date(session.lastActivityAt).toLocaleString()}
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
                Logout
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 2FA Setup Modal */}
      {showTotpSetup && totpSetup && (
        <Modal title="Setup Two-Factor Authentication" onClose={() => setShowTotpSetup(false)}>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Scan this QR code with your authenticator app:
              </p>
              <img src={totpSetup.qrCode} alt="QR Code" className="w-48 h-48 mx-auto" />
            </div>

            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Or enter this secret manually:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono">
                  {totpSetup.secret}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(totpSetup.secret);
                    toast.success('Copied');
                  }}
                  className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
                Enter verification code:
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
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Backup codes:</p>
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
                Save these codes in a safe place. You can use them to access your account if you lose access to your authenticator.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowTotpSetup(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleEnableTotp}
                disabled={loading || totpToken.length !== 6}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Enabling...' : 'Enable 2FA'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Logout Confirmation Dialog */}
      {showConfirmLogout && selectedSessionId && (
        <ConfirmDialog
          message="Are you sure you want to logout this session?"
          onConfirm={() => handleLogoutSession(selectedSessionId)}
          onCancel={() => {
            setShowConfirmLogout(false);
            setSelectedSessionId(null);
          }}
          isLoading={loading}
          confirmLabel="Logout"
        />
      )}
    </div>
  );
}
