import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Pagination, Select, Space, Switch, Tag, Tabs, Textarea } from 'tdesign-react';
import { AddIcon, DeleteIcon, SearchIcon, EditIcon, CheckCircleIcon, ErrorCircleIcon, TimeIcon, LinkIcon } from 'tdesign-icons-react';
import { serviceMonitorApi, domainsApi } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useRealtimeData } from '../../hooks/useRealtimeData';

type MonitorType = 'ssl_certificate' | 'endpoint' | 'dns_failover';

interface ServiceMonitorMonitor {
  id: number;
  name: string;
  monitor_type: MonitorType;
  target: string;
  status: string;
  check_interval: number;
  config: Record<string, any>;
  notify_on_failure: boolean;
  notify_on_recovery: boolean;
  parent_id: number | null;
  domain_id: number | null;
  last_check_at?: string;
  response_time?: number;
  result_data?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

function statusTag(status: string, t: any) {
  const labels: Record<string, string> = {
    ok: t('domains.servicemonitor.status_ok'),
    warning: t('domains.servicemonitor.status_warning'),
    error: t('domains.servicemonitor.status_error'),
    unknown: t('domains.servicemonitor.status_unknown'),
  };
  const themes: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    ok: 'success', warning: 'warning', error: 'danger', unknown: 'default',
  };
  const icons: Record<string, React.ReactElement> = {
    ok: <CheckCircleIcon />, warning: <TimeIcon />, error: <ErrorCircleIcon />, unknown: <TimeIcon />,
  };
  return <Tag theme={themes[status] || 'default'} variant="light" icon={icons[status]}>{labels[status] || status}</Tag>;
}

function dialogField(label: string, control: ReactNode, tips?: ReactNode) {
  return (
    <div className="settings-control-field">
      <span>{label}</span>
      {control}
      {tips && <small className="settings-control-field__tip">{tips}</small>}
    </div>
  );
}

// ---- SSL Tab ----

function SSLTab({ onEdit, onDelete, onCheck, onAdd }: {
  onEdit: (m: ServiceMonitorMonitor) => void;
  onDelete: (m: ServiceMonitorMonitor) => void;
  onCheck: (m: ServiceMonitorMonitor) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: sslData, isLoading } = useQuery({
    queryKey: ['servicemonitor-ssl', page, pageSize, search],
    queryFn: () => serviceMonitorApi.list({ page, pageSize, type: 'ssl_certificate' }).then(r => r.data.data || { list: [], total: 0 }),
    placeholderData: { list: [], total: 0 } as any,
  });
  const monitors = sslData?.list || [];
  const total = sslData?.total || 0;

  const columns = [
    { key: 'name', label: t('domains.servicemonitor.name'), render: (r: ServiceMonitorMonitor) => <span className="page-strong">{r.name}</span> },
    {
      key: 'status', label: t('domains.servicemonitor.status'),
      render: (r: ServiceMonitorMonitor) => statusTag(r.status, t),
    },
    { key: 'target', label: t('domains.servicemonitor.target'), render: (r: ServiceMonitorMonitor) => <span className="record-mono">{r.target}</span> },
    {
      key: 'ssl_info', label: t('domains.servicemonitor.ssl_encryption'),
      render: (r: ServiceMonitorMonitor) => {
        const rd = r.result_data;
        if (!rd) return <span className="page-muted">-</span>;
        return (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div>
              <Tag theme="primary" variant="light" size="small">{rd.encryptionType || '-'}</Tag>
              <Tag theme="warning" variant="light" size="small" style={{ marginLeft: 4 }}>{rd.validationLevel || '-'}</Tag>
            </div>
            <div style={{ color: '#666' }}>{t('domains.servicemonitor.ssl_issuer')}: {rd.issuer || '-'}</div>
            {rd.sanDomains && Array.isArray(rd.sanDomains) && rd.sanDomains.length > 1 && (
              <div style={{ color: '#999', fontSize: 11 }}>
                {t('domains.servicemonitor.ssl_san')}: {(rd.sanDomains as string[]).slice(0, 3).join(', ')}
                {rd.sanDomains.length > 3 ? ` +${rd.sanDomains.length - 3}` : ''}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'expiry', label: t('domains.servicemonitor.ssl_expiry'),
      render: (r: ServiceMonitorMonitor) => {
        const rd = r.result_data;
        if (!rd?.daysLeft) return <span className="page-muted">-</span>;
        const days = Number(rd.daysLeft);
        if (days <= 0) return <Tag theme="danger" variant="light">{t('domains.servicemonitor.ssl_expired')}</Tag>;
        const theme = days <= 30 ? 'warning' : 'success';
        return <Tag theme={theme} variant="light">{t('domains.servicemonitor.ssl_daysLeft', { days })}</Tag>;
      },
    },
    { key: 'response_time', label: t('domains.servicemonitor.responseTime'), render: (r: ServiceMonitorMonitor) => <span className="page-muted">{r.response_time != null ? `${r.response_time}ms` : '-'}</span> },
    { key: 'last_check_at', label: t('domains.servicemonitor.lastCheck'), render: (r: ServiceMonitorMonitor) => <span className="page-muted">{r.last_check_at ? new Date(r.last_check_at).toLocaleString() : '-'}</span> },
    {
      key: 'actions', label: t('domains.servicemonitor.actions'),
      render: (r: ServiceMonitorMonitor) => (
        <Space size="small">
          <Button shape="square" variant="text" theme="primary" icon={<CheckCircleIcon />} onClick={() => onCheck(r)} />
          <Button shape="square" variant="text" icon={<EditIcon />} onClick={() => onEdit(r)} />
          <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => onDelete(r)} />
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false} shadow={false} className="page-card servicemonitor-card">
      <div className="records-toolbar servicemonitor-card__toolbar">
        <Input clearable type="search" value={search} prefixIcon={<SearchIcon />} placeholder={t('common.search')}
          onChange={(v: any) => { setSearch(String(v)); setPage(1); }} style={{ width: 240 }} />
        <Button theme="primary" icon={<AddIcon />} onClick={onAdd}>{t('domains.servicemonitor.addMonitor')}</Button>
      </div>
      <Table columns={columns} data={monitors} loading={isLoading} rowKey={(r) => r.id} emptyText={t('domains.servicemonitor.empty_ssl')} />
      <div className="records-pagination">
        <Pagination current={page} pageSize={pageSize} pageSizeOptions={[10, 20, 50, 100]} total={total}
          totalContent={<span className="records-pagination__total">{t('common.paginationTotal', { total })}</span>}
          onCurrentChange={(c: number) => setPage(c)} onPageSizeChange={(s: number) => { setPageSize(s); setPage(1); }} />
      </div>
    </Card>
  );
}

// ---- Endpoint Tab ----

function EndpointTab({ onEdit, onDelete, onCheck, onAdd, onBindFailover }: {
  onEdit: (m: ServiceMonitorMonitor) => void;
  onDelete: (m: ServiceMonitorMonitor) => void;
  onCheck: (m: ServiceMonitorMonitor) => void;
  onAdd: () => void;
  onBindFailover: (m: ServiceMonitorMonitor) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: endpointData, isLoading } = useQuery({
    queryKey: ['servicemonitor-endpoint', page, pageSize, search],
    queryFn: () => serviceMonitorApi.list({ page, pageSize, type: 'endpoint' }).then(r => r.data.data || { list: [], total: 0 }),
    placeholderData: { list: [], total: 0 } as any,
  });
  const monitors = endpointData?.list || [];
  const total = endpointData?.total || 0;

  const columns = [
    { key: 'name', label: t('domains.servicemonitor.name'), render: (r: ServiceMonitorMonitor) => <span className="page-strong">{r.name}</span> },
    {
      key: 'status', label: t('domains.servicemonitor.status'),
      render: (r: ServiceMonitorMonitor) => statusTag(r.status, t),
    },
    { key: 'target', label: t('domains.servicemonitor.target'), render: (r: ServiceMonitorMonitor) => <span className="record-mono">{r.target}{r.config?.path || ''}</span> },
    {
      key: 'endpoint_info', label: t('domains.servicemonitor.endpoint_statusCode'),
      render: (r: ServiceMonitorMonitor) => {
        const rd = r.result_data;
        if (!rd) return <span className="page-muted">-</span>;
        return (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <Tag theme={Number(rd.statusCode) < 400 ? 'success' : 'danger'} variant="light" size="small">{rd.statusCode || '-'}</Tag>
            {rd.redirectCount > 0 && <Tag theme="warning" variant="light" size="small" style={{ marginLeft: 4 }}>{t('domains.servicemonitor.endpoint_redirectCount', { count: rd.redirectCount })}</Tag>}
          </div>
        );
      },
    },
    {
      key: 'failover_bind', label: t('domains.servicemonitor.failover_primary'),
      render: (r: ServiceMonitorMonitor) => (
        <Button variant="text" size="small" icon={<LinkIcon />} onClick={() => onBindFailover(r)}>{t('domains.servicemonitor.endpoint_bindFailover')}</Button>
      ),
    },
    { key: 'response_time', label: t('domains.servicemonitor.responseTime'), render: (r: ServiceMonitorMonitor) => <span className="page-muted">{r.response_time != null ? `${r.response_time}ms` : '-'}</span> },
    { key: 'last_check_at', label: t('domains.servicemonitor.lastCheck'), render: (r: ServiceMonitorMonitor) => <span className="page-muted">{r.last_check_at ? new Date(r.last_check_at).toLocaleString() : '-'}</span> },
    {
      key: 'actions', label: t('domains.servicemonitor.actions'),
      render: (r: ServiceMonitorMonitor) => (
        <Space size="small">
          <Button shape="square" variant="text" theme="primary" icon={<CheckCircleIcon />} onClick={() => onCheck(r)} />
          <Button shape="square" variant="text" icon={<EditIcon />} onClick={() => onEdit(r)} />
          <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => onDelete(r)} />
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false} shadow={false} className="page-card servicemonitor-card">
      <div className="records-toolbar servicemonitor-card__toolbar">
        <Input clearable type="search" value={search} prefixIcon={<SearchIcon />} placeholder={t('common.search')}
          onChange={(v: any) => { setSearch(String(v)); setPage(1); }} style={{ width: 240 }} />
        <Button theme="primary" icon={<AddIcon />} onClick={onAdd}>{t('domains.servicemonitor.addMonitor')}</Button>
      </div>
      <Table columns={columns} data={monitors} loading={isLoading} rowKey={(r) => r.id} emptyText={t('domains.servicemonitor.empty_endpoint')} />
      <div className="records-pagination">
        <Pagination current={page} pageSize={pageSize} pageSizeOptions={[10, 20, 50, 100]} total={total}
          totalContent={<span className="records-pagination__total">{t('common.paginationTotal', { total })}</span>}
          onCurrentChange={(c: number) => setPage(c)} onPageSizeChange={(s: number) => { setPageSize(s); setPage(1); }} />
      </div>
    </Card>
  );
}

// ---- Failover Tab ----

function FailoverTab({ onEdit, onDelete, onCheck }: {
  onEdit: (m: ServiceMonitorMonitor) => void;
  onDelete: (m: ServiceMonitorMonitor) => void;
  onCheck: (m: ServiceMonitorMonitor) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: failoverData, isLoading } = useQuery({
    queryKey: ['servicemonitor-failover', page, pageSize, search],
    queryFn: () => serviceMonitorApi.list({ page, pageSize, type: 'dns_failover' }).then(r => r.data.data || { list: [], total: 0 }),
  });
  const monitors = failoverData?.list || [];
  const total = failoverData?.total || 0;

  const columns = [
    { key: 'name', label: t('domains.servicemonitor.name'), render: (r: ServiceMonitorMonitor) => <span className="page-strong">{r.name}</span> },
    {
      key: 'status', label: t('domains.servicemonitor.status'),
      render: (r: ServiceMonitorMonitor) => statusTag(r.status, t),
    },
    {
      key: 'failover_info', label: t('domains.servicemonitor.failover_activeValue'),
      render: (r: ServiceMonitorMonitor) => {
        const cfg = r.config || {};
        const rd = r.result_data;
        const active = rd?.activeValue || '-';
        return (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <Tag theme="primary" variant="light" size="small">{cfg.recordType || 'A'}</Tag>
            <span className="record-mono" style={{ marginLeft: 6 }}>{cfg.recordName || '-'} &rarr; {active}</span>
            {rd?.usingBackup && <Tag theme="danger" variant="light" size="small" style={{ marginLeft: 4 }}>{t('domains.servicemonitor.failover_backup')}</Tag>}
          </div>
        );
      },
    },
    { key: 'target', label: t('domains.servicemonitor.failover_source'), render: (r: ServiceMonitorMonitor) => <span className="record-mono">{r.target}</span> },
    { key: 'last_check_at', label: t('domains.servicemonitor.lastCheck'), render: (r: ServiceMonitorMonitor) => <span className="page-muted">{r.last_check_at ? new Date(r.last_check_at).toLocaleString() : '-'}</span> },
    {
      key: 'actions', label: t('domains.servicemonitor.actions'),
      render: (r: ServiceMonitorMonitor) => (
        <Space size="small">
          <Button shape="square" variant="text" theme="primary" icon={<CheckCircleIcon />} onClick={() => onCheck(r)} />
          <Button shape="square" variant="text" icon={<EditIcon />} onClick={() => onEdit(r)} />
          <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => onDelete(r)} />
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false} shadow={false} className="page-card servicemonitor-card">
      <div className="records-toolbar servicemonitor-card__toolbar">
        <Input clearable type="search" value={search} prefixIcon={<SearchIcon />} placeholder={t('common.search')}
          onChange={(v: any) => { setSearch(String(v)); setPage(1); }} style={{ width: 240 }} />
      </div>
      <Table columns={columns} data={monitors} loading={isLoading} rowKey={(r) => r.id} emptyText={t('domains.servicemonitor.empty_failover')} />
      <div className="records-pagination">
        <Pagination current={page} pageSize={pageSize} pageSizeOptions={[10, 20, 50, 100]} total={total}
          totalContent={<span className="records-pagination__total">{t('common.paginationTotal', { total })}</span>}
          onCurrentChange={(c: number) => setPage(c)} onPageSizeChange={(s: number) => { setPageSize(s); setPage(1); }} />
      </div>
    </Card>
  );
}

// ---- Main Component ----

export function ServiceMonitorTab() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('ssl');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBindModalOpen, setIsBindModalOpen] = useState(false);
  const [bindEndpoint, setBindEndpoint] = useState<ServiceMonitorMonitor | null>(null);
  const [selectedMonitor, setSelectedMonitor] = useState<ServiceMonitorMonitor | null>(null);
  const [deleteMonitor, setDeleteMonitor] = useState<ServiceMonitorMonitor | null>(null);
  const [addType, setAddType] = useState<MonitorType>('ssl_certificate');
  const [formState, setFormState] = useState<Record<string, any>>({});
  const [availableDomains, setAvailableDomains] = useState<any[]>([]);

  useRealtimeData({
    queryKey: ['servicemonitor'],
    websocketEventTypes: ['servicemonitor_created', 'servicemonitor_updated', 'servicemonitor_deleted', 'servicemonitor_checked'],
    pollingInterval: 60000,
  });

  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    if (activeTab === 'failover' || addType === 'dns_failover' || bindEndpoint) {
      serviceMonitorApi.getAvailableDomains().then(r => setAvailableDomains(r.data.data || [])).catch(() => {});
    }
  }, [activeTab, addType, bindEndpoint]);

  // Smart domain/hostname detection for bind modal
  useEffect(() => {
    if (!bindEndpoint || availableDomains.length === 0) return;
    const target = bindEndpoint.target;
    const parts = target.split('.');
    for (let i = 1; i < parts.length; i++) {
      const candidate = parts.slice(i).join('.');
      const matched = availableDomains.find((d: any) => d.name === candidate);
      if (matched) {
        const hostname = i === 1 ? '@' : parts.slice(0, i).join('.');
        setFormState((s: any) => ({ ...s, failover_domain_id: matched.id, record_name: hostname }));
        return;
      }
    }
  }, [bindEndpoint, availableDomains]);

  // Fetch lines when domain selection changes in bind form
  useEffect(() => {
    if (!formState.failover_domain_id) { setLines([]); return; }
    domainsApi.lines(formState.failover_domain_id).then(r => setLines(r.data.data || [])).catch(() => setLines([]));
  }, [formState.failover_domain_id]);

  const createMutation = useMutation({
    mutationFn: (data: any) => serviceMonitorApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['servicemonitor'] }); closeAddModal(); toast.success(t('domains.servicemonitor.createSuccess')); },
    onError: () => { toast.error(t('common.failed')); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; payload: any }) => serviceMonitorApi.update(data.id, data.payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['servicemonitor'] }); closeEditModal(); toast.success(t('domains.servicemonitor.updateSuccess')); },
    onError: () => { toast.error(t('common.failed')); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => serviceMonitorApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['servicemonitor'] }); setDeleteMonitor(null); toast.success(t('domains.servicemonitor.deleteSuccess')); },
    onError: () => { toast.error(t('common.failed')); },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => serviceMonitorApi.check(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['servicemonitor'] }); toast.success(t('domains.servicemonitor.checkComplete')); },
    onError: () => { toast.error(t('common.failed')); },
  });

  const bindMutation = useMutation({
    mutationFn: (data: any) => serviceMonitorApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicemonitor'] });
      setIsBindModalOpen(false);
      setBindEndpoint(null);
      toast.success(t('domains.servicemonitor.bindSuccess'));
    },
    onError: () => { toast.error(t('common.failed')); },
  });

  const resetForm = () => setFormState({});

  const openAddModal = (type: MonitorType) => {
    setAddType(type);
    resetForm();
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => { setIsAddModalOpen(false); resetForm(); };
  const closeEditModal = () => { setIsEditModalOpen(false); setSelectedMonitor(null); resetForm(); };

  const openEdit = (m: ServiceMonitorMonitor) => {
    setSelectedMonitor(m);
    setFormState(buildConfigFromMonitor(m));
    setIsEditModalOpen(true);
  };

  const handleAdd = () => {
    if (!formState.name || !formState.target) { toast.error(t('domains.servicemonitor.required')); return; }
    createMutation.mutate(buildPayloadForType(formState, addType));
  };

  const handleEdit = () => {
    if (!selectedMonitor) return;
    updateMutation.mutate({ id: selectedMonitor.id, payload: buildPayloadForType(formState, selectedMonitor.monitor_type) });
  };

  const handleBind = () => {
    if (!bindEndpoint || !formState.failover_domain_id || !formState.record_name || !formState.primary_value) {
      toast.error(t('domains.servicemonitor.bindRequired')); return;
    }
    bindMutation.mutate({
      name: t('domains.servicemonitor.failover_primary') + ' - ' + bindEndpoint.name,
      monitor_type: 'dns_failover',
      target: bindEndpoint.target,
      parent_id: bindEndpoint.id,
      domain_id: formState.failover_domain_id,
      check_interval: bindEndpoint.check_interval,
      notify_on_failure: true,
      notify_on_recovery: true,
      config: {
        recordType: formState.record_type || 'A',
        recordName: formState.record_name,
        ttl: Number(formState.record_ttl) || 600,
        line: formState.record_line || 'default',
        primaryValue: formState.primary_value,
        backupValues: (formState.backup_values || '').split('\n').map((s: string) => s.trim()).filter(Boolean),
        autoSwitchBack: formState.auto_switch_back !== false,
      },
    });
  };

  // ---- Render forms ----

  const renderTypeForm = (type: MonitorType) => {
    switch (type) {
      case 'ssl_certificate':
        return (
          <>
            <div className="dialog-form-grid">
              {dialogField(t('domains.servicemonitor.ssl_monitorDomain'),
                <Input value={formState.target || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, target: String(v) }))} placeholder={t('domains.servicemonitor.form_domainPlaceholder')} />)}
              {dialogField(t('domains.servicemonitor.ssl_httpsPort'),
                <Input type="number" value={String(formState.ssl_port || 443)} onChange={(v: any) => setFormState((s: any) => ({ ...s, ssl_port: Number(v) || 443 }))} />)}
            </div>
            {dialogField(t('domains.servicemonitor.ssl_warnDaysBefore'),
              <Input type="number" value={String(formState.warn_days_before || 30)} onChange={(v: any) => setFormState((s: any) => ({ ...s, warn_days_before: Number(v) || 30 }))} />)}
          </>
        );
      case 'endpoint':
        return (
          <>
            <div className="dialog-form-grid">
              {dialogField(t('domains.servicemonitor.ssl_monitorDomain'),
                <Input value={formState.target || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, target: String(v) }))} placeholder={t('domains.servicemonitor.form_domainPlaceholder')} />)}
              {dialogField(t('domains.servicemonitor.endpoint_path'),
                <Input value={formState.endpoint_path || '/'} onChange={(v: any) => setFormState((s: any) => ({ ...s, endpoint_path: String(v) }))} placeholder={t('domains.servicemonitor.form_pathPlaceholder')} />)}
            </div>
            <div className="dialog-form-grid">
              {dialogField(t('domains.servicemonitor.endpoint_protocol'),
                <Select value={formState.endpoint_protocol || 'https'} options={[
                  { label: 'HTTPS', value: 'https' }, { label: 'HTTP', value: 'http' },
                ]} onChange={(v: any) => setFormState((s: any) => ({ ...s, endpoint_protocol: String(Array.isArray(v) ? v[0] : v) }))} />)}
              {dialogField(t('domains.servicemonitor.endpoint_port'),
                <Input type="number" value={String(formState.endpoint_port || 443)} onChange={(v: any) => setFormState((s: any) => ({ ...s, endpoint_port: Number(v) || 443 }))} />)}
            </div>
            <div className="dialog-switch-row">
              <div><strong>{t('domains.servicemonitor.endpoint_followRedirects')}</strong></div>
              <Switch value={formState.follow_redirects !== false} onChange={(c: any) => setFormState((s: any) => ({ ...s, follow_redirects: Boolean(c) }))} />
            </div>
          </>
        );
      case 'dns_failover':
        return (
          <>
            <div className="dialog-form-grid">
              {dialogField(t('domains.servicemonitor.failover_recordName'),
                <Input value={formState.record_name || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_name: String(v) }))} placeholder={t('domains.servicemonitor.form_recordName')} />)}
              {dialogField(t('domains.servicemonitor.failover_recordType'),
                <Select value={formState.record_type || 'A'} options={[
                  { label: 'A', value: 'A' }, { label: 'AAAA', value: 'AAAA' }, { label: 'CNAME', value: 'CNAME' },
                ]} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_type: String(Array.isArray(v) ? v[0] : v) }))} />)}
            </div>
            <div className="dialog-form-grid">
              {dialogField(t('domains.servicemonitor.form_ttl'),
                <Input type="number" value={String(formState.record_ttl || 600)} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_ttl: Number(v) || 600 }))} />)}
              {dialogField(t('domains.servicemonitor.form_line'),
                <Input value={formState.record_line || 'default'} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_line: String(v) }))} />)}
            </div>
            <div className="dialog-switch-row">
              <div><strong>{t('domains.servicemonitor.form_proxyEnabled')}</strong></div>
              <Switch value={formState.proxy_enabled || false} onChange={(c: any) => setFormState((s: any) => ({ ...s, proxy_enabled: Boolean(c) }))} />
            </div>
            {dialogField(t('domains.servicemonitor.form_failoverDomain'),
              <Select value={formState.failover_domain_id || ''} options={availableDomains.map((d: any) => ({ label: `${d.name} (${d.account_name})`, value: d.id }))}
                onChange={(v: any) => setFormState((s: any) => ({ ...s, failover_domain_id: Number(Array.isArray(v) ? v[0] : v) }))} />)}
            {dialogField(t('domains.servicemonitor.form_primaryValue'),
              <Input value={formState.primary_value || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, primary_value: String(v) }))} />)}
            {dialogField(t('domains.servicemonitor.form_backupValues'),
              <Textarea value={formState.backup_values || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, backup_values: String(v) }))} placeholder={t('domains.servicemonitor.form_backupPlaceholder')} />)}
            <div className="dialog-switch-row">
              <div><strong>{t('domains.servicemonitor.form_autoSwitchBack')}</strong></div>
              <Switch value={formState.auto_switch_back !== false} onChange={(c: any) => setFormState((s: any) => ({ ...s, auto_switch_back: Boolean(c) }))} />
            </div>
          </>
        );
    }
  };

  const renderForm = (mode: 'add' | 'edit') => {
    const type = mode === 'add' ? addType : (selectedMonitor?.monitor_type || 'ssl_certificate');
    return (
      <div className="page-shell dialog-form servicemonitor-dialog">
        {dialogField(t('domains.servicemonitor.form_name'),
          <Input value={formState.name || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, name: String(v) }))} />)}
        {renderTypeForm(type)}

        {dialogField(t('domains.servicemonitor.form_checkInterval'),
          <Input type="number" value={String(formState.check_interval || 300)} onChange={(v: any) => setFormState((s: any) => ({ ...s, check_interval: Number(v) || 300 }))} />)}

        <div className="dialog-switch-row">
          <div><strong>{t('domains.servicemonitor.form_notifyOnFailure')}</strong></div>
          <Switch value={formState.notify_on_failure !== false} onChange={(c: any) => setFormState((s: any) => ({ ...s, notify_on_failure: Boolean(c) }))} />
        </div>
        <div className="dialog-switch-row">
          <div><strong>{t('domains.servicemonitor.form_notifyOnRecovery')}</strong></div>
          <Switch value={formState.notify_on_recovery !== false} onChange={(c: any) => setFormState((s: any) => ({ ...s, notify_on_recovery: Boolean(c) }))} />
        </div>

        <Space style={{ marginTop: 16 }}>
          <Button theme="primary" onClick={mode === 'add' ? handleAdd : handleEdit} loading={createMutation.isPending || updateMutation.isPending}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    );
  };

  const renderBindForm = () => {
    if (!bindEndpoint) return null;
    const bindDomain = availableDomains.find((d: any) => d.id === formState.failover_domain_id);
    const isCloudflare = bindDomain?.account_type === 'cloudflare';
    const isAliyunESA = bindDomain?.account_type === 'aliyunesa';
    const hasProxyMode = isCloudflare || isAliyunESA;
    const lineOptions = hasProxyMode
      ? [
          { label: t('records.dnsOnly') || 'DNS Only', value: '0' },
          { label: t('records.proxied') || 'Proxied', value: '1' },
        ]
      : lines.length > 1
        ? lines.map((l: any) => ({ label: l.name, value: String(l.id) }))
        : [{ label: t('records.defaultLine') || '默认', value: 'default' }];
    return (
      <div className="page-shell dialog-form servicemonitor-dialog">
        <p style={{ marginBottom: 12, color: '#666' }}>{t('domains.servicemonitor.bindFailoverDesc', { name: bindEndpoint.name })}</p>
        <div className="dialog-form-grid">
          {dialogField(t('domains.servicemonitor.failover_recordName'),
            <Input value={formState.record_name || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_name: String(v) }))}
              placeholder={`@ / www / sub`} />)}
          {dialogField(t('domains.servicemonitor.failover_recordType'),
            <Select value={formState.record_type || 'A'} options={[
              { label: 'A', value: 'A' }, { label: 'AAAA', value: 'AAAA' }, { label: 'CNAME', value: 'CNAME' },
            ]} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_type: String(Array.isArray(v) ? v[0] : v) }))} />)}
        </div>
        <div className="dialog-form-grid">
          {dialogField(t('domains.servicemonitor.form_ttl'),
            <Input type="number" value={String(formState.record_ttl || 600)} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_ttl: Number(v) || 600 }))} />)}
          {dialogField(hasProxyMode ? t('records.proxy') : t('common.line'),
            <Select value={formState.record_line ?? 'default'} options={lineOptions}
              onChange={(v: any) => setFormState((s: any) => ({ ...s, record_line: String(Array.isArray(v) ? v[0] : v) }))} />)}
        </div>
        {dialogField(t('domains.servicemonitor.form_failoverDomain'),
          <Select value={formState.failover_domain_id || ''} filterable options={(() => {
            const parts = bindEndpoint.target.split('.');
            const suffixes = new Set<string>();
            for (let i = 1; i < parts.length; i++) suffixes.add(parts.slice(i).join('.'));
            const filtered = availableDomains.filter((d: any) => suffixes.has(d.name));
            return (filtered.length > 0 ? filtered : availableDomains).map((d: any) => ({ label: `${d.name} (${d.account_name})`, value: d.id }));
          })()}
            onChange={(v: any) => setFormState((s: any) => ({ ...s, failover_domain_id: Number(Array.isArray(v) ? v[0] : v), record_line: 'default' }))} />)}
        {dialogField(t('domains.servicemonitor.form_primaryValue'),
          <Input value={formState.primary_value || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, primary_value: String(v) }))} />)}
        {dialogField(t('domains.servicemonitor.form_backupValues'),
          <Textarea value={formState.backup_values || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, backup_values: String(v) }))} placeholder={t('domains.servicemonitor.form_backupPlaceholder')} />)}
        <div className="dialog-switch-row">
          <div><strong>{t('domains.servicemonitor.form_autoSwitchBack')}</strong></div>
          <Switch value={formState.auto_switch_back !== false} onChange={(c: any) => setFormState((s: any) => ({ ...s, auto_switch_back: Boolean(c) }))} />
        </div>
        <Space style={{ marginTop: 16 }}>
          <Button theme="primary" onClick={handleBind} loading={bindMutation.isPending}>{t('domains.servicemonitor.bindFailover')}</Button>
        </Space>
      </div>
    );
  };

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h2>{t('domains.servicemonitor.title')}</h2>
          <p>{t('domains.servicemonitor.subtitle')}</p>
        </div>
      </section>

      <div className="servicemonitor-tabs-wrapper">
        <Tabs value={activeTab} onChange={(v: any) => setActiveTab(String(v))}>
          <Tabs.TabPanel value="ssl" label={t('domains.servicemonitor.tab_ssl')}>
            <SSLTab
              onEdit={openEdit} onDelete={(m) => setDeleteMonitor(m)}
              onCheck={(m) => checkMutation.mutate(m.id)}
              onAdd={() => openAddModal('ssl_certificate')} />
          </Tabs.TabPanel>
          <Tabs.TabPanel value="endpoint" label={t('domains.servicemonitor.tab_endpoint')}>
            <EndpointTab
              onEdit={openEdit} onDelete={(m) => setDeleteMonitor(m)}
              onCheck={(m) => checkMutation.mutate(m.id)}
              onAdd={() => openAddModal('endpoint')}
              onBindFailover={(m) => { setBindEndpoint(m); resetForm(); setIsBindModalOpen(true); }} />
          </Tabs.TabPanel>
          <Tabs.TabPanel value="failover" label={t('domains.servicemonitor.tab_failover')}>
            <FailoverTab
              onEdit={openEdit} onDelete={(m) => setDeleteMonitor(m)}
              onCheck={(m) => checkMutation.mutate(m.id)} />
          </Tabs.TabPanel>
        </Tabs>
      </div>

      {isAddModalOpen && (
        <Modal title={`${t('domains.servicemonitor.addMonitor')} - ${addType === 'ssl_certificate' ? t('domains.servicemonitor.tab_ssl') : addType === 'endpoint' ? t('domains.servicemonitor.tab_endpoint') : t('domains.servicemonitor.tab_failover')}`}
          onClose={closeAddModal} size="lg">
          {renderForm('add')}
        </Modal>
      )}

      {isEditModalOpen && selectedMonitor && (
        <Modal title={t('domains.servicemonitor.editMonitor')} onClose={closeEditModal} size="lg">
          {renderForm('edit')}
        </Modal>
      )}

      {isBindModalOpen && bindEndpoint && (
        <Modal title={t('domains.servicemonitor.bindFailover')} onClose={() => { setIsBindModalOpen(false); setBindEndpoint(null); }} size="lg">
          {renderBindForm()}
        </Modal>
      )}

      {deleteMonitor && (
        <ConfirmDialog
          message={t('domains.servicemonitor.deleteConfirm', { name: deleteMonitor.name })}
          onConfirm={() => deleteMutation.mutate(deleteMonitor.id)}
          onCancel={() => setDeleteMonitor(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ---- Utility functions ----

function buildConfigFromMonitor(m: ServiceMonitorMonitor): Record<string, any> {
  const cfg = m.config || {};
  const base: Record<string, any> = {
    name: m.name,
    target: m.target,
    check_interval: m.check_interval,
    notify_on_failure: m.notify_on_failure,
    notify_on_recovery: m.notify_on_recovery,
    domain_id: m.domain_id,
  };
  switch (m.monitor_type) {
    case 'ssl_certificate':
      return { ...base, ssl_port: cfg.port || 443, warn_days_before: cfg.warn_days_before || 30 };
    case 'endpoint':
      return { ...base, endpoint_protocol: cfg.protocol || 'https', endpoint_port: cfg.port || 443, endpoint_path: cfg.path || '/', follow_redirects: cfg.followRedirects !== false };
    case 'dns_failover':
      return {
        ...base, record_type: cfg.recordType || 'A', record_name: cfg.recordName || '',
        record_ttl: cfg.ttl || 600, record_line: cfg.line || 'default', proxy_enabled: cfg.proxyEnabled || false,
        primary_value: cfg.primaryValue || '', backup_values: Array.isArray(cfg.backupValues) ? cfg.backupValues.join('\n') : '',
        auto_switch_back: cfg.autoSwitchBack !== false, failover_domain_id: m.domain_id,
      };
    default:
      return base;
  }
}

function buildPayloadForType(formState: Record<string, any>, type: MonitorType): any {
  const payload: any = {
    name: formState.name,
    monitor_type: type,
    target: formState.target,
    check_interval: formState.check_interval || 300,
    notify_on_failure: formState.notify_on_failure !== false,
    notify_on_recovery: formState.notify_on_recovery !== false,
  };
  if (formState.domain_id) payload.domain_id = formState.domain_id;
  if (formState.parent_id) payload.parent_id = formState.parent_id;

  switch (type) {
    case 'ssl_certificate':
      payload.config = { port: Number(formState.ssl_port) || 443, warn_days_before: Number(formState.warn_days_before) || 30 };
      break;
    case 'endpoint':
      payload.config = {
        protocol: formState.endpoint_protocol || 'https', port: Number(formState.endpoint_port) || 443,
        path: formState.endpoint_path || '/', followRedirects: formState.follow_redirects !== false,
      };
      break;
    case 'dns_failover':
      if (formState.failover_domain_id) payload.domain_id = formState.failover_domain_id;
      payload.config = {
        recordType: formState.record_type || 'A', recordName: formState.record_name || '',
        ttl: Number(formState.record_ttl) || 600, line: formState.record_line || 'default',
        proxyEnabled: formState.proxy_enabled || false, primaryValue: formState.primary_value || '',
        backupValues: (formState.backup_values || '').split('\n').map((s: string) => s.trim()).filter(Boolean),
        autoSwitchBack: formState.auto_switch_back !== false,
      };
      break;
  }
  return payload;
}
