export const bottomTabNames = ['index', 'search', 'library', 'warehouse'] as const;
export type BottomTabName = typeof bottomTabNames[number];
interface NavigationSnapshot {
  readonly index?: number;
  readonly routes: readonly { readonly name: string; readonly params?: object; readonly state?: NavigationSnapshot }[];
}
export const bottomTabPath = (name: BottomTabName): string => name === 'index' ? '/' : `/${name}`;
/** Reuse existing URL params: navigating without them can clear a mounted tab's route state. */
export function bottomTabTarget(name: BottomTabName, state?: NavigationSnapshot): Href {
  const params = state?.routes.find(route => route.name === '(tabs)')?.state?.routes.find(route => route.name === name)?.params;
  return (params ? { pathname: bottomTabPath(name), params } : bottomTabPath(name)) as Href;
}
/** Secondary screens keep the actual underlying tab selected, rather than guessing by screen name. */
export function activeBottomTab(path: string, state?: NavigationSnapshot): BottomTabName | null {
  const direct = bottomTabNames.find(name => bottomTabPath(name) === path);
  if (direct) return direct;
  const tabs = state?.routes.find(route => route.name === '(tabs)')?.state;
  const name = tabs?.routes[tabs.index ?? 0]?.name;
  return bottomTabNames.find(tab => tab === name) ?? null;
}
export function compactDock(width: number, height: number, fontScale: number, left: number, right: number): boolean {
  return width > height && height < 480 && fontScale < 1.3 && width - left - right >= 560;
}
/** Same fixed icon-slot geometry for every tab; only native transform/opacity are animated. */
export function tabHighlightX(width: number, count: number, index: number): number {
  return 4 + (Math.max(0, width - 8) / Math.max(1, count)) * (index + 0.5) - 22;
}
export class TabPressIntent {
  private target = '';
  private at = -Infinity;
  public constructor(private readonly now: () => number = Date.now) {}
  public allow(target: string): boolean {
    const now = this.now();
    if (target === this.target && now - this.at < 240) return false;
    this.target = target; this.at = now; return true;
  }
}
import type { Href } from 'expo-router';

