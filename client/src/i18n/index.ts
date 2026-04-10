import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ko from './locales/ko.json';
import ru from './locales/ru.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh-CN.json';
import zhCNMesugaki from './locales/zh-CN-Mesugaki.json';
import type { LocaleDefinition } from './types';

export const locales: Record<string, LocaleDefinition> = {
  en: { code: 'en', label: 'English', messages: en.messages },
  es: { code: 'es', label: 'Español', messages: es.messages },
  fr: { code: 'fr', label: 'Français', messages: fr.messages },
  de: { code: 'de', label: 'Deutsch', messages: de.messages },
  ko: { code: 'ko', label: '한국어', messages: ko.messages },
  ru: { code: 'ru', label: 'Русский', messages: ru.messages },
  pt: { code: 'pt', label: 'Português', messages: pt.messages },
  ar: { code: 'ar', label: 'العربية', messages: ar.messages },
  ja: { code: 'ja', label: '日本語', messages: ja.messages },
  'zh-CN': { code: 'zh-CN', label: '简体中文', messages: zhCN.messages },
  'zh-CN-Mesugaki': { code: 'zh-CN-Mesugaki', label: '简体中文-雌小鬼版', messages: zhCNMesugaki.messages },
};

export const defaultLocale = 'zh-CN';

export const localeOptions: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ko', label: '한국어' },
  { code: 'ru', label: 'Русский' },
  { code: 'pt', label: 'Português' },
  { code: 'ar', label: 'العربية' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-CN-Mesugaki', label: '简体中文-雌小鬼版' },
];