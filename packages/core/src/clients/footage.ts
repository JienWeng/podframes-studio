import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
  mkdir,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Project } from "../project";
import { run } from "../util/proc";
import { validateFootageBytes } from "./footage-download";

/** Validate and normalize imported footage before storing it in the project. */
export async function importFootageFile({
  project,
  bytes,
  signal,
}: {
  project: Project;
  bytes: Uint8Array;
  signal?: AbortSignal;
}): Promise<{ videoPath: string; duration: number }> {
  signal?.throwIfAborted();
  const extension = validateFootageBytes(bytes);
  const directory = await mkdtemp(join(tmpdir(), "podframes-footage-"));
  try {
    const source = join(directory, `source.${extension}`);
    const output = join(directory, "footage.mp4");
    await writeFile(source, bytes);
    await run(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        source,
        "-t",
        "30",
        "-an",
        "-vf",
        "scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        output,
      ],
      { signal, timeoutMs: 90_000 },
    );
    const probe = await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        output,
      ],
      { signal, timeoutMs: 10_000 },
    );
    const duration = Number(probe.stdout.trim());
    if (!Number.isFinite(duration) || duration < 0.2)
      throw new Error("Footage must contain at least 0.2 seconds of video.");
    const hash = createHash("sha256")
      .update(await readFile(output))
      .digest("hex")
      .slice(0, 20);
    const relative = `broll/upload-video-${hash}.mp4`;
    await mkdir(project.abs("broll"), { recursive: true });
    await copyFile(output, project.abs(relative));
    return { videoPath: relative, duration };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
