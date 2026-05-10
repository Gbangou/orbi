const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
const defaultResolveRequest = config.resolver.resolveRequest;
const reactResolutions = new Map([
  ['react', require.resolve('react', { paths: [projectRoot] })],
  [
    'react/jsx-runtime',
    require.resolve('react/jsx-runtime', { paths: [projectRoot] }),
  ],
  [
    'react/jsx-dev-runtime',
    require.resolve('react/jsx-dev-runtime', { paths: [projectRoot] }),
  ],
  ['react-dom', require.resolve('react-dom', { paths: [projectRoot] })],
  [
    'react-dom/client',
    require.resolve('react-dom/client', { paths: [projectRoot] }),
  ],
  [
    'react-dom/server',
    require.resolve('react-dom/server', { paths: [projectRoot] }),
  ],
]);

config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), workspaceRoot]),
);

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  react: path.resolve(projectRoot, 'node_modules/react'),
  'react/jsx-runtime': path.resolve(
    projectRoot,
    'node_modules/react/jsx-runtime.js',
  ),
  'react/jsx-dev-runtime': path.resolve(
    projectRoot,
    'node_modules/react/jsx-dev-runtime.js',
  ),
};

config.resolver.blockList =
  /(packages[\\/]ui[\\/]node_modules[\\/](react|react-dom)|apps[\\/]admin-web[\\/]\.next|[\\/]\.chrome-(cdp|headless))([\\/].*)?$/;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const forcedReactPath = reactResolutions.get(moduleName);

  if (forcedReactPath) {
    return {
      type: 'sourceFile',
      filePath: forcedReactPath,
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
