import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { DEFAULT_HOSTS, Project } from "@podframes/core";
import { GET, POST } from "../app/api/projects/[slug]/broll/[cueId]/video/route";
import { POST as importFootage } from "../app/api/projects/[slug]/broll/[cueId]/footage/route";

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "podframes-broll-video-route-"));
  const cwd = process.cwd();
  const previousKey = process.env.FAL_API_KEY;
  const previousAlias = process.env.FAL_KEY;
  t.after(async () => {
    process.chdir(cwd);
    if (previousKey === undefined) delete process.env.FAL_API_KEY;
    else process.env.FAL_API_KEY = previousKey;
    if (previousAlias === undefined) delete process.env.FAL_KEY;
    else process.env.FAL_KEY = previousAlias;
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []");
  const project = await Project.create({ topic: "B-roll video route", hosts: structuredClone(DEFAULT_HOSTS), aspectRatio: "9:16" }, root, "episode");
  project.state.broll = { cues: [{ id: "reaction", type: "broll", start: 0, end: 3, imagePrompt: "A surprised cat turning toward camera", imagePath: "broll/prior.png" }] };
  await project.save();
  process.chdir(root);
  process.env.FAL_API_KEY = "test-route-key";
  delete process.env.FAL_KEY;
  const context = { params: Promise.resolve({ slug: "episode", cueId: "reaction" }) };
  const request = (method = "GET") => new Request("http://localhost/api/projects/episode/broll/reaction/video", { method });
  return { root, project, context, request };
}

test("GET cannot submit, concurrent POSTs share one saved job and polling checks once per call", async (t) => {
  const { project, context, request } = await fixture(t);
  let submissions = 0;
  let checks = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") { submissions++; return Response.json({ request_id: "route-request-1" }); }
    checks++;
    return Response.json({ status: "IN_PROGRESS" });
  });
  assert.equal((await GET(request(), context)).status, 404);
  assert.equal(submissions, 0);
  const responses = await Promise.all([POST(request("POST"), context), POST(request("POST"), context)]);
  assert.deepEqual(responses.map((response) => response.status), [202, 202]);
  assert.equal(submissions, 1);
  assert.equal(checks, 2);
  const polled = await GET(request(), context);
  assert.equal(polled.status, 202);
  assert.deepEqual(await polled.json(), { status: "pending", requestId: "route-request-1" });
  assert.equal(checks, 3);
  const states = await readdir(project.path(".broll-video"));
  assert.equal(states.length, 1);
  const state = JSON.parse(await readFile(project.path(".broll-video", states[0]!), "utf8"));
  assert.equal(state.requestId, "route-request-1");
  assert.equal((await Project.load(project.root, project.slug))?.state.broll?.cues[0]?.imagePath, "broll/prior.png");
});

test("status polling reports missing server key and never falls back to a fresh submission", async (t) => {
  const { context, request } = await fixture(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    calls++;
    return Response.json(init?.method === "POST" ? { request_id: "route-request-2" } : { status: "IN_QUEUE" });
  });
  assert.equal((await POST(request("POST"), context)).status, 202);
  delete process.env.FAL_API_KEY;
  const response = await GET(request(), context);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /FAL_API_KEY on the server/);
  assert.equal(calls, 2);
});

test("completed imported cue can report completion without another provider request", async (t) => {
  const { project, context, request } = await fixture(t);
  project.state.broll!.cues[0]!.videoPath = "broll/upload-video-test.mp4";
  delete project.state.broll!.cues[0]!.imagePrompt;
  await project.save();
  delete process.env.FAL_API_KEY;
  t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected provider request"); });
  const response = await GET(request(), context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "completed");
});

test("footage importer rejects a stale generation prompt before fetching or replacing media", async (t) => {
  const { project, context } = await fixture(t);
  const response = await importFootage(new Request("http://localhost/api/projects/episode/broll/reaction/footage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://v3.fal.media/files/video.mp4", expectedPrompt: "An older prompt" }),
  }), context);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /prompt changed/);
  assert.equal((await Project.load(project.root, project.slug))?.state.broll?.cues[0]?.imagePath, "broll/prior.png");
});

test("footage importer rejects stale video orientation before fetching", async (t) => {
  const { project, context } = await fixture(t);
  const response = await importFootage(new Request("http://localhost/api/projects/episode/broll/reaction/footage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://v3.fal.media/files/video.mp4", expectedPrompt: project.state.broll!.cues[0]!.imagePrompt, expectedAspectRatio: "16:9" }),
  }), context);
  assert.equal(response.status, 409);
  assert.match(await response.text(), /aspect ratio changed/);
  assert.equal((await Project.load(project.root, project.slug))?.state.broll?.cues[0]?.imagePath, "broll/prior.png");
});
