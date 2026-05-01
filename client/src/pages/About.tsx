import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, Globe, Clock, Package, Server, Info, Github, Users, MessageCircle, FileText } from 'lucide-react';
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

  // Get frontend version from package.json
  const frontendVersion = import.meta.env.VITE_APP_VERSION || '1.0.0 Open';

  // Repository and community links
  const repoUrl = 'https://github.com/HiPM-Tech/DNSMgr';
  const telegramGroup = 'https://t.me/hipmdnsmgr';
  const license = 'GPL-3.0';

  // Contributors list (randomly displayed)
  const contributors = [
    { name: 'HiPM Tech', avatar: 'https://avatars.githubusercontent.com/u/123456789?v=4' },
    { name: 'Community', avatar: 'https://avatars.githubusercontent.com/u/987654321?v=4' },
  ];

  const infoItems = [
    {
      icon: Package,
      iconColor: 'text-blue-500',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      label: t('about.systemVersion'),
      value: systemInfo?.version || '1.0.0 Open',
    },
    {
      icon: Package,
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      label: t('about.frontendVersion'),
      value: frontendVersion,
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
    <div className="max-w-2xl space-y-6">
      {/* System Info Card */}
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

      {/* Repository & License Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <Github className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('about.repository')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('about.repoSubtitle')}</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Repository Link */}
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
          >
            <Github className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-purple-600" />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-white">GitHub Repository</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{repoUrl}</div>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0 0L10 14" />
            </svg>
          </a>

          {/* License */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{t('about.license')}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{license}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Community Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
            <MessageCircle className="w-5 h-5 text-cyan-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('about.community')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('about.communitySubtitle')}</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Telegram Group */}
          <a
            href={telegramGroup}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
          >
            <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-cyan-600" />
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-white">Telegram Group</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">@hipmdnsmgr</div>
            </div>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0 0L10 14" />
            </svg>
          </a>
        </div>
      </div>

      {/* Contributors Card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
            <Users className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('about.contributors')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('about.contributorsSubtitle')}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {contributors.map((contributor, index) => (
            <div
              key={index}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <img
                src={contributor.avatar}
                alt={contributor.name}
                className="w-6 h-6 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.name)}&background=random`;
                }}
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white">{contributor.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
