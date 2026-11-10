package com.favmusic.auth;

import java.io.*;
import java.net.*;
import java.security.cert.Certificate;
import javax.net.ssl.HttpsURLConnection;

/** JVM-only contract check with an in-process HTTPS connection double. Opens no sockets. */
public final class AuthHttpClientCheck {
  private static int status = 200, opens = 0, writes = 0, reads = 0;
  private static byte[] response = "{\"ok\":true}".getBytes(java.nio.charset.StandardCharsets.UTF_8);
  private static Fake connection;
  private static final String ENDPOINT = "https://api.example.test/graphql";
  private static final class Fake extends HttpsURLConnection {
    Fake(URL url) { super(url); }
    @Override public void connect() {}
    @Override public void disconnect() {}
    @Override public boolean usingProxy() { return false; }
    @Override public String getCipherSuite() { return "test-double"; }
    @Override public Certificate[] getLocalCertificates() { return null; }
    @Override public Certificate[] getServerCertificates() { return null; }
    @Override public OutputStream getOutputStream() { writes++; check(!getInstanceFollowRedirects(), "redirect following must be disabled before output"); return new ByteArrayOutputStream(); }
    @Override public int getResponseCode() { return status; }
    @Override public long getContentLengthLong() { return -1; }
    @Override public InputStream getInputStream() { reads++; return new ByteArrayInputStream(response); }
    @Override public InputStream getErrorStream() { return getInputStream(); }
  }
  private static void check(boolean ok, String message) { if (!ok) throw new AssertionError(message); }
  private static void reject(Checked operation) throws Exception { try { operation.run(); throw new AssertionError("Expected policy rejection"); } catch (IOException expected) {} }
  private interface Checked { void run() throws Exception; }
  public static void main(String[] args) throws Exception {
    URL.setURLStreamHandlerFactory(protocol -> "https".equals(protocol) ? new URLStreamHandler() {
      @Override protected URLConnection openConnection(URL url) { opens++; connection = new Fake(url); return connection; }
    } : null);
    AuthHttpClient client = new AuthHttpClient();
    AuthHttpClient.Result result = client.post(ENDPOINT, ENDPOINT, "{}", "fixture-only", opened -> {});
    check(result.status == 200 && result.body.contains("true"), "successful bounded JSON response");
    check(connection.getSSLSocketFactory() == HttpsURLConnection.getDefaultSSLSocketFactory(), "default TLS trust remains intact");
    check(connection.getHostnameVerifier() == HttpsURLConnection.getDefaultHostnameVerifier(), "default hostname verification remains intact");
    check("Bearer fixture-only".equals(connection.getRequestProperty("Authorization")), "bearer header");
    javax.net.ssl.SSLSocketFactory originalFactory = HttpsURLConnection.getDefaultSSLSocketFactory();
    String catalog = "https://test.trycloudflare.com/development/catalog/graphql";
    client.post(catalog, catalog, "{}", "fixture-only", opened -> {
      check(opened.getSSLSocketFactory() != originalFactory, "development tunnel catalog uses its scoped IPv4 TLS adapter");
      check(opened.getHostnameVerifier() == HttpsURLConnection.getDefaultHostnameVerifier(), "catalog hostname verification remains intact");
      check(java.util.Arrays.equals(opened.getSSLSocketFactory().getDefaultCipherSuites(), originalFactory.getDefaultCipherSuites()), "catalog delegates platform TLS policy");
    });
    check(HttpsURLConnection.getDefaultSSLSocketFactory() == originalFactory, "global TLS factory unchanged");
    String account = "https://test.trycloudflare.com/graphql";
    client.post(account, account, "{}", "fixture-only", opened -> {
      check(opened.getSSLSocketFactory() != originalFactory, "approved tunnel account API uses the same IPv4 fix");
      check(opened.getHostnameVerifier() == HttpsURLConnection.getDefaultHostnameVerifier(), "account API keeps default hostname verification");
    });
    for (String ordinary : new String[] { "https://test.trycloudflare.com/other", "https://api.example.test/development/catalog/graphql", ENDPOINT }) {
      client.post(ordinary, ordinary, "{}", "fixture-only", opened -> check(opened.getSSLSocketFactory() == originalFactory, "other routes/hosts unchanged"));
    }
    int beforeReads = reads, beforeOpens = opens; status = 307;
    reject(() -> client.post(ENDPOINT, ENDPOINT, "{}", "fixture-only", opened -> {}));
    check(reads == beforeReads && opens == beforeOpens + 1, "redirect must not read/follow another target"); status = 200;
    for (String invalid : new String[] { "http://api.example.test/graphql", ENDPOINT + "?token=bad", ENDPOINT + "#bad", "https://user:password@api.example.test/graphql", "https://api.example.test:8443/graphql" }) {
      reject(() -> AuthHttpClient.validateEndpoint(invalid, invalid));
    }
    reject(() -> AuthHttpClient.validateEndpoint(ENDPOINT, "https://other.example.test/graphql"));
    beforeOpens = opens; reject(() -> client.post(ENDPOINT, ENDPOINT, "x".repeat(AuthHttpClient.MAX_BYTES + 1), null, opened -> {}));
    check(opens == beforeOpens, "oversize body rejected before connection");
    response = new byte[AuthHttpClient.MAX_BYTES + 1]; reject(() -> client.post(ENDPOINT, ENDPOINT, "{}", null, opened -> {}));
    response = "{}".getBytes(java.nio.charset.StandardCharsets.UTF_8); status = 401;
    check(client.post(ENDPOINT, ENDPOINT, "{}", null, opened -> {}).status == 401, "preserve authentication HTTP statuses");
    int beforeWrites = writes; reject(() -> client.post(ENDPOINT, ENDPOINT, "{}", "fixture-only", opened -> { throw new InterruptedIOException("Cancelled"); }));
    check(writes == beforeWrites, "cancel before any credential body write");
    System.out.println("PASS: HTTPS/endpoint policy, no redirects, default TLS/hostname verifier, bounded bodies, HTTP statuses, cancellation. No network sockets used.");
  }
}
