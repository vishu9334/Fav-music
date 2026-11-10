const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const mobileRoot = path.resolve(projectRoot, 'apps/mobile');

// Configure Metro from mobile app root to ensure canonical React Native / Expo paths
const config = getDefaultConfig(mobileRoot);
const { MobilePublicEnvironment } = require('./config/mobile-public-environment.cjs');
config.cacheVersion = new MobilePublicEnvironment().cacheVersion(config.cacheVersion, process.env);

// Ensure the entire monorepo is watched
config.watchFolders = [projectRoot, mobileRoot];

// 1. Prevent Metro from traversing parent/nested node_modules hierarchically
config.resolver.disableHierarchicalLookup = true;

// 2. Ensure mobile node_modules is checked first, then root
config.resolver.nodeModulesPaths = [
  path.resolve(mobileRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules'),
];

// 3. Enforce single canonical instance for core runtime packages in pnpm monorepo
const singletons = [
  'react',
  'react-native',
  'react-dom',
  'expo',
  'expo-modules-core',
  'expo-router',
  'react-native-track-player',
  'react-native-reanimated',
  'react-native-screens',
  'react-native-gesture-handler',
  'react-native-safe-area-context',
  'react-native-svg',
];

config.resolver.extraNodeModules = singletons.reduce((acc, name) => {
  acc[name] = path.resolve(mobileRoot, 'node_modules', name);
  return acc;
}, {});

// 4. Force resolution of singleton packages to apps/mobile canonical path
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const pkgName = moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];

  if (singletons.includes(pkgName)) {
    const newContext = {
      ...context,
      originModulePath: path.resolve(mobileRoot, 'package.json'),
    };
    return (originalResolveRequest || context.resolveRequest)(newContext, moduleName, platform);
  }
  return (originalResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

// 5. Ensure InitializeCore is resolved from canonical mobile react-native
config.serializer.getModulesRunBeforeMainModule = () => [
  require.resolve('react-native/Libraries/Core/InitializeCore', { paths: [mobileRoot] }),
];

module.exports = config;
