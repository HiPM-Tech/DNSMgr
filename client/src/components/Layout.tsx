import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layout as TLayout } from 'tdesign-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { PageTransition } from './PageTransition';
import { ToastContainer } from './ToastContainer';
import { authApi } from '../api';
import './Layout.css';

function BackgroundImage({ backgroundImage }: { backgroundImage?: string }) {
  const imageUrl = (backgroundImage ?? '').trim();

  if (!imageUrl) return null;

  return (
    <div className="app-background" style={{ backgroundImage: `url("${imageUrl.replace(/"/g, '\\"')}")` }}>
      <div className="app-background__mask" />
    </div>
  );
}

export function Layout() {
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1000);
  const { data: preferences } = useQuery({
    queryKey: ['userPreferences'],
    queryFn: async () => {
      const res = await authApi.getPreferences();
      if (res.data.code === 0) {
        return res.data.data;
      }
      return null;
    },
    refetchInterval: 30000,
  });
  const hasBackgroundImage = Boolean(preferences?.backgroundImage?.trim());

  useEffect(() => {
    document.body.classList.toggle('app-has-background', hasBackgroundImage);
    return () => {
      document.body.classList.remove('app-has-background');
    };
  }, [hasBackgroundImage]);

  useEffect(() => {
    const handleResize = () => {
      setCollapsed(window.innerWidth < 1000);
      if (window.innerWidth >= 900) {
        setMobileMenuVisible(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <TLayout className={`app-layout ${hasBackgroundImage ? 'app-layout--with-background' : ''}`}>
      <BackgroundImage backgroundImage={preferences?.backgroundImage} />

      <Header
        collapsed={collapsed}
        avatarImage={preferences?.avatarImage}
        onMenuClick={() => setMobileMenuVisible(true)}
        onToggleCollapse={() => setCollapsed((value) => !value)}
      />

      <Sidebar collapsed={collapsed} onCollapseChange={setCollapsed} />
      <Sidebar
        collapsed={false}
        isMobile
        visible={mobileMenuVisible}
        onClose={() => setMobileMenuVisible(false)}
      />

      <TLayout className={`app-layout__main ${collapsed ? 'app-layout__main--collapsed' : ''}`}>
        <TLayout.Content className="app-layout__content">
          <div className="app-layout__page">
            <PageTransition />
          </div>
        </TLayout.Content>
      </TLayout>

      <ToastContainer />
    </TLayout>
  );
}
