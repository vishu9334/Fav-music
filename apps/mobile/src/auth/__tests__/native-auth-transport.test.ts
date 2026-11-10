import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { nativeAuthTransport } from '../adapters/native-auth.transport';

const native = vi.hoisted(() => ({ version: 1, request: vi.fn(), requestHttp: undefined as ReturnType<typeof vi.fn> | undefined, cancel: vi.fn() }));
vi.mock('react-native', () => ({ NativeModules: { AadatAuthTransport: native } }));
beforeEach(() => { vi.clearAllMocks(); native.version = 1; native.requestHttp = vi.fn(); });
describe('Fail-closed Android authentication transport', () => {
  it('sends room reads as GET without a body instead of silently converting them to POST', async () => {
    native.requestHttp!.mockResolvedValue({ status: 200, body: '{"rooms":[]}' });
    const response = await nativeAuthTransport('https://api.example.test/api/v1/rooms', { method: 'GET', headers: { Accept: 'application/json' } });
    expect(await response.json()).toEqual({ rooms: [] });
    expect(native.requestHttp).toHaveBeenCalledExactlyOnceWith(expect.any(String), 'https://api.example.test/api/v1/rooms', 'https://api.example.test/api/v1/rooms', 'GET', '', null);
    expect(native.request).not.toHaveBeenCalled();
  });
  it('requires the new native GET capability and refuses unsupported methods before sending anything', async () => {
    native.requestHttp = undefined;
    await expect(nativeAuthTransport('https://api.example.test/api/v1/rooms', { method: 'GET' })).rejects.toMatchObject({ code: 'CONFIGURATION' });
    await expect(nativeAuthTransport('https://api.example.test/api/v1/rooms', { method: 'DELETE' })).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(native.request).not.toHaveBeenCalled();
  });
  it('uses the genuine native transport API with the approved endpoint and no fetch fallback', async () => {
    native.request.mockResolvedValue({ status: 200, body: '{"data":{"ok":true}}' });
    const result = await nativeAuthTransport('https://api.example.test/graphql', { body: '{}', headers: { Authorization: 'Bearer fixture' } });
    expect(result.ok).toBe(true); expect(await result.json()).toEqual({ data: { ok: true } });
    expect(native.request).toHaveBeenCalledWith(expect.any(String), 'https://api.example.test/graphql', 'https://api.example.test/graphql', '{}', 'fixture');
  });
  it('refuses an APK with no compatible guard before native credentials can be sent', async () => {
    native.version = 0;
    await expect(nativeAuthTransport('https://api.example.test/graphql', { body: '{}' })).rejects.toMatchObject({ code: 'CONFIGURATION' });
    expect(native.request).not.toHaveBeenCalled();
  });
  it('cancels timed-out native operations and masks native error details', async () => {
    native.request.mockImplementationOnce(() => new Promise(() => {})); const abort = new AbortController();
    const pending = nativeAuthTransport('https://api.example.test/graphql', { body: '{}', headers: {}, signal: abort.signal });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'OFFLINE' }); await vi.waitFor(() => expect(native.request).toHaveBeenCalled()); abort.abort(); await rejected; expect(native.cancel).toHaveBeenCalledOnce();
    native.request.mockRejectedValueOnce(new Error('private-token')); await expect(nativeAuthTransport('https://api.example.test/graphql', { body: '{}', headers: {} })).rejects.not.toThrow('private-token');
  });
});

describe('Auth transport Expo plugin registration', () => {
  it('registers one package idempotently in the existing Kotlin template, while preserving original packages', () => {
    const require = createRequire(import.meta.url);
    const plugin = require('../../../plugins/with-auth-transport.js') as { applyMainApplication(source: string): string };
    const configured = readFileSync('apps/mobile/android/app/src/main/java/com/favmusic/MainApplication.kt', 'utf8');
    expect(plugin.applyMainApplication(configured)).toBe(configured);
    const original = configured.replace('import com.favmusic.auth.AadatAuthPackage\n','').replace('.also { it.add(AadatAuthPackage()) }','');
    const patched = plugin.applyMainApplication(original);
    expect(plugin.applyMainApplication(patched)).toBe(patched);
    expect(patched).toContain('PackageList(this).packages.also { it.add(AadatAuthPackage()) }');
    expect(patched.replace('\nimport com.favmusic.auth.AadatAuthPackage\n', '').replace('.also { it.add(AadatAuthPackage()) }', '').replace(/\n\n/g,'\n')).toBe(original.replace(/\n\n/g,'\n'));
    expect(() => plugin.applyMainApplication('unsupported template')).toThrow('reviewed');
  });
  it('configures the plugin at both Expo roots and keeps all icon purposes unchanged', () => {
    for (const file of ['app.json', 'apps/mobile/app.json']) {
      const config = JSON.parse(readFileSync(file, 'utf8')).expo;
      expect(config.plugins.some((plugin: unknown) => typeof plugin === 'string' && plugin.endsWith('/with-auth-transport'))).toBe(true);
      expect(config.icon).toMatch(/assest\/icon.png$/); expect(config.android.adaptiveIcon.foregroundImage).toMatch(/assest\/adaptive-icon.png$/);
      expect(config.android.adaptiveIcon.backgroundColor).toBe('#09090b'); expect(config.web.favicon).toMatch(/assest\/favicon.png$/);
    }
  });
});
