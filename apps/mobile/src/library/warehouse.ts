import { WarehouseStatus } from '@aadat/contracts';
import { LocalLibrary } from './library.contract';

/** Personal state overlays membership; removal never deletes catalog or collection data. */
export function warehouseStatus(data: LocalLibrary, id: string): WarehouseStatus {
  return data.warehouseStates.find((entry) => entry.trackId === id)?.status ?? WarehouseStatus.ACTIVE;
}
export function warehouseIds(data: LocalLibrary, status: WarehouseStatus = WarehouseStatus.ACTIVE): string[] {
  const states = new Map(data.warehouseStates.map((entry) => [entry.trackId, entry.status]));
  return [...new Set([...data.warehouse, ...data.likes, ...data.favourites, ...data.bookmarks])]
    .filter((id) => (states.get(id) ?? WarehouseStatus.ACTIVE) === status);
}
export function warehouseSources(data: LocalLibrary, id: string): string[] {
  return ([['warehouse', 'Saved'], ['likes', 'Liked'], ['favourites', 'Favourite'], ['bookmarks', 'Bookmarked']] as const)
    .filter(([kind]) => data[kind].includes(id)).map(([, label]) => label);
}
