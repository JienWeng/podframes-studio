import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { DEFAULT_HOSTS, DEFAULT_OPTIONS } from "../config";
import { optionInvalidations } from "../shared";
import { Project } from "../project";
import { Reporter } from "../util/events";
import type { GenerationClient, StructuredRequest } from "../clients/writing";
import type { Cue } from "../types";
import { directQuoteStickers, needsQuoteStickerDirection } from "./stickers";

type ImageRequest = Parameters<GenerationClient["generateImageToFile"]>[0];
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const quote = (id: string, title = "又要加班了"): Cue => ({
  id,
  type: "quote",
  title,
  start: 0,
  end: 3,
});
const existing = (cueId: string, stickerId: string) => ({
  cueId,
  decision: "existing",
  stickerId,
  prompt: "",
  textTemplate: "comic",
});
const generate = (cueId: string, prompt: string) => ({
  cueId,
  decision: "generate",
  stickerId: "",
  prompt,
  textTemplate: "burst",
});
const none = (cueId: string) => ({
  cueId,
  decision: "none",
  stickerId: "",
  prompt: "",
  textTemplate: "ribbon",
});

async function fixture(t: TestContext, cues: Cue[], directions: unknown) {
  const root = await mkdtemp(join(tmpdir(), "podframes-stickers-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []");
  const builtins = join(root, "apps", "web", "public", "stickers");
  await mkdir(builtins, { recursive: true });
  for (const id of ["overworked", "empty-wallet", "shocked"])
    await writeFile(
      join(builtins, `${id}.png`),
      Buffer.concat([png, Buffer.from(id)]),
    );
  const project = await Project.create(
    { topic: "打工人的加班和工资", hosts: structuredClone(DEFAULT_HOSTS) },
    root,
    "episode",
  );
  project.state.script = {
    topic: project.state.config.topic,
    title: "办公室日常",
    hook: "今天又要加班？",
    turns: [
      {
        index: 0,
        hostId: "host_a",
        speaker: "HOST_A",
        text: "今天工作又堆成山了，恐怕还要加班。",
      },
      {
        index: 1,
        hostId: "host_b",
        speaker: "HOST_B",
        text: "工资刚到账，房租就把钱包掏空了。",
      },
    ],
  };
  project.state.speech = {
    audioPath: "audio/test.mp3",
    mediaType: "audio/mpeg",
    durationSec: 16,
    words: [],
    turns: project.state.script.turns.map((turn) => ({
      ...turn,
      turnIndex: turn.index,
      start: turn.index * 8,
      end: (turn.index + 1) * 8,
      durationSec: 8,
      mediaType: "audio/mpeg",
      words: [],
      segments: [],
    })),
  };
  project.state.broll = { cues };
  await project.save();
  const requests: StructuredRequest[] = [];
  const images: ImageRequest[] = [];
  const control: {
    directions: unknown;
    beforeImage?: (args: ImageRequest) => Promise<void>;
  } = { directions };
  const codex = {
    generateStructured: async (args: StructuredRequest) => {
      requests.push(args);
      return control.directions;
    },
    generateImageToFile: async (args: ImageRequest) => {
      images.push(args);
      await control.beforeImage?.(args);
      await writeFile(
        args.outputPath,
        Buffer.concat([png, Buffer.from(args.prompt)]),
      );
      return args.outputPath;
    },
  } as unknown as GenerationClient;
  return {
    root,
    project,
    requests,
    images,
    control,
    ctx: {
      project,
      codex,
      env: {},
      reporter: new Reporter({ console: false }),
    },
  };
}

test("one semantic planning call reuses a relevant built-in and caches an explicit none", async (t) => {
  const { ctx, project, requests, images } = await fixture(
    t,
    [quote("work"), quote("sober", "认真看待受害者的损失")],
    [existing("work", "overworked"), none("sober")],
  );
  assert.equal(needsQuoteStickerDirection(project), true);
  await directQuoteStickers(ctx);
  assert.equal(requests.length, 1);
  assert.match(
    requests[0]!.system!,
    /actual meaning supports this specific line/,
  );
  assert.match(requests[0]!.contents, /nearby dialogue/);
  assert.match(requests[0]!.contents, /工资刚到账/);
  assert.match(
    requests[0]!.contents,
    /office work, overtime, deadlines, burnout/,
  );
  assert.match(requests[0]!.contents, /empty-wallet/);
  const selected = project.state.broll!.cues[0]!;
  assert.equal(selected.stickerDirection?.decision, "existing");
  assert.equal(selected.textTemplate, "comic");
  assert.match(selected.stickerDirection!.contextKey!, /^[a-f0-9]{64}$/);
  assert.match(
    selected.imagePath!,
    /^broll\/upload-sticker-[a-f0-9]{64}\.png$/,
  );
  assert.deepEqual(
    await readFile(project.abs(selected.imagePath!)),
    await readFile(
      join(project.root, "apps/web/public/stickers/overworked.png"),
    ),
  );
  assert.equal(
    project.state.broll!.cues[1]!.stickerDirection?.decision,
    "none",
  );
  assert.equal(images.length, 0);
  assert.equal(needsQuoteStickerDirection(project), false);
  await directQuoteStickers(ctx);
  assert.equal(requests.length, 1);
});

test("new stickers are checkpointed first and capped at two distinct creations per episode", async (t) => {
  const cues = [
    quote("one", "手机都等出蘑菇了"),
    quote("two", "脑子像在原地转圈"),
    quote("three", "咖啡杯在催我醒醒"),
  ];
  const { ctx, project, images, requests, control } = await fixture(t, cues, [
    generate(
      "one",
      "A bored cream cartoon phone sprouting tiny mushrooms while waiting for a message",
    ),
    generate(
      "two",
      "A small confused cream cartoon brain riding a circular toy train",
    ),
    generate("three", "An impatient coffee mug tapping its little foot"),
  ]);
  control.beforeImage = async (args) => {
    const saved = await Project.load(project.root, project.slug);
    assert.ok(saved?.state.broll);
    assert.ok(saved.state.broll.cues.every((cue) => cue.stickerDirection));
    assert.equal(saved.state.broll.cues[2]!.stickerDirection!.decision, "none");
    assert.equal(args.aspectRatio, "1:1");
    assert.equal(args.imageSize, "1K");
    assert.match(args.prompt, /truly transparent background/);
    assert.match(args.prompt, /No text.*halo/);
  };
  await directQuoteStickers(ctx);
  assert.equal(images.length, 2);
  assert.equal(cues[2]!.stickerDirection?.decision, "none");
  const metadata = (
    await readdir(join(project.root, "library/stickers"))
  ).filter((name) => name.endsWith(".json"));
  assert.equal(metadata.length, 2);
  assert.ok(
    metadata.every((name) => /^generated-[a-f0-9]{64}\.json$/.test(name)),
  );
  assert.equal(
    JSON.parse(
      await readFile(
        join(project.root, "library/stickers", metadata[0]!),
        "utf8",
      ),
    ).createdFor,
    project.slug,
  );
  control.directions = [
    generate("one", "A brand new idea"),
    generate("two", "Another new idea"),
    generate("three", "A third new idea"),
  ];
  project.state.speech!.turns[0]!.text = "现在聊一个新的轻松笑话。";
  await directQuoteStickers(ctx);
  assert.equal(images.length, 2);
  assert.match(requests[1]!.contents, /Remaining new-sticker budget: 0/);
  assert.ok(cues.every((cue) => cue.stickerDirection?.decision === "none"));
  await directQuoteStickers(ctx);
  assert.equal(requests.length, 2);
});

test("image failure preserves choices and completed assets, then resumes without replanning", async (t) => {
  const { ctx, project, requests, images, control } = await fixture(
    t,
    [quote("one"), quote("two")],
    [
      generate("one", "A sleepy cream moon in pajamas"),
      generate("two", "A patient little phone holding a tiny umbrella"),
    ],
  );
  let failed = false;
  control.beforeImage = async (args) => {
    if (args.prompt.includes("patient little phone") && !failed) {
      failed = true;
      throw new Error("image service unavailable");
    }
  };
  await assert.rejects(directQuoteStickers(ctx), /image service unavailable/);
  const saved = await Project.load(project.root, project.slug);
  assert.ok(saved?.state.broll?.cues[0]?.imagePath);
  assert.equal(
    saved.state.broll.cues[1]!.stickerDirection?.decision,
    "generate",
  );
  const resumed = { ...ctx, project: saved };
  await directQuoteStickers(resumed);
  assert.equal(requests.length, 1);
  assert.equal(
    images.filter((image) => image.prompt.includes("sleepy cream moon")).length,
    1,
  );
  assert.ok(saved.state.broll.cues.every((cue) => cue.imagePath));
});

test("saved generation directives also respect the creation cap without replanning", async (t) => {
  const cues = ["one", "two", "three"].map((id) => ({
    ...quote(id),
    stickerDirection: {
      decision: "generate" as const,
      prompt: `An original small reaction character ${id}`,
    },
  }));
  const { ctx, requests, images } = await fixture(t, cues, []);
  await directQuoteStickers(ctx);
  assert.equal(requests.length, 0);
  assert.equal(images.length, 2);
  assert.equal(cues[2]!.stickerDirection.decision, "none");
});

test("generated library assets can be semantically reused in another episode", async (t) => {
  const { ctx, project, images, requests, control } = await fixture(
    t,
    [quote("one")],
    [
      generate(
        "one",
        "A bored phone growing tiny mushrooms while waiting for a message",
      ),
    ],
  );
  await directQuoteStickers(ctx);
  const id = project.state.broll!.cues[0]!.stickerDirection!.stickerId!;
  const second = await Project.create(
    structuredClone(project.state.config),
    project.root,
    "next-episode",
  );
  second.state.script = structuredClone(project.state.script);
  second.state.speech = structuredClone(project.state.speech);
  second.state.broll = { cues: [quote("later", "等消息等到手机长蘑菇")] };
  await second.save();
  control.directions = [existing("later", id)];
  await directQuoteStickers({ ...ctx, project: second });
  assert.equal(images.length, 1);
  assert.match(requests[1]!.contents, /bored phone growing tiny mushrooms/);
  assert.ok(second.state.broll.cues[0]!.imagePath);
});

test("context changes replan automatic art while manual none and uploaded art persist", async (t) => {
  const manualNone = {
    ...quote("manual-none"),
    stickerDirection: { decision: "none" as const },
  };
  const uploaded = { ...quote("manual-upload"), imagePath: "broll/custom.png" };
  const { ctx, project, requests, images, control } = await fixture(
    t,
    [quote("auto"), manualNone, uploaded],
    [existing("auto", "overworked")],
  );
  await mkdir(project.path("broll"), { recursive: true });
  await writeFile(project.abs(uploaded.imagePath), png);
  await directQuoteStickers(ctx);
  const first = project.state.broll!.cues[0]!;
  const firstKey = first.stickerDirection!.contextKey;
  const firstImage = first.imagePath;
  first.title = "工资又被房租掏空了";
  project.state.speech!.turns[0]!.text = "我们现在谈工资和房租预算。";
  control.directions = [existing("auto", "empty-wallet")];
  assert.equal(needsQuoteStickerDirection(project), true);
  await directQuoteStickers(ctx);
  assert.notEqual(first.stickerDirection!.contextKey, firstKey);
  assert.notEqual(first.imagePath, firstImage);
  assert.equal(first.stickerDirection!.stickerId, "empty-wallet");
  assert.deepEqual(manualNone.stickerDirection, { decision: "none" });
  assert.equal(uploaded.imagePath, "broll/custom.png");
  assert.equal(requests.length, 2);
  assert.equal(images.length, 0);
  assert.equal(needsQuoteStickerDirection(project), false);
});

test("unknown IDs and oversized generation prompts fail before image generation", async (t) => {
  const { ctx, project, control, images } = await fixture(
    t,
    [quote("one")],
    [existing("one", "../../secrets")],
  );
  await assert.rejects(directQuoteStickers(ctx), /unknown asset ID/);
  assert.equal(project.state.broll!.cues[0]!.stickerDirection, undefined);
  control.directions = [generate("one", "x".repeat(1201))];
  await assert.rejects(directQuoteStickers(ctx), /1–1200/);
  control.directions = [existing("unknown-cue", "overworked")];
  await assert.rejects(directQuoteStickers(ctx), /invalid quote decision/);
  assert.equal(images.length, 0);
});

test("manual missing art fails clearly and disabled or completed quotes need no planner", async (t) => {
  const { ctx, project, requests } = await fixture(
    t,
    [{ ...quote("manual"), imagePath: "broll/missing.png" }],
    [],
  );
  assert.equal(needsQuoteStickerDirection(project), false);
  await assert.rejects(directQuoteStickers(ctx), /missing.*replacement/);
  project.state.options.autoStickers = false;
  await directQuoteStickers(ctx);
  assert.equal(needsQuoteStickerDirection(project), false);
  project.state.options.autoStickers = true;
  project.state.options.showGraphics = false;
  await directQuoteStickers(ctx);
  assert.equal(needsQuoteStickerDirection(project), false);
  assert.equal(requests.length, 0);
});

test("shared library locking reuses an identical generated asset across concurrent episodes", async (t) => {
  const { ctx, project, images } = await fixture(
    t,
    [quote("one")],
    [generate("one", "An original bored phone with tiny mushrooms")],
  );
  const second = await Project.create(
    structuredClone(project.state.config),
    project.root,
    "parallel-episode",
  );
  second.state.script = structuredClone(project.state.script);
  second.state.speech = structuredClone(project.state.speech);
  second.state.broll = structuredClone(project.state.broll);
  await second.save();
  await Promise.all([
    directQuoteStickers(ctx),
    directQuoteStickers({ ...ctx, project: second }),
  ]);
  assert.equal(images.length, 1);
  assert.ok(project.state.broll!.cues[0]!.imagePath);
  assert.ok(second.state.broll!.cues[0]!.imagePath);
});


test("enabling automatic stickers invalidates only composition and render", () => {
  const current = { ...DEFAULT_OPTIONS, autoStickers: false };
  assert.deepEqual(optionInvalidations(current, { autoStickers: true }), ["compose", "render"]);
  assert.deepEqual(optionInvalidations(current, { autoStickers: false }), []);
});
