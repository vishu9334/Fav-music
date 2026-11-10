package com.favmusic.auth;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.ProtocolException;
import java.net.URI;
import java.net.InetAddress;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocketFactory;

/** Dedicated auth HTTP path. Uses platform TLS/hostname validation and never follows redirects. */
public final class AuthHttpClient {
  public static final int MAX_BYTES = 1024 * 1024;
  public interface ConnectionObserver { void opened(HttpsURLConnection connection) throws IOException; }
  public static final class Result {
    public final int status; public final String body;
    public Result(int status, String body) { this.status = status; this.body = body; }
  }
  public static URI validateEndpoint(String endpoint, String approved) throws ProtocolException {
    try {
      URI uri = new URI(endpoint);
      if (!endpoint.equals(approved) || endpoint.length() > 2048 || !"https".equals(uri.getScheme())
          || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
          || uri.getRawPath().isEmpty() || (uri.getPort() != -1 && uri.getPort() != 443)) throw new Exception();
      return uri;
    } catch (Exception error) { throw new ProtocolException("Invalid approved authentication endpoint"); }
  }
  public Result post(String endpoint, String approved, String json, String bearer, ConnectionObserver observer) throws IOException {
    return request("POST", endpoint, approved, json, bearer, observer);
  }
  public Result request(String method, String endpoint, String approved, String json, String bearer, ConnectionObserver observer) throws IOException {
    if (!"POST".equals(method) && !"GET".equals(method)) throw new ProtocolException("Unsupported API request method");
    URI uri = validateEndpoint(endpoint, approved);
    byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
    if (bytes.length > MAX_BYTES || (bearer != null && (bearer.length() > 20000 || !bearer.matches("[!-~]+")))) throw new ProtocolException("Invalid authentication request");
    HttpsURLConnection connection = (HttpsURLConnection) uri.toURL().openConnection();
    try {
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
      connection.setRequestMethod(method); connection.setDoOutput("POST".equals(method)); connection.setUseCaches(false);
      if (("/development/catalog/graphql".equals(uri.getRawPath()) || "/graphql".equals(uri.getRawPath()) || uri.getRawPath().startsWith("/api/v1/rooms")) && uri.getHost().endsWith(".trycloudflare.com")) {
        connection.setSSLSocketFactory(new CatalogIpv4TlsFactory(connection.getSSLSocketFactory()));
      }
      connection.setRequestProperty("Content-Type", "application/json"); connection.setRequestProperty("Accept", "application/json");
      if (bearer != null) connection.setRequestProperty("Authorization", "Bearer " + bearer);
      if ("POST".equals(method)) connection.setFixedLengthStreamingMode(bytes.length);
      observer.opened(connection);
      if ("POST".equals(method)) try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
      int status = connection.getResponseCode();
      if (status >= 300 && status < 400) throw new ProtocolException("Authentication redirects are forbidden");
      if (connection.getContentLengthLong() > MAX_BYTES) throw new ProtocolException("Authentication response exceeds limit");
      InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
      if (stream == null) return new Result(status, "");
      try (InputStream input = stream; ByteArrayOutputStream result = new ByteArrayOutputStream()) {
        byte[] buffer = new byte[8192]; int length;
        while ((length = input.read(buffer)) != -1) {
          if (result.size() + length > MAX_BYTES) throw new ProtocolException("Authentication response exceeds limit");
          result.write(buffer, 0, length);
        }
        return new Result(status, new String(result.toByteArray(), StandardCharsets.UTF_8));
      }
    } finally { connection.disconnect(); }
  }

  /** This tunnel's IPv6 path completes TLS but stalls HTTP. Scope the fix to approved API requests. */
  private static final class CatalogIpv4TlsFactory extends SSLSocketFactory {
    private final SSLSocketFactory delegate;
    CatalogIpv4TlsFactory(SSLSocketFactory delegate) { this.delegate = delegate; }
    @Override public Socket createSocket(Socket socket, String host, int port, boolean autoClose) throws IOException {
      if (!(socket.getInetAddress() instanceof Inet6Address)) return delegate.createSocket(socket, host, port, autoClose);
      if (autoClose) socket.close();
      IOException failure = null;
      for (InetAddress address : InetAddress.getAllByName(host)) {
        if (!(address instanceof Inet4Address)) continue;
        Socket ipv4 = new Socket();
        try {
          ipv4.connect(new InetSocketAddress(address, port), 10000);
          ipv4.setSoTimeout(10000);
          // Retain the DNS hostname for the platform's SNI, trust and hostname checks; never use an IP URL.
          return delegate.createSocket(ipv4, host, port, true);
        } catch (IOException error) {
          failure = error;
          try { ipv4.close(); } catch (IOException ignored) {}
        }
      }
      throw new IOException("Development API IPv4 connection unavailable", failure);
    }
    @Override public String[] getDefaultCipherSuites() { return delegate.getDefaultCipherSuites(); }
    @Override public String[] getSupportedCipherSuites() { return delegate.getSupportedCipherSuites(); }
    @Override public Socket createSocket() throws IOException { return delegate.createSocket(); }
    @Override public Socket createSocket(String host, int port) throws IOException { return delegate.createSocket(host, port); }
    @Override public Socket createSocket(String host, int port, InetAddress local, int localPort) throws IOException { return delegate.createSocket(host, port, local, localPort); }
    @Override public Socket createSocket(InetAddress host, int port) throws IOException { return delegate.createSocket(host, port); }
    @Override public Socket createSocket(InetAddress host, int port, InetAddress local, int localPort) throws IOException { return delegate.createSocket(host, port, local, localPort); }
  }
}
