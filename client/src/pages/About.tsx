import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Globe, Clock, Package, Server, Info } from 'lucide-react';
import { systemApi } from '../api';
import { useI18n } from '../contexts/I18nContext';
import { localeOptions } from '../i18n';

export function About() {
  const { locale, t } = useI18n();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Fetch system info
  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const res = await systemApi.info();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const infoItems = [
    {
      icon: Package,
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      label: t('about.version'),
      value: systemInfo?.version || '0.1-beta',
    },
    {
      icon: Database,
      iconColor: 'text-green-500',
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      label: t('about.databaseType'),
      value: systemInfo?.database?.type ? t(`about.db.${systemInfo.database.type}`) : t('common.loading'),
    },
    {
      icon: Info,
      iconColor: 'text-purple-500',
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      label: t('about.databaseVersion'),
      value: systemInfo?.database?.version || t('common.loading'),
    },
    {
      icon: Server,
      iconColor: 'text-orange-500',
      iconBg: 'bg-orange-100 dark:bg-orange-900/30',
      label: t('about.driverVersion'),
      value: systemInfo?.database?.driverVersion || t('common.loading'),
    },
    {
      icon: Globe,
      iconColor: 'text-yellow-500',
      iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
      label: t('about.timezone'),
      value: systemInfo?.timezone || t('common.loading'),
    },
    {
      icon: Clock,
      iconColor: 'text-indigo-500',
      iconBg: 'bg-indigo-100 dark:bg-indigo-900/30',
      label: t('about.currentTime'),
      value: currentTime.toLocaleString(locale),
    },
    {
      icon: Globe,
      iconColor: 'text-cyan-500',
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      label: t('about.language'),
      value: localeOptions.find(opt => opt.code === locale)?.label || locale,
    },
  ];

  return (
    <div className="max-w-2xl">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Info className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('about.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('about.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-1">
          {infoItems.map((item, index) => (
            <div
              key={item.label}
              className={`flex items-center justify-between py-3 ${
                index !== infoItems.length - 1 ? 'border-b border-gray-100 dark:border-gray-700' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-md ${item.iconBg}`}>
                  <item.icon className={`w-4 h-4 ${item.iconColor}`} />
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">{item.label}</span>
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
