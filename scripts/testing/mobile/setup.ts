import React from "react";

import { cleanupRenderers } from "./test-utils";

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
      constructor(private readonly value: number) {}

      interpolate() {
        return this.value;
      }
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
      },
      Easing: {
        inOut: jest.fn((value) => value),
        quad: jest.fn((value) => value),
      },
      ScrollView: "ScrollView",
      KeyboardAvoidingView: "KeyboardAvoidingView",
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
