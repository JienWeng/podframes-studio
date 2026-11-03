import { libraryId, readCast, readCastPortrait } from "@/lib/library";
import { brollUploadExtension } from "@/lib/broll-upload";

export const runtime = "nodejs";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = libraryId((await params).id);
    const bytes = await readCastPortrait(await readCast(id));
    const extension = brollUploadExtension(bytes);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": extension === "jpg" ? "image/jpeg" : `image/${extension}`, "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Portrait not found.", { status: 404 }); }
}
