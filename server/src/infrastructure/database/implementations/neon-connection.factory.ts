import { Resolver } from 'node:dns/promises';
import { isIP, Socket, SocketConnectOpts, LookupFunction } from 'node:net';
import type { ClientConfig } from 'pg';

export interface INeonIpv4Resolver {
  resolve(hostname: string): Promise<string[]>;
}

export interface INeonDnsDependencies {
  readonly systemResolve4: (hostname: string) => Promise<string[]>;
  readonly httpsResolve4: (hostname: string) => Promise<string[]>;
}

function isNeonHostname(hostname: string): boolean {
  return /^ep-[a-z0-9-]+\.(?:[a-z0-9-]+\.)*neon\.tech$/i.test(hostname);
}

/** Only Neon DNS is affected. No global resolver settings or permanent IP cache. */
export class NeonIpv4Resolver implements INeonIpv4Resolver {
  private readonly inFlight = new Map<string, Promise<string[]>>();

  public constructor(private readonly dependencies: INeonDnsDependencies = {
    systemResolve4: async (hostname) => {
      const resolver = new Resolver({ timeout: 750, tries: 1 });
      return resolver.resolve4(hostname);
    },
    httpsResolve4: async (hostname) => {
      const url = new URL('https://cloudflare-dns.com/dns-query');
      url.searchParams.set('name', hostname);
      url.searchParams.set('type', 'A');
      const response = await fetch(url, {
        headers: { accept: 'application/dns-json' },
        redirect: 'error',
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) throw new Error('Neon HTTPS DNS lookup failed');
      const body = await response.json() as { Status?: unknown; Answer?: unknown };
      if (body.Status !== 0 || !Array.isArray(body.Answer)) {
        throw new Error('Neon HTTPS DNS returned no valid answer');
      }
      return body.Answer.flatMap((answer: unknown) => {
        if (!answer || typeof answer !== 'object') return [];
        const record = answer as { type?: unknown; data?: unknown };
        return record.type === 1 && typeof record.data === 'string' ? [record.data] : [];
      });
    },
  }) {}

  public resolve(hostname: string): Promise<string[]> {
    if (!isNeonHostname(hostname)) return Promise.reject(new Error('IPv4 fallback is restricted to Neon hosts'));
    const existing = this.inFlight.get(hostname);
    if (existing) return existing;
    const pending = this.resolveFresh(hostname).finally(() => { this.inFlight.delete(hostname); });
    this.inFlight.set(hostname, pending);
    return pending;
  }

  private async resolveFresh(hostname: string): Promise<string[]> {
    try {
      const addresses = this.validAddresses(await this.dependencies.systemResolve4(hostname));
      if (addresses.length) return addresses;
    } catch { /* The local resolver can refuse valid A records on this network. */ }
    try {
      const addresses = this.validAddresses(await this.dependencies.httpsResolve4(hostname));
      if (addresses.length) return addresses;
    } catch { /* Never echo provider errors or connection configuration. */ }
    throw new Error('Neon IPv4 DNS resolution failed');
  }

  private validAddresses(addresses: string[]): string[] {
    return [...new Set(addresses.filter((address) => isIP(address) === 4))];
  }
}

/** Supplies only IPv4 answers to this socket; pg retains the hostname for TLS/SNI. */
export class NeonIpv4Socket extends Socket {
  public constructor(private readonly resolver: INeonIpv4Resolver) { super(); }

  private readonly lookup: LookupFunction = (hostname, options, callback) => {
    void this.resolver.resolve(hostname).then((addresses) => {
      if (options.all) callback(null, addresses.map((address) => ({ address, family: 4 })));
      else if (addresses[0]) callback(null, addresses[0], 4);
      else callback(new Error('Neon IPv4 DNS returned no addresses'), '', 4);
    }, () => { callback(new Error('Neon IPv4 DNS resolution failed'), '', 4); });
  };

  public override connect(options: SocketConnectOpts, connectionListener?: () => void): this;
  public override connect(port: number, host: string, connectionListener?: () => void): this;
  public override connect(port: number, connectionListener?: () => void): this;
  public override connect(path: string, connectionListener?: () => void): this;
  public override connect(
    optionsOrPort: SocketConnectOpts | number | string,
    hostOrListener?: string | (() => void),
    listener?: () => void,
  ): this {
    if (typeof optionsOrPort === 'string') {
      return super.connect(optionsOrPort, typeof hostOrListener === 'function' ? hostOrListener : listener);
    }
    const options: SocketConnectOpts = typeof optionsOrPort === 'number'
      ? { port: optionsOrPort, host: typeof hostOrListener === 'string' ? hostOrListener : undefined }
      : optionsOrPort;
    const onConnect = typeof hostOrListener === 'function' ? hostOrListener : listener;
    if (!('port' in options)) return super.connect(options, onConnect);
    return super.connect({ ...options, family: 0, autoSelectFamily: true,
      autoSelectFamilyAttemptTimeout: 250, lookup: this.lookup }, onConnect);
  }
}

export class NeonConnectionFactory {
  public constructor(private readonly resolver: INeonIpv4Resolver = new NeonIpv4Resolver()) {}

  public create(connectionString: string): ClientConfig {
    let url: URL;
    try { url = new URL(connectionString); } catch { throw new Error('Invalid PostgreSQL connection configuration'); }
    if (!isNeonHostname(url.hostname)) return { connectionString };
    // pg URL SSL settings replace a separately supplied ssl object. Enforce verify-full
    // in the URL itself so a require/disable/no-verify input cannot bypass validation.
    url.searchParams.set('sslmode', 'verify-full');
    return { connectionString: url.toString(), enableChannelBinding: true,
      stream: () => new NeonIpv4Socket(this.resolver) };
  }
}
