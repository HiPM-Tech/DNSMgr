import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from 'tdesign-react';
import { ArrowRightIcon, CloudIcon, InternetIcon, LockOnIcon, RocketIcon, UserIcon, ApiIcon, KeyIcon, ServerIcon, DataBaseIcon, AnalyticsIcon, NotificationIcon, SettingIcon, WifiIcon } from 'tdesign-icons-react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';
import './Landing.css';

const TOTAL_SECTIONS = 4;
const SWITCH_DURATION = 800;

function createParticles(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles: Array<{ x: number; y: number; size: number; speedX: number; speedY: number; opacity: number; pulse: number }> = [];
  const count = Math.min(100, Math.floor((canvas.width * canvas.height) / 12000));

  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 2.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.3,
      opacity: Math.random() * 0.5 + 0.15,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  let animId = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.pulse += 0.02;
      const pulseSize = p.size * (1 + Math.sin(p.pulse) * 0.3);

      ctx.beginPath();
      ctx.arc(p.x, p.y, pulseSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 210, 255, ${p.opacity})`;
      ctx.fill();

      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseSize * 3);
      glow.addColorStop(0, `rgba(100, 210, 255, ${p.opacity * 0.3})`);
      glow.addColorStop(1, 'rgba(100, 210, 255, 0)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulseSize * 3, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      p.x += p.speedX;
      p.y += p.speedY;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(100, 210, 255, ${0.08 * (1 - dist / 150)})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    animId = requestAnimationFrame(animate);
  };

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  window.addEventListener('resize', resize);
  animate();

  return () => {
    cancelAnimationFrame(animId);
    window.removeEventListener('resize', resize);
  };
}

const sections = [
  {
    key: 'hero',
    gradient: 'radial-gradient(ellipse at 20% 50%, rgba(59, 130, 246, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(139, 92, 246, 0.12) 0%, transparent 50%)',
  },
  {
    key: 'pipeline',
    gradient: 'radial-gradient(ellipse at 80% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 50%), radial-gradient(ellipse at 20% 80%, rgba(16, 185, 129, 0.08) 0%, transparent 50%)',
  },
  {
    key: 'features',
    gradient: 'radial-gradient(ellipse at 50% 0%, rgba(139, 92, 246, 0.15) 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)',
  },
  {
    key: 'footer',
    gradient: 'radial-gradient(ellipse at 30% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%)',
  },
];

const pipelineLayers = [
  {
    title: '接入层',
    icon: <WifiIcon />,
    items: [
      { icon: <UserIcon />, label: 'Web UI', desc: 'React SPA' },
      { icon: <ApiIcon />, label: 'REST API', desc: 'Express' },
      { icon: <DataBaseIcon />, label: 'WebSocket', desc: '实时推送' },
    ],
  },
  {
    title: '安全层',
    icon: <LockOnIcon />,
    items: [
      { icon: <KeyIcon />, label: 'JWT 认证', desc: 'Session 管理' },
      { icon: <LockOnIcon />, label: 'API Token', desc: '自动化接入' },
      { icon: <KeyIcon />, label: '2FA 验证', desc: 'TOTP/WebAuthn' },
    ],
  },
  {
    title: '核心引擎',
    icon: <ServerIcon />,
    items: [
      { icon: <InternetIcon />, label: '域名管理', desc: '多平台聚合' },
      { icon: <SettingIcon />, label: 'DNS 记录', desc: '全记录类型' },
      { icon: <CloudIcon />, label: 'NS 监测', desc: '实时监控' },
    ],
  },
  {
    title: '适配层',
    icon: <RocketIcon />,
    items: [
      { icon: <ServerIcon />, label: 'Gcore DNS', desc: 'API v2' },
      { icon: <CloudIcon />, label: 'Cloudflare', desc: '边缘网络' },
      { icon: <InternetIcon />, label: '更多接入', desc: 'AliDNS / DNSPod' },
    ],
  },
  {
    title: '运维保障',
    icon: <AnalyticsIcon />,
    items: [
      { icon: <DataBaseIcon />, label: '审计日志', desc: '操作追溯' },
      { icon: <NotificationIcon />, label: '告警通知', desc: '即时推送' },
      { icon: <SettingIcon />, label: '自动容灾', desc: 'Failover' },
    ],
  },
];

export function Landing() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState(0);
  const [headerVisible, setHeaderVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);
  const touchStartY = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  const features = [
    {
      icon: <InternetIcon size="large" />,
      title: t('landing.features.dnsManagement.title'),
      description: t('landing.features.dnsManagement.description'),
    },
    {
      icon: <CloudIcon size="large" />,
      title: t('landing.features.nsMonitoring.title'),
      description: t('landing.features.nsMonitoring.description'),
    },
    {
      icon: <LockOnIcon size="large" />,
      title: t('landing.features.security.title'),
      description: t('landing.features.security.description'),
    },
    {
      icon: <RocketIcon size="large" />,
      title: t('landing.features.multiProvider.title'),
      description: t('landing.features.multiProvider.description'),
    },
  ];

  const scrollToSection = useCallback((index: number) => {
    if (isScrolling.current) return;
    const target = Math.max(0, Math.min(TOTAL_SECTIONS - 1, index));
    if (target === activeSection) return;
    isScrolling.current = true;
    setActiveSection(target);
    setHeaderVisible(target === 0);
    if (wrapperRef.current) {
      wrapperRef.current.style.transform = `translateY(-${target * 100}vh)`;
    }
    setTimeout(() => { isScrolling.current = false; }, SWITCH_DURATION);
  }, [activeSection]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (isScrolling.current) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    scrollToSection(activeSection + delta);
  }, [activeSection, scrollToSection]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isScrolling.current) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      scrollToSection(activeSection + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      scrollToSection(activeSection - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      scrollToSection(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      scrollToSection(TOTAL_SECTIONS - 1);
    }
  }, [activeSection, scrollToSection]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const cleanup = createParticles(canvasRef.current);
    return cleanup;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
    const onTouchEnd = (e: TouchEvent) => {
      const deltaY = touchStartY.current - e.changedTouches[0].clientY;
      if (Math.abs(deltaY) > 40) {
        scrollToSection(activeSection + (deltaY > 0 ? 1 : -1));
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [activeSection, handleWheel, scrollToSection]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="landing" ref={containerRef}>
      <canvas ref={canvasRef} className="landing-particles" />
      <div className="landing-noise" />

      <div className="landing-blobs">
        <div className="landing-blob landing-blob-1" />
        <div className="landing-blob landing-blob-2" />
        <div className="landing-blob landing-blob-3" />
      </div>

      <div className="landing-grid" />

      {sections.map((s, i) => (
        <div
          key={s.key}
          className={`landing-section-bg${i === activeSection ? ' visible' : ''}`}
          style={{ background: s.gradient }}
        />
      ))}

      <header className={`landing-header${headerVisible ? '' : ' scrolled'}`}>
        <div className="landing-header-inner">
          <div className="landing-header-logo">
            <RocketIcon />
            <span>HiDNS</span>
          </div>
          <Button theme="default" variant="outline" onClick={() => navigate('/login')}>
            {t('landing.header.console')}
          </Button>
        </div>
      </header>

      <div className="landing-nav">
        {['首页', '流水线', '功能', '关于'].map((label, i) => (
          <button
            key={i}
            className={`landing-nav-dot${i === activeSection ? ' active' : ''}`}
            onClick={() => scrollToSection(i)}
            aria-label={label}
            title={label}
          >
            <span className="landing-nav-dot-inner" />
          </button>
        ))}
      </div>

      <div className="landing-wrapper" ref={wrapperRef} style={{ transform: 'translateY(0)' }}>
        {/* Section 0: Hero */}
        <section
          className={`landing-section${activeSection === 0 ? ' section-active' : ''}`}
          ref={(el) => { sectionRefs.current[0] = el; }}
        >
          <div className="landing-hero-content">
            <div className="landing-badge">
              <RocketIcon size="small" />
              <span>DNS Manager Platform</span>
            </div>
            <h1 className="landing-title">
              HiDNS
              <span className="landing-title-sub">一站式 DNS 聚合管理平台</span>
            </h1>
            <p className="landing-desc">{t('landing.hero.description')}</p>
            <div className="landing-hero-actions">
              <Button theme="primary" size="large" onClick={() => navigate('/login')} suffix={<ArrowRightIcon />}>
                {t('landing.actions.login')}
              </Button>
              <Button variant="outline" size="large" onClick={() => scrollToSection(1)}>
                {t('landing.actions.learnMore')}
              </Button>
            </div>
          </div>
        </section>

        {/* Section 1: Pipeline - Core Component Workflow */}
        <section
          className={`landing-section${activeSection === 1 ? ' section-active' : ''}`}
          ref={(el) => { sectionRefs.current[1] = el; }}
        >
          <h2 className="landing-section-title">核心工作流水线</h2>
          <p className="landing-pipeline-subtitle">从用户接入到 DNS 解析分发，全链路覆盖</p>
          <div className="landing-pipeline">
            {pipelineLayers.map((layer, li) => (
              <div key={li} className="landing-pipeline-layer" style={{ animationDelay: `${li * 0.15}s` }}>
                <div className="landing-pipeline-layer-header">
                  <span className="landing-pipeline-layer-icon">{layer.icon}</span>
                  <span className="landing-pipeline-layer-title">{layer.title}</span>
                </div>
                <div className="landing-pipeline-items">
                  {layer.items.map((item, ii) => (
                    <div key={ii} className="landing-pipeline-item">
                      <span className="landing-pipeline-item-icon">{item.icon}</span>
                      <span className="landing-pipeline-item-label">{item.label}</span>
                      <span className="landing-pipeline-item-desc">{item.desc}</span>
                    </div>
                  ))}
                </div>
                {li < pipelineLayers.length - 1 && (
                  <div className="landing-pipeline-connector">
                    <div className="landing-pipeline-arrow" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Section 2: Features */}
        <section
          className={`landing-section${activeSection === 2 ? ' section-active' : ''}`}
          ref={(el) => { sectionRefs.current[2] = el; }}
        >
          <h2 className="landing-section-title">{t('landing.features.title')}</h2>
          <div className="landing-features-grid">
            {features.map((f, i) => (
              <div key={i} className="landing-feature-card" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="landing-feature-icon">{f.icon}</div>
                <h3 className="landing-feature-name">{f.title}</h3>
                <p className="landing-feature-desc">{f.description}</p>
              </div>
            ))}
          </div>
          <div className="landing-features-more">
            <Button variant="outline" size="medium" onClick={() => navigate('/login')} suffix={<ArrowRightIcon />}>
              开始使用
            </Button>
          </div>
        </section>

        {/* Section 3: Footer */}
        <section
          className={`landing-section${activeSection === 3 ? ' section-active' : ''}`}
          ref={(el) => { sectionRefs.current[3] = el; }}
        >
          <div className="landing-footer-content">
            <div className="landing-footer-logo">
              <RocketIcon size="large" />
              <span>HiDNS</span>
            </div>
            <p className="landing-footer-desc">
              开源 · 安全 · 高效 —— 现代化 DNS 管理平台
            </p>
            <div className="landing-footer-links">
              <button className="landing-footer-link" onClick={() => navigate('/dash/about')}>
                {t('landing.footer.about')}
              </button>
              <span className="landing-footer-link-dot">·</span>
              <a className="landing-footer-link" href="https://github.com" target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              <span className="landing-footer-link-dot">·</span>
              <button className="landing-footer-link" onClick={() => navigate('/login')}>
                管理控制台
              </button>
            </div>
            <p className="landing-footer-copyright">{t('landing.footer.copyright')}</p>
          </div>
        </section>
      </div>

      <div className={`landing-scroll-hint${activeSection < TOTAL_SECTIONS - 1 ? ' visible' : ''}`}>
        <span className="landing-scroll-hint-text">滚动探索</span>
        <div className="landing-scroll-mouse">
          <div className="landing-scroll-wheel" />
        </div>
      </div>
    </div>
  );
}