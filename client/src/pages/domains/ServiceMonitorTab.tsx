import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Loading, Pagination, Select, Space, Switch, Tag } from 'tdesign-react';
import { AddIcon, DeleteIcon, SearchIcon, EditIcon, CheckCircleIcon, ErrorCircleIcon, TimeIcon } from 'tdesign-icons-react';
import { serviceMonitorApi } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';

interface ServiceMonitorMonitor {
  id: number;
  name: string;
  monitor_type: 'ssl_certificate' | 'endpoint' | 'dns_failover';
  target: string;
  status: 'ok' | 'warning' | 'error' | 'unknown';
  check_interval: number;
  config: Record<string, any>;
  notify_on_failure: boolean;
  notify_on_recovery: boolean;
  last_check_at?: string;
  response_time?: number;
  domain_id?: number;
  created_at: string;
  updated_at: string;
}

interface MonitorFormState {
  name: string;
  monitor_type: 'ssl_certificate' | 'endpoint' | 'dns_failover';
  target: string;
  domain_id?: number;
  check_interval: number;
  notify_on_failure: boolean;
  notify_on_recovery: boolean;
  // SSL config
  ssl_port: number;
  ssl_warn_days: number;
  ssl_check_chain: boolean;
  // Endpoint config
  endpoint_method: 'GET' | 'HEAD' | 'POST';
  endpoint_expected_status: number;
  endpoint_follow_redirects: boolean;
  // DNS Failover config
  failover_primary_value: string;
  failover_backup_values: string;
  failover_check_method: 'http' | 'tcp' | 'ping';
  failover_check_port: number;
  failover_check_path: string;
  failover_auto_switch_back: boolean;
}

const DEFAULT_FORM_STATE: MonitorFormState = {
  name: '',
  monitor_type: 'ssl_certificate',
  target: '',
  domain_id: undefined,
  check_interval: 300,
  notify_on_failure: true,
  notify_on_recovery: true,
  ssl_port: 443,
  ssl_warn_days: 30,
  ssl_check_chain: true,
  endpoint_method: 'GET',
  endpoint_expected_status: 200,
  endpoint_follow_redirects: true,
  failover_primary_value: '',
  failover_backup_values: '',
  failover_check_method: 'http',
  failover_check_port: 80,
  failover_check_path: '/',
  failover_auto_switch_back: true,
};

const dialogField = (label: string, control: ReactNode, tips?: ReactNode) => (
  <div className="settings-control-field">
    <span>{label}</span>
    {control}
    {tips && <small className="settings-control-field__tip">{tips}</small>}
  </div>
);

function buildFormFromMonitor(monitor: ServiceMonitorMonitor | null): MonitorFormState {
  if (!monitor) return { ...DEFAULT_FORM_STATE };
  const config = monitor.config || {};
  return {
    name: monitor.name || '',
    monitor_type: monitor.monitor_type || 'ssl_certificate',
    target: monitor.target || '',
    domain_id: monitor.domain_id,
    check_interval: monitor.check_interval || 300,
    notify_on_failure: monitor.notify_on_failure ?? true,
    notify_on_recovery: monitor.notify_on_recovery ?? true,
    ssl_port: Number(config.port) || 443,
    ssl_warn_days: Number(config.warn_days_before) || 30,
    ssl_check_chain: config.check_chain ?? true,
    endpoint_method: config.method || 'GET',
    endpoint_expected_status: Number(config.expected_status) || 200,
    endpoint_follow_redirects: config.follow_redirects ?? true,
    failover_primary_value: String(config.primary_value || ''),
    failover_backup_values: Array.isArray(config.backup_values) ? config.backup_values.join(', ') : String(config.backup_values || ''),
    failover_check_method: config.check_method || 'http',
    failover_check_port: Number(config.check_port) || 80,
    failover_check_path: String(config.check_path || '/'),
    failover_auto_switch_back: config.auto_switch_back ?? true,
  };
}

function buildPayload(form: MonitorFormState): any {
  const payload: any = {
    name: form.name,
    monitor_type: form.monitor_type,
    target: form.target,
    check_interval: form.check_interval,
    notify_on_failure: form.notify_on_failure,
    notify_on_recovery: form.notify_on_recovery,
  };

  if (form.domain_id) {
    payload.domain_id = form.domain_id;
  }

  switch (form.monitor_type) {
    case 'ssl_certificate':
      payload.config = {
        port: form.ssl_port,
        warn_days_before: form.ssl_warn_days,
        check_chain: form.ssl_check_chain,
      };
      break;
    case 'endpoint':
      payload.config = {
        method: form.endpoint_method,
        expected_status: form.endpoint_expected_status,
        follow_redirects: form.endpoint_follow_redirects,
      };
      break;
    case 'dns_failover':
      payload.config = {
        primary_value: form.failover_primary_value,
        backup_values: form.failover_backup_values.split(',').map((s: string) => s.trim()).filter(Boolean),
        check_method: form.failover_check_method,
        check_port: form.failover_check_port,
        check_path: form.failover_check_path,
        auto_switch_back: form.failover_auto_switch_back,
      };
      break;
  }

  return payload;
}

export function ServiceMonitorTab() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [searchKeyword, setSearchKeyword] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedMonitor, setSelectedMonitor] = useState<ServiceMonitorMonitor | null>(null);
  const [deleteMonitor, setDeleteMonitor] = useState<ServiceMonitorMonitor | null>(null);

  // Form state
  const [formState, setFormState] = useState<MonitorFormState>({ ...DEFAULT_FORM_STATE });

  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ['servicemonitor'],
    queryFn: () => serviceMonitorApi.list().then((r) => r.data.data || []),
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const { data: availableDomains = [] } = useQuery({
    queryKey: ['servicemonitor-domains'],
    queryFn: () => serviceMonitorApi.getAvailableDomains().then((r) => r.data.data || []),
    enabled: isAddModalOpen,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => serviceMonitorApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicemonitor'] });
      closeAddModal();
      toast.success(t('domains.servicemonitor.monitorCreated'));
    },
    onError: () => {
      toast.error(t('common.failed'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; payload: any }) => serviceMonitorApi.update(data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicemonitor'] });
      closeEditModal();
      toast.success(t('domains.servicemonitor.monitorUpdated'));
    },
    onError: () => {
      toast.error(t('common.failed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => serviceMonitorApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicemonitor'] });
      setDeleteMonitor(null);
      toast.success(t('domains.servicemonitor.monitorDeleted'));
    },
    onError: () => {
      toast.error(t('common.failed'));
    },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => serviceMonitorApi.check(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servicemonitor'] });
      toast.success(t('domains.servicemonitor.monitorCheckTriggered'));
    },
    onError: () => {
      toast.error(t('common.failed'));
    },
  });

  const resetForm = () => {
    setFormState({ ...DEFAULT_FORM_STATE });
  };

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    resetForm();
  };

  const openEditModal = (monitor: ServiceMonitorMonitor) => {
    setSelectedMonitor(monitor);
    setFormState(buildFormFromMonitor(monitor));
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setSelectedMonitor(null);
    resetForm();
  };

  const updateField = <K extends keyof MonitorFormState>(field: K, value: MonitorFormState[K]) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleAdd = () => {
    if (!formState.name || !formState.target) {
      toast.error(t('common.required'));
      return;
    }
    createMutation.mutate(buildPayload(formState));
  };

  const handleEdit = () => {
    if (!selectedMonitor) return;
    updateMutation.mutate({ id: selectedMonitor.id, payload: buildPayload(formState) });
  };

  const filteredMonitors = monitors.filter((m: ServiceMonitorMonitor) =>
    m.name?.toLowerCase().includes(searchKeyword.toLowerCase()) ||
    m.target?.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  const paginatedMonitors = filteredMonitors.slice((page - 1) * pageSize, page * pageSize);

  const typeTag = (type: string) => {
    const labels: Record<string, string> = {
      ssl_certificate: t('domains.servicemonitor.type_ssl_certificate'),
      endpoint: t('domains.servicemonitor.type_endpoint'),
      dns_failover: t('domains.servicemonitor.type_dns_failover'),
    };
    const themes: Record<string, 'primary' | 'warning' | 'danger'> = {
      ssl_certificate: 'primary',
      endpoint: 'warning',
      dns_failover: 'danger',
    };
    return <Tag theme={themes[type] || 'default'} variant="light">{labels[type] || type}</Tag>;
  };

  const statusTag = (status: string) => {
    const labels: Record<string, string> = {
      ok: t('domains.servicemonitor.status_ok'),
      warning: t('domains.servicemonitor.status_warning'),
      error: t('domains.servicemonitor.status_error'),
      unknown: t('domains.servicemonitor.status_unknown'),
    };
    const themes: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
      ok: 'success',
      warning: 'warning',
      error: 'danger',
      unknown: 'default',
    };
    const icons: Record<string, ReactNode> = {
      ok: <CheckCircleIcon />,
      warning: <TimeIcon />,
      error: <ErrorCircleIcon />,
      unknown: <TimeIcon />,
    };
    return (
      <Tag theme={themes[status] || 'default'} variant="light" icon={icons[status]}>
        {labels[status] || status}
      </Tag>
    );
  };

  const columns = [
    {
      key: 'name',
      label: t('domains.servicemonitor.name'),
      render: (row: ServiceMonitorMonitor) => <span className="page-strong">{row.name}</span>,
    },
    {
      key: 'monitor_type',
      label: t('domains.servicemonitor.type'),
      render: (row: ServiceMonitorMonitor) => typeTag(row.monitor_type),
    },
    {
      key: 'target',
      label: t('domains.servicemonitor.target'),
      render: (row: ServiceMonitorMonitor) => <span className="record-mono record-mono--value">{row.target}</span>,
    },
    {
      key: 'status',
      label: t('domains.servicemonitor.status'),
      render: (row: ServiceMonitorMonitor) => statusTag(row.status),
    },
    {
      key: 'last_check_at',
      label: t('domains.servicemonitor.lastCheck'),
      render: (row: ServiceMonitorMonitor) => (
        <span className="page-muted">
          {row.last_check_at ? new Date(row.last_check_at).toLocaleString() : '-'}
        </span>
      ),
    },
    {
      key: 'response_time',
      label: t('domains.servicemonitor.responseTime'),
      render: (row: ServiceMonitorMonitor) => (
        <span className="page-muted">
          {row.response_time != null ? `${row.response_time}ms` : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: t('domains.servicemonitor.actions'),
      render: (row: ServiceMonitorMonitor) => (
        <Space size="small">
          <Button
            shape="square"
            variant="text"
            theme="primary"
            icon={<CheckCircleIcon />}
            loading={checkMutation.isPending}
            onClick={() => checkMutation.mutate(row.id)}
          />
          <Button
            shape="square"
            variant="text"
            icon={<EditIcon />}
            onClick={() => openEditModal(row)}
          />
          <Button
            shape="square"
            variant="text"
            theme="danger"
            icon={<DeleteIcon />}
            disabled={deleteMutation.isPending}
            onClick={() => setDeleteMonitor(row)}
          />
        </Space>
      ),
    },
  ];

  const renderConfigFields = () => {
    switch (formState.monitor_type) {
      case 'ssl_certificate':
        return (
          <>
            <div className="dialog-form-grid">
              {dialogField(t('domains.servicemonitor.ssl_port'),
                <Input
                  type="number"
                  value={String(formState.ssl_port)}
                  onChange={(value: any) => updateField('ssl_port', Number(value) || 443)}
                />
              )}
              {dialogField(t('domains.servicemonitor.ssl_warnDays'),
                <Input
                  type="number"
                  value={String(formState.ssl_warn_days)}
                  onChange={(value: any) => updateField('ssl_warn_days', Number(value) || 30)}
                />
              )}
            </div>
            <div className="dialog-switch-row">
              <div>
                <strong>{t('domains.servicemonitor.ssl_checkChain')}</strong>
              </div>
              <Switch value={formState.ssl_check_chain} onChange={(checked: any) => updateField('ssl_check_chain', Boolean(checked))} />
            </div>
          </>
        );
      case 'endpoint':
        return (
          <>
            <div className="dialog-form-grid">
              {dialogField(t('domains.servicemonitor.endpoint_method'),
                <Select
                  value={formState.endpoint_method}
                  options={[
                    { label: 'GET', value: 'GET' },
                    { label: 'HEAD', value: 'HEAD' },
                    { label: 'POST', value: 'POST' },
                  ]}
                  onChange={(value: any) => updateField('endpoint_method', String(Array.isArray(value) ? value[0] : value) as 'GET' | 'HEAD' | 'POST')}
                />
              )}
              {dialogField(t('domains.servicemonitor.endpoint_expectedStatus'),
                <Input
                  type="number"
                  value={String(formState.endpoint_expected_status)}
                  onChange={(value: any) => updateField('endpoint_expected_status', Number(value) || 200)}
                />
              )}
            </div>
            <div className="dialog-switch-row">
              <div>
                <strong>{t('domains.servicemonitor.endpoint_followRedirects')}</strong>
              </div>
              <Switch value={formState.endpoint_follow_redirects} onChange={(checked: any) => updateField('endpoint_follow_redirects', Boolean(checked))} />
            </div>
          </>
        );
      case 'dns_failover':
        return (
          <>
            {dialogField(t('domains.servicemonitor.failover_primaryValue'),
              <Input
                value={formState.failover_primary_value}
                onChange={(value: any) => updateField('failover_primary_value', String(value))}
              />
            )}
            {dialogField(t('domains.servicemonitor.failover_backupValues'),
              <Input
                value={formState.failover_backup_values}
                onChange={(value: any) => updateField('failover_backup_values', String(value))}
              />
            )}
            <div className="dialog-form-grid">
              {dialogField(t('domains.servicemonitor.failover_checkMethod'),
                <Select
                  value={formState.failover_check_method}
                  options={[
                    { label: 'HTTP', value: 'http' },
                    { label: 'TCP', value: 'tcp' },
                    { label: 'PING', value: 'ping' },
                  ]}
                  onChange={(value: any) => updateField('failover_check_method', String(Array.isArray(value) ? value[0] : value) as 'http' | 'tcp' | 'ping')}
                />
              )}
              {dialogField(t('domains.servicemonitor.failover_checkPort'),
                <Input
                  type="number"
                  value={String(formState.failover_check_port)}
                  onChange={(value: any) => updateField('failover_check_port', Number(value) || 80)}
                />
              )}
            </div>
            {formState.failover_check_method === 'http' && dialogField(t('domains.servicemonitor.failover_checkPath'),
              <Input
                value={formState.failover_check_path}
                onChange={(value: any) => updateField('failover_check_path', String(value))}
                placeholder="/"
              />
            )}
            <div className="dialog-switch-row">
              <div>
                <strong>{t('domains.servicemonitor.failover_autoSwitchBack')}</strong>
              </div>
              <Switch value={formState.failover_auto_switch_back} onChange={(checked: any) => updateField('failover_auto_switch_back', Boolean(checked))} />
            </div>
          </>
        );
      default:
        return null;
    }
  };

  const renderForm = (mode: 'add' | 'edit') => (
    <Form
      layout="vertical"
      colon={false}
      requiredMark={false}
      className="page-shell dialog-form servicemonitor-dialog"
      onSubmit={({ e }: any) => {
        e?.preventDefault();
        if (mode === 'add') handleAdd();
        else handleEdit();
      }}
    >
      {dialogField(t('domains.servicemonitor.name'),
        <Input
          value={formState.name}
          onChange={(value: any) => updateField('name', String(value))}
        />
      )}
      {dialogField(t('domains.servicemonitor.type'),
        <Select
          value={formState.monitor_type}
          options={[
            { label: t('domains.servicemonitor.type_ssl_certificate'), value: 'ssl_certificate' },
            { label: t('domains.servicemonitor.type_endpoint'), value: 'endpoint' },
            { label: t('domains.servicemonitor.type_dns_failover'), value: 'dns_failover' },
          ]}
          onChange={(value: any) => updateField('monitor_type', String(Array.isArray(value) ? value[0] : value) as 'ssl_certificate' | 'endpoint' | 'dns_failover')}
        />
      )}
      {dialogField(t('domains.servicemonitor.target'),
        <Input
          value={formState.target}
          onChange={(value: any) => updateField('target', String(value))}
        />
      )}

      <div className="dialog-section-header">
        <strong>{t('domains.servicemonitor.configSection')}</strong>
      </div>
      {renderConfigFields()}

      {dialogField(t('domains.servicemonitor.checkInterval'),
        <Input
          type="number"
          value={String(formState.check_interval)}
          onChange={(value: any) => updateField('check_interval', Number(value) || 300)}
        />
      )}

      <div className="dialog-switch-row">
        <div>
          <strong>{t('domains.servicemonitor.notifyOnFailure')}</strong>
        </div>
        <Switch value={formState.notify_on_failure} onChange={(checked: any) => updateField('notify_on_failure', Boolean(checked))} />
      </div>
      <div className="dialog-switch-row">
        <div>
          <strong>{t('domains.servicemonitor.notifyOnRecovery')}</strong>
        </div>
        <Switch value={formState.notify_on_recovery} onChange={(checked: any) => updateField('notify_on_recovery', Boolean(checked))} />
      </div>

      <Space className="record-form__actions dialog-form-actions">
        <Button type="submit" theme="primary" loading={createMutation.isPending || updateMutation.isPending}>
          {t('common.save')}
        </Button>
      </Space>
    </Form>
  );

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h2>{t('domains.servicemonitor.title')}</h2>
          <p>{t('domains.servicemonitor.subtitle')}</p>
        </div>
        <Button theme="primary" icon={<AddIcon />} onClick={openAddModal}>
          {t('domains.servicemonitor.addMonitor')}
        </Button>
      </section>

      <Card bordered={false} shadow={false} className="page-card servicemonitor-card">
        <div className="records-toolbar servicemonitor-card__toolbar">
          <Input
            clearable
            type="search"
            name="servicemonitor-search"
            autocomplete="off"
            value={searchKeyword}
            prefixIcon={<SearchIcon />}
            placeholder={t('common.search')}
            onChange={(value: any) => {
              setSearchKeyword(String(value));
              setPage(1);
            }}
          />
        </div>
        <Table
          columns={columns}
          data={paginatedMonitors}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyText={t('domains.servicemonitor.noMonitors')}
        />
        <div className="records-pagination">
          <Pagination
            size="small"
            current={page}
            pageSize={pageSize}
            total={filteredMonitors.length}
            totalContent={false}
            showPageSize={false}
            showJumper={false}
            onCurrentChange={(current: number) => setPage(current)}
          />
        </div>
      </Card>

      {isAddModalOpen && (
        <Modal title={t('domains.servicemonitor.addMonitor')} onClose={closeAddModal} size="lg" destroyOnClose>
          {renderForm('add')}
        </Modal>
      )}

      {isEditModalOpen && selectedMonitor && (
        <Modal title={t('domains.servicemonitor.editMonitor')} onClose={closeEditModal} size="lg" destroyOnClose>
          {renderForm('edit')}
        </Modal>
      )}

      {deleteMonitor && (
        <ConfirmDialog
          message={t('nsMonitor.deleteConfirm', { domain: deleteMonitor.name })}
          onConfirm={() => {
            deleteMutation.mutate(deleteMonitor.id);
          }}
          onCancel={() => setDeleteMonitor(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}