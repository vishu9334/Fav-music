import type { IResolvers } from 'mercurius';
import type { AccountLibraryCommit, AccountLibrarySnapshot } from '@aadat/contracts';
import type { IGraphQLContext } from '../../shared/graphql/contracts/graphql-resolver.contract.js';
import { ValidationFailedError } from '../../shared/errors/domain.error.js';
import { AccountLibraryService } from './account-library.service.js';
export class AccountLibraryController {
  public constructor(private readonly service: AccountLibraryService) {}
  private wire(value: AccountLibrarySnapshot) { return {revision:value.revision, data:JSON.stringify(value.data)}; }
  public buildResolvers(): IResolvers {
    return {
      Query:{accountLibrary:async (_:unknown,_args:unknown,context:IGraphQLContext) => this.wire(await this.service.read(context.userId))},
      Mutation:{commitAccountLibrary:async (_:unknown,args:{input:{expectedRevision:number;mutationId:string;data:string}},context:IGraphQLContext) => {
        let data;
        try { if (args.input.data.length > 1_000_000) throw new Error(); data = JSON.parse(args.input.data) as AccountLibraryCommit['data']; }
        catch { throw new ValidationFailedError('Invalid collection payload'); }
        const receipt = await this.service.commit(context.userId,{...args.input,data});
        return {appliedRevision:receipt.appliedRevision,snapshot:this.wire(receipt.snapshot)};
      }},
    };
  }
}
