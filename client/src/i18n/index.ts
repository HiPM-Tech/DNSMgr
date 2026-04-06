import en from './locales/en.json';
import es from './locales/es.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh-CN.json';
import zhCNMesugaki from './locales/zh-CN-Mesugaki.json';
import type { LocaleDefinition } from './types';

export const locales: Record<string, LocaleDefinition> = {
  en: { code: 'en', label: 'English', messages: en.messages },
  es: { code: 'es', label: 'Español', messages: es.messages },
  ja: { code: 'ja', label: '日本語', messages: ja.messages },
  'zh-CN': { code: 'zh-CN', label: '简体中文', messages: zhCN.messages },
  'zh-CN-Mesugaki': { code: 'zh-CN-Mesugaki', label: '简体中文-雌小鬼版', messages: zhCNMesugaki.messages },
};

export const defaultLocale = 'zh-CN';

export const localeOptions: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-CN-Mesugaki', label: '简体中文-雌小鬼版' },
];