import {readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Fastify from 'fastify';
import mercurius from 'mercurius';
import {describe,it,expect,vi} from 'vitest';
import {GRAPHQL_SCHEMA_STRING} from '@aadat/contracts';
import {JioSaavnV3MusicProviderService} from '../implementations/jiosaavn-v3-music-provider.service.js';
import {FileProviderIdentityRepository} from '../implementations/file-provider-identity.repository.js';
import {ProviderCatalogService} from '../../../modules/catalog/services/provider-catalog.service.js';
import {CatalogGraphQLController} from '../../../modules/catalog/controllers/catalog-graphql.controller.js';
import {GraphQLErrorFormatter} from '../../../shared/graphql/graphql-error-formatter.js';
const read=async(name:string)=>JSON.parse(await readFile(new URL('./fixtures/'+name,import.meta.url),'utf8')) as Record<string,unknown>;
const song=await read('v3-song-metadata.json'),search=await read('v3-search-metadata.json'),album=await read('v3-album-metadata.json');
async function fixture(authenticated=true){
 const transport=vi.fn(async(input:Parameters<typeof fetch>[0])=>{const url=String(input),body=url.includes('/search?')?search:url.includes('/album?')?album:song;return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});}) as unknown as typeof fetch;
 const directory=await mkdtemp(join(tmpdir(),'aadat-provider-graphql-')),identities=new FileProviderIdentityRepository(join(directory,'identities')),service=new ProviderCatalogService(new JioSaavnV3MusicProviderService({apiBaseUrl:'https://provider.example.invalid'},transport),identities);
 const app=Fastify();await app.register(mercurius,{schema:GRAPHQL_SCHEMA_STRING,resolvers:new CatalogGraphQLController(service,true).buildResolvers(),context:async()=>authenticated?{userId:'10000000-0000-4000-8000-000000000001'}:{},errorFormatter:GraphQLErrorFormatter.format});return {app,transport,identities,service};
}
describe('real captured provider metadata through the authenticated GraphQL contract',()=>{
 it('serializes catalog metadata and explicit capability limits through the real SDL',async()=>{const f=await fixture();try{const response=await f.app.inject({method:'POST',url:'/graphql',payload:{query:'query {catalogPage(input:{query:"Aadat",first:1}){nodes{id title artistName releaseYear sourceLabel developmentOnly discoveryBasis}hasNextPage} catalogProviderInfo{resourceKinds remotePagination videoSupported recognitionSupported}}'}});const body=response.json();expect(body.errors).toBeUndefined();expect(body.data.catalogPage.nodes[0]).toMatchObject({title:'Aadat',artistName:'Ninja',releaseYear:2015,developmentOnly:true,discoveryBasis:'TITLE_ALBUM_KEYWORDS'});expect(body.data.catalogProviderInfo).toMatchObject({resourceKinds:['albums'],remotePagination:false,videoSupported:false,recognitionSupported:false});expect(JSON.stringify(body)).not.toMatch(/media_url|audioKey|saavncdn/);}finally{await f.app.close();}});
 it('rejects unauthenticated catalog access before fetching the provider',async()=>{const f=await fixture(false);try{const response=await f.app.inject({method:'POST',url:'/graphql',payload:{query:'query {catalogPage(input:{query:"Aadat"}){nodes{id}}}'}});expect(response.json().errors[0].extensions.code).toBe('UNAUTHORIZED');expect(f.transport).not.toHaveBeenCalled();}finally{await f.app.close();}});
 it('retrieves actual album contents through canonical resource references without importing music rows',async()=>{const f=await fixture();try{const id=await f.identities.remember({provider:'jiosaavn',kind:'albums',externalId:'1297527'});const response=await f.app.inject({method:'POST',url:'/graphql',payload:{query:'query($id:ID!){catalogCollection(id:$id){resource{id name kind}nodes{id title releaseYear}hasMore}}',variables:{id}}});const body=response.json();expect(body.errors).toBeUndefined();expect(body.data.catalogCollection.resource).toMatchObject({id,name:'Aadat',kind:'albums'});expect(body.data.catalogCollection.nodes[0]).toMatchObject({title:'Aadat',releaseYear:2015});}finally{await f.app.close();}});
});
