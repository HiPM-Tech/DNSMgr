import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Dialog, Divider, Input, Loading, Space, Table, Tag, Tabs, Tooltip } from 'tdesign-react';
import { AddIcon, CopyIcon, DeleteIcon, EditIcon } from 'tdesign-icons-react';
import { addToast } from '../hooks/useToast';
import { mcpApi } from '../api';
import { useI18n } from '../contexts/I18nContext';
import { Modal } from '../components/Modal';
import type { McpApiKey, McpOAuthClient } from '../api/mcp';

function formatDate(dateString: string, locale: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  const localeMap: Record<string, string> = {
    'zh-CN': 'zh-CN',
    'zh-CN-Mesugaki': 'zh-CN',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'de': 'de-DE',
    'fr': 'fr-FR',
    'es': 'es-ES',
    'ar': 'ar-SA',
    'ru': 'ru-RU',
    'pt': 'pt-PT',
    'en': 'en-US',
  };
  return date.toLocaleString(localeMap[locale] || 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/\//g, '-');
}

/** Helper: show toast without component-scoped hooks (safe for dialog callbacks) */
function toastSuccess(msg: string) { addToast(msg, 'success'); }
function toastError(msg: string) { addToast(msg, 'error'); }

export function McpManagement() {
  const { t, locale } = useI18n();
  const baseUrl = window.location.origin;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'keys' | 'oauth'>('keys');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [keyDescription, setKeyDescription] = useState('');
  const [keyExpiry, setKeyExpiry] = useState('');
  const [copied, setCopied] = useState(false);

  // ─── Confirm dialog state (replaces DialogPlugin.confirm) ────
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmBody, setConfirmBody] = useState('');
  const [confirmLabel, setConfirmLabel] = useState('');
  const [confirmTheme, setConfirmTheme] = useState<'warning' | 'danger'>('danger');
  const confirmActionRef = useRef<() => void>(() => {});

  const openConfirm = (title: string, body: string, label: string, theme: 'warning' | 'danger', action: () => void) => {
    setConfirmTitle(title);
    setConfirmBody(body);
    setConfirmLabel(label);
    setConfirmTheme(theme);
    confirmActionRef.current = action;
    setConfirmOpen(true);
  };

  // OAuth clients
  const [showCreateOAuthModal, setShowCreateOAuthModal] = useState(false);
  const [newOAuthClient, setNewOAuthClient] = useState<{ client_id: string; client_secret: string } | null>(null);
  const [oauthAppName, setOAuthAppName] = useState('');
  const [redirectUris, setRedirectUris] = useState<string[]>([]);
  const [redirectUriInput, setRedirectUriInput] = useState('');
  const [oauthScope, setOAuthScope] = useState('');

  // OAuth scope/expiry editing
  const [editingClient, setEditingClient] = useState<McpOAuthClient | null>(null);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [editScope, setEditScope] = useState('');
  const [editExpiry, setEditExpiry] = useState('');

  // ─── OAuth Clients ──────────────────────────────────────────

  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ['mcp-api-keys'],
    queryFn: async () => {
      const res = await mcpApi.getApiKeys();
      if (res.data.code === 0) return res.data.data as McpApiKey[];
      throw new Error(res.data.msg);
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: (data: { description: string; expiresAt?: string }) => 
      mcpApi.createApiKey(data),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        setNewApiKey(res.data.data.apiKey);
        setShowCreateKeyModal(false);
        setKeyDescription('');
        setKeyExpiry('');
        queryClient.invalidateQueries({ queryKey: ['mcp-api-keys'] });
        toastSuccess(t('common.success'));
      } else {
        toastError(res.data.msg || t('common.error'));
      }
    },
    onError: (_error: unknown) => {
      toastError(t('common.error'));
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (keyId: number) => mcpApi.revokeApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-api-keys'] });
      toastSuccess(t('common.success'));
    },
    onError: (_error: unknown) => {
      toastError(t('common.error'));
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: number) => mcpApi.deleteApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-api-keys'] });
      toastSuccess(t('common.success'));
    },
    onError: (_error: unknown) => {
      toastError(t('common.error'));
    },
  });

  // ─── OAuth Clients ──────────────────────────────────────────

  const { data: oauthClients = [], isLoading: oauthLoading } = useQuery({
    queryKey: ['mcp-oauth-clients'],
    queryFn: async () => {
      const res = await mcpApi.getOAuthClients();
      if (res.data.code === 0) return res.data.data as McpOAuthClient[];
      throw new Error(res.data.msg);
    },
  });

  const createOAuthMutation = useMutation({
    mutationFn: (data: { app_name: string; redirect_uris: string[]; scope?: string }) =>
      mcpApi.createOAuthClient(data),
    onSuccess: (res) => {
      if (res.data.code === 0) {
        setNewOAuthClient(res.data.data);
        setShowCreateOAuthModal(false);
        setOAuthAppName('');
        setRedirectUris([]);
        setOAuthScope('');
        queryClient.invalidateQueries({ queryKey: ['mcp-oauth-clients'] });
        toastSuccess(t('common.success'));
      } else {
        toastError(res.data.msg || t('common.error'));
      }
    },
    onError: (_error: unknown) => {
      toastError(t('common.error'));
    },
  });

  const deleteOAuthMutation = useMutation({
    mutationFn: (clientId: string) => mcpApi.deleteOAuthClient(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-clients'] });
      toastSuccess(t('common.success'));
    },
    onError: (_error: unknown) => {
      toastError(t('common.error'));
    },
  });

  // ─── OAuth Tokens ───────────────────────────────────────────

  const { data: oauthTokens = [], isLoading: tokensLoading } = useQuery({
    queryKey: ['mcp-oauth-tokens'],
    queryFn: async () => {
      const res = await mcpApi.getOAuthTokens();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: number) => mcpApi.revokeOAuthToken(tokenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-tokens'] });
      toastSuccess(t('common.success'));
    },
    onError: (_error: unknown) => {
      toastError(t('common.error'));
    },
  });

  const updateScopeMutation = useMutation({
    mutationFn: ({ clientId, scope }: { clientId: string; scope: string }) =>
      mcpApi.updateOAuthClientScope(clientId, scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-clients'] });
      setShowScopeModal(false);
      setEditingClient(null);
      toastSuccess(t('common.success'));
    },
    onError: (_error: unknown) => {
      toastError(t('common.error'));
    },
  });

  const updateExpiryMutation = useMutation({
    mutationFn: ({ clientId, expires_at }: { clientId: string; expires_at: string | null }) =>
      mcpApi.updateOAuthClientExpiry(clientId, expires_at),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-clients'] });
      setShowExpiryModal(false);
      setEditingClient(null);
      toastSuccess(t('common.success'));
    },
    onError: (_error: unknown) => {
      toastError(t('common.error'));
    },
  });

  // ─── Handlers ──────────────────────────────────────────────

  // OAuth handlers
  const handleCreateOAuth = async () => {
    if (!oauthAppName.trim()) {
      toastError(t('mcp.oauthAppNameRequired'));
      return;
    }
    createOAuthMutation.mutate({
      app_name: oauthAppName,
      redirect_uris: redirectUris,
      scope: oauthScope || undefined,
    });
  };

  const handleAddRedirectUri = (value: string, context: { e: React.KeyboardEvent }) => {
    if (context.e.key === 'Enter' && value.trim()) {
      context.e.preventDefault();
      if (!redirectUris.includes(value.trim())) {
        setRedirectUris([...redirectUris, value.trim()]);
      }
      setRedirectUriInput('');
    }
  };

  const handleRemoveRedirectUri = (uri: string) => {
    setRedirectUris(redirectUris.filter(u => u !== uri));
  };

  const handleDeleteOAuthClient = (client: McpOAuthClient) => {
    openConfirm(
      t('mcp.oauthDelete'),
      t('mcp.oauthDeleteConfirm'),
      t('common.delete'),
      'danger',
      () => deleteOAuthMutation.mutate(client.client_id),
    );
  };

  const handleCloseOAuthModal = () => {
    setShowCreateOAuthModal(false);
    setOAuthAppName('');
    setRedirectUris([]);
    setRedirectUriInput('');
    setOAuthScope('');
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toastSuccess(t('mcp.copied'));
  };

  const handleCreateKey = () => {
    if (!keyDescription.trim()) {
      toastError(t('mcp.descriptionRequired'));
      return;
    }
    createKeyMutation.mutate({
      description: keyDescription,
      expiresAt: keyExpiry || undefined,
    });
  };

  const handleRevokeKey = (keyId: number) => {
    openConfirm(
      t('mcp.confirmRevoke'),
      t('mcp.confirmRevokeBody'),
      t('mcp.revoke'),
      'warning',
      () => revokeKeyMutation.mutate(keyId),
    );
  };

  const handleDeleteKey = (keyId: number) => {
    openConfirm(
      t('mcp.confirmDelete'),
      t('mcp.confirmDeleteBody'),
      t('common.delete'),
      'danger',
      () => deleteKeyMutation.mutate(keyId),
    );
  };

  const handleShowCreateModal = () => {
    setShowCreateKeyModal(true);
  };

  const handleCloseCreateModal = () => {
    setShowCreateKeyModal(false);
    setKeyDescription('');
    setKeyExpiry('');
  };

  // ─── Render ──────────────────────────────────────────────

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h2>{t('common.mcp')}</h2>
          <p>{t('mcp.subtitle')}</p>
        </div>
      </div>

      {/* 公共端点 & 配置信息 */}
      <Card bordered={false} shadow={false} style={{ marginBottom: 24 }}>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 15, userSelect: 'none', color: 'var(--td-text-color-primary)' }}>{t('mcp.endpointTitle')}</summary>
          <div style={{ marginTop: 16 }}>
            {/* 协议端点 */}
            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--td-text-color-primary)' }}>{t('mcp.protocolEndpoints')}</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--td-text-color-secondary)', fontWeight: 500 }}>{t('mcp.endpoint')}</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--td-text-color-secondary)', fontWeight: 500 }}>{t('mcp.method')}</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--td-text-color-secondary)', fontWeight: 500 }}>{t('mcp.description')}</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp</code></td>
                  <td style={{ padding: '8px' }}>GET / POST</td>
                  <td style={{ padding: '8px' }}>{t('mcp.streamableHttpDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/sse</code></td>
                  <td style={{ padding: '8px' }}>GET</td>
                  <td style={{ padding: '8px' }}>{t('mcp.sseDesc')}</td>
                </tr>
              </tbody>
            </table>

            {/* OAuth 端点 */}
            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--td-text-color-primary)' }}>{t('mcp.oauthEndpoints')}</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 20 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--td-text-color-secondary)', fontWeight: 500 }}>{t('mcp.endpoint')}</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--td-text-color-secondary)', fontWeight: 500 }}>{t('mcp.method')}</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--td-text-color-secondary)', fontWeight: 500 }}>{t('mcp.description')}</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/.well-known/mcp.json</code></td>
                  <td style={{ padding: '8px' }}>GET</td>
                  <td style={{ padding: '8px' }}>{t('mcp.mcpDiscoveryDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/.well-known/oauth-protected-resource</code></td>
                  <td style={{ padding: '8px' }}>GET</td>
                  <td style={{ padding: '8px' }}>{t('mcp.oauthDiscoveryEndpointDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/.well-known/jwks.json</code></td>
                  <td style={{ padding: '8px' }}>GET</td>
                  <td style={{ padding: '8px' }}>{t('mcp.jwksDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/.well-known/oauth-authorization-server</code></td>
                  <td style={{ padding: '8px' }}>GET</td>
                  <td style={{ padding: '8px' }}>{t('mcp.oauthAuthServerMetadataDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/oauth/authorize</code></td>
                  <td style={{ padding: '8px' }}>GET</td>
                  <td style={{ padding: '8px' }}>{t('mcp.oauthAuthorizeDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/oauth/token</code></td>
                  <td style={{ padding: '8px' }}>POST</td>
                  <td style={{ padding: '8px' }}>{t('mcp.oauthTokenDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/oauth/register</code></td>
                  <td style={{ padding: '8px' }}>POST</td>
                  <td style={{ padding: '8px' }}>{t('mcp.oauthRegisterEndpointDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/oauth/introspect</code></td>
                  <td style={{ padding: '8px' }}>POST</td>
                  <td style={{ padding: '8px' }}>{t('mcp.oauthIntrospectDesc')}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--td-component-stroke)' }}>
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 12 }}><code>{baseUrl}/api/mcp/oauth/revoke</code></td>
                  <td style={{ padding: '8px' }}>POST</td>
                  <td style={{ padding: '8px' }}>{t('mcp.oauthRevokeDesc')}</td>
                </tr>
              </tbody>
            </table>

            {/* OAuth 自动发现说明 */}
            <div style={{
              background: 'var(--td-bg-color-secondary)',
              border: '1px solid var(--td-component-stroke)',
              borderRadius: 6,
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--td-text-color-secondary)',
            }}>
              <strong style={{ color: 'var(--td-text-color-primary)' }}>{t('mcp.oauthDiscoveryTitle')}</strong>
              <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                <li>{t('mcp.oauthDiscoveryStep1')}</li>
                <li>{t('mcp.oauthDiscoveryStep2')}</li>
                <li>{t('mcp.oauthDiscoveryStep3')}</li>
                <li>{t('mcp.oauthDiscoveryStep4')}</li>
              </ol>
            </div>

            {/* JSON 配置展示 */}
            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--td-text-color-primary)' }}>{t('mcp.configSamples')}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 500, color: 'var(--td-text-color-primary)' }}>{t('mcp.configApiKey')}</p>
                <div className="token-code-box" style={{ display: 'block', padding: 12 }}>
                  <code style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6 }}>{JSON.stringify({
                    mcpServers: {
                      hidns: {
                        url: `${baseUrl}/api/mcp`,
                        transport: 'streamable-http',
                        headers: {
                          'API-Key': 'your-api-key-here'
                        }
                      }
                    }
                  }, null, 2)}</code>
                </div>
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 500, color: 'var(--td-text-color-primary)' }}>{t('mcp.configOAuth')}</p>
                <div className="token-code-box" style={{ display: 'block', padding: 12 }}>
                  <code style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6 }}>{JSON.stringify({
                    mcpServers: {
                      hidns: {
                        url: `${baseUrl}/api/mcp`,
                        transport: 'streamable-http',
                      }
                    }
                  }, null, 2)}</code>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--td-text-color-secondary)' }}>
                  {t('mcp.oauthDiscoveryStep1')}
                </p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 500, color: 'var(--td-text-color-primary)' }}>{t('mcp.configSSEApiKey')}</p>
                <div className="token-code-box" style={{ display: 'block', padding: 12 }}>
                  <code style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6 }}>{JSON.stringify({
                    mcpServers: {
                      hidns: {
                        url: `${baseUrl}/api/mcp/sse`,
                        transport: 'sse',
                        headers: {
                          'API-Key': 'your-api-key-here'
                        }
                      }
                    }
                  }, null, 2)}</code>
                </div>
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 500, color: 'var(--td-text-color-primary)' }}>{t('mcp.configSSEOAuth')}</p>
                <div className="token-code-box" style={{ display: 'block', padding: 12 }}>
                  <code style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6 }}>{JSON.stringify({
                    mcpServers: {
                      hidns: {
                        url: `${baseUrl}/api/mcp/sse`,
                        transport: 'sse',
                      }
                    }
                  }, null, 2)}</code>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--td-text-color-secondary)' }}>
                  {t('mcp.oauthDiscoveryStep1')}
                </p>
              </div>
            </div>
            {/* 动态注册脚本示例 */}
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 500, color: 'var(--td-text-color-primary)' }}>{t('mcp.configOAuthDiscovery')}</p>
              <div style={{
                background: '#1e1e1e',
                borderRadius: 6,
                padding: 12,
                marginBottom: 8,
              }}>
                <code style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.6, color: '#d4d4d4' }}>{`# 客户端自动注册（无需管理员操作）
curl -X POST ${baseUrl}/api/mcp/oauth/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "client_name": "my-mcp-client",
    "redirect_uris": ["http://localhost:3000/callback"],
    "scope": "dns:read dns:write"
  }'

# 返回示例：
# {
#   "client_id": "hidns_mcp_xxx",
#   "client_secret": "xxx",
#   "client_id_issued_at": 1700000000,
#   "client_secret_expires_at": 0,
#   "client_name": "my-mcp-client",
#   "redirect_uris": ["http://localhost:3000/callback"],
#   "token_endpoint_auth_method": "client_secret_post"
# }`}</code>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--td-text-color-secondary)' }}>
                注册后使用 <code style={{ fontSize: 12 }}>client_credentials</code> 或 <code style={{ fontSize: 12 }}>authorization_code</code> 获取 Access Token，然后以 <code style={{ fontSize: 12 }}>Bearer</code> 方式调用 MCP 接口。
              </p>
            </div>
          </div>
        </details>
      </Card>

      {/* Tabs */}
      <Tabs
        className="page-tabs"
        theme="card"
        value={activeTab}
        list={[
          { value: 'keys', label: t('mcp.apiKeys') },
          { value: 'oauth', label: t('mcp.oauth') },
        ]}
        onChange={(value) => setActiveTab(value as 'keys' | 'oauth')}
      />

      {/* API Keys Tab */}
      {activeTab === 'keys' && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{t('mcp.apiKeys')}</h3>
            <Button icon={<AddIcon />} onClick={handleShowCreateModal}>
              {t('mcp.createApiKey')}
            </Button>
          </div>

          {keysLoading ? (
            <Loading />
          ) : (
            <Table
              rowKey="id"
              data={apiKeys}
              columns={[
                { colKey: 'id', title: 'ID', width: 80 },
                { 
                  colKey: 'description', 
                  title: t('mcp.description'),
                  width: 200,
                  ellipsis: true,
                },
                {
                  colKey: 'api_key',
                  title: 'API Key',
                  width: 200,
                  cell: ({ row }: any) => {
                    const maskedKey = row.api_key
                      ? `${row.api_key.substring(0, 20)}...`
                      : '••••••••••••••••••••';
                    return (
                      <Space>
                        <code style={{ fontSize: 12 }}>{maskedKey}</code>
                        {row.api_key && (
                          <Tooltip content={t('mcp.copy')}>
                            <Button
                              size="small"
                              variant="text"
                              icon={<CopyIcon />}
                              onClick={() => handleCopyKey(row.api_key)}
                            />
                          </Tooltip>
                        )}
                      </Space>
                    );
                  },
                },
                {
                  colKey: 'created_at',
                  title: t('mcp.createdAt'),
                  width: 180,
                  cell: ({ row }: any) => formatDate(row.created_at, locale),
                },
                {
                  colKey: 'last_used_at',
                  title: t('mcp.lastUsed'),
                  width: 180,
                  cell: ({ row }: any) => formatDate(row.last_used_at, locale),
                },
                {
                  colKey: 'expires_at',
                  title: t('mcp.expiresAt'),
                  width: 180,
                  cell: ({ row }: any) => 
                    row.expires_at 
                      ? formatDate(row.expires_at, locale)
                      : t('mcp.neverExpires'),
                },
                {
                  colKey: 'status',
                  title: t('mcp.status'),
                  width: 100,
                  cell: ({ row }: any) => {
                    if (row.revoked_at) {
                      return <Tag theme="danger">{t('mcp.revoked')}</Tag>;
                    }
                    if (row.expires_at && new Date(row.expires_at) < new Date()) {
                      return <Tag theme="warning">{t('mcp.expired')}</Tag>;
                    }
                    return <Tag theme="success">{t('mcp.active')}</Tag>;
                  },
                },
                {
                  colKey: 'actions',
                  title: t('mcp.actions'),
                  width: 150,
                  fixed: 'right',
                  cell: ({ row }: any) => (
                    <Space>
                      {!row.revoked_at && (
                        <Button
                          size="small"
                          variant="text"
                          theme="warning"
                          onClick={() => handleRevokeKey(row.id)}
                          loading={revokeKeyMutation.isPending}
                        >
                          {t('mcp.revoke')}
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="text"
                        theme="danger"
                        icon={<DeleteIcon />}
                        onClick={() => handleDeleteKey(row.id)}
                        loading={deleteKeyMutation.isPending}
                      />
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </>
      )}

      {/* OAuth Apps Tab */}
      {activeTab === 'oauth' && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{t('mcp.oauth')}</h3>
            <Button icon={<AddIcon />} onClick={() => setShowCreateOAuthModal(true)}>
              {t('mcp.createOAuthClient')}
            </Button>
          </div>

          <Card style={{ marginBottom: 16 }}>
            <Alert theme="info" message={t('mcp.oauthDesc')} style={{ marginBottom: 16 }} />
          </Card>

          {oauthLoading ? (
            <Loading />
          ) : oauthClients.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--td-text-color-secondary)' }}>
                {t('mcp.oauthNoClients')}
              </div>
            </Card>
          ) : (
            <Card>
              {oauthClients.map((client, idx) => (
                <div key={client.client_id}>
                  {idx > 0 && <Divider style={{ margin: '12px 0' }} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <strong>{client.app_name}</strong>
                        {client.expires_at && new Date(client.expires_at) < new Date() && (
                          <Tag theme="danger" variant="light" size="small">Expired</Tag>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--td-text-color-secondary)', fontFamily: 'monospace' }}>
                        {client.client_id}
                      </div>
                      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                        <span>{t('mcp.oauthScope')}: {client.scope ? (() => { try { return JSON.parse(client.scope).join(', '); } catch { return client.scope; } })() : '-'}</span>
                        {' | '}
                        <span>{t('mcp.oauthExpiresAt')}: {client.expires_at ? formatDate(client.expires_at, locale) : t('mcp.oauthNeverExpires')}</span>
                      </div>
                    </div>
                    <Space>
                      <Button
                        size="small"
                        variant="text"
                        icon={<EditIcon />}
                        onClick={() => {
                          setEditingClient(client);
                          setEditScope(client.scope ? (() => { try { return JSON.parse(client.scope).join(', '); } catch { return client.scope; } })() : '');
                          setShowScopeModal(true);
                        }}
                      >
                        {t('mcp.oauthModifyScope')}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        icon={<EditIcon />}
                        onClick={() => {
                          setEditingClient(client);
                          setEditExpiry(client.expires_at || '');
                          setShowExpiryModal(true);
                        }}
                      >
                        {t('mcp.oauthModifyExpiry')}
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        theme="danger"
                        icon={<DeleteIcon />}
                        onClick={() => handleDeleteOAuthClient(client)}
                      >
                        {t('mcp.oauthDelete')}
                      </Button>
                    </Space>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--td-text-color-secondary)' }}>
                    {t('mcp.oauthRedirectUris')}: {(() => { try { return JSON.parse(client.redirect_uris).join(', '); } catch { return client.redirect_uris; } })()}
                  </div>
                </div>
              ))}
            </Card>
          )}

        {/* Issued Access Tokens */}
        <Card style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <h4>{t('mcp.oauthTokensSection')}</h4>
            <p style={{ marginTop: 4, color: 'var(--td-text-color-secondary)', fontSize: 14 }}>{t('mcp.oauthTokensDesc')}</p>
          </div>

          {tokensLoading ? (
            <Loading />
          ) : oauthTokens.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--td-text-color-secondary)' }}>
              {t('mcp.oauthNoTokens')}
            </div>
          ) : (
            <Table
              rowKey="id"
              data={oauthTokens}
              columns={[
                { colKey: 'id', title: 'ID', width: 60 },
                {
                  colKey: 'app_name',
                  title: t('mcp.oauthAppName'),
                  width: 160,
                  cell: ({ row }: any) => row.app_name || '-',
                },
                {
                  colKey: 'access_token',
                  title: t('mcp.oauthClientId'),
                  width: 250,
                  cell: ({ row }: any) => (
                    <code style={{ fontSize: 12 }}>{row.access_token.substring(0, 20)}...{row.access_token.slice(-8)}</code>
                  ),
                },
                {
                  colKey: 'scope',
                  title: t('mcp.oauthScope'),
                  width: 160,
                  cell: ({ row }: any) => {
                    if (!row.scope) return '*';
                    try { return JSON.parse(row.scope).join(', '); } catch { return row.scope; }
                  },
                },
                {
                  colKey: 'status',
                  title: t('mcp.oauthTokenStatus'),
                  width: 100,
                  cell: ({ row }: any) => {
                    if (row.revoked_at) return <Tag theme="danger" variant="light">{t('mcp.oauthTokenRevoked')}</Tag>;
                    if (new Date(row.expires_at) < new Date()) return <Tag theme="warning" variant="light">{t('mcp.oauthTokenExpired')}</Tag>;
                    return <Tag theme="success" variant="light">{t('mcp.oauthTokenActive')}</Tag>;
                  },
                },
                {
                  colKey: 'created_at',
                  title: t('mcp.oauthTokenCreatedAt'),
                  width: 160,
                  cell: ({ row }: any) => formatDate(row.created_at, locale),
                },
                {
                  colKey: 'expires_at',
                  title: t('mcp.oauthTokenExpiresAt'),
                  width: 160,
                  cell: ({ row }: any) => row.revoked_at ? '-' : formatDate(row.expires_at, locale),
                },
                {
                  colKey: 'actions',
                  title: t('mcp.actions'),
                  width: 120,
                  fixed: 'right',
                  cell: ({ row }: any) => {
                    if (row.revoked_at || new Date(row.expires_at) < new Date()) return <span style={{ color: 'var(--td-text-color-secondary)', fontSize: 12 }}>-</span>;
                    return (
                      <Button
                        size="small"
                        variant="text"
                        theme="danger"
                        icon={<DeleteIcon />}
                        onClick={() => {
                          openConfirm(
                            t('mcp.oauthTokenRevoke'),
                            t('mcp.oauthTokenConfirmRevoke'),
                            t('common.delete'),
                            'danger',
                            () => revokeTokenMutation.mutate(row.id),
                          );
                        }}
                        loading={revokeTokenMutation.isPending}
                      >
                        {t('mcp.oauthTokenRevoke')}
                      </Button>
                    );
                  },
                },
              ]}
            />
          )}
        </Card>
      </>
    )}

      {/* Create API Key Modal */}
      {showCreateKeyModal && (
        <Modal title={t('mcp.createKeyModalTitle')} onClose={handleCloseCreateModal} size="md">
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('mcp.descriptionRequired')}</label>
              <Input
                placeholder={t('mcp.descriptionPlaceholder')}
                value={keyDescription}
                onChange={(val) => setKeyDescription(val)}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('mcp.expiryOptional')}</label>
              <input
                type="date"
                value={keyExpiry}
                onChange={(e) => setKeyExpiry(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--td-component-stroke)', borderRadius: 3 }}
              />
              <small style={{ color: 'var(--td-text-color-secondary)', display: 'block', marginTop: 4 }}>{t('mcp.expiryHint')}</small>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button variant="outline" onClick={handleCloseCreateModal}>{t('mcp.cancel')}</Button>
            <Button theme="primary" onClick={handleCreateKey} loading={createKeyMutation.isPending}>{t('mcp.create')}</Button>
          </div>
        </Modal>
      )}

      {/* Show New API Key */}
      {newApiKey && (
        <Modal title={t('mcp.createSuccessTitle')} onClose={() => setNewApiKey(null)} size="lg">
          <Alert theme="warning" message={t('mcp.createSuccessWarning')} style={{ marginBottom: 12 }} />
          <code style={{ 
            display: 'block', 
            padding: 12, 
            background: 'var(--td-bg-color-secondary)', 
            borderRadius: 4,
            wordBreak: 'break-all',
            fontSize: 13,
            marginBottom: 16,
          }}>
            {newApiKey}
          </code>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              icon={<CopyIcon />}
              onClick={() => handleCopyKey(newApiKey)}
              theme="primary"
            >
              {copied ? t('mcp.copied') : t('mcp.copy')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Create OAuth App Modal */}
      {showCreateOAuthModal && (
        <Modal title={t('mcp.createOAuthClient')} onClose={handleCloseOAuthModal} size="md">
          <div style={{ padding: '16px 0' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('mcp.oauthAppNameRequired')}</label>
              <Input
                placeholder={t('mcp.oauthAppNamePlaceholder')}
                value={oauthAppName}
                onChange={(val) => setOAuthAppName(val)}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('mcp.oauthRedirectUris')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {redirectUris.map((uri) => (
                  <Tag
                    key={uri}
                    closable
                    onClose={() => handleRemoveRedirectUri(uri)}
                    style={{ marginRight: 4 }}
                  >
                    {uri}
                  </Tag>
                ))}
              </div>
              <Input
                placeholder={t('mcp.oauthRedirectUrisPlaceholder')}
                value={redirectUriInput}
                onChange={(val) => setRedirectUriInput(val)}
                onKeydown={handleAddRedirectUri}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('mcp.oauthScope')}</label>
              <Input
                placeholder={t('mcp.oauthScopePlaceholder')}
                value={oauthScope}
                onChange={(val) => setOAuthScope(val)}
              />
              <small style={{ color: 'var(--td-text-color-secondary)', display: 'block', marginTop: 4 }}>{t('mcp.oauthScopeDesc')}</small>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button variant="outline" onClick={handleCloseOAuthModal}>{t('mcp.cancel')}</Button>
            <Button theme="primary" onClick={handleCreateOAuth} loading={createOAuthMutation.isPending}>{t('mcp.createOAuthClient')}</Button>
          </div>
        </Modal>
      )}

      {/* Show New OAuth Client Secret */}
      {newOAuthClient && (
        <Modal title={t('mcp.oauthCreateSuccess')} onClose={() => setNewOAuthClient(null)} size="lg">
          <Alert theme="warning" message={t('mcp.oauthCreateWarning')} style={{ marginBottom: 12 }} />
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('mcp.oauthClientId')}</label>
            <code style={{
              display: 'block',
              padding: 12,
              background: 'var(--td-bg-color-secondary)',
              borderRadius: 4,
              wordBreak: 'break-all',
              fontSize: 13,
            }}>
              {newOAuthClient.client_id}
            </code>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>{t('mcp.oauthClientSecret')}</label>
            <code style={{
              display: 'block',
              padding: 12,
              background: 'var(--td-bg-color-secondary)',
              borderRadius: 4,
              wordBreak: 'break-all',
              fontSize: 13,
            }}>
              {newOAuthClient.client_secret}
            </code>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              icon={<CopyIcon />}
              onClick={() => {
                const text = `Client ID: ${newOAuthClient.client_id}\nClient Secret: ${newOAuthClient.client_secret}`;
                navigator.clipboard.writeText(text);
                toastSuccess(t('mcp.copied'));
              }}
              theme="primary"
            >
              {t('mcp.copy')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Scope Edit Modal */}
      {showScopeModal && editingClient && (
        <Modal title={t('mcp.oauthScopeEditTitle')} onClose={() => setShowScopeModal(false)}>
          <div style={{ padding: '16px 0' }}>
            <p className="page-description">{t('mcp.oauthScopeEditDesc')}</p>
            <Input
              value={editScope}
              onChange={(val) => setEditScope(val)}
              placeholder={t('mcp.oauthScopePlaceholder')}
              style={{ marginTop: 16 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button variant="outline" onClick={() => setShowScopeModal(false)}>{t('mcp.cancel')}</Button>
            <Button
              theme="primary"
              onClick={() => updateScopeMutation.mutate({ clientId: editingClient.client_id, scope: editScope })}
              loading={updateScopeMutation.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Expiry Edit Modal */}
      {showExpiryModal && editingClient && (
        <Modal title={t('mcp.oauthExpiryEditTitle')} onClose={() => setShowExpiryModal(false)}>
          <div style={{ padding: '16px 0' }}>
            <p style={{ margin: '0 0 12px', color: 'var(--td-text-color-secondary)', fontSize: 14 }}>{t('mcp.oauthExpiryEditDesc')}</p>
            <input
              type="date"
              value={editExpiry}
              onChange={(e) => setEditExpiry(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--td-component-stroke)', borderRadius: 3, marginTop: 16 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#666', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!editExpiry}
                  onChange={(e) => {
                    if (e.target.checked) setEditExpiry('');
                  }}
                />
                {t('mcp.oauthNoExpiry')}
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            {editExpiry && (
              <Button variant="text" onClick={() => setEditExpiry('')}>{t('mcp.oauthClearExpiry')}</Button>
            )}
            <Button variant="outline" onClick={() => setShowExpiryModal(false)}>{t('mcp.cancel')}</Button>
            <Button
              theme="primary"
              onClick={() => updateExpiryMutation.mutate({
                clientId: editingClient.client_id,
                expires_at: editExpiry || null,
              })}
              loading={updateExpiryMutation.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        </Modal>
      )}

      {/* ─── Confirm Dialog (replaces DialogPlugin.confirm) ──── */}
      <Dialog
        visible={confirmOpen}
        destroyOnClose
        placement="center"
        theme={confirmTheme}
        header={confirmTitle}
        width={420}
        confirmBtn={{ content: confirmLabel, theme: confirmTheme }}
        cancelBtn={{ content: t('mcp.cancel') }}
        onConfirm={() => {
          confirmActionRef.current();
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
        onClose={() => setConfirmOpen(false)}
        onClosed={() => {
          // clean up ref to avoid stale closures persisting across opens
          confirmActionRef.current = () => {};
        }}
      >
        <p>{confirmBody}</p>
      </Dialog>
    </div>
  );
}
