import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, AlertTriangle, CheckCircle, RefreshCw, Search, Bell, Mail } from 'lucide-react';
import { nsMonitorApi } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';

interface NSMonitorConfig {
  id: number;
  domain_id: number;
  domain_name: string;
  expected_ns: string;
  enabled: boolean;
  notify_email: boolean;
  notify_channels: boolean;
  current_ns?: string;
  status?: 'ok' | 'mismatch' | 'missing';
  last_check_at?: string;
  alert_count?: number;
}

export function NSMonitor() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedConfig, setSelectedConfig] = useState<NSMonitorConfig | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['ns-monitor'],
    queryFn: () => nsMonitorApi.list().then(r => r.data.data || []),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; expected_ns: string; enabled: boolean; notify_email: boolean; notify_channels: boolean }) =>
      nsMonitorApi.update(data.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      setIsEditModalOpen(false);
      toast.success(t('nsMonitor.updateSuccess'));
    },
    onError: () => {
      toast.error(t('nsMonitor.updateFailed'));
    },
  });

  const checkMutation = useMutation({
    mutationFn: (id: number) => nsMonitorApi.check(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      toast.success(t('nsMonitor.checkSuccess'));
    },
    onError: () => {
      toast.error(t('nsMonitor.checkFailed'));
    },
  });

  const filteredConfigs = configs.filter((c: NSMonitorConfig) =>
    c.domain_name.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  const columns = [
    {
      key: 'domain_name',
      label: t('nsMonitor.domainName'),
      render: (row: NSMonitorConfig) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.domain_name}</span>
          {row.status === 'mismatch' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">
              <AlertTriangle className="w-3 h-3" />
              {t('nsMonitor.mismatch')}
            </span>
          )}
          {row.status === 'missing' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
              <AlertTriangle className="w-3 h-3" />
              {t('nsMonitor.missing')}
            </span>
          )}
          {row.status === 'ok' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
              <CheckCircle className="w-3 h-3" />
              {t('nsMonitor.normal')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'current_ns',
      label: t('nsMonitor.currentNS'),
      render: (row: NSMonitorConfig) => (
        <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
          {row.current_ns || t('nsMonitor.notChecked')}
        </div>
      ),
    },
    {
      key: 'expected_ns',
      label: t('nsMonitor.expectedNS'),
      render: (row: NSMonitorConfig) => (
        <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
          {row.expected_ns || t('nsMonitor.notSet')}
        </div>
      ),
    },
    {
      key: 'enabled',
      label: t('nsMonitor.monitoring'),
      render: (row: NSMonitorConfig) => (
        <input
          type="checkbox"
          checked={row.enabled}
          onChange={() => handleToggleEnabled(row)}
          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
        />
      ),
    },
    {
      key: 'notifications',
      label: t('nsMonitor.notifications'),
      render: (row: NSMonitorConfig) => (
        <div className="flex items-center gap-2">
          {row.notify_email && <Mail className="w-4 h-4 text-blue-500" />}
          {row.notify_channels && <Bell className="w-4 h-4 text-purple-500" />}
        </div>
      ),
    },
    {
      key: 'last_check',
      label: t('nsMonitor.lastCheck'),
      render: (row: NSMonitorConfig) => (
        <div className="text-sm text-gray-500">
          {row.last_check_at
            ? new Date(row.last_check_at).toLocaleString()
            : t('nsMonitor.never')}
        </div>
      ),
    },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (row: NSMonitorConfig) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => checkMutation.mutate(row.id)}
            disabled={checkMutation.isPending}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title={t('nsMonitor.checkNow')}
          >
            <RefreshCw className={`w-4 h-4 ${checkMutation.isPending ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => {
              setSelectedConfig(row);
              setIsEditModalOpen(true);
            }}
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={t('common.edit')}
          >
            <Shield className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const handleToggleEnabled = (row: NSMonitorConfig) => {
    updateMutation.mutate({
      id: row.id,
      expected_ns: row.expected_ns,
      enabled: !row.enabled,
      notify_email: row.notify_email,
      notify_channels: row.notify_channels,
    });
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedConfig) return;

    const formData = new FormData(e.currentTarget);
    updateMutation.mutate({
      id: selectedConfig.id,
      expected_ns: formData.get('expected_ns') as string,
      enabled: formData.get('enabled') === 'on',
      notify_email: formData.get('notify_email') === 'on',
      notify_channels: formData.get('notify_channels') === 'on',
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('nsMonitor.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('nsMonitor.subtitle')}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder={t('nsMonitor.searchPlaceholder')}
            className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700">
        <Table
          columns={columns}
          data={filteredConfigs}
          loading={isLoading}
          rowKey={(r) => r.id}
          emptyText={t('nsMonitor.noConfigs')}
        />
      </div>

      {isEditModalOpen && selectedConfig && (
        <Modal
          title={t('nsMonitor.editConfig')}
          onClose={() => setIsEditModalOpen(false)}
        >
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('nsMonitor.domainName')}
              </label>
              <input
                type="text"
                value={selectedConfig.domain_name}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('nsMonitor.expectedNS')}
              </label>
              <textarea
                name="expected_ns"
                defaultValue={selectedConfig.expected_ns}
                placeholder={t('nsMonitor.expectedNSPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('nsMonitor.expectedNSHint')}
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={selectedConfig.enabled}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t('nsMonitor.enableMonitoring')}
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="notify_email"
                  defaultChecked={selectedConfig.notify_email}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t('nsMonitor.notifyEmail')}
                </span>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="notify_channels"
                  defaultChecked={selectedConfig.notify_channels}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t('nsMonitor.notifyChannels')}
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
