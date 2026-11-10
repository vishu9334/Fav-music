import React from 'react';
import { Image } from 'react-native';
import { APP_NAME } from './branding';

/** Reuses the configured app icon byte-for-byte; no replacement artwork or letter logo. */
export function BrandLogo({ size = 32, decorative = false }: { size?: number; decorative?: boolean }): React.JSX.Element {
  return <Image source={require('../../../../assest/icon.png')} style={{ width: size, height: size, borderRadius: Math.round(size * .22) }} resizeMode="contain" resizeMethod="resize"
    accessible={!decorative} accessibilityLabel={decorative ? undefined : `${APP_NAME} logo`} accessibilityIgnoresInvertColors fadeDuration={0} />;
}
