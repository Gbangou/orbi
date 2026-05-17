import React from 'react';

import { cleanupRenderers } from './test-utils';

let pathname = '/';

const router = {
  replace: jest.fn(),
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock(
  'react-native',
  () => ({
    ScrollView: 'ScrollView',
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    TextInput: 'TextInput',
    StyleSheet: {
      create: <T,>(styles: T) => styles,
    },
    Alert: {
      alert: jest.fn(),
    },
    Platform: {
      OS: 'test',
      select: <T,>(values: { test?: T; default?: T }) => values.test ?? values.default,
    },
  }),
  { virtual: true },
);

jest.mock(
  'expo-router',
  () => {
    const link = ({ children }: { children: React.ReactElement }) =>
      React.Children.only(children);

    const stack = Object.assign(
      (props: unknown) => React.createElement('Stack', props as object),
      {
        Screen: (props: unknown) => React.createElement('StackScreen', props as object),
      },
    );

    return {
      Link: link,
      Stack: stack,
      router,
      useRouter: () => router,
      usePathname: () => pathname,
      __setPathname: (nextPathname: string) => {
        pathname = nextPathname;
      },
    };
  },
  { virtual: true },
);

jest.mock(
  'expo-status-bar',
  () => ({
    StatusBar: 'StatusBar',
  }),
  { virtual: true },
);

beforeEach(() => {
  pathname = '/';
  router.replace.mockReset();
  router.push.mockReset();
  router.back.mockReset();
});

afterEach(async () => {
  await cleanupRenderers();
});
