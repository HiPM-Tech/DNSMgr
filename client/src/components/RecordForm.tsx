import { useState, useMemo, useEffect } from 'react';
import { Alert, Button, Form, Input, Select, Space } from 'tdesign-react';
import type { SelectValue } from 'tdesign-react/es/select';
import type { DnsRecord, DnsLine, Provider } from '../api';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import './RecordForm.css';

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

  try {
    const url = new URL(`http://${normalized}`);
    const hostname = url.hostname;
    const labels = hostname.split('.');

    for (const label of labels) {
      if (label.length === 0 || label.length > 63) {
        return false;
      }

      if (label.startsWith('xn--')) {
        if (!/^xn--[a-z0-9-]+$/i.test(label)) {
          return false;
        }
      } else {
        if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

function isRecordHost(value: string): boolean {
  const normalized = value.trim();
  if (normalized === '@') return true;
  if (normalized === '*') return true; // Support wildcard DNS records

  const labels = normalized.split('.');

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    
    if (label.length === 0 || label.length > 63) {
      return false;
    }

    // Wildcard can only be the first label
    if (label === '*') {
      if (i !== 0) return false; // Wildcard must be first label
      continue;
    }

    if (/[^\x00-\x7F]/.test(label)) {
      try {
        const url = new URL(`http://${label}.example.com`);
        const punycodeLabel = url.hostname.replace('.example.com', '');

        if (punycodeLabel.startsWith('xn--')) {
          if (!/^xn--[a-z0-9-]+$/i.test(punycodeLabel)) {
            return false;
          }
        }
      } catch {
        return false;
      }
    } else {
      if (!/^[a-zA-Z0-9_]([a-zA-Z0-9-_]{0,61}[a-zA-Z0-9_])?$/i.test(label)) {
        return false;
      }
    }
  }

  return true;
}

function parseSrvValue(initial?: DnsRecord): SrvFields {
  const raw = (initial?.value ?? '').trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  
  // SRV format: "priority weight port target" (4 parts)
  if (parts.length === 4 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
    return {
      priority: parseInt(parts[0], 10),
      weight: parseInt(parts[1], 10),
      port: parts[2],
      target: parts[3],
    };
  }

  // Fallback: use mx/weight fields from record, parse remaining as port target
  return {
    priority: initial?.mx ?? 10,
    weight: initial?.weight ?? 10,
    port: parts[0] ?? '',
    target: parts.slice(1).join(' ') ?? '',
  };
}

export function RecordForm({ lines, recordTypes, provider, initial, existingRecords = [], onSubmit, isLoading }: RecordFormProps) {
  const toast = useToast();
  const { t } = useI18n();
  
  const isVPS8 = provider?.type === 'vps8';
  const isCloudflare = provider?.type === 'cloudflare';
  const isAliyunESA = provider?.type === 'aliyunesa';
  const hasProxyMode = isCloudflare || isAliyunESA;
  const hasMultiLine = lines.length > 1 && !hasProxyMode;
  
  // ✅ 动态计算默认线路
  const defaultLine = useMemo(() => {
    if (hasProxyMode) return '0';
    if (hasMultiLine && lines.length > 0) return String(lines[0]?.id ?? '0');
    return '0';
  }, [hasProxyMode, hasMultiLine, lines]);

  // ✅ 使用 useState 惰性初始化（参考旧版本实现）
  const [form, setForm] = useState<Partial<DnsRecord>>(() => {
    console.log('[RecordForm] useState init - initial:', initial);
    return {
      name: initial?.name ?? '@',
      type: initial?.type ?? 'A',
      value: initial?.value ?? '',
      ttl: initial?.ttl ?? 600,
      mx: initial?.mx ?? 10,
      weight: initial?.weight ?? 10,
      line: initial?.line ?? defaultLine,
      remark: initial?.remark ?? '',
    };
  });

  const [srv, setSrv] = useState<SrvFields>(() => parseSrvValue(initial));
  const [errors, setErrors] = useState<Partial<Record<'name' | 'value' | 'ttl' | 'mx' | 'weight' | 'srvPort' | 'srvTarget', string>>>({});

  // ✅ Sync form state when initial changes (editing different record)
  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name ?? '@',
        type: initial.type ?? 'A',
        value: initial.value ?? '',
        ttl: initial.ttl ?? 600,
        mx: initial.mx ?? 10,
        weight: initial.weight ?? 10,
        line: initial.line ?? defaultLine,
        remark: initial.remark ?? '',
      });
      setSrv(parseSrvValue(initial));
      setErrors({});
    } else {
      setForm(prev => ({
        ...prev,
        line: prev.line === '0' ? defaultLine : prev.line,
      }));
    }
  }, [initial?.id, defaultLine]);

  const set = (k: keyof DnsRecord, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((current) => ({ ...current, [k as keyof typeof current]: undefined }));
  };

  const currentType = form.type ?? 'A';
  const isSrv = currentType === 'SRV';
  
  const canSelectProxy = hasProxyMode
    ? (isCloudflare
      ? (initial && initial.type === currentType && initial.cloudflare?.proxiable !== undefined
        ? Boolean(initial.cloudflare.proxiable)
        : initial && initial.type === currentType && initial.proxiable !== null && initial.proxiable !== undefined
          ? Boolean(initial.proxiable)
        : PROXIABLE_RECORD_TYPES.has(currentType))
      : true)
    : true;

  const normalizedSrvValue = useMemo(() => {
    const priority = Number(form.mx ?? srv.priority);
    const weight = Number(form.weight ?? srv.weight);
    const port = srv.port.trim();
    const target = srv.target.trim();
    if (!port || !target) return '';
    return `${priority} ${weight} ${port} ${target}`;
  }, [form.mx, form.weight, srv.port, srv.target, srv.priority, srv.weight]);

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

  const submitRecord = () => {
    if (!validate()) {
      toast.error(t('records.fixErrors'));
      return;
    }

    const lineValue = canSelectProxy ? form.line : undefined;
    const payload: Partial<DnsRecord> = {
      ...form,
      name: form.name?.toString().trim(),
      value: isSrv ? normalizedSrvValue : form.value?.toString().trim(),
      ttl: Number(form.ttl ?? 600),
      mx: currentType === 'MX' || currentType === 'SRV' ? Number(form.mx ?? 0) : undefined,
      weight: currentType === 'SRV' ? Number(form.weight ?? 0) : undefined,
      line: lineValue,
      cloudflare: (isCloudflare && canSelectProxy && lineValue !== undefined) ? { proxied: lineValue === '1' } : undefined,
      aliyunesa: (isAliyunESA && canSelectProxy && lineValue !== undefined) ? { proxied: lineValue === '1' } : undefined,
      remark: form.remark?.toString() ?? '',
    };

    onSubmit(payload);
  };

  const toSelectString = (value: SelectValue) => String(Array.isArray(value) ? value[0] ?? '' : value);
  const recordTypeOptions = recordTypes.map((type) => ({ label: type, value: type }));
  const lineOptions = hasProxyMode
    ? [
      { label: t('records.dnsOnly'), value: '0' },
      { label: t('records.proxied'), value: '1' },
    ]
    : hasMultiLine
      ? lines.map((line) => ({ label: line.name, value: line.id }))
      : [{ label: t('records.defaultLine') || '默认', value: '0' }];
  const currentTypeHelp = currentType === 'A'
    ? t('records.aHelp')
    : currentType === 'AAAA'
      ? t('records.aaaaHelp')
      : DOMAIN_VALUE_TYPES.has(currentType)
        ? t('records.hostnameHelp', { type: currentType })
        : currentType === 'TXT'
          ? t('records.txtHelp')
          : '';

  return (
    <Form
      layout="vertical"
      colon={false}
      requiredMark={false}
      className="record-form"
      onSubmit={({ e }: any) => {
        e?.preventDefault();
        submitRecord();
      }}
    >
      <div className="record-form__grid record-form__grid--two">
        <Form.FormItem
          label={(
            <span>
              {t('records.hostName')}
              {isVPS8 && initial && <span className="record-form__label-note">({t('records.cannotModifyHost') || '不可修改'})</span>}
            </span>
          )}
          status={errors.name ? 'error' : undefined}
          tips={errors.name || (isVPS8 && initial ? t('records.vps8HostHint') || 'VPS8 不支持修改主机名' : undefined)}
        >
          <Input
            clearable
            name={initial ? `record-host-${initial.id}` : 'record-host-create'}
            autocomplete="off"
            value={String(form.name ?? '')}
            onChange={(value: any) => set('name', String(value))}
            placeholder={t('records.hostPlaceholder')}
            disabled={isVPS8 && !!initial}
            status={errors.name ? 'error' : undefined}
          />
        </Form.FormItem>
        <Form.FormItem label={t('common.type')}>
          <Select
            value={String(form.type ?? 'A')}
            options={recordTypeOptions}
            onChange={(value: any) => {
              const nextType = toSelectString(value);
              set('type', nextType);
              if (nextType !== 'SRV') setErrors((current) => ({ ...current, srvPort: undefined, srvTarget: undefined, weight: undefined }));
            }}
          />
        </Form.FormItem>
      </div>

      {isSrv ? (
        <div className="record-form__section">
          <Alert theme="info" message={t('records.srvHelp')} />
          <div className="record-form__grid record-form__grid--two">
            <Form.FormItem label={t('records.priority')} status={errors.mx ? 'error' : undefined} tips={errors.mx}>
              <Input
                type="number"
                value={String(form.mx ?? 10)}
                onChange={(value: any) => set('mx', Number(value))}
                status={errors.mx ? 'error' : undefined}
              />
            </Form.FormItem>
            <Form.FormItem label={t('records.weight')} status={errors.weight ? 'error' : undefined} tips={errors.weight}>
              <Input
                type="number"
                value={String(form.weight ?? 10)}
                onChange={(value: any) => set('weight', Number(value))}
                status={errors.weight ? 'error' : undefined}
              />
            </Form.FormItem>
          </div>
          <div className="record-form__grid record-form__grid--two">
            <Form.FormItem label={t('records.port')} status={errors.srvPort ? 'error' : undefined} tips={errors.srvPort}>
              <Input
                type="number"
                value={srv.port}
                onChange={(value: any) => {
                  setSrv((current) => ({ ...current, port: String(value) }));
                  setErrors((current) => ({ ...current, srvPort: undefined, value: undefined }));
                }}
                placeholder="443"
                status={errors.srvPort ? 'error' : undefined}
              />
            </Form.FormItem>
            <Form.FormItem label={t('records.target')} status={errors.srvTarget ? 'error' : undefined} tips={errors.srvTarget}>
              <Input
                clearable
                value={srv.target}
                onChange={(value: any) => {
                  setSrv((current) => ({ ...current, target: String(value) }));
                  setErrors((current) => ({ ...current, srvTarget: undefined, value: undefined }));
                }}
                placeholder="service.example.com"
                status={errors.srvTarget ? 'error' : undefined}
              />
            </Form.FormItem>
          </div>
          <Form.FormItem label={t('records.preview')} status={errors.value ? 'error' : undefined} tips={errors.value}>
            <div className="record-form__preview">
              {normalizedSrvValue || 'port target'}
            </div>
          </Form.FormItem>
        </div>
      ) : (
        <Form.FormItem label={t('records.valueLabel')} status={errors.value ? 'error' : undefined} tips={errors.value}>
          <Input
            clearable
            name={initial ? `record-value-${initial.id}` : 'record-value-create'}
            autocomplete="off"
            value={String(form.value ?? '')}
            onChange={(value: any) => set('value', value)}
            placeholder={currentType === 'A' ? '192.168.1.1' : currentType === 'AAAA' ? '2400:3200::1' : t('records.valuePlaceholder')}
            status={errors.value ? 'error' : undefined}
          />
        </Form.FormItem>
      )}

      <div className={`record-form__grid ${currentType === 'MX' || currentType === 'SRV' || canSelectProxy ? 'record-form__grid--two' : ''}`}>
        <Form.FormItem label={t('common.ttl')} status={errors.ttl ? 'error' : undefined} tips={errors.ttl}>
          <Input
            type="number"
            value={String(form.ttl ?? 600)}
            onChange={(value: any) => set('ttl', Number(value))}
            status={errors.ttl ? 'error' : undefined}
          />
        </Form.FormItem>
        {currentType === 'MX' && (
          <Form.FormItem label={t('records.mxPriority')} status={errors.mx ? 'error' : undefined} tips={errors.mx}>
            <Input
              type="number"
              value={String(form.mx ?? 10)}
              onChange={(value: any) => set('mx', Number(value))}
              status={errors.mx ? 'error' : undefined}
            />
          </Form.FormItem>
        )}
        {canSelectProxy && (
          <Form.FormItem
            label={hasProxyMode ? t('records.proxy') : t('common.line')}
            tips={!hasProxyMode && !hasMultiLine ? t('records.singleLineHint') || '该提供商仅支持默认线路' : undefined}
          >
            <Select
              value={String(form.line ?? '0')}
              options={lineOptions}
              onChange={(value: any) => set('line', toSelectString(value))}
            />
          </Form.FormItem>
        )}
      </div>

      <Form.FormItem label={t('common.remark')}>
        <Input
          clearable
          value={String(form.remark ?? '')}
          onChange={(value: any) => set('remark', value)}
          placeholder={t('common.optionalRemark')}
        />
      </Form.FormItem>

      {currentTypeHelp && <Alert theme="info" message={currentTypeHelp} />}

      <Space className="record-form__actions" align="center">
        <Button type="submit" theme="primary" loading={isLoading}>
          {initial ? t('common.saveChanges') : t('records.addRecord')}
        </Button>
      </Space>
    </Form>
  );
}
