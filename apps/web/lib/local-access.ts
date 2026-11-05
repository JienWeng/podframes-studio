import { isIP } from "node:net";

function loopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    (isIP(hostname) === 4 && hostname.startsWith("127."))
  );
}

/** Local mode is safe only when Next itself is bound to a loopback interface. */
export function localRequest(request: Request): boolean {
  const url = new URL(request.url);
  const host = request.headers.get("host")?.toLowerCase();
  if (!host || !loopback(url.hostname)) return false;
  let authority: URL;
  try {
    authority = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (authority.host !== host || !loopback(authority.hostname)) return false;
  const headers = request.headers;
  if (headers.has("forwarded") || headers.has("x-real-ip")) return false;
  const allowed = new Set([
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-port",
  ]);
  for (const name of headers.keys()) {
    if (name.startsWith("x-forwarded-") && !allowed.has(name)) return false;
  }
  const forwardedFor = headers.get("x-forwarded-for");
  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedProto = headers.get("x-forwarded-proto");
  const forwardedPort = headers.get("x-forwarded-port");
  if (!forwardedFor && !forwardedHost && !forwardedProto && !forwardedPort)
    return true;
  // Next adds this tuple even for direct requests. Never accept a proxy chain or remote peer.
  const peer =
    forwardedFor === "::ffff:127.0.0.1" ? "127.0.0.1" : (forwardedFor ?? "");
  return (
    loopback(peer) &&
    forwardedHost?.toLowerCase() === host &&
    forwardedProto === url.protocol.slice(0, -1) &&
    forwardedPort ===
      (authority.port || (url.protocol === "https:" ? "443" : "80"))
  );
}

