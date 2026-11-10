Authentication restored on 10 November 2026.

The installed app could not authenticate because its existing local-account API and configured ngrok endpoint were offline. Started the validated existing local-account runtime with its existing private PostgreSQL/Redis services. After explicit user approval, restored https://exert-navy-gyration.ngrok-free.dev to http://127.0.0.1:4000. No source, schema, connection-setting, signing or APK change was required.

Local API health and authentication readiness returned HTTP 200. The public HTTPS authentication capability query returned HTTP 200 with authentication enabled; a protected account query without credentials returned HTTP 401 UNAUTHORIZED. The Google Web audience matches the installed APK configuration.

On CPH2599, Retry connection correctly reported that the previous session had expired. Fresh Google sign-in then opened authenticated Home. Listening rooms loaded successfully and showed no active rooms. No test rooms, messages or invitations were created, so live room playback remains unverified.

The existing local backend and user-approved ngrok tunnel remain running. This development APK relies on those services being available; stopping the local API/tunnel makes account and room network operations unavailable again.
