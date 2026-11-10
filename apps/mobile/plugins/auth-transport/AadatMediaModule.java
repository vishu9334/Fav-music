package com.favmusic.auth;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.AudioManager;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import android.util.Size;
import android.view.Window;
import android.view.WindowManager;
import com.facebook.react.bridge.*;

import java.io.File;
import java.io.FileOutputStream;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class AadatMediaModule extends ReactContextBaseJavaModule {
  private static final String TAG = "AadatMedia";

  public AadatMediaModule(ReactApplicationContext context) {
    super(context);
  }

  @Override
  public String getName() {
    return "AadatMedia";
  }

  @ReactMethod
  public void getLocalVideos(Promise promise) {
    try {
      WritableArray array = Arguments.createArray();
      Set<String> seen = new HashSet<>();
      ContentResolver resolver = getReactApplicationContext().getContentResolver();

      // 1. Query Android MediaStore for local device videos
      Uri collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
      String[] projection = new String[] {
        MediaStore.Video.Media._ID,
        MediaStore.Video.Media.DISPLAY_NAME,
        MediaStore.Video.Media.TITLE,
        MediaStore.Video.Media.DURATION,
        MediaStore.Video.Media.SIZE,
        MediaStore.Video.Media.DATA
      };

      try (Cursor cursor = resolver.query(
          collection,
          projection,
          null,
          null,
          MediaStore.Video.Media.DATE_MODIFIED + " DESC")) {

        if (cursor != null) {
          int idCol = cursor.getColumnIndex(MediaStore.Video.Media._ID);
          int nameCol = cursor.getColumnIndex(MediaStore.Video.Media.DISPLAY_NAME);
          int titleCol = cursor.getColumnIndex(MediaStore.Video.Media.TITLE);
          int durCol = cursor.getColumnIndex(MediaStore.Video.Media.DURATION);
          int sizeCol = cursor.getColumnIndex(MediaStore.Video.Media.SIZE);
          int dataCol = cursor.getColumnIndex(MediaStore.Video.Media.DATA);

          while (cursor.moveToNext()) {
            try {
              long id = idCol >= 0 ? cursor.getLong(idCol) : -1;
              String displayName = nameCol >= 0 ? cursor.getString(nameCol) : "";
              String title = titleCol >= 0 ? cursor.getString(titleCol) : "";
              long durationMs = durCol >= 0 ? cursor.getLong(durCol) : 0;
              long size = sizeCol >= 0 ? cursor.getLong(sizeCol) : 0;
              String dataPath = dataCol >= 0 ? cursor.getString(dataCol) : "";

              if (displayName == null || displayName.isEmpty()) {
                displayName = title != null && !title.isEmpty() ? title : "Video " + id;
              }

              // Prefer content URI for MediaStore items; fallback to file URI if available
              String uriStr = (id >= 0)
                  ? ContentUris.withAppendedId(collection, id).toString()
                  : (dataPath != null && !dataPath.isEmpty() ? "file://" + dataPath : "");

              if (!uriStr.isEmpty() && !seen.contains(uriStr)) {
                seen.add(uriStr);
                if (dataPath != null && !dataPath.isEmpty()) {
                  seen.add("file://" + dataPath);
                  seen.add(dataPath);
                }

                WritableMap map = Arguments.createMap();
                map.putString("id", "media-" + id);
                map.putString("title", cleanTitle(displayName));
                map.putString("filename", displayName);
                map.putString("uri", uriStr);
                if (dataPath != null && !dataPath.isEmpty()) {
                  map.putString("filePath", dataPath);
                }
                map.putDouble("duration", durationMs > 0 ? durationMs / 1000.0 : 0);
                map.putDouble("size", size);
                map.putString("description", formatSize(size) + " · Downloaded");

                String thumbUri = getOrCreateVideoThumbnail(uriStr, dataPath);
                if (thumbUri != null) {
                  map.putString("thumbnailUri", thumbUri);
                }

                array.pushMap(map);
              }
            } catch (Exception rowEx) {
              Log.w(TAG, "Error parsing media row: " + rowEx.getMessage());
            }
          }
        }
      } catch (Exception e) {
        Log.e(TAG, "MediaStore query failed: " + e.getMessage(), e);
      }

      // 2. Scan internal app storage /videos/
      File internalVideosDir = new File(getReactApplicationContext().getFilesDir(), "videos");
      scanFolder(internalVideosDir, array, seen, "App storage", 0);

      // 3. Scan public Downloads folder directly
      File downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
      scanFolder(downloadDir, array, seen, "Downloads", 0);

      // 4. Scan public Movies folder directly
      File moviesDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES);
      scanFolder(moviesDir, array, seen, "Movies", 0);

      // 5. Scan direct path /sdcard/Download
      File sdcardDownload = new File("/sdcard/Download");
      scanFolder(sdcardDownload, array, seen, "Downloads", 0);

      Log.i(TAG, "Found total " + array.size() + " local videos on device");
      promise.resolve(array);
    } catch (Exception e) {
      Log.e(TAG, "getLocalVideos failed: " + e.getMessage(), e);
      promise.reject("MEDIA_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void setScreenBrightness(double brightness, Promise promise) {
    try {
      final Activity activity = getCurrentActivity();
      if (activity == null) {
        promise.resolve(false);
        return;
      }
      final float val = (float) Math.max(0.01, Math.min(1.0, brightness));
      activity.runOnUiThread(() -> {
        try {
          Window window = activity.getWindow();
          WindowManager.LayoutParams lp = window.getAttributes();
          lp.screenBrightness = val;
          window.setAttributes(lp);
        } catch (Exception e) {
          Log.e(TAG, "Failed to set screen brightness: " + e.getMessage());
        }
      });
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("BRIGHTNESS_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void getScreenBrightness(Promise promise) {
    try {
      Activity activity = getCurrentActivity();
      if (activity != null) {
        float b = activity.getWindow().getAttributes().screenBrightness;
        promise.resolve(b < 0 ? 0.5 : (double) b);
      } else {
        promise.resolve(0.5);
      }
    } catch (Exception e) {
      promise.resolve(0.5);
    }
  }

  @ReactMethod
  public void setSystemVolume(double volumeFraction, Promise promise) {
    try {
      AudioManager am = (AudioManager) getReactApplicationContext().getSystemService(Context.AUDIO_SERVICE);
      if (am != null) {
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int target = (int) Math.round(Math.max(0.0, Math.min(1.0, volumeFraction)) * max);
        am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0);
        promise.resolve(max > 0 ? (target / (double) max) : volumeFraction);
        return;
      }
      promise.resolve(volumeFraction);
    } catch (Exception e) {
      promise.reject("VOLUME_ERROR", e.getMessage(), e);
    }
  }

  @ReactMethod
  public void getSystemVolume(Promise promise) {
    try {
      AudioManager am = (AudioManager) getReactApplicationContext().getSystemService(Context.AUDIO_SERVICE);
      if (am != null) {
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int cur = am.getStreamVolume(AudioManager.STREAM_MUSIC);
        promise.resolve(max > 0 ? (cur / (double) max) : 0.5);
        return;
      }
      promise.resolve(0.5);
    } catch (Exception e) {
      promise.resolve(0.5);
    }
  }

  @ReactMethod
  public void getVideoAudioTracks(String uriOrPath, Promise promise) {
    try {
      WritableArray tracks = Arguments.createArray();
      boolean foundTracks = false;

      // 1. Android MediaExtractor on uriOrPath (local file or content uri)
      if (uriOrPath != null && !uriOrPath.isEmpty()) {
        MediaExtractor extractor = new MediaExtractor();
        try {
          if (uriOrPath.startsWith("content://")) {
            extractor.setDataSource(getReactApplicationContext(), Uri.parse(uriOrPath), null);
          } else {
            String path = uriOrPath.startsWith("file://") ? uriOrPath.substring(7) : uriOrPath;
            extractor.setDataSource(path);
          }
          int trackCount = extractor.getTrackCount();
          int audioIdx = 0;
          for (int i = 0; i < trackCount; i++) {
            MediaFormat fmt = extractor.getTrackFormat(i);
            String mime = fmt.containsKey(MediaFormat.KEY_MIME) ? fmt.getString(MediaFormat.KEY_MIME) : "";
            if (mime != null && mime.startsWith("audio/")) {
              WritableMap t = Arguments.createMap();
              t.putInt("index", audioIdx);
              t.putString("id", "track-" + audioIdx);
              String lang = fmt.containsKey(MediaFormat.KEY_LANGUAGE) ? fmt.getString(MediaFormat.KEY_LANGUAGE) : "und";
              int channels = fmt.containsKey(MediaFormat.KEY_CHANNEL_COUNT) ? fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT) : 2;
              String label = getLanguageDisplayName(lang) + (channels > 2 ? " (" + channels + "ch)" : " (Stereo)");
              t.putString("language", lang);
              t.putString("label", label);
              t.putBoolean("selected", audioIdx == 0);
              tracks.pushMap(t);
              audioIdx++;
            }
          }
          if (audioIdx > 0) {
            foundTracks = true;
          }
        } catch (Exception e) {
          Log.w(TAG, "MediaExtractor failed: " + e.getMessage());
        } finally {
          try { extractor.release(); } catch (Exception ignore) {}
        }
      }

      // 2. Fallback to active ExoPlayer tracks via reflection (no compile-time media3 imports)
      if (!foundTracks) {
        try {
          Class<?> vmClass = Class.forName("expo.modules.video.VideoManager");
          Object vm = vmClass.getField("INSTANCE").get(null);
          java.lang.reflect.Field field = vmClass.getDeclaredField("videoPlayersToVideoViews");
          field.setAccessible(true);
          Map<?, ?> map = (Map<?, ?>) field.get(vm);
          if (map != null && !map.isEmpty()) {
            for (Object vp : map.keySet()) {
              if (vp != null) {
                java.lang.reflect.Field pField = vp.getClass().getDeclaredField("player");
                pField.setAccessible(true);
                Object exo = pField.get(vp);
                if (exo != null) {
                  java.lang.reflect.Method getTracksMethod = exo.getClass().getMethod("getCurrentTracks");
                  Object currentTracks = getTracksMethod.invoke(exo);
                  if (currentTracks != null) {
                    java.lang.reflect.Method getGroupsMethod = currentTracks.getClass().getMethod("getGroups");
                    java.util.List<?> groups = (java.util.List<?>) getGroupsMethod.invoke(currentTracks);
                    int audioIndex = 0;
                    if (groups != null) {
                      for (Object group : groups) {
                        java.lang.reflect.Method getTypeMethod = group.getClass().getMethod("getType");
                        int type = (int) getTypeMethod.invoke(group);
                        if (type == 1) { // 1 == C.TRACK_TYPE_AUDIO
                          java.lang.reflect.Field lengthField = group.getClass().getDeclaredField("length");
                          lengthField.setAccessible(true);
                          int len = (int) lengthField.get(group);
                          java.lang.reflect.Method getFormatMethod = group.getClass().getMethod("getTrackFormat", int.class);
                          java.lang.reflect.Method isSelectedMethod = group.getClass().getMethod("isTrackSelected", int.class);
                          for (int i = 0; i < len; i++) {
                            Object format = getFormatMethod.invoke(group, i);
                            boolean isSel = (boolean) isSelectedMethod.invoke(group, i);
                            java.lang.reflect.Field langField = format.getClass().getField("language");
                            String lang = (String) langField.get(format);
                            if (lang == null) lang = "und";
                            String label = getLanguageDisplayName(lang);

                            WritableMap t = Arguments.createMap();
                            t.putInt("index", audioIndex);
                            t.putString("id", "track-" + audioIndex);
                            t.putString("language", lang);
                            t.putString("label", label);
                            t.putBoolean("selected", isSel);
                            tracks.pushMap(t);
                            audioIndex++;
                          }
                        }
                      }
                    }
                    if (audioIndex > 0) {
                      foundTracks = true;
                      break;
                    }
                  }
                }
              }
            }
          }
        } catch (Exception ignore) {}
      }

      promise.resolve(tracks);
    } catch (Exception e) {
      Log.w(TAG, "Failed to get audio tracks: " + e.getMessage());
      WritableArray empty = Arguments.createArray();
      promise.resolve(empty);
    }
  }

  @ReactMethod
  public void switchAudioTrack(String languageOrId, int trackIndex, Promise promise) {
    try {
      Class<?> vmClass = Class.forName("expo.modules.video.VideoManager");
      Object vm = vmClass.getField("INSTANCE").get(null);
      java.lang.reflect.Field field = vmClass.getDeclaredField("videoPlayersToVideoViews");
      field.setAccessible(true);
      Map<?, ?> map = (Map<?, ?>) field.get(vm);
      if (map != null) {
        for (Object vp : map.keySet()) {
          if (vp != null) {
            java.lang.reflect.Field pField = vp.getClass().getDeclaredField("player");
            pField.setAccessible(true);
            Object exo = pField.get(vp);
            if (exo != null) {
              Activity act = getCurrentActivity();
              if (act != null) {
                act.runOnUiThread(() -> {
                  try {
                    java.lang.reflect.Method getParamsMethod = exo.getClass().getMethod("getTrackSelectionParameters");
                    Object params = getParamsMethod.invoke(exo);
                    if (params != null) {
                      java.lang.reflect.Method buildUponMethod = params.getClass().getMethod("buildUpon");
                      Object builder = buildUponMethod.invoke(params);

                      if (languageOrId != null && !languageOrId.equals("und") && !languageOrId.isEmpty()) {
                        java.lang.reflect.Method setLangMethod = builder.getClass().getMethod("setPreferredAudioLanguage", String.class);
                        setLangMethod.invoke(builder, languageOrId);
                      }

                      java.lang.reflect.Method buildMethod = builder.getClass().getMethod("build");
                      Object newParams = buildMethod.invoke(builder);

                      java.lang.reflect.Method setParamsMethod = exo.getClass().getMethod("setTrackSelectionParameters", newParams.getClass());
                      setParamsMethod.invoke(exo, newParams);
                    }
                  } catch (Exception ignore) {}
                });
                promise.resolve(true);
                return;
              }
            }
          }
        }
      }
      promise.resolve(false);
    } catch (Exception e) {
      promise.resolve(false);
    }
  }

  private String getLanguageDisplayName(String code) {
    if (code == null || code.isEmpty() || code.equals("und")) return "Original / Default";
    if (code.equalsIgnoreCase("hi") || code.equalsIgnoreCase("hin")) return "Hindi (हिंदी)";
    if (code.equalsIgnoreCase("en") || code.equalsIgnoreCase("eng")) return "English";
    if (code.equalsIgnoreCase("ta") || code.equalsIgnoreCase("tam")) return "Tamil (தமிழ்)";
    if (code.equalsIgnoreCase("te") || code.equalsIgnoreCase("tel")) return "Telugu (తెలుగు)";
    if (code.equalsIgnoreCase("bn") || code.equalsIgnoreCase("ben")) return "Bengali (বাংলা)";
    if (code.equalsIgnoreCase("mr") || code.equalsIgnoreCase("mar")) return "Marathi (मराठी)";
    if (code.equalsIgnoreCase("pa") || code.equalsIgnoreCase("pan")) return "Punjabi (ਪੰਜਾਬੀ)";
    try {
      Locale loc = new Locale(code);
      String name = loc.getDisplayLanguage();
      if (name != null && !name.isEmpty()) return name;
    } catch (Exception ignore) {}
    return code.toUpperCase();
  }

  private void scanFolder(File dir, WritableArray array, Set<String> seen, String label, int depth) {
    if (dir == null || !dir.exists() || !dir.isDirectory() || depth > 2) return;
    File[] files = dir.listFiles();
    if (files == null) return;
    for (File f : files) {
      if (f.isDirectory() && !f.getName().startsWith(".")) {
        scanFolder(f, array, seen, label, depth + 1);
      } else if (f.isFile() && isVideoFile(f.getName())) {
        String uriStr = Uri.fromFile(f).toString();
        String absPath = f.getAbsolutePath();
        if (!seen.contains(uriStr) && !seen.contains(absPath)) {
          seen.add(uriStr);
          seen.add(absPath);
          WritableMap map = Arguments.createMap();
          map.putString("id", "file-" + f.getName());
          map.putString("title", cleanTitle(f.getName()));
          map.putString("filename", f.getName());
          map.putString("uri", uriStr);
          map.putString("filePath", absPath);
          map.putDouble("duration", 0);
          map.putDouble("size", f.length());
          map.putString("description", formatSize(f.length()) + " · " + label);

          String thumbUri = getOrCreateVideoThumbnail(uriStr, absPath);
          if (thumbUri != null) {
            map.putString("thumbnailUri", thumbUri);
          }

          array.pushMap(map);
        }
      }
    }
  }

  @ReactMethod
  public void getVideoThumbnail(String uriOrPath, Promise promise) {
    try {
      String thumb = getOrCreateVideoThumbnail(uriOrPath, null);
      promise.resolve(thumb);
    } catch (Exception e) {
      promise.resolve(null);
    }
  }

  private String getOrCreateVideoThumbnail(String uriStr, String dataPath) {
    if (uriStr == null || uriStr.isEmpty()) return null;
    try {
      Context context = getReactApplicationContext();
      File thumbsDir = new File(context.getCacheDir(), "video_thumbs");
      if (!thumbsDir.exists()) {
        thumbsDir.mkdirs();
      }
      String safeKey = "thumb_" + Math.abs(uriStr.hashCode()) + ".jpg";
      File thumbFile = new File(thumbsDir, safeKey);
      if (thumbFile.exists() && thumbFile.length() > 0) {
        return "file://" + thumbFile.getAbsolutePath();
      }

      Bitmap bmp = null;
      // 1. Android 10+ (API 29+) OS MediaStore thumbnail cache
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && uriStr.startsWith("content://")) {
        try {
          ContentResolver resolver = context.getContentResolver();
          bmp = resolver.loadThumbnail(Uri.parse(uriStr), new Size(480, 270), null);
        } catch (Throwable ignored) {}
      }

      // 2. MediaMetadataRetriever fallback (works for all files and URIs)
      if (bmp == null) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
          if (uriStr.startsWith("content://")) {
            retriever.setDataSource(context, Uri.parse(uriStr));
          } else {
            String path = (dataPath != null && !dataPath.isEmpty()) ? dataPath : (uriStr.startsWith("file://") ? uriStr.substring(7) : uriStr);
            retriever.setDataSource(path);
          }
          bmp = retriever.getFrameAtTime(1000000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC);
          if (bmp == null) {
            bmp = retriever.getFrameAtTime();
          }
        } catch (Throwable ignored) {
        } finally {
          try { retriever.release(); } catch (Throwable ignored) {}
        }
      }

      if (bmp != null) {
        int w = bmp.getWidth();
        int h = bmp.getHeight();
        if (w > 480) {
          int targetH = Math.max(1, (int) (h * (480.0 / w)));
          Bitmap scaled = Bitmap.createScaledBitmap(bmp, 480, targetH, true);
          if (scaled != bmp) {
            bmp.recycle();
            bmp = scaled;
          }
        }
        try (FileOutputStream out = new FileOutputStream(thumbFile)) {
          bmp.compress(Bitmap.CompressFormat.JPEG, 75, out);
        }
        bmp.recycle();
        if (thumbFile.exists() && thumbFile.length() > 0) {
          return "file://" + thumbFile.getAbsolutePath();
        }
      }
    } catch (Throwable t) {
      Log.w(TAG, "Thumbnail generation failed for " + uriStr + ": " + t.getMessage());
    }
    return null;
  }

  private boolean isVideoFile(String name) {
    if (name == null) return false;
    String lower = name.toLowerCase();
    return lower.endsWith(".mp4") || lower.endsWith(".mkv") || lower.endsWith(".webm")
        || lower.endsWith(".mov") || lower.endsWith(".3gp") || lower.endsWith(".m4v");
  }

  private String cleanTitle(String filename) {
    if (filename == null) return "Video";
    int lastDot = filename.lastIndexOf('.');
    String base = lastDot > 0 ? filename.substring(0, lastDot) : filename;
    return base.replace('_', ' ').replace('-', ' ').trim();
  }

  private String formatSize(long bytes) {
    if (bytes <= 0) return "";
    if (bytes < 1024 * 1024) return (bytes / 1024) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)) + " MB";
    return String.format(Locale.US, "%.1f GB", bytes / (1024.0 * 1024 * 1024));
  }
}
