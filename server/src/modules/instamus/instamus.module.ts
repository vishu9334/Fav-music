import type {IResolvers} from 'mercurius';
import type {IGraphQLContext} from '../../shared/graphql/contracts/graphql-resolver.contract.js';
import {RecognitionService} from './recognition.service.js';
import {PrismaRecognitionRepository} from './prisma-recognition.repository.js';
import type {IMusicRecognitionProvider,IRecognitionCatalog} from './recognition.contract.js';
import { IDatabaseService } from '../../infrastructure/database/contracts/database.contract.js';

export interface IInstaMusModuleDependencies {
  readonly catalog?:IRecognitionCatalog;
  readonly provider?:IMusicRecognitionProvider;
  readonly enabled?:boolean;
  readonly databaseService: IDatabaseService;
}

/**
 * InstaMus Feature Module Composition Root
 */
export class InstaMusModule {
  private readonly dependencies: IInstaMusModuleDependencies;

  public constructor(dependencies: IInstaMusModuleDependencies) {
    this.dependencies = dependencies;
  }

  public buildResolvers():IResolvers {
    const service=new RecognitionService(new PrismaRecognitionRepository(this.dependencies.databaseService),this.dependencies.catalog??{track:async()=>null},this.dependencies.provider??null,this.dependencies.enabled??false);
    return {Mutation:{ingestInstaMusReel:(_:unknown,args:{reelUrl:string;hasProcessingRights?:boolean;isPrivate?:boolean},context:IGraphQLContext)=>service.ingest(context.userId,args.reelUrl,args.hasProcessingRights,args.isPrivate)}};
  }
  public getDependencies(): IInstaMusModuleDependencies {
    return this.dependencies;
  }
}

