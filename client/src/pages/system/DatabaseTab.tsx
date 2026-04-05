import { useQuery } from '@tanstack/react-query';
import { Database, AlertTriangle } from 'lucide-react';
import { systemApi } from '../../api';
import { useI18n } from '../../contexts/I18nContext';

export function DatabaseTab() {
  const { t } = useI18n();

  const { data: systemInfo, isLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const res = await systemApi.info();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <Database className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.databaseInfo')}</h3>
            <p className="text-sm text-gray-500">{t('system.databaseDesc')}</p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('system.databaseType')}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {isLoading ? t('common.loading') : systemInfo?.database?.type}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('system.databaseVersion')}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {isLoading ? t('common.loading') : systemInfo?.database?.version}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">{t('system.driverVersion')}</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {isLoading ? t('common.loading') : systemInfo?.database?.driverVersion}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">{t('system.databaseWarning')}</p>
            <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">{t('system.databaseWarningDesc')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
