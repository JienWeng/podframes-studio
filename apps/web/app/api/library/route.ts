import { listLibrary, saveCast, saveProjectCast, createSeries, createSeriesEpisode, createCastVideo, updateCast } from "@/lib/library";
import { projectDetail } from "@/lib/dto";
import type { Host } from "@podframes/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() { return Response.json(await listLibrary()); }

function text(value: unknown, name: string, max: number, required = true): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error(`${name} must be ${required ? "1" : "0"}–${max} characters.`);
  return value.trim();
}
function slug(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]*$/i.test(value)) throw new Error("Choose a valid source video.");
  return value;
}

function castHost(form: FormData): Host {
  const model = text(form.get("model"), "Speech model", 40);
  if (!["fish/s2.1-pro", "fish/drama-3"].includes(model)) throw new Error("Choose S2.1 Pro or Drama 3.");
  const voice = text(form.get("voice"), "Fish voice ID", 128);
  if (!/^[a-z0-9_-]+$/i.test(voice)) throw new Error("Enter a valid Fish voice ID.");
  const speechSpeed = Number(form.get("speechSpeed") ?? 1);
  if (!Number.isFinite(speechSpeed) || speechSpeed < 0.75 || speechSpeed > 1.5) throw new Error("Speech speed must be 0.75–1.5.");
  const host: Host = {
    speechSpeed,
    id: "host_a", speaker: "HOST_A", side: "left", model, voice,
    name: text(form.get("name"), "Name", 80),
    appearance: text(form.get("appearance") ?? "", "Appearance", 2000, false),
    persona: text(form.get("persona") ?? "", "Personality", 2000, false),
    defaultStyle: text(form.get("style") ?? "", "Delivery style", 500, false),
  };
  return host;
}

export async function POST(req: Request) {
  try {
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("portrait");
      if (!(file instanceof File) || file.size > 10 * 1024 * 1024) throw new Error("Choose a PNG, JPEG, or WebP portrait up to 10 MB.");
      const host = castHost(form);
      return Response.json(await saveCast(host, new Uint8Array(await file.arrayBuffer())), { status: 201 });
    }
    const body = await req.json();
    if (body?.kind === "cast") {
      return Response.json(await saveProjectCast(slug(body.slug), text(body.hostId, "Host", 80)), { status: 201 });
    }
    if (body?.kind === "cast-video") {
      return Response.json(projectDetail((await createCastVideo(text(body.castId, "Cast", 36))).state), { status: 201 });
    }
    if (body?.kind === "series") {
      return Response.json(await createSeries(text(body.title, "Series title", 120), text(body.description ?? "", "Description", 2000, false), slug(body.template)), { status: 201 });
    }
    if (body?.kind === "episode") {
      const project = await createSeriesEpisode(text(body.seriesId, "Series", 36));
      return Response.json(projectDetail(project.state), { status: 201 });
    }
    return new Response("Unknown library action.", { status: 400 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Library action failed.", { status: 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const form = await req.formData();
    const id = text(form.get("id"), "Cast", 36);
    const version = text(form.get("version"), "Cast version", 80);
    const file = form.get("portrait");
    if (file instanceof File && file.size > 10 * 1024 * 1024) throw new Error("Choose a portrait up to 10 MB.");
    const bytes = file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : undefined;
    return Response.json(await updateCast(id, castHost(form), version, bytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update cast.";
    return new Response(message, { status: message.startsWith("Cast changed") ? 409 : (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 400 });
  }
}
