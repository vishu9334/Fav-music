import {describe,it,expect} from 'vitest';
import {incomingReel} from '../incoming-share';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {applyShareManifest}=require('../../../plugins/with-auth-transport.js') as {applyShareManifest:(manifest:Record<string,unknown>)=>unknown};
describe('Android text share review boundary',()=>{
 it('extracts one supported reel for review without opening or downloading it',()=>{expect(incomingReel('Listen to this https://www.instagram.com/reel/AbC_123/?igsh=abc')).toBe('https://www.instagram.com/reel/AbC_123/');});
 it('rejects arbitrary, ambiguous and oversized input',()=>{for(const text of [null,'file:///private/token','https://instagram.com.evil.example/reel/123','https://evil.example/?next=instagram.com','x'.repeat(4097),'https://instagram.com/reel/123 https://instagram.com/reel/456'])expect(incomingReel(text)).toBeNull();});
 it('adds one text-only intent filter without requesting media permissions',()=>{const manifest={application:[{activity:[{$:{'android:name':'.MainActivity'},'intent-filter':[]}]}]};applyShareManifest(manifest);applyShareManifest(manifest);const output=JSON.stringify(manifest);expect(output.match(/android.intent.action.SEND/g)).toHaveLength(1);expect(output).toContain('text/plain');expect(output).not.toContain('READ_MEDIA');});
});
