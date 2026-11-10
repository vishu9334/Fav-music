import { useState, useEffect, useRef } from 'react';

/**
 * High-performance 300ms debouncing hook for search inputs.
 * - Updates immediately (0ms) when input is empty or cleared.
 * - Delays updates by delayMs (default 300ms) while typing.
 * - Automatically cancels pending timers when new input arrives or on unmount.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // If string input is cleared or empty, update immediately to reset search without delay
    if (typeof value === 'string' && value.trim() === '') {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDebounced(value);
      return;
    }

    timerRef.current = setTimeout(() => {
      setDebounced(value);
      timerRef.current = null;
    }, delayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [value, delayMs]);

  // Synchronously return empty string when cleared to eliminate render flicker
  if (typeof value === 'string' && value.trim() === '') {
    return value;
  }

  return debounced;
}
