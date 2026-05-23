import { Button, Space } from 'tdesign-react';
import { ArrowRightIcon, CloudIcon, InternetIcon, LockOnIcon, RocketIcon, SecuredIcon } from 'tdesign-icons-react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';
import './Landing.css';

export function Landing() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const features = [
    {
      icon: <InternetIcon size="large" />,
      title: t('landing.features.dnsManagement.title'),
      description: t('landing.features.dnsManagement.description'),
    },
    {
      icon: <SecuredIcon size="large" />,
      title: t('landing.features.nsMonitoring.title'),
      description: t('landing.features.nsMonitoring.description'),
    },
    {
      icon: <LockOnIcon size="large" />,
      title: t('landing.features.security.title'),
      description: t('landing.features.security.description'),
    },
    {
      icon: <CloudIcon size="large" />,
      title: t('landing.features.multiProvider.title'),
      description: t('landing.features.multiProvider.description'),
    },
  ];

  return (
    <div className="landing-page">
      {/* Header with Console Button */}
      <header className="landing-header">
        <div className="landing-header-content">
          <div className="landing-header-logo">
            <RocketIcon size="large" />
            <span className="landing-header-title">HiDNS</span>
          </div>
          <Button 
            theme="default" 
            variant="outline"
            onClick={() => navigate('/login')}
          >
            {t('landing.header.console')}
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-logo">
            <RocketIcon size="extra-large" />
          </div>
          <h1 className="landing-title">HiDNS</h1>
          <p className="landing-subtitle">{t('landing.hero.subtitle')}</p>
          <p className="landing-description">{t('landing.hero.description')}</p>
          
          <Space className="landing-actions">
            <Button 
              theme="primary" 
              size="large"
              onClick={() => navigate('/login')}
              suffix={<ArrowRightIcon />}
            >
              {t('landing.actions.login')}
            </Button>
            <Button 
              variant="outline" 
              size="large"
              onClick={() => navigate('/about')}
            >
              {t('landing.actions.learnMore')}
            </Button>
          </Space>
        </div>
        
        <div className="landing-hero-decoration">
          <div className="landing-circle landing-circle-1"></div>
          <div className="landing-circle landing-circle-2"></div>
          <div className="landing-circle landing-circle-3"></div>
        </div>
      </section>

      {/* Features Section */}
      <section className="landing-features">
        <h2 className="landing-section-title">{t('landing.features.title')}</h2>
        <div className="landing-features-grid">
          {features.map((feature, index) => (
            <div key={index} className="landing-feature-card">
              <div className="landing-feature-icon">
                {feature.icon}
              </div>
              <h3 className="landing-feature-title">{feature.title}</h3>
              <p className="landing-feature-description">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <h2 className="landing-cta-title">{t('landing.cta.title')}</h2>
        <p className="landing-cta-description">{t('landing.cta.description')}</p>
        <Button 
          theme="primary" 
          size="large"
          onClick={() => navigate('/login')}
          suffix={<ArrowRightIcon />}
        >
          {t('landing.cta.button')}
        </Button>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p>{t('landing.footer.copyright')}</p>
        <p className="landing-footer-links">
          <a href="https://github.com/HiPM-Tech/HiDNS" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <span>•</span>
          <button 
            className="landing-footer-link-button"
            onClick={() => navigate('/about')}
          >
            {t('landing.footer.about')}
          </button>
        </p>
      </footer>
    </div>
  );
}
