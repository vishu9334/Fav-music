const path = require('path');
const mobilePkg = require('./apps/mobile/package.json');

const dependencies = {};
for (const name of Object.keys(mobilePkg.dependencies)) {
  try {
    const pkgPath = require.resolve(`${name}/package.json`, {
      paths: [path.resolve(__dirname, 'apps/mobile'), __dirname],
    });
    dependencies[name] = {
      root: path.dirname(pkgPath),
    };
  } catch {
    // Skip workspace packages or packages without separate package.json
  }
}

module.exports = {
  project: {
    android: {
      sourceDir: './apps/mobile/android',
      appName: 'app',
      packageName: 'com.favmusic',
    },
  },
  dependencies,
};
