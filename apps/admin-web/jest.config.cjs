const path = require('path');

module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  clearMocks: true,
  moduleDirectories: ['node_modules', path.resolve(__dirname, 'node_modules')],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testMatch: ['<rootDir>/test/**/*.test.ts?(x)'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        tsconfig: path.resolve(__dirname, 'tsconfig.spec.json'),
        diagnostics: false,
      },
    ],
  },
};
