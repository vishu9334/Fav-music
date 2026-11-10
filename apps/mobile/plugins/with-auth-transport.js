const { withMainApplication, withDangerousMod, withAndroidManifest } = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

function applyMainApplication(contents) {
  if (contents.includes('import com.favmusic.auth.AadatAuthPackage')) return contents;
  if (!/PackageList\(this\)\.packages/.test(contents) || !/^package [\w.]+/m.test(contents)) throw new Error('Auth transport requires the reviewed Expo Kotlin MainApplication template.');
  return contents.replace(/^(package [\w.]+[^\n]*\n)/m, '$1\nimport com.favmusic.auth.AadatAuthPackage\n')
    .replace(/PackageList\(this\)\.packages/, 'PackageList(this).packages.also { it.add(AadatAuthPackage()) }');
}
function applyShareManifest(manifest) {
  const activity=manifest.application?.[0]?.activity?.find(a=>a.$?.['android:name']==='.MainActivity');
  if(!activity)throw new Error('Reviewed MainActivity is required for share intents.');
  const filters=activity['intent-filter']??=[];
  if(!filters.some(f=>f.action?.some(a=>a.$?.['android:name']==='android.intent.action.SEND')))filters.push({action:[{$:{'android:name':'android.intent.action.SEND'}}],category:[{$:{'android:name':'android.intent.category.DEFAULT'}}],data:[{$:{'android:mimeType':'text/plain'}}]});
  return manifest;
}
function withAuthTransport(config) {
  config=withAndroidManifest(config,mod=>{applyShareManifest(mod.modResults.manifest);return mod;});
  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('Auth transport requires a Kotlin MainApplication.');
    mod.modResults.contents = applyMainApplication(mod.modResults.contents); return mod;
  });
  return withDangerousMod(config, ['android', async (mod) => {
    const target = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/favmusic/auth');
    await fs.mkdir(target, { recursive: true });
    for (const file of ['AuthHttpClient.java', 'AadatAuthModule.java', 'AadatAuthPackage.java', 'AadatShareModule.java', 'AadatMediaModule.java']) await fs.copyFile(path.join(__dirname, 'auth-transport', file), path.join(target, file));
    return mod;
  }]);
}
module.exports = withAuthTransport;
module.exports.applyMainApplication = applyMainApplication;

module.exports.applyShareManifest=applyShareManifest;
