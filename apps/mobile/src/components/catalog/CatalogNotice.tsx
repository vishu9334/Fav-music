import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useCatalogStore } from '../../store/useCatalogStore';
import { Button, colors, ui } from '../app/ui';
import type { CatalogQuery } from '@aadat/contracts';
import { catalogQueryKey } from '../../catalog/catalog-query';

export function CatalogNotice({query,initialLoading=false,loadingHandled=false}:{query?:CatalogQuery;initialLoading?:boolean;loadingHandled?:boolean}={}): React.JSX.Element | null {
  const key=query?catalogQueryKey(query):null;
  const actualStatus = useCatalogStore(s=>key?s.pages[key]?.status??'unavailable':s.status), error=useCatalogStore(s=>key?s.pages[key]?.error??null:s.error);
  const status=initialLoading&&actualStatus==='unavailable'?'loading':actualStatus;
  if (status === 'ready' && !error) return null;
  if (loadingHandled && !error && (status === 'loading' || status === 'unavailable')) return null;
  if (status === 'loading' && !error) return <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}><ActivityIndicator size="small" color={colors.accent} accessibilityLabel="Loading music catalog" /></View>;
  return <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 10 }}>
    {status === 'loading' && <ActivityIndicator color={colors.accent} accessibilityLabel="Loading music catalog" />}
    <Text style={ui.subtitle} accessibilityLiveRegion="polite">{error ?? (status === 'unavailable' ? 'Music unavailable' : 'Finding your music…')}</Text>
    {status === 'error' && <Button title="Retry catalog" secondary onPress={() => { const state = useCatalogStore.getState(); void state.load(query??state.query, false, true); }} />}
  </View>;
}
