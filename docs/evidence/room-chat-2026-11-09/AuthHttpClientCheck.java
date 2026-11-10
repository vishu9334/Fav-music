package com.favmusic.auth;
import java.net.*;
import java.io.*;
import java.security.cert.Certificate;
import javax.net.ssl.HttpsURLConnection;

public final class AuthHttpClientCheck {
  static Fake last;
  static int opens;
  static int status = 200;
  static final class Fake extends HttpsURLConnection {
    final ByteArrayOutputStream written = new ByteArrayOutputStream();
    boolean outputOpened;
    Fake(URL url) { super(url); }
    public void disconnect() {}
    public boolean usingProxy() { return false; }
    public void connect() {}
    public String getCipherSuite() { return "TEST_ONLY"; }
    public Certificate[] getLocalCertificates() { return null; }
    public Certificate[] getServerCertificates() { return new Certificate[0]; }
    public OutputStream getOutputStream() { outputOpened = true; return written; }
    public int getResponseCode() { return status; }
    public long getContentLengthLong() { return 12; }
    public InputStream getInputStream() { return new ByteArrayInputStream("{\"rooms\":[]}".getBytes()); }
    public InputStream getErrorStream() { return getInputStream(); }
  }
  static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
  public static void main(String[] args) throws Exception {
    URL.setURLStreamHandlerFactory(protocol -> "https".equals(protocol) ? new URLStreamHandler() {
      protected URLConnection openConnection(URL url) { opens++; return last = new Fake(url); }
    } : null);
    AuthHttpClient client = new AuthHttpClient();
    String endpoint = "https://api.example.test/api/v1/rooms";
    AuthHttpClient.Result result = client.request("GET", endpoint, endpoint, "", null, connection -> {});
    check("GET".equals(last.getRequestMethod()), "GET became POST");
    check(!last.getDoOutput() && !last.outputOpened, "GET wrote a body");
    check(result.status == 200 && result.body.contains("rooms"), "GET response lost");
    check(!last.getInstanceFollowRedirects(), "Redirect following enabled");
    client.post(endpoint, endpoint, "{\"fixture\":true}", "fixture-bearer", connection -> {});
    check("POST".equals(last.getRequestMethod()) && last.outputOpened, "Existing POST path changed");
    check(last.written.toString().equals("{\"fixture\":true}"), "POST body changed");
    check("Bearer fixture-bearer".equals(last.getRequestProperty("Authorization")), "Bearer header changed");
    int before = opens;
    for (String method : new String[]{"DELETE", "PUT"}) {
      try { client.request(method, endpoint, endpoint, "", null, connection -> {}); throw new AssertionError("Unsupported method allowed"); }
      catch (ProtocolException expected) {}
    }
    check(opens == before, "Unsupported method opened a connection");
    try { client.request("GET", endpoint, "https://other.example.test/rooms", "", null, connection -> {}); throw new AssertionError("Unapproved endpoint allowed"); }
    catch (ProtocolException expected) {}
    status = 302;
    try { client.request("GET", endpoint, endpoint, "", null, connection -> {}); throw new AssertionError("Redirect accepted"); }
    catch (ProtocolException expected) {}
    System.out.println("PASS: native GET/body/POST/bearer/redirect/endpoint checks; no network used");
  }
}
