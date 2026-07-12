import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { join } from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on mode (for future use)
  loadEnv(mode, process.cwd(), '');
  
  // Read frontend package.json version
  const packageJsonPath = join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const frontendVersion = packageJson.version || '1.0.0 Open';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(frontendVersion),
    },
    base: '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // 拆分第三方依赖，减小首屏 chunk 体积，提升加载与切换流畅度
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
              || /[\\/]node_modules[\\/]react-router-dom[\\/]/.test(id)) {
              return 'react-vendor';
            }
            if (id.includes('@tanstack/react-query')) return 'query-vendor';
            if (id.includes('tdesign-react') || id.includes('tdesign-icons-react')) return 'tdesign-vendor';
            if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n-vendor';
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  };
});
