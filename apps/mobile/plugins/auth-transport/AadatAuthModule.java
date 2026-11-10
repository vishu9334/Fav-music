package com.favmusic.auth;

import com.facebook.react.bridge.*;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.net.ssl.HttpsURLConnection;

/** Genuine native transport; older APKs without this module must keep authentication disabled. */
public final class AadatAuthModule extends ReactContextBaseJavaModule {
  private static final class Pending {
    final AtomicBoolean finished = new AtomicBoolean(false);
    final Promise promise; volatile HttpsURLConnection connection;
    Pending(Promise promise) { this.promise = promise; }
  }
  private final ExecutorService executor = Executors.newFixedThreadPool(2);
  private final ConcurrentHashMap<String, Pending> requests = new ConcurrentHashMap<>();
  public AadatAuthModule(ReactApplicationContext context) { super(context); }
  @Override public String getName() { return "AadatAuthTransport"; }
  @Override public Map<String, Object> getConstants() { return Collections.singletonMap("version", 1); }
  @ReactMethod public void request(String id, String endpoint, String approved, String json, String bearer, Promise promise) {
    execute(id, endpoint, approved, "POST", json, bearer, promise);
  }
  @ReactMethod public void requestHttp(String id, String endpoint, String approved, String method, String json, String bearer, Promise promise) {
    execute(id, endpoint, approved, method, json, bearer, promise);
  }
  private void execute(String id, String endpoint, String approved, String method, String json, String bearer, Promise promise) {
    final Pending pending = new Pending(promise);
    synchronized (requests) {
      if (requests.size() >= 4 || requests.putIfAbsent(id, pending) != null) { promise.reject("AUTH_TRANSPORT_BUSY", "Authentication requests are busy"); return; }
    }
    try { executor.execute(() -> {
      try {
        AuthHttpClient.Result result = new AuthHttpClient().request(method, endpoint, approved, json, bearer, (connection) -> {
          pending.connection = connection;
          if (pending.finished.get()) throw new java.io.InterruptedIOException("Cancelled");
        });
        if (pending.finished.compareAndSet(false, true)) {
          WritableMap value = Arguments.createMap(); value.putInt("status", result.status); value.putString("body", result.body); promise.resolve(value);
        }
      } catch (Exception error) {
        if (pending.finished.compareAndSet(false, true)) promise.reject("AUTH_TRANSPORT_FAILED", "Secure authentication request failed");
      } finally { requests.remove(id, pending); }
    }); } catch (java.util.concurrent.RejectedExecutionException error) {
      requests.remove(id, pending); if (pending.finished.compareAndSet(false, true)) promise.reject("AUTH_TRANSPORT_CLOSED", "Authentication transport is closed");
    }
  }
  @ReactMethod public void randomId(Promise promise) { promise.resolve(java.util.UUID.randomUUID().toString()); }

  @ReactMethod public void cancel(String id) {
    Pending pending = requests.get(id);
    if (pending != null && pending.finished.compareAndSet(false, true)) {
      if (pending.connection != null) pending.connection.disconnect();
      pending.promise.reject("AUTH_TRANSPORT_CANCELLED", "Authentication request cancelled");
    }
  }
  @Override public void invalidate() {
    for (String id : requests.keySet()) cancel(id); requests.clear(); executor.shutdownNow(); super.invalidate();
  }
}
