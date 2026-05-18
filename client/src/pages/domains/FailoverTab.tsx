import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Descriptions, Empty, Input, Loading, Pagination, Select, Space, Switch } from 'tdesign-react';
import { ActivityIcon, SearchIcon } from 'tdesign-icons-react';
import { domainsApi } from '../../api';
import type { Domain } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeData } from '../../hooks/useRealtimeData';
import { formatDomainName } from '../../utils/domain';
import { toBoolean, toString, toNumber } from '../../utils/typeConverters';

const dialogField = (label: string, control: ReactNode) => (
  <div className="settings-control-field">
    <span>{label}</span>
    {control}
  </div>
);

interface FailoverFormState {
  primaryIp: string;
  backupIps: string[];
  checkMethod: 'http' | 'tcp' | 'ping';
  checkInterval: number;
  checkPort: number;
  checkPath: string;
  autoSwitchBack: boolean;
}

interface FailoverConfigData {
  id?: number;
  primaryIp?: string | null;
  backupIps?: unknown[] | null;
  checkMethod?: string | null;
  checkInterval?: string | number | null;
  checkPort?: string | number | null;
  checkPath?: string | null;
  autoSwitchBack?: boolean | number | string | null;
}

interface FailoverStatusData {
  currentIp?: string;
  lastCheckResult?: boolean;
  lastCheckTime?: string;
  switchCount?: number;
}

interface FailoverResponseData {
  config?: FailoverConfigData | null;
  status?: FailoverStatusData | null;
}

const DEFAULT_FAILOVER_FORM: FailoverFormState = {
  primaryIp: '',
  backupIps: [],
  checkMethod: 'http',
  checkInterval: 300,
  checkPort: 80,
  checkPath: '',
  autoSwitchBack: true,
};

function normalizeFailoverForm(config?: FailoverConfigData | null): FailoverFormState {
  return {
    primaryIp: toString(config?.primaryIp),
    backupIps: Array.isArray(config?.backupIps) ? config!.backupIps.map(String) : [],
    checkMethod: toString(config?.checkMethod, 'http') as 'http' | 'tcp' | 'ping',
    checkInterval: toNumber(config?.checkInterval, 300),
    checkPort: toNumber(config?.checkPort, 80),
    checkPath: toString(config?.checkPath),
    autoSwitchBack: toBoolean(config?.autoSwitchBack),
  };
}

function FailoverConfigModal({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const fieldProps = (field: string) => ({
    name: `failover-${domain.id}-${field}`,
    autocomplete: 'off' as const,
  });

  useRealtimeData({
    queryKey: ['failover', domain.id],
    websocketEventTypes: ['failover_config_created', 'failover_config_updated', 'failover_config_deleted'],
    pollingInterval: 60000,
  });

  const { data, isLoading } = useQuery<FailoverResponseData | null>({
    queryKey: ['failover', domain.id],
    queryFn: () => domainsApi.getFailover(domain.id).then((r) => r.data.data),
  });
  const [formState, setFormState] = useState<FailoverFormState>(DEFAULT_FAILOVER_FORM);
  const [formDirty, setFormDirty] = useState(false);
  const activeConfigIdRef = useRef<number | null>(null);
  const config = data?.config ?? null;
  const backupIpsSnapshot = Array.isArray(config?.backupIps) ? config.backupIps.map(String).join('|') : '';

  useEffect(() => {
    if (!config) {
      if (activeConfigIdRef.current !== null) {
        activeConfigIdRef.current = null;
        setFormState(DEFAULT_FAILOVER_FORM);
        setFormDirty(false);
        return;
      }

      if (!formDirty) {
        setFormState(DEFAULT_FAILOVER_FORM);
      }
      return;
    }

    const next = normalizeFailoverForm(config);
    const currentConfigId = typeof config.id === 'number' ? config.id : null;

    if (activeConfigIdRef.current !== currentConfigId) {
      activeConfigIdRef.current = currentConfigId;
      setFormState(next);
      setFormDirty(false);
      return;
    }

    if (!formDirty) {
      setFormState(next);
    }
  }, [
    config?.id,
    config?.primaryIp,
    backupIpsSnapshot,
    config?.checkMethod,
    config?.checkInterval,
    config?.checkPort,
    config?.checkPath,
    config?.autoSwitchBack,
    formDirty,
  ]);

  const updateField = <K extends keyof FailoverFormState>(field: K, value: FailoverFormState[K]) => {
    setFormState((current) => ({ ...current, [field]: value }));
    setFormDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: (cfg: any) => domainsApi.saveFailover(domain.id, cfg),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['failover', domain.id] });
      toast.success(t('domains.configSaved'));
      onClose();
    },
    onError: () => toast.error(t('domains.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => domainsApi.deleteFailover(domain.id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['failover', domain.id] });
      toast.success(t('domains.configDeleted'));
      onClose();
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      primaryIp: formState.primaryIp || '',
      backupIps: formState.backupIps || [],
      checkMethod: formState.checkMethod || 'http',
      checkInterval: formState.checkInterval || 300,
      checkPort: formState.checkPort || 80,
      checkPath: formState.checkPath || '',
      autoSwitchBack: formState.autoSwitchBack ?? true,
    });
  };

  if (isLoading) return <div className="page-state"><Loading loading text={t('common.loading')} /></div>;

  return (
    <Form layout="vertical" colon={false} requiredMark={false} className="page-shell dialog-form failover-dialog" onSubmit={({ e }: any) => { e?.preventDefault(); handleSave(); }}>
      {dialogField(t('domains.primaryIp'),
        <Input
          {...fieldProps('primary-ip')}
          value={formState.primaryIp || ''}
          onChange={(value: any) => updateField('primaryIp', String(value))}
        />
      )}
      {dialogField(t('domains.backupIps'),
        <Input
          {...fieldProps('backup-ips')}
          value={(formState.backupIps || []).join(',')}
          onChange={(value: any) => updateField('backupIps', String(value).split(',').map((item: string) => item.trim()).filter(Boolean))}
        />
      )}
      <div className="dialog-form-grid">
        {dialogField(t('domains.checkMethod'),
          <Select
            value={formState.checkMethod || 'http'}
            options={[
              { label: 'HTTP', value: 'http' },
              { label: 'TCP', value: 'tcp' },
              { label: 'PING', value: 'ping' },
            ]}
            onChange={(value: any) => updateField('checkMethod', String(Array.isArray(value) ? value[0] : value) as 'http' | 'tcp' | 'ping')}
          />
        )}
        {dialogField(t('domains.checkPort'),
          <Input
            {...fieldProps('check-port')}
            type="number"
            value={String(formState.checkPort || 80)}
            onChange={(value: any) => updateField('checkPort', Number(value) || 0)}
          />
        )}
      </div>
      {(formState.checkMethod === 'http') && (
        dialogField(t('domains.checkPath'),
          <Input
            {...fieldProps('check-path')}
            value={formState.checkPath || ''}
            onChange={(value: any) => updateField('checkPath', String(value))}
            placeholder="/"
          />
        )
      )}
      {dialogField(t('domains.checkInterval'),
        <Input
          {...fieldProps('check-interval')}
          type="number"
          value={String(formState.checkInterval || 300)}
          onChange={(value: any) => updateField('checkInterval', Number(value) || 0)}
        />
      )}
      <div className="dialog-switch-row">
        <div>
          <strong>{t('domains.autoSwitchBack')}</strong>
        </div>
        <Switch value={formState.autoSwitchBack ?? true} onChange={(checked: any) => updateField('autoSwitchBack', Boolean(checked))} />
      </div>

      {data?.status && (
        <div className="dialog-description">
          <Descriptions
            bordered
            column={1}
            items={[
              { label: t('domains.currentIp'), content: data.status.currentIp },
              { label: t('common.status'), content: data.status.lastCheckResult ? t('domains.healthy') : t('domains.unhealthy') },
              { label: t('domains.lastCheck'), content: data.status.lastCheckTime ? new Date(data.status.lastCheckTime).toLocaleString() : '-' },
              { label: t('domains.switchCount'), content: data.status.switchCount },
            ]}
          />
        </div>
      )}

      <Space className="record-form__actions dialog-form-actions">
        {data?.config && (
          <Button theme="danger" variant="outline" icon={<DeleteIcon />} loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
            {t('domains.deleteConfig')}
          </Button>
        )}
        <Button type="submit" theme="primary" loading={saveMutation.isPending}>
          {t('domains.saveConfig')}
        </Button>
      </Space>
    </Form>
  );
}

export function FailoverTab() {
  const { t } = useI18n();
  const { isAdmin: canManage } = useAuth();
  const [configuringFailover, setConfiguringFailover] = useState<Domain | null>(null);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data: domainsData, isLoading } = useQuery<{ list: Domain[]; total: number }>({
    queryKey: ['domains-all'],
    queryFn: () => domainsApi.list({ pageSize: 1000 }).then((r) => r.data.data ?? { list: [], total: 0 }),
  });

  const domains = domainsData?.list ?? [];
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filteredDomains = normalizedKeyword
    ? domains.filter((domain) => (
      domain.name.toLowerCase().includes(normalizedKeyword)
      || String(domain.account_id).includes(normalizedKeyword)
      || (domain.remark ?? '').toLowerCase().includes(normalizedKeyword)
    ))
    : domains;
  const paginatedDomains = filteredDomains.slice((page - 1) * pageSize, page * pageSize);

  const columns = [
    { key: 'name', label: t('domains.domain'), render: (row: Domain) => <span className="page-strong">{formatDomainName(row.name)}</span> },
    { key: 'account_id', label: t('domains.account'), render: (row: Domain) => <span className="page-muted">#{row.account_id}</span> },
    { key: 'remark', label: t('domains.remark'), render: (row: Domain) => <span className="page-muted">{row.remark || t('domains.emptyRemark')}</span> },
    {
      key: 'actions',
      label: t('domains.actions'),
      render: (row: Domain) => (
        <Button
          variant="text"
          theme="primary"
          icon={<ActivityIcon />}
          disabled={!canManage}
          onClick={() => setConfiguringFailover(row)}
        >
          {t('domains.configureFailover')}
        </Button>
      ),
    },
  ];

  return (
    <div className="page-shell">
      <section className="page-heading page-heading--compact">
        <div>
          <h2>{t('domains.tabs.failover')}</h2>
          <p>{t('domains.failoverSubtitle')}</p>
        </div>
      </section>

      <Card bordered={false} shadow={false} className="page-card failover-card">
        <div className="records-toolbar failover-card__toolbar">
          <Input
            clearable
            type="search"
            name="failover-domain-search"
            autocomplete="off"
            value={keyword}
            prefixIcon={<SearchIcon />}
            placeholder={t('domains.searchPlaceholder')}
            onChange={(value: any) => {
              setKeyword(String(value));
              setPage(1);
            }}
          />
          <span className="failover-card__summary">
            {t('common.total')} {filteredDomains.length} {t('common.items')}
          </span>
        </div>
        <Table columns={columns} data={paginatedDomains} loading={isLoading} rowKey={(row) => row.id} emptyText={t('domains.noDomainsFound')} />
        <div className="records-pagination records-pagination--compact">
          <span className="records-pagination__total">
            {t('common.total')} {filteredDomains.length} {t('common.items')}
          </span>
          <Pagination
            size="small"
            current={page}
            pageSize={pageSize}
            total={filteredDomains.length}
            totalContent={false}
            showPageSize={false}
            showJumper={false}
            onCurrentChange={(current: number) => setPage(current)}
          />
        </div>
      </Card>

      {configuringFailover && canManage && (
        <Modal title={t('domains.failoverTitle', { name: configuringFailover.name })} onClose={() => setConfiguringFailover(null)} size="lg">
          <FailoverConfigModal domain={configuringFailover} onClose={() => setConfiguringFailover(null)} />
        </Modal>
      )}
    </div>
  );
}
