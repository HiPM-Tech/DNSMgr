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
  accountId?: number;
  domainId?: number;
  total?: number;
  added?: number;
  is_hidden?: number;
}

const actionLabels: Record<string, string> = {
  add_record: '新增解析记录',
  update_record: '修改解析记录',
  delete_record: '删除解析记录',
  set_record_status: '切换记录状态',
  add_domain: '添加域名',
  delete_domain: '删除域名',
  update_domain: '修改域名',
  sync_domains: '同步域名',
  sync_add_domain: '同步添加域名',
};

export const AUDIT_ACTION_OPTIONS = [
  { value: 'add_record', label: actionLabels.add_record },
  { value: 'update_record', label: actionLabels.update_record },
  { value: 'delete_record', label: actionLabels.delete_record },
  { value: 'set_record_status', label: actionLabels.set_record_status },
  { value: 'add_domain', label: actionLabels.add_domain },
  { value: 'update_domain', label: actionLabels.update_domain },
  { value: 'delete_domain', label: actionLabels.delete_domain },
  { value: 'sync_domains', label: actionLabels.sync_domains },
  { value: 'sync_add_domain', label: actionLabels.sync_add_domain },
];

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
  if (log.action === 'add_domain' || log.action === 'sync_add_domain') return 'green';
  if (log.action === 'delete_domain') return 'red';
  if (log.action === 'update_domain') return 'blue';
  if (log.action === 'sync_domains') return 'yellow';
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
    case 'add_domain':
      return `添加域名${log.domain ? `，${log.domain}` : ''}`;
    case 'delete_domain':
      return `删除域名${log.domain ? `，${log.domain}` : ''}`;
    case 'update_domain':
      return `修改域名${log.domain ? `，${log.domain}` : ''}`;
    case 'sync_domains':
      return `同步域名${parsed?.added !== undefined ? `，新增 ${parsed.added}` : ''}`;
    case 'sync_add_domain':
      return `同步添加域名${log.domain ? `，${log.domain}` : ''}`;
    default:
      return log.detail || log.target || log.domain || log.action;
  }
}

export function getAuditFields(log: LogEntry): AuditField[] {
  const parsed = parseAuditData(log);
  const fields: AuditField[] = [];
  const displayName = log.nickname || log.username;

  if (displayName) fields.push({ label: '操作人', value: displayName });
  if (log.domain) fields.push({ label: '域名', value: log.domain });
  if (parsed?.name) fields.push({ label: '主机记录', value: parsed.name });
  if (parsed?.type) fields.push({ label: '类型', value: parsed.type });
  if (parsed?.value) fields.push({ label: '记录值', value: parsed.value });
  if (parsed?.recordId !== undefined) fields.push({ label: '记录 ID', value: String(parsed.recordId) });
  if (parsed?.status !== undefined) fields.push({ label: '状态', value: parsed.status === 1 ? '启用' : '停用' });
  if (parsed?.accountId !== undefined) fields.push({ label: '账号 ID', value: String(parsed.accountId) });
  if (parsed?.domainId !== undefined) fields.push({ label: '域名 ID', value: String(parsed.domainId) });
  if (parsed?.added !== undefined) fields.push({ label: '新增数量', value: String(parsed.added) });
  if (parsed?.total !== undefined) fields.push({ label: '总数', value: String(parsed.total) });
  if (parsed?.is_hidden !== undefined) fields.push({ label: '隐藏', value: parsed.is_hidden ? '是' : '否' });

  return fields;
}
