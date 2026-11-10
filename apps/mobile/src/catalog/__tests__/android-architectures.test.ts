import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { applyArchitectures } = require('../../../plugins/with-android-architectures.js') as { applyArchitectures: (contents: string) => string };

describe('legacy Android packaging architecture selection', () => {
  it('honors the Gradle ABI property without changing package or signing and remains idempotent', () => {
    const source = "android { namespace 'com.favmusic' }";
    const result = applyArchitectures(source);
    expect(result.startsWith(source)).toBe(true);
    expect(result).toContain("findProperty('reactNativeArchitectures')");
    expect(result).toContain('abiFilters.clear()'); expect(applyArchitectures(result)).toBe(result);
    expect(result).not.toMatch(/signingConfig|newArchEnabled/);
  });
  it('is registered for both root and mobile Expo builds', () => {
    for (const file of ['app.json', 'apps/mobile/app.json']) {
      const app = JSON.parse(readFileSync(file, 'utf8')).expo;
      expect(app.plugins.some((value: unknown) => typeof value === 'string' && value.endsWith('/with-android-architectures'))).toBe(true);
    }
  });
});
