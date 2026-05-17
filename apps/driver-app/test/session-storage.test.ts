/// <reference path="../../backend/node_modules/@types/jest/index.d.ts" />
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  driverSessionStorage,
  driverSessionStorageKey,
} from '../lib/session-storage';

jest.mock('expo-secure-store', () => ({
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

describe('driverSessionStorage', () => {
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

    await driverSessionStorage.setItem(driverSessionStorageKey, 'driver-token');
    await expect(
      driverSessionStorage.getItem(driverSessionStorageKey),
    ).resolves.toBe('driver-token');
    await driverSessionStorage.removeItem(driverSessionStorageKey);

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      driverSessionStorageKey,
      'driver-token',
    );
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      driverSessionStorageKey,
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
      driverSessionStorage.getItem(driverSessionStorageKey),
    ).resolves.toBeNull();
    await expect(
      driverSessionStorage.setItem(driverSessionStorageKey, 'driver-token'),
    ).resolves.toBeUndefined();
    await expect(
      driverSessionStorage.removeItem(driverSessionStorageKey),
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
      driverSessionStorage.getItem(driverSessionStorageKey),
    ).resolves.toBeNull();
    await expect(
      driverSessionStorage.setItem(driverSessionStorageKey, 'driver-token'),
    ).resolves.toBeUndefined();
    await expect(
      driverSessionStorage.removeItem(driverSessionStorageKey),
    ).resolves.toBeUndefined();
  });

  it('keeps native sessions in SecureStore', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });

    await driverSessionStorage.setItem(driverSessionStorageKey, 'driver-token');
    await driverSessionStorage.getItem(driverSessionStorageKey);
    await driverSessionStorage.removeItem(driverSessionStorageKey);

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      driverSessionStorageKey,
      'driver-token',
    );
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
      driverSessionStorageKey,
    );
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
      driverSessionStorageKey,
    );
  });
});
