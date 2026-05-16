import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, DateRangePicker, Empty, Input, Loading, Pagination, Select, Space } from 'tdesign-react';
import type { DateRangeValue } from 'tdesign-react/es/date-picker';
import type { SelectValue } from 'tdesign-react/es/select';
import { FileSearchIcon, SearchIcon } from 'tdesign-icons-react';
import { logsApi } from '../api';
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
  const [domain, setDomain] = useState('');
  const [action, setAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  useRealtimeData({
    queryKey: ['audit-logs'],
    websocketEventTypes: ['audit_log_created'],
    pollingInterval: 60000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, domain, action, startDate, endDate],
    queryFn: () =>
      logsApi.list({
        page,
        pageSize: PAGE_SIZE,
        domain: domain.trim() || undefined,
        action: action || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }).then((r) => r.data.data),
  });

  const total = data?.total ?? 0;
  const logs = data?.list ?? [];

  const clearFilters = () => {
    setDomain('');
    setAction('');
    setStartDate('');
    setEndDate('');
    setPage(1);
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
