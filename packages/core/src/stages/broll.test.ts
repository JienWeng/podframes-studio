import test from "node:test";
import assert from "node:assert/strict";
import { brollImagePath, brollImagePrompt } from "./broll";
import { contentHash } from "../util/fs";
import { brollMotion, brollMotionAt } from "../shared";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "../project";
import { DEFAULT_HOSTS } from "../config";
import { Reporter } from "../util/events";
import { runBroll } from "./broll";
import type { StageContext } from "./context";

test("b-roll cache tracks the complete art direction and canvas geometry", () => {
  const cue = { id: "cue-1", imagePrompt: "Close detail of a server rack in daylight" };
  const prompt = brollImagePrompt(cue.imagePrompt);
  assert.ok(prompt.startsWith(cue.imagePrompt));
  assert.match(prompt, /not a news photograph of the actual event/);
  assert.match(prompt, /no text/i);
  assert.equal(brollImagePath(cue), `broll/cue-1-${contentHash(prompt, 8)}.png`);
  assert.equal(brollImagePath(cue, "9:16"), `broll/cue-1-${contentHash(prompt, 8)}-9x16.png`);
  assert.notEqual(brollImagePath(cue), brollImagePath({ ...cue, imagePrompt: "A coastal city at dawn" }));
});

test("resuming B-roll preserves uploaded photos and never silently regenerates a missing photo", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "podframes-photo-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = await Project.create({ topic: "Photo edit", hosts: structuredClone(DEFAULT_HOSTS) }, root, "photo-test");
  project.state.script = { topic: "Photo edit", title: "Photo edit", hook: "", turns: [] };
  project.state.speech = { audioPath: "audio.mp3", durationSec: 6, mediaType: "audio/mpeg", words: [], turns: [] };
  const cue = { id: "cue-1", type: "broll" as const, start: 1, end: 4, imagePrompt: "A candid scene", imagePath: "broll/upload-test.jpg" };
  project.state.broll = { cues: [cue] };
  await mkdir(project.abs("broll"), { recursive: true });
  await writeFile(project.abs(cue.imagePath), "photo fixture");
  const ctx: StageContext = { project, codex: {} as StageContext["codex"], env: {}, reporter: new Reporter({ console: false }) };
  await runBroll(ctx);
  assert.equal(project.state.broll.cues[0]!.imagePath, "broll/upload-test.jpg");
  delete project.state.stages.broll;
  await rm(project.abs(cue.imagePath));
  await assert.rejects(runBroll(ctx), /Uploaded photo.*missing/);
  project.state.options.generateBrollImages = false;
  project.state.broll = { cues: [{ id: "footage-plan", type: "broll", start: 1, end: 4, imagePrompt: "A surprised reaction shot" }] };
  await runBroll(ctx);
  assert.equal(project.state.broll.cues[0]!.imagePath, undefined);
  delete project.state.stages.broll;
  project.state.options.showBroll = false;
  project.state.options.showGraphics = false;
  await runBroll(ctx);
  assert.deepEqual(project.state.broll.cues, []);
});

test("b-roll pans throughout the cue, alternates direction, and scrubs deterministically", () => {
  for (const index of [0, 1]) {
    const motion = brollMotion(index);
    assert.deepEqual(brollMotionAt(index, 0, 4), motion.from);
    assert.deepEqual(brollMotionAt(index, 4, 4), motion.to);
    const halfway = brollMotionAt(index, 2, 4);
    assert.ok(halfway.scale > motion.from.scale && halfway.scale < motion.to.scale);
    assert.notEqual(halfway.xPercent, motion.from.xPercent);
  }
  assert.equal(brollMotion(0).to.xPercent, -brollMotion(1).to.xPercent);
});


test("Pexels automation validates its key, omits empty searches, and preserves saved footage", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "podframes-stock-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = await Project.create({ topic: "Stock video", hosts: structuredClone(DEFAULT_HOSTS), options: { brollSource: "pexels", generateBrollImages: false } }, root, "stock-test");
  project.state.script = { topic: "Stock video", title: "Stock video", hook: "", turns: [] };
  project.state.speech = { audioPath: "audio.mp3", durationSec: 6, mediaType: "audio/mpeg", words: [], turns: [] };
  project.state.broll = { cues: [{ id: "stock", type: "broll", start: 1, end: 4, stockQuery: "office worker" }] };
  const ctx: StageContext = { project, codex: {} as StageContext["codex"], env: {}, reporter: new Reporter({ console: false }) };
  await assert.rejects(runBroll(ctx), /PEXELS_API_KEY/);
  ctx.env.pexelsApiKey = "test-key";
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    requests++;
    assert.equal(url.searchParams.get("query"), "office worker");
    return Response.json({ page: 1, total_results: 0, videos: [] });
  });
  await runBroll(ctx);
  assert.equal(requests, 1);
  assert.deepEqual(project.state.broll.cues, []);
  delete project.state.stages.broll;
  await mkdir(project.abs("broll"), { recursive: true });
  await writeFile(project.abs("broll/saved.mp4"), "saved footage fixture");
  project.state.broll = { cues: [{ id: "stock", type: "broll", start: 1, end: 4, videoPath: "broll/saved.mp4", stockQuery: "office worker" }] };
  await runBroll(ctx);
  assert.equal(requests, 1);
  assert.equal(project.state.broll.cues[0]!.videoPath, "broll/saved.mp4");
});


test("automatic planning keeps brief sticker-only actions separate from quote-card timing", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "podframes-action-stickers-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = await Project.create({ topic: "Writing and video", hosts: structuredClone(DEFAULT_HOSTS), options: { showBroll: false, showGraphics: true, autoStickers: true } }, root, "action-test");
  project.state.script = { topic: "Writing and video", title: "Writing and video", hook: "", turns: [] };
  project.state.speech = { audioPath: "audio.mp3", durationSec: 24, mediaType: "audio/mpeg", words: [], turns: [{
    turnIndex: 0, hostId: "host_a", speaker: "HOST_A", text: "写文案，做 video，薪水还是一个人的。", start: 0, end: 24,
    words: [{ text: "写文案，做 video，薪水还是一个人的。", start: 0, end: 24 }], segments: [], mediaType: "audio/mpeg", durationSec: 24,
  }] };
  let plans = 0;
  const codex = {
    async generateStructured() {
      plans++;
      if (plans === 1) return [
        { type: "quote", stickerOnly: true, start: 1, end: 2.2, title: "写文案" },
        { type: "quote", stickerOnly: true, start: 4, end: 5.4, title: "做 video" },
        { type: "quote", start: 20, end: 23, title: "薪水还是一个人的" },
      ];
      return project.state.broll!.cues.map((cue) => ({ cueId: cue.id, decision: "none", stickerId: "", prompt: "", textTemplate: "comic" }));
    },
    async generateImageToFile() { throw new Error("No artwork should be generated for explicit none decisions."); },
  };
  // The fixture planner returns the two distinct schema shapes in sequence.
  await runBroll({ project, codex: codex as StageContext["codex"], env: {}, reporter: new Reporter({ console: false }) });
  assert.equal(plans, 2);
  assert.deepEqual(project.state.broll!.cues.map(({ stickerOnly, start, end }) => ({ stickerOnly, start, end })), [
    { stickerOnly: true, start: 1, end: 2.2 },
    { stickerOnly: true, start: 4, end: 5.4 },
    { stickerOnly: undefined, start: 20, end: 23 },
  ]);
});
