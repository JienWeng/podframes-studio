import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pollBrollVideo } from "./broll-video";

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "podframes-broll-video-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { apiKey: "test-fal-secret", prompt: "A slow orbit around a satellite", aspectRatio: "16:9" as const, statePath: join(dir, "job.json") };
}

test("submits fixed safe input once, checks once, resumes and caches the completed URL", async (t) => {
  const args = await fixture(t);
  const calls: { url: string; init?: RequestInit }[] = [];
  let checks = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.method === "POST") {
      assert.equal(JSON.parse(await readFile(args.statePath, "utf8")).status, "submitting");
      return Response.json({ request_id: "request-123" });
    }
    if (url.includes("/status")) return Response.json({ status: ++checks === 1 ? "IN_QUEUE" : "COMPLETED" });
    return Response.json({ video: { url: "https://v3.fal.media/files/clip.mp4" } });
  });
  assert.deepEqual(await pollBrollVideo(args), { status: "pending", requestId: "request-123" });
  assert.equal(checks, 1);
  assert.deepEqual(await pollBrollVideo(args), { status: "completed", requestId: "request-123", url: "https://v3.fal.media/files/clip.mp4" });
  const count = calls.length;
  await pollBrollVideo(args);
  assert.equal(calls.length, count);
  assert.equal(calls.filter((call) => call.init?.method === "POST").length, 1);
  assert.deepEqual(JSON.parse(calls[0]!.init!.body as string), {
    prompt: args.prompt, aspect_ratio: "16:9", duration: "6", resolution: "1080p", fps: "25", generate_audio: false, enable_safety_checker: true,
  });
  assert.equal(new Headers(calls[0]!.init?.headers).get("authorization"), `Key ${args.apiKey}`);
  assert.ok(calls[0]!.url.endsWith("/fal-ai/ltx-2.3/text-to-video"));
  assert.equal((await readFile(args.statePath, "utf8")).includes(args.apiKey), false);
});

test("lost submit response blocks another purchase and bypasses SDK automatic transport retries", async (t) => {
  const args = await fixture(t);
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }); });
  await assert.rejects(pollBrollVideo(args), /connection failed/);
  assert.equal(mock.mock.callCount(), 1);
  await assert.rejects(pollBrollVideo(args), /outcome is unknown.*provider history/);
  assert.equal(mock.mock.callCount(), 1);
});

test("HTTP submit failure remains blocked on retry", async (t) => {
  const args = await fixture(t);
  const mock = t.mock.method(globalThis, "fetch", async () => new Response("provider unavailable", { status: 503 }));
  await assert.rejects(pollBrollVideo(args), /HTTP 503/);
  await assert.rejects(pollBrollVideo(args), /provider history/);
  assert.equal(mock.mock.callCount(), 1);
});

test("changed inputs cannot reuse a state path and queue errors never submit replacements", async (t) => {
  const args = await fixture(t);
  let submissions = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") { submissions++; return Response.json({ request_id: "request-failed" }); }
    return Response.json({ status: "FAILED" });
  });
  await assert.rejects(pollBrollVideo(args), /queue request failed/);
  await assert.rejects(pollBrollVideo(args), /queue request failed/);
  await assert.rejects(pollBrollVideo({ ...args, prompt: "A different scene" }), /different state path/);
  assert.equal(submissions, 1);
});

test("completed results and cached URLs reject untrusted storage", async (t) => {
  const args = await fixture(t);
  let output = "https://attacker.example.com/clip.mp4";
  t.mock.method(globalThis, "fetch", async (input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ request_id: "request-url" });
    if (String(input).includes("/status")) return Response.json({ status: "COMPLETED" });
    return Response.json({ video: { url: output } });
  });
  for (output of ["https://attacker.example.com/clip.mp4", "http://v3.fal.media/clip.mp4", "https://v3.fal.media.evil.com/clip.mp4", "https://user:password@v3.fal.media/clip.mp4", "https://v3.fal.media:8443/clip.mp4"]) {
    await assert.rejects(pollBrollVideo(args), /trusted HTTPS/);
  }
  const saved = JSON.parse(await readFile(args.statePath, "utf8"));
  await writeFile(args.statePath, JSON.stringify({ ...saved, status: "completed", url: output }));
  await assert.rejects(pollBrollVideo(args), /trusted HTTPS/);
});

test("invalid input fails before requests or state creation", async (t) => {
  const args = await fixture(t);
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected request"); });
  await assert.rejects(pollBrollVideo({ ...args, apiKey: "" }), /FAL_API_KEY/);
  await assert.rejects(pollBrollVideo({ ...args, prompt: " " }), /1–2000/);
  await assert.rejects(pollBrollVideo({ ...args, prompt: "x".repeat(2001) }), /1–2000/);
  await assert.rejects(pollBrollVideo({ ...args, aspectRatio: "1:1" as "16:9" }), /aspect ratio/);
  assert.equal(mock.mock.callCount(), 0);
  await assert.rejects(readFile(args.statePath), { code: "ENOENT" });
});

test("corrupt saved state fails closed before submitting a replacement", async (t) => {
  const args = await fixture(t);
  const mock = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected request"); });
  for (const saved of ["null", "false", "[]", "not JSON"]) {
    await writeFile(args.statePath, saved);
    await assert.rejects(pollBrollVideo(args));
  }
  assert.equal(mock.mock.callCount(), 0);
});
