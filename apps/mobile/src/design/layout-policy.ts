/** Full forms/controls enter scroll flow on short windows or with large accessibility text. */
export function useFlowingTransport(width: number, height: number, fontScale: number): boolean {
  return height < 680 || width < 340 || fontScale >= 1.3;
}
export function videoControlsInline(height: number, fontScale: number, error: boolean): boolean {
  return height < 600 || fontScale >= 1.3 || error;
}
export function normalTextContrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channel = (index: number) => { const value = parseInt(hex.slice(index, index + 2), 16) / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; };
    return channel(1) * .2126 + channel(3) * .7152 + channel(5) * .0722;
  };
  const a = luminance(foreground), b = luminance(background); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
