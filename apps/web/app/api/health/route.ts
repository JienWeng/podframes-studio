import { resolveEnv, claudeStatus, codexStatus, fishStatus, whisperStatus, workerOnline, heygenStatus } from "@podframes/core";
import { execFile } from "node:child_process";
import { findRepoRoot } from "@/lib/root";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hasBinary = (name: string) => new Promise<boolean>((resolve) => {
  execFile(name, ["-version"], { timeout: 5000 }, (error) => resolve(!error));
});

/** Configuration probes only; provider credits and generation access are checked at run time. */
export async function GET() {
  const root = findRepoRoot();
  const env = resolveEnv(root);
  const [fish, whisper, codex, claude, heygen, ffmpeg, ffprobe] = await Promise.all([
    fishStatus(), whisperStatus(), codexStatus(), claudeStatus(), heygenStatus("subscription"), hasBinary("ffmpeg"), hasBinary("ffprobe"),
  ]);
  return Response.json({
    fish, whisper, codex, claude, heygen, ffmpeg, ffprobe,
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    automation: (process.env.PODFRAMES_API_TOKEN?.length ?? 0) >= 32,
    worker: workerOnline(root),
    heygenApi: !!env.heygenApiKey,
    fal: !!env.falApiKey,
    replicate: !!env.replicateApiKey,
    pexels: !!env.pexelsApiKey,
  }, { headers: { "Cache-Control": "no-store" } });
}
