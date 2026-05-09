import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Loading, Space, Tag } from 'tdesign-react';
import {
  ChatMessageIcon,
  CodeIcon,
  ComponentGridIcon,
  DataBaseIcon,
  DataSearchIcon,
  FileIcon,
  InfoCircleIcon,
  InternetIcon,
  JumpIcon,
  LogoTdesignIcon,
  LogoGithubIcon,
  MapConnectionIcon,
  ModuleIcon,
  RocketIcon,
  ServerIcon,
  TimeIcon,
  UsergroupIcon,
} from 'tdesign-icons-react';
import { systemApi } from '../api';
import { useI18n } from '../contexts/I18nContext';
import { localeOptions } from '../i18n';

interface Contributor {
  name: string;
  avatar: string;
  profile: string;
  contributions: number;
}

interface OpenSourceReference {
  name: string;
  category: string;
  url: string;
  icon: ReactNode;
}

export function About() {
  const { locale, t } = useI18n();
  const [currentTime, setCurrentTime] = useState(new Date());

  const { data: systemInfo } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const res = await systemApi.info();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const frontendVersion = import.meta.env.VITE_APP_VERSION || '1.0.0 Open';
  const repoUrl = 'https://github.com/HiPM-Tech/DNSMgr';
  const telegramGroup = 'https://t.me/hipmdnsmgr';
  const license = 'GPL-3.0';

  const { data: contributors = [], isLoading: contributorsLoading } = useQuery<Contributor[]>({
    queryKey: ['github-contributors'],
    queryFn: async () => {
      const res = await fetch('https://api.github.com/repos/HiPM-Tech/DNSMgr/contributors?per_page=100');
      if (!res.ok) throw new Error('Failed to fetch contributors');
      const data = await res.json();
      return data.map((contributor: any) => ({
        name: contributor.login,
        avatar: contributor.avatar_url,
        profile: contributor.html_url,
        contributions: contributor.contributions,
      }));
    },
    staleTime: 1000 * 60 * 60 * 24,
  });

  const infoItems = [
    { icon: <ModuleIcon />, label: t('about.systemVersion'), value: systemInfo?.version || '1.0.0 Open' },
    { icon: <ModuleIcon />, label: t('about.frontendVersion'), value: frontendVersion },
    { icon: <DataBaseIcon />, label: t('about.databaseType'), value: systemInfo?.database?.type ? t(`about.db.${systemInfo.database.type}`) : t('common.loading') },
    { icon: <InfoCircleIcon />, label: t('about.databaseVersion'), value: systemInfo?.database?.version || t('common.loading') },
    { icon: <ServerIcon />, label: t('about.driverVersion'), value: systemInfo?.database?.driverVersion || t('common.loading') },
    { icon: <InternetIcon />, label: t('about.timezone'), value: systemInfo?.timezone || t('common.loading') },
    { icon: <TimeIcon />, label: t('about.currentTime'), value: currentTime.toLocaleString(locale) },
    { icon: <InternetIcon />, label: t('about.language'), value: localeOptions.find((option) => option.code === locale)?.label || locale },
  ];

  const openSourceReferences: OpenSourceReference[] = [
    {
      name: 'React',
      category: t('about.opensourceCategories.framework'),
      url: 'https://github.com/facebook/react',
      icon: <CodeIcon />,
    },
    {
      name: 'TDesign React',
      category: t('about.opensourceCategories.componentLibrary'),
      url: 'https://github.com/Tencent/tdesign-react',
      icon: <LogoTdesignIcon />,
    },
    {
      name: 'TDesign Icons',
      category: t('about.opensourceCategories.icons'),
      url: 'https://github.com/Tencent/tdesign-icons',
      icon: <ComponentGridIcon />,
    },
    {
      name: 'Vite',
      category: t('about.opensourceCategories.buildTool'),
      url: 'https://github.com/vitejs/vite',
      icon: <RocketIcon />,
    },
    {
      name: 'TanStack Query',
      category: t('about.opensourceCategories.stateData'),
      url: 'https://github.com/TanStack/query',
      icon: <DataSearchIcon />,
    },
    {
      name: 'React Router',
      category: t('about.opensourceCategories.routing'),
      url: 'https://github.com/remix-run/react-router',
      icon: <MapConnectionIcon />,
    },
  ];

  return (
    <div className="about-shell">
      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><InfoCircleIcon />{t('about.title')}</Space>}
        subtitle={t('about.subtitle')}
      >
        <div className="about-info-list">
          {infoItems.map((item) => (
            <div key={item.label} className="about-info-item">
              <Space align="center">
                <span className="about-info-item__icon">{item.icon}</span>
                <span>{item.label}</span>
              </Space>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><ModuleIcon />{t('about.opensource')}</Space>}
        subtitle={t('about.opensourceSubtitle')}
      >
        <div className="about-open-source-grid">
          {openSourceReferences.map((item) => (
            <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer" className="about-open-source-card">
              <span className="about-open-source-card__icon">{item.icon}</span>
              <span className="about-open-source-card__meta">
                <strong>{item.name}</strong>
                <span>{item.category}</span>
                <small>{item.url}</small>
              </span>
              <JumpIcon />
            </a>
          ))}
        </div>
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><LogoGithubIcon />{t('about.repository')}</Space>}
        subtitle={t('about.repoSubtitle')}
      >
        <div className="page-list">
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="about-link">
            <LogoGithubIcon />
            <span className="page-list-item__main">
              <strong>GitHub Repository</strong>
              <span>{repoUrl}</span>
            </span>
            <JumpIcon />
          </a>
          <div className="page-list-item">
            <Space align="center">
              <FileIcon />
              <span className="page-strong">{t('about.license')}</span>
            </Space>
            <Tag variant="light">{license}</Tag>
          </div>
        </div>
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><ChatMessageIcon />{t('about.community')}</Space>}
        subtitle={t('about.communitySubtitle')}
      >
        <a href={telegramGroup} target="_blank" rel="noopener noreferrer" className="about-link">
          <ChatMessageIcon />
          <span className="page-list-item__main">
            <strong>Telegram Group</strong>
            <span>@hipmdnsmgr</span>
          </span>
          <JumpIcon />
        </a>
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><UsergroupIcon />{t('about.contributors')}</Space>}
        subtitle={t('about.contributorsSubtitle')}
      >
        {contributorsLoading ? (
          <Loading loading text={t('common.loading')} />
        ) : contributors.length > 0 ? (
          <div className="about-contributors">
            {contributors.map((contributor) => (
              <a key={contributor.profile} href={contributor.profile} target="_blank" rel="noopener noreferrer" className="about-contributor">
                <img
                  src={contributor.avatar}
                  alt={contributor.name}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(contributor.name)}&background=random`;
                  }}
                />
                <span>{contributor.name}</span>
                {contributor.contributions > 0 && <Tag size="small" variant="light">{contributor.contributions}</Tag>}
              </a>
            ))}
          </div>
        ) : (
          <p className="page-muted">{t('about.noContributors')}</p>
        )}
      </Card>
    </div>
  );
}
