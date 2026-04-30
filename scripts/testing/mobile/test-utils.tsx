import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

const activeRenderers = new Set<TestRenderer.ReactTestRenderer>();

export async function flushMicrotasks() {
  await act(async () => {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      await Promise.resolve();
    }
  });
}

export async function renderScreen(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(element);
    for (let iteration = 0; iteration < 5; iteration += 1) {
      await Promise.resolve();
    }
  });

  activeRenderers.add(renderer);
  return renderer;
}

export function collectText(node: ReactTestInstance): string {
  return node.children
    .map((child) => {
      if (typeof child === 'string') {
        return child;
      }

      return collectText(child);
    })
    .join('');
}

export function getTexts(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAll((node) => node.type === 'Text')
    .map((node) => collectText(node))
    .filter(Boolean);
}

export function expectText(
  renderer: TestRenderer.ReactTestRenderer,
  expectedText: string,
) {
  expect(getTexts(renderer)).toContain(expectedText);
}

function nodeContainsText(node: ReactTestInstance, expectedText: string) {
  return collectText(node).includes(expectedText);
}

export async function pressByText(
  renderer: TestRenderer.ReactTestRenderer,
  expectedText: string,
) {
  const pressable = renderer.root.find(
    (node) => node.type === 'Pressable' && nodeContainsText(node, expectedText),
  );

  await act(async () => {
    pressable.props.onPress?.();
    for (let iteration = 0; iteration < 5; iteration += 1) {
      await Promise.resolve();
    }
  });
}

export async function invokeInAct(callback: () => void | Promise<void>) {
  await act(async () => {
    await callback();

    for (let iteration = 0; iteration < 5; iteration += 1) {
      await Promise.resolve();
    }
  });
}

export async function changeInputByPlaceholder(
  renderer: TestRenderer.ReactTestRenderer,
  placeholder: string,
  value: string,
) {
  const input = renderer.root.find(
    (node) => node.type === 'TextInput' && node.props.placeholder === placeholder,
  );

  await act(async () => {
    input.props.onChangeText?.(value);

    for (let iteration = 0; iteration < 5; iteration += 1) {
      await Promise.resolve();
    }
  });
}

export async function cleanupRenderers() {
  const renderers = Array.from(activeRenderers);
  activeRenderers.clear();

  for (const renderer of renderers) {
    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });
  }
}
