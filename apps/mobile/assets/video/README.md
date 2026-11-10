# Original native video test media

These clips were generated locally for Aadat Music on 6 November 2026. They contain technical test patterns and synthetic sine tones, with no third-party footage or music. They are test media, not music videos or a production catalog.

- `motion-test.mp4`: 8 seconds, 640×360 at 24 fps, H.264 Constrained Baseline/yuv420p + AAC-LC 44.1 kHz, 440 Hz tone; 461,764 bytes.
- `colour-test.mp4`: 6 seconds, same video/audio formats, 660 Hz tone; 57,008 bytes.
- JPEGs are frames extracted at 1 second from their corresponding clips.

Generation commands (FFmpeg must be installed; no downloads):

```sh
ffmpeg -f lavfi -i 'testsrc2=size=640x360:rate=24' -f lavfi -i 'sine=frequency=440:sample_rate=44100' -t 8 -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -crf 30 -preset veryfast -c:a aac -b:a 64k -movflags +faststart motion-test.mp4
ffmpeg -f lavfi -i 'smptebars=size=640x360:rate=24' -f lavfi -i 'sine=frequency=660:sample_rate=44100' -t 6 -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -crf 30 -preset veryfast -c:a aac -b:a 64k -movflags +faststart colour-test.mp4
ffmpeg -ss 1 -i motion-test.mp4 -frames:v 1 -update 1 motion-test.jpg
ffmpeg -ss 1 -i colour-test.mp4 -frames:v 1 -update 1 colour-test.jpg
```

Both complete clips passed host FFmpeg decoding and FFprobe stream/container inspection; frames were visually inspected. Android native playback is pending an approved runtime containing `expo-video`. Remote HTTPS streaming is unverified and no remote sample URL is configured.
