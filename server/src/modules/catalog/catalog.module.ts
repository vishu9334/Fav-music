import {JioSaavnV3MusicProviderService} from '../../infrastructure/music-provider/implementations/jiosaavn-v3-music-provider.service.js';
import {resolve} from 'node:path';
import {JioSaavnMusicProviderService} from '../../infrastructure/music-provider/implementations/jiosaavn-music-provider.service.js';
import {FileProviderIdentityRepository} from '../../infrastructure/music-provider/implementations/file-provider-identity.repository.js';
import {ProviderCatalogService} from './services/provider-catalog.service.js';
import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';
import { IS3StorageService } from '../../infrastructure/storage/contracts/storage.contract.js';
import { ICatalogRepository, ICatalogService } from './contracts/catalog.contract.js';
import { PrismaCatalogRepository } from './repositories/prisma-catalog.repository.js';
import { CatalogService } from './services/catalog.service.js';
import { CatalogGraphQLController } from './controllers/catalog-graphql.controller.js';

export interface ICatalogModuleDependencies {
  readonly databaseService: IDatabaseService;
  readonly storageService: IS3StorageService;
  readonly repository?: ICatalogRepository;
  readonly enabled?: boolean;
}

/**
 * Catalog Feature Module Composition Root
 */
export class CatalogModule {
  private readonly dependencies: ICatalogModuleDependencies;
  private readonly service: ICatalogService;

  public constructor(dependencies: ICatalogModuleDependencies) {
    this.dependencies = dependencies;
    const provider=process.env['MUSIC_PROVIDER'];
    if(provider==='jiosaavn-development'||provider==='jiosaavn-v3-development') {
      if(process.env['NODE_ENV']==='production')throw new Error('The development music provider cannot be used for production distribution.');
      const Adapter=provider==='jiosaavn-v3-development'?JioSaavnV3MusicProviderService:JioSaavnMusicProviderService;
      this.service=new ProviderCatalogService(new Adapter({apiBaseUrl:process.env['JIOSAAVN_API_BASE_URL']??''}),new FileProviderIdentityRepository(process.env['MUSIC_PROVIDER_IDENTITY_FILE']??resolve('.aadat-music/provider-identities')),undefined,process.env['MUSIC_DISCOVERY_QUERY']??'Aadat');
      return;
    }
    this.service = new CatalogService(dependencies.repository ?? new PrismaCatalogRepository(dependencies.databaseService),
      dependencies.storageService, dependencies.enabled ?? process.env['CATALOG_ENABLED'] === 'true');
  }

  public getDependencies(): ICatalogModuleDependencies {
    return this.dependencies;
  }
  public getService(): ICatalogService { return this.service; }
  public getController(): CatalogGraphQLController { return new CatalogGraphQLController(this.service, true); }
}

