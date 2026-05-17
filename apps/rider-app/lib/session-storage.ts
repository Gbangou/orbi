import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SessionStorageAdapter } from '@orbi/api';

export const riderSessionStorageKey = 'orbi.rider.session-token';

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

export const riderSessionStorage: SessionStorageAdapter = {
  getItem(key) {
    if (Platform.OS === 'web') {
      return getWebItem(key);
    }

    return SecureStore.getItemAsync(key);
  },
  setItem(key, value) {
    if (Platform.OS === 'web') {
      return setWebItem(key, value);
    }

    return SecureStore.setItemAsync(key, value);
  },
  removeItem(key) {
    if (Platform.OS === 'web') {
      return removeWebItem(key);
    }

    return SecureStore.deleteItemAsync(key);
  },
};
