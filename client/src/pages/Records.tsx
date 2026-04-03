import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ToggleLeft, ToggleRight, Search, ArrowLeft } from 'lucide-react';
import { recordsApi, domainsApi } from '../api';
import type { DnsRecord, DnsLine } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS', 'PTR', 'HTTPS'];

interface RecordFormProps {
  domainId: number;
  lines: DnsLine[];
  initial?: DnsRecord;
  onSubmit: (data: Partial<DnsRecord>) => void;
  isLoading: boolean;
}

function RecordForm({ lines, initial, onSubmit, isLoading }: RecordFormProps) {
  const [form, setForm] = useState<Partial<DnsRecord>>({
    name: initial?.name ?? '@',
    type: initial?.type ?? 'A',
    value: initial?.value ?? '',
    ttl: initial?.ttl ?? 600,
    mx: initial?.mx ?? 10,
    line: initial?.line ?? (lines[0]?.id ?? ''),
    remark: initial?.remark ?? '',
  });

  const set = (k: keyof DnsRecord, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Host Name *</label>
          <input required value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="@ or subdomain" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Type *</label>
          <select value={form.type ?? 'A'} onChange={(e) => set('type', e.target.value)} className={inputClass}>
            {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Value *</label>
        <input required value={form.value ?? ''} onChange={(e) => set('value', e.target.value)} placeholder="Record value" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">TTL</label>
          <input type="number" min={1} value={form.ttl ?? 600} onChange={(e) => set('ttl', Number(e.target.value))} className={inputClass} />
        </div>
        {form.type === 'MX' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">MX Priority</label>
            <input type="number" min={0} value={form.mx ?? 10} onChange={(e) => set('mx', Number(e.target.value))} className={inputClass} />
          </div>
        )}
        {lines.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Line</label>
            <select value={form.line ?? ''} onChange={(e) => set('line', e.target.value)} className={inputClass}>
              {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Remark</label>
        <input value={form.remark ?? ''} onChange={(e) => set('remark', e.target.value)} placeholder="Optional remark" className={inputClass} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button type="submit" disabled={isLoading}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
          {isLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {initial ? 'Save Changes' : 'Add Record'}
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
    }).then((r) => r.data.data ?? []),
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
      toast.success('Record added');
    },
    onError: () => toast.error('Failed to add record'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ recordId, data }: { recordId: number; data: Partial<DnsRecord> }) =>
      recordsApi.update(domainId, recordId, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setEditing(null);
      toast.success('Record updated');
    },
    onError: () => toast.error('Failed to update record'),
  });

  const deleteMutation = useMutation({
    mutationFn: (recordId: number) => recordsApi.delete(domainId, recordId),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      setDeleting(null);
      toast.success('Record deleted');
    },
    onError: () => toast.error('Failed to delete record'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ recordId, status }: { recordId: number; status: number }) =>
      recordsApi.setStatus(domainId, recordId, status),
    onSuccess: (res, { recordId }) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      toast.success(`Record ${records.find((r) => r.id === recordId)?.status === 1 ? 'disabled' : 'enabled'}`);
    },
    onError: () => toast.error('Failed to toggle status'),
  });

  const lineMap = Object.fromEntries(lines.map((l) => [l.id, l.name]));

  const columns = [
    { key: 'name', label: 'Host', render: (r: DnsRecord) => <span className="font-mono text-sm font-medium text-gray-900">{r.name}</span> },
    {
      key: 'type', label: 'Type',
      render: (r: DnsRecord) => (
        <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs font-bold">{r.type}</span>
      ),
    },
    {
      key: 'value', label: 'Value',
      render: (r: DnsRecord) => (
        <span className="font-mono text-xs text-gray-700 max-w-xs truncate block" title={r.value}>{r.value}</span>
      ),
    },
    {
      key: 'line', label: 'Line',
      render: (r: DnsRecord) => <span className="text-gray-500 text-xs">{r.line ? (lineMap[r.line] ?? r.line) : '—'}</span>,
    },
    { key: 'ttl', label: 'TTL', render: (r: DnsRecord) => <span className="text-gray-500 text-xs">{r.ttl ?? '—'}</span> },
    {
      key: 'status', label: 'Status',
      render: (r: DnsRecord) => <Badge variant={r.status === 1 ? 'green' : 'red'}>{r.status === 1 ? 'Enabled' : 'Disabled'}</Badge>,
    },
    {
      key: 'actions', label: 'Actions',
      render: (r: DnsRecord) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => statusMutation.mutate({ recordId: r.id, status: r.status === 1 ? 0 : 1 })}
            title={r.status === 1 ? 'Disable' : 'Enable'}
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
            <h2 className="text-lg font-semibold text-gray-900">{domain?.name ?? 'Records'}</h2>
            <p className="text-sm text-gray-500">DNS Records Management</p>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> Add Record
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)}
            placeholder="Search records..." className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
          <option value="">All Types</option>
          {RECORD_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={records} loading={isLoading} rowKey={(r) => r.id} emptyText="No records found." />
      </div>

      {showAdd && (
        <Modal title={`Add Record — ${domain?.name}`} onClose={() => setShowAdd(false)} size="lg">
          <RecordForm domainId={domainId} lines={lines} onSubmit={(data) => createMutation.mutate(data)} isLoading={createMutation.isPending} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit Record" onClose={() => setEditing(null)} size="lg">
          <RecordForm domainId={domainId} lines={lines} initial={editing}
            onSubmit={(data) => updateMutation.mutate({ recordId: editing.id, data })}
            isLoading={updateMutation.isPending} />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={`Delete record "${deleting.name}" (${deleting.type}: ${deleting.value})?`}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
