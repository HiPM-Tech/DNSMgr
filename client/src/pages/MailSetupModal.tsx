import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, AlertCircle, RefreshCw } from 'lucide-react';
import { recordsApi } from '../api';
import type { DnsRecord } from '../api';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/Modal';

interface MailSetupModalProps {
  domainId: number;
  domainName: string;
  onClose: () => void;
  existingRecords: DnsRecord[];
}

const TEMPLATES = [
  {
    id: 'google',
    name: 'Google Workspace (Gmail)',
    records: [
      { name: '@', type: 'MX', value: 'smtp.google.com', mx: 1, ttl: 3600 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 },
    ]
  },
  {
    id: 'outlook',
    name: 'Microsoft 365 (Outlook)',
    records: [
      { name: '@', type: 'MX', value: 'domain.mail.protection.outlook.com', mx: 0, ttl: 3600 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:spf.protection.outlook.com -all', ttl: 3600 },
    ]
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    records: [
      { name: '@', type: 'MX', value: 'mx.zoho.com', mx: 10, ttl: 3600 },
      { name: '@', type: 'MX', value: 'mx2.zoho.com', mx: 20, ttl: 3600 },
      { name: '@', type: 'MX', value: 'mx3.zoho.com', mx: 50, ttl: 3600 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:zoho.com ~all', ttl: 3600 },
    ]
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    records: [
      { name: '@', type: 'MX', value: 'in1-smtp.messagingengine.com', mx: 10, ttl: 3600 },
      { name: '@', type: 'MX', value: 'in2-smtp.messagingengine.com', mx: 20, ttl: 3600 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:spf.messagingengine.com ?all', ttl: 3600 },
    ]
  }
];

import { useI18n } from '../contexts/I18nContext';

export function MailSetupModal({ domainId, onClose, existingRecords }: MailSetupModalProps) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('');

  const template = TEMPLATES.find(t => t.id === selected);

  const conflicts = template?.records.filter(tr => 
    existingRecords.some(er => er.name === tr.name && er.type === tr.type)
  ) || [];

  const batchMutation = useMutation({
    mutationFn: (records: Partial<DnsRecord>[]) => recordsApi.createBatch(domainId, records),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      toast.success('Mail records added successfully');
      onClose();
    },
    onError: () => toast.error('Failed to add mail records')
  });

  const handleAdd = () => {
    if (!template) return;
    batchMutation.mutate(template.records);
  };

  return (
    <Modal title={t('mail.title')} onClose={onClose} size="lg">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('mail.selectProvider')}</label>
          <select 
            value={selected} 
            onChange={(e) => setSelected(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">{t('mail.chooseProvider')}</option>
            {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {template && (
          <div className="space-y-4">
            <h4 className="font-medium text-sm text-gray-900 dark:text-white">{t('mail.recordsAdded')}</h4>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-100 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-4 py-2">{t('records.fields.type')}</th>
                    <th className="px-4 py-2">{t('records.fields.host')}</th>
                    <th className="px-4 py-2">{t('records.fields.value')}</th>
                    <th className="px-4 py-2">{t('records.fields.mx')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {template.records.map((r, i) => (
                    <tr key={i} className="text-gray-700 dark:text-gray-300">
                      <td className="px-4 py-2 font-medium">{r.type}</td>
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 font-mono text-xs">{r.value}</td>
                      <td className="px-4 py-2">{r.mx ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {conflicts.length > 0 && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium mb-1">{t('mail.conflicts')}</p>
                  <p>{t('mail.conflictsDesc', { types: conflicts.map(c => c.type).join(', ') })}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                {t('mail.cancel')}
              </button>
              <button
                onClick={handleAdd}
                disabled={batchMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
              >
                {batchMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {t('mail.add')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
