import { describe,it,expect,vi } from 'vitest';
import { DevelopmentPlaybackConfig,DevelopmentCatalogClient } from '../development-catalog.client';
const url='https://api.example.test/development/catalog/graphql';
const config=()=>new DevelopmentPlaybackConfig('development-playback-verification','true',url,'https://api.example.test/graphql');
const key='k'.repeat(43);
describe('diagnostic access is endpoint-scoped and not an account session',()=>{
 it('unlocks only read access and never sends the key to another API',async()=>{
  const network=vi.fn(async()=>({ok:true,status:200,json:async()=>({data:{developmentCatalogAccess:{expiresAt:new Date(5000).toISOString(),expiresInSeconds:4}}})}));
  const client=new DevelopmentCatalogClient(config(),network,()=>1000);await client.unlock(key);expect(client.deadline()).toBe(5000);
  await expect(client.transport('https://api.example.test/graphql',{})).rejects.toThrow('another API');expect(network).toHaveBeenCalledTimes(1);
  expect(network.mock.calls[0]).toEqual([url,expect.objectContaining({redirect:'error',headers:expect.objectContaining({Authorization:'Bearer '+key})})]);
 });
 it('rejects expiration and clears access after a server revocation',async()=>{
  let now=1000;const network=vi.fn().mockResolvedValueOnce({ok:true,status:200,json:async()=>({data:{developmentCatalogAccess:{expiresAt:new Date(5000).toISOString(),expiresInSeconds:4}}})}).mockResolvedValue({ok:false,status:401,json:async()=>({})});const client=new DevelopmentCatalogClient(config(),network,()=>now);await client.unlock(key);
  await expect(client.transport(url,{})).rejects.toThrow('revoked');expect(client.deadline()).toBe(0);now=9000;await expect(client.transport(url,{})).rejects.toThrow('expired');expect(network).toHaveBeenCalledTimes(2);
 });
 it('refuses false flags, insecure or wrong-path endpoints without sending anything',()=>{
  for(const endpoint of ['http://api.example.test/development/catalog/graphql','https://api.example.test/graphql','https://user@api.example.test/development/catalog/graphql'])expect(()=>new DevelopmentPlaybackConfig('development-playback-verification','true',endpoint,'https://api.example.test/graphql').endpointUrl()).toThrow();
  expect(()=>new DevelopmentPlaybackConfig('','false',url,'https://api.example.test/graphql').endpointUrl()).toThrow();
 });
 it('does not revive a request after explicit clear',async()=>{
  let finish!:(value:unknown)=>void;const network=vi.fn(()=>new Promise<any>(resolve=>{finish=resolve;}));const client=new DevelopmentCatalogClient(config(),network,()=>1000);const pending=client.unlock(key);client.clear();finish({ok:true,status:200,json:async()=>({data:{developmentCatalogAccess:{expiresAt:new Date(5000).toISOString(),expiresInSeconds:4}}})});await expect(pending).rejects.toThrow('failed');expect(client.deadline()).toBe(0);
 });
});
