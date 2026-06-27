import React from "react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { cleanupRenderers } from "./test-utils";

// Initialise i18n in French for smoke tests so t('auth.signIn') → 'Se connecter'
if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: 'fr',
    fallbackLng: 'fr',
    resources: {
      fr: {
        translation: {
          auth: {
            signIn: 'Se connecter',
            signUp: 'Créer un compte',
            createAccount: 'Créer mon compte',
            tabSignIn: 'Connexion',
            tabSignUp: 'Inscription',
            signOut: 'Se déconnecter',
            email: 'Adresse email',
            password: 'Mot de passe',
            fullName: 'Nom complet',
            emailPlaceholder: 'exemple@gmail.com',
            passwordPlaceholder: '••••••••',
            namePlaceholder: 'Ex : Aminata Traoré',
            passwordHint: 'Min. 8 car. · Maj · Chiffre · Symbole',
            demoAccess: 'Accès démo',
            demoSignIn: 'Connexion compte de démonstration',
            riderTagline: 'Votre course en quelques secondes',
            driverTagline: 'Rejoignez la flotte Orbi',
            tagline: 'Votre course en quelques secondes',
            invalidCredentials: 'Identifiants incorrects. Réessayez.',
          },
          common: {
            loading: 'Chargement…',
            cancel: 'Annuler',
            confirm: 'Confirmer',
          },
          booking: {
            title: 'Réserver',
            confirm: 'Confirmer · {{fare}}',
            confirmLoading: 'Confirmation en cours…',
            noServiceSelected: 'Sélectionner un service',
            activeFlow: "Voir l'activité en cours",
            addPromo: 'Ajouter',
            savedPlaces: 'Lieux enregistrés',
          },
          home: {
            whereToGo: 'Où allez-vous ?',
            liveMap: 'Carte live',
          },
          activity: {
            pendingRequests: 'Demandes en cours',
            recentTrips: 'Courses récentes',
            completed: 'Terminé',
            cancelled: 'Annulé',
          },
          account: {
            title: 'Mon compte',
            signOut: 'Se déconnecter',
            wallet: 'Wallet Orbi',
            walletTopUp: '+ Recharger',
          },
          driver: {
            cockpit: 'Cockpit',
            missions: 'Missions',
            earnings: 'Revenus',
            profile: 'Profil',
            online: 'En ligne',
            offline: 'Hors ligne',
            goOnline: 'Passer en ligne',
            goOffline: 'Passer hors ligne',
            toggling: '...',
            todayEarnings: "Aujourd'hui",
            activeTrip: 'Course active',
            navigateToPickup: '🗺 Naviguer vers la prise en charge',
            acceptanceRate: '{{rate}}% acceptées',
            fatigueWarning: 'Signal de fatigue — pause recommandée',
            fatigueBlocked: 'Pause obligatoire — reprise après {{time}}',
            vehicleSetup: 'Configurer un véhicule →',
            waitingForOffers: 'En attente — Ouagadougou',
            offersAvailable: '{{count}} offre — Ouagadougou',
            offersAvailable_plural: '{{count}} offres — Ouagadougou',
            viewOffers: 'Voir',
            refresh: 'Actualiser le direct',
            refreshing: 'Actualisation...',
            weeklyChart: 'Gains — 7 derniers jours',
            payoutControl: 'Contrôle payout',
            dailyObjectives: '⚡ Objectifs du jour',
            earningsWeek: 'Semaine',
            earningsMonth: 'Mois',
            earningsAverage: 'Moyenne',
            earningsPerTrip: 'par course',
            recentTrips: 'Courses récentes',
            vehicle: 'Véhicule principal',
            documents: 'Justificatifs requis',
            noOffers: 'Aucune offre pour le moment',
            noOffersHint: 'Restez en ligne pour recevoir des demandes.',
          },
        },
      },
    },
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v4',
  });
}

let pathname = "/";

const router = {
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock(
  "react-native",
  () => {
    class AnimatedValue {
      private _value: number;
      constructor(value: number) { this._value = value; }

      interpolate() { return this._value; }
      setValue(v: number) { this._value = v; }
      addListener() { return { remove: jest.fn() }; }
      removeListener() {}
      removeAllListeners() {}
      stopAnimation() {}
      resetAnimation() {}
    }

    const animation = {
      start: jest.fn(),
      stop: jest.fn(),
    };

    return {
      Animated: {
        View: "AnimatedView",
        Value: AnimatedValue,
        loop: jest.fn(() => animation),
        sequence: jest.fn(() => animation),
        timing: jest.fn(() => animation),
        spring: jest.fn(() => animation),
        parallel: jest.fn(() => animation),
        decay: jest.fn(() => animation),
        delay: jest.fn(() => animation),
      },
      Easing: {
        inOut: jest.fn((value) => value),
        quad: jest.fn((value) => value),
      },
      ScrollView: "ScrollView",
      SafeAreaView: "SafeAreaView",
      KeyboardAvoidingView: "KeyboardAvoidingView",
      ActivityIndicator: "ActivityIndicator",
      RefreshControl: "RefreshControl",
      View: "View",
      Text: "Text",
      Image: "Image",
      Pressable: "Pressable",
      TextInput: "TextInput",
      Dimensions: {
        get: jest.fn(() => ({ width: 390, height: 844, scale: 2, fontScale: 1 })),
      },
      StyleSheet: {
        create: <T>(styles: T) => styles,
      },
      Alert: {
        alert: jest.fn(),
      },
      Linking: {
        openURL: jest.fn(async () => undefined),
      },
      Share: {
        share: jest.fn(async () => ({ action: "sharedAction" })),
      },
      Platform: {
        OS: "test",
        select: <T>(values: { test?: T; default?: T }) =>
          values.test ?? values.default,
      },
      AppState: {
        currentState: 'active',
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        removeEventListener: jest.fn(),
      },
    };
  },
  { virtual: true },
);

jest.mock(
  "expo-router",
  () => {
    const link = ({ children }: { children: React.ReactElement }) =>
      React.Children.only(children);

    const stack = Object.assign(
      (props: unknown) => React.createElement("Stack", props as object),
      {
        Screen: (props: unknown) =>
          React.createElement("StackScreen", props as object),
      },
    );

    return {
      Link: link,
      Stack: stack,
      router,
      useRouter: () => router,
      usePathname: () => pathname,
      useLocalSearchParams: () => ({}),
      useGlobalSearchParams: () => ({}),
      useSegments: () => [],
      useRootNavigationState: () => ({ key: 'root', index: 0, routes: [] }),
      __setPathname: (nextPathname: string) => {
        pathname = nextPathname;
      },
    };
  },
  { virtual: true },
);

jest.mock(
  "expo-status-bar",
  () => ({
    StatusBar: "StatusBar",
  }),
  { virtual: true },
);

jest.mock(
  "expo-av",
  () => ({
    Audio: {
      requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
      setAudioModeAsync: jest.fn(async () => undefined),
      Recording: {
        createAsync: jest.fn(async () => ({
          recording: {
            stopAndUnloadAsync: jest.fn(async () => undefined),
            getStatusAsync: jest.fn(async () => ({ durationMillis: 2000 })),
          },
        })),
        OptionsPresets: { HIGH_QUALITY: {} },
      },
      RecordingOptionsPresets: { HIGH_QUALITY: {} },
    },
  }),
  { virtual: true },
);

jest.mock(
  "expo-haptics",
  () => ({
    impactAsync: jest.fn(async () => undefined),
    notificationAsync: jest.fn(async () => undefined),
    selectionAsync: jest.fn(async () => undefined),
    ImpactFeedbackStyle: { Light: "Light", Medium: "Medium", Heavy: "Heavy" },
    NotificationFeedbackType: { Success: "Success", Warning: "Warning", Error: "Error" },
  }),
  { virtual: true },
);

jest.mock(
  "expo-screen-capture",
  () => ({
    preventScreenCaptureAsync: jest.fn(async () => undefined),
    allowScreenCaptureAsync: jest.fn(async () => undefined),
  }),
  { virtual: true },
);

jest.mock(
  "react-native-webview",
  () => ({
    WebView: "WebView",
  }),
  { virtual: true },
);

beforeEach(() => {
  pathname = "/";
  router.replace.mockReset();
  router.push.mockReset();
  router.back.mockReset();
});

afterEach(async () => {
  await cleanupRenderers();
});
