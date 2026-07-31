import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';
import { ProviderIcon } from '../components/ProviderIcon';
import './Landing.css';

const RocketSvg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

const dnsProviders = [
  { type: 'cloudflare', name: 'Cloudflare' },
  { type: 'aliyun', name: 'Aliyun' },
  { type: 'dnspod', name: 'DNSPod' },
  { type: 'huawei', name: 'Huawei' },
  { type: 'gcore', name: 'Gcore' },
  { type: 'baidu', name: 'Baidu' },
];

const multiProviders = [
  { type: 'aliyunesa', name: 'Aliyun ESA' },
  { type: 'jdcloud', name: 'JD Cloud' },
  { type: 'west', name: 'West' },
  { type: 'namesilo', name: 'NameSilo' },
  { type: 'tencenteo', name: 'Tencent EO' },
  { type: 'dnshe', name: 'DNSHE' },
];

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function FadeInSection({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, visible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`landing-fade-in ${visible ? 'visible' : ''} ${delay ? `landing-fade-in-delay-${delay}` : ''} ${className}`}
    >
      {children}
    </div>
  );
}

function ScrollRevealText({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<HTMLSpanElement[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const sectionStart = rect.top;
      const sectionHeight = rect.height;

      if (sectionStart > viewportHeight || sectionStart + sectionHeight < 0) return;

      const progress = Math.max(0, Math.min(1, (viewportHeight - sectionStart) / (viewportHeight + sectionHeight)));
      const charCount = charsRef.current.length;
      const revealedCount = Math.floor(progress * charCount * 1.5);

      charsRef.current.forEach((span, i) => {
        if (span) {
          span.classList.toggle('revealed', i < revealedCount);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [text]);

  const chars = useMemo(() => text.split(''), [text]);

  return (
    <div ref={containerRef} className="landing-scroll-section">
      <div className="landing-scroll-sticky">
        <div className="landing-scroll-text">
          {chars.map((char, i) => (
            <span
              key={i}
              ref={(el) => { charsRef.current[i] = el as HTMLSpanElement; }}
            >
              {char}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const cardsRef = useRef<HTMLElement | null>(null);

  const scrollRevealText = useMemo(() =>
    'HiDNS 是一个现代化的 DNS 聚合管理平台，支持 22 家主流 DNS 服务商的统一管理。从域名解析到安全监控，从自动化运维到团队协作，为您提供全方位的 DNS 管理解决方案。',
    []
  );

  useEffect(() => {
    const handleScroll = () => {
      setHeaderScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToCards = useCallback(() => {
    cardsRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="landing">
      {/* Header */}
      <header className={`landing-header ${headerScrolled ? 'scrolled' : ''}`}>
        <div className="landing-header-inner">
          <div className="landing-header-logo">
            <RocketSvg />
            <span>HiDNS</span>
          </div>
          <button className="landing-btn landing-btn-primary" onClick={() => navigate('/login')}>
            {t('landing.header.console')}
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <FadeInSection>
          <div className="landing-badge">
            <RocketSvg />
            <span>DNS Manager Platform</span>
          </div>
        </FadeInSection>

        <FadeInSection delay={1}>
          <h1 className="landing-hero-title">
            HiDNS
          </h1>
        </FadeInSection>

        <FadeInSection delay={2}>
          <p className="landing-hero-subtitle">{t('landing.hero.subtitle')}</p>
        </FadeInSection>

        <FadeInSection delay={3}>
          <p className="landing-hero-desc">{t('landing.hero.description')}</p>
        </FadeInSection>

        <FadeInSection delay={4}>
          <div className="landing-hero-actions">
            <button className="landing-btn landing-btn-primary landing-btn-large" onClick={() => navigate('/login')}>
              {t('landing.actions.login')}
            </button>
            <button className="landing-btn landing-btn-outline landing-btn-large" onClick={scrollToCards}>
              {t('landing.actions.learnMore')}
            </button>
          </div>
        </FadeInSection>

        <div className="landing-hero-fade" />
      </section>

      {/* Scroll Reveal Text */}
      <ScrollRevealText text={scrollRevealText} />

      {/* Cards Section */}
      <main className="landing-cards" id="cards" ref={cardsRef}>

        {/* Card 1: DNS 聚合管理 — Hero Card */}
        <FadeInSection>
          <div className="landing-card landing-card-hero">
            <div className="landing-card-hero-content">
              <p className="landing-card-hero-label">DNS 聚合管理</p>
              <h2 className="landing-card-hero-title">
                {t('landing.features.dnsManagement.title')}
              </h2>
              <p className="landing-card-hero-desc">
                {t('landing.features.dnsManagement.description')}
              </p>
            </div>
            <div className="landing-card-hero-visual">
              <div className="landing-card-hero-panel">
                <div className="landing-card-hero-panel-inner">
                  <div className="landing-card-hero-dns-grid">
                    {dnsProviders.map((p) => (
                      <div key={p.type} className="landing-card-hero-dns-item">
                        <ProviderIcon type={p.type} name={p.name} size={20} />
                        <span>{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeInSection>

        {/* Row: 安全 (blue) | NS 监控 (bordered) */}
        <div className="landing-cards-row">
          <FadeInSection delay={1}>
            <div className="landing-card landing-card-blue">
              <p className="landing-card-accent-title">
                {t('landing.features.security.title')}
              </p>
              <p className="landing-card-accent-desc">
                {t('landing.features.security.description')}
              </p>
              <div className="landing-card-accent-badge">
                <span className="landing-card-accent-badge-label">Security</span>
                <span className="landing-card-accent-badge-value">2FA + JWT</span>
              </div>
            </div>
          </FadeInSection>

          <FadeInSection delay={2}>
            <div className="landing-card landing-card-bordered">
              <p className="landing-card-bordered-title">
                {t('landing.features.nsMonitoring.title')}
              </p>
              <p className="landing-card-bordered-desc">
                {t('landing.features.nsMonitoring.description')}
              </p>
              <div className="landing-card-bordered-icons">
                <div className="landing-card-bordered-icon-circle">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                </div>
                <div className="landing-card-bordered-icon-circle">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
              </div>
            </div>
          </FadeInSection>
        </div>

        {/* Card 3: 多平台支持 — Full Width */}
        <FadeInSection>
          <div className="landing-card landing-card-multi">
            <div className="landing-card-multi-content">
              <p className="landing-card-multi-label">Multi-Provider</p>
              <h2 className="landing-card-multi-title">
                {t('landing.features.multiProvider.title')}
              </h2>
              <p className="landing-card-multi-desc">
                {t('landing.features.multiProvider.description')}
              </p>
            </div>
            <div className="landing-card-multi-visual">
              <div className="landing-card-multi-grid">
                {multiProviders.map((p) => (
                  <div key={p.type} className="landing-card-multi-item">
                    <ProviderIcon type={p.type} name={p.name} size={20} />
                    <span className="landing-card-multi-name">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FadeInSection>

        {/* CTA */}
        <FadeInSection>
          <div className="landing-card landing-card-cta">
            <h2 className="landing-card-cta-title">{t('landing.cta.title')}</h2>
            <p className="landing-card-cta-desc">{t('landing.cta.description')}</p>
            <button className="landing-btn landing-btn-primary landing-btn-large" onClick={() => navigate('/login')}>
              {t('landing.cta.button')}
            </button>
          </div>
        </FadeInSection>

      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-links">
          <button className="landing-footer-link" onClick={() => navigate('/dash/about')}>
            {t('landing.footer.about')}
          </button>
          <a className="landing-footer-link" href="https://github.com" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <button className="landing-footer-link" onClick={() => navigate('/login')}>
            管理控制台
          </button>
        </div>
        <p className="landing-footer-copyright">{t('landing.footer.copyright')}</p>
      </footer>
    </div>
  );
}
