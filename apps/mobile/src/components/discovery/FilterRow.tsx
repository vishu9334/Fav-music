import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors } from '../app/ui';

export function FilterRow({ title, values, selected, select, responsive = false, includeAll = true }: { title: string; values: readonly string[]; selected: string; select: (value: string) => void; responsive?: boolean; includeAll?: boolean }): React.JSX.Element {
  const { width, height, fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3 || (responsive && (width < 380 || (width > height && height < 480)));
  return <View style={[styles.filter, responsive && styles.bounded, stacked && { flexDirection: 'column', alignItems: 'stretch' }]}><Text style={[styles.label, responsive && stacked && styles.fullLabel]}>{title}</Text><ScrollView style={[stacked ? { minHeight: 44 } : { flex: 1 }, responsive && styles.bounded]} horizontal nestedScrollEnabled directionalLockEnabled keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
    {(includeAll ? ['All', ...values] : values).map((value) => {
      const active = selected === (value === 'All' ? '' : value);
      return <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${title}: ${value}`} accessibilityState={{ selected: active }}
        style={[styles.chip, responsive && styles.chipPadding, active && styles.active]}
        onPress={() => {
          const next = active ? '' : (value === 'All' ? '' : value);
          select(next);
        }}><Text style={{ color: active ? colors.text : colors.muted, fontSize: 11 }}>{value}</Text></Pressable>;
    })}
  </ScrollView></View>;
}
const styles = StyleSheet.create({
  filter: { marginTop: 16, paddingLeft: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }, label: { minWidth: 52, maxWidth: 100, color: colors.muted, fontSize: 10, fontWeight: '600' },
  chips: { paddingRight: 18, gap: 7 }, chip: { minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', borderRadius: 23, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  active: { backgroundColor: colors.darkAccent, borderColor: colors.selectedBorder },
  bounded: { minWidth: 0 }, fullLabel: { maxWidth: '100%', paddingRight: 18 }, chipPadding: { paddingVertical: 6 },
});
