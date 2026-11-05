import {
  Project,
  clearStages,
  withProjectLock,
  importFootageFile,
} from "@podframes/core";
import { findRepoRoot, safeSlug } from "@/lib/root";
import { isRunActiveAnywhere } from "@/lib/runs";
import { downloadFootage } from "@/lib/footage-download";

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
          if (input.expectedPrompt !== undefined &&
              (typeof input.expectedPrompt !== "string" || cue.imagePrompt?.trim() !== input.expectedPrompt)) {
            return new Response("B-roll prompt changed while the video was generating. Review the cue before replacing its media.", { status: 409 });
          }
          if (input.expectedAspectRatio !== undefined && input.expectedAspectRatio !== (project.state.config.aspectRatio ?? "16:9")) {
            return new Response("Project aspect ratio changed while the video was generating. Review the cue before replacing its media.", { status: 409 });
          }
          if (input.expectedBrollVideoModel !== undefined && input.expectedBrollVideoModel !== (project.state.options.brollVideoModel ?? "ltx-pro")) {
            return new Response("B-roll video model changed while generating. Switch back to recover the saved result.", { status: 409 });
          }
          sourceUrl = input.url;
          bytes = await downloadFootage(sourceUrl!);
        }
        const { videoPath, duration } = await importFootageFile({ project, bytes, signal: request.signal });
        cue.videoPath = videoPath;
        delete cue.pexels;
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
      }
    },
    root,
  );
}
