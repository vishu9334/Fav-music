import { create } from 'zustand';
import type { CatalogPage, CatalogQuery } from '@aadat/contracts';
import type { DemoCatalog } from '../catalog/demo-catalog';
import type { IPlayableTrack } from '../data/sample-tracks';
import { catalogQueryKey } from '../catalog/catalog-query';
import { HOME_CATALOG_QUERY } from '../catalog/home-catalog';

export interface CatalogPageState {
  readonly status: 'unavailable' | 'loading' | 'ready' | 'error'; readonly error: string | null;
  readonly ids: readonly string[]; readonly tracks: readonly IPlayableTrack[];
  readonly cursor: string | null; readonly hasMore: boolean; readonly query: CatalogQuery;
  readonly cachedAt?: number;
}
export const EMPTY_CATALOG_PAGE: CatalogPageState = { status:'unavailable',error:null,ids:[],tracks:[],cursor:null,hasMore:false,query:{} };
export interface CatalogState extends CatalogPageState {
  revision: number; pages: Readonly<Record<string,CatalogPageState>>;
  initialize: () => Promise<void>; load: (query: CatalogQuery, more?: boolean, force?: boolean) => Promise<void>;
}
interface CatalogClient { initialize():Promise<void>; page(query:CatalogQuery,force?:boolean,signal?:AbortSignal):Promise<CatalogPage>; readonly cacheError:string|null }
interface ArtworkLeases { resolve(ids:readonly string[],kind:'ARTWORK'):Promise<ReadonlyMap<string,string>> }
const MAX_TRACKS=500,MAX_QUERIES=8,CATALOG_CACHE_TTL_MS=5*60*1000;
/** Independent bounded pages: navigating or another mounted screen cannot reset a loaded list. */
export function createCatalogStore(client:CatalogClient,registry:DemoCatalog,artwork:ArtworkLeases,enabled:()=>boolean) {
  return create<CatalogState>((set,get)=>{
    const pending=new Map<string,Promise<void>>(), consumed=new Map<string,Set<string>>(), recency=new Map<string,true>(), failedMore=new Map<string,boolean>();
    let selectedKey=catalogQueryKey(HOME_CATALOG_QUERY),initialization:Promise<void>|null=null;
    const publish=(key:string,page:CatalogPageState)=>{
      const pages={...get().pages,[key]:page};recency.delete(key);recency.set(key,true);
      for(const candidate of recency.keys())if(Object.keys(pages).length>MAX_QUERIES && candidate!==selectedKey && !pending.has(candidate)){delete pages[candidate];recency.delete(candidate);consumed.delete(candidate);failedMore.delete(candidate);}
      set({pages,...(key===selectedKey?page:{})});
    };
    registry.subscribe(()=>{
      let pages=get().pages,changed=false;
      for(const [key,page]of Object.entries(pages)){
        const tracks=page.tracks.map(track=>registry.get(track.id)??track);
        if(tracks.some((track,i)=>track!==page.tracks[i])){if(!changed)pages={...pages};pages={...pages,[key]:{...page,tracks}};changed=true;}
      }
      set({revision:get().revision+1,...(changed?{pages,...(pages[selectedKey]??{})}:{})});
    });
    const load=(query:CatalogQuery,more=false,force=false):Promise<void>=>{
      const key=catalogQueryKey(query),prior=get().pages[key];
      if(force && prior?.status==='error' && failedMore.get(key))more=true;
      if(more && (!prior?.hasMore || !prior.cursor))return Promise.resolve();
      selectedKey=key;
      if(!enabled()){publish(key,{...(prior??EMPTY_CATALOG_PAGE),query,status:'unavailable'});return Promise.resolve();}
      const running=pending.get(key);if(running){if(prior)set(prior);return running;}
      if(!more && !force && prior?.status==='ready'){
        const age=Date.now()-(prior.cachedAt??0);
        if(age<CATALOG_CACHE_TTL_MS){publish(key,prior);return Promise.resolve();}
      }
      const cursor=more?prior!.cursor:null;
      if(more && consumed.get(key)?.has(cursor!))return Promise.resolve();
      const base=prior??{...EMPTY_CATALOG_PAGE,query};
      publish(key,{...base,query,status:'loading',error:null});
      const task=Promise.resolve().then(async()=>{
        try{
          const page=await client.page({...query,first:20,after:cursor??undefined},force);
          const ids=[...new Set([...(more?base.ids:[]),...page.nodes.map(song=>song.id)])].slice(0,MAX_TRACKS);
          const previous=new Map(base.tracks.map(track=>[track.id,track]));
          const tracks=ids.flatMap(id=>{const track=registry.get(id)??previous.get(id);return track?[track]:[];});
          const used=more?(consumed.get(key)??new Set<string>()):new Set<string>();if(cursor)used.add(cursor);consumed.set(key,used);
          const repeated=!!page.hasNextPage && (!page.endCursor || used.has(page.endCursor) || (more && ids.length===base.ids.length));
          failedMore.delete(key);
          publish(key,{query,ids,tracks,cursor:page.endCursor,hasMore:page.hasNextPage&&!repeated&&ids.length<MAX_TRACKS,status:'ready',cachedAt:Date.now(),error:client.cacheError??(repeated?'The provider repeated this page. Refine the search to find more music.':ids.length===MAX_TRACKS&&page.hasNextPage?'500 tracks loaded. Refine your search for more results.':null)});
          // Image preparation has no access to playback; one bounded batch per successful page.
          void artwork.resolve(page.nodes.map(song=>song.id),'ARTWORK').then(urls=>{
            registry.upsert(page.nodes.flatMap(song=>{const entry=registry.metadata(song.id),url=urls.get(song.id);return entry&&url&&entry.track.artwork!==url?[{...entry,track:{...entry.track,artwork:url}}]:[];}));
          }).catch(()=>{});
        }catch{
          failedMore.set(key,more);
          publish(key,{...base,query,status:'error',error:'The catalog is unavailable. Saved references are preserved; retry later.'});
        }
      }).finally(()=>{
        pending.delete(key);
      });
      pending.set(key,task);return task;
    };
    return {...EMPTY_CATALOG_PAGE,revision:0,pages:{},load,initialize:()=>{
      if(!initialization)initialization=client.initialize().then(()=>load(HOME_CATALOG_QUERY)).finally(()=>{initialization=null;});return initialization;
    }};
  });
}
