import { demoCatalog } from '../catalog/demo-catalog';
import { catalogClient, catalogEnabled, mediaLeases } from '../catalog/catalog-runtime';
import { createCatalogStore } from './createCatalogStore';
export { createCatalogStore, EMPTY_CATALOG_PAGE } from './createCatalogStore';
export type { CatalogPageState, CatalogState } from './createCatalogStore';
export const useCatalogStore = createCatalogStore(catalogClient, demoCatalog, mediaLeases, catalogEnabled);
