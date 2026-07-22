import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  riderSessionStorage,
  riderSessionStorageKey,
} from '../lib/session-storage';

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem: jest.fn((key: string) => values.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe('riderSessionStorage', () => {
  const originalPlatform = Platform.OS;
  const originalSessionStorage = globalThis.sessionStorage;
  const originalLocalStorage = globalThis.localStorage;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('uses sessionStorage instead of persistent localStorage on web', async () => {
    const sessionStorage = createMemoryStorage();
    const localStorage = createMemoryStorage();

    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: sessionStorage,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorage,
    });

    await riderSessionStorage.setItem(riderSessionStorageKey, 'rider-token');
    await expect(
      riderSessionStorage.getItem(riderSessionStorageKey),
    ).resolves.toBe('rider-token');
    await riderSessionStorage.removeItem(riderSessionStorageKey);

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      riderSessionStorageKey,
      'rider-token',
    );
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      riderSessionStorageKey,
    );
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('does not fall back to localStorage when web sessionStorage is unavailable', async () => {
    const localStorage = createMemoryStorage();

    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorage,
    });

    await expect(
      riderSessionStorage.getItem(riderSessionStorageKey),
    ).resolves.toBeNull();
    await expect(
      riderSessionStorage.setItem(riderSessionStorageKey, 'rider-token'),
    ).resolves.toBeUndefined();
    await expect(
      riderSessionStorage.removeItem(riderSessionStorageKey),
    ).resolves.toBeUndefined();

    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('keeps blocked browser storage from crashing Expo web auth', async () => {
    const blockedStorage = {
      getItem: jest.fn(() => {
        throw new Error('session storage blocked');
      }),
      setItem: jest.fn(() => {
        throw new Error('session storage blocked');
      }),
      removeItem: jest.fn(() => {
        throw new Error('session storage blocked');
      }),
    };

    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: blockedStorage,
    });

    await expect(
      riderSessionStorage.getItem(riderSessionStorageKey),
    ).resolves.toBeNull();
    await expect(
      riderSessionStorage.setItem(riderSessionStorageKey, 'rider-token'),
    ).resolves.toBeUndefined();
    await expect(
      riderSessionStorage.removeItem(riderSessionStorageKey),
    ).resolves.toBeUndefined();
  });

  it('keeps native sessions in SecureStore', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });

    await riderSessionStorage.setItem(riderSessionStorageKey, 'rider-token');
    await riderSessionStorage.getItem(riderSessionStorageKey);
    await riderSessionStorage.removeItem(riderSessionStorageKey);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      riderSessionStorageKey,
      'rider-token',
      {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      },
    );
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
      riderSessionStorageKey,
      {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      },
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      riderSessionStorageKey,
    );
  });
});
