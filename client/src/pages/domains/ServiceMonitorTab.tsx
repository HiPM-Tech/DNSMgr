import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Pagination, Select, Space, Switch, Tag, Tabs, Textarea } from 'tdesign-react';
import { AddIcon, DeleteIcon, SearchIcon, EditIcon, CheckCircleIcon, ErrorCircleIcon, TimeIcon, LinkIcon } from 'tdesign-icons-react';
import { serviceMonitorApi } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';

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

// ---- SSL Tab ----

function SSLTab({ monitors, isLoading, onEdit, onDelete, onCheck, onAdd }: {
  monitors: ServiceMonitorMonitor[];
  isLoading: boolean;
  onEdit: (m: ServiceMonitorMonitor) => void;
  onDelete: (m: ServiceMonitorMonitor) => void;
  onCheck: (m: ServiceMonitorMonitor) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ps = 20;

  const filtered = monitors.filter(m => m.monitor_type === 'ssl_certificate').filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.target.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * ps, page * ps);

  const columns = [
    { key: 'name', label: t('domains.servicemonitor.name'), render: (r: ServiceMonitorMonitor) => <span className="page-strong">{r.name}</span> },
    {
      key: 'status', label: t('domains.servicemonitor.status'),
      render: (r: ServiceMonitorMonitor) => statusTag(r.status, t),
    },
    { key: 'target', label: '域名', render: (r: ServiceMonitorMonitor) => <span className="record-mono">{r.target}</span> },
    {
      key: 'ssl_info', label: '证书信息',
      render: (r: ServiceMonitorMonitor) => {
        const rd = r.result_data;
        if (!rd) return <span className="page-muted">-</span>;
        return (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <div><Tag theme="primary" variant="light" size="small">{rd.encryptionType || '-'}</Tag> <Tag theme="warning" variant="light" size="small">{rd.validationLevel || '-'}</Tag></div>
            <div style={{ color: '#666' }}>颁发: {rd.issuer || '-'}</div>
            {rd.sanDomains && Array.isArray(rd.sanDomains) && rd.sanDomains.length > 1 && (
              <div style={{ color: '#999', fontSize: 11 }}>SAN: {(rd.sanDomains as string[]).slice(0, 3).join(', ')}{rd.sanDomains.length > 3 ? ` +${rd.sanDomains.length - 3}` : ''}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'expiry', label: '到期',
      render: (r: ServiceMonitorMonitor) => {
        const rd = r.result_data;
        if (!rd?.daysLeft) return <span className="page-muted">-</span>;
        const days = Number(rd.daysLeft);
        const theme = days <= 0 ? 'danger' : days <= 30 ? 'warning' : 'success';
        return <Tag theme={theme} variant="light">{days <= 0 ? '已过期' : `${days}天`}</Tag>;
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
    <div>
      <div className="records-toolbar" style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <Input clearable type="search" value={search} prefixIcon={<SearchIcon />} placeholder={t('common.search')}
          onChange={(v: any) => { setSearch(String(v)); setPage(1); }} style={{ width: 240 }} />
        <Button theme="primary" icon={<AddIcon />} onClick={onAdd}>{t('domains.servicemonitor.addMonitor')}</Button>
      </div>
      <Card bordered={false} shadow={false}>
        <Table columns={columns} data={paged} loading={isLoading} rowKey={(r) => r.id} emptyText="暂无SSL证书监测" />
        <div className="records-pagination">
          <Pagination size="small" current={page} pageSize={ps} total={filtered.length} totalContent={false}
            showPageSize={false} showJumper={false} onCurrentChange={(c: number) => setPage(c)} />
        </div>
      </Card>
    </div>
  );
}

// ---- Endpoint Tab ----

function EndpointTab({ monitors, failoverMap, isLoading, onEdit, onDelete, onCheck, onAdd, onBindFailover }: {
  monitors: ServiceMonitorMonitor[];
  failoverMap: Record<number, ServiceMonitorMonitor[]>;
  isLoading: boolean;
  onEdit: (m: ServiceMonitorMonitor) => void;
  onDelete: (m: ServiceMonitorMonitor) => void;
  onCheck: (m: ServiceMonitorMonitor) => void;
  onAdd: () => void;
  onBindFailover: (m: ServiceMonitorMonitor) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ps = 20;

  const filtered = monitors.filter(m => m.monitor_type === 'endpoint').filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.target.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * ps, page * ps);

  const columns = [
    { key: 'name', label: t('domains.servicemonitor.name'), render: (r: ServiceMonitorMonitor) => <span className="page-strong">{r.name}</span> },
    {
      key: 'status', label: t('domains.servicemonitor.status'),
      render: (r: ServiceMonitorMonitor) => statusTag(r.status, t),
    },
    { key: 'target', label: '目标', render: (r: ServiceMonitorMonitor) => <span className="record-mono">{r.target}{r.config?.path || ''}</span> },
    {
      key: 'endpoint_info', label: '响应',
      render: (r: ServiceMonitorMonitor) => {
        const rd = r.result_data;
        if (!rd) return <span className="page-muted">-</span>;
        return (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <Tag theme={Number(rd.statusCode) < 400 ? 'success' : 'danger'} variant="light" size="small">{rd.statusCode || '-'}</Tag>
            {rd.redirectCount > 0 && <Tag theme="warning" variant="light" size="small" style={{ marginLeft: 4 }}>{rd.redirectCount}次跳转</Tag>}
          </div>
        );
      },
    },
    {
      key: 'failover_bind', label: '故障转移',
      render: (r: ServiceMonitorMonitor) => {
        const children = failoverMap[r.id] || [];
        if (children.length > 0) {
          return <Tag theme="danger" variant="light" icon={<LinkIcon />}>已绑定</Tag>;
        }
        return <Button variant="text" size="small" icon={<LinkIcon />} onClick={() => onBindFailover(r)}>绑定故障转移</Button>;
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
    <div>
      <div className="records-toolbar" style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <Input clearable type="search" value={search} prefixIcon={<SearchIcon />} placeholder={t('common.search')}
          onChange={(v: any) => { setSearch(String(v)); setPage(1); }} style={{ width: 240 }} />
        <Button theme="primary" icon={<AddIcon />} onClick={onAdd}>{t('domains.servicemonitor.addMonitor')}</Button>
      </div>
      <Card bordered={false} shadow={false}>
        <Table columns={columns} data={paged} loading={isLoading} rowKey={(r) => r.id} emptyText="暂无站点访问监测" />
        <div className="records-pagination">
          <Pagination size="small" current={page} pageSize={ps} total={filtered.length} totalContent={false}
            showPageSize={false} showJumper={false} onCurrentChange={(c: number) => setPage(c)} />
        </div>
      </Card>
    </div>
  );
}

// ---- Failover Tab ----

function FailoverTab({ monitors, isLoading, onEdit, onDelete, onCheck }: {
  monitors: ServiceMonitorMonitor[];
  isLoading: boolean;
  onEdit: (m: ServiceMonitorMonitor) => void;
  onDelete: (m: ServiceMonitorMonitor) => void;
  onCheck: (m: ServiceMonitorMonitor) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const ps = 20;

  const filtered = monitors.filter(m => m.monitor_type === 'dns_failover').filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.target.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * ps, page * ps);

  const columns = [
    { key: 'name', label: t('domains.servicemonitor.name'), render: (r: ServiceMonitorMonitor) => <span className="page-strong">{r.name}</span> },
    {
      key: 'status', label: t('domains.servicemonitor.status'),
      render: (r: ServiceMonitorMonitor) => statusTag(r.status, t),
    },
    {
      key: 'failover_info', label: '故障转移',
      render: (r: ServiceMonitorMonitor) => {
        const cfg = r.config || {};
        const rd = r.result_data;
        const active = rd?.activeValue || '-';
        return (
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <Tag theme="primary" variant="light" size="small">{cfg.recordType || 'A'}</Tag>
            <span className="record-mono" style={{ marginLeft: 6 }}>{cfg.recordName || '-'} → {active}</span>
            {rd?.usingBackup && <Tag theme="danger" variant="light" size="small" style={{ marginLeft: 4 }}>备用</Tag>}
          </div>
        );
      },
    },
    { key: 'target', label: '监测源', render: (r: ServiceMonitorMonitor) => <span className="record-mono">{r.target}</span> },
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
    <div>
      <div className="records-toolbar" style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <Input clearable type="search" value={search} prefixIcon={<SearchIcon />} placeholder={t('common.search')}
          onChange={(v: any) => { setSearch(String(v)); setPage(1); }} style={{ width: 240 }} />
      </div>
      <Card bordered={false} shadow={false}>
        <Table columns={columns} data={paged} loading={isLoading} rowKey={(r) => r.id} emptyText="暂无DNS故障转移配置" />
        <div className="records-pagination">
          <Pagination size="small" current={page} pageSize={ps} total={filtered.length} totalContent={false}
            showPageSize={false} showJumper={false} onCurrentChange={(c: number) => setPage(c)} />
        </div>
      </Card>
    </div>
  );
}

// ---- Shared helpers ----

function statusTag(status: string, t: any) {
  const labels: Record<string, string> = {
    ok: '正常', warning: '警告', error: '异常', unknown: '未知',
  };
  const themes: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
    ok: 'success', warning: 'warning', error: 'danger', unknown: 'default',
  };
  const icons: Record<string, React.ReactElement> = {
    ok: <CheckCircleIcon />, warning: <TimeIcon />, error: <ErrorCircleIcon />, unknown: <TimeIcon />,
  };
  return <Tag theme={themes[status] || 'default'} variant="light" icon={icons[status]}>{labels[status] || status}</Tag>;
}

// ---- Main Tab Component ----

export function ServiceMonitorTab() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('ssl');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isBindModalOpen, setIsBindModalOpen] = useState(false);
  const [bindEndpoint, setBindEndpoint] = useState<ServiceMonitorMonitor | null>(null);
  const [selectedMonitor, setSelectedMonitor] = useState<ServiceMonitorMonitor | null>(null);
  const [deleteMonitor, setDeleteMonitor] = useState<ServiceMonitorMonitor | null>(null);
  const [addType, setAddType] = useState<MonitorType>('ssl_certificate');

  // Form state
  const [formState, setFormState] = useState<Record<string, any>>({});
  const [availableDomains, setAvailableDomains] = useState<any[]>([]);

  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ['servicemonitor'],
    queryFn: () => serviceMonitorApi.list().then((r) => r.data.data || []),
    retry: 1, staleTime: 30000,
  });

  // Fetch failover children for each endpoint
  const endpointMonitors = monitors.filter((m: ServiceMonitorMonitor) => m.monitor_type === 'endpoint');
  const [failoverMap, setFailoverMap] = useState<Record<number, ServiceMonitorMonitor[]>>({});

  useEffect(() => {
    async function loadChildren() {
      const map: Record<number, ServiceMonitorMonitor[]> = {};
      for (const ep of endpointMonitors) {
        try {
          const res = await serviceMonitorApi.getChildren(ep.id);
          map[ep.id] = res.data.data || [];
        } catch { map[ep.id] = []; }
      }
      setFailoverMap(map);
    }
    if (endpointMonitors.length > 0) loadChildren();
  }, [monitors]);

  // Load available domains for failover
  useEffect(() => {
    if (activeTab === 'failover' || addType === 'dns_failover') {
      serviceMonitorApi.getAvailableDomains().then(r => setAvailableDomains(r.data.data || [])).catch(() => {});
    }
  }, [activeTab, addType]);

  const createMutation = useMutation({
    mutationFn: (data: any) => serviceMonitorApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['servicemonitor'] }); closeAddModal(); toast.success('创建成功'); },
    onError: () => { toast.error(t('common.failed')); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; payload: any }) => serviceMonitorApi.update(data.id, data.payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['servicemonitor'] }); closeEditModal(); toast.success('更新成功'); },
    onError: () => { toast.error(t('common.failed')); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => serviceMonitorApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['servicemonitor'] }); setDeleteMonitor(null); toast.success('已删除'); },
    onError: () => { toast.error(t('common.failed')); },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => serviceMonitorApi.check(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['servicemonitor'] }); toast.success('检查完成'); },
    onError: () => { toast.error(t('common.failed')); },
  });

  // Bind failover mutation
  const bindMutation = useMutation({
    mutationFn: (data: any) => serviceMonitorApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicemonitor'] });
      setIsBindModalOpen(false);
      setBindEndpoint(null);
      toast.success('故障转移已绑定');
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
    setFormState({
      name: m.name,
      target: m.target,
      monitor_type: m.monitor_type,
      check_interval: m.check_interval,
      notify_on_failure: m.notify_on_failure,
      notify_on_recovery: m.notify_on_recovery,
      domain_id: m.domain_id,
      ...buildConfigFromMonitor(m),
    });
    setIsEditModalOpen(true);
  };

  const handleAdd = () => {
    if (!formState.name || !formState.target) { toast.error('请填写名称和目标'); return; }
    const payload = buildPayloadForType(formState, addType);
    createMutation.mutate(payload);
  };

  const handleEdit = () => {
    if (!selectedMonitor) return;
    const payload = buildPayloadForType(formState, selectedMonitor.monitor_type);
    updateMutation.mutate({ id: selectedMonitor.id, payload });
  };

  const handleBind = () => {
    if (!bindEndpoint || !formState.failover_domain_id || !formState.record_name || !formState.primary_value) {
      toast.error('请完整填写故障转移配置'); return;
    }
    bindMutation.mutate({
      name: `${bindEndpoint.name} 故障转移`,
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
        proxyEnabled: formState.proxy_enabled || false,
        primaryValue: formState.primary_value,
        backupValues: (formState.backup_values || '').split('\n').map((s: string) => s.trim()).filter(Boolean),
        autoSwitchBack: formState.auto_switch_back !== false,
      },
    });
  };



  // ---- Render add/edit form ----

  const renderTypeForm = (type: MonitorType, _forAdd: boolean) => {
    switch (type) {
      case 'ssl_certificate':
        return (
          <>
            <div className="dialog-form-grid">
              {dialogField('监测域名',
                <Input value={formState.target || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, target: String(v) }))} placeholder="例: example.com" />)}
              {dialogField('HTTPS 端口',
                <Input type="number" value={String(formState.ssl_port || 443)} onChange={(v: any) => setFormState((s: any) => ({ ...s, ssl_port: Number(v) || 443 }))} />)}
            </div>
            {dialogField('提前告警天数',
              <Input type="number" value={String(formState.warn_days_before || 30)} onChange={(v: any) => setFormState((s: any) => ({ ...s, warn_days_before: Number(v) || 30 }))} />)}
          </>
        );
      case 'endpoint':
        return (
          <>
            <div className="dialog-form-grid">
              {dialogField('监测域名',
                <Input value={formState.target || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, target: String(v) }))} placeholder="例: example.com" />)}
              {dialogField('访问路径',
                <Input value={formState.endpoint_path || '/'} onChange={(v: any) => setFormState((s: any) => ({ ...s, endpoint_path: String(v) }))} placeholder="/" />)}
            </div>
            <div className="dialog-form-grid">
              {dialogField('协议',
                <Select value={formState.endpoint_protocol || 'https'} options={[
                  { label: 'HTTPS', value: 'https' }, { label: 'HTTP', value: 'http' },
                ]} onChange={(v: any) => setFormState((s: any) => ({ ...s, endpoint_protocol: String(Array.isArray(v) ? v[0] : v) }))} />)}
              {dialogField('端口',
                <Input type="number" value={String(formState.endpoint_port || 443)} onChange={(v: any) => setFormState((s: any) => ({ ...s, endpoint_port: Number(v) || 443 }))} />)}
            </div>
            <div className="dialog-switch-row">
              <div><strong>跟随跳转</strong></div>
              <Switch value={formState.follow_redirects !== false} onChange={(c: any) => setFormState((s: any) => ({ ...s, follow_redirects: Boolean(c) }))} />
            </div>
          </>
        );
      case 'dns_failover':
        return (
          <>
            <div className="dialog-form-grid">
              {dialogField('主机记录',
                <Input value={formState.record_name || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_name: String(v) }))} placeholder="如: www, @" />)}
              {dialogField('记录类型',
                <Select value={formState.record_type || 'A'} options={[
                  { label: 'A', value: 'A' }, { label: 'AAAA', value: 'AAAA' }, { label: 'CNAME', value: 'CNAME' },
                ]} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_type: String(Array.isArray(v) ? v[0] : v) }))} />)}
            </div>
            <div className="dialog-form-grid">
              {dialogField('TTL',
                <Input type="number" value={String(formState.record_ttl || 600)} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_ttl: Number(v) || 600 }))} />)}
              {dialogField('线路',
                <Input value={formState.record_line || 'default'} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_line: String(v) }))} />)}
            </div>
            <div className="dialog-switch-row">
              <div><strong>代理状态</strong></div>
              <Switch value={formState.proxy_enabled || false} onChange={(c: any) => setFormState((s: any) => ({ ...s, proxy_enabled: Boolean(c) }))} />
            </div>
            <div className="dialog-form-grid">
              {dialogField('需要修改DNS的域名',
                <Select value={formState.failover_domain_id || ''} options={availableDomains.map((d: any) => ({ label: `${d.name} (${d.account_name})`, value: d.id }))}
                  onChange={(v: any) => setFormState((s: any) => ({ ...s, failover_domain_id: Number(Array.isArray(v) ? v[0] : v) }))} />)}
            </div>
            {formState.failover_domain_id && (
              <div className="dialog-form-grid">
                {dialogField('主机记录自动提取',
                  <Input value={formState.record_name || ''} disabled placeholder="从上方自动提取" />)}
              </div>
            )}
            {dialogField('主解析值',
              <Input value={formState.primary_value || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, primary_value: String(v) }))} placeholder="主IP/域名" />)}
            {dialogField('备用解析值（一行一个）',
              <Textarea value={formState.backup_values || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, backup_values: String(v) }))} placeholder={"192.168.1.1\n10.0.0.1"} />)}
            <div className="dialog-switch-row">
              <div><strong>自动切回主解析</strong></div>
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
        {dialogField('名称',
          <Input value={formState.name || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, name: String(v) }))} />)}
        {renderTypeForm(type, mode === 'add')}

        {dialogField('检查间隔（秒）',
          <Input type="number" value={String(formState.check_interval || 300)} onChange={(v: any) => setFormState((s: any) => ({ ...s, check_interval: Number(v) || 300 }))} />)}

        <div className="dialog-switch-row">
          <div><strong>失败通知</strong></div>
          <Switch value={formState.notify_on_failure !== false} onChange={(c: any) => setFormState((s: any) => ({ ...s, notify_on_failure: Boolean(c) }))} />
        </div>
        <div className="dialog-switch-row">
          <div><strong>恢复通知</strong></div>
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
    const domainHint = bindEndpoint.target;
    return (
      <div className="page-shell dialog-form servicemonitor-dialog">
        <p style={{ marginBottom: 12, color: '#666' }}>为 <strong>{bindEndpoint.name}</strong> 绑定 DNS 故障转移</p>
        <div className="dialog-form-grid">
          {dialogField('主机记录',
            <Input value={formState.record_name || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_name: String(v) }))}
              placeholder={`如: www (${domainHint} → www.${domainHint})`} />)}
          {dialogField('记录类型',
            <Select value={formState.record_type || 'A'} options={[
              { label: 'A', value: 'A' }, { label: 'AAAA', value: 'AAAA' }, { label: 'CNAME', value: 'CNAME' },
            ]} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_type: String(Array.isArray(v) ? v[0] : v) }))} />)}
        </div>
        <div className="dialog-form-grid">
          {dialogField('TTL',
            <Input type="number" value={String(formState.record_ttl || 600)} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_ttl: Number(v) || 600 }))} />)}
          {dialogField('线路',
            <Input value={formState.record_line || 'default'} onChange={(v: any) => setFormState((s: any) => ({ ...s, record_line: String(v) }))} />)}
        </div>
        <div className="dialog-form-grid">
          {dialogField('需要修改DNS的域名',
            <Select value={formState.failover_domain_id || ''} options={availableDomains.map((d: any) => ({ label: `${d.name} (${d.account_name})`, value: d.id }))}
              onChange={(v: any) => setFormState((s: any) => ({ ...s, failover_domain_id: Number(Array.isArray(v) ? v[0] : v) }))} />)}
        </div>
        {dialogField('主解析值',
          <Input value={formState.primary_value || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, primary_value: String(v) }))} placeholder="主IP/域名" />)}
        {dialogField('备用解析值（一行一个）',
          <Textarea value={formState.backup_values || ''} onChange={(v: any) => setFormState((s: any) => ({ ...s, backup_values: String(v) }))} placeholder={"192.168.1.1\n10.0.0.1"} />)}
        <div className="dialog-switch-row">
          <div><strong>代理状态</strong></div>
          <Switch value={formState.proxy_enabled || false} onChange={(c: any) => setFormState((s: any) => ({ ...s, proxy_enabled: Boolean(c) }))} />
        </div>
        <div className="dialog-switch-row">
          <div><strong>自动切回主解析</strong></div>
          <Switch value={formState.auto_switch_back !== false} onChange={(c: any) => setFormState((s: any) => ({ ...s, auto_switch_back: Boolean(c) }))} />
        </div>
        <Space style={{ marginTop: 16 }}>
          <Button theme="primary" onClick={handleBind} loading={bindMutation.isPending}>绑定故障转移</Button>
        </Space>
      </div>
    );
  };

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h2>服务监测</h2>
          <p>SSL 证书 / 站点访问 / DNS 故障转移</p>
        </div>
      </section>

      <Tabs value={activeTab} onChange={(v: any) => setActiveTab(String(v))}>
        <Tabs.TabPanel value="ssl" label="SSL 证书监测">
          <SSLTab monitors={monitors} isLoading={isLoading}
            onEdit={openEdit} onDelete={(m) => setDeleteMonitor(m)}
            onCheck={(m) => checkMutation.mutate(m.id)}
            onAdd={() => openAddModal('ssl_certificate')} />
        </Tabs.TabPanel>
        <Tabs.TabPanel value="endpoint" label="站点访问监测">
          <EndpointTab monitors={monitors} failoverMap={failoverMap} isLoading={isLoading}
            onEdit={openEdit} onDelete={(m) => setDeleteMonitor(m)}
            onCheck={(m) => checkMutation.mutate(m.id)}
            onAdd={() => openAddModal('endpoint')}
            onBindFailover={(m) => { setBindEndpoint(m); resetForm(); setIsBindModalOpen(true); }} />
        </Tabs.TabPanel>
        <Tabs.TabPanel value="failover" label="DNS 故障转移">
          <FailoverTab monitors={monitors} isLoading={isLoading}
            onEdit={openEdit} onDelete={(m) => setDeleteMonitor(m)}
            onCheck={(m) => checkMutation.mutate(m.id)} />
        </Tabs.TabPanel>
      </Tabs>

      {/* Add Modal */}
      {isAddModalOpen && (
        <Modal title={`新建 ${addType === 'ssl_certificate' ? 'SSL证书监测' : addType === 'endpoint' ? '站点访问监测' : 'DNS故障转移'}`}
          onClose={closeAddModal} size="lg">
          {renderForm('add')}
        </Modal>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && selectedMonitor && (
        <Modal title="编辑监测" onClose={closeEditModal} size="lg">
          {renderForm('edit')}
        </Modal>
      )}

      {/* Bind Failover Modal */}
      {isBindModalOpen && bindEndpoint && (
        <Modal title="绑定 DNS 故障转移" onClose={() => { setIsBindModalOpen(false); setBindEndpoint(null); }} size="lg">
          {renderBindForm()}
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteMonitor && (
        <ConfirmDialog
          message={`确定删除监测 "${deleteMonitor.name}"？`}
          onConfirm={() => deleteMutation.mutate(deleteMonitor.id)}
          onCancel={() => setDeleteMonitor(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

// ---- Utility functions ----

function dialogField(label: string, control: ReactNode, tips?: ReactNode) {
  return (
    <div className="settings-control-field">
      <span>{label}</span>
      {control}
      {tips && <small className="settings-control-field__tip">{tips}</small>}
    </div>
  );
}

function buildConfigFromMonitor(m: ServiceMonitorMonitor): Record<string, any> {
  const cfg = m.config || {};
  switch (m.monitor_type) {
    case 'ssl_certificate':
      return {
        ssl_port: cfg.port || 443,
        warn_days_before: cfg.warn_days_before || 30,
      };
    case 'endpoint':
      return {
        endpoint_protocol: cfg.protocol || 'https',
        endpoint_port: cfg.port || 443,
        endpoint_path: cfg.path || '/',
        follow_redirects: cfg.followRedirects !== false,
      };
    case 'dns_failover':
      return {
        record_type: cfg.recordType || 'A',
        record_name: cfg.recordName || '',
        record_ttl: cfg.ttl || 600,
        record_line: cfg.line || 'default',
        proxy_enabled: cfg.proxyEnabled || false,
        primary_value: cfg.primaryValue || '',
        backup_values: Array.isArray(cfg.backupValues) ? cfg.backupValues.join('\n') : '',
        auto_switch_back: cfg.autoSwitchBack !== false,
        failover_domain_id: m.domain_id,
      };
    default:
      return {};
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
      payload.config = {
        port: Number(formState.ssl_port) || 443,
        warn_days_before: Number(formState.warn_days_before) || 30,
      };
      break;
    case 'endpoint':
      payload.config = {
        protocol: formState.endpoint_protocol || 'https',
        port: Number(formState.endpoint_port) || 443,
        path: formState.endpoint_path || '/',
        followRedirects: formState.follow_redirects !== false,
      };
      break;
    case 'dns_failover':
      if (formState.failover_domain_id) payload.domain_id = formState.failover_domain_id;
      payload.config = {
        recordType: formState.record_type || 'A',
        recordName: formState.record_name || '',
        ttl: Number(formState.record_ttl) || 600,
        line: formState.record_line || 'default',
        proxyEnabled: formState.proxy_enabled || false,
        primaryValue: formState.primary_value || '',
        backupValues: (formState.backup_values || '').split('\n').map((s: string) => s.trim()).filter(Boolean),
        autoSwitchBack: formState.auto_switch_back !== false,
      };
      break;
  }

  return payload;
}
