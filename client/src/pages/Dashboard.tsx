import type { CSSProperties, ReactNode } from 'react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Empty, List, Loading, Progress, Row, Statistic, Table, Tag } from 'tdesign-react';
import type { TagProps } from 'tdesign-react';
import type { PrimaryTableCol } from 'tdesign-react/es/table';
import {
  ActivityIcon,
  ChevronRightIcon,
  InternetIcon,
  ServerIcon,
  UsergroupIcon,
} from 'tdesign-icons-react';
import { accountsApi, domainsApi, usersApi, logsApi } from '../api';
import type { Domain, LogEntry } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { getAuditActionLabel, getAuditActionVariant, getAuditSummary } from '../utils/auditLogs';
import { formatDomainName } from '../utils/domain';
import './Dashboard.css';

type StatTone = 'domains' | 'records' | 'accounts' | 'users';

interface BoardCardProps {
  icon: ReactNode;
  label: string;
  value: number;
  desc: string;
  meta: string;
  tone: StatTone;
  loading?: boolean;
  featured?: boolean;
}

interface DomainTableRow {
  id: number;
  rank: number;
  name: string;
  recordCount: number;
  percentage: number;
  createdAt: string;
}

interface ProviderRow {
  name: string;
  count: number;
  percentage: number;
}

interface ActivityMixRow {
  label: string;
  count: number;
  percentage: number;
  theme: TagProps['theme'];
}

const auditTagTheme: Record<ReturnType<typeof getAuditActionVariant>, TagProps['theme']> = {
  blue: 'primary',
  gray: 'default',
  green: 'success',
  red: 'danger',
  yellow: 'warning',
};

const accountRealtimeEvents = ['account_created', 'account_updated', 'account_deleted'];
const domainRealtimeEvents = ['domain_created', 'domain_updated', 'domain_deleted'];
const userRealtimeEvents = ['user_created', 'user_updated', 'user_deleted'];
const logRealtimeEvents = ['audit_log_created'];

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function formatLogTime(value: string) {
  if (!value) return '';

  return new Date(value).toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(value: string) {
  if (!value) return '-';

  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function BoardCard({ icon, label, value, desc, meta, tone, loading = false, featured = false }: BoardCardProps) {
  return (
    <Card
      bordered={false}
      shadow={false}
      className={`dashboard-board dashboard-board--${tone} ${featured ? 'dashboard-board--featured' : ''}`}
      bodyClassName="dashboard-board__body"
    >
      <span className="dashboard-board__title">{label}</span>
      <div className="dashboard-board__main">
        <Statistic
          className="dashboard-board__stat"
          value={value}
          loading={loading}
          separator=","
          animation={{ duration: 360, valueFrom: 0 }}
          animationStart={!loading}
        />
        <span className="dashboard-board__icon">{icon}</span>
      </div>
      <div className="dashboard-board__footer">
        <span>{desc}</span>
        <span className="dashboard-board__meta">{meta}</span>
      </div>
    </Card>
  );
}

function MeterRow({ label, value, percentage, color }: { label: string; value: string; percentage: number; color?: string }) {
  return (
    <div className="dashboard-meter">
      <div className="dashboard-meter__head">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Progress percentage={percentage} label={false} color={color} trackColor="var(--td-bg-color-component)" />
    </div>
  );
}

function CoverageRing({ percentage }: { percentage: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));

  return (
    <div
      className="dashboard-coverage-ring"
      style={{ '--dashboard-coverage': `${clamped * 3.6}deg` } as CSSProperties}
      aria-label={`${clamped}%`}
    >
      <strong className="dashboard-coverage-ring__value">{clamped}%</strong>
    </div>
  );
}

function ActivityLogItem({ log, t }: { log: LogEntry; t: (key: string, params?: Record<string, string | number>) => string }) {
  const operator = log.nickname || log.username || t('common.unknown');
  const variant = getAuditActionVariant(log);

  return (
    <List.ListItem
      action={<span className="dashboard-activity__time">{formatLogTime(log.created_at)}</span>}
      className="dashboard-activity"
    >
      <List.ListItemMeta
        title={(
          <div className="dashboard-activity__title">
            <Tag theme={auditTagTheme[variant]} variant="light" size="small">
              {getAuditActionLabel(log, t)}
            </Tag>
            <span>{operator}</span>
          </div>
        )}
        description={(
          <div className="dashboard-activity__desc">
            <span>{getAuditSummary(log, t)}</span>
            {log.domain && <Tag theme="default" variant="light" size="small">{log.domain}</Tag>}
          </div>
        )}
      />
    </List.ListItem>
  );
}

export function Dashboard() {
  const { isAdmin, user } = useAuth();
  const { t } = useI18n();
  const displayName = user?.nickname?.trim() || user?.username?.trim() || t('common.unknown');

  useRealtimeData({
    queryKey: ['accounts'],
    websocketEventTypes: accountRealtimeEvents,
    pollingInterval: 120000,
  });

  useRealtimeData({
    queryKey: ['domains-dashboard'],
    websocketEventTypes: domainRealtimeEvents,
    pollingInterval: 60000,
  });

  useRealtimeData({
    queryKey: ['users'],
    websocketEventTypes: userRealtimeEvents,
    pollingInterval: 120000,
    enabled: isAdmin,
  });

  useRealtimeData({
    queryKey: ['logs'],
    websocketEventTypes: logRealtimeEvents,
    pollingInterval: 60000,
    enabled: isAdmin,
  });

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => accountsApi.list().then((r) => r.data.data ?? []),
  });

  const { data: domainsData, isLoading: domainsLoading } = useQuery<{ list: Domain[]; total: number; page: number; pageSize: number; totalPages: number }>({
    queryKey: ['domains-dashboard'],
    queryFn: () => domainsApi.list({ pageSize: 100000 }).then((r) => r.data.data ?? { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data.data ?? []),
    enabled: isAdmin,
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: async () => {
      // 计算24小时前的时间
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const res = await logsApi.list({ pageSize: 50 });
      const allLogs = res.data.data?.list ?? [];
      
      // 过滤出24小时内的日志
      return allLogs.filter((log) => new Date(log.created_at) >= new Date(twentyFourHoursAgo));
    },
  });

  const domains = domainsData?.list ?? [];
  const totalDomainsCount = domainsData?.total ?? 0;
  const totalRecords = domains.reduce((sum, domain) => sum + (domain.record_count ?? 0), 0);
  const accountCount = accounts?.length ?? 0;
  const activeUsers = users?.filter((user) => user.status !== 0).length ?? 0;
  const domainsWithRecords = domains.filter((domain) => (domain.record_count ?? 0) > 0).length;
  const accountsWithDomains = new Set(domains.map((domain) => domain.account_id)).size;
  const recordCoverage = domains.length ? Math.round((domainsWithRecords / domains.length) * 100) : 0;
  const accountCoverage = accountCount ? Math.round((accountsWithDomains / accountCount) * 100) : 0;
  const userCoverage = users?.length ? Math.round((activeUsers / users.length) * 100) : 0;
  const recordsPerDomain = totalDomainsCount ? totalRecords / totalDomainsCount : 0;
  const domainsPerAccount = accountCount ? totalDomainsCount / accountCount : 0;

  const topDomainRows = useMemo<DomainTableRow[]>(() => {
    const sorted = [...domains].sort((a, b) => (b.record_count ?? 0) - (a.record_count ?? 0)).slice(0, 6);
    const maxRecordCount = Math.max(...sorted.map((domain) => domain.record_count ?? 0), 1);

    return sorted.map((domain, index) => ({
      id: domain.id,
      rank: index + 1,
      name: domain.name,
      recordCount: domain.record_count ?? 0,
      percentage: Math.round(((domain.record_count ?? 0) / maxRecordCount) * 100),
      createdAt: domain.created_at,
    }));
  }, [domains]);

  const providerRows = useMemo<ProviderRow[]>(() => {
    const providerMap = new Map<string, number>();
    accounts?.forEach((account) => {
      providerMap.set(account.type, (providerMap.get(account.type) ?? 0) + 1);
    });

    const maxCount = Math.max(...providerMap.values(), 1);
    return [...providerMap.entries()]
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / maxCount) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  }, [accounts]);

  const activityMixRows = useMemo<ActivityMixRow[]>(() => {
    const actionMap = new Map<string, { count: number; theme: TagProps['theme'] }>();
    logs?.forEach((log) => {
      const label = getAuditActionLabel(log, t);
      const current = actionMap.get(label);
      actionMap.set(label, {
        count: (current?.count ?? 0) + 1,
        theme: current?.theme ?? auditTagTheme[getAuditActionVariant(log)],
      });
    });

    const maxCount = Math.max(...[...actionMap.values()].map((item) => item.count), 1);
    return [...actionMap.entries()]
      .map(([label, item]) => ({
        label,
        count: item.count,
        theme: item.theme,
        percentage: Math.round((item.count / maxCount) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [logs, t]);

  const stats = useMemo<BoardCardProps[]>(() => {
    const baseStats: BoardCardProps[] = [
      {
        icon: <InternetIcon size={24} />,
        label: t('dashboard.totalDomains'),
        value: totalDomainsCount,
        desc: t('dashboard.metricDomainsDesc'),
        meta: `${recordCoverage}% ${t('dashboard.recordedDomains')}`,
        tone: 'domains',
        loading: domainsLoading,
        featured: true,
      },
      {
        icon: <ActivityIcon size={24} />,
        label: t('dashboard.totalRecords'),
        value: totalRecords,
        desc: t('dashboard.metricRecordsDesc'),
        meta: `${formatCompactNumber(recordsPerDomain)} / ${t('common.domains')}`,
        tone: 'records',
        loading: domainsLoading,
      },
      {
        icon: <ServerIcon size={24} />,
        label: t('dashboard.dnsAccounts'),
        value: accountCount,
        desc: t('dashboard.metricAccountsDesc'),
        meta: `${providerRows.length} ${t('common.provider')}`,
        tone: 'accounts',
        loading: accountsLoading,
      },
    ];

    if (isAdmin) {
      baseStats.push({
        icon: <UsergroupIcon size={24} />,
        label: t('dashboard.activeUsers'),
        value: activeUsers,
        desc: t('dashboard.metricUsersDesc'),
        meta: `${userCoverage}% ${t('common.enabled')}`,
        tone: 'users',
        loading: usersLoading,
      });
    }

    return baseStats;
  }, [
    accountCount,
    accountsLoading,
    activeUsers,
    domainsLoading,
    isAdmin,
    providerRows.length,
    recordCoverage,
    recordsPerDomain,
    t,
    totalDomainsCount,
    totalRecords,
    userCoverage,
    usersLoading,
  ]);

  const domainColumns = useMemo<PrimaryTableCol<DomainTableRow>[]>(() => [
    {
      colKey: 'rank',
      title: '#',
      width: 72,
      align: 'center',
      cell: ({ row }) => <span className={`dashboard-rank ${row.rank <= 3 ? 'dashboard-rank--top' : ''}`}>{row.rank}</span>,
    },
    {
      colKey: 'name',
      title: t('common.domains'),
      ellipsis: true,
      cell: ({ row }) => (
        <div className="dashboard-domain-name">
          <span>{formatDomainName(row.name)}</span>
          <small>{formatDate(row.createdAt)}</small>
        </div>
      ),
    },
    {
      colKey: 'recordCount',
      title: t('common.records'),
      width: 110,
      align: 'right',
      cell: ({ row }) => <strong className="dashboard-record-count">{row.recordCount}</strong>,
    },
    {
      colKey: 'percentage',
      title: t('dashboard.recordShare'),
      width: 180,
      cell: ({ row }) => (
        <Progress
          percentage={row.percentage}
          label={`${row.percentage}%`}
          color="var(--td-brand-color)"
          trackColor="var(--td-bg-color-component)"
        />
      ),
    },
  ], [t]);

  return (
    <div className="dashboard-page">
      <section className="dashboard-heading dashboard-heading--welcome">
        <div>
          <h1>{displayName}，欢迎来到HiDNS控制台</h1>
        </div>
      </section>

      <div className={`dashboard-stat-grid dashboard-stat-grid--${stats.length}`}>
        {stats.map((stat) => (
          <BoardCard key={stat.tone} {...stat} />
        ))}
      </div>

      <Row gutter={[16, 16]} className="dashboard-section-row">
        <Col xs={12} xl={8}>
          <Card
            bordered={false}
            shadow={false}
            title={t('dashboard.resourceOverview')}
            subtitle={t('dashboard.resourceOverviewDesc')}
            className="dashboard-panel"
          >
            <div className="dashboard-resource">
              <div className="dashboard-resource__score">
                <CoverageRing percentage={recordCoverage} />
                <div>
                  <strong>{t('dashboard.recordedDomains')}</strong>
                  <span>{domainsWithRecords}/{domains.length || 0}</span>
                </div>
              </div>
              <div className="dashboard-resource__meters">
                <MeterRow
                  label={t('dashboard.accountCoverage')}
                  value={`${accountsWithDomains}/${accountCount || 0}`}
                  percentage={accountCoverage}
                />
                <MeterRow
                  label={t('dashboard.recordsPerDomain')}
                  value={formatCompactNumber(recordsPerDomain)}
                  percentage={Math.min(Math.round(recordsPerDomain * 10), 100)}
                  color="var(--td-success-color)"
                />
                <MeterRow
                  label={t('dashboard.domainsPerAccount')}
                  value={formatCompactNumber(domainsPerAccount)}
                  percentage={Math.min(Math.round(domainsPerAccount * 10), 100)}
                  color="var(--td-warning-color)"
                />
                {isAdmin && (
                  <MeterRow
                    label={t('dashboard.activeUserRatio')}
                    value={`${activeUsers}/${users?.length ?? 0}`}
                    percentage={userCoverage}
                    color="var(--td-brand-color-7)"
                  />
                )}
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={12} xl={4}>
          <Card
            bordered={false}
            shadow={false}
            title={t('dashboard.providerDistribution')}
            subtitle={t('dashboard.providerDistributionDesc')}
            className="dashboard-panel dashboard-provider-panel"
          >
            {accountsLoading ? (
              <div className="dashboard-card-state"><Loading loading size="medium" text={t('common.loading')} /></div>
            ) : providerRows.length === 0 ? (
              <Empty description={t('dashboard.noProviders')} />
            ) : (
              <div className="dashboard-provider-list">
                {providerRows.map((provider) => (
                  <div className="dashboard-provider" key={provider.name}>
                    <div className="dashboard-provider__head">
                      <Tag theme="default" variant="light">{t(provider.name)}</Tag>
                      <span>{provider.count}</span>
                    </div>
                    <Progress
                      percentage={provider.percentage}
                      label={false}
                      color="var(--td-brand-color)"
                      trackColor="var(--td-bg-color-component)"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="dashboard-section-row">
        <Col xs={12} xl={7}>
          <Card
            bordered={false}
            shadow={false}
            title={t('dashboard.topDomains')}
            subtitle={t('dashboard.topDomainsDesc')}
            className="dashboard-panel dashboard-table-panel"
            actions={<Tag theme="default" variant="light">{t('dashboard.rankByRecords')}</Tag>}
          >
            <Table
              rowKey="id"
              data={topDomainRows}
              columns={domainColumns}
              loading={domainsLoading}
              hover
              size="medium"
              empty={<Empty description={t('dashboard.noDomains')} />}
            />
          </Card>
        </Col>

        <Col xs={12} xl={5}>
          <Card
            bordered={false}
            shadow={false}
            title={t('dashboard.recentOperations')}
            subtitle={t('dashboard.recentOperationsDesc')}
            className="dashboard-panel dashboard-activity-panel"
            actions={<ChevronRightIcon className="dashboard-panel__action-icon" />}
          >
            {logsLoading ? (
              <div className="dashboard-card-state"><Loading loading size="medium" text={t('common.loading')} /></div>
            ) : !logs || logs.length === 0 ? (
              <Empty description={t('dashboard.noRecentActivity')} />
            ) : (
              <List split size="large" className="dashboard-activity-list">
                {logs.slice(0, 15).map((log) => (
                  <ActivityLogItem key={log.id} log={log} t={t} />
                ))}
              </List>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="dashboard-section-row">
        <Col xs={12}>
          <Card
            bordered={false}
            shadow={false}
            title={t('dashboard.activityMix')}
            subtitle={t('dashboard.activityMixDesc')}
            className="dashboard-panel"
          >
            {logsLoading ? (
              <div className="dashboard-card-state"><Loading loading size="medium" text={t('common.loading')} /></div>
            ) : activityMixRows.length === 0 ? (
              <Empty description={t('dashboard.noRecentActivity')} />
            ) : (
              <div className="dashboard-action-mix">
                {activityMixRows.map((item) => (
                  <div className="dashboard-action-mix__item" key={item.label}>
                    <div className="dashboard-action-mix__head">
                      <Tag theme={item.theme} variant="light">{item.label}</Tag>
                      <strong>{item.count}</strong>
                    </div>
                    <Progress
                      percentage={item.percentage}
                      label={false}
                      color="var(--td-brand-color)"
                      trackColor="var(--td-bg-color-component)"
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
