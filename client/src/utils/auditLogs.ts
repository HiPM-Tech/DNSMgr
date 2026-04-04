import type { LogEntry } from '../api';

export interface AuditField {
  label: string;
  value: string;
}

interface ParsedLogData {
  name?: string;
  type?: string;
  value?: string;
  recordId?: string | number;
  status?: number;
}

const actionLabels: Record<string, string> = {
  add_record: '新增解析记录',
  update_record: '修改解析记录',
  delete_record: '删除解析记录',
  set_record_status: '切换记录状态',
};

export function parseAuditData(log: LogEntry): ParsedLogData | null {
  if (!log.data) return null;

  try {
    const parsed = JSON.parse(log.data) as ParsedLogData;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function getAuditActionLabel(log: LogEntry): string {
  const parsed = parseAuditData(log);
  if (log.action === 'set_record_status') {
    return parsed?.status === 1 ? '启用解析记录' : '停用解析记录';
  }
  return actionLabels[log.action] ?? log.action;
}

export function getAuditActionVariant(log: LogEntry): 'green' | 'red' | 'yellow' | 'blue' | 'gray' {
  if (log.action === 'add_record') return 'green';
  if (log.action === 'delete_record') return 'red';
  if (log.action === 'update_record') return 'blue';
  if (log.action === 'set_record_status') return 'yellow';
  return 'gray';
}

export function getAuditSummary(log: LogEntry): string {
  const parsed = parseAuditData(log);
  const host = parsed?.name ? (parsed.name === '@' ? log.domain || '@' : `${parsed.name}.${log.domain || ''}`.replace(/\.$/, '')) : undefined;

  switch (log.action) {
    case 'add_record':
      return `新增 ${parsed?.type ?? 'DNS'} 记录${host ? `，主机 ${host}` : ''}${parsed?.value ? `，值 ${parsed.value}` : ''}`;
    case 'update_record':
      return `修改 ${parsed?.type ?? 'DNS'} 记录${host ? `，主机 ${host}` : ''}${parsed?.value ? `，值 ${parsed.value}` : ''}`;
    case 'delete_record':
      return `删除解析记录${parsed?.recordId ? `，记录 ID ${parsed.recordId}` : ''}`;
    case 'set_record_status':
      return `${parsed?.status === 1 ? '启用' : '停用'}解析记录${parsed?.recordId ? `，记录 ID ${parsed.recordId}` : ''}`;
    default:
      return log.detail || log.target || log.domain || log.action;
  }
}

export function getAuditFields(log: LogEntry): AuditField[] {
  const parsed = parseAuditData(log);
  const fields: AuditField[] = [];

  if (log.username) fields.push({ label: '操作人', value: log.username });
  if (log.domain) fields.push({ label: '域名', value: log.domain });
  if (parsed?.name) fields.push({ label: '主机记录', value: parsed.name });
  if (parsed?.type) fields.push({ label: '类型', value: parsed.type });
  if (parsed?.value) fields.push({ label: '记录值', value: parsed.value });
  if (parsed?.recordId !== undefined) fields.push({ label: '记录 ID', value: String(parsed.recordId) });
  if (parsed?.status !== undefined) fields.push({ label: '状态', value: parsed.status === 1 ? '启用' : '停用' });

  return fields;
}
