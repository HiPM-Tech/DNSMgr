import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Pagination, Select, Space, Switch, Tabs, Tag } from 'tdesign-react';
import type { SelectValue } from 'tdesign-react/es/select';
import { AddIcon, ArrowLeftIcon, DeleteIcon, EditIcon, MailIcon, RefreshIcon, SearchIcon } from 'tdesign-icons-react';
import { recordsApi, domainsApi, accountsApi } from '../api';
import type { DnsRecord } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { TunnelList } from '../components/TunnelList';
import { MailSetupModal } from './MailSetupModal';
import { RecordForm, COMMON_RECORD_TYPES, CLOUDFLARE_RECORD_TYPES } from '../components/RecordForm';
import { useRealtimeData } from '../hooks/useRealtimeData';

function selectToString(value: SelectValue) {
  return String(Array.isArray(value) ? value[0] ?? '' : value);
}

function getRecordField(record: DnsRecord | null | undefined, lowerKey: keyof DnsRecord, upperKey: string): unknown {
  if (!record) return undefined;
  const source = record as DnsRecord & Record<string, unknown>;
  return source[lowerKey] ?? source[upperKey];
}

function getRecordId(record: DnsRecord | null | undefined): string {
  return String(getRecordField(record, 'id', 'RecordId') ?? '');
}

function getRecordType(record: DnsRecord | null | undefined): string {
  return String(getRecordField(record, 'type', 'Type') ?? '');
}

function getRecordName(record: DnsRecord | null | undefined): string {
  return String(getRecordField(record, 'name', 'Name') ?? '');
}

function getRecordValue(record: DnsRecord | null | undefined): string {
  return String(getRecordField(record, 'value', 'Value') ?? '');
}

function getRecordLine(record: DnsRecord | null | undefined): string {
  return String(getRecordField(record, 'line', 'Line') ?? '');
}

function getRecordNumber(record: DnsRecord | null | undefined, lowerKey: keyof DnsRecord, upperKey: string): number | undefined {
  const value = getRecordField(record, lowerKey, upperKey);
  if (value === null || value === undefined || value === '') return undefined;
  const next = Number(value);
  return Number.isFinite(next) ? next : undefined;
}

export function Records() {
  const { id } = useParams<{ id: string }>();
  const domainId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const formatApiError = (msg?: string) => {
    if (!msg) return t('common.error');
    if (msg === 'Permission denied') return t('common.permissionDenied');
    if (msg === 'Permission denied for subdomain') return t('common.permissionDeniedSubdomain');
    return msg;
  };

  const [showAdd, setShowAdd] = useState(false);
  const [showMailSetup, setShowMailSetup] = useState(false);
  const [editing, setEditing] = useState<DnsRecord | null>(null);
  const [deleting, setDeleting] = useState<DnsRecord | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [activeTab, setActiveTab] = useState<'records' | 'tunnels'>('records');
  const [showTunnels] = useLocalStorage('showTunnels', false);
  
  // 分页状态
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: domain } = useQuery({
    queryKey: ['domain', domainId],
    queryFn: () => domainsApi.get(domainId).then((r) => r.data.data),
  });

  const { data: account } = useQuery({
    queryKey: ['account-for-domain', domain?.account_id],
    enabled: Boolean(domain?.account_id),
    queryFn: () => accountsApi.get(domain!.account_id).then((r) => r.data.data),
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: () => accountsApi.providers().then((r) => r.data.data),
  });

  const currentProvider = useMemo(() => {
    if (!account) return undefined;
    return providers.find(p => p.type === account.type);
  }, [account, providers]);

  // 实时数据：DNS记录变更
  useRealtimeData({
    queryKey: ['records', domainId],
    websocketEventTypes: ['record_created', 'record_updated', 'record_deleted', 'record_status_changed'],
    pollingInterval: 30000, // 30秒（记录变化更频繁）
  });

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ['records', domainId, typeFilter, keyword, page, pageSize],
    queryFn: () => recordsApi.list(domainId, {
      type: typeFilter || undefined,
      keyword: keyword || undefined,
      page,
      pageSize,
    }).then((r) => r.data.data ?? { total: 0, list: [] }),
  });
  
  const records = recordsData?.list ?? [];
  const total = recordsData?.total ?? 0;
  const editingRecordId = getRecordId(editing);
  const { data: editingRecordDetail, isFetching: isFetchingEditingRecord } = useQuery({
    queryKey: ['record-detail', domainId, editingRecordId],
    enabled: Boolean(editingRecordId),
    retry: false,
    queryFn: () => recordsApi.get(domainId, editingRecordId!).then((r) => r.data.data),
  });
  const currentEditingRecord = useMemo(
    () => (editing ? editingRecordDetail ?? records.find((record) => getRecordId(record) === editingRecordId) ?? editing : null),
    [editing, editingRecordDetail, records, editingRecordId],
  );
  const providerRecordTypes = useMemo(() => {
    const base = account?.type === 'cloudflare' ? [...CLOUDFLARE_RECORD_TYPES] : [...COMMON_RECORD_TYPES];
    const currentType = getRecordType(currentEditingRecord);
    if (currentType && !base.includes(currentType)) base.push(currentType);
    return base;
  }, [account?.type, currentEditingRecord]);

  useEffect(() => {
    if (typeFilter && !providerRecordTypes.includes(typeFilter)) {
      setTypeFilter('');
    }
  }, [providerRecordTypes, typeFilter]);
  
  const { data: lines = [] } = useQuery({
    queryKey: ['lines', domainId],
    queryFn: () => domainsApi.lines(domainId).then((r) => r.data.data ?? []),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<DnsRecord>) => recordsApi.create(domainId, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(formatApiError(res.data.msg)); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setShowAdd(false);
      toast.success(t('records.addSuccess'));
    },
    onError: () => toast.error(t('records.addFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: Partial<DnsRecord> }) =>
      recordsApi.update(domainId, recordId, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(formatApiError(res.data.msg)); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setEditing(null);
      toast.success(t('records.updateSuccess'));
    },
    onError: () => toast.error(t('records.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => recordsApi.delete(domainId, recordId),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(formatApiError(res.data.msg)); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setDeleting(null);
      toast.success(t('records.deleteSuccess'));
    },
    onError: () => toast.error(t('records.deleteFailed')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ recordId, status }: { recordId: string; status: number }) =>
      recordsApi.setStatus(domainId, recordId, status),
    onSuccess: (res, { recordId }) => {
      if (res.data.code !== 0) { toast.error(formatApiError(res.data.msg)); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      toast.success(t('records.toggled', { status: getRecordNumber(records.find((r) => getRecordId(r) === recordId), 'status', 'Status') === 1 ? t('common.disabled') : t('common.enabled') }));
    },
    onError: () => toast.error(t('records.toggleFailed')),
  });

  const lineMap = Object.fromEntries(lines.map((l) => [l.id, l.name]));

  const isCloudflare = account?.type === 'cloudflare';
  const isAliyunESA = account?.type === 'aliyunesa';
  // Providers with proxy mode (similar to Cloudflare)
  const hasProxyMode = isCloudflare || isAliyunESA;
  

  const columns = [
    { key: 'name', label: t('common.host'), render: (r: DnsRecord) => <span className="record-mono record-mono--strong">{getRecordName(r)}</span> },
    { key: 'type', label: t('common.type'), render: (r: DnsRecord) => <Tag theme="primary" variant="light">{getRecordType(r)}</Tag> },
    {
      key: 'value', label: t('common.value'),
      render: (r: DnsRecord) => (
        <Space size="small">
          <span className="record-mono record-mono--value" title={getRecordValue(r)}>{getRecordValue(r)}</span>
          {getRecordType(r) === 'MX' && getRecordNumber(r, 'mx', 'MX') !== undefined && (
            <Tag theme="warning" variant="light" title={t('records.mxPriority')}>{getRecordNumber(r, 'mx', 'MX')}</Tag>
          )}
        </Space>
      ),
    },
    {
      key: 'line', label: hasProxyMode ? t('records.proxy') : t('common.line'),
      render: (r: DnsRecord) => {
        // Cloudflare & Aliyun ESA: 显示代理状态（是/否）
        if (hasProxyMode) {
          const proxied = getRecordLine(r) === '1';
          return <Tag theme={proxied ? 'warning' : 'default'} variant="light">{proxied ? t('records.proxied') : t('records.dnsOnly')}</Tag>;
        }
        // 其他提供商: 显示线路
        const effectiveLine = getRecordLine(r);
        
        // 当线路为 '0'、'default' 或空时，显示为"默认"
        if (!effectiveLine || effectiveLine === '0' || effectiveLine === 'default') {
          return <Tag theme="default" variant="light">{t('records.defaultLine') || '默认'}</Tag>;
        }
        
        // 显示具体线路名称
        const lineName = lineMap[effectiveLine];
        return <Tag theme="primary" variant="light">{lineName ?? effectiveLine}</Tag>;
      },
    },
    { key: 'ttl', label: t('common.ttl'), render: (r: DnsRecord) => <span className="page-muted">{getRecordNumber(r, 'ttl', 'TTL') ?? '-'}</span> },
    {
      key: 'status', label: t('common.status'),
      render: (r: DnsRecord) => {
        const enabled = getRecordNumber(r, 'status', 'Status') === 1;
        return (
          <Tag theme={enabled ? 'success' : 'danger'} variant="light">
            {enabled ? t('common.enabled') : t('common.disabled')}
          </Tag>
        );
      },
    },
    {
      key: 'actions', label: t('common.actions'),
      render: (r: DnsRecord) => {
        const recordId = getRecordId(r);
        return (
          <Space size="small">
            <Switch
              size="small"
              value={getRecordNumber(r, 'status', 'Status') === 1}
              onChange={(checked) => statusMutation.mutate({ recordId, status: checked ? 1 : 0 })}
            />
            <Button shape="square" variant="text" icon={<EditIcon />} onClick={() => setEditing(r)} />
            <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => setDeleting(r)} />
          </Space>
        );
      },
    },
  ];

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div className="page-actions">
          <Button shape="square" variant="text" icon={<ArrowLeftIcon />} onClick={() => navigate('/domains')} />
          <div>
            <h1>{domain?.name ?? t('records.title')}</h1>
            <p>{t('records.subtitle')}</p>
          </div>
        </div>
        {activeTab === 'records' && (
          <Space>
            <Button variant="outline" icon={<RefreshIcon />} onClick={() => qc.invalidateQueries({ queryKey: ['records', domainId] })}>
              {t('records.refresh')}
            </Button>
            <Button theme="primary" icon={<AddIcon />} onClick={() => setShowAdd(true)}>
              {t('records.addRecord')}
            </Button>
            <Button variant="outline" icon={<MailIcon />} onClick={() => setShowMailSetup(true)}>
              {t('mail.title')}
            </Button>
          </Space>
        )}
      </section>

      {showTunnels && currentProvider?.type === 'cloudflare' && (
        <Tabs
          className="page-tabs"
          theme="card"
          value={activeTab}
          list={[
            { value: 'records', label: t('records.dnsRecords') },
            { value: 'tunnels', label: t('records.tunnels') },
          ]}
          onChange={(value) => setActiveTab(value as 'records' | 'tunnels')}
        />
      )}

      {activeTab === 'records' && (
        <>
          <Card bordered={false} shadow={false}>
            <div className="records-toolbar">
              <Input
                clearable
                type="search"
                name="records-search"
                autocomplete="off"
                value={keyword}
                prefixIcon={<SearchIcon />}
                placeholder={t('common.searchRecords')}
                onChange={(value) => {
                  setKeyword(String(value));
                  setPage(1);
                }}
              />
              <Select
                value={typeFilter}
                options={[
                  { label: t('records.allTypes'), value: '' },
                  ...providerRecordTypes.map((type) => ({ label: type, value: type })),
                ]}
                onChange={(value) => {
                  setTypeFilter(selectToString(value));
                  setPage(1);
                }}
              />
            </div>
          </Card>

          <Card bordered={false} shadow={false} className="page-card">
            <Table columns={columns} data={records} loading={isLoading} rowKey={(r) => getRecordId(r)} emptyText={t('records.noRecords')} />
            <div className="records-pagination">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={total}
                pageSizeOptions={[10, 20, 50, 100]}
                onCurrentChange={(current) => setPage(current)}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                }}
              />
            </div>
          </Card>
        </>
      )}

      {activeTab === 'tunnels' && (
        <TunnelList accountId={domain?.account_id} />
      )}

      {showAdd && (
        <Modal title={t('records.addRecordFor', { name: domain?.name ?? '' })} onClose={() => setShowAdd(false)} size="lg">
          <RecordForm domainId={domainId} lines={lines} recordTypes={providerRecordTypes} provider={currentProvider} existingRecords={records} onSubmit={(data) => createMutation.mutate(data)} isLoading={createMutation.isPending} />
        </Modal>
      )}

      {showMailSetup && (
        <MailSetupModal domainId={domainId} domainName={domain?.name ?? ''} onClose={() => setShowMailSetup(false)} existingRecords={records} />
      )}

      {editing && (
        <Modal title={t('records.editRecord')} onClose={() => setEditing(null)} size="lg">
          <RecordForm domainId={domainId} lines={lines} recordTypes={providerRecordTypes} provider={currentProvider} existingRecords={records} initial={currentEditingRecord ?? editing}
            onSubmit={(data) => updateMutation.mutate({ recordId: getRecordId(currentEditingRecord) || getRecordId(editing), data })}
            isLoading={updateMutation.isPending || isFetchingEditingRecord} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={t('records.deleteConfirm', { name: getRecordName(deleting), type: getRecordType(deleting), value: getRecordValue(deleting) })}
          onConfirm={() => deleteMutation.mutate(getRecordId(deleting))}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
