import assert from "node:assert/strict";
import test from "node:test";
import { exportVideoArgs } from "./render";
import { optionInvalidations } from "../shared";
import { DEFAULT_OPTIONS } from "../config";

test("export pace retimes picture and sound together and invalidates only render", () => {
  const settings = { width: 720, height: 1280, downscale: true, options: { ...DEFAULT_OPTIONS, exportSpeed: 1.1 } };
  const args = exportVideoArgs("fresh.raw.mp4", "output.mp4", settings);
  assert.equal(args[args.indexOf("-i") + 1], "fresh.raw.mp4");
  assert.equal(args[args.indexOf("-vf") + 1], "setpts=(PTS-STARTPTS)/1.1,scale=720:1280:flags=lanczos");
  assert.equal(args[args.indexOf("-af") + 1], "asetpts=PTS-STARTPTS,atempo=1.1");
  assert.equal(args[args.indexOf("-bf") + 1], "0");
  assert.deepEqual(optionInvalidations(DEFAULT_OPTIONS, { exportSpeed: 1.1 }), ["render"]);
  assert.deepEqual(optionInvalidations(DEFAULT_OPTIONS, { exportSpeed: 1 }), []);
});

test("normal pace preserves stream copy and export bounds fail before encoding", () => {
  const settings = { width: 1080, height: 1920, downscale: false, options: DEFAULT_OPTIONS };
  const args = exportVideoArgs("fresh.raw.mp4", "output.mp4", settings);
  assert.equal(args[args.indexOf("-c") + 1], "copy");
  assert.ok(!args.includes("-af"));
  for (const exportSpeed of [0, 0.74, 1.51, Infinity, NaN]) {
    assert.throws(() => exportVideoArgs("in", "out", { ...settings, options: { ...DEFAULT_OPTIONS, exportSpeed } }), /0.75–1.5/);
  }
});
