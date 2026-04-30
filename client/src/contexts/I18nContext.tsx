import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { defaultLocale, locales } from '../i18n';
import type { TranslationTree } from '../i18n/types';

// 临时调试：检查 locales 对象
console.log('[I18nContext] Available locales:', Object.keys(locales));
console.log('[I18nContext] zh-CN exists:', 'zh-CN' in locales);
if (locales['zh-CN']) {
  console.log('[I18nContext] zh-CN messages keys:', Object.keys(locales['zh-CN'].messages).slice(0, 10));
  console.log('[I18nContext] domainRenewal in zh-CN:', 'domainRenewal' in locales['zh-CN'].messages);
  if (locales['zh-CN'].messages.domainRenewal) {
    console.log('[I18nContext] domainRenewal.title:', (locales['zh-CN'].messages.domainRenewal as any).title);
  }
}

const STORAGE_KEY = 'locale';

interface I18nContextValue {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveMessage(key: string, locale: string): string | undefined {
  const segments = key.split('.');
  let current: string | TranslationTree | undefined = locales[locale as keyof typeof locales]?.messages;

  for (const segment of segments) {
    if (!current || typeof current === 'string') return undefined;
    current = current[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, token) => String(params[token] ?? `{${token}}`));
}

function getInitialLocale() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored in locales) return stored;

  const browserLocale = navigator.language.toLowerCase();
  const localeKeys = Object.keys(locales);
  const exactMatch = localeKeys.find((key) => key.toLowerCase() === browserLocale);
  if (exactMatch) return exactMatch;

  const baseLanguage = browserLocale.split('-')[0];
  const baseMatch = localeKeys.find((key) => key.toLowerCase() === baseLanguage);
  if (baseMatch) return baseMatch;

  const prefixMatch = localeKeys.find((key) => key.toLowerCase().startsWith(`${baseLanguage}-`));
  if (prefixMatch) return prefixMatch;

  if (browserLocale.startsWith('zh')) return 'zh-CN';
  return defaultLocale;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(getInitialLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (nextLocale: string) => {
      if (nextLocale in locales) setLocaleState(nextLocale);
    },
    t: (key: string, params?: Record<string, string | number>) => {
      const text = resolveMessage(key, locale)
        ?? resolveMessage(key, 'en')
        ?? key;
      return interpolate(text, params);
    },
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
