import {
  Project,
  clearStages,
  downloadFootage,
  getPexelsVideo,
  importFootageFile,
  resolveEnv,
  withProjectLock,
} from "@podframes/core";
import { findRepoRoot, safeSlug } from "@/lib/root";
import { isRunActiveAnywhere } from "@/lib/runs";

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
      const apiKey = resolveEnv(root).pexelsApiKey;
      if (!apiKey)
        return new Response(
          "Set PEXELS_API_KEY in the server .env, then restart the studio and worker.",
          { status: 503 },
        );
      try {
        const body = await request.json();
        if (!Number.isSafeInteger(body?.id) || body.id < 1)
          return new Response("Choose a Pexels video.", { status: 400 });
        const video = await getPexelsVideo({
          apiKey,
          id: body.id,
          aspectRatio: project.state.config.aspectRatio ?? "16:9",
        });
        const imported = await importFootageFile({
          project,
          bytes: await downloadFootage(video.videoUrl),
          signal: request.signal,
        });
        cue.videoPath = imported.videoPath;
        cue.sourceUrl = video.url;
        cue.pexels = {
          id: video.id,
          url: video.url,
          author: video.author,
          authorUrl: video.authorUrl,
        };
        delete cue.imagePath;
        delete cue.imagePrompt;
        cue.end = Math.min(cue.end, cue.start + imported.duration);
        project.state.options.showBroll = true;
        await clearStages(project, ["compose", "render"]);
        await project.save();
        return Response.json({ cue });
      } catch (error) {
        return new Response(
          error instanceof Error
            ? error.message
            : "Could not import Pexels footage.",
          { status: 400 },
        );
      }
    },
    root,
  );
}
