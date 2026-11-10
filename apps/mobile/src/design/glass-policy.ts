/** Keep Android's experimental native backdrop capture off the legacy RenderScript path. */
export function allowsNativeBlur(platform: string, api: number, width: number, height: number, active: boolean, reduced: boolean): boolean {
  return active && !reduced && (platform === 'ios' || platform === 'android' && api >= 31)
    && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width * height <= 16_384;
}
