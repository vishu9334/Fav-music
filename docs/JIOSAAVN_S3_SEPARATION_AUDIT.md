# S3 and external development media — separate trust boundaries

6 November 2026. Source/configuration audit only. **No AWS identity, bucket, object or user upload was verified live. No cloud request, storage change or paid resource was made.**

Existing names inspected (values withheld): `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`, `AWS_S3_ENDPOINT`, `AWS_S3_FORCE_PATH_STYLE`, `AWS_S3_PRESIGNED_UPLOAD_EXPIRY_SECONDS`, `AWS_S3_PRESIGNED_DOWNLOAD_EXPIRY_SECONDS`. Region/bucket and static credential fields are populated and credential shapes pass basic checks; that does not establish IAM validity, bucket existence, authorization or rights. Optional custom endpoint configuration is not a verified deployed endpoint. No name or secret was invented.

Existing owned-media implementation is reused: SigV4 GET signing, presigned POST tickets with size/MIME constraints, staged upload validation/promotion and trusted relative keys resolved from application records. Controller routes require real token validation; catalog media ingestion is restricted to administrator roles. Supported avatar upload paths are separate from privileged track audio/video uploads. Redis upload tickets, S3 uploads/promotion and User/Track updates all involve writes; none were invoked.

The JioSaavn adapter returns external HTTPS source references through the MusicProvider interface. It does **not** create S3 keys, copy songs, upload artwork, persist stream URLs to music rows, proxy/decrypt media or assert a content licence. Its separate identity journal contains public reference metadata only. The owned S3 catalog retains its publication/licence gating and short-lived signer.

Release blockers: approved owned media/rights; verified runtime IAM/GetObject and least-privilege upload policies; real byte-range/codec/expiry delivery tests; approved database/session/ticket writes; supported signed-in upload UI and device acceptance. Production user uploads need end-to-end validation beyond the existing backend contracts. JioSaavn development access grants none of those S3 or redistribution permissions.
