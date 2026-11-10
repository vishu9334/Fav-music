import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
/** Safe still first frame; responds to Android accessibility changes during a session. */
export function useReducedMotion(preferred = false): boolean {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; subscription.remove(); };
  }, []);
  return preferred || reduced;
}
