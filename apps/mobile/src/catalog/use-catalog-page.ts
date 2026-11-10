import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import type { CatalogQuery } from '@aadat/contracts';
import { useCatalogStore, EMPTY_CATALOG_PAGE } from '../store/useCatalogStore';
import { catalogQueryKey } from './catalog-query';
import { catalogEnabled } from './catalog-runtime';
/** Focus owns requests; the result remains keyed to this query while other screens load. */
export function useCatalogPage(query:CatalogQuery,delay=0,active=true){
  const key=catalogQueryKey(query);
  const page=useCatalogStore(s=>s.pages[key]??EMPTY_CATALOG_PAGE);
  useFocusEffect(useCallback(()=>{
    if(!active||!catalogEnabled())return;
    const timer=setTimeout(()=>{void useCatalogStore.getState().load(query);},delay);
    return()=>clearTimeout(timer);
  },[key,delay,active]));
  return page;
}
