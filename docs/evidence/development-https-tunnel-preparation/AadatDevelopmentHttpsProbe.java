import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Credential-free Android transport check; uses default Android trust/hostname verification. */
public final class AadatDevelopmentHttpsProbe {
  private static JSONObject request(URL origin, String path, String query) throws Exception {
    HttpsURLConnection c = (HttpsURLConnection) new URL(origin, path).openConnection();
    c.setInstanceFollowRedirects(false);
    c.setConnectTimeout(10000);
    c.setReadTimeout(10000);
    c.setRequestProperty("Accept", "application/json");
    if (query != null) {
      c.setRequestMethod("POST");
      c.setRequestProperty("Content-Type", "application/json");
      c.setDoOutput(true);
      byte[] body = new JSONObject().put("query", query).toString().getBytes(StandardCharsets.UTF_8);
      c.setFixedLengthStreamingMode(body.length);
      try (java.io.OutputStream out = c.getOutputStream()) { out.write(body); }
    }
    try {
      int status = c.getResponseCode();
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      InputStream input = status < 400 ? c.getInputStream() : c.getErrorStream();
      if (input == null) throw new IllegalStateException("No HTTP response body");
      try (InputStream in = input) {
        byte[] chunk = new byte[2048];
        int n;
        while ((n = in.read(chunk)) != -1) {
          if (bytes.size() + n > 65536) throw new IllegalStateException("Response limit exceeded");
          bytes.write(chunk, 0, n);
        }
      }
      JSONObject payload = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
      JSONObject result = new JSONObject().put("path", path).put("httpStatus", status)
        .put("tlsCipher", c.getCipherSuite()).put("responseBytes", bytes.size()).put("payload", payload);
      boolean valid = status == 200;
      if (query == null) valid &= "alive".equals(payload.optString("status"));
      else {
        JSONObject data = payload.optJSONObject("data");
        valid &= !payload.has("errors") && data != null;
        if (data != null) {
          JSONObject health = data.optJSONObject("health"), caps = data.optJSONObject("authCapabilities");
          valid &= health != null && "ok".equals(health.optString("status"));
          valid &= caps != null && "aadat-music".equals(caps.optString("service"))
            && caps.has("authenticationEnabled") && !caps.getBoolean("authenticationEnabled")
            && caps.has("cloudCollectionsEnabled") && !caps.getBoolean("cloudCollectionsEnabled");
        }
      }
      return result.put("pass", valid);
    } finally { c.disconnect(); }
  }
  public static void main(String[] args) throws Exception {
    if (args.length != 2 || !args[1].matches("[A-Za-z0-9-]{1,80}")) throw new IllegalArgumentException("Expected origin and unique probe ID");
    URL origin = new URL(args[0]);
    if (!"https".equals(origin.getProtocol()) || !origin.getHost().matches("[a-z0-9-]+\\.trycloudflare\\.com")
      || origin.getUserInfo() != null || origin.getQuery() != null || origin.getRef() != null
      || origin.getPort() != -1 && origin.getPort() != 443
      || !(origin.getPath().isEmpty() || "/".equals(origin.getPath()))) throw new SecurityException("Invalid HTTPS Quick Tunnel origin");
    JSONObject live = request(origin, "/health/live", null);
    JSONObject gql = request(origin, "/graphql", "query AndroidTunnelReadiness { health { status version } authCapabilities { service version authenticationEnabled cloudCollectionsEnabled } }");
    boolean pass = live.getBoolean("pass") && gql.getBoolean("pass");
    System.out.println(new JSONObject().put("probeId", args[1]).put("origin", args[0])
      .put("credentialsSent", false).put("liveness", live).put("graphql", gql).put("pass", pass).toString());
    if (!pass) throw new IllegalStateException("Android HTTPS readiness failed");
  }
}
