// Learn more https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so edits in packages/shared trigger a reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then from the hoisted root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Do not walk up past the workspace root looking for node_modules.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
