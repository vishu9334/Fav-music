import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Home, Search, Library, Boxes } from 'lucide-react-native';
import { colors } from '../../design/theme';
import { useReducedMotion } from '../../design/useReducedMotion';
import { bottomTabNames, tabHighlightX, TabPressIntent, type BottomTabName } from './bottom-navigation';

export const bottomTabs = {
  index: { label: 'Home', icon: Home }, search: { label: 'Search', icon: Search },
  library: { label: 'Library', icon: Library }, warehouse: { label: 'Warehouse', icon: Boxes },
};
export interface BottomTabItem { readonly name: BottomTabName; readonly key: string; readonly label?: string }
const defaultItems: readonly BottomTabItem[] = bottomTabNames.map(name => ({ name, key: name }));
export const BottomTabStrip = memo(function BottomTabStrip({ selected, select, longPress, items = defaultItems }: {
  selected: BottomTabName | null; select: (name: BottomTabName) => void; longPress?: (name: BottomTabName) => void; items?: readonly BottomTabItem[];
}): React.JSX.Element {
  const reduced = useReducedMotion(), [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current, opacity = useRef(new Animated.Value(0)).current;
  const previousWidth = useRef(0), intent = useRef(new TabPressIntent()).current;
  const index = items.findIndex(item => item.name === selected);
  const target = tabHighlightX(width, items.length, Math.max(0, index));
  useEffect(() => {
    x.stopAnimation(); opacity.stopAnimation();
    const visible = index >= 0 && width > 0 ? 1 : 0;
    if (reduced || previousWidth.current !== width || !previousWidth.current) {
      x.setValue(target); opacity.setValue(visible);
    } else {
      const animation = Animated.parallel([
        Animated.timing(x, { toValue: target, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(opacity, { toValue: visible, duration: 140, useNativeDriver: true, isInteraction: false }),
      ]);
      animation.start(); previousWidth.current = width;
      return () => { animation.stop(); };
    }
    previousWidth.current = width;
    return () => { x.stopAnimation(); opacity.stopAnimation(); };
  }, [target, width, index, reduced, x, opacity]);
  const layout = (event: LayoutChangeEvent) => { const next = event.nativeEvent.layout.width; setWidth(prior => Math.abs(prior - next) < 0.5 ? prior : next); };
  return <View style={styles.tabs} onLayout={layout}>
    <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.highlight, { opacity, transform: [{ translateX: x }] }]} />
    {items.map(item => {
      const { label, icon: Icon } = bottomTabs[item.name], active = selected === item.name;
      return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={item.label ?? label}
        onPress={() => { if (intent.allow(item.key)) select(item.name); }} onLongPress={longPress ? () => longPress(item.name) : undefined} style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
        <View style={styles.icon}>
          <Icon size={21} strokeWidth={active ? 2.4 : 1.8} color={active ? colors.accent : colors.muted} accessible={false} />
        </View>
        <Text style={[styles.label, active && styles.active]} numberOfLines={2}>{label}</Text>
      </Pressable>;
    })}
  </View>;
});
const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', paddingHorizontal: 4, paddingTop: 6, minWidth: 0 },
  tab: { flex: 1, minWidth: 48, minHeight: 58, paddingHorizontal: 2, paddingVertical: 4, alignItems: 'center', gap: 3 },
  icon: { width: 44, height: 30, alignItems: 'center', justifyContent: 'center' },
  highlight: { position: 'absolute', left: 0, top: 10, width: 44, height: 30, borderRadius: 11, backgroundColor: colors.darkAccent, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.selectedBorder },
  label: { maxWidth: '100%', textAlign: 'center', color: colors.muted, fontSize: 10, fontWeight: '600' }, active: { color: colors.text },
  pressed: { opacity: 0.75 },
});
