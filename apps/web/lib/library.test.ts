import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_HOSTS, Project, CodexClient } from "@podframes/core";
import {
  saveCast,
  readCast,
  listLibrary,
  libraryId,
  applySavedCast,
  createSeries,
  createSeriesEpisode,
  updateCast,
  readCastPortrait,
  regenerateCastPortrait,
} from "./library";

const portrait = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "podframes-library-"));
  const hosts = structuredClone(DEFAULT_HOSTS);
  hosts[0].model = "fish/drama-3";
  hosts[0].defaultStyle = "quietly curious";
  const project = await Project.create(
    {
      topic: "A reusable show",
      hosts,
      language: "zh",
      options: {
        captionStyle: "clean",
        videoProvider: "heygen",
        heygenAuth: "subscription",
      },
    },
    root,
    "source",
  );
  await mkdir(project.abs("stills"), { recursive: true });
  for (const host of hosts)
    await writeFile(project.abs(`stills/${host.id}.png`), portrait);
  project.state.uploads = Object.fromEntries(
    hosts.map((host) => [host.id, `stills/${host.id}.png`]),
  );
  await project.save();
  return { root, project };
}

test("saved cast copies its portrait and settings and preserves the target role", async (t) => {
  const { root, project } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const saved = await saveCast(
    { ...project.state.config.hosts[0], avatarKey: "ada" },
    portrait,
    root,
  );
  assert.equal((await readCast(saved.id, root)).host.model, "fish/drama-3");
  assert.equal(saved.host.avatarKey, undefined);
  const target = project.state.config.hosts[1];
  const originalRole = {
    id: target.id,
    side: target.side,
    speaker: target.speaker,
  };
  await applySavedCast(project, saved.id, target.id);
  assert.deepEqual(
    {
      id: project.state.config.hosts[1].id,
      side: project.state.config.hosts[1].side,
      speaker: project.state.config.hosts[1].speaker,
    },
    originalRole,
  );
  assert.equal(project.state.config.hosts[1].model, "fish/drama-3");
  assert.equal(project.state.config.hosts[1].defaultStyle, "quietly curious");
  assert.deepEqual(
    new Uint8Array(
      await readFile(project.abs(project.state.uploads![target.id])),
    ),
    portrait,
  );
  assert.equal((await listLibrary(root)).cast.length, 1);
  assert.throws(() => libraryId("../../secret"), /Invalid library/);
  await assert.rejects(saveCast(target, new Uint8Array([1, 2]), root), /PNG/);
});

test("series retains independent template assets after the source video is removed", async (t) => {
  const { root, project } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const series = await createSeries(
    "The weekly show",
    "Natural Mandarin conversation",
    project.slug,
    root,
  );
  await Project.delete(root, project.slug);
  const episode = await createSeriesEpisode(series.id, root);
  assert.equal(episode.state.seriesId, series.id);
  assert.equal(episode.state.config.language, "zh");
  assert.equal(episode.state.config.hosts[0].model, "fish/drama-3");
  assert.equal(episode.state.options.videoProvider, "heygen");
  assert.equal(episode.state.options.captionStyle, "clean");
  assert.equal(episode.state.script, undefined);
  assert.equal(episode.state.speech, undefined);
  for (const path of Object.values(episode.state.uploads!))
    assert.deepEqual(
      new Uint8Array(await readFile(episode.abs(path))),
      portrait,
    );
  assert.equal((await listLibrary(root)).series[0].id, series.id);
});

test("editing saved cast keeps its ID, validates revisions and replaces portraits atomically", async (t) => {
  const { root, project } = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const entry = await saveCast(project.state.config.hosts[0], portrait, root);
  await applySavedCast(project, entry.id, "host_a");
  const originalPath = project.state.uploads!.host_a!;
  const host = {
    ...entry.host,
    name: "Updated character",
    model: "fish/s2.1-pro",
    defaultStyle: "deadpan",
  };
  const changed = await updateCast(
    entry.id,
    host,
    entry.createdAt,
    undefined,
    root,
  );
  assert.equal(changed.id, entry.id);
  assert.equal((await listLibrary(root)).cast.length, 1);
  assert.deepEqual(
    new Uint8Array(await readCastPortrait(changed, root)),
    portrait,
  );
  await assert.rejects(
    updateCast(entry.id, host, entry.createdAt, undefined, root),
    /Cast changed/,
  );
  await assert.rejects(
    updateCast(entry.id, host, changed.revision!, new Uint8Array([1, 2]), root),
    /PNG/,
  );
  assert.equal((await readCast(entry.id, root)).revision, changed.revision);
  const replacement = new Uint8Array([...portrait, 1]);
  const updated = await updateCast(
    entry.id,
    host,
    changed.revision!,
    replacement,
    root,
  );
  assert.notEqual(updated.portraitUrl, entry.portraitUrl);
  assert.deepEqual(
    new Uint8Array(await readCastPortrait(updated, root)),
    replacement,
  );
  assert.deepEqual(
    new Uint8Array(await readFile(project.abs(originalPath))),
    portrait,
  );
  await applySavedCast(project, entry.id, "host_a");
  assert.notEqual(project.state.uploads!.host_a, originalPath);
  assert.deepEqual(
    new Uint8Array(await readFile(project.abs(project.state.uploads!.host_a!))),
    replacement,
  );
});

test("cast edit API accepts metadata without another portrait and rejects stale forms", async (t) => {
  const { root, project } = await fixture();
  const cwd = process.cwd();
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []");
  process.chdir(root);
  t.after(async () => {
    process.chdir(cwd);
    await rm(root, { recursive: true, force: true });
  });
  const entry = await saveCast(project.state.config.hosts[0], portrait, root);
  const { PATCH } = await import("../app/api/library/route");
  const request = () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      id: entry.id,
      version: entry.createdAt,
      name: "Edited",
      model: "fish/drama-3",
      voice: entry.host.voice,
      style: "dry humour",
    }))
      form.set(key, value);
    return new Request("http://localhost/api/library", {
      method: "PATCH",
      body: form,
    });
  };
  const result = await PATCH(request());
  assert.equal(result.status, 200);
  assert.equal((await result.json()).host.defaultStyle, "dry humour");
  assert.equal((await PATCH(request())).status, 409);
});

test("cast regeneration previews without saving and duplicate requests reuse generated bytes", async (t) => {
  const { root, project } = await fixture();
  const cwd = process.cwd();
  const previousPath = process.env.PATH;
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []");
  const binary = join(root, "codex");
  await writeFile(
    binary,
    `#!${process.execPath}\nconsole.log("Logged in using ChatGPT");\n`,
  );
  await chmod(binary, 0o755);
  process.env.PATH = `${root}:${previousPath}`;
  process.chdir(root);
  t.after(async () => {
    process.chdir(cwd);
    process.env.PATH = previousPath;
    await rm(root, { recursive: true, force: true });
  });
  const entry = await saveCast(project.state.config.hosts[0], portrait, root);
  const generated = new Uint8Array([...portrait, 42]);
  const mock = t.mock.method(
    CodexClient.prototype,
    "generateImageToFile",
    async (args: Parameters<CodexClient["generateImageToFile"]>[0]) => {
      assert.match(args.prompt, /navy jacket/);
      assert.equal(args.aspectRatio, "9:16");
      await writeFile(args.outputPath, generated);
      return args.outputPath;
    },
  );
  await assert.rejects(
    regenerateCastPortrait(
      entry.id,
      "old-version",
      "navy jacket",
      undefined,
      root,
    ),
    /Cast changed/,
  );
  assert.equal(mock.mock.callCount(), 0);
  const { POST } = await import(
    "../app/api/library/cast/[id]/regenerate/route"
  );
  const request = () =>
    new Request(`http://localhost/api/library/cast/${entry.id}/regenerate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "portrait-preview-test-0001",
      },
      body: JSON.stringify({
        version: entry.createdAt,
        appearance: "navy jacket",
      }),
    });
  const context = { params: Promise.resolve({ id: entry.id }) };
  const first = await POST(request(), context);
  assert.equal(first.status, 200);
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), generated);
  const replay = await POST(request(), context);
  assert.equal(replay.headers.get("Idempotency-Replayed"), "true");
  assert.deepEqual(new Uint8Array(await replay.arrayBuffer()), generated);
  assert.equal(mock.mock.callCount(), 1);
  assert.deepEqual(
    new Uint8Array(
      await readCastPortrait(await readCast(entry.id, root), root),
    ),
    portrait,
  );
  const saved = await updateCast(
    entry.id,
    entry.host,
    entry.createdAt,
    generated,
    root,
  );
  assert.deepEqual(
    new Uint8Array(await readCastPortrait(saved, root)),
    generated,
  );
});

test("library API saves existing cast and starts linked series episodes", async (t) => {
  const { root, project } = await fixture();
  const previous = process.cwd();
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []");
  process.chdir(root);
  t.after(async () => {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  });
  const { POST } = await import("../app/api/library/route");
  const request = (body: unknown) =>
    new Request("http://localhost/api/library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const saved = await POST(
    request({ kind: "cast", slug: project.slug, hostId: "host_a" }),
  );
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).host.model, "fish/drama-3");
  const created = await POST(
    request({
      kind: "series",
      title: "API show",
      description: "",
      template: project.slug,
    }),
  );
  assert.equal(created.status, 201);
  const series = await created.json();
  const episode = await POST(request({ kind: "episode", seriesId: series.id }));
  assert.equal(episode.status, 201);
  assert.equal((await episode.json()).seriesId, series.id);
  assert.equal(
    (await POST(request({ kind: "episode", seriesId: "../../private" })))
      .status,
    400,
  );
});
