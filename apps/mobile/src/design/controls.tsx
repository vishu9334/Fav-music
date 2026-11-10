import React from 'react';
import { Pressable, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { colors } from './theme';
import { ui } from './styles';
export function IconButton({ icon: Icon, label, onPress, selected = false, disabled = false }: {
  icon: LucideIcon; label: string; onPress: () => void; selected?: boolean; disabled?: boolean;
}): React.JSX.Element {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ selected, disabled }} style={({ pressed }) => [ui.iconButton, selected && ui.selected, pressed && ui.pressed, disabled && ui.disabled]}>
    <Icon size={21} color={selected ? colors.accent : colors.text} fill={selected ? colors.darkAccent : 'transparent'} />
  </Pressable>;
}
export function Button({ title, onPress, disabled = false, secondary = false, accessibilityLabel }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; accessibilityLabel?: string;
}): React.JSX.Element {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }}
    style={({ pressed }) => [ui.button, secondary && ui.secondary, disabled && ui.disabled, pressed && ui.pressed]}>
    <Text style={[ui.buttonText, secondary && { color: colors.text }]}>{title}</Text>
  </Pressable>;
}
