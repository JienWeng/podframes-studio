import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_HOSTS, Project, runProcess } from "@podframes/core";
import { POST } from "../app/api/projects/[slug]/broll/[cueId]/footage/route";

test("uploaded reaction footage is normalized, muted and saved without changing a rejected replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "podframes-footage-test-"));
  const cwd = process.cwd();
  try {
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []");
    const project = await Project.create(
      { topic: "Footage test", hosts: structuredClone(DEFAULT_HOSTS) },
      root,
      "episode",
    );
    project.state.broll = {
      cues: [{ id: "reaction", type: "broll", start: 0, end: 3 }],
    };
    await project.save();
    const source = join(root, "source.mp4");
    await runProcess("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=160x160:r=5",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      source,
    ]);
    process.chdir(root);
    const request = (bytes: Uint8Array) => {
      const form = new FormData();
      form.set(
        "file",
        new File([new Uint8Array(bytes)], "reaction.mp4", {
          type: "video/mp4",
        }),
      );
      return new Request(
        "http://localhost/api/projects/episode/broll/reaction/footage",
        { method: "POST", body: form },
      );
    };
    const context = {
      params: Promise.resolve({ slug: "episode", cueId: "reaction" }),
    };
    const response = await POST(request(await readFile(source)), context);
    assert.equal(response.status, 200, await response.clone().text());
    const cue = (await response.json()).cue;
    assert.match(cue.videoPath, /^broll\/upload-video-.+\.mp4$/);
    assert.ok(cue.end <= 1.1);
    const streams = await runProcess("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "json",
      project.abs(cue.videoPath),
    ]);
    assert.deepEqual(
      JSON.parse(streams.stdout).streams.map(
        (stream: { codec_type: string }) => stream.codec_type,
      ),
      ["video"],
    );
    assert.equal(
      (await POST(request(new Uint8Array([1, 2])), context)).status,
      400,
    );
    assert.equal(
      (await Project.load(root, "episode"))?.state.broll?.cues[0]?.videoPath,
      cue.videoPath,
    );
  } finally {
    process.chdir(cwd);
    await rm(root, { recursive: true, force: true });
  }
});
