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
    moduleNameMapper: {
      '\\.(png|jpg|jpeg|gif|webp)$': path.resolve(__dirname, 'file-mock.cjs'),
      '^@orbi/ui/native$': path.resolve(
        __dirname,
        '../../../packages/ui/src/native.ts',
      ),
      '^@orbi/ui$': path.resolve(__dirname, '../../../packages/ui/src/index.ts'),
      '^@orbi/api$': path.resolve(__dirname, '../../../packages/api/src/index.ts'),
      '^@orbi/config$': path.resolve(
        __dirname,
        '../../../packages/config/src/index.ts',
      ),
      '^@orbi/domain$': path.resolve(
        __dirname,
        '../../../packages/domain/src/index.ts',
      ),
      // Resolve .js imports to .ts files — needed since packages/api uses ESM-style imports
      '^(\\.{1,2}/.*)\\.js$': '$1',
    },
  };
}

module.exports = {
  createMobileJestConfig,
};
