import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const config = [
  ...compat.extends('next/core-web-vitals'),
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];

export default config;
