import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { CatalogResource } from '@aadat/contracts';
import { Artwork } from '../../design/Artwork';
import { colors, ui } from '../app/ui';

/** Primitive metadata props keep unchanged cards still when page objects are refreshed. */
export const CatalogResourceCard = memo(function CatalogResourceCard({ id, name, artworkUrl, releaseYear, open }: Pick<CatalogResource,'id'|'name'|'artworkUrl'|'releaseYear'> & {open:(id:string)=>void}): React.JSX.Element {
  const { fontScale } = useWindowDimensions();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}`} style={[styles.card,{minHeight:Math.max(98,Math.ceil(34+58*fontScale))}]} onPress={()=>open(id)}>
    <Artwork uri={artworkUrl??undefined} size={64} /><View style={ui.grow}><Text style={[ui.sectionTitle,styles.title]} numberOfLines={2}>{name}</Text>{releaseYear!==null && <Text style={ui.subtitle}>{releaseYear}</Text>}</View>
  </Pressable>;
});
const styles=StyleSheet.create({
  card:{padding:16,marginHorizontal:20,marginBottom:12,borderWidth:1,borderColor:colors.line,borderRadius:24,backgroundColor:colors.panel,flexDirection:'row',gap:14,alignItems:'center'},
  title:{lineHeight:20},
});
