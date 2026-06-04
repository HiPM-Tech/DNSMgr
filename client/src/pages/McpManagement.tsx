import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, DialogPlugin, Divider, Input, Loading, Space, Table, Tag, Tooltip } from 'tdesign-react';
import { AddIcon, CopyIcon, DeleteIcon, EditIcon } from 'tdesign-icons-react';
import { useToast } from '../hooks/useToast';
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

export function McpManagement() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'config' | 'keys' | 'oauth' | 'audit'>('config');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [keyDescription, setKeyDescription] = useState('');
  const [keyExpiry, setKeyExpiry] = useState('');
  const [copied, setCopied] = useState(false);

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
        toast.success(t('common.success'));
      } else {
        toast.error(res.data.msg || t('common.error'));
      }
    },
    onError: (_error: unknown) => {
      toast.error(t('common.error'));
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (keyId: number) => mcpApi.revokeApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-api-keys'] });
      toast.success(t('common.success'));
    },
    onError: (_error: unknown) => {
      toast.error(t('common.error'));
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: number) => mcpApi.deleteApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-api-keys'] });
      toast.success(t('common.success'));
    },
    onError: (_error: unknown) => {
      toast.error(t('common.error'));
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
        toast.success(t('common.success'));
      } else {
        toast.error(res.data.msg || t('common.error'));
      }
    },
    onError: (_error: unknown) => {
      toast.error(t('common.error'));
    },
  });

  const deleteOAuthMutation = useMutation({
    mutationFn: (clientId: string) => mcpApi.deleteOAuthClient(clientId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-clients'] });
      toast.success(t('common.success'));
    },
    onError: (_error: unknown) => {
      toast.error(t('common.error'));
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
      toast.success(t('common.success'));
    },
    onError: (_error: unknown) => {
      toast.error(t('common.error'));
    },
  });

  const updateScopeMutation = useMutation({
    mutationFn: ({ clientId, scope }: { clientId: string; scope: string }) =>
      mcpApi.updateOAuthClientScope(clientId, scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-clients'] });
      setShowScopeModal(false);
      setEditingClient(null);
      toast.success(t('common.success'));
    },
    onError: (_error: unknown) => {
      toast.error(t('common.error'));
    },
  });

  const updateExpiryMutation = useMutation({
    mutationFn: ({ clientId, expires_at }: { clientId: string; expires_at: string | null }) =>
      mcpApi.updateOAuthClientExpiry(clientId, expires_at),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-oauth-clients'] });
      setShowExpiryModal(false);
      setEditingClient(null);
      toast.success(t('common.success'));
    },
    onError: (_error: unknown) => {
      toast.error(t('common.error'));
    },
  });

  // ─── Handlers ──────────────────────────────────────────────

  // OAuth handlers
  const handleCreateOAuth = async () => {
    if (!oauthAppName.trim()) {
      toast.error(t('mcp.oauthAppNameRequired'));
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
    DialogPlugin.confirm({
      header: t('mcp.oauthDelete'),
      body: t('mcp.oauthDeleteConfirm'),
      confirmBtn: t('common.delete'),
      cancelBtn: t('mcp.cancel'),
      theme: 'danger',
      onConfirm: () => {
        deleteOAuthMutation.mutate(client.client_id);
      },
    });
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
    toast.success(t('mcp.copied'));
  };

  const handleCreateKey = () => {
    if (!keyDescription.trim()) {
      toast.error(t('mcp.descriptionRequired'));
      return;
    }
    createKeyMutation.mutate({
      description: keyDescription,
      expiresAt: keyExpiry || undefined,
    });
  };

  const handleRevokeKey = (keyId: number) => {
    DialogPlugin.confirm({
      header: t('mcp.confirmRevoke'),
      body: t('mcp.confirmRevokeBody'),
      confirmBtn: t('mcp.revoke'),
      cancelBtn: t('mcp.cancel'),
      theme: 'warning',
      onConfirm: () => {
        revokeKeyMutation.mutate(keyId);
      },
    });
  };

  const handleDeleteKey = (keyId: number) => {
    DialogPlugin.confirm({
      header: t('mcp.confirmDelete'),
      body: t('mcp.confirmDeleteBody'),
      confirmBtn: t('common.delete'),
      cancelBtn: t('mcp.cancel'),
      theme: 'danger',
      onConfirm: () => {
        deleteKeyMutation.mutate(keyId);
      },
    });
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
    <div className="page-container">
      <div className="page-header">
        <h2>{t('common.mcp')}</h2>
        <p className="page-description">{t('mcp.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="tab-nav" style={{ marginBottom: 16 }}>
        <button
          className={`tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
          onClick={() => setActiveTab('keys')}
        >
          {t('mcp.apiKeys')}
        </button>
        <button
          className={`tab-btn ${activeTab === 'oauth' ? 'active' : ''}`}
          onClick={() => setActiveTab('oauth')}
        >
          {t('mcp.oauth')}
        </button>
      </div>

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
                  cell: (row: any) => row.description || '-'
                },
                {
                  colKey: 'api_key',
                  title: 'API Key',
                  width: 200,
                  cell: (row: any) => (
                    <Space>
                      <code style={{ fontSize: 12 }}>{row.api_key.substring(0, 20)}...</code>
                      <Tooltip content={t('mcp.copy')}>
                        <Button
                          size="small"
                          variant="text"
                          icon={<CopyIcon />}
                          onClick={() => handleCopyKey(row.api_key)}
                        />
                      </Tooltip>
                    </Space>
                  ),
                },
                {
                  colKey: 'created_at',
                  title: t('mcp.createdAt'),
                  width: 180,
                  cell: (row: any) => formatDate(row.created_at, locale),
                },
                {
                  colKey: 'last_used_at',
                  title: t('mcp.lastUsed'),
                  width: 180,
                  cell: (row: any) => formatDate(row.last_used_at, locale),
                },
                {
                  colKey: 'expires_at',
                  title: t('mcp.expiresAt'),
                  width: 180,
                  cell: (row: any) => 
                    row.expires_at 
                      ? formatDate(row.expires_at, locale)
                      : t('mcp.neverExpires'),
                },
                {
                  colKey: 'status',
                  title: t('mcp.status'),
                  width: 100,
                  cell: (row: any) => {
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
                  cell: (row: any) => (
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
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#999' }}>
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
                      <div style={{ fontSize: 12, color: '#999', fontFamily: 'monospace' }}>
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
                  <div style={{ fontSize: 12, color: '#999' }}>
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
            <p className="page-description" style={{ marginTop: 4 }}>{t('mcp.oauthTokensDesc')}</p>
          </div>

          {tokensLoading ? (
            <Loading />
          ) : oauthTokens.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#999' }}>
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
                  cell: (row: any) => row.app_name || '-',
                },
                {
                  colKey: 'access_token',
                  title: t('mcp.oauthClientId'),
                  width: 250,
                  cell: (row: any) => (
                    <code style={{ fontSize: 12 }}>{row.access_token.substring(0, 20)}...{row.access_token.slice(-8)}</code>
                  ),
                },
                {
                  colKey: 'scope',
                  title: t('mcp.oauthScope'),
                  width: 160,
                  cell: (row: any) => {
                    if (!row.scope) return '*';
                    try { return JSON.parse(row.scope).join(', '); } catch { return row.scope; }
                  },
                },
                {
                  colKey: 'status',
                  title: t('mcp.oauthTokenStatus'),
                  width: 100,
                  cell: (row: any) => {
                    if (row.revoked_at) return <Tag theme="danger" variant="light">{t('mcp.oauthTokenRevoked')}</Tag>;
                    if (new Date(row.expires_at) < new Date()) return <Tag theme="warning" variant="light">{t('mcp.oauthTokenExpired')}</Tag>;
                    return <Tag theme="success" variant="light">{t('mcp.oauthTokenActive')}</Tag>;
                  },
                },
                {
                  colKey: 'created_at',
                  title: t('mcp.oauthTokenCreatedAt'),
                  width: 160,
                  cell: (row: any) => formatDate(row.created_at, locale),
                },
                {
                  colKey: 'expires_at',
                  title: t('mcp.oauthTokenExpiresAt'),
                  width: 160,
                  cell: (row: any) => row.revoked_at ? '-' : formatDate(row.expires_at, locale),
                },
                {
                  colKey: 'actions',
                  title: t('mcp.actions'),
                  width: 120,
                  fixed: 'right',
                  cell: (row: any) => {
                    if (row.revoked_at || new Date(row.expires_at) < new Date()) return <span style={{ color: '#999', fontSize: 12 }}>-</span>;
                    return (
                      <Button
                        size="small"
                        variant="text"
                        theme="danger"
                        icon={<DeleteIcon />}
                        onClick={() => {
                          DialogPlugin.confirm({
                            header: t('mcp.oauthTokenRevoke'),
                            body: t('mcp.oauthTokenConfirmRevoke'),
                            confirmBtn: t('common.delete'),
                            cancelBtn: t('mcp.cancel'),
                            theme: 'danger',
                            onConfirm: () => revokeTokenMutation.mutate(row.id),
                          });
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
                style={{ width: '100%', padding: '8px 12px', border: '1px solid #dcdcdc', borderRadius: 3 }}
              />
              <small style={{ color: '#999', display: 'block', marginTop: 4 }}>{t('mcp.expiryHint')}</small>
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
            background: '#f5f5f5', 
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
              <small style={{ color: '#999', display: 'block', marginTop: 4 }}>{t('mcp.oauthScopeDesc')}</small>
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
              background: '#f5f5f5',
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
              background: '#f5f5f5',
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
                toast.success(t('mcp.copied'));
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
            <p className="page-description">{t('mcp.oauthExpiryEditDesc')}</p>
            <input
              type="date"
              value={editExpiry}
              onChange={(e) => setEditExpiry(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #dcdcdc', borderRadius: 3, marginTop: 16 }}
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
    </div>
  );
}
