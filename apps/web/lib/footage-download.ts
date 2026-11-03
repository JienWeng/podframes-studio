import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";
import { isPublicSourceUrl } from "@podframes/core/shared";

const MAX_BYTES = 50 * 1024 * 1024;
const DIRECT_VIDEO_MESSAGE =
  "Provide a direct MP4 or WebM download URL instead of an article or video player page.";

export function isPublicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [first, second, third] = address.split(".").map(Number);
  return (
    first !== 0 &&
    first !== 10 &&
    first !== 127 &&
    first < 224 &&
    !(first === 100 && second >= 64 && second <= 127) &&
    !(first === 169 && second === 254) &&
    !(first === 172 && second >= 16 && second <= 31) &&
    !(
      first === 192 &&
      (second === 168 ||
        (second === 0 && (third === 0 || third === 2)) ||
        (second === 88 && third === 99) ||
        (second === 31 && third === 196) ||
        (second === 52 && third === 193) ||
        (second === 175 && third === 48))
    ) &&
    !(
      first === 198 &&
      (second === 18 || second === 19 || (second === 51 && third === 100))
    ) &&
    !(first === 203 && second === 0 && third === 113)
  );
}

export function validateFootageBytes(bytes: Uint8Array): "mp4" | "webm" {
  if (bytes.byteLength > MAX_BYTES)
    throw new Error("Footage download exceeds the 50 MB limit.");
  if (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  )
    return "mp4";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "webm";
  throw new Error(DIRECT_VIDEO_MESSAGE);
}

async function publicAddress(
  hostname: string,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    lookup(hostname, { all: true, family: 4 }).then(
      (values) => {
        signal.removeEventListener("abort", abort);
        resolve(values);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicIPv4(address))
  ) {
    throw new Error("Footage URL must resolve only to public IPv4 addresses.");
  }
  return addresses[0]!.address;
}

function download(
  url: URL,
  address: string,
  signal: AbortSignal,
): Promise<{ redirect: string } | { bytes: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        // Connect to the checked IP directly while preserving the domain for TLS and HTTP.
        hostname: address,
        servername: url.hostname,
        family: 4,
        agent: false,
        signal,
        headers: {
          Host: url.host,
          Accept: "video/mp4, video/webm, application/octet-stream",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        res.on("error", reject);
        if (
          [301, 302, 303, 307, 308].includes(res.statusCode ?? 0) &&
          res.headers.location
        ) {
          const redirect = res.headers.location;
          res.destroy();
          resolve({ redirect });
          return;
        }
        if (res.statusCode !== 200) {
          res.destroy();
          reject(
            new Error(
              `Footage download failed with HTTP ${res.statusCode ?? "unknown"}. ${DIRECT_VIDEO_MESSAGE}`,
            ),
          );
          return;
        }
        if (Number(res.headers["content-length"]) > MAX_BYTES) {
          res.destroy();
          reject(new Error("Footage download exceeds the 50 MB limit."));
          return;
        }
        const contentType = res.headers["content-type"]
          ?.split(";")[0]
          ?.trim()
          .toLowerCase();
        if (
          contentType?.startsWith("text/") ||
          contentType === "application/xhtml+xml"
        ) {
          res.destroy();
          reject(new Error(DIRECT_VIDEO_MESSAGE));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            reject(new Error("Footage download exceeds the 50 MB limit."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ bytes: Buffer.concat(chunks, size) }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

export async function downloadFootage(value: string): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(30_000);
  let current = value;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (!isPublicSourceUrl(current))
        throw new Error(
          "Footage URL must be public HTTPS with no credentials or custom port.",
        );
      const url = new URL(current);
      const address = await publicAddress(url.hostname, signal);
      signal.throwIfAborted();
      const result = await download(url, address, signal);
      if ("bytes" in result) {
        validateFootageBytes(result.bytes);
        return result.bytes;
      }
      if (redirects === 3)
        throw new Error("Footage download exceeded three redirects.");
      current = new URL(result.redirect, url).href;
    }
    throw new Error("Footage download exceeded three redirects.");
  } catch (error) {
    if (signal.aborted)
      throw new Error("Footage download timed out after 30 seconds.");
    throw error;
  }
}
