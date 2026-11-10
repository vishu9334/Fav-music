import { describe, expect, it, vi } from 'vitest';
import { DemoCatalog } from '../../catalog/demo-catalog';
import { SharedContentLoader } from '../shared-content.loader';
import { ShareLinkService, type SharedContent } from '../share-link.service';
import { incomingTrackPayload } from '../incoming-share';
import type { IPlayableTrack } from '../../data/sample-tracks';
const id='f5e75856-4598-8a85-8509-3e90deb1afe4',other='407d6426-d997-8421-aacf-0b03399ae8e6';
const track:IPlayableTrack={id,title:'Believer',artist:'Imagine Dragons',duration:204,url:'',artwork:'',catalogSource:'catalog'};
const content:SharedContent={v:1,catalog:'aadat-catalog-v1',type:'track',id};
describe('exact-song incoming review',()=>{
  it('looks up the canonical ID without automatically playing or saving',async()=>{
    const lookup=vi.fn(async()=>[track]),loader=new SharedContentLoader(new DemoCatalog(),lookup);
    expect(await loader.load(content)).toEqual({ids:[id],tracks:[track],unavailable:0});expect(lookup).toHaveBeenCalledWith([id],expect.any(Function));
  });
  it('does not treat stale cached metadata as proof that a removed song is available',async()=>{
    const registry=new DemoCatalog([{track,seasons:[]}]);const loader=new SharedContentLoader(registry,async()=>[]);
    expect(await loader.load(content)).toEqual({ids:[id],tracks:[],unavailable:1});
  });
  it('drops late results after payload/account change and rejects identity substitution',async()=>{
    let active=true,release!:(tracks:readonly IPlayableTrack[])=>void;
    const loader=new SharedContentLoader(new DemoCatalog(),()=>new Promise(resolve=>{release=resolve;}));
    const pending=loader.load(content,()=>active);active=false;release([track]);expect(await pending).toBeNull();
    await expect(new SharedContentLoader(new DemoCatalog(),async()=>[{...track,id:other}]).load(content)).rejects.toThrow('identity');
  });
  it('preserves playlist order and unavailable canonical references for an explicit save',async()=>{
    const loader=new SharedContentLoader(new DemoCatalog(),async()=>[track]);
    expect(await loader.load({...content,type:'playlist',name:'Shared playlist',ids:[other,id]})).toEqual({ids:[other,id],tracks:[track],unavailable:1});
  });
  it('reports lookup errors without replacing exact references with search guesses',async()=>{
    const lookup=vi.fn(async()=>{throw new Error('Offline');});await expect(new SharedContentLoader(new DemoCatalog(),lookup).load(content)).rejects.toThrow('Offline');expect(lookup).toHaveBeenCalledTimes(1);
  });
});
describe('Android incoming text share routing',()=>{
  const service=new ShareLinkService(new DemoCatalog()),link=service.trackLink(id),parse=(value:string)=>service.parse(value);
  it('extracts the exact installed-app track link alongside its browser fallback',()=>{
    const value=incomingTrackPayload(`Believer — Imagine Dragons\nhttps://www.jiosaavn.com/song/believer/Mg0zcxdSYXg\n${link}`,parse);
    expect(service.parse(value)).toEqual(content);
  });
  it.each([null,'x'.repeat(8193),`${link} ${link}`,link.replace('shared','profile'),link+'&next=/profile','aadatmusic:///shared?payload=bad-json'])('rejects ambiguous, invalid and unsupported input %s',text=>{expect(incomingTrackPayload(text,parse)).toBeNull();});
});
