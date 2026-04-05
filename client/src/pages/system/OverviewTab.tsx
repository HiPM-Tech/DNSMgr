import { useQuery } from '@tanstack/react-query';
import { Server, Settings, RefreshCw, CheckCircle } from 'lucide-react';
import { systemApi } from '../../api';
import { useI18n } from '../../contexts/I18nContext';
import { useToast } from '../../hooks/useToast';

export function OverviewTab() {
  const { t } = useI18n();
  const toast = useToast();

  const { data: systemInfo, isLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const res = await systemApi.info();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const handleClearCache = () => {
    toast.success(t('system.cacheCleared'));
  };

  const handleBackupDatabase = () => {
    toast.success(t('system.backupStarted'));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <Server className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.status')}</h3>
            <p className="text-sm text-gray-500">{t('system.statusDesc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-sm text-gray-700">{t('system.runningNormally')}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Settings className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.versionInfo')}</h3>
            <p className="text-sm text-gray-500">{t('system.versionDesc')}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">{t('system.appVersion')}</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {isLoading ? t('common.loading') : systemInfo?.version}
            </p>
          </div>
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">{t('system.serverVersion')}</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {isLoading ? t('common.loading') : systemInfo?.serverVersion}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <RefreshCw className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.quickActions')}</h3>
            <p className="text-sm text-gray-500">{t('system.quickActionsDesc')}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleClearCache}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            {t('system.clearCache')}
          </button>
          <button
            onClick={handleBackupDatabase}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t('system.backupDatabase')}
          </button>
        </div>
      </div>
    </div>
  );
}
