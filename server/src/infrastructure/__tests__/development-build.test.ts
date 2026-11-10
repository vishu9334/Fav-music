import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
const require=createRequire(import.meta.url);const {DevelopmentPlaybackBuildConfig}=require('../../../../config/development-playback.cjs');
const config={android:{package:'com.favmusic'},extra:{eas:{projectId:'preserved'}}};
const env={EAS_BUILD_PROFILE:'preview-real-songs',EXPO_PUBLIC_APP_MODE:'development-playback-verification',EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENABLED:'true',EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENDPOINT:'https://api.example.test/development/catalog/graphql',EXPO_PUBLIC_GRAPHQL_ENDPOINT:'https://api.example.test/graphql',EXPO_PUBLIC_AUTH_ENABLED:'false',EXPO_PUBLIC_CATALOG_ENABLED:'false',EXPO_PUBLIC_ACCOUNT_PERSISTENCE_ENABLED:'false'};
describe('internal diagnostic build guard',()=>{
 it('leaves normal builds untouched and accepts only the exact internal profile',()=>{const c=new DevelopmentPlaybackBuildConfig();expect(c.apply(config,{})).toBe(config);expect(c.apply(config,env).extra).toMatchObject({eas:config.extra.eas,developmentPlaybackVerification:true});});
 it.each([{EAS_BUILD_PROFILE:'production'},{EAS_BUILD_PROFILE:'preview'},{EXPO_PUBLIC_AUTH_ENABLED:'true'},{EXPO_PUBLIC_CATALOG_ENABLED:'true'},{EXPO_PUBLIC_DEVELOPMENT_CATALOG_ENDPOINT:'http://api.example.test/development/catalog/graphql'},{EXPO_PUBLIC_DEVELOPMENT_CATALOG_KEY:'test-only'}])('rejects unsafe diagnostic publication: %j',patch=>{expect(()=>new DevelopmentPlaybackBuildConfig().apply(config,{...env,...patch})).toThrow();});
});
