import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SessionStorageAdapter } from '@mobilis/api';

export const driverSessionStorageKey = 'mobilis.driver.session-token';

async function getWebItem(key: string) {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  return localStorage.getItem(key);
}

async function setWebItem(key: string, value: string) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(key, value);
}

async function removeWebItem(key: string) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.removeItem(key);
}

export const driverSessionStorage: SessionStorageAdapter = {
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
