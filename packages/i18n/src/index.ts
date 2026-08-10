import i18n from 'i18next';
import { initReactI18next, useTranslation as useI18nTranslation } from 'react-i18next';
import { fr } from './locales/fr';
import { en } from './locales/en';

export type { fr as FrTranslations };
export type { en as EnTranslations };

// Mooré — essential terms with French fallback for the rest
const moo = {
  ...fr,
  auth: { ...fr.auth, riderTagline: 'Fo kõmbi beoogo', signIn: 'Tũnd ye' },
  home: { ...fr.home, whereToGo: 'Yõore be ?' },
  driver: { ...fr.driver },
} as const;

export type SupportedLanguage = 'fr' | 'en' | 'moo';

export const SUPPORTED_LANGUAGES: Array<{
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
}> = [
  { code: 'fr', label: 'Français', nativeLabel: 'Français' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'moo', label: 'Moore', nativeLabel: 'Mooré' },
];

const resources = {
  fr: { translation: fr },
  en: { translation: en },
  moo: { translation: moo },
} as const;

// Lazily initialise once — safe to call multiple times
let initialised = false;

export function initI18n(defaultLng: SupportedLanguage = 'fr') {
  if (initialised) return;
  initialised = true;

  void i18n.use(initReactI18next).init({
    resources,
    lng: defaultLng,
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });
}

export { i18n };
export const t = i18n.t.bind(i18n);
export const changeLanguage = (lang: SupportedLanguage) =>
  i18n.changeLanguage(lang);
export const useTranslation = () => useI18nTranslation();

export {
  formatOrbiDate,
  formatOrbiDateTime,
  formatOrbiFcfa,
  formatOrbiPlural,
  formatOrbiStatusLabel,
  formatOrbiTime,
  isDeveloperFacingContent,
  sanitizeVisibleContent,
  translateOrbiVisibleError,
  type OrbiVisibleError,
  type OrbiVisibleErrorAction,
  type OrbiVisibleErrorInput,
  type OrbiVisibleErrorSeverity,
} from './content';
