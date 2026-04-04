import { en } from './locales/en';
import { zhCN } from './locales/zh-CN';

export const locales = {
  en,
  'zh-CN': zhCN,
};

export const defaultLocale = 'zh-CN';

export const localeOptions = Object.values(locales).map((item) => ({
  code: item.code,
  label: item.label,
}));

// Community locales can be added by registering them here.
