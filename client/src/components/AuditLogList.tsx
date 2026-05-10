import { Tag } from 'tdesign-react';
import type { LogEntry } from '../api';
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

function tagTheme(variant: string) {
  if (variant === 'green') return 'success';
  if (variant === 'red') return 'danger';
  if (variant === 'yellow') return 'warning';
  if (variant === 'blue') return 'primary';
  return 'default';
}

export function AuditLogList({ logs, compact = false }: AuditLogListProps) {
  const { t } = useI18n();

  return (
    <div className={compact ? 'audit-log-list audit-log-list--compact' : 'audit-log-list'}>
      {logs.map((log) => {
        const displayName = log.nickname || log.username;
        const fields = getAuditFields(log, t);
        const actionTag = (
          <Tag theme={tagTheme(getAuditActionVariant(log)) as any} variant="light">
            {getAuditActionLabel(log, t)}
          </Tag>
        );

        if (compact) {
          return (
            <div key={log.id} className="audit-log-item audit-log-item--compact">
              <div className="audit-log-tags">
                {actionTag}
                {displayName && <span className="page-strong">{displayName}</span>}
                {log.domain && <span className="page-muted">{log.domain}</span>}
              </div>
              <span className="page-muted">{new Date(log.created_at).toLocaleString()}</span>
            </div>
          );
        }

        return (
          <div key={log.id} className="audit-log-item">
            <div className="audit-log-tags">
              {actionTag}
              {displayName && <Tag theme="primary" variant="light">{displayName}</Tag>}
              {log.domain && <Tag variant="light">{log.domain}</Tag>}
            </div>

            <div>
              <p className="audit-log-summary">{getAuditSummary(log, t)}</p>
              <p className="page-muted">{new Date(log.created_at).toLocaleString()}</p>
            </div>

            {fields.length > 0 && (
              <div className="audit-log-fields">
                {fields.map((field) => (
                  <div key={`${log.id}-${field.label}`} className="audit-log-field">
                    <span>{field.label}</span>
                    <p>{field.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
