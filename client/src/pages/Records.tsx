import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, ArrowLeft, Info } from 'lucide-react';
import { recordsApi, domainsApi } from '../api';
import type { DnsRecord, DnsLine } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS', 'PTR', 'HTTPS'];
const DOMAIN_VALUE_TYPES = new Set(['CNAME', 'MX', 'NS', 'PTR', 'HTTPS']);

interface RecordFormProps {
  domainId: number;
  lines: DnsLine[];
  initial?: DnsRecord;
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

function RecordForm({ lines, initial, onSubmit, isLoading }: RecordFormProps) {
  const toast = useToast();
  const { t } = useI18n();
  const [form, setForm] = useState<Partial<DnsRecord>>({
    name: initial?.name ?? '@',
    type: initial?.type ?? 'A',
    value: initial?.value ?? '',
    ttl: initial?.ttl ?? 600,
    mx: initial?.mx ?? 10,
    weight: initial?.weight ?? 10,
    line: initial?.line ?? (lines[0]?.id ?? ''),
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
      remark: form.remark?.toString() ?? '',
    };

    onSubmit(payload);
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const errorClass = 'border-red-300 focus:ring-red-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.hostName')}</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.type')} *</label>
          <select
            value={form.type ?? 'A'}
            onChange={(e) => {
              const nextType = e.target.value;
              set('type', nextType);
              if (nextType !== 'SRV') setErrors((current) => ({ ...current, srvPort: undefined, srvTarget: undefined, weight: undefined }));
            }}
            className={inputClass}
          >
            {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {isSrv ? (
        <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="flex items-start gap-2 text-xs text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{t('records.srvHelp')}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.priority')}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.weight')}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.port')}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.target')}</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.preview')}</label>
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-700">
              {normalizedSrvValue || 'port target'}
            </div>
            {errors.value && <p className="mt-1 text-xs text-red-600">{errors.value}</p>}
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.valueLabel')}</label>
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

      <div className={`grid gap-4 ${currentType === 'MX' || currentType === 'SRV' || (lines.length > 0 && !isSrv) ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">TTL</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.mxPriority')}</label>
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
        {lines.length > 0 && !isSrv && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('records.lineLabel')}</label>
            <select value={form.line ?? ''} onChange={(e) => set('line', e.target.value)} className={inputClass}>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('common.remark')}</label>
        <input value={form.remark ?? ''} onChange={(e) => set('remark', e.target.value)} placeholder={t('common.optionalRemark')} className={inputClass} />
      </div>

      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
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

export function Records() {
  const { id } = useParams<{ id: string }>();
  const domainId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<DnsRecord | null>(null);
  const [deleting, setDeleting] = useState<DnsRecord | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [keyword, setKeyword] = useState('');

  const { data: domain } = useQuery({
    queryKey: ['domain', domainId],
    queryFn: () => domainsApi.get(domainId).then((r) => r.data.data),
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['records', domainId, typeFilter, keyword],
    queryFn: () => recordsApi.list(domainId, {
      type: typeFilter || undefined,
      keyword: keyword || undefined,
    }).then((r) => r.data.data?.list ?? []),
  });

  const { data: lines = [] } = useQuery({
    queryKey: ['lines', domainId],
    queryFn: () => domainsApi.lines(domainId).then((r) => r.data.data ?? []),
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<DnsRecord>) => recordsApi.create(domainId, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setShowAdd(false);
      toast.success(t('records.addSuccess'));
    },
    onError: () => toast.error(t('records.addFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ recordId, data }: { recordId: string; data: Partial<DnsRecord> }) =>
      recordsApi.update(domainId, recordId, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setEditing(null);
      toast.success(t('records.updateSuccess'));
    },
    onError: () => toast.error(t('records.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: string) => recordsApi.delete(domainId, recordId),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setDeleting(null);
      toast.success(t('records.deleteSuccess'));
    },
    onError: () => toast.error(t('records.deleteFailed')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ recordId, status }: { recordId: string; status: number }) =>
      recordsApi.setStatus(domainId, recordId, status),
    onSuccess: (res, { recordId }) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      toast.success(t('records.toggled', { status: records.find((r) => r.id === recordId)?.status === 1 ? t('common.disabled') : t('common.enabled') }));
    },
    onError: () => toast.error(t('records.toggleFailed')),
  });

  const lineMap = Object.fromEntries(lines.map((l) => [l.id, l.name]));

  const columns = [
    { key: 'name', label: t('common.host'), render: (r: DnsRecord) => <span className="font-mono text-sm font-medium text-gray-900">{r.name}</span> },
    {
      key: 'type', label: t('common.type'),
      render: (r: DnsRecord) => (
        <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-bold">{r.type}</span>
      ),
    },
    {
      key: 'value', label: t('common.value'),
      render: (r: DnsRecord) => (
        <span className="font-mono text-xs text-gray-700 max-w-xs truncate block" title={r.value}>{r.value}</span>
      ),
    },
    {
      key: 'line', label: t('common.line'),
      render: (r: DnsRecord) => <span className="text-gray-500 text-xs">{r.line ? (lineMap[r.line] ?? r.line) : '-'}</span>,
    },
    { key: 'ttl', label: t('common.ttl'), render: (r: DnsRecord) => <span className="text-gray-500 text-xs">{r.ttl ?? '-'}</span> },
    {
      key: 'status', label: t('common.status'),
      render: (r: DnsRecord) => <Badge variant={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? t('common.enabled') : t('common.disabled')}</Badge>,
    },
    {
      key: 'actions', label: t('common.actions'),
      render: (r: DnsRecord) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => statusMutation.mutate({ recordId: r.id, status: r.status === 1 ? 0 : 1 })}
            title={r.status === 1 ? t('common.disable') : t('common.enable')}
            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
            {r.status === 1 ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
          <button onClick={() => setEditing(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => setDeleting(r)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/domains')} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{domain?.name ?? t('records.title')}</h2>
            <p className="text-sm text-gray-500">{t('records.subtitle')}</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> {t('records.addRecord')}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder={t('common.searchRecords')} className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          <option value="">{t('common.allTypes')}</option>
          {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={records} loading={isLoading} rowKey={(r) => r.id} emptyText={t('records.noRecords')} />
      </div>

      {showAdd && (
        <Modal title={t('records.addRecordFor', { name: domain?.name ?? '' })} onClose={() => setShowAdd(false)} size="lg">
          <RecordForm domainId={domainId} lines={lines} onSubmit={(data) => createMutation.mutate(data)} isLoading={createMutation.isPending} />
        </Modal>
      )}

      {editing && (
        <Modal title={t('records.editRecord')} onClose={() => setEditing(null)} size="lg">
          <RecordForm domainId={domainId} lines={lines} initial={editing}
            onSubmit={(data) => updateMutation.mutate({ recordId: editing.id, data })}
            isLoading={updateMutation.isPending} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={t('records.deleteConfirm', { name: deleting.name, type: deleting.type, value: deleting.value })}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
