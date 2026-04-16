import { Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastContainer } from './ToastContainer';
import { authApi } from '../api';

function BackgroundImage() {
  const [backgroundImage, setBackgroundImage] = useState<string>('');

  const { data: preferences } = useQuery({
    queryKey: ['userPreferences'],
    queryFn: async () => {
      const res = await authApi.getPreferences();
      if (res.data.code === 0) {
        return res.data.data;
      }
      return null;
    },
    refetchInterval: 30000, // 每30秒刷新一次
  });

  useEffect(() => {
    if (preferences?.backgroundImage) {
      setBackgroundImage(preferences.backgroundImage);
    } else {
      setBackgroundImage('');
    }
  }, [preferences?.backgroundImage]);

  if (!backgroundImage) return null;

  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none"
      style={{
        backgroundImage: `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* 遮罩层，确保内容可读 */}
      <div className="absolute inset-0 bg-white/80 dark:bg-gray-950/80" />
    </div>
  );
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 relative">
      {/* 自定义背景图 */}
      <BackgroundImage />

      {/* 桌面端侧边栏 */}
      <div className="relative z-10">
        <Sidebar />
      </div>
      
      {/* 移动端侧边栏抽屉 */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        isMobile 
      />
      
      {/* 主内容区 */}
      <div className="flex-1 lg:ml-[220px] flex flex-col min-h-0 relative z-10">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
