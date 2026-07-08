const path = require('path');
const fs = require('fs');
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

// Resolve the real (non-junction) absolute path — fs.realpathSync follows Windows junctions
function resolveRealDir(modulePkgPath, searchPaths) {
  try {
    const resolved = require.resolve(modulePkgPath, { paths: searchPaths });
    return path.dirname(fs.realpathSync(resolved));
  } catch {
    return null;
  }
}

const expoRouterDir = resolveRealDir('expo-router/package.json', [projectRoot, workspaceRoot]);
const workspaceSourceModules = new Map([
  ['@orbi/domain', path.resolve(workspaceRoot, 'packages/domain/src/index.ts')],
  ['@orbi/ui', path.resolve(workspaceRoot, 'packages/ui/src/index.ts')],
  ['@orbi/ui/native', path.resolve(workspaceRoot, 'packages/ui/src/native.ts')],
]);

config.watchFolders = Array.from(
  new Set([...(config.watchFolders ?? []), workspaceRoot]),
);

// pnpm uses junctions/symlinks on Windows — needed for local Gradle builds
config.resolver.unstable_enableSymlinks = true;
config.resolver.nodeModulesPaths = [
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules'),
];

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
  // Point directly to the pnpm store path so Metro never computes a junction-relative path
  ...(expoRouterDir ? { 'expo-router': expoRouterDir } : {}),
};

config.resolver.blockList =
  /(packages[\\/]ui[\\/]node_modules[\\/](react|react-dom)|apps[\\/]admin-web[\\/]\.next|[\\/]artifacts|[\\/]\.tmp|[\\/]\.chrome-(cdp|headless))([\\/].*)?$/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const forcedReactPath = reactResolutions.get(moduleName);
  const workspaceSourcePath = workspaceSourceModules.get(moduleName);

  if (forcedReactPath) {
    return {
      type: 'sourceFile',
      filePath: forcedReactPath,
    };
  }

  if (workspaceSourcePath) {
    return {
      type: 'sourceFile',
      filePath: workspaceSourcePath,
    };
  }

  // Fix for pnpm junction-relative paths on Windows: Metro computes a path like
  // ./../../node_modules/.pnpm/expo-router@.../entry.js relative to the app root,
  // but may resolve it from the workspace root — going above the workspace. Intercept
  // and re-anchor to the correct app root so the file is actually found.
  const normalizedName = moduleName.replace(/\\/g, '/');
  if (
    (normalizedName.startsWith('./') || normalizedName.startsWith('../')) &&
    normalizedName.includes('node_modules/.pnpm')
  ) {
    const resolvedFromApp = path.resolve(projectRoot, moduleName);
    if (fs.existsSync(resolvedFromApp)) {
      return { type: 'sourceFile', filePath: resolvedFromApp };
    }
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
