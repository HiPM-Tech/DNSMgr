import type { LogEntry } from '../api';
import { Badge } from './Badge';
import { useI18n } from '../contexts/I18nContext';
import {
  getAuditActionLabel,
  getAuditActionVariant,
  getAuditFields,
  getAuditSummary,
} from '../utils/auditLogs';

interface AuditLogListProps {
  logs: LogEntry[];
  compact?: boolean;
}

export function AuditLogList({ logs, compact = false }: AuditLogListProps) {
  const { t } = useI18n();

  return (
    <div className="divide-y divide-gray-100">
      {logs.map((log) => {
        const displayName = log.nickname || log.username;
        const fields = getAuditFields(log, t);

        if (compact) {
          return (
            <div key={log.id} className="px-6 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex flex-wrap items-center gap-2">
                  <Badge variant={getAuditActionVariant(log)}>{getAuditActionLabel(log, t)}</Badge>
                  {displayName && <span className="text-sm text-gray-700">{displayName}</span>}
                  {log.domain && <span className="truncate text-sm text-gray-500">{log.domain}</span>}
                </div>
                <span className="flex-shrink-0 text-xs text-gray-400">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            </div>
          );
        }

        return (
          <div key={log.id} className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={getAuditActionVariant(log)}>{getAuditActionLabel(log, t)}</Badge>
                  {displayName && <Badge variant="blue">{displayName}</Badge>}
                  {log.domain && <Badge variant="gray">{log.domain}</Badge>}
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-900">{getAuditSummary(log, t)}</p>
                  <p className="mt-1 text-xs text-gray-500">{new Date(log.created_at).toLocaleString()}</p>
                </div>

                {fields.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2 xl:grid-cols-3">
                    {fields.map((field) => (
                      <div key={`${log.id}-${field.label}`} className="rounded-lg bg-gray-50 px-3 py-2">
                        <span className="text-gray-400">{field.label}</span>
                        <p className="mt-1 break-all text-gray-700">{field.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
