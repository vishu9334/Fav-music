import { WarehouseStatus } from '@aadat/contracts';
import { COLLECTIONS, LocalLibrary, LocalPlaylist } from './library.contract';

export interface GuestImportSummary {
  readonly added: Readonly<Record<typeof COLLECTIONS[number], number>>;
  readonly playlistsAdded: number;
  readonly renamedPlaylists: number;
  readonly accountWarehouseConflictsKept: number;
}
export interface GuestImportPlan { readonly id: string; readonly summary: GuestImportSummary }

/** Explicit one-time copy. Guest journals are never changed or marked consumed. */
export class GuestImportService {
  public merge(account: LocalLibrary, guest: LocalLibrary): { data: LocalLibrary; summary: GuestImportSummary } {
    if (account.guestImportCompleted) throw new Error('Guest collections have already been copied to this account on this device.');
    if (account.playlists.length + guest.playlists.length > 100) throw new Error('Copy would exceed 100 playlists. No collections were changed; make space before copying.');
    const added = { likes: 0, favourites: 0, bookmarks: 0, warehouse: 0 };
    const lists = {} as Record<typeof COLLECTIONS[number], string[]>;
    for (const kind of COLLECTIONS) {
      lists[kind] = [...new Set([...account[kind], ...guest[kind]])]; added[kind] = lists[kind].length - account[kind].length;
    }
    const accountKnown = new Set([...COLLECTIONS.flatMap((kind) => account[kind]), ...account.warehouseStates.map((state) => state.trackId)]);
    const states = [...account.warehouseStates];
    let conflicts = 0;
    for (const state of guest.warehouseStates) {
      if (accountKnown.has(state.trackId)) {
        const status = account.warehouseStates.find((item) => item.trackId === state.trackId)?.status ?? WarehouseStatus.ACTIVE;
        if (status !== state.status) conflicts++;
      } else states.push(state);
    }
    const playlists: LocalPlaylist[] = [...account.playlists], ids = new Set(playlists.map((p) => p.id));
    const names = new Set(playlists.map((p) => p.name.toLocaleLowerCase())); let renamed = 0, serial = 0;
    for (const playlist of guest.playlists) {
      let id: string; do { id = `guest-copy-${++serial}`; } while (ids.has(id)); ids.add(id);
      let name = playlist.name;
      if (names.has(name.toLocaleLowerCase())) {
        renamed++; let suffix = 1;
        do { name = `${playlist.name.slice(0, 38)} · Guest copy${suffix === 1 ? '' : ` ${suffix}`}`; suffix++; } while (names.has(name.toLocaleLowerCase()));
      }
      names.add(name.toLocaleLowerCase()); playlists.push({ id, name, trackIds: [...playlist.trackIds] });
    }
    return { data: { ...account, ...lists, playlists, warehouseStates: states, guestImportCompleted: true },
      summary: { added, playlistsAdded: guest.playlists.length, renamedPlaylists: renamed, accountWarehouseConflictsKept: conflicts } };
  }
}
