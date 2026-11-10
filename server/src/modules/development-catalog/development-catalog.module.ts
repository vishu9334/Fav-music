import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildSchema, graphql, parse, visit, Kind } from 'graphql';
import type { CatalogQuery, CatalogResourceKind } from '@aadat/contracts';
import type { ICatalogService } from '../catalog/contracts/catalog.contract.js';

/** This key grants only catalog diagnostics; it never creates user/session context. */
export class DevelopmentCatalogAccess {
  private readonly digest: Buffer;
  public constructor(key: string, public readonly expiresAt: number, private readonly now: () => number = Date.now) {
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(key) || !Number.isSafeInteger(expiresAt) || expiresAt <= now() || expiresAt - now() > 7_200_000) {
      throw new Error('A strong, unexpired development catalog key with a maximum two-hour lifetime is required.');
    }
    this.digest = createHash('sha256').update(key).digest();
  }
  public accepts(header: unknown): boolean {
    if (this.now() >= this.expiresAt || typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43,128}$/.test(header)) return false;
    return timingSafeEqual(createHash('sha256').update(header.slice(7)).digest(), this.digest);
  }
  public remainingSeconds(): number { return Math.max(0, Math.floor((this.expiresAt - this.now()) / 1000)); }
}

const schema = buildSchema(`
  enum CatalogMediaKind { AUDIO ARTWORK }
  input CatalogQueryInput { query:String first:Int after:String mood:String season:String yearFrom:Int yearTo:Int undated:Boolean hasVideo:Boolean }
  type CatalogSong { id:ID! title:String! artistName:String! albumName:String durationSeconds:Int! releaseYear:Int attribution:String! discoveryBasis:String sourceLabel:String developmentOnly:Boolean hasVideo:Boolean! moods:[String!]! timeAffinities:[String!]! seasonAffinities:[String!]! }
  type CatalogPage { nodes:[CatalogSong!]! endCursor:String hasNextPage:Boolean! }
  type CatalogMediaLease { trackId:ID! kind:CatalogMediaKind! url:String! issuedAt:String! expiresAt:String expiresInSeconds:Int refreshAfterSeconds:Int }
  type CatalogProviderInfo { sourceLabel:String! developmentOnly:Boolean! resourceKinds:[String!]! remotePagination:Boolean! videoSupported:Boolean! recognitionSupported:Boolean! }
  type CatalogResource { id:ID! kind:String! name:String! artworkUrl:String releaseYear:Int sourceLabel:String! }
  type CatalogResourcePage { nodes:[CatalogResource!]! page:Int! total:Int hasMore:Boolean! }
  type CatalogCollection { resource:CatalogResource! nodes:[CatalogSong!]! page:Int! total:Int hasMore:Boolean! }
  type DevelopmentCatalogAccess { expiresAt:String! expiresInSeconds:Int! }
  type Query { developmentCatalogAccess:DevelopmentCatalogAccess! catalogPage(input:CatalogQueryInput):CatalogPage! track(id:ID!):CatalogSong catalogMedia(ids:[ID!]!,kind:CatalogMediaKind!):[CatalogMediaLease!]! catalogProviderInfo:CatalogProviderInfo! catalogResources(kind:String!,query:String!,page:Int,first:Int):CatalogResourcePage! catalogCollection(id:ID!,page:Int,first:Int):CatalogCollection! }
`);

/** Isolated schema: no account types/mutations, no dummy user, no modification of /graphql. */
export class DevelopmentCatalogModule {
  public constructor(private readonly catalog: ICatalogService, private readonly access: DevelopmentCatalogAccess) {}
  public static fromEnvironment(catalog: ICatalogService, env: NodeJS.ProcessEnv = process.env): DevelopmentCatalogModule | null {
    if (env['AADAT_DEVELOPMENT_CATALOG_ENABLED'] !== 'true') return null;
    if (env['NODE_ENV'] !== 'development' || env['MUSIC_PROVIDER'] !== 'jiosaavn-development' || env['AUTH_ENABLED'] === 'true' || env['ACCOUNT_PERSISTENCE_ENABLED'] === 'true') {
      throw new Error('Read-only development catalog requires the held, development-only Saavn configuration.');
    }
    return new DevelopmentCatalogModule(catalog, new DevelopmentCatalogAccess(env['AADAT_DEVELOPMENT_CATALOG_KEY'] ?? '', Number(env['AADAT_DEVELOPMENT_CATALOG_EXPIRES_AT'])));
  }
  public register(app: FastifyInstance): void {
    app.post('/development/catalog/graphql', { bodyLimit: 32_768 }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!this.access.accepts(request.headers.authorization)) return reply.code(401).send({ errors: [{ message: 'Development catalog access is missing or expired.', extensions: { code: 'DEVELOPMENT_ACCESS_DENIED' } }] });
      const body = request.body as { query?: unknown; variables?: unknown; operationName?: unknown } | null;
      if (!body || typeof body.query !== 'string' || body.query.length > 8192 || body.variables !== undefined && (!body.variables || typeof body.variables !== 'object' || Array.isArray(body.variables)) || body.operationName !== undefined && typeof body.operationName !== 'string') return reply.code(400).send({ errors: [{ message: 'Invalid development catalog request.' }] });
      try {
        const document = parse(body.query); let fields = 0, depth = 0, maximum = 0;
        if (document.definitions.filter(d => d.kind === Kind.OPERATION_DEFINITION).length !== 1 || document.definitions.some(d => d.kind === Kind.OPERATION_DEFINITION && d.operation !== 'query')) throw new Error();
        visit(document, { Field: { enter() { fields++; depth++; maximum = Math.max(maximum, depth); }, leave() { depth--; } }, FragmentSpread() { throw new Error(); } });
        if (fields > 200 || maximum > 8) throw new Error();
        let budget = 0;
        const use = (cost: number) => { if (!Number.isSafeInteger(cost) || cost < 1 || (budget += cost) > 200) throw new Error('Budget'); };
        const rootValue = {
          developmentCatalogAccess: () => { use(1); return { expiresAt: new Date(this.access.expiresAt).toISOString(), expiresInSeconds: this.access.remainingSeconds() }; },
          catalogPage: ({ input }: { input?: CatalogQuery }) => { use(input?.first ?? 20); return this.catalog.page(input ?? {}); },
          track: ({ id }: { id: string }) => { use(1); return this.catalog.track(id); },
          catalogMedia: ({ ids, kind }: { ids: string[]; kind: 'AUDIO' | 'ARTWORK' }) => { use(ids.length); return this.catalog.media(ids, kind); },
          catalogProviderInfo: () => { use(1); if (!this.catalog.providerInfo) throw new Error(); return this.catalog.providerInfo(); },
          catalogResources: ({ kind, query, page, first }: { kind: CatalogResourceKind; query: string; page?: number; first?: number }) => { use(first ?? 20); if (!this.catalog.resources) throw new Error(); return this.catalog.resources(kind, query, page ?? 0, first ?? 20); },
          catalogCollection: ({ id, page, first }: { id: string; page?: number; first?: number }) => { use(first ?? 20); if (!this.catalog.collection) throw new Error(); return this.catalog.collection(id, page ?? 0, first ?? 20); },
        };
        const result = await graphql({ schema, source: body.query, rootValue, variableValues: body.variables as Record<string, unknown> | undefined, operationName: body.operationName as string | undefined });
        return reply.code(result.errors ? 400 : 200).send({ data: result.data ?? null, ...(result.errors ? { errors: result.errors.map(() => ({ message: 'Invalid or unavailable development catalog request.', extensions: { code: 'DEVELOPMENT_CATALOG_ERROR' } })) } : {}) });
      } catch { return reply.code(400).send({ errors: [{ message: 'Invalid or unavailable development catalog request.' }] }); }
    });
  }
}
