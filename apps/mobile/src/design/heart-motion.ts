/** Fixed topology keeps the native SVG interpolation small and allocation bounded. */
export function heartPath(progress: number): string {
  'worklet';
  const p = Math.min(1, Math.max(0, progress));
  const top = 4.2 - .4 * p, shoulder = 5.7 - .3 * p;
  return `M12 21 C10.2 19.4 3 14.5 3 8.8 C3 ${top} 8 ${top - 1} 12 ${shoulder + 1.8} C16 ${top - 1} 21 ${top} 21 8.8 C21 14.5 13.8 19.4 12 21 Z`;
}
export function heartMotion(reduced: boolean): { duration: number; peakScale: number } {
  return reduced ? { duration: 0, peakScale: 1 } : { duration: 220, peakScale: 1.08 };
}
