import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SessionStorageAdapter } from '@orbi/api';

export const driverSessionStorageKey = 'orbi.driver.session-token';

function getWebSessionStorage() {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return null;
  }

  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

async function getWebItem(key: string) {
  const storage = getWebSessionStorage();

  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

async function setWebItem(key: string, value: string) {
  const storage = getWebSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, value);
  } catch {
    return;
  }
}

async function removeWebItem(key: string) {
  const storage = getWebSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(key);
  } catch {
    return;
  }
}

export const driverSessionStorage: SessionStorageAdapter = {
  async getItem(key) {
    if (Platform.OS === 'web') return getWebItem(key);
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    if (Platform.OS === 'web') return setWebItem(key, value);
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Session non persistée — l'utilisateur devra se reconnecter
    }
  },
  async removeItem(key) {
    if (Platform.OS === 'web') return removeWebItem(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore — la session sera expirée côté serveur de toute façon
    }
  },
};
