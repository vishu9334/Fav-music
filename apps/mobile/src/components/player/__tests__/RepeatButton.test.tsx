import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RepeatButton } from '../RepeatButton';

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  StyleSheet: {
    create: (styles: any) => styles,
  },
}));

vi.mock('lucide-react-native', () => ({
  Repeat: (props: any) => ({ type: 'RepeatIcon', props }),
}));

function findText(node: any): string[] {
  const result: string[] = [];
  if (!node) return result;
  if (typeof node === 'string') return [node];
  if (node.type === 'Text' && typeof node.props?.children === 'string') {
    result.push(node.props.children);
  }
  if (Array.isArray(node.props?.children)) {
    for (const child of node.props.children) {
      result.push(...findText(child));
    }
  } else if (node.props?.children && typeof node.props.children === 'object') {
    result.push(...findText(node.props.children));
  }
  return result;
}

describe('RepeatButton UI component', () => {
  const onPress = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders inactive state when mode is "off" with no badge', () => {
    const tree = RepeatButton({ mode: 'off', count: 0, onPress });
    expect(tree.props.accessibilityLabel).toBe('Repeat off. Tap to repeat once.');
    expect(tree.props.accessibilityState).toEqual({ selected: false, disabled: false });
    const texts = findText(tree);
    expect(texts).toHaveLength(0);
  });

  it('renders count "1" badge when mode is "1"', () => {
    const tree = RepeatButton({ mode: '1', count: 1, onPress });
    expect(tree.props.accessibilityLabel).toBe('Repeat 1 extra time. Tap for 2 extra repeats.');
    expect(tree.props.accessibilityState).toEqual({ selected: true, disabled: false });
    const texts = findText(tree);
    expect(texts).toEqual(['1']);
  });

  it('renders count "2" badge when mode is "2"', () => {
    const tree = RepeatButton({ mode: '2', count: 2, onPress });
    expect(tree.props.accessibilityLabel).toBe('Repeat 2 extra times. Tap for infinite repeat.');
    expect(tree.props.accessibilityState).toEqual({ selected: true, disabled: false });
    const texts = findText(tree);
    expect(texts).toEqual(['2']);
  });

  it('renders remaining count when mode is "2" but 1 repeat remains', () => {
    const tree = RepeatButton({ mode: '2', count: 1, onPress });
    expect(tree.props.accessibilityState.selected).toBe(true);
    const texts = findText(tree);
    expect(texts).toEqual(['1']);
  });

  it('renders infinite "∞" badge when mode is "infinite"', () => {
    const tree = RepeatButton({ mode: 'infinite', count: Infinity, onPress });
    expect(tree.props.accessibilityLabel).toBe('Repeat infinitely. Tap to turn repeat off.');
    expect(tree.props.accessibilityState).toEqual({ selected: true, disabled: false });
    const texts = findText(tree);
    expect(texts).toEqual(['∞']);
  });

  it('invokes onPress when button is tapped', () => {
    const tree = RepeatButton({ mode: 'off', onPress });
    tree.props.onPress();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('honors disabled state', () => {
    const tree = RepeatButton({ mode: 'off', onPress, disabled: true });
    expect(tree.props.disabled).toBe(true);
    expect(tree.props.accessibilityState.disabled).toBe(true);
  });
});
