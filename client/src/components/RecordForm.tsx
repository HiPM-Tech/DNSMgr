import { useState, useMemo } from 'react';
import { Info } from 'lucide-react';
import type { DnsRecord, DnsLine, Provider } from '../api';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';

export const COMMON_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS', 'PTR'];
export const CLOUDFLARE_RECORD_TYPES = ['A', 'AAAA', 'CAA', 'CERT', 'CNAME', 'DNSKEY', 'DS', 'HTTPS', 'LOC', 'MX', 'NAPTR', 'NS', 'OPENPGPKEY', 'PTR', 'SMIMEA', 'SRV', 'SSHFP', 'SVCB', 'TLSA', 'TXT', 'URI'];
export const DOMAIN_VALUE_TYPES = new Set(['CNAME', 'MX', 'NS', 'PTR', 'HTTPS']);
export const PROXIABLE_RECORD_TYPES = new Set(['A', 'AAAA', 'CNAME', 'HTTPS']);

export interface RecordFormProps {
  domainId: number;
  lines: DnsLine[];
  recordTypes: string[];
  provider?: Provider;
  initial?: DnsRecord;
  existingRecords?: DnsRecord[];
  onSubmit: (data: Partial<DnsRecord>) => void;
  isLoading: boolean;
}

interface SrvFields {
  priority: number;
  weight: number;
  port: string;
  target: string;
}

function isIPv4(value: string): boolean {
  const parts = value.trim().split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isIPv6(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || !normalized.includes(':')) return false;
  try {
    return new URL(`http://[${normalized}]`).hostname === `[${normalized}]`;
  } catch {
    return false;
  }
}

function isHostname(value: string): boolean {
  const normalized = value.trim().replace(/\.$/, '');
  if (!normalized || normalized.length > 253) return false;
  const labels = normalized.split('.');
  return labels.every((label) =>
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-zA-Z0-9-]+$/.test(label) &&
    !label.startsWith('-') &&
    !label.endsWith('-')
  );
}

function isRecordHost(value: string): boolean {
  const normalized = value.trim();
  if (normalized === '@') return true;
  return normalized.split('.').every((label) =>
    label.length > 0 &&
    /^[a-zA-Z0-9_-]+$/.test(label) &&
    !label.startsWith('-') &&
    !label.endsWith('-')
  );
}

function parseSrvValue(initial?: DnsRecord): SrvFields {
  const raw = (initial?.value ?? '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
    return {
      priority: initial?.mx ?? 10,
      weight: initial?.weight ?? 10,
      port: parts[0],
      target: parts.slice(1).join(' '),
    };
  }

  return {
    priority: initial?.mx ?? 10,
    weight: initial?.weight ?? 10,
    port: '',
    target: raw,
  };
}

export function RecordForm({ lines, recordTypes, provider, initial, existingRecords = [], onSubmit, isLoading }: RecordFormProps) {
  const toast = useToast();
  const { t } = useI18n();
  const [form, setForm] = useState<Partial<DnsRecord>>({
    name: initial?.name ?? '@',
    type: initial?.type ?? 'A',
    value: initial?.value ?? '',
    ttl: initial?.ttl ?? 600,
    mx: initial?.mx ?? 10,
    weight: initial?.weight ?? 10,
    line: initial?.cloudflare?.proxied !== undefined
      ? (initial.cloudflare.proxied ? '1' : '0')
      : (initial?.line ?? (lines[0]?.id ?? '')),
    remark: initial?.remark ?? '',
  });
  const [srv, setSrv] = useState<SrvFields>(() => parseSrvValue(initial));
  const [errors, setErrors] = useState<Partial<Record<'name' | 'value' | 'ttl' | 'mx' | 'weight' | 'srvPort' | 'srvTarget', string>>>({});

  const set = (k: keyof DnsRecord, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((current) => ({ ...current, [k as keyof typeof current]: undefined }));
  };

  const currentType = form.type ?? 'A';
  const isSrv = currentType === 'SRV';
  const isCloudflare = provider?.type === 'cloudflare';
  const canSelectProxy = lines.length > 0 && (
    isCloudflare
      ? (initial && initial.type === currentType && initial.cloudflare?.proxiable !== undefined
        ? Boolean(initial.cloudflare.proxiable)
        : initial && initial.type === currentType && initial.proxiable !== null && initial.proxiable !== undefined
          ? Boolean(initial.proxiable)
        : PROXIABLE_RECORD_TYPES.has(currentType))
      : provider?.capabilities?.line
  );

  const normalizedSrvValue = useMemo(() => {
    const port = srv.port.trim();
    const target = srv.target.trim();
    if (!port || !target) return '';
    return `${port} ${target}`;
  }, [srv.port, srv.target]);

  const validate = () => {
    const nextErrors: typeof errors = {};
    const name = (form.name ?? '').toString().trim();
    const value = isSrv ? normalizedSrvValue : (form.value ?? '').toString().trim();
    const ttl = Number(form.ttl ?? 0);

    if (!name) nextErrors.name = t('records.hostRequired');
    else if (!isRecordHost(name)) nextErrors.name = t('records.hostInvalid');
    else if (currentType === 'CNAME') {
      const hasConflict = existingRecords.some((r) => r.name === name && r.id !== initial?.id);
      const isRoot = name === '@';
      if ((isRoot || hasConflict) && !provider?.capabilities?.cnameFlattening) {
        nextErrors.name = t('records.cnameConflict');
      }
    } else {
      const hasCname = existingRecords.some((r) => r.name === name && r.id !== initial?.id && r.type === 'CNAME');
      if (hasCname && !provider?.capabilities?.cnameFlattening) {
        nextErrors.name = t('records.cnameConflict');
      }
    }

    if (!value) nextErrors.value = t('records.valueRequired');
    else if (currentType === 'A' && !isIPv4(value)) nextErrors.value = t('records.invalidA');
    else if (currentType === 'AAAA' && !isIPv6(value)) nextErrors.value = t('records.invalidAAAA');
    else if (DOMAIN_VALUE_TYPES.has(currentType) && !isHostname(value)) nextErrors.value = t('records.invalidHostname', { type: currentType });

    if (!Number.isFinite(ttl) || ttl < 1) nextErrors.ttl = t('records.invalidTtl');

    if (currentType === 'MX' || currentType === 'SRV') {
      const priority = Number(form.mx ?? 0);
      if (!Number.isFinite(priority) || priority < 0) nextErrors.mx = t('records.invalidPriority');
    }

    if (currentType === 'SRV') {
      const weight = Number(form.weight ?? 0);
      if (!Number.isFinite(weight) || weight < 0) nextErrors.weight = t('records.invalidWeight');
      if (!srv.port.trim()) nextErrors.srvPort = t('records.invalidSrvPortRequired');
      else if (!/^\d+$/.test(srv.port.trim()) || Number(srv.port.trim()) < 1 || Number(srv.port.trim()) > 65535) {
        nextErrors.srvPort = t('records.invalidSrvPort');
      }
      if (!srv.target.trim()) nextErrors.srvTarget = t('records.invalidSrvTargetRequired');
      else if (!isHostname(srv.target.trim())) nextErrors.srvTarget = t('records.invalidSrvTarget');
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error(t('records.fixErrors'));
      return;
    }

    const payload: Partial<DnsRecord> = {
      ...form,
      name: form.name?.toString().trim(),
      value: isSrv ? normalizedSrvValue : form.value?.toString().trim(),
      ttl: Number(form.ttl ?? 600),
      mx: currentType === 'MX' || currentType === 'SRV' ? Number(form.mx ?? 0) : undefined,
      weight: currentType === 'SRV' ? Number(form.weight ?? 0) : undefined,
      cloudflare: (isCloudflare && canSelectProxy && form.line !== undefined) ? { proxied: form.line === '1' } : undefined,
      line: (!isCloudflare && canSelectProxy) ? form.line : undefined,
      remark: form.remark?.toString() ?? '',
    };

    onSubmit(payload);
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const errorClass = 'border-red-300 focus:ring-red-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.hostName')}</label>
          <input
            required
            value={form.name ?? ''}
            onChange={(e) => set('name', e.target.value)}
            placeholder={t('records.hostPlaceholder')}
            className={`${inputClass} ${errors.name ? errorClass : ''}`}
          />
          {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('common.type')} *</label>
          <select
            value={form.type ?? 'A'}
            onChange={(e) => {
              const nextType = e.target.value;
              set('type', nextType);
              if (nextType !== 'SRV') setErrors((current) => ({ ...current, srvPort: undefined, srvTarget: undefined, weight: undefined }));
            }}
            className={inputClass}
          >
            {recordTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {isSrv ? (
        <div className="space-y-4 rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/20 p-4">
          <div className="flex items-start gap-2 text-xs text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{t('records.srvHelp')}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.priority')}</label>
              <input
                type="number"
                min={0}
                value={form.mx ?? 10}
                onChange={(e) => set('mx', Number(e.target.value))}
                className={`${inputClass} ${errors.mx ? errorClass : ''}`}
              />
              {errors.mx && <p className="mt-1 text-xs text-red-600">{errors.mx}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.weight')}</label>
              <input
                type="number"
                min={0}
                value={form.weight ?? 10}
                onChange={(e) => set('weight', Number(e.target.value))}
                className={`${inputClass} ${errors.weight ? errorClass : ''}`}
              />
              {errors.weight && <p className="mt-1 text-xs text-red-600">{errors.weight}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.port')}</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={srv.port}
                onChange={(e) => {
                  setSrv((current) => ({ ...current, port: e.target.value }));
                  setErrors((current) => ({ ...current, srvPort: undefined, value: undefined }));
                }}
                placeholder="443"
                className={`${inputClass} ${errors.srvPort ? errorClass : ''}`}
              />
              {errors.srvPort && <p className="mt-1 text-xs text-red-600">{errors.srvPort}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.target')}</label>
              <input
                value={srv.target}
                onChange={(e) => {
                  setSrv((current) => ({ ...current, target: e.target.value }));
                  setErrors((current) => ({ ...current, srvTarget: undefined, value: undefined }));
                }}
                placeholder="service.example.com"
                className={`${inputClass} ${errors.srvTarget ? errorClass : ''}`}
              />
              {errors.srvTarget && <p className="mt-1 text-xs text-red-600">{errors.srvTarget}</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.preview')}</label>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">
              {normalizedSrvValue || 'port target'}
            </div>
            {errors.value && <p className="mt-1 text-xs text-red-600">{errors.value}</p>}
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.valueLabel')}</label>
          <input
            required
            value={form.value ?? ''}
            onChange={(e) => set('value', e.target.value)}
            placeholder={currentType === 'A' ? '192.168.1.1' : currentType === 'AAAA' ? '2400:3200::1' : t('records.valuePlaceholder')}
            className={`${inputClass} ${errors.value ? errorClass : ''}`}
          />
          {errors.value && <p className="mt-1 text-xs text-red-600">{errors.value}</p>}
        </div>
      )}

      <div className={`grid gap-4 ${currentType === 'MX' || currentType === 'SRV' || canSelectProxy ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">TTL</label>
          <input
            type="number"
            min={1}
            value={form.ttl ?? 600}
            onChange={(e) => set('ttl', Number(e.target.value))}
            className={`${inputClass} ${errors.ttl ? errorClass : ''}`}
          />
          {errors.ttl && <p className="mt-1 text-xs text-red-600">{errors.ttl}</p>}
        </div>
        {currentType === 'MX' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.mxPriority')}</label>
            <input
              type="number"
              min={0}
              value={form.mx ?? 10}
              onChange={(e) => set('mx', Number(e.target.value))}
              className={`${inputClass} ${errors.mx ? errorClass : ''}`}
            />
            {errors.mx && <p className="mt-1 text-xs text-red-600">{errors.mx}</p>}
          </div>
        )}
        {canSelectProxy && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('records.lineLabel')}</label>
            <select value={form.line ?? ''} onChange={(e) => set('line', e.target.value)} className={inputClass}>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('common.remark')}</label>
        <input value={form.remark ?? ''} onChange={(e) => set('remark', e.target.value)} placeholder={t('common.optionalRemark')} className={inputClass} />
      </div>

      <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
        {currentType === 'A' && t('records.aHelp')}
        {currentType === 'AAAA' && t('records.aaaaHelp')}
        {DOMAIN_VALUE_TYPES.has(currentType) && t('records.hostnameHelp', { type: currentType })}
        {currentType === 'TXT' && t('records.txtHelp')}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="submit" disabled={isLoading}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
          {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {initial ? t('common.saveChanges') : t('records.addRecord')}
        </button>
      </div>
    </form>
  );
}
