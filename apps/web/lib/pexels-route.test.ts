import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_HOSTS, Project } from "@podframes/core";
import { GET } from "../app/api/stock/pexels/route";
import { POST } from "../app/api/projects/[slug]/broll/[cueId]/pexels/route";

test("Pexels routes keep keys server-side and reject invalid choices before media replacement", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "podframes-pexels-route-"));
  const cwd = process.cwd();
  const oldKey = process.env.PEXELS_API_KEY;
  t.after(async () => {
    process.chdir(cwd);
    if (oldKey === undefined) delete process.env.PEXELS_API_KEY;
    else process.env.PEXELS_API_KEY = oldKey;
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []");
  const project = await Project.create(
    { topic: "Pexels", hosts: structuredClone(DEFAULT_HOSTS) },
    root,
    "episode",
  );
  project.state.broll = {
    cues: [
      {
        id: "stock",
        type: "broll",
        start: 0,
        end: 3,
        imagePath: "broll/prior.png",
      },
    ],
  };
  await project.save();
  process.chdir(root);
  delete process.env.PEXELS_API_KEY;
  const search = () =>
    new Request("http://localhost/api/stock/pexels?query=office&aspect=9:16");
  assert.equal((await GET(search())).status, 503);
  process.env.PEXELS_API_KEY = "secret-test-key";
  let calls = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, init?: RequestInit) => {
      calls++;
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "secret-test-key",
      );
      return Response.json({ page: 1, total_results: 0, videos: [] });
    },
  );
  const found = await GET(search());
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), { videos: [], page: 1, hasMore: false });
  const context = {
    params: Promise.resolve({ slug: "episode", cueId: "stock" }),
  };
  const invalid = await POST(
    new Request("http://localhost/api/projects/episode/broll/stock/pexels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "http://localhost/private" }),
    }),
    context,
  );
  assert.equal(invalid.status, 400);
  assert.equal(calls, 1);
  assert.equal(
    (await Project.load(root, "episode"))?.state.broll?.cues[0]?.imagePath,
    "broll/prior.png",
  );
});
