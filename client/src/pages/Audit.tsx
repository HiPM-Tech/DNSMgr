import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DateRangePicker, Empty, Input, Loading, Pagination, Select, Space, Table, Tag } from 'tdesign-react';
import type { DateRangeValue } from 'tdesign-react/es/date-picker';
import type { SelectValue } from 'tdesign-react/es/select';
import { FileSearchIcon, SearchIcon } from 'tdesign-icons-react';
import { logsApi, mcpApi } from '../api';
import { AuditLogList } from '../components/AuditLogList';
import { getAuditActionOptions } from '../utils/auditLogs';
import { useI18n } from '../contexts/I18nContext';
import { useRealtimeData } from '../hooks/useRealtimeData';

const PAGE_SIZE = 20;

function selectToString(value: SelectValue) {
  return String(Array.isArray(value) ? value[0] ?? '' : value);
}

export function Audit() {
  const { t } = useI18n();
  const actionOptions = useMemo(() => getAuditActionOptions(t), [t]);
  const [source, setSource] = useState<'system' | 'mcp'>('system');
  const [domain, setDomain] = useState('');
  const [action, setAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  // MCP audit filters
  const [mcpUserId, setMcpUserId] = useState('');
  const [mcpAction, setMcpAction] = useState('');

  useRealtimeData({
    queryKey: ['audit-logs'],
    websocketEventTypes: ['audit_log_created'],
    pollingInterval: 60000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, domain, action, startDate, endDate, source],
    queryFn: async () => {
      if (source === 'mcp') {
        const params: any = { page, pageSize: PAGE_SIZE };
        if (mcpUserId) params.userId = parseInt(mcpUserId);
        if (mcpAction) params.action = mcpAction;
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        const res = await mcpApi.getAuditLogs(params);
        return { total: res.data.data.total, list: res.data.data.logs };
      }
      const res = await logsApi.list({
        page,
        pageSize: PAGE_SIZE,
        domain: domain.trim() || undefined,
        action: action || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      return res.data.data;
    },
  });

  const total = data?.total ?? 0;
  const logs = data?.list ?? [];

  const clearFilters = () => {
    setDomain('');
    setAction('');
    setMcpUserId('');
    setMcpAction('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const handleSourceChange = (value: SelectValue) => {
    setSource(selectToString(value) as 'system' | 'mcp');
    clearFilters();
  };

  const handleDateChange = (value: DateRangeValue) => {
    setStartDate(String(value[0] ?? ''));
    setEndDate(String(value[1] ?? ''));
    setPage(1);
  };

  return (
    <div className="page-shell">
      <Card bordered={false} shadow={false}>
        <section className="page-heading">
          <div>
            <h1>{t('audit.title')}</h1>
            <p>{t('audit.subtitle')}</p>
          </div>
        </section>

        <div className="audit-filter-grid">
          <Select
            value={source}
            options={[
              { label: t('audit.sourceSystem'), value: 'system' },
              { label: t('audit.sourceMcp'), value: 'mcp' },
            ]}
            label={t('audit.source')}
            onChange={handleSourceChange}
            style={{ width: 150 }}
          />
          {source === 'system' ? (
            <Input
              clearable
              type="search"
              name="audit-domain-search"
              autocomplete="off"
              value={domain}
              prefixIcon={<SearchIcon />}
              placeholder={t('audit.domainPlaceholder')}
              label={t('audit.filterDomain')}
              onChange={(value) => {
                setDomain(String(value));
                setPage(1);
              }}
            />
          ) : (
            <Input
              clearable
              value={mcpUserId}
              placeholder={t('mcp.userId')}
              label={t('mcp.userId')}
              onChange={(value) => {
                setMcpUserId(String(value));
                setPage(1);
              }}
            />
          )}
          {source === 'system' ? (
            <Select
              value={action}
              options={[
                { label: t('audit.allActions'), value: '' },
                ...actionOptions.map((item) => ({ label: item.label, value: item.value })),
              ]}
              label={t('audit.actionType')}
              onChange={(value) => {
                setAction(selectToString(value));
                setPage(1);
              }}
            />
          ) : (
            <Input
              clearable
              value={mcpAction}
              placeholder={t('mcp.action')}
              label={t('mcp.action')}
              onChange={(value) => {
                setMcpAction(String(value));
                setPage(1);
              }}
            />
          )}
          <DateRangePicker
            className="audit-date-range"
            clearable
            value={startDate || endDate ? [startDate, endDate] : []}
            valueType="YYYY-MM-DD"
            placeholder={[t('audit.dateRange'), t('audit.dateRange')]}
            onChange={handleDateChange}
            onClear={clearFilters}
          />
          <Button variant="outline" onClick={clearFilters}>
            {t('audit.clearFilters')}
          </Button>
        </div>
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={(
          <Space align="center">
            <FileSearchIcon />
            <span>{t('audit.detailTitle')}</span>
          </Space>
        )}
        actions={<span className="page-muted">{t('audit.totalCount', { total })}</span>}
        className="page-card"
      >
        {isLoading ? (
          <div className="page-state"><Loading loading text={t('common.loading')} /></div>
        ) : source === 'mcp' ? (
          logs.length === 0 ? (
            <Empty description={t('audit.noLogs')} />
          ) : (
            <>
              <Table
                rowKey="id"
                data={logs}
                maxHeight={560}
                scroll={{ type: 'virtual', threshold: 50, rowHeight: 48, bufferSize: 12 }}
                columns={[
                  { colKey: 'id', title: 'ID', width: 80 },
                  { colKey: 'user_id', title: t('mcp.userId'), width: 100 },
                  { colKey: 'auth_type', title: t('mcp.authType'), width: 100 },
                  { colKey: 'module', title: t('mcp.module'), width: 120 },
                  {
                    colKey: 'action',
                    title: t('mcp.action'),
                    width: 200,
                    cell: (row: any) => (
                      <Tag>{row.action}</Tag>
                    ),
                  },
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
                    cell: (row: any) => new Date(row.created_at).toLocaleString(),
                  },
                ]}
              />
              <div className="audit-pagination">
                <Pagination
                  current={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  showPageSize={false}
                  showJumper={false}
                  onCurrentChange={(current) => setPage(current)}
                />
              </div>
            </>
          )
        ) : logs.length === 0 ? (
          <Empty description={t('audit.noLogs')} />
        ) : (
          <>
            <AuditLogList logs={logs} />
            <div className="audit-pagination">
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                showPageSize={false}
                showJumper={false}
                onCurrentChange={(current) => setPage(current)}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
