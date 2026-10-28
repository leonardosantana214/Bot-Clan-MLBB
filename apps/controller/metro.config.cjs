// Metro loads this configuration as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.unstable_enablePackageExports = true;
// Optional read-only dependency tree for restricted/offline worktree environments.
if (process.env.AEROBOT_METRO_DEPENDENCY_ROOT) config.watchFolders = [...(config.watchFolders ?? []), process.env.AEROBOT_METRO_DEPENDENCY_ROOT];
module.exports = config;
