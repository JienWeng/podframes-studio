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
import {
  Project,
  clearStages,
  withProjectLock,
  runProcess as run,
} from "@podframes/core";
import { findRepoRoot, safeSlug } from "@/lib/root";
import { isRunActiveAnywhere } from "@/lib/runs";
import { downloadFootage, validateFootageBytes } from "@/lib/footage-download";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; cueId: string }> },
) {
  const { slug, cueId } = await params;
  const safe = safeSlug(slug);
  const root = findRepoRoot();
  if (isRunActiveAnywhere(safe))
    return new Response(
      "Wait for generation to finish before replacing footage.",
      { status: 409 },
    );
  return withProjectLock(
    safe,
    async () => {
      if (isRunActiveAnywhere(safe))
        return new Response("Wait for generation to finish.", { status: 409 });
      const project = await Project.load(root, safe);
      const cue = project?.state.broll?.cues.find(
        (item) => item.id === cueId && item.type === "broll",
      );
      if (!project || !cue)
        return new Response("B-roll cue not found.", { status: 404 });
      let directory: string | undefined;
      try {
        let bytes: Uint8Array;
        let sourceUrl: string | undefined;
        if (
          request.headers.get("content-type")?.includes("multipart/form-data")
        ) {
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File) || file.size > 50 * 1024 * 1024)
            throw new Error("Choose an MP4 or WebM video up to 50 MB.");
          bytes = new Uint8Array(await file.arrayBuffer());
        } else {
          const input = await request.json();
          if (typeof input?.url !== "string")
            throw new Error("Supply a direct HTTPS video URL.");
          sourceUrl = input.url;
          bytes = await downloadFootage(sourceUrl!);
        }
        const extension = validateFootageBytes(bytes);
        directory = await mkdtemp(join(tmpdir(), "podframes-footage-"));
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
          { signal: request.signal, timeoutMs: 90_000 },
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
          { timeoutMs: 10_000 },
        );
        const duration = Number(probe.stdout.trim());
        if (!Number.isFinite(duration) || duration < 0.2)
          throw new Error(
            "Footage must contain at least 0.2 seconds of video.",
          );
        const hash = createHash("sha256")
          .update(await readFile(output))
          .digest("hex")
          .slice(0, 20);
        const relative = `broll/upload-video-${hash}.mp4`;
        await mkdir(project.abs("broll"), { recursive: true });
        await copyFile(output, project.abs(relative));
        cue.videoPath = relative;
        delete cue.imagePath;
        delete cue.imagePrompt;
        if (sourceUrl) cue.sourceUrl = sourceUrl;
        else delete cue.sourceUrl;
        cue.end = Math.min(cue.end, cue.start + duration);
        await clearStages(project, ["compose", "render"]);
        await project.save();
        return Response.json({ cue });
      } catch (error) {
        return new Response(
          error instanceof Error ? error.message : "Could not import footage.",
          { status: 400 },
        );
      } finally {
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    },
    root,
  );
}
