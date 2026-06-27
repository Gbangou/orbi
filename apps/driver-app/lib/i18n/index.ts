import i18n from 'i18next';
import { initReactI18next, useTranslation as useI18nTranslation } from 'react-i18next';
import { fr } from './fr';
import { en } from './en';

const moo = {
  ...fr,
  auth: { ...fr.auth, tagline: 'Fo kõmbi beoogo' },
  driver: { ...fr.driver, goOnline: 'Tũnd ye' },
} as const;

const resources = {
  fr: { translation: fr },
  en: { translation: en },
  moo: { translation: moo },
} as const;

let initialised = false;

export function initDriverI18n() {
  if (initialised) return;
  initialised = true;

  void i18n.use(initReactI18next).init({
    resources,
    lng: 'fr',
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });
}

export { i18n };
export const t = i18n.t.bind(i18n);
export const useTranslation = () => useI18nTranslation();
export type SupportedLanguage = 'fr' | 'en' | 'moo';
