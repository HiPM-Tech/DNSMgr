import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function applyTheme(theme: Theme): boolean {
  const shouldBeDark =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (shouldBeDark) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
  }
  return shouldBeDark;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // 惰性初始化：直接从 localStorage 读，避免两个 useEffect 的竞态
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme') as Theme | null;
    return saved ?? 'auto';
  });

  const [isDark, setIsDark] = useState(() => applyTheme(
    (localStorage.getItem('theme') as Theme | null) ?? 'auto'
  ));

  // 监听系统主题变化（仅 auto 模式下有意义）
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      setIsDark(applyTheme(theme));
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    setIsDark(applyTheme(newTheme));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
