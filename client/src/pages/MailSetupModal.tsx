import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Select, Space, Tag } from 'tdesign-react';
import { MailIcon, RefreshIcon } from 'tdesign-icons-react';
import { recordsApi } from '../api';
import type { DnsRecord } from '../api';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/Modal';
import { Table } from '../components/Table';
import { useI18n } from '../contexts/I18nContext';

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
    ],
  },
  {
    id: 'outlook',
    name: 'Microsoft 365 (Outlook)',
    records: [
      { name: '@', type: 'MX', value: 'domain.mail.protection.outlook.com', mx: 0, ttl: 3600 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:spf.protection.outlook.com -all', ttl: 3600 },
    ],
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    records: [
      { name: '@', type: 'MX', value: 'mx.zoho.com', mx: 10, ttl: 3600 },
      { name: '@', type: 'MX', value: 'mx2.zoho.com', mx: 20, ttl: 3600 },
      { name: '@', type: 'MX', value: 'mx3.zoho.com', mx: 50, ttl: 3600 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:zoho.com ~all', ttl: 3600 },
    ],
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    records: [
      { name: '@', type: 'MX', value: 'in1-smtp.messagingengine.com', mx: 10, ttl: 3600 },
      { name: '@', type: 'MX', value: 'in2-smtp.messagingengine.com', mx: 20, ttl: 3600 },
      { name: '@', type: 'TXT', value: 'v=spf1 include:spf.messagingengine.com ?all', ttl: 3600 },
    ],
  },
];

export function MailSetupModal({ domainId, onClose, existingRecords }: MailSetupModalProps) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('');

  const template = TEMPLATES.find((item) => item.id === selected);
  const conflicts = template?.records.filter((templateRecord) =>
    existingRecords.some((existingRecord) => existingRecord.name === templateRecord.name && existingRecord.type === templateRecord.type),
  ) || [];

  const batchMutation = useMutation({
    mutationFn: (records: Partial<DnsRecord>[]) => recordsApi.createBatch(domainId, records),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      toast.success(t('mail.addSuccess'));
      onClose();
    },
    onError: () => toast.error(t('mail.addFailed')),
  });

  const handleAdd = () => {
    if (!template) return;
    batchMutation.mutate(template.records);
  };

  const recordRows = template?.records.map((record, index) => ({ ...record, index })) ?? [];
  const columns = [
    { key: 'type', label: t('records.fields.type'), render: (row: typeof recordRows[number]) => <Tag theme="primary" variant="light">{row.type}</Tag> },
    { key: 'name', label: t('records.fields.host'), render: (row: typeof recordRows[number]) => <span className="record-mono record-mono--strong">{row.name}</span> },
    { key: 'value', label: t('records.fields.value'), render: (row: typeof recordRows[number]) => <span className="record-mono record-mono--value">{row.value}</span> },
    { key: 'mx', label: t('records.fields.mx'), render: (row: typeof recordRows[number]) => <span className="page-muted">{row.mx ?? '-'}</span> },
  ];

  return (
    <Modal title={t('mail.title')} onClose={onClose} size="lg">
      <div className="page-shell">
        <Form layout="vertical" colon={false} requiredMark={false}>
          <Form.FormItem label={t('mail.selectProvider')}>
            <Select
              clearable
              value={selected}
              placeholder={t('mail.chooseProvider')}
              options={TEMPLATES.map((item) => ({ label: item.name, value: item.id }))}
              onChange={(value) => setSelected(String(Array.isArray(value) ? value[0] ?? '' : value ?? ''))}
            />
          </Form.FormItem>
        </Form>

        {template && (
          <>
            <Table columns={columns} data={recordRows} rowKey={(row) => row.index} emptyText={t('common.noData')} />

            {conflicts.length > 0 && (
              <Alert
                theme="warning"
                title={t('mail.conflicts')}
                message={t('mail.conflictsDesc', { types: conflicts.map((conflict) => conflict.type).join(', ') })}
              />
            )}

            <Space className="record-form__actions">
              <Button variant="outline" onClick={onClose}>{t('mail.cancel')}</Button>
              <Button
                theme="primary"
                loading={batchMutation.isPending}
                icon={batchMutation.isPending ? <RefreshIcon /> : <MailIcon />}
                onClick={handleAdd}
              >
                {t('mail.add')}
              </Button>
            </Space>
          </>
        )}
      </div>
    </Modal>
  );
}
