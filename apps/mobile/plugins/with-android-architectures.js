const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Aadat: honor requested ABIs with the React Native legacy architecture.';
function applyArchitectures(contents) {
  if (contents.includes(marker)) return contents;
  return contents + `
${marker}
android.defaultConfig.ndk {
    abiFilters.clear()
    abiFilters.addAll((findProperty('reactNativeArchitectures') ?: 'armeabi-v7a,arm64-v8a,x86,x86_64').split(',').collect { it.trim() })
}
`;
}

module.exports = config => withAppBuildGradle(config, mod => {
  if (mod.modResults.language !== 'groovy') throw new Error('Android ABI filtering requires the Expo Groovy build file.');
  mod.modResults.contents = applyArchitectures(mod.modResults.contents);
  return mod;
});
module.exports.applyArchitectures = applyArchitectures;
