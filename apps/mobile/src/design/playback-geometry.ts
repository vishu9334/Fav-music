export function carouselGeometry(width: number): { card: number; inset: number } {
  const viewport = Number.isFinite(width) && width > 0 ? width : 320;
  const card = Math.max(1, Math.min(330, viewport * 0.72));
  return { card, inset: (viewport - card) / 2 };
}
export function carouselIndex(offset: number, card: number, count: number): number {
  if (!Number.isFinite(offset) || !Number.isFinite(card) || card <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offset / card)));
}
/** Equal-vertex play halves morph into pause bars without replacing the icon tree. */
export function playbackPolygon(progress: number, right: boolean): string {
  'worklet';
  const t = Math.max(0, Math.min(1, progress));
  const from = right ? [12, 6.6, 21, 12, 21, 12, 12, 17.4] : [6, 3, 12, 6.6, 12, 17.4, 6, 21];
  const to = right ? [14, 4, 18, 4, 18, 20, 14, 20] : [6, 4, 10, 4, 10, 20, 6, 20];
  let points = '';
  for (let i = 0; i < 8; i += 2) points += `${i ? ' ' : ''}${from[i]! + (to[i]! - from[i]!) * t},${from[i + 1]! + (to[i + 1]! - from[i + 1]!) * t}`;
  return points;
}
