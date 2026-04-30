const path = require('path');

function createMobileJestConfig(rootDir) {
  return {
    rootDir,
    testEnvironment: 'node',
    clearMocks: true,
    moduleDirectories: ['node_modules', path.resolve(rootDir, 'node_modules')],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    testMatch: ['<rootDir>/test/**/*.test.ts?(x)'],
    setupFilesAfterEnv: [path.resolve(__dirname, 'setup.ts')],
    transform: {
      '^.+\\.(t|j)sx?$': [
        'ts-jest',
        {
          tsconfig: path.resolve(rootDir, 'tsconfig.spec.json'),
          diagnostics: false,
        },
      ],
    },
    transformIgnorePatterns: [
      '/node_modules/(?!(react|react-test-renderer)/)',
    ],
  };
}

module.exports = {
  createMobileJestConfig,
};
