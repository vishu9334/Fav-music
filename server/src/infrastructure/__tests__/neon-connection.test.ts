import { Resolver } from 'node:dns/promises';
import { Socket, TcpSocketConnectOpts } from 'node:net';
import pg from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NeonConnectionFactory, NeonIpv4Resolver, NeonIpv4Socket } from '../database/implementations/neon-connection.factory.js';

const host = 'ep-test.region.neon.tech';
const url = `postgresql://test-user:test-password@${host}/test-db?sslmode=require&channel_binding=require`;
afterEach(() => { vi.restoreAllMocks(); });

describe('Neon scoped IPv4 DNS', () => {
  it('uses valid local IPv4 answers first without leaking lookups to the fallback', async () => {
    const fallback = vi.fn();
    const resolver = new NeonIpv4Resolver({ systemResolve4: async () => ['192.0.2.1', '192.0.2.1', '::1'], httpsResolve4: fallback });
    expect(await resolver.resolve(host)).toEqual(['192.0.2.1']);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('recovers refused DNS and empty IPv4 answers through the fallback', async () => {
    const system = vi.fn().mockRejectedValueOnce(new Error('DNS refused')).mockResolvedValueOnce([]);
    const fallback = vi.fn(async () => ['192.0.2.2']);
    const resolver = new NeonIpv4Resolver({ systemResolve4: system, httpsResolve4: fallback });
    expect(await resolver.resolve(host)).toEqual(['192.0.2.2']);
    expect(await resolver.resolve(host)).toEqual(['192.0.2.2']);
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent resolution and resolves afresh after completion', async () => {
    const system = vi.fn().mockResolvedValueOnce(['192.0.2.1']).mockResolvedValueOnce(['192.0.2.2']);
    const resolver = new NeonIpv4Resolver({ systemResolve4: system, httpsResolve4: vi.fn() });
    const first = resolver.resolve(host);
    expect(resolver.resolve(host)).toBe(first);
    expect(await first).toEqual(['192.0.2.1']);
    expect(await resolver.resolve(host)).toEqual(['192.0.2.2']);
    expect(system).toHaveBeenCalledTimes(2);
  });

  it('rejects non-Neon lookups before calling either DNS provider', async () => {
    const system = vi.fn(), fallback = vi.fn();
    const resolver = new NeonIpv4Resolver({ systemResolve4: system, httpsResolve4: fallback });
    await expect(resolver.resolve('neon.tech.attacker.example')).rejects.toThrow('restricted to Neon');
    expect(system).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('fails closed with a sanitized error when both DNS paths fail', async () => {
    const resolver = new NeonIpv4Resolver({ systemResolve4: async () => { throw new Error(url); },
      httpsResolve4: async () => ['::1', 'invalid'] });
    await expect(resolver.resolve(host)).rejects.toThrow('Neon IPv4 DNS resolution failed');
  });

  it('uses bounded HTTPS A-record lookup, disallows redirects and ignores non-A records', async () => {
    vi.spyOn(Resolver.prototype, 'resolve4').mockRejectedValue(new Error('refused'));
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Status: 0,
      Answer: [{ type: 5, data: 'proxy.neon.tech' }, { type: 28, data: '::1' }, { type: 1, data: '192.0.2.3' }] })));
    expect(await new NeonIpv4Resolver().resolve(host)).toEqual(['192.0.2.3']);
    const [requestedUrl, options] = fetcher.mock.calls[0]!;
    expect(String(requestedUrl)).toBe(`https://cloudflare-dns.com/dns-query?name=${host}&type=A`);
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(String(requestedUrl)).not.toContain('test-password');
  });

  it.each([
    [500, { Status: 0, Answer: [{ type: 1, data: '192.0.2.1' }] }],
    [200, { Status: 3, Answer: [] }],
    [200, { Status: 0, Answer: [{ type: 1, data: '::1' }] }],
    [200, { Status: 0, Answer: null }],
  ])('rejects unusable HTTPS DNS response %s %j', async (status, body) => {
    vi.spyOn(Resolver.prototype, 'resolve4').mockRejectedValue(new Error('refused'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));
    await expect(new NeonIpv4Resolver().resolve(host)).rejects.toThrow('Neon IPv4 DNS resolution failed');
  });
});

describe('Neon pg configuration and socket', () => {
  it('keeps the DNS hostname and enforces certificate checking for unsafe SSL input modes', () => {
    const factory = new NeonConnectionFactory();
    for (const mode of ['require', 'disable', 'no-verify']) {
      const config = factory.create(url.replace('sslmode=require', `sslmode=${mode}`));
      expect(new URL(config.connectionString!).hostname).toBe(host);
      const client = new pg.Client(config);
      expect(new URL(config.connectionString!).searchParams.get('sslmode')).toBe('verify-full');
      expect(client.ssl).not.toBe(false);
      // pg represents verify-full as {}; Node TLS rejects invalid certificates by default.
      expect(client.ssl).not.toMatchObject({ rejectUnauthorized: false });
      expect(config.stream?.()).toBeInstanceOf(NeonIpv4Socket);
      expect(config.enableChannelBinding).toBe(true);
    }
  });

  it('preserves credentials, database and other URL options; leaves other databases unchanged', () => {
    const factory = new NeonConnectionFactory();
    const original = new URL(url), result = new URL(factory.create(url).connectionString!);
    for (const key of ['username', 'password', 'pathname', 'hostname'] as const) expect(result[key]).toBe(original[key]);
    expect(result.searchParams.get('channel_binding')).toBe('require');
    const local = 'postgresql://test-user:test-password@localhost/test-db';
    expect(factory.create(local)).toEqual({ connectionString: local });
    expect(() => factory.create('bad input')).toThrow('Invalid PostgreSQL connection configuration');
  });

  it('provides only dynamic IPv4 answers to this socket without replacing the TLS host', async () => {
    const connect = vi.spyOn(Socket.prototype, 'connect').mockReturnThis();
    const resolver = { resolve: vi.fn(async () => ['192.0.2.1', '192.0.2.2']) };
    const socket = new NeonIpv4Socket(resolver);
    socket.connect(5432, host);
    const options = connect.mock.calls[0]![0] as unknown as TcpSocketConnectOpts;
    expect(options).toMatchObject({ host, port: 5432, autoSelectFamily: true });
    if (typeof options !== 'object' || !('lookup' in options) || !options.lookup) throw new Error('Missing lookup');
    const answers = await new Promise((resolve) => options.lookup!(host, { all: true }, (err, addresses) => {
      expect(err).toBeNull(); resolve(addresses);
    }));
    expect(answers).toEqual([{ address: '192.0.2.1', family: 4 }, { address: '192.0.2.2', family: 4 }]);
    socket.destroy();
  });
});
