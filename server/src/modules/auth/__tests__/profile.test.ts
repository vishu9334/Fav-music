import {describe,it,expect,vi} from 'vitest';
import {ChatRetentionPreference} from '@aadat/contracts';
import type {IUserRepository,IUserEntity} from '../contracts/user-repository.contract.js';
import {ProfileService} from '../services/profile.service.js';
const owner='10000000-0000-4000-8000-000000000001';
function fixture(enabled=true){const repository={findById:vi.fn(async()=>({id:owner,status:'ACTIVE'} as IUserEntity)),updateProfile:vi.fn(async(id,data)=>({id,...data} as IUserEntity))} as unknown as IUserRepository;return {repository,service:new ProfileService(repository,enabled)};}
describe('account profile mutation authorization',()=>{
 it('checks authentication and hold before accessing the database',async()=>{const f=fixture(false);await expect(f.service.update(undefined,'Name',ChatRetentionPreference.EPHEMERAL_SESSION_ONLY)).rejects.toMatchObject({code:'UNAUTHORIZED'});await expect(f.service.update(owner,'Name',ChatRetentionPreference.EPHEMERAL_SESSION_ONLY)).rejects.toMatchObject({code:'FORBIDDEN'});expect(f.repository.findById).not.toHaveBeenCalled();});
 it('updates only the verified owner and validates preferences and display names',async()=>{const f=fixture();await f.service.update(owner,'  Valid   Name  ',ChatRetentionPreference.PERSISTENT_HISTORY);expect(f.repository.updateProfile).toHaveBeenCalledWith(owner,{displayName:'Valid Name',chatRetentionPreference:'PERSISTENT_HISTORY'});for(const name of ['', 'x'.repeat(81),'bad\u0000name'])await expect(f.service.update(owner,name,ChatRetentionPreference.EPHEMERAL_SESSION_ONLY)).rejects.toMatchObject({code:'VALIDATION_FAILED'});});
 it('does not update suspended accounts',async()=>{const f=fixture();vi.mocked(f.repository.findById).mockResolvedValue({id:owner,status:'SUSPENDED'} as IUserEntity);await expect(f.service.update(owner,'Name',ChatRetentionPreference.EPHEMERAL_SESSION_ONLY)).rejects.toMatchObject({code:'FORBIDDEN'});expect(f.repository.updateProfile).not.toHaveBeenCalled();});
});
