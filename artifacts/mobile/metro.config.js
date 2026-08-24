const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude pnpm's temporary side-effects directories from the file watcher.
// These _tmp_* dirs are created during install and may not exist afterwards,
// which causes Metro's FallbackWatcher to crash with ENOENT.
config.resolver.blockList = [
  /node_modules\/.pnpm\/.*_tmp_[^/]+\//,
];

module.exports = config;
