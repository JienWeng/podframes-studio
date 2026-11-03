import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DEFAULT_HOSTS } from "../config";
import { Project } from "../project";
import { run } from "../util/proc";
import { importFootageFile } from "./footage";

test("shared footage import normalizes video without editing or saving project state", async () => {
  const root = await mkdtemp(join(tmpdir(), "podframes-footage-test-"));
  try {
    const project = await Project.create(
      { topic: "Footage import", hosts: DEFAULT_HOSTS },
      root,
    );
    const before = JSON.stringify(project.state);
    const saved = await readFile(project.path("project.json"), "utf8");
    const source = join(root, "source.mp4");
    await run("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=32x32:r=10:d=0.4",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      source,
    ]);
    const result = await importFootageFile({
      project,
      bytes: await readFile(source),
    });
    assert.match(result.videoPath, /^broll\/upload-video-[a-f0-9]{20}\.mp4$/);
    assert.ok(result.duration >= 0.2);
    assert.ok((await stat(project.abs(result.videoPath))).size > 0);
    assert.equal(JSON.stringify(project.state), before);
    assert.equal(await readFile(project.path("project.json"), "utf8"), saved);
    await assert.rejects(
      importFootageFile({ project, bytes: new TextEncoder().encode("<html>") }),
      /direct MP4 or WebM/,
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      importFootageFile({
        project,
        bytes: await readFile(source),
        signal: controller.signal,
      }),
      /abort/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
