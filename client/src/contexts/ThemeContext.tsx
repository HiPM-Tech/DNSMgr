import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'auto';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
  resolvedTheme: ResolvedTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'theme';
const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

function getStoredTheme(): Theme {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto';
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(THEME_MEDIA_QUERY).matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'auto' ? getSystemTheme() : theme;
}

function syncThemeTarget(element: HTMLElement, theme: Theme, resolvedTheme: ResolvedTheme) {
  element.classList.toggle('dark', resolvedTheme === 'dark');
  element.classList.toggle('light', resolvedTheme === 'light');
  element.style.colorScheme = resolvedTheme;
  element.setAttribute('theme-mode', resolvedTheme);
  element.dataset.theme = theme;
  element.dataset.resolvedTheme = resolvedTheme;
}

function applyTheme(theme: Theme): ResolvedTheme {
  const resolvedTheme = resolveTheme(theme);

  syncThemeTarget(document.documentElement, theme, resolvedTheme);
  if (document.body) {
    syncThemeTarget(document.body, theme, resolvedTheme);
  }

  return resolvedTheme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => applyTheme(getStoredTheme()));
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    const mediaQuery = window.matchMedia(THEME_MEDIA_QUERY);
    const handleSystemThemeChange = () => {
      setResolvedTheme(applyTheme(theme));
    };

    handleSystemThemeChange();

    if (theme !== 'auto') return undefined;

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
    }

    mediaQuery.addListener(handleSystemThemeChange);
    return () => mediaQuery.removeListener(handleSystemThemeChange);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    setResolvedTheme(applyTheme(newTheme));
  }, []);

  const value = useMemo<ThemeContextType>(
    () => ({ theme, setTheme, isDark, resolvedTheme }),
    [theme, setTheme, isDark, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
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
