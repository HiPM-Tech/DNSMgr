import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Form, Input, Pagination, Radio, Space, Switch, Tag, Textarea } from 'tdesign-react';
import {
  AddIcon,
  BrushIcon,
  CheckCircleIcon,
  DeleteIcon,
  EditIcon,
  ErrorTriangleIcon,
  MailIcon,
  NotificationIcon,
  RefreshIcon,
  SearchIcon,
  ShieldErrorIcon,
} from 'tdesign-icons-react';
import { nsMonitorApi, domainsApi } from '../../api';
import type { Domain } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { useFormSync } from '../../hooks/useFormSync';
import { toBoolean } from '../../utils/typeConverters';
import { formatDomainName } from '../../utils/domain';

interface NSMonitorConfig {
  id: number;
  domain_id: number;
  domain_name: string;
  expected_ns: string;
  enabled: boolean | number | string; // Backend may return 0/1 for SQLite/MySQL
  notify_email: boolean | number | string;
  notify_channels: boolean | number | string;
  current_ns?: string | number;
  encrypted_ns?: string | string[];
  plain_ns?: string | string[];
  is_poisoned?: boolean;
  status?: 'ok' | 'mismatch' | 'missing' | 'poisoned';
  last_check_at?: string;
  alert_count?: number;
}

const dialogField = (label: string, control: ReactNode, tips?: ReactNode) => (
  <div className="settings-control-field">
    <span>{label}</span>
    {control}
    {tips && <small className="settings-control-field__tip">{tips}</small>}
  </div>
);

export function NSMonitorTab() {
  const { t } = useI18n();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedConfig, setSelectedConfig] = useState<NSMonitorConfig | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [deleteConfig, setDeleteConfig] = useState<NSMonitorConfig | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);
  // Edit form state is now managed by useFormSync
  const [addExpectedNs, setAddExpectedNs] = useState('');
  const [addEnabled, setAddEnabled] = useState(true);
  const [addNotifyEmail, setAddNotifyEmail] = useState(false);
  const [addNotifyChannels, setAddNotifyChannels] = useState(false);

  const [domainPage, setDomainPage] = useState(1);
  const [domainPageSize] = useState(20);
  const [domainSearchKeyword, setDomainSearchKeyword] = useState('');

  useRealtimeData({
    queryKey: ['ns-monitor'],
    websocketEventTypes: ['ns_monitor_created', 'ns_monitor_updated', 'ns_monitor_deleted'],
    pollingInterval: 60000,
  });

  useRealtimeData({
    queryKey: ['ns-monitor-user-prefs'],
    websocketEventTypes: ['ns_monitor_prefs_updated'],
    pollingInterval: 60000,
  });

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['ns-monitor'],
    queryFn: () => nsMonitorApi.list().then((r) => r.data.data || []),
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const { data: userPrefs } = useQuery({
    queryKey: ['ns-monitor-user-prefs'],
    queryFn: () => nsMonitorApi.getUserPrefs().then((r) => r.data.data),
  });

  const { data: domainsData } = useQuery<{ list: Domain[]; total: number; page: number; pageSize: number; totalPages: number }>({
    queryKey: ['domains-for-ns-monitor'],
    queryFn: () => domainsApi.list({ pageSize: 1000 }).then((r) => r.data.data ?? { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    enabled: isAddModalOpen,
  });

  const monitoredDomainIds = new Set((configs || []).map((config: NSMonitorConfig) => config.domain_id));
  const filteredDomains = (domainsData?.list ?? []).filter((domain) => (
    domain.name.toLowerCase().includes(domainSearchKeyword.toLowerCase()) &&
    !monitoredDomainIds.has(domain.id)
  ));
  const domainStartIndex = (domainPage - 1) * domainPageSize;
  const domainEndIndex = Math.min(domainStartIndex + domainPageSize, filteredDomains.length);
  const paginatedDomains = filteredDomains.slice(domainStartIndex, domainEndIndex);
  const domains = domainsData?.list ?? [];

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; expected_ns: string; enabled: boolean }) => nsMonitorApi.update(data.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      setIsEditModalOpen(false);
      toast.success(t('nsMonitor.updateSuccess'));
    },
    onError: () => {
      toast.error(t('nsMonitor.updateFailed'));
    },
  });

  const updateUserPrefsMutation = useMutation({
    mutationFn: (data: { notify_email?: boolean; notify_channels?: boolean }) => nsMonitorApi.updateUserPrefs(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      queryClient.invalidateQueries({ queryKey: ['ns-monitor-user-prefs'] });
    },
    onError: () => {
      toast.error(t('nsMonitor.updatePrefsFailed'));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { domain_id: number; expected_ns: string; enabled: boolean; notify_email: boolean; notify_channels: boolean }) => nsMonitorApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      closeAddModal();
      toast.success(t('nsMonitor.addSuccess'));
    },
    onError: () => {
      toast.error(t('nsMonitor.addFailed'));
    },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => nsMonitorApi.check(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      toast.success(t('nsMonitor.checkSuccess'));
    },
    onError: () => {
      toast.error(t('nsMonitor.checkFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => nsMonitorApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      toast.success(t('nsMonitor.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('nsMonitor.deleteFailed'));
    },
  });

  const resolveNsMutation = useMutation({
    mutationFn: ({ domainName }: { domainName: string; target: 'edit' | 'add' }) => nsMonitorApi.resolveNs(domainName),
    onSuccess: (response, variables) => {
      const data = response.data.data;
      if (data.recommendedNs && data.recommendedNs.length > 0) {
        const expectedNs = data.recommendedNs.join(', ');
        if (variables.target === 'edit') {
          updateEditField('expected_ns', expectedNs);
        } else {
          setAddExpectedNs(expectedNs);
        }
        toast.success(t('nsMonitor.autoFillSuccess', { count: data.recommendedNs.length }));
      } else {
        toast.info(t('nsMonitor.noNsRecords'));
      }
    },
    onError: () => {
      toast.error(t('nsMonitor.resolveNsFailed'));
    },
  });

  const filteredConfigs = configs?.filter((config: NSMonitorConfig) => config.domain_name?.toLowerCase().includes(searchKeyword.toLowerCase())) || [];

  const parseNSField = (value: string | string[] | number | undefined): string[] => {
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'number') return [];
    if (Array.isArray(value)) return value;
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  };

  // Use useFormSync for edit form state management
  interface EditFormState {
    id?: number;
    expected_ns?: string;
    enabled?: boolean;
    notify_email?: boolean;
    notify_channels?: boolean;
  }

  const buildEditFormState = (config: NSMonitorConfig): EditFormState => ({
    id: config.id,
    expected_ns: String(config.expected_ns || ''),
    enabled: toBoolean(config.enabled),
    notify_email: toBoolean(userPrefs?.notify_email ?? config.notify_email),
    notify_channels: toBoolean(userPrefs?.notify_channels ?? config.notify_channels),
  });

  // Convert NSMonitorConfig to EditFormState
  const convertToEditForm = (config: NSMonitorConfig | null): EditFormState | undefined => {
    if (!config) {
      return undefined;
    }
    return buildEditFormState(config);
  };

  const {
    formState: editFormState,
    updateField: updateEditField,
    updateFields: updateEditFields,
  } = useFormSync<EditFormState>(
    convertToEditForm(selectedConfig),
    {
      expected_ns: '',
      enabled: true,
      notify_email: false,
      notify_channels: false,
    },
    {
      fields: ['expected_ns', 'enabled', 'notify_email', 'notify_channels'],
      transformers: {
        expected_ns: (v: any) => String(v || ''),
        enabled: (v: any) => toBoolean(v),
        notify_email: (v: any) => toBoolean(userPrefs?.notify_email ?? v),
        notify_channels: (v: any) => toBoolean(userPrefs?.notify_channels ?? v),
      },
    }
  );

  const openEditModal = (row: NSMonitorConfig) => {
    updateEditFields(buildEditFormState(row));
    setSelectedConfig(row);
    setIsEditModalOpen(true);
  };

  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setSelectedDomainId(null);
    setDomainSearchKeyword('');
    setDomainPage(1);
    setAddExpectedNs('');
    setAddEnabled(true);
    setAddNotifyEmail(false);
    setAddNotifyChannels(false);
  };

  const handleToggleEnabled = (row: NSMonitorConfig) => {
    updateMutation.mutate({
      id: row.id,
      expected_ns: row.expected_ns,
      enabled: !toBoolean(row.enabled),
    });
  };

  const handleSave = () => {
    if (!selectedConfig) return;

    updateMutation.mutate({
      id: selectedConfig.id,
      expected_ns: editFormState.expected_ns || '',
      enabled: editFormState.enabled ?? true,
    });

    updateUserPrefsMutation.mutate({
      notify_email: editFormState.notify_email ?? false,
      notify_channels: editFormState.notify_channels ?? false,
    });
  };

  const handleAdd = () => {
    if (!selectedDomainId) {
      toast.error(t('nsMonitor.selectDomain'));
      return;
    }

    createMutation.mutate({
      domain_id: selectedDomainId,
      expected_ns: addExpectedNs,
      enabled: addEnabled,
      notify_email: addNotifyEmail,
      notify_channels: addNotifyChannels,
    });
  };

  const columns: { key: string; label: string; render?: (row: NSMonitorConfig) => ReactNode }[] = [
    {
      key: 'domain_name',
      label: t('nsMonitor.domainName'),
      render: (row: NSMonitorConfig) => (
        <Space size="small" breakLine>
          <span className="page-strong">{formatDomainName(row.domain_name)}</span>
          {row.status === 'poisoned' && <Tag theme="danger" variant="light" icon={<ShieldErrorIcon />}>{t('nsMonitor.poisoned')}</Tag>}
          {row.status === 'mismatch' && <Tag theme="warning" variant="light" icon={<ErrorTriangleIcon />}>{t('nsMonitor.mismatch')}</Tag>}
          {row.status === 'missing' && <Tag theme="danger" variant="light" icon={<ErrorTriangleIcon />}>{t('nsMonitor.missing')}</Tag>}
          {row.status === 'ok' && <Tag theme="success" variant="light" icon={<CheckCircleIcon />}>{t('nsMonitor.normal')}</Tag>}
        </Space>
      ),
    },
    {
      key: 'current_ns',
      label: t('nsMonitor.currentNS'),
      render: (row: NSMonitorConfig) => {
        const encryptedNS = parseNSField(row.encrypted_ns);
        const plainNS = parseNSField(row.plain_ns);

        return (
          <div className="page-list">
            {encryptedNS.length > 0 && (
              <span className="record-mono record-mono--value">
                {t('nsMonitor.encrypted')}: {encryptedNS.join(', ')}
              </span>
            )}
            {plainNS.length > 0 && (
              <span className="record-mono record-mono--value">
                {t('nsMonitor.plain')}: {plainNS.join(', ')}
              </span>
            )}
            {encryptedNS.length === 0 && plainNS.length === 0 && (
              <span className="page-muted">
                {row.current_ns && String(row.current_ns) !== '0' ? row.current_ns : t('nsMonitor.notChecked')}
              </span>
            )}
            {row.is_poisoned === true && (
              <Tag theme="danger" variant="light" icon={<ShieldErrorIcon />}>
                {t('nsMonitor.dnsPoisoningDetected')}
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      key: 'expected_ns',
      label: t('nsMonitor.expectedNS'),
      render: (row: NSMonitorConfig) => <span className="record-mono record-mono--value">{row.expected_ns || t('nsMonitor.notSet')}</span>,
    },
    {
      key: 'enabled',
      label: t('nsMonitor.monitoring'),
      render: (row: NSMonitorConfig) => {
        const isEnabled = toBoolean(row.enabled);
        return (
          <Switch
            value={isEnabled}
            customValue={[true, false]}
            loading={updateMutation.isPending}
            onChange={() => handleToggleEnabled(row)}
          />
        );
      },
    },
    {
      key: 'notifications',
      label: t('nsMonitor.notifications'),
      render: (row: NSMonitorConfig) => {
        const hasEmail = toBoolean(userPrefs?.notify_email ?? row.notify_email);
        const hasChannels = toBoolean(userPrefs?.notify_channels ?? row.notify_channels);
        if (!hasEmail && !hasChannels) return <span className="page-muted">-</span>;
        return (
          <Space size="small">
            {hasEmail && <Tag theme="primary" variant="light" icon={<MailIcon />}>{t('nsMonitor.notifyEmail')}</Tag>}
            {hasChannels && <Tag theme="warning" variant="light" icon={<NotificationIcon />}>{t('nsMonitor.notifyChannels')}</Tag>}
          </Space>
        );
      },
    },
    {
      key: 'last_check',
      label: t('nsMonitor.lastCheck'),
      render: (row: NSMonitorConfig) => (
        <span className="page-muted">
          {row.last_check_at ? new Date(row.last_check_at).toLocaleString() : t('nsMonitor.never')}
        </span>
      ),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (row: NSMonitorConfig) => (
        <Space size="small">
          <Button
            shape="square"
            variant="text"
            theme="primary"
            icon={<RefreshIcon />}
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
            onClick={() => setDeleteConfig(row)}
          />
        </Space>
      ),
    },
  ];

  const selectedDomain = paginatedDomains.find((domain) => domain.id === selectedDomainId)
    ?? filteredDomains.find((domain) => domain.id === selectedDomainId);

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h2>{t('nsMonitor.title')}</h2>
          <p>{t('nsMonitor.subtitle')}</p>
        </div>
        <Button theme="primary" icon={<AddIcon />} onClick={() => setIsAddModalOpen(true)}>
          {t('nsMonitor.addMonitor')}
        </Button>
      </section>

      <Card bordered={false} shadow={false} className="page-card ns-monitor-card">
        <div className="records-toolbar ns-monitor-card__toolbar">
          <Input
            clearable
            type="search"
            name="ns-monitor-search"
            autocomplete="off"
            value={searchKeyword}
            prefixIcon={<SearchIcon />}
            placeholder={t('nsMonitor.searchPlaceholder')}
            onChange={(value: any) => setSearchKeyword(String(value))}
          />
        </div>
        <Table
          columns={columns}
          data={filteredConfigs}
          loading={isLoading}
          rowKey={(row) => row.id}
          emptyText={t('nsMonitor.noConfigs')}
        />
      </Card>

      {isEditModalOpen && selectedConfig && (
        <Modal title={t('nsMonitor.editConfig')} onClose={() => setIsEditModalOpen(false)} size="lg">
          <Form layout="vertical" colon={false} requiredMark={false} className="page-shell dialog-form ns-monitor-dialog" onSubmit={({ e }: any) => { e?.preventDefault(); handleSave(); }}>
            {dialogField(t('nsMonitor.domainName'),
              <Input value={String(selectedConfig.domain_name)} disabled />
            )}

            {dialogField(t('nsMonitor.expectedNS'),
              <>
                <Textarea
                  value={editFormState.expected_ns || ''}
                  placeholder={t('nsMonitor.expectedNSPlaceholder')}
                  autosize={{ minRows: 3, maxRows: 6 }}
                  onChange={(value: any) => updateEditField('expected_ns', String(value))}
                />
                <Space className="record-form__actions dialog-inline-actions">
                  <Button
                    type="button"
                    variant="outline"
                    theme="primary"
                    icon={<BrushIcon />}
                    loading={resolveNsMutation.isPending}
                    onClick={() => resolveNsMutation.mutate({ domainName: selectedConfig.domain_name, target: 'edit' })}
                  >
                    {t('nsMonitor.autoFill')}
                  </Button>
                </Space>
              </>,
              t('nsMonitor.expectedNSHint')
            )}

            <div className="dialog-switch-row">
              <div>
                <strong>{t('nsMonitor.enableMonitoring')}</strong>
                <span>{t('nsMonitor.monitoring')}</span>
              </div>
              <Switch value={editFormState.enabled ?? true} onChange={(checked: any) => updateEditField('enabled', Boolean(checked))} />
            </div>

            <div className="dialog-switch-row">
              <div>
                <strong>{t('nsMonitor.notifyEmail')}</strong>
                <span>{t('nsMonitor.notifications')}</span>
              </div>
              <Switch value={editFormState.notify_email ?? false} onChange={(checked: any) => updateEditField('notify_email', Boolean(checked))} />
            </div>

            <div className="dialog-switch-row">
              <div>
                <strong>{t('nsMonitor.notifyChannels')}</strong>
                <span>{isAdmin ? t('nsMonitor.notifications') : 'Admin only'}</span>
              </div>
              <Switch
                value={editFormState.notify_channels ?? false}
                disabled={!isAdmin}
                onChange={(checked: any) => updateEditField('notify_channels', Boolean(checked))}
              />
            </div>

            <Space className="record-form__actions dialog-form-actions">
              <Button type="submit" theme="primary" loading={updateMutation.isPending || updateUserPrefsMutation.isPending}>
                {t('common.save')}
              </Button>
            </Space>
          </Form>
        </Modal>
      )}

      {isAddModalOpen && (
        <Modal title={t('nsMonitor.addMonitor')} onClose={closeAddModal} size="lg">
          <Form layout="vertical" colon={false} requiredMark={false} className="page-shell dialog-form ns-monitor-dialog" onSubmit={({ e }: any) => { e?.preventDefault(); handleAdd(); }}>
            <Form.FormItem label={t('nsMonitor.selectDomain')}>
              <Input
                clearable
                type="search"
                name="ns-monitor-domain-search"
                autocomplete="off"
                value={domainSearchKeyword}
                prefixIcon={<SearchIcon />}
                placeholder={t('common.search')}
                onChange={(value: any) => {
                  setDomainSearchKeyword(String(value));
                  setDomainPage(1);
                }}
              />

              <div className="ns-monitor-domain-picker">
                {domains.length === 0 ? (
                  <Empty description={t('nsMonitor.noAvailableDomains')} />
                ) : filteredDomains.length === 0 ? (
                  <Empty description={t('tokens.noMatchingDomains')} />
                ) : (
                  <>
                    <Radio.Group value={selectedDomainId ?? undefined} onChange={(value: any) => setSelectedDomainId(Number(value))}>
                      <div className="page-list page-list--scroll">
                        {paginatedDomains.map((domain) => (
                          <label key={domain.id} className="token-domain-option">
                            <Radio value={domain.id} />
                            <span className="page-list-item__main">
                              <strong>{domain.name}</strong>
                              <span>#{domain.id}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </Radio.Group>
                    <div className="records-pagination">
                      <Pagination
                        current={domainPage}
                        pageSize={domainPageSize}
                        total={filteredDomains.length}
                        showPageSize={false}
                        showJumper={false}
                        onCurrentChange={(current: number) => setDomainPage(current)}
                      />
                    </div>
                  </>
                )}
              </div>
            </Form.FormItem>

            <Form.FormItem label={t('nsMonitor.expectedNS')} help={t('nsMonitor.expectedNSHint')}>
              <Textarea
                value={addExpectedNs}
                placeholder={t('nsMonitor.expectedNSPlaceholder')}
                autosize={{ minRows: 3, maxRows: 6 }}
                onChange={(value: any) => setAddExpectedNs(String(value))}
              />
              <Space className="record-form__actions dialog-inline-actions">
                <Button
                  variant="outline"
                  theme="primary"
                  icon={<BrushIcon />}
                  loading={resolveNsMutation.isPending}
                  disabled={!selectedDomain}
                  onClick={() => {
                    if (selectedDomain) {
                      resolveNsMutation.mutate({ domainName: selectedDomain.name, target: 'add' });
                    } else {
                      toast.error(t('nsMonitor.selectDomainFirst'));
                    }
                  }}
                >
                  {t('nsMonitor.autoFill')}
                </Button>
              </Space>
            </Form.FormItem>

            <div className="dialog-switch-row">
              <div>
                <strong>{t('nsMonitor.enableMonitoring')}</strong>
                <span>{t('nsMonitor.monitoring')}</span>
              </div>
              <Switch value={addEnabled} onChange={(checked: any) => setAddEnabled(Boolean(checked))} />
            </div>

            <div className="dialog-switch-row">
              <div>
                <strong>{t('nsMonitor.notifyEmail')}</strong>
                <span>{t('nsMonitor.notifications')}</span>
              </div>
              <Switch value={addNotifyEmail} onChange={(checked: any) => setAddNotifyEmail(Boolean(checked))} />
            </div>

            <div className="dialog-switch-row">
              <div>
                <strong>{t('nsMonitor.notifyChannels')}</strong>
                <span>{isAdmin ? t('nsMonitor.notifications') : 'Admin only'}</span>
              </div>
              <Switch
                value={addNotifyChannels}
                disabled={!isAdmin}
                onChange={(checked: any) => setAddNotifyChannels(Boolean(checked))}
              />
            </div>

            <Space className="record-form__actions dialog-form-actions">
              <Button variant="outline" onClick={closeAddModal}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" theme="primary" loading={createMutation.isPending} disabled={domains.length === 0}>
                {t('common.add')}
              </Button>
            </Space>
          </Form>
        </Modal>
      )}

      {deleteConfig && (
        <ConfirmDialog
          message={t('nsMonitor.deleteConfirm', { domain: deleteConfig.domain_name })}
          onConfirm={() => {
            deleteMutation.mutate(deleteConfig.id);
            setDeleteConfig(null);
          }}
          onCancel={() => setDeleteConfig(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
