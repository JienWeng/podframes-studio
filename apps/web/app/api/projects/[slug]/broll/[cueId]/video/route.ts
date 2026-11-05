import { access } from "node:fs/promises";
import { Project, pollBrollVideo, brollVideoStateFile, resolveEnv, withProjectLock } from "@podframes/core";
import { findRepoRoot, safeSlug } from "@/lib/root";
import { isRunActiveAnywhere } from "@/lib/runs";
import { POST as importFootage } from "../footage/route";

export const runtime = "nodejs";
export const maxDuration = 180;
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ slug: string; cueId: string }>;
}

async function handle(request: Request, context: Context): Promise<Response> {
  const { slug, cueId } = await context.params;
  const safe = safeSlug(slug);
  const root = findRepoRoot();
  if (isRunActiveAnywhere(safe)) return new Response("Wait for generation to finish before generating b-roll video.", { status: 409 });
  try {
    const result = await withProjectLock(safe, async () => {
      if (isRunActiveAnywhere(safe)) return new Response("Wait for generation to finish.", { status: 409 });
      const project = await Project.load(root, safe);
      const cue = project?.state.broll?.cues.find((item) => item.id === cueId && item.type === "broll");
      if (!project || !cue) return new Response("B-roll cue not found.", { status: 404 });
      if (request.method === "GET" && cue.videoPath && !cue.imagePrompt) return Response.json({ status: "completed", cue });
      const prompt = cue.imagePrompt?.trim();
      if (!prompt || prompt.length > 2000) return new Response("Save a video prompt of 1–2000 characters before generating.", { status: 400 });
      const aspectRatio = project.state.config.aspectRatio ?? "16:9";
      const model = project.state.options.brollVideoModel ?? "ltx-pro";
      const statePath = project.path(".broll-video", brollVideoStateFile(cue.id, prompt, aspectRatio, model));
      if (request.method === "GET") {
        const exists = await access(statePath).then(() => true, (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false;
          throw error;
        });
        if (!exists) return new Response("No saved video request for this prompt. Start generation first.", { status: 404 });
      }
      const apiKey = resolveEnv(root).falApiKey;
      if (!apiKey) return new Response("Set FAL_API_KEY on the server to generate AI b-roll video.", { status: 503 });
      const job = await pollBrollVideo({ apiKey, prompt, aspectRatio, statePath, model });
      if (job.status === "pending") return Response.json(job, { status: 202, headers: { "Cache-Control": "no-store" } });
      return { ...job, expectedPrompt: prompt, expectedAspectRatio: aspectRatio, expectedBrollVideoModel: model };
    }, root);
    if (result instanceof Response) return result;
    // The footage importer takes its own project lock. Release the queue lock before calling it.
    const imported = await importFootage(new Request(request.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: result.url, expectedPrompt: result.expectedPrompt, expectedAspectRatio: result.expectedAspectRatio, expectedBrollVideoModel: result.expectedBrollVideoModel }),
      signal: request.signal,
    }), { params: Promise.resolve({ slug: safe, cueId }) });
    if (!imported.ok) return imported;
    const { cue } = await imported.json();
    return Response.json({ status: "completed", requestId: result.requestId, cue }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI b-roll video request failed.";
    return new Response(message, { status: /outcome is unknown|different state path/.test(message) ? 409 : 502 });
  }
}

export { handle as POST, handle as GET };
