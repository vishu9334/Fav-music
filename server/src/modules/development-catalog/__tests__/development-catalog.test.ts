import Fastify from 'fastify';
import mercurius from 'mercurius';
import { describe, it, expect, vi } from 'vitest';
import { GRAPHQL_SCHEMA_STRING } from '@aadat/contracts';
import { DevelopmentCatalogModule, DevelopmentCatalogAccess } from '../development-catalog.module.js';
import type { ICatalogService } from '../../catalog/contracts/catalog.contract.js';
import { CatalogGraphQLController } from '../../catalog/controllers/catalog-graphql.controller.js';
import { GraphQLErrorFormatter } from '../../../shared/graphql/graphql-error-formatter.js';
const key = 'k'.repeat(43); // Synthetic diagnostic key, never an account/JWT.
const query = (source: string) => ({ query: source });
function fixture() {
  const catalog: ICatalogService = { page: vi.fn(async () => ({ nodes: [], hasNextPage: false, endCursor: null })), track: vi.fn(async () => null), media: vi.fn(async () => []) };
  let now = 1_000_000;
  const access = new DevelopmentCatalogAccess(key, now + 1000, () => now), app = Fastify();
  new DevelopmentCatalogModule(catalog, access).register(app);
  return { app, catalog, expire: () => { now += 1000; } };
}
describe('separate diagnostic catalog authorization', () => {
  it('requires a valid key before any provider call and rejects expiration', async () => {
    const f = fixture(); try {
      for (const authorization of [undefined, 'Bearer '+ 'x'.repeat(43)]) {
        const r = await f.app.inject({ method:'POST',url:'/development/catalog/graphql',...(authorization?{headers:{authorization}}:{}),payload:query('{catalogPage{nodes{id}}}') });
        expect(r.statusCode).toBe(401);
      }
      expect(f.catalog.page).not.toHaveBeenCalled();
      const ok=await f.app.inject({method:'POST',url:'/development/catalog/graphql',headers:{authorization:'Bearer '+key},payload:query('{catalogPage{nodes{id}} developmentCatalogAccess{expiresAt}}')});
      expect(ok.statusCode).toBe(200); expect(ok.json().data.catalogPage.nodes).toEqual([]);
      f.expire();expect((await f.app.inject({method:'POST',url:'/development/catalog/graphql',headers:{authorization:'Bearer '+key},payload:query('{catalogPage{nodes{id}}}')})).statusCode).toBe(401);
    } finally { await f.app.close(); }
  });
  it.each(['mutation {loginWithGoogle(idToken:"test"){accessToken}}','{me{id}}','{accountLibrary{revision}}','{myWarehouse{id}}','{catalogMedia(ids:["test"],kind:VIDEO){url}}'])('does not expose user APIs, mutations or video: %s', async source => {
    const f=fixture();try{const r=await f.app.inject({method:'POST',url:'/development/catalog/graphql',headers:{authorization:'Bearer '+key},payload:query(source)});expect(r.statusCode).toBe(400);expect(JSON.stringify(r.json())).not.toContain(key);expect(f.catalog.media).not.toHaveBeenCalled();}finally{await f.app.close();}
  });
  it('rejects oversized budgets, deep/fragment requests and arbitrary multi-operation documents',async()=>{
    const f=fixture();try{for(const source of ['{catalogPage(input:{first:201}){nodes{id}}}','query A{track(id:"a"){id}} query B{track(id:"b"){id}}','{catalogPage{...P}} fragment P on CatalogPage{nodes{id}}']){
      expect((await f.app.inject({method:'POST',url:'/development/catalog/graphql',headers:{authorization:'Bearer '+key},payload:query(source)})).statusCode).toBe(400);
    }expect(f.catalog.page).not.toHaveBeenCalled();}finally{await f.app.close();}
  });
  it('does not grant authenticated access on the ordinary GraphQL controller',async()=>{
    const f=fixture();await f.app.register(mercurius,{schema:GRAPHQL_SCHEMA_STRING,resolvers:new CatalogGraphQLController(f.catalog,true).buildResolvers(),context:async()=>({}),errorFormatter:GraphQLErrorFormatter.format});try{
      const r=await f.app.inject({method:'POST',url:'/graphql',headers:{authorization:'Bearer '+key},payload:query('{catalogPage{nodes{id}}}')});expect(r.statusCode).toBe(401);expect(f.catalog.page).not.toHaveBeenCalled();
    }finally{await f.app.close();}
  });
  it('is absent by default and refuses production, other providers and enabled account writes',()=>{
    const f=fixture();expect(DevelopmentCatalogModule.fromEnvironment(f.catalog,{})).toBeNull();
    for(const patch of [{NODE_ENV:'production'},{MUSIC_PROVIDER:'owned'},{AUTH_ENABLED:'true'},{ACCOUNT_PERSISTENCE_ENABLED:'true'}])expect(()=>DevelopmentCatalogModule.fromEnvironment(f.catalog,{AADAT_DEVELOPMENT_CATALOG_ENABLED:'true',NODE_ENV:'development',MUSIC_PROVIDER:'jiosaavn-development',...patch})).toThrow('development-only');
    expect(()=>new DevelopmentCatalogAccess('weak',Date.now()+1000)).toThrow();expect(()=>new DevelopmentCatalogAccess(key,Date.now()+7_300_000)).toThrow();
  });
});
