import { ChatRetentionPreference } from '@aadat/contracts';
import type { IUserRepository, IUserEntity } from '../contracts/user-repository.contract.js';
import { ForbiddenError,UnauthorizedError,ValidationFailedError } from '../../../shared/errors/domain.error.js';
export class ProfileService {
 public constructor(private readonly repository:IUserRepository,private readonly enabled=false){}
 public async update(owner:string|undefined,displayName:string,preference:ChatRetentionPreference):Promise<IUserEntity>{
  if(!owner)throw new UnauthorizedError('Authentication required');
  if(!this.enabled)throw new ForbiddenError('Account changes are awaiting approval');
  const name=typeof displayName==='string'?displayName.normalize('NFKC').trim().replace(/\s+/g,' '):'';
  if(!name||name.length>80||/[\u0000-\u001f\u007f]/.test(name)||!Object.values(ChatRetentionPreference).includes(preference))throw new ValidationFailedError('Use a name of 1–80 characters and a valid privacy preference');
  const user=await this.repository.findById(owner);
  if(!user||user.status!=='ACTIVE')throw new ForbiddenError('Account is unavailable');
  if(!this.repository.updateProfile)throw new ForbiddenError('Profile updates are unavailable');
  return this.repository.updateProfile(owner,{displayName:name,chatRetentionPreference:preference});
 }
}
