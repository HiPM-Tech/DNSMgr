import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Descriptions, Form, Input, Loading, Pagination, Select, Space, Switch } from 'tdesign-react';
import { ActivityIcon, DeleteIcon, SearchIcon } from 'tdesign-icons-react';
import { domainsApi } from '../../api';
import type { Domain } from '../../api';
import { Table } from '../../components/Table';
import { Modal } from '../../components/Modal';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtimeData } from '../../hooks/useRealtimeData';

function FailoverConfigModal({ domain, onClose }: { domain: Domain; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();

  useRealtimeData({
    queryKey: ['failover', domain.id],
    websocketEventTypes: ['failover_config_created', 'failover_config_updated', 'failover_config_deleted'],
    pollingInterval: 60000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['failover', domain.id],
    queryFn: () => domainsApi.getFailover(domain.id).then((r) => r.data.data),
  });

  const [primaryIp, setPrimaryIp] = useState('');
  const [backupIps, setBackupIps] = useState<string[]>([]);
  const [checkMethod, setCheckMethod] = useState<'http' | 'tcp' | 'ping'>('http');
  const [checkInterval, setCheckInterval] = useState(300);
  const [checkPort, setCheckPort] = useState(80);
  const [checkPath, setCheckPath] = useState('');
  const [autoSwitchBack, setAutoSwitchBack] = useState(true);

  useEffect(() => {
    if (data?.config) {
      setPrimaryIp(String(data.config.primaryIp ?? ''));
      setBackupIps(Array.isArray(data.config.backupIps) ? data.config.backupIps.map(String) : []);
      setCheckMethod(String(data.config.checkMethod ?? 'http') as 'http' | 'tcp' | 'ping');
      setCheckInterval(Number(data.config.checkInterval ?? 300));
      setCheckPort(Number(data.config.checkPort ?? 80));
      setCheckPath(String(data.config.checkPath ?? ''));
      setAutoSwitchBack(Boolean(data.config.autoSwitchBack));
    }
  }, [data]);

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
    saveMutation.mutate({ primaryIp, backupIps, checkMethod, checkInterval, checkPort, checkPath, autoSwitchBack });
  };

  if (isLoading) return <div className="page-state"><Loading loading text={t('common.loading')} /></div>;

  return (
    <Form layout="vertical" colon={false} requiredMark={false} className="page-shell dialog-form failover-dialog" onSubmit={({ e }: any) => { e?.preventDefault(); handleSave(); }}>
      <Form.FormItem label={t('domains.primaryIp')}>
        <Input value={primaryIp} onChange={(value: any) => setPrimaryIp(String(value))} />
      </Form.FormItem>
      <Form.FormItem label={t('domains.backupIps')}>
        <Input value={backupIps.join(',')} onChange={(value: any) => setBackupIps(String(value).split(',').map((item) => item.trim()).filter(Boolean))} />
      </Form.FormItem>
      <div className="dialog-form-grid">
        <Form.FormItem label={t('domains.checkMethod')}>
          <Select
            value={checkMethod}
            options={[
              { label: 'HTTP', value: 'http' },
              { label: 'TCP', value: 'tcp' },
              { label: 'PING', value: 'ping' },
            ]}
            onChange={(value: any) => setCheckMethod(String(Array.isArray(value) ? value[0] : value) as 'http' | 'tcp' | 'ping')}
          />
        </Form.FormItem>
        <Form.FormItem label={t('domains.checkPort')}>
          <Input type="number" value={String(checkPort)} onChange={(value: any) => setCheckPort(Number(value) || 0)} />
        </Form.FormItem>
      </div>
      {checkMethod === 'http' && (
        <Form.FormItem label={t('domains.checkPath')}>
          <Input value={checkPath} onChange={(value: any) => setCheckPath(String(value))} placeholder="/" />
        </Form.FormItem>
      )}
      <Form.FormItem label={t('domains.checkInterval')}>
        <Input type="number" value={String(checkInterval)} onChange={(value: any) => setCheckInterval(Number(value) || 0)} />
      </Form.FormItem>
      <div className="dialog-switch-row">
        <div>
          <strong>{t('domains.autoSwitchBack')}</strong>
        </div>
        <Switch value={autoSwitchBack} onChange={(checked: any) => setAutoSwitchBack(Boolean(checked))} />
      </div>

      {data?.status && (
        <div className="dialog-description">
          <Descriptions
            bordered
            column={1}
            items={[
              { label: t('domains.currentIp'), content: data.status.currentIp },
              { label: t('common.status'), content: data.status.lastCheckStatus ? t('domains.healthy') : t('domains.unhealthy') },
              { label: t('domains.lastCheck'), content: new Date(data.status.lastCheckAt).toLocaleString() },
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
    { key: 'name', label: t('domains.domain'), render: (row: Domain) => <span className="page-strong">{row.name}</span> },
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
