import type { LibrarySyncState } from '../../library/library.contract';
/** Short routine status; actionable network/conflict messages remain intact. */
export function syncCaption(sync:LibrarySyncState):string{
  switch(sync.status){
    case 'synced':return 'Synced';
    case 'syncing':return 'Syncing…';
    case 'pending':return 'Sync pending';
    case 'blocked':return 'Local only';
    case 'offline':return sync.message||'Offline';
    case 'conflict':return sync.message||'Sync conflict';
  }
}
