import {readFile} from 'node:fs/promises';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import {describe,it,expect,vi} from 'vitest';
import {GRAPHQL_SCHEMA_STRING} from '@aadat/contracts';
import {JioSaavnMusicProviderService} from '../implementations/jiosaavn-music-provider.service.js';
import {ProviderCatalogService} from '../../../modules/catalog/services/provider-catalog.service.js';
import {CatalogGraphQLController} from '../../../modules/catalog/controllers/catalog-graphql.controller.js';
import type {ProviderReference} from '../contracts/provider-identity.contract.js';
// Real captured metadata; injected upstream and native share boundaries. No network or database.
const raw = JSON.parse(await readFile(new URL('./fixtures/bycom-metadata.json',import.meta.url),'utf8')).searchFirst.results;
const pages=JSON.parse(await readFile('apps/mobile/src/sharing/__tests__/fixtures/real-track-pages.json','utf8')).tracks as {id:string;providerId:string;title:string;artist:string;shareUrl:string}[];
async function fixture(authenticated=true,missingLink=false){
  const refs=new Map<string,ProviderReference>();
  const identities={remember:async(ref:ProviderReference)=>{const page=pages.find(p=>p.providerId===ref.externalId);if(!page)throw new Error('Unexpected identity');refs.set(page.id,ref);return page.id;},find:async(id:string)=>refs.get(id)??null};
  const transport=vi.fn(async(input:Parameters<typeof fetch>[0])=>{
    const url=new URL(String(input));
    const songs=pages.map(page=>({...raw.find((s:{id:string})=>s.id===page.providerId),url:missingLink?undefined:page.shareUrl}));
    const data=url.pathname.endsWith('/search/songs')?{total:2,start:1,results:songs}:songs.filter(s=>s.id===url.searchParams.get('ids'));
    return new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
  });
  const service=new ProviderCatalogService(new JioSaavnMusicProviderService({apiBaseUrl:'https://provider.example.invalid/api'},transport as typeof fetch),identities);
  const app=Fastify();await app.register(mercurius,{schema:GRAPHQL_SCHEMA_STRING,resolvers:new CatalogGraphQLController(service,true).buildResolvers(),context:async()=>authenticated?{userId:'test-only-verified-context'}:{}});
  return {app,service,transport};
}
describe('provider → authenticated GraphQL sharing metadata contract',()=>{
  it('preserves exact public pages and canonical IDs for distinct recordings through real SDL',async()=>{
    const f=await fixture();try{
      const result=await f.app.inject({method:'POST',url:'/graphql',payload:{query:'query { catalogPage(input:{query:"Believer",first:2}) { nodes {id title artistName shareUrl} } }'}});
      expect(result.json().errors).toBeUndefined();expect(result.json().data.catalogPage.nodes.map((s:{shareUrl:string})=>s.shareUrl)).toEqual(pages.map(p=>p.shareUrl));
      for(const page of pages){
        const detail=await f.app.inject({method:'POST',url:'/graphql',payload:{query:'query($id:ID!){track(id:$id){id title artistName shareUrl}}',variables:{id:page.id}}});
        expect(detail.json().errors).toBeUndefined();expect(detail.json().data.track).toEqual({id:page.id,title:page.title,artistName:page.artist,shareUrl:page.shareUrl});
        expect(JSON.stringify(detail.json())).not.toMatch(/media.example.invalid|downloadUrl|audioKey/);
      }
    }finally{await f.app.close();}
  });
  it('leaves protected track metadata inaccessible to anonymous requests',async()=>{
    const f=await fixture(false);try{const r=await f.app.inject({method:'POST',url:'/graphql',payload:{query:'query($id:ID!){track(id:$id){id shareUrl}}',variables:{id:pages[0]!.id}}});expect(r.json().errors).toBeDefined();expect(f.transport).not.toHaveBeenCalled();}finally{await f.app.close();}
  });
  it('returns null for missing/unknown links without inventing a homepage or media permalink',async()=>{
    const f=await fixture(true,true);try{const page=await f.service.page({query:'Believer',first:2});expect(page.nodes.every(s=>s.shareUrl===null)).toBe(true);const r=await f.app.inject({method:'POST',url:'/graphql',payload:{query:'query($id:ID!){track(id:$id){id shareUrl}}',variables:{id:'90000000-0000-4000-8000-000000000009'}}});expect(r.json().data.track).toBeNull();}finally{await f.app.close();}
  });
});
