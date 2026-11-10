import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, ui } from './ui';

export function ShareButton({ title, share, disabled = false, identity = title }: { title: string; share: (current: () => boolean) => Promise<void>; disabled?: boolean; identity?: string }): React.JSX.Element {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const active = useRef(false), generation = useRef(0);
  useEffect(() => {
    generation.current++; active.current = false; setBusy(false); setError(null);
    return () => { generation.current++; };
  }, [identity]);
  return <View style={{ gap: 8 }}><Button title={busy ? 'Opening share sheet…' : title} secondary disabled={disabled || busy} onPress={() => {
    if (disabled || active.current) return;
    active.current = true;
    const version = generation.current;
    setBusy(true); setError(null);
    void Promise.resolve().then(() => version === generation.current ? share(() => version === generation.current) : undefined).catch((e: unknown) => {
      if (version === generation.current) setError(e instanceof Error ? e.message : 'Sharing is unavailable. Please retry.');
    }).finally(() => { if (version === generation.current) { active.current = false; setBusy(false); } });
  }} />{error && <Text style={ui.body} accessibilityLiveRegion="polite">{error}</Text>}</View>;
}
