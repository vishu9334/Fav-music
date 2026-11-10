# JioSaavn integration — changed files

Compared with the recorded filesystem hashes at the start of the JioSaavn request; no Git command was used. Existing work from the interrupted production task is retained. Compiled output/generated route declarations are omitted from this source list.

Public settings only: `.env` and `server/.env` use the approved v3 URL/development mode/discovery phrase. No credential values are included in this report. Source Prisma schema, mobile environment, lockfile, root/mobile app configuration, entry point, Metro configuration and four icon assets are unchanged in this integration task.

## Backend adapters, catalog and account reference contracts

- [server/src/index.ts](../server/src/index.ts)
- [server/src/infrastructure/music-provider/__tests__/fixtures/v3-album-metadata.json](../server/src/infrastructure/music-provider/__tests__/fixtures/v3-album-metadata.json)
- [server/src/infrastructure/music-provider/__tests__/fixtures/v3-search-metadata.json](../server/src/infrastructure/music-provider/__tests__/fixtures/v3-search-metadata.json)
- [server/src/infrastructure/music-provider/__tests__/fixtures/v3-song-metadata.json](../server/src/infrastructure/music-provider/__tests__/fixtures/v3-song-metadata.json)
- [server/src/infrastructure/music-provider/__tests__/graphql-provider.test.ts](../server/src/infrastructure/music-provider/__tests__/graphql-provider.test.ts)
- [server/src/infrastructure/music-provider/__tests__/provider.test.ts](../server/src/infrastructure/music-provider/__tests__/provider.test.ts)
- [server/src/infrastructure/music-provider/contracts/music-provider.contract.ts](../server/src/infrastructure/music-provider/contracts/music-provider.contract.ts)
- [server/src/infrastructure/music-provider/contracts/provider-identity.contract.ts](../server/src/infrastructure/music-provider/contracts/provider-identity.contract.ts)
- [server/src/infrastructure/music-provider/implementations/file-provider-identity.repository.ts](../server/src/infrastructure/music-provider/implementations/file-provider-identity.repository.ts)
- [server/src/infrastructure/music-provider/implementations/jiosaavn-music-provider.service.ts](../server/src/infrastructure/music-provider/implementations/jiosaavn-music-provider.service.ts)
- [server/src/infrastructure/music-provider/implementations/jiosaavn-v3-music-provider.service.ts](../server/src/infrastructure/music-provider/implementations/jiosaavn-v3-music-provider.service.ts)
- [server/src/infrastructure/music-provider/index.ts](../server/src/infrastructure/music-provider/index.ts)
- [server/src/modules/account-library/prisma-account-library.repository.ts](../server/src/modules/account-library/prisma-account-library.repository.ts)
- [server/src/modules/catalog/catalog.module.ts](../server/src/modules/catalog/catalog.module.ts)
- [server/src/modules/catalog/contracts/catalog.contract.ts](../server/src/modules/catalog/contracts/catalog.contract.ts)
- [server/src/modules/catalog/controllers/catalog-graphql.controller.ts](../server/src/modules/catalog/controllers/catalog-graphql.controller.ts)
- [server/src/modules/catalog/services/provider-catalog.service.ts](../server/src/modules/catalog/services/provider-catalog.service.ts)
- [server/src/modules/catalog/services/provider-discovery.rules.ts](../server/src/modules/catalog/services/provider-discovery.rules.ts)

## Mobile routes, screens, catalog and regressions

- [apps/mobile/app/provider-browse.tsx](../apps/mobile/app/provider-browse.tsx)
- [apps/mobile/app/provider-collection.tsx](../apps/mobile/app/provider-collection.tsx)
- [apps/mobile/src/auth/__tests__/native-auth-transport.test.ts](../apps/mobile/src/auth/__tests__/native-auth-transport.test.ts)
- [apps/mobile/src/auth/adapters/native-google-auth.provider.ts](../apps/mobile/src/auth/adapters/native-google-auth.provider.ts)
- [apps/mobile/src/auth/services/auth-config.ts](../apps/mobile/src/auth/services/auth-config.ts)
- [apps/mobile/src/catalog/__tests__/authenticated-catalog.test.ts](../apps/mobile/src/catalog/__tests__/authenticated-catalog.test.ts)
- [apps/mobile/src/catalog/__tests__/catalog-streaming.test.ts](../apps/mobile/src/catalog/__tests__/catalog-streaming.test.ts)
- [apps/mobile/src/catalog/__tests__/fixtures/jiosaavn-captured-metadata.json](../apps/mobile/src/catalog/__tests__/fixtures/jiosaavn-captured-metadata.json)
- [apps/mobile/src/catalog/__tests__/provider-playback-failure.test.ts](../apps/mobile/src/catalog/__tests__/provider-playback-failure.test.ts)
- [apps/mobile/src/catalog/__tests__/real-provider-features.test.ts](../apps/mobile/src/catalog/__tests__/real-provider-features.test.ts)
- [apps/mobile/src/catalog/catalog-api.ts](../apps/mobile/src/catalog/catalog-api.ts)
- [apps/mobile/src/catalog/catalog-client.service.ts](../apps/mobile/src/catalog/catalog-client.service.ts)
- [apps/mobile/src/catalog/graphql-catalog.repository.ts](../apps/mobile/src/catalog/graphql-catalog.repository.ts)
- [apps/mobile/src/catalog/media-lease.service.ts](../apps/mobile/src/catalog/media-lease.service.ts)
- [apps/mobile/src/components/catalog/CatalogNotice.tsx](../apps/mobile/src/components/catalog/CatalogNotice.tsx)
- [apps/mobile/src/components/catalog/SongList.tsx](../apps/mobile/src/components/catalog/SongList.tsx)
- [apps/mobile/src/data/sample-tracks.ts](../apps/mobile/src/data/sample-tracks.ts)
- [apps/mobile/src/screens/CollectionScreen.tsx](../apps/mobile/src/screens/CollectionScreen.tsx)
- [apps/mobile/src/screens/DiscoveryScreen.tsx](../apps/mobile/src/screens/DiscoveryScreen.tsx)
- [apps/mobile/src/screens/HomeScreen.tsx](../apps/mobile/src/screens/HomeScreen.tsx)
- [apps/mobile/src/screens/ProviderBrowseScreen.tsx](../apps/mobile/src/screens/ProviderBrowseScreen.tsx)
- [apps/mobile/src/screens/ProviderCollectionScreen.tsx](../apps/mobile/src/screens/ProviderCollectionScreen.tsx)
- [apps/mobile/src/screens/SearchScreen.tsx](../apps/mobile/src/screens/SearchScreen.tsx)
- [apps/mobile/src/sharing/share-link.service.ts](../apps/mobile/src/sharing/share-link.service.ts)

## Shared contracts

- [packages/contracts/src/dtos/account-library.dto.ts](../packages/contracts/src/dtos/account-library.dto.ts)
- [packages/contracts/src/dtos/catalog-api.dto.ts](../packages/contracts/src/dtos/catalog-api.dto.ts)
- [packages/contracts/src/graphql/schema.graphql](../packages/contracts/src/graphql/schema.graphql)
- [packages/contracts/src/graphql/schema.ts](../packages/contracts/src/graphql/schema.ts)

## Reports and sanitized evidence

- [docs/JIOSAAVN_ANDROID_ACCEPTANCE_CHECKLIST.md](../docs/JIOSAAVN_ANDROID_ACCEPTANCE_CHECKLIST.md)
- [docs/JIOSAAVN_DEVELOPMENT_INTEGRATION.md](../docs/JIOSAAVN_DEVELOPMENT_INTEGRATION.md)
- [docs/JIOSAAVN_DEVELOPMENT_VERIFICATION.json](../docs/JIOSAAVN_DEVELOPMENT_VERIFICATION.json)
- [docs/JIOSAAVN_S3_SEPARATION_AUDIT.md](../docs/JIOSAAVN_S3_SEPARATION_AUDIT.md)
- [docs/evidence/jiosaavn-development/access-evidence.json](../docs/evidence/jiosaavn-development/access-evidence.json)
- [docs/evidence/jiosaavn-development/album-verification.json](../docs/evidence/jiosaavn-development/album-verification.json)
- [docs/evidence/jiosaavn-development/bounded-stream-results.json](../docs/evidence/jiosaavn-development/bounded-stream-results.json)
- [docs/evidence/jiosaavn-development/build-evidence.json](../docs/evidence/jiosaavn-development/build-evidence.json)
- [docs/evidence/jiosaavn-development/bundle-secret-check.json](../docs/evidence/jiosaavn-development/bundle-secret-check.json)
- [docs/evidence/jiosaavn-development/candidates.json](../docs/evidence/jiosaavn-development/candidates.json)
- [docs/evidence/jiosaavn-development/compatible-candidates.json](../docs/evidence/jiosaavn-development/compatible-candidates.json)
- [docs/evidence/jiosaavn-development/device-evidence.json](../docs/evidence/jiosaavn-development/device-evidence.json)
- [docs/evidence/jiosaavn-development/expo-config.json](../docs/evidence/jiosaavn-development/expo-config.json)
- [docs/evidence/jiosaavn-development/live-verification.json](../docs/evidence/jiosaavn-development/live-verification.json)
- [docs/evidence/jiosaavn-development/stream-head-probes.json](../docs/evidence/jiosaavn-development/stream-head-probes.json)

## Local settings

- `.env`
- `server/.env`
