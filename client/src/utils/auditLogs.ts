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

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

const actionKeys: Record<string, string> = {
  add_record: 'audit.actions.add_record',
  update_record: 'audit.actions.update_record',
  delete_record: 'audit.actions.delete_record',
  set_record_status: 'audit.actions.set_record_status',
  enable_record: 'audit.actions.enable_record',
  disable_record: 'audit.actions.disable_record',
  add_domain: 'audit.actions.add_domain',
  delete_domain: 'audit.actions.delete_domain',
  update_domain: 'audit.actions.update_domain',
  sync_domains: 'audit.actions.sync_domains',
  sync_add_domain: 'audit.actions.sync_add_domain',
  view_jwt_secret: 'audit.actions.view_jwt_secret',
  update_security_config: 'audit.actions.update_security_config',
  update_smtp_config: 'audit.actions.update_smtp_config',
  smtp_test_email: 'audit.actions.smtp_test_email',
  update_oauth_config: 'audit.actions.update_oauth_config',
  update_logto_oauth_config: 'audit.actions.update_logto_oauth_config',
  failover_switch: 'audit.actions.failover_switch',
  enable_2fa: 'audit.actions.enable_2fa',
  disable_2fa: 'audit.actions.disable_2fa',
  logout_session: 'audit.actions.logout_session',
  logout_other_sessions: 'audit.actions.logout_other_sessions',
  logout_all_sessions: 'audit.actions.logout_all_sessions',
  update_preferences: 'audit.actions.update_preferences',
  bind_oauth_account: 'audit.actions.bind_oauth_account',
  oauth_login: 'audit.actions.oauth_login',
  unbind_oauth_account: 'audit.actions.unbind_oauth_account',
  update_profile_email: 'audit.actions.update_profile_email',
  send_email_verification_code: 'audit.actions.send_email_verification_code',
  send_password_reset_code: 'audit.actions.send_password_reset_code',
  reset_password_by_email: 'audit.actions.reset_password_by_email',
};

export function getAuditActionOptions(t: TranslateFn) {
  return Object.entries(actionKeys).map(([value, key]) => ({
    value,
    label: t(key),
  }));
}

export function parseAuditData(log: LogEntry): ParsedLogData | null {
  if (!log.data) return null;

  try {
    const parsed = JSON.parse(log.data) as ParsedLogData;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function getAuditActionLabel(log: LogEntry, t: TranslateFn): string {
  const parsed = parseAuditData(log);
  if (log.action === 'set_record_status') {
    return parsed?.status === 1
      ? t('audit.actions.enable_record')
      : t('audit.actions.disable_record');
  }
  return actionKeys[log.action] ? t(actionKeys[log.action]) : log.action;
}

export function getAuditActionVariant(log: LogEntry): 'green' | 'red' | 'yellow' | 'blue' | 'gray' {
  if (log.action === 'add_record') return 'green';
  if (log.action === 'delete_record') return 'red';
  if (log.action === 'update_record') return 'blue';
  if (log.action === 'set_record_status') return 'yellow';
  if (log.action === 'enable_record') return 'green';
  if (log.action === 'disable_record') return 'red';
  if (log.action === 'add_domain' || log.action === 'sync_add_domain') return 'green';
  if (log.action === 'delete_domain') return 'red';
  if (log.action === 'update_domain') return 'blue';
  if (log.action === 'sync_domains') return 'yellow';
  if (log.action === 'smtp_test_email' || log.action === 'enable_2fa' || log.action === 'oauth_login') return 'green';
  if (log.action === 'disable_2fa' || log.action === 'unbind_oauth_account' || log.action === 'reset_password_by_email') return 'red';
  if (log.action === 'view_jwt_secret' || log.action === 'logout_session' || log.action === 'logout_other_sessions' || log.action === 'logout_all_sessions' || log.action === 'send_email_verification_code' || log.action === 'send_password_reset_code' || log.action === 'failover_switch') return 'yellow';
  if (log.action === 'update_security_config' || log.action === 'update_smtp_config' || log.action === 'update_oauth_config' || log.action === 'update_logto_oauth_config' || log.action === 'update_preferences' || log.action === 'bind_oauth_account' || log.action === 'update_profile_email') return 'blue';
  return 'gray';
}

export function getAuditSummary(log: LogEntry, t: TranslateFn): string {
  const parsed = parseAuditData(log);
  const host = parsed?.name ? (parsed.name === '@' ? log.domain || '@' : `${parsed.name}.${log.domain || ''}`.replace(/\.$/, '')) : undefined;
  const hostPart = host ? t('audit.parts.host', { host }) : '';
  const valuePart = parsed?.value ? t('audit.parts.value', { value: parsed.value }) : '';
  const recordIdPart = parsed?.recordId ? t('audit.parts.recordId', { id: String(parsed.recordId) }) : '';
  const domainPart = log.domain ? t('audit.parts.domain', { name: log.domain }) : '';
  const addedPart = parsed?.added !== undefined ? t('audit.parts.added', { count: parsed.added }) : '';

  switch (log.action) {
    case 'add_record':
      return t('audit.summary.addRecord', { type: parsed?.type ?? 'DNS', hostPart, valuePart });
    case 'update_record':
      return t('audit.summary.updateRecord', { type: parsed?.type ?? 'DNS', hostPart, valuePart });
    case 'delete_record':
      return t('audit.summary.deleteRecord', { recordIdPart });
    case 'set_record_status':
      return t('audit.summary.setRecordStatus', {
        status: parsed?.status === 1 ? t('audit.status.enabled') : t('audit.status.disabled'),
        recordIdPart,
      });
    case 'add_domain':
      return t('audit.summary.addDomain', { domainPart });
    case 'delete_domain':
      return t('audit.summary.deleteDomain', { domainPart });
    case 'update_domain':
      return t('audit.summary.updateDomain', { domainPart });
    case 'sync_domains':
      return t('audit.summary.syncDomains', { addedPart });
    case 'sync_add_domain':
      return t('audit.summary.syncAddDomain', { domainPart });
    default:
      return log.detail || log.target || log.domain || log.action;
  }
}

export function getAuditFields(log: LogEntry, t: TranslateFn): AuditField[] {
  const parsed = parseAuditData(log);
  const fields: AuditField[] = [];
  const displayName = log.nickname || log.username;

  if (displayName) fields.push({ label: t('audit.fields.operator'), value: displayName });
  if (log.domain) fields.push({ label: t('audit.fields.domain'), value: log.domain });
  if (parsed?.name) fields.push({ label: t('audit.fields.host'), value: parsed.name });
  if (parsed?.type) fields.push({ label: t('audit.fields.type'), value: parsed.type });
  if (parsed?.value) fields.push({ label: t('audit.fields.value'), value: parsed.value });
  if (parsed?.recordId !== undefined) fields.push({ label: t('audit.fields.recordId'), value: String(parsed.recordId) });
  if (parsed?.status !== undefined) fields.push({ label: t('audit.fields.status'), value: parsed.status === 1 ? t('audit.status.enabled') : t('audit.status.disabled') });
  if (parsed?.accountId !== undefined) fields.push({ label: t('audit.fields.accountId'), value: String(parsed.accountId) });
  if (parsed?.domainId !== undefined) fields.push({ label: t('audit.fields.domainId'), value: String(parsed.domainId) });
  if (parsed?.added !== undefined) fields.push({ label: t('audit.fields.added'), value: String(parsed.added) });
  if (parsed?.total !== undefined) fields.push({ label: t('audit.fields.total'), value: String(parsed.total) });
  if (parsed?.is_hidden !== undefined) fields.push({ label: t('audit.fields.hidden'), value: parsed.is_hidden ? t('audit.status.yes') : t('audit.status.no') });

  return fields;
}
