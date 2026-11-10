import {describe,it,expect,vi} from 'vitest';
import {PageRequests,appendStable} from '../page-requests';
describe('explicit resource/collection page requests',()=>{
 it('joins repeated taps and restores cached pages without a repeat HTTP request',async()=>{
  const pages=new PageRequests<{id:string}[]>();let release!:(data:{id:string}[])=>void;const fetch=vi.fn(()=>new Promise<{id:string}[]>(r=>{release=r;}));
  const a=pages.run('albums:query:1',fetch),b=pages.run('albums:query:1',fetch);expect(a).toBe(b);await Promise.resolve();release([{id:'one'}]);await a;
  await pages.run('albums:query:1',fetch);expect(fetch).toHaveBeenCalledTimes(1);expect(await pages.run('albums:query:1',fetch)).toEqual([{id:'one'}]);
 });
 it('permits retry after failure and separates resource IDs/pages',async()=>{
  const pages=new PageRequests<number>(),fetch=vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(2);
  await expect(pages.run('album:A:1',fetch)).rejects.toThrow('Offline');expect(await pages.run('album:A:1',fetch)).toBe(2);await pages.run('album:B:1',fetch);expect(fetch).toHaveBeenCalledTimes(3);
 });
 it('appends unique rows without dropping/reordering the prefix or replacing unchanged row references',()=>{
  const first={id:'one'},second={id:'two'},before=[first,second];expect(appendStable(before,[second])).toBe(before);
  const after=appendStable(before,[second,{id:'three'}]);expect(after[0]).toBe(first);expect(after.map(t=>t.id)).toEqual(['one','two','three']);expect(appendStable(before,[{id:'three'}],2)).toBe(before);
 });
});
