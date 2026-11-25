const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

// Claude Code keeps each background session's worktree, a full copy of the
// repository with its dependencies, under .claude/. Watching those copies
// multiplied the file map and ran the dev server out of memory, so Metro
// neither crawls nor resolves anything there. On Windows the crawler hands the
// pattern backslashes but the file watcher forward slashes, so it takes either.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const separator = '[\\\\/]';
const claudeFolder = path.join(workspaceRoot, '.claude').split(path.sep).map(escapeRegExp).join(separator);
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : defaultBlockList ? [defaultBlockList] : []),
  new RegExp(`^${claudeFolder}(?:${separator}.*)?$`),
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
