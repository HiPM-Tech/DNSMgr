import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, DialogPlugin, Input, Loading, Pagination, Space, Switch, Table, Tag, Tooltip } from 'tdesign-react';
import { AddIcon, CopyIcon, DeleteIcon, DownloadIcon, RefreshIcon } from 'tdesign-icons-react';
import { useToast } from '../hooks/useToast';
import { mcpApi } from '../api';
import { useI18n } from '../contexts/I18nContext';
import { Modal } from '../components/Modal';
import type { McpApiKey, McpGlobalConfig } from '../api/mcp';

// 简单的日期格式化函数（替代 dayjs）
function formatDate(dateString: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).replace(/\//g, '-');
}

export function McpManagement() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'config' | 'keys' | 'audit'>('config');
  const [showCreateKeyModal, setShowCreateKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [keyDescription, setKeyDescription] = useState('');
  const [keyExpiry, setKeyExpiry] = useState('');
  const [copied, setCopied] = useState(false);

  // Audit log filters
  const [auditFilters, setAuditFilters] = useState({
    userId: '',
    action: '',
    startDate: '',
    endDate: '',
    page: 1,
    pageSize: 20,
  });

  // ─── Global Config ──────────────────────────────────────────────

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['mcp-config'],
    queryFn: async () => {
      const res = await mcpApi.getGlobalConfig();
      if (res.data.code === 0) return res.data.data as McpGlobalConfig;
      throw new Error(res.data.msg);
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: (enabled: boolean) => mcpApi.updateGlobalConfig(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-config'] });
      toast.success(t('settings.saved') || '配置已更新');
    },
    onError: (error: any) => {
      toast.error(error.message || t('common.error') || '更新失败');
    },
  });

  // ─── API Keys ──────────────────────────────────────────────

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
        toast.success(t('common.success') || 'API Key 创建成功');
      } else {
        toast.error(res.data.msg || '创建失败');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || '创建失败');
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (keyId: number) => mcpApi.revokeApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-api-keys'] });
      toast.success('API Key 已撤销');
    },
    onError: (error: any) => {
      toast.error(error.message || '撤销失败');
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (keyId: number) => mcpApi.deleteApiKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-api-keys'] });
      toast.success('API Key 已删除');
    },
    onError: (error: any) => {
      toast.error(error.message || '删除失败');
    },
  });

  // ─── Audit Logs ──────────────────────────────────────────────

  const { data: auditLogs, isLoading: auditLoading } = useQuery({
    queryKey: ['mcp-audit-logs', auditFilters],
    queryFn: async () => {
      const params: any = {
        page: auditFilters.page,
        pageSize: auditFilters.pageSize,
      };
      if (auditFilters.userId) params.userId = parseInt(auditFilters.userId);
      if (auditFilters.action) params.action = auditFilters.action;
      if (auditFilters.startDate) params.startDate = auditFilters.startDate;
      if (auditFilters.endDate) params.endDate = auditFilters.endDate;

      const res = await mcpApi.getAuditLogs(params);
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const exportLogsMutation = useMutation({
    mutationFn: (format: 'csv' | 'json') => {
      const params: any = {
        format,
        startDate: auditFilters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        endDate: auditFilters.endDate || new Date().toISOString().split('T')[0],
      };
      if (auditFilters.userId) params.userId = parseInt(auditFilters.userId);
      if (auditFilters.action) params.action = auditFilters.action;
      return mcpApi.exportAuditLogs(params);
    },
    onSuccess: (res) => {
      if (res.data.code === 0) {
        const { data, content_type } = res.data.data;
        const blob = new Blob([data], { type: content_type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mcp-audit-logs.${res.data.data.format === 'csv' ? 'csv' : 'json'}`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast.success('导出成功');
      }
    },
    onError: (error: any) => {
      toast.error(error.message || '导出失败');
    },
  });

  // ─── Handlers ──────────────────────────────────────────────

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('已复制到剪贴板');
  };

  const handleCreateKey = () => {
    if (!keyDescription.trim()) {
      toast.error('请输入描述');
      return;
    }
    createKeyMutation.mutate({
      description: keyDescription,
      expiresAt: keyExpiry || undefined,
    });
  };

  const handleRevokeKey = (keyId: number) => {
    DialogPlugin.confirm({
      header: '确认撤销',
      body: '撤销后该 API Key 将无法使用，是否继续？',
      onConfirm: () => {
        revokeKeyMutation.mutate(keyId);
      },
    });
  };

  const handleDeleteKey = (keyId: number) => {
    DialogPlugin.confirm({
      header: '确认删除',
      body: '删除后无法恢复，是否继续？',
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

  if (configLoading) {
    return <Loading text="加载中..." />;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h2>{t('common.mcp')}</h2>
        <p className="page-description">{t('mcp.subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="tab-nav" style={{ marginBottom: 16 }}>
        <button
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          {t('mcp.config')}
        </button>
        <button
          className={`tab-btn ${activeTab === 'keys' ? 'active' : ''}`}
          onClick={() => setActiveTab('keys')}
        >
          {t('mcp.apiKeys')}
        </button>
        <button
          className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          {t('mcp.audit')}
        </button>
      </div>

      {/* Config Tab */}
      {activeTab === 'config' && (
        <Card title={t('mcp.configTitle')}>
          <Alert theme="info" message={t('mcp.configDesc')} style={{ marginBottom: 16 }} />
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>{t('mcp.enableMCP')}</label>
            <Space>
              <Switch
                value={config?.enabled || false}
                onChange={(checked) => updateConfigMutation.mutate(checked)}
                loading={updateConfigMutation.isPending}
              />
              <span>{config?.enabled ? t('mcp.enabled') : t('mcp.disabled')}</span>
            </Space>
          </div>
          
          {config?.updated_at && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>{t('mcp.lastUpdated')}</label>
              <span>{formatDate(config.updated_at)}</span>
            </div>
          )}

          <Card title={t('mcp.toolsOverview')} style={{ marginTop: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              <Tag theme="success">✅ DNS {t('mcp.action')} ({t('mcp.active').toLowerCase()})</Tag>
            </div>
            <p style={{ marginTop: 12, color: '#666' }}>
              {t('mcp.toolsSummary', { available: 29, total: 32, percent: '91' })}
            </p>
          </Card>
        </Card>
      )}

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
                  cell: (row: any) => formatDate(row.created_at),
                },
                {
                  colKey: 'last_used_at',
                  title: t('mcp.lastUsed'),
                  width: 180,
                  cell: (row: any) => formatDate(row.last_used_at),
                },
                {
                  colKey: 'expires_at',
                  title: t('mcp.expiresAt'),
                  width: 180,
                  cell: (row: any) => 
                    row.expires_at 
                      ? formatDate(row.expires_at)
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

      {/* Audit Logs Tab */}
      {activeTab === 'audit' && (
        <>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{t('mcp.audit')}</h3>
            <Space>
              <Button
                icon={<DownloadIcon />}
                onClick={() => exportLogsMutation.mutate('csv')}
                loading={exportLogsMutation.isPending}
              >
                {t('mcp.exportCsv')}
              </Button>
              <Button
                icon={<RefreshIcon />}
                onClick={() => queryClient.invalidateQueries({ queryKey: ['mcp-audit-logs'] })}
              >
                {t('mcp.refresh')}
              </Button>
            </Space>
          </div>

          {/* Filters */}
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{t('mcp.userId')}</label>
                <Input
                  placeholder={t('common.optional')}
                  value={auditFilters.userId}
                  onChange={(val) => setAuditFilters({ ...auditFilters, userId: val })}
                  style={{ width: 120 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{t('mcp.action')}</label>
                <Input
                  placeholder="domain_create"
                  value={auditFilters.action}
                  onChange={(val) => setAuditFilters({ ...auditFilters, action: val })}
                  style={{ width: 180 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{t('mcp.startDate')}</label>
                <input
                  type="date"
                  value={auditFilters.startDate}
                  onChange={(e) => setAuditFilters({ ...auditFilters, startDate: e.target.value })}
                  style={{ width: 160, padding: '8px 12px', border: '1px solid #dcdcdc', borderRadius: 3 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{t('mcp.endDate')}</label>
                <input
                  type="date"
                  value={auditFilters.endDate}
                  onChange={(e) => setAuditFilters({ ...auditFilters, endDate: e.target.value })}
                  style={{ width: 160, padding: '8px 12px', border: '1px solid #dcdcdc', borderRadius: 3 }}
                />
              </div>
              <div>
                <Button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['mcp-audit-logs'] })}
                >
                  {t('mcp.search')}
                </Button>
              </div>
            </div>
          </Card>

          {/* Logs Table */}
          {auditLoading ? (
            <Loading />
          ) : (
            <>
              <Table
                rowKey="id"
                data={auditLogs?.logs || []}
                columns={[
                  { colKey: 'id', title: 'ID', width: 80 },
                  { colKey: 'user_id', title: t('mcp.userId'), width: 100 },
                  { colKey: 'auth_type', title: t('mcp.authType'), width: 100 },
                  { colKey: 'module', title: t('mcp.module'), width: 120 },
                  { colKey: 'action', title: t('mcp.action'), width: 180 },
                  {
                    colKey: 'response_status',
                    title: t('mcp.status'),
                    width: 100,
                    cell: (row: any) => (
                      <Tag theme={row.response_status === 'success' ? 'success' : 'danger'}>
                        {row.response_status}
                      </Tag>
                    ),
                  },
                  {
                    colKey: 'created_at',
                    title: t('mcp.time'),
                    width: 180,
                    cell: (row: any) => formatDate(row.created_at),
                  },
                  {
                    colKey: 'request_params',
                    title: t('mcp.requestParams'),
                    ellipsis: true,
                    cell: (row: any) => row.request_params ? JSON.parse(row.request_params) : '-',
                  },
                ]}
              />

              {/* Pagination */}
              {auditLogs && auditLogs.totalPages > 1 && (
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                  <Pagination
                    current={auditFilters.page}
                    pageSize={auditFilters.pageSize}
                    total={auditLogs.total}
                    onCurrentChange={(current) => setAuditFilters({ ...auditFilters, page: current })}
                  />
                </div>
              )}
            </>
          )}
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
    </div>
  );
}
