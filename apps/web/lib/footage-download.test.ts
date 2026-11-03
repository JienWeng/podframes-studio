import assert from "node:assert/strict";
import { test } from "node:test";
import {
  downloadFootage,
  isPublicIPv4,
  validateFootageBytes,
} from "./footage-download";

test("DNS pinning permits public IPv4 and rejects private or reserved answers", () => {
  for (const address of [
    "1.1.1.1",
    "8.8.8.8",
    "93.184.216.34",
    "100.128.0.1",
    "172.15.255.255",
    "172.32.0.1",
    "192.0.3.1",
    "223.255.255.254",
  ]) {
    assert.equal(isPublicIPv4(address), true, address);
  }
  for (const address of [
    "0.0.0.0",
    "0.1.2.3",
    "10.1.2.3",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.255.255.255",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "192.0.0.9",
    "192.0.2.1",
    "192.88.99.1",
    "192.31.196.1",
    "192.52.193.1",
    "192.175.48.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "8.8.8.999",
    "127.1",
    "2130706433",
    "0x7f000001",
    "",
    "localhost",
  ])
    assert.equal(isPublicIPv4(address), false, address);
});

test("MP4 and WebM signatures are required even for video-named downloads", () => {
  assert.equal(
    validateFootageBytes(
      new Uint8Array([
        0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      ]),
    ),
    "mp4",
  );
  assert.equal(
    validateFootageBytes(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f])),
    "webm",
  );
  for (const bytes of [
    new Uint8Array(),
    new TextEncoder().encode("<!doctype html><video src='movie.mp4'>"),
    new TextEncoder().encode("ftypisom"),
    new Uint8Array([0x1a, 0x45, 0xdf]),
  ]) {
    assert.throws(
      () => validateFootageBytes(bytes),
      /direct MP4 or WebM download URL/,
    );
  }
  assert.throws(
    () => validateFootageBytes(new Uint8Array(50 * 1024 * 1024 + 1)),
    /50 MB/,
  );
});

test("unsafe input URLs fail before making network requests", async () => {
  for (const url of [
    "http://videos.example.com/clip.mp4",
    "https://127.0.0.1/clip.mp4",
    "https://[::1]/clip.mp4",
    "https://videos.local/clip.webm",
    "https://user:password@videos.example.com/clip.mp4",
    "https://videos.example.com:8443/clip.mp4",
    "file:///tmp/clip.mp4",
    "not a URL",
  ])
    await assert.rejects(downloadFootage(url), /public HTTPS/);
});
