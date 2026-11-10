import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { DemoCatalog } from '../../catalog/demo-catalog';
import { ShareLinkService, type TrackShareMetadata } from '../share-link.service';
import { publicTrackPageUrl } from '../track-page-url';
import { GraphQLCatalogRepository } from '../../catalog/graphql-catalog.repository';
import { CatalogTrackShareSource } from '../catalog-track-share.source';
const captured = JSON.parse(await readFile(new URL('./fixtures/real-track-pages.json', import.meta.url), 'utf8')) as {tracks:TrackShareMetadata[]};
const [first,second] = captured.tracks as [TrackShareMetadata,TrackShareMetadata];
function fixture(track:TrackShareMetadata|null=first) {
  const gateway={share:vi.fn(async(_title:string,_message:string)=>{})},source={resolve:vi.fn(async(_id:string)=>track)};
  return {gateway,source,links:new ShareLinkService(new DemoCatalog(),gateway,source)};
}
describe('real catalog track sharing',()=>{
  it('shares exact title/artist, provider page and canonical-ID deep link without needing cached metadata',async()=>{
    const f=fixture();await f.links.shareTrack(first.id);
    const [title,message]=f.gateway.share.mock.calls[0]!;
    expect(title).toBe('Believer — Imagine Dragons');expect(message).toContain(first.shareUrl);
    const link=message.match(/aadatmusic:\/\/\/shared\?payload=(\S+)/)![0];
    expect(f.links.parse(decodeURIComponent(link.split('?payload=')[1]!))).toEqual({v:1,catalog:'aadat-catalog-v1',type:'track',id:first.id});
    expect(message).not.toMatch(/token|signature|App required\nhttps:|demo|development|audioKey|mp3|mp4/);
  });
  it('keeps different recordings with identical titles distinct',async()=>{
    const f=fixture();await f.links.shareTrack(first.id);f.source.resolve.mockResolvedValueOnce(second);await f.links.shareTrack(second.id);
    expect(f.gateway.share.mock.calls[0]![1]).toContain(first.shareUrl);expect(f.gateway.share.mock.calls[1]![1]).toContain(second.shareUrl);
    expect(f.gateway.share.mock.calls[0]![1]).not.toContain(second.shareUrl);
  });
  it('coalesces rapid same-song taps during lookup and native sharing; rejects a conflicting share',async()=>{
    const f=fixture();let release!:(v:TrackShareMetadata)=>void;f.source.resolve.mockImplementationOnce(()=>new Promise(r=>{release=r;}));
    const a=f.links.shareTrack(first.id),b=f.links.shareTrack(first.id);expect(a).toBe(b);
    await expect(f.links.shareTrack(second.id)).rejects.toThrow('Another share');await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    release(first);await Promise.all([a,b]);expect(f.source.resolve).toHaveBeenCalledTimes(1);expect(f.gateway.share).toHaveBeenCalledTimes(1);
  });
  it('does not invent links for removed tracks, missing metadata, identity substitution or legacy/local samples',async()=>{
    for(const track of [null,{...first,title:''},{...first,artist:''},{...first,title:'Believer\nhttps://attacker.invalid/'},second]){
      const f=fixture(track);await expect(f.links.shareTrack(first.id)).rejects.toThrow();expect(f.gateway.share).not.toHaveBeenCalled();
    }
    const f=fixture();await expect(f.links.shareTrack('sample-track-1')).rejects.toThrow('catalog songs');expect(f.source.resolve).not.toHaveBeenCalled();
  });
  it('allows retry after metadata/network/native errors and does not claim success',async()=>{
    const f=fixture();f.source.resolve.mockRejectedValueOnce(new Error('Offline'));await expect(f.links.shareTrack(first.id)).rejects.toThrow('Offline');
    f.gateway.share.mockRejectedValueOnce(new Error('Share unavailable'));await expect(f.links.shareTrack(first.id)).rejects.toThrow('Share unavailable');
    await expect(f.links.shareTrack(first.id)).resolves.toBeUndefined();expect(f.gateway.share).toHaveBeenCalledTimes(2);
  });
  it('never opens a stale share sheet after the initiating track/account screen is replaced',async()=>{
    const f=fixture();let current=true,release!:(value:TrackShareMetadata)=>void;
    f.source.resolve.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
    const sharing=f.links.shareTrack(first.id,()=>current);await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
    current=false;release(first);await sharing;expect(f.gateway.share).not.toHaveBeenCalled();
    await f.links.shareTrack(first.id);expect(f.gateway.share).toHaveBeenCalledTimes(1);
  });
  it('enforces catalog UUIDs in received real-track payloads without accepting injected URLs',()=>{
    const f=fixture();for(const id of ['sample-track-1','https://www.jiosaavn.com/','../private','x'])expect(()=>f.links.parse(JSON.stringify({v:1,catalog:'aadat-catalog-v1',type:'track',id}))).toThrow();
  });
});
describe('public page validation',()=>{
  it.each([undefined,null,'https://www.jiosaavn.com/','http://www.jiosaavn.com/song/a/b','https://user:pass@www.jiosaavn.com/song/a/b','https://www.jiosaavn.com.evil.invalid/song/a/b','https://127.0.0.1/song/a/b','https://cdn.music.com/file.mp3','https://cdn.music.com/file.m3u8?token=x','https://music.com/song/a?X-Amz-Signature=x','https://music.com/song/a?%74oken=x','https://music.com/%2e%2e/','https://music.com/song/%00','https://music.com/song/%zz'])('rejects missing, homepage, private, media or credential-bearing URL %s',value=>{
    expect(()=>publicTrackPageUrl(value)).toThrow();
  });
  it('preserves exact returned song-page bytes without constructing provider slugs',()=>{
    for(const song of captured.tracks)expect(publicTrackPageUrl(song.shareUrl)).toBe(song.shareUrl);
  });
});
describe('authenticated share-metadata query',()=>{
  it('requests only exact ID metadata and preserves the provider permalink',async()=>{
    const transport=vi.fn(async()=>({ok:true,status:200,json:async()=>({data:{track:{id:first.id,title:first.title,artistName:first.artist,shareUrl:first.shareUrl}}})}));
    const repo=new GraphQLCatalogRepository(()=> 'https://api.example.invalid/graphql',transport),source=new CatalogTrackShareSource(repo);
    expect(await source.resolve(first.id)).toEqual({id:first.id,title:first.title,artist:first.artist,shareUrl:first.shareUrl});
    const options=transport.mock.calls[0] as unknown[];expect(options.length).toBe(2);
    expect(JSON.parse((options[1] as {body:string}).body)).toMatchObject({variables:{id:first.id}});
    expect(JSON.parse((options[1] as {body:string}).body).query).toContain('shareUrl');
  });
  it('rejects stale/mismatched and unavailable metadata without opening a native sheet',async()=>{
    const transport=vi.fn(async()=>({ok:true,status:200,json:async()=>({data:{track:null as unknown}})}));
    const repo=new GraphQLCatalogRepository(()=> 'https://api.example.invalid/graphql',transport);
    expect(await repo.trackPage(first.id)).toBeNull();
    transport.mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:{track:{id:second.id,title:second.title,artistName:second.artist,shareUrl:second.shareUrl}}})});
    await expect(repo.trackPage(first.id)).rejects.toThrow('unavailable');
  });
});
