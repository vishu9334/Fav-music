/** Pending starts before the focus/debounce timer; errors never become endless placeholders. */
export function catalogPending(status: string, error: string | null, enabled: boolean): boolean {
  return enabled && !error && (status === 'loading' || status === 'unavailable');
}
