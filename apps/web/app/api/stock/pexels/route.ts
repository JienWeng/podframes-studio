import { resolveEnv, searchPexelsVideos } from "@podframes/core";
import { findRepoRoot } from "@/lib/root";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const apiKey = resolveEnv(findRepoRoot()).pexelsApiKey;
  if (!apiKey)
    return new Response(
      "Set PEXELS_API_KEY in the server .env, then restart the studio and worker.",
      { status: 503 },
    );
  const params = new URL(request.url).searchParams;
  const aspectRatio = params.get("aspect") ?? "16:9";
  if (aspectRatio !== "16:9" && aspectRatio !== "9:16")
    return new Response("Choose portrait or landscape footage.", {
      status: 400,
    });
  try {
    const result = await searchPexelsVideos({
      apiKey,
      query: params.get("query") ?? "",
      aspectRatio,
      page: Number(params.get("page") ?? 1),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Pexels search failed.",
      { status: 400 },
    );
  }
}
