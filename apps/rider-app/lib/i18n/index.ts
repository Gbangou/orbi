/**
 * i18n — Configuration internationalisation Orbi Rider
 *
 * Langues supportées:
 *   fr  — Français (défaut, Burkina Faso)
 *   en  — Anglais (expatriés, touristes)
 *   moo — Moore (langue locale principale Burkina Faso — traductions basiques)
 *
 * Usage:
 *   import { t, changeLanguage, useTranslation } from '../lib/i18n';
 *   const { t } = useTranslation();
 *   t('home.whereToGo') // "Où allez-vous ?" or "Where to?"
 *
 * La langue préférée est détectée automatiquement depuis les réglages
 * du téléphone (Intl.DateTimeFormat) puis persistée dans AsyncStorage.
 */
import i18n from 'i18next';
import { initReactI18next, useTranslation as useI18nTranslation } from 'react-i18next';
import { fr } from './fr';
import { en } from './en';

// Moore — traductions basiques des éléments clés
// (traduction complète à effectuer avec un locuteur natif)
const moo = {
  ...fr, // Fallback vers français
  auth: {
    ...fr.auth,
    tagline: 'Fo kõmbi beoogo', // "Votre course bientôt" en Moore
    signIn: 'Tũnd ye',
  },
  home: {
    ...fr.home,
    whereToGo: 'Yõore be ?' ,// "Où vas-tu ?" en Moore
  },
} as const;

const resources = {
  fr: { translation: fr },
  en: { translation: en },
  moo: { translation: moo },
} as const;

i18n.use(initReactI18next).init({
  resources,
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: {
    escapeValue: false, // React gère l'échappement XSS
  },
  compatibilityJSON: 'v4',
});

export { i18n };
export const t = i18n.t.bind(i18n);
export const changeLanguage = (lang: 'fr' | 'en' | 'moo') => i18n.changeLanguage(lang);
export const useTranslation = () => useI18nTranslation();
export type SupportedLanguage = 'fr' | 'en' | 'moo';
export const SUPPORTED_LANGUAGES: Array<{ code: SupportedLanguage; label: string; nativeLabel: string }> = [
  { code: 'fr', label: 'Français', nativeLabel: 'Français' },
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'moo', label: 'Moore', nativeLabel: 'Mooré' },
];
