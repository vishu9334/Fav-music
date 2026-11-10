# Phase 3 — External blockers and approval boundaries

6 November 2026. This is a source/configuration and historical-evidence review. **No current live endpoint, database, OAuth or S3 connectivity claim is made.** No credential or database URL is printed. All live writes remain on HOLD.

## Google Login — BLOCKED, plus a local integration failure

- Local failure A1: `apps/mobile/app/login.tsx:1` and `profile.tsx:1` export AuthHoldScreen. AuthScreen, logout/profile UI and AccountCollectionsPanel exist but are not reachable. This must be fixed in source even if infrastructure later becomes ready.
- Public Web OAuth client ID was previously validated and matched against backend configuration; the identifiers remain present. No Google secret belongs on mobile. Android OAuth client/package/signing SHA-1/SHA-256 registration is not independently verified for a final APK.
- `EXPO_PUBLIC_AUTH_ENABLED` is off, exact `EXPO_PUBLIC_AUTH_VERIFIED_ENDPOINT` binding is absent, and backend `AUTH_ENABLED` is off. A configured HTTPS URL is not a verified endpoint. Endpoint ownership, certificate/hostname, device reachability and the credential-free capability declaration must be checked before credentials are acquired/transmitted.
- A final native runtime must contain RNGoogleSignin, SecureStore and AadatAuthTransport version 1. The transport's pure Java policy/client passed local JVM checks, and plugin insertion passed tests; the React Native bridge/package has not been compiled or verified in an Android APK. Missing module fails closed. Expo Go cannot provide this custom native integration.
- Real login/refresh/logout writes app User/session data to PostgreSQL/Redis. Those operations are not approved. Native mocks and injected users are only test evidence.
- [Provider documentation](https://react-native-google-signin.github.io/docs/original) describes the reused Original Android Google SDK as deprecated but functional. Review a future provider upgrade separately; do not add a parallel fake or bypass flow.

Exact release work: repair route wiring with HOLD behavior intact; fix A2 scope callbacks; approve/verify native runtime, Google signing registration, secure endpoint and database/session-write scope; then run real device auth acceptance. Do not enable flags simply to make the UI appear successful.

## Neon/PostgreSQL — HOLD; readiness is historical, not a current probe

- Latest recorded diagnosis in `docs/PHASE_1A_PRISMA_NATIVE_CONNECTIVITY_DIAGNOSIS.md` established **direct native Prisma connectivity PASS**, including a read-only diff and empty-public-schema introspection (P4001). It is inaccurate to describe the native direct engine as permanently broken.
- That same point-in-time diagnosis found pooled native DNS P1001/ENOTFOUND/EREFUSED, while separate Node controls passed. DNS reliability remains a risk; earlier universal IPv6-failure conclusions were superseded by later successful probes.
- Last approved live catalog inspection reported no Aadat public tables/User table. No migration was applied in this audit, and current live state was not rechecked. Reconfirm schema, privileges, conflicts and history immediately before any future separately approved migration.
- Local PostgreSQL rehearsal passed previously. Hosted recovery snapshot/isolated restore verification was explicitly kept blocked by the user. A local rehearsal is not production recovery proof.
- Existing auth draft/history and the Batch 5 local Track proposal must be reconciled. The latter proposes releaseYear, moodTags, licenseReference, licenseAttribution, licenseVerifiedAt, licenseExpiresAt, publicStreamingAllowed and a composite index; these are not an executable migration against an empty public schema. Related tables/enums/foreign keys/history also need review. Neon-managed tables/data must remain untouched.

Exact approval boundary: no CREATE/ALTER/DROP, migration deploy/dev/resolve, baseline/history write, seed/import, row update, snapshot/branch/compute or restore is authorized here. Live read-only checks also need the appropriate scope confirmed; historical approvals are not blanket write permission. Review concrete migration/recovery artifacts and obtain explicit approval before any future write.

## S3/media delivery — BLOCKED / not verified

- Existing private S3 signer/storage contracts and licence-gated catalog API are implemented; tests inject signing/storage dependencies. Region/bucket settings are present. Static credential fields alone cannot establish availability: the AWS default IAM provider may supply credentials, but neither that identity nor object access was verified.
- No bucket/IAM/policy/CDN/CORS change, upload/download of remote music, object HEAD/GET probe or storage mutation was performed.
- Actual objects, approved keys, MIME/codec compatibility, byte ranges, HTTPS/redirect behavior, IAM `GetObject` access and credential/URL expiry need checks with authorized media. Native audio/video and Image delivery must be tested, not inferred from a syntactically valid signed URL.
- Leases are nominally at most 300 seconds and licence-bounded. An IAM credential can expire sooner. Already-open transfers may continue beyond URL expiry; signed URLs are bearer capabilities, not instantaneous playback-revocation controls. See [AWS expiry semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).
- The public catalog repository still uses RN fetch; `redirect: 'error'` is not sufficient proof of final-origin enforcement on this RN version. Unlike auth's native path, that catalog trust boundary needs an explicit policy and verification before production use (A7). Relative keys remain selectable through the legacy Track SDL even though CatalogPage metadata strips them; review that legacy surface (A8).

Exact release work: provide/verify least-privilege runtime identity and existing authorized objects/read endpoint; test signing, real 200/206 delivery, network failures and expiry. Any object import, IAM/bucket/CDN configuration or deployment needs separate approval.

## Licensed music/catalog — BLOCKED / missing production content

- No real production catalog was seeded, imported or represented as verified. Existing three SoundHelix streams are demo-labelled and require internet. Their displayed demo artist/album labels are not verified canonical production metadata; source comments refer to archive/Wikimedia while URLs are SoundHelix. Audit rights, metadata and required attribution before public distribution; this report does not infer distribution rights from URL accessibility.
- The two bundled MP4s and two M4As are original technical test patterns/tones, not real music/videos. All four decode locally and match exported bytes. They provide test media, not production content or evidence of Android playback.
- Supply approved audio/video/artwork objects, canonical metadata/verified years, public attribution and private rights evidence. Set publication/public-streaming/verification fields only through an approved data workflow. No release years, media URLs or rights assertions should be invented to populate empty categories.
- Complete catalog-category pagination, account-scope metadata restoration, and real-video multi-item discovery if required for the final release (A4–A6/A9). A 500-entry local registry is not a complete remote catalog.

Exact approval boundary: publication/import/clearance record writes and media upload are separate database/storage changes; neither is authorized by this audit.

## Cloud synchronization — MISSING implementation and BLOCKED approval

- Current account persistence is **per-device local journals**, not remote or multi-device storage. The explicit one-time guest copy is local, preserves guest files and is not a distributed sync engine. Its UI is currently unreachable because of A1.
- `mySavedCollections`, `myWarehouse`, `myFavorites` and associated root mutations remain NOT_IMPLEMENTED. WarehouseModule is composition scaffolding. `cloudCollectionsEnabled` is false; no background cloud writer exists.
- `docs/PHASE_2_BATCH_6_SYNC_DESIGN.md` specifies a future owner-derived, revision/CAS, idempotent operation/outbox and tombstone protocol. This design has not been implemented or deployed. Existing Prisma models do not supply the full approved revision/change-log support.
- Implement and test owner authorization, read/write repositories/APIs, first-import review, durable outbox/ack recovery, stale revision conflicts, deletions, reordering and cross-device races in an isolated approved environment before production. Include account switching and offline logout so work is never replayed under another owner.

Exact approval boundary: schema/history/recovery plan, staging resources if needed, endpoint deployment and live user-data reads/writes/imports require their own explicit approval. Do not relabel local journals as cloud synchronization.

## Native build/device gate — pending approval and fixes

- Expo configs correctly specify com.favmusic, SDK 52 and the same EAS project; icon fields agree. The excluded legacy `apps/mobile/android` project specifies com.aadat.music and debug signing for release. It is not a valid final direct-build target. Regenerate/reconcile from reviewed Expo configuration in an approved build workflow, then inspect the actual APK package, signature, modules and icon resources. No existing native files were changed here.
- Installed RN 0.76.6 intentionally remains pinned under Gate 5K; installed Expo 52.0.49 recommends RN 0.76.9. The SDK major/minor pairing is supported and Metro/tests pass, but native patch alignment is not exact. Review the decision without blindly changing singleton overrides.
- No APK/EAS/native build, installation, app launch or device E2E was performed. The checklist is a future test plan, not acceptance evidence. Existing manual seek confirmation is historical only.

These blockers are independent. Removing a database hold does not repair routes, implement cloud sync, supply licensed content, correct the legacy native target or prove device playback.
