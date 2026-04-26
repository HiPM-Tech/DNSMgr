import { useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, ShieldAlert, AlertTriangle, CheckCircle, RefreshCw, Search, Bell, Mail, Plus, Trash2, Wand2 } from 'lucide-react';
import { nsMonitorApi, domainsApi } from '../api';
import type { Domain } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
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
  encrypted_ns?: string | string[];  // 支持字符串或数组
  plain_ns?: string | string[];      // 支持字符串或数组
  is_poisoned?: boolean;
  status?: 'ok' | 'mismatch' | 'missing' | 'poisoned';
  last_check_at?: string;
  alert_count?: number;
}

export function NSMonitor() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedConfig, setSelectedConfig] = useState<NSMonitorConfig | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [deleteConfig, setDeleteConfig] = useState<NSMonitorConfig | null>(null);
  const [selectedDomainName, setSelectedDomainName] = useState<string>('');

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['ns-monitor'],
    queryFn: () => nsMonitorApi.list().then(r => r.data.data || []),
  });

  // 获取用户通知偏好设置
  const { data: userPrefs } = useQuery({
    queryKey: ['ns-monitor-user-prefs'],
    queryFn: () => nsMonitorApi.getUserPrefs().then(r => r.data.data),
  });

  const { data: domainsData } = useQuery<{ list: Domain[]; total: number; page: number; pageSize: number; totalPages: number }>({
    queryKey: ['domains'],
    queryFn: () => domainsApi.list().then(r => r.data.data ?? { list: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    enabled: isAddModalOpen,
  });
  const domains = domainsData?.list ?? [];

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; expected_ns: string; enabled: boolean }) =>
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

  const updateUserPrefsMutation = useMutation({
    mutationFn: (data: { notify_email?: boolean; notify_channels?: boolean }) =>
      nsMonitorApi.updateUserPrefs(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      queryClient.invalidateQueries({ queryKey: ['ns-monitor-user-prefs'] });
    },
    onError: () => {
      toast.error(t('nsMonitor.updatePrefsFailed'));
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { domain_id: number; expected_ns: string; enabled: boolean; notify_email: boolean; notify_channels: boolean }) =>
      nsMonitorApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      setIsAddModalOpen(false);
      toast.success(t('nsMonitor.addSuccess'));
    },
    onError: () => {
      toast.error(t('nsMonitor.addFailed'));
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => nsMonitorApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ns-monitor'] });
      toast.success(t('nsMonitor.deleteSuccess'));
    },
    onError: () => {
      toast.error(t('nsMonitor.deleteFailed'));
    },
  });

  const resolveNsMutation = useMutation({
    mutationFn: (domainName: string) => nsMonitorApi.resolveNs(domainName),
    onSuccess: (response) => {
      const data = response.data.data;
      // 自动填充预期 NS（使用加密优先策略）
      if (data.recommendedNs && data.recommendedNs.length > 0) {
        const expectedNs = data.recommendedNs.join(', ');
        // 找到表单中的textarea并设置值
        const textarea = document.querySelector('textarea[name="expected_ns"]') as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = expectedNs;
        }
        toast.success(t('nsMonitor.autoFillSuccess', { count: data.recommendedNs.length }));
      } else {
        toast.info(t('nsMonitor.noNsRecords'));
      }
    },
    onError: () => {
      toast.error(t('nsMonitor.resolveNsFailed'));
    },
  });

  const filteredConfigs = configs?.filter((c: NSMonitorConfig) =>
    c.domain_name?.toLowerCase().includes(searchKeyword.toLowerCase())
  ) || [];

  // 获取尚未添加监测的域名
  const monitoredDomainIds = new Set(configs?.map((c: NSMonitorConfig) => c.domain_id) || []);
  const availableDomains = domains?.filter((d: Domain) => !monitoredDomainIds.has(d.id)) || [];

  // 辅助函数：将 encrypted_ns 或 plain_ns 转换为数组
  const parseNSField = (value: string | string[] | undefined): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    // 如果是字符串，按逗号分割
    return value.split(',').map(s => s.trim()).filter(Boolean);
  };

  const columns: { key: string; label: string; render?: (row: NSMonitorConfig) => ReactNode }[] = [
    {
      key: 'domain_name',
      label: t('nsMonitor.domainName'),
      render: (row: NSMonitorConfig) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.domain_name}</span>
          {row.status === 'poisoned' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs" title={t('nsMonitor.poisonedTooltip')}>
              <ShieldAlert className="w-3 h-3" />
              {t('nsMonitor.poisoned')}
            </span>
          )}
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
      render: (row: NSMonitorConfig) => {
        const encryptedNS = parseNSField(row.encrypted_ns);
        const plainNS = parseNSField(row.plain_ns);
        
        return (
          <div className="space-y-1">
            {/* 加密查询结果 */}
            {encryptedNS.length > 0 && (
              <div className="text-xs">
                <span className="text-green-600 font-medium">{t('nsMonitor.encrypted')}:</span>
                <span className="text-gray-600 dark:text-gray-400 ml-1">
                  {encryptedNS.join(', ')}
                </span>
              </div>
            )}
            {/* 明文查询结果 */}
            {plainNS.length > 0 && (
              <div className="text-xs">
                <span className="text-blue-600 font-medium">{t('nsMonitor.plain')}:</span>
                <span className="text-gray-600 dark:text-gray-400 ml-1">
                  {plainNS.join(', ')}
                </span>
              </div>
            )}
            {/* 无结果 */}
            {encryptedNS.length === 0 && plainNS.length === 0 && (
              <div className="text-sm text-gray-400">
                {row.current_ns || t('nsMonitor.notChecked')}
              </div>
            )}
            {/* DNS 污染警告 */}
            {row.is_poisoned && (
              <div className="text-xs text-purple-600 font-medium flex items-center gap-1 mt-1">
                <ShieldAlert className="w-3 h-3" />
                {t('nsMonitor.dnsPoisoningDetected')}
              </div>
            )}
          </div>
        );
      },
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
      render: (row: NSMonitorConfig) => {
        // 优先使用用户偏好设置，如果没有则使用监测配置中的值
        const hasEmail = Boolean(userPrefs?.notify_email ?? row.notify_email);
        const hasChannels = Boolean(userPrefs?.notify_channels ?? row.notify_channels);
        // 如果都没有配置，显示 "-"
        if (!hasEmail && !hasChannels) {
          return <span className="text-gray-400">-</span>;
        }
        return (
          <div className="flex items-center gap-2">
            {hasEmail && <Mail className="w-4 h-4 text-blue-500" />}
            {hasChannels && <Bell className="w-4 h-4 text-purple-500" />}
          </div>
        );
      },
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
          <button
            onClick={() => setDeleteConfig(row)}
            disabled={deleteMutation.isPending}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title={t('common.delete')}
          >
            <Trash2 className="w-4 h-4" />
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
    });
  };

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedConfig) return;

    const formData = new FormData(e.currentTarget);
    
    // Update monitor config
    updateMutation.mutate({
      id: selectedConfig.id,
      expected_ns: formData.get('expected_ns') as string,
      enabled: formData.get('enabled') === 'on',
    });
    
    // Update user notification preferences
    updateUserPrefsMutation.mutate({
      notify_email: formData.get('notify_email') === 'on',
      notify_channels: formData.get('notify_channels') === 'on',
    });
  };

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const domainId = parseInt(formData.get('domain_id') as string);

    if (!domainId) {
      toast.error(t('nsMonitor.selectDomain'));
      return;
    }

    createMutation.mutate({
      domain_id: domainId,
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
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('nsMonitor.addMonitor')}
        </button>
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

      {/* Edit Modal */}
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
                  defaultChecked={userPrefs?.notify_email ?? selectedConfig.notify_email}
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
                  defaultChecked={userPrefs?.notify_channels ?? selectedConfig.notify_channels}
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

      {/* Add Modal */}
      {isAddModalOpen && (
        <Modal
          title={t('nsMonitor.addMonitor')}
          onClose={() => setIsAddModalOpen(false)}
        >
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('nsMonitor.selectDomain')} *
              </label>
              {availableDomains.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  {t('nsMonitor.noAvailableDomains')}
                </div>
              ) : (
                <select
                  name="domain_id"
                  required
                  onChange={(e) => {
                    const domainId = parseInt(e.target.value);
                    const domain = availableDomains.find(d => d.id === domainId);
                    setSelectedDomainName(domain?.name || '');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">{t('nsMonitor.selectDomainPlaceholder')}</option>
                  {availableDomains.map((domain: Domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('nsMonitor.expectedNS')}
              </label>
              <div className="flex gap-2">
                <textarea
                  name="expected_ns"
                  placeholder={t('nsMonitor.expectedNSPlaceholder')}
                  rows={3}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDomainName) {
                      resolveNsMutation.mutate(selectedDomainName);
                    } else {
                      toast.error(t('nsMonitor.selectDomainFirst'));
                    }
                  }}
                  disabled={!selectedDomainName || resolveNsMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  title={t('nsMonitor.autoFillTooltip')}
                >
                  <Wand2 className={`w-4 h-4 ${resolveNsMutation.isPending ? 'animate-spin' : ''}`} />
                  <span>{t('nsMonitor.autoFill')}</span>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('nsMonitor.expectedNSHint')}
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={true}
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
                  defaultChecked={true}
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
                  defaultChecked={true}
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
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || availableDomains.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {t('common.add')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm Dialog */}
      {deleteConfig && (
        <ConfirmDialog
          message={t('nsMonitor.deleteConfirm', { domain: deleteConfig.domain_name })}
          onConfirm={() => {
            deleteMutation.mutate(deleteConfig.id);
            setDeleteConfig(null);
          }}
          onCancel={() => setDeleteConfig(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
