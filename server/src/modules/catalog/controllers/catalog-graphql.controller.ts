import { IResolvers } from 'mercurius';
import type { CatalogMediaKind, CatalogQuery, CatalogSong, CatalogResourceKind } from '@aadat/contracts';
import { UnauthorizedError, ValidationFailedError } from '../../../shared/errors/domain.error.js';
import { ICatalogService } from '../contracts/catalog.contract.js';

export class CatalogGraphQLController {
  private readonly budgets = new WeakMap<object, number>();
  public constructor(private readonly service: ICatalogService, private readonly authenticatedOnly = false) {}
  private budget(context: object, cost: number): void {
    if(this.authenticatedOnly && !(context as {userId?:string}).userId)throw new UnauthorizedError('Authentication required');
    const used = (this.budgets.get(context) ?? 0) + cost;
    if (!Number.isSafeInteger(cost) || cost < 1 || used > 200) throw new ValidationFailedError('Catalog request budget exceeded.');
    this.budgets.set(context, used);
  }
  public buildResolvers(): IResolvers {
    return {
      Query: {
        catalogProviderInfo:(_:unknown,_args:unknown,context:object)=>{this.budget(context,1);return this.service.providerInfo?.()??{sourceLabel:'Aadat owned catalog',developmentOnly:false,resourceKinds:[],remotePagination:true,videoSupported:true,recognitionSupported:false};},
        catalogResources:(_:unknown,args:{kind:CatalogResourceKind;query:string;page?:number;first?:number},context:object)=>{this.budget(context,args.first??20);if(!this.service.resources)throw new ValidationFailedError('Resource browsing is unavailable for this provider.');return this.service.resources(args.kind,args.query,args.page??0,args.first??20);},
        catalogCollection:(_:unknown,args:{id:string;page?:number;first?:number},context:object)=>{this.budget(context,args.first??20);if(!this.service.collection)throw new ValidationFailedError('Resource browsing is unavailable for this provider.');return this.service.collection(args.id,args.page??0,args.first??20);},
        catalogPage: (_: unknown, args: { input?: CatalogQuery }, context: object) => {
          this.budget(context, args.input?.first ?? 20); return this.service.page(args.input ?? {});
        },
        track: (_: unknown, args: { id: string }, context: object) => { this.budget(context, 1); return this.service.track(args.id); },
        searchCatalog: async (_: unknown, args: { query: string; limit?: number }, context: object) => {
          this.budget(context, args.limit ?? 20);
          const page = await this.service.page({ query: args.query, first: args.limit ?? 20 });
          // Legacy Track fields are resolved from authorized entities, never supplied client keys.
          return (await Promise.all(page.nodes.map((node) => this.service.track(node.id)))).filter((track): track is CatalogSong => track !== null);
        },
        catalogMedia: (_: unknown, args: { ids: string[]; kind: CatalogMediaKind }, context: object) => {
          this.budget(context, args.ids.length); return this.service.media(args.ids, args.kind);
        },
      },
      Track: {
        releaseYear: (track: CatalogSong) => track.releaseYear,
        audioPlaybackUrl: async (track: CatalogSong, _: unknown, context: object) => { this.budget(context, 1); return (await this.service.media([track.id], 'AUDIO'))[0]!.url; },
        videoPlaybackUrl: async (track: CatalogSong, _: unknown, context: object) => { if (!track.hasVideo) return null; this.budget(context, 1); return (await this.service.media([track.id], 'VIDEO'))[0]!.url; },
        artworkUrl: async (track: CatalogSong, _: unknown, context: object) => { this.budget(context, 1); return (await this.service.media([track.id], 'ARTWORK'))[0]!.url; },
      },
    };
  }
}
