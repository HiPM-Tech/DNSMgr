import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search } from 'lucide-react';
import { logsApi } from '../api';
import { AuditLogList } from '../components/AuditLogList';
import { getAuditActionOptions } from '../utils/auditLogs';
import { useI18n } from '../contexts/I18nContext';

const PAGE_SIZE = 20;

export function Audit() {
  const { t } = useI18n();
  const actionOptions = useMemo(() => getAuditActionOptions(t), [t]);
  const [domain, setDomain] = useState('');
  const [action, setAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

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
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{t('audit.title')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('audit.subtitle')}</p>
        </div>

        <div className="grid w-full gap-4 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('audit.filterDomain')}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={domain}
                onChange={(e) => {
                  setDomain(e.target.value);
                  setPage(1);
                }}
                placeholder={t('audit.domainPlaceholder')}
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('audit.actionType')}</label>
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
            >
              <option value="">{t('audit.allActions')}</option>
              {actionOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('audit.dateRange')}</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
              />
              <span className="text-sm text-gray-400">{t('audit.to')}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setDomain('');
                setAction('');
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t('audit.clearFilters')}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-400" />
            <h3 className="font-semibold text-gray-900">{t('audit.detailTitle')}</h3>
          </div>
          <span className="text-sm text-gray-500">{t('audit.totalCount', { total })}</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : logs.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">{t('audit.noLogs')}</p>
        ) : (
          <>
            <AuditLogList logs={logs} />
            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
              <span className="text-sm text-gray-500">
                {t('audit.pageInfo', { page, totalPages })}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('audit.prevPage')}
                </button>
                <button
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('audit.nextPage')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
