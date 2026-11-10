# Batch 5 audit and scope

CatalogModule is dependency wiring; root track/search resolvers return placeholder null/empty values. Existing MediaService/S3StorageService provide trusted-key signing and private S3 uploads. Reuse the signer; add Controller → Service → Repository catalog reads, bounded keyset search and separate expiring media leases. No cloud calls or uploads are needed to implement/test this locally.

Track stores title, artist/album names, duration, relative media keys and discovery affinities, but lacks release year and licensing-clearance metadata. Prepare nullable metadata/clearance fields locally, without applying SQL/migrations. Catalog access defaults disabled and must fail explicitly while its schema/content/configuration are unavailable. Only published, rights-cleared, unexpired entries can be returned/signed. Private licensing references stay server-side. No fake catalog, auto-seeding or assumed rights.

Mobile currently assumes every ID belongs to the three-demo catalog and would discard unknown saved IDs during hydration. Introduce a shared registry with durable metadata-only cache, preserve unresolved UUID references, and resolve real media URLs immediately before native playback. Keep signed URLs in memory only. Existing demo URLs stay unchanged. Original local video test clips can also provide a clearly labelled bundled technical-audio fallback; no existing music is downloaded or represented as bundled/offline.

Extend existing GraphQL catalog queries and add paginated metadata/media-lease queries. Reuse current screens, lists, collections, recommendations and video controller. Add source labels, loading/retry/pagination behavior and honest unavailable states. Real licensed catalog data, schema approval, configured HTTPS API, S3 credentials/objects and device verification remain external blockers.

No Git, EAS, deployment, live database connections/migrations/writes or cloud-storage changes. Backend source and local Prisma schema/client generation are authorized by this batch; migration artifacts remain unapplied. Authentication stays on HOLD.
