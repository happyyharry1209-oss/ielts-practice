import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import zhTW from '../locales/zh-TW.json';

export type Language = 'en' | 'zh-TW';

const STORAGE_KEY = 'ielts.lang';

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh-TW') return stored;
  } catch {
    /* ignore */
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh-TW' : 'en';
}

const language = initialLanguage();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-TW': { translation: zhTW },
  },
  lng: language,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

document.documentElement.lang = language;

export function setLanguage(next: Language): void {
  void i18n.changeLanguage(next);
  document.documentElement.lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

export default i18n;
