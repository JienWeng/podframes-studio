import { ensureEnvLoaded } from "@podframes/core";
import { regenerateCastPortrait } from "@/lib/library";
import { idempotentRequest } from "@/lib/idempotency";
import { findRepoRoot } from "@/lib/root";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const root = findRepoRoot();
  ensureEnvLoaded(root);
  const { id } = await params;
  let input: { version?: unknown; appearance?: unknown };
  try {
    input = await request.clone().json();
  } catch {
    return new Response("Invalid portrait request.", { status: 400 });
  }
  if (
    typeof input.version !== "string" ||
    !input.version ||
    input.version.length > 80 ||
    typeof input.appearance !== "string" ||
    !input.appearance.trim() ||
    input.appearance.length > 2000
  )
    return new Response(
      "Supply the cast version and a portrait description of 1–2000 characters.",
      { status: 400 },
    );
  const version = input.version;
  const appearance = input.appearance;
  return idempotentRequest(root, request, async () => {
    try {
      const bytes = await regenerateCastPortrait(
        id,
        version,
        appearance,
        request.signal,
        root,
      );
      return new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Portrait generation failed.";
      return new Response(message, {
        status: message.startsWith("Cast changed")
          ? 409
          : (error as NodeJS.ErrnoException).code === "ENOENT"
            ? 404
            : 502,
      });
    }
  });
}
