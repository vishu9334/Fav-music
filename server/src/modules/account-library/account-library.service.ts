import { createHash } from 'node:crypto';
import { AccountLibraryCodec, type AccountLibraryCommit, type AccountLibraryReceipt, type AccountLibrarySnapshot } from '@aadat/contracts';
import { ForbiddenError, UnauthorizedError, ValidationFailedError } from '../../shared/errors/domain.error.js';
import type { IAccountLibraryRepository } from './account-library.contract.js';

export class AccountLibraryService {
  public constructor(private readonly repository: IAccountLibraryRepository, private readonly enabled = false) {}
  public isEnabled(): boolean { return this.enabled; }
  private owner(userId?: string): string {
    if (!AccountLibraryCodec.id(userId)) throw new UnauthorizedError('Authentication required');
    if (!this.enabled) throw new ForbiddenError('Account persistence is awaiting approval. Local pending changes are preserved.');
    return userId;
  }
  public read(userId?: string): Promise<AccountLibrarySnapshot> { return this.repository.read(this.owner(userId)); }
  public async commit(userId: string | undefined, input: AccountLibraryCommit): Promise<AccountLibraryReceipt> {
    const owner = this.owner(userId);
    if (!input || !AccountLibraryCodec.id(input.mutationId) || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= 2147483647) throw new ValidationFailedError('Invalid collection revision or request identity');
    let data;
    try { data = AccountLibraryCodec.parse(input.data); } catch { throw new ValidationFailedError('Invalid account collection data'); }
    // References must exist, but unpublished/expired items already saved remain removable and preservable.
    const prior = await this.repository.read(owner), retained = new Set(AccountLibraryCodec.trackIds(prior.data));
    const ids = AccountLibraryCodec.trackIds(data).filter((id) => !retained.has(id)), existing = new Set(await this.repository.existingTrackIds(ids));
    if (ids.some((id) => !existing.has(id))) throw new ValidationFailedError('A collection references an unknown catalog track');
    const command = {...input, data};
    const hash = createHash('sha256').update(JSON.stringify({expectedRevision:command.expectedRevision, data})).digest('hex');
    return this.repository.commit(owner, command, hash);
  }
}
