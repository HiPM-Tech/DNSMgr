import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button, Loading, Alert } from 'tdesign-react';
import { LockOnIcon } from 'tdesign-icons-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { mcpApi } from '../api';
import './Login.css';

/** MCP scope module definitions */
const MCP_SCOPE_MODULES = [
  { key: 'ns_monitor' },
  { key: 'domain_management' },
  { key: 'renewal_management' },
  { key: 'log_query' },
  { key: 'failover_management' },
] as const;

const SCOPE_LEVELS = ['disabled', 'read', 'write'] as const;

/** Parse scope string into module -> level map */
function parseScopeToPerms(scope: string | null | undefined): Record<string, string> {
  if (!scope) return {};
  try {
    const perms: Record<string, string> = {};
    for (const item of scope.split(',').map(s => s.trim()).filter(Boolean)) {
      const [mod, level] = item.split(':');
      if (mod && level && SCOPE_LEVELS.includes(level as any)) {
        perms[mod] = level;
      }
    }
    return perms;
  } catch {
    return {};
  }
}

const PERMISSION_LEVELS: Record<string, { color: string; i18nKey: string }> = {
  disabled: { color: '#999', i18nKey: 'mcp.scopeLevelDisabled' },
  read: { color: '#165dff', i18nKey: 'mcp.scopeLevelRead' },
  write: { color: '#2ba471', i18nKey: 'mcp.scopeLevelWrite' },
};

export function McpOAuthConsent() {
  const year = new Date().getFullYear();
  const { t } = useI18n();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Parse query params
  const type = searchParams.get('type') || 'mcp';
  const clientId = searchParams.get('client_id') || '';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const scopeStr = searchParams.get('scope') || '';
  const state = searchParams.get('state') || '';
  const appName = searchParams.get('app_name') || clientId;

  const perms = parseScopeToPerms(scopeStr);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleDecision = async (decision: 'approve' | 'deny') => {
    setSubmitting(true);
    setError('');
    try {
      const res = await mcpApi.postOAuthAuthorize({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scopeStr,
        state,
        decision,
      });
      if (res.data.redirect_url) {
        window.location.href = res.data.redirect_url;
      }
    } catch (err: any) {
      setError(err?.response?.data?.error_description || err?.message || t('mcp.consentError'));
      setSubmitting(false);
    }
  };

  // Loading auth state
  if (authLoading) {
    return (
      <>
        <main className="login-page login-page--checking">
          <Loading loading size="large" text={t('common.loading')} />
        </main>
        <footer className="login-footer">&copy;{year} HiPM-Tech &middot; All Rights Reserved.</footer>
      </>
    );
  }

  // Not authenticated
  if (!user) {
    const loginUrl = `/login?return_to=${encodeURIComponent(`/oauth/authorize?${searchParams.toString()}`)}`;
    return (
      <>
        <main className="login-page login-page--checking">
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <LockOnIcon style={{ fontSize: 48, color: 'var(--td-warning-color)', marginBottom: 16 }} />
            <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>{t('mcp.consentNotLoggedIn')}</h1>
            <Button theme="primary" size="large" onClick={() => navigate(loginUrl)}>
              {t('mcp.consentSignIn')}
            </Button>
          </div>
        </main>
        <footer className="login-footer">&copy;{year} HiPM-Tech &middot; All Rights Reserved.</footer>
      </>
    );
  }

  // Determine service type label
  const typeLabel = type === 'mcp' ? t('mcp.consentTypeMCP') : type;

  return (
    <>
      <main className="login-page">
      <div className="login-shell">
        {/* Left: Identity Section */}
        <section className="login-identity" aria-label={t('mcp.consentTitle')}>
          <div className="login-brand">
            <span className="login-brand__mark">
              <img src="/favicon.ico" alt="" />
            </span>
            <div>
              <strong>HiDNS</strong>
              <span>{typeLabel}</span>
            </div>
          </div>

          <div className="login-identity__copy">
            <h1>{t('mcp.consentTitle')}</h1>
            <p>{t('mcp.consentSubtitle', { appName })}</p>
          </div>
        </section>

        {/* Right: Consent Panel */}
        <section className="login-panel" aria-labelledby="consent-title">
          <div className="login-panel__heading">
            <h2 id="consent-title">{t('mcp.consentPermissions')}</h2>
          </div>

          {/* Permission table */}
          <div style={{ marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 0', textAlign: 'left', borderBottom: '2px solid var(--td-component-stroke)', fontSize: 13, color: 'var(--td-text-color-secondary)' }}>
                    {t('mcp.consentModule')}
                  </th>
                  <th style={{ padding: '8px 0', textAlign: 'center', borderBottom: '2px solid var(--td-component-stroke)', fontSize: 13, color: 'var(--td-text-color-secondary)' }}>
                    {t('mcp.consentAccess')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {MCP_SCOPE_MODULES.map(mod => {
                  const level = perms[mod.key] || 'disabled';
                  const def = PERMISSION_LEVELS[level] || PERMISSION_LEVELS.disabled;
                  const levelLabel = t(def.i18nKey);
                  const modLabel = t(`mcp.scopeModule.${mod.key}` as any);
                  return (
                    <tr key={mod.key}>
                      <td style={{ padding: '10px 0', borderBottom: '1px solid var(--td-component-stroke)', fontSize: 14, fontWeight: 500, color: 'var(--td-text-color-primary)' }}>
                        {modLabel}
                      </td>
                      <td style={{ padding: '10px 0', borderBottom: '1px solid var(--td-component-stroke)', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 14px',
                          borderRadius: 3,
                          fontSize: 12,
                          color: '#fff',
                          background: def.color,
                          fontWeight: 500,
                        }}>
                          {levelLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Error */}
          {error && (
            <Alert theme="error" message={error} style={{ marginBottom: 16 }} />
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12 }}>
            <Button
              theme="default"
              size="large"
              block
              disabled={submitting}
              onClick={() => handleDecision('deny')}
            >
              {submitting ? t('mcp.consentProcessing') : t('mcp.consentDeny')}
            </Button>
            <Button
              theme="primary"
              size="large"
              block
              loading={submitting}
              onClick={() => handleDecision('approve')}
            >
              {t('mcp.consentApprove')}
            </Button>
          </div>

          {/* Footer */}
          <div className="login-panel__footer" style={{ marginTop: 24 }}>
            <span className="login-footer-action" style={{ cursor: 'default', opacity: 0.6 }}>
              {t('mcp.consentPoweredBy')}
            </span>
          </div>
        </section>
      </div>
    </main>
    <footer className="login-footer">&copy;{year} HiPM-Tech &middot; All Rights Reserved.</footer>
    </>
  );
}