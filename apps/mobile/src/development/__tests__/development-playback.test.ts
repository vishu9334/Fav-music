import { readFile } from 'node:fs/promises';
import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import type { CatalogSong } from '@aadat/contracts';
import type { NativeMock } from '../../services/playback/__tests__/track-player.mock';
vi.mock('react-native-track-player',async()=>(await import('../../services/playback/__tests__/track-player.mock')).trackPlayerModule);
vi.mock('../../catalog/catalog-runtime',()=>({resolveCatalogTracks:vi.fn(async()=>{throw new Error('Protected account transport must not be used by diagnostics');})}));
const songs=JSON.parse(await readFile(new URL('../../catalog/__tests__/fixtures/bycom-captured-metadata.json',import.meta.url),'utf8')) as CatalogSong[];
let beforeAudio:(()=>Promise<void>)|undefined;
let native:NativeMock,controller:import('../development-playback.controller').DevelopmentPlaybackController;
beforeEach(async()=>{beforeAudio=undefined;vi.resetModules();native=(await import('react-native-track-player')).default as unknown as NativeMock;native.__reset();
 const {DevelopmentCatalogClient,DevelopmentPlaybackConfig}=await import('../development-catalog.client');const {DevelopmentPlaybackController}=await import('../development-playback.controller');
 const network=vi.fn(async(_url:string,options:RequestInit)=>{const body=JSON.parse(options.body as string);if(body.variables?.kind==='AUDIO')await beforeAudio?.();let data:unknown;
  if(body.query.includes('developmentCatalogAccess'))data={developmentCatalogAccess:{expiresAt:new Date(Date.now()+3600_000).toISOString(),expiresInSeconds:3600}};
  else if(body.query.includes('CatalogPage'))data={catalogPage:{nodes:songs.slice(0,3),hasNextPage:false,endCursor:null}};
  else data={catalogMedia:body.variables.ids.map((id:string)=>({trackId:id,kind:body.variables.kind,url:'https://media.example.invalid/test-only/'+id,issuedAt:new Date().toISOString(),expiresAt:null,expiresInSeconds:null,refreshAfterSeconds:120}))};
  return {ok:true,status:200,json:async()=>({data})};
 });controller=new DevelopmentPlaybackController(new DevelopmentCatalogClient(new DevelopmentPlaybackConfig('development-playback-verification','true','https://api.example.test/development/catalog/graphql','https://api.example.test/graphql'),network));
});
afterEach(async()=>{await controller.dispose();await(await import('../../services/playback/AudioPlaybackService')).AudioPlaybackService.getInstance().destroy();});
describe('diagnostic real-metadata flow with native contract mock, no account context',()=>{
 it('uses isolated catalog/leases and retains queue, controls and stop recovery',async()=>{
  await controller.unlock('k'.repeat(43));await controller.search('Believer');await controller.play(songs[0]!.id);
  expect((await native.getQueue()).map(x=>x.id)).toEqual(songs.slice(0,3).map(x=>x.id));
  const service=(await import('../../services/playback/AudioPlaybackService')).AudioPlaybackService.getInstance();
  await service.pause();await service.play();await service.skipToNext();await service.seekTo(40);expect(controller.snapshot()).toMatchObject({active:1,position:40});
  await(await import('../../services/playback/playback-service')).playbackService();await native.__emit('remote-stop');expect(await native.getQueue()).toHaveLength(3);await native.__emit('remote-play');expect(controller.snapshot().playback).toBe('PLAYING');
  await native.reset();await service.play();expect((await native.getQueue()).map(x=>x.id)).toEqual(songs.slice(0,3).map(x=>x.id));
 });
 it('does not autoplay after a newer pause while resolving sources',async()=>{
  await controller.unlock('k'.repeat(43));await controller.search('Believer');
  let release!:()=>void,entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
  beforeAudio=()=>{entered();return new Promise<void>(r=>{release=r;});};
  const pending=controller.play(songs[0]!.id);await started;
  const service=(await import('../../services/playback/AudioPlaybackService')).AudioPlaybackService.getInstance();
  const pause=service.pause();release();await Promise.all([pending,pause]);
  expect(native.play).not.toHaveBeenCalled();expect(controller.snapshot().busy).toBe(false);
 });
 it('artwork presentation and carousel selection preserve the real queue without account storage',async()=>{
  await controller.unlock('k'.repeat(43));await controller.search('Believer');await controller.play(songs[0]!.id);
  const resets=native.reset.mock.calls.length, ids=(await native.getQueue()).map(x=>x.id), covers=await controller.artwork(ids);
  expect([...covers.keys()]).toEqual(ids);await controller.select(1);
  const service=(await import('../../services/playback/AudioPlaybackService')).AudioPlaybackService.getInstance();
  await service.pause();expect((await native.getQueue()).map(x=>x.id)).toEqual(ids);expect(controller.snapshot().active).toBe(1);expect(native.reset.mock.calls.length).toBe(resets);
  await controller.lock();expect((await controller.artwork(ids)).size).toBe(0);controller.select(0);expect(await native.getQueue()).toEqual([]);
 });
 it('closes the queue and ignores further catalog/player actions after locking',async()=>{
  await controller.unlock('k'.repeat(43));await controller.search('Believer');await controller.play(songs[0]!.id);await controller.lock();
  expect(controller.snapshot()).toMatchObject({unlocked:false,songs:[],tracks:[]});expect(await native.getQueue()).toEqual([]);const calls=native.play.mock.calls.length;controller.retry();await controller.search('Rain');expect(native.play).toHaveBeenCalledTimes(calls);
 });
});
