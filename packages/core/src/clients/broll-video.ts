import { createHash } from "node:crypto";
import { createFalClient } from "@fal-ai/client";
import { readJson, writeJson } from "../util/fs";

const MODEL = "fal-ai/ltx-2.3/text-to-video";

interface BrollVideoArgs {
  apiKey: string;
  prompt: string;
  aspectRatio: "9:16" | "16:9";
  statePath: string;
}

interface BrollVideoState {
  key: string;
  status: "submitting" | "pending" | "completed";
  requestId?: string;
  url?: string;
}

function trustedVideoUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("B-roll provider returned no video URL.");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("B-roll provider returned an invalid video URL.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media"))) {
    throw new Error("B-roll video URL must use trusted HTTPS fal.media storage.");
  }
  return url.href;
}

function checkedRequestId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new Error("B-roll provider returned an invalid request ID.");
  return value;
}

/** Submit once, then inspect one queue status per call. The caller serializes statePath access. */
export async function pollBrollVideo(args: BrollVideoArgs): Promise<{ status: "pending" | "completed"; requestId: string; url?: string }> {
  if (typeof args.apiKey !== "string" || !args.apiKey.trim()) throw new Error("FAL_API_KEY is required for b-roll video generation.");
  if (typeof args.prompt !== "string" || !args.prompt.trim() || args.prompt.trim().length > 2000) throw new Error("B-roll video prompt must contain 1–2000 characters.");
  if (args.aspectRatio !== "9:16" && args.aspectRatio !== "16:9") throw new Error("B-roll video aspect ratio must be 9:16 or 16:9.");
  const prompt = args.prompt.trim();
  const key = createHash("sha256").update(JSON.stringify([MODEL, prompt, args.aspectRatio])).digest("hex");
  let state = await readJson<BrollVideoState>(args.statePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (state !== undefined && (!state || typeof state !== "object" || Array.isArray(state))) throw new Error("Invalid saved b-roll video state.");
  if (state) {
    if (state.key !== key) throw new Error("B-roll video inputs differ from the saved request. Use a different state path.");
    if (state.status === "submitting") throw new Error("B-roll submission outcome is unknown. Review fal provider history before starting another request.");
    if (state.status !== "pending" && state.status !== "completed") throw new Error("Invalid saved b-roll video status.");
    checkedRequestId(state.requestId);
    if (state.status === "completed") return { status: "completed", requestId: state.requestId!, url: trustedVideoUrl(state.url) };
  }

  const signal = AbortSignal.timeout(30_000);
  const client = createFalClient({
    credentials: args.apiKey,
    // Queue methods override SDK retry settings. Plain errors stop transport retries after uncertain submits.
    fetch: async (input, init) => {
      try {
        const response = await fetch(input, { ...init, signal });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error(`B-roll queue request failed with HTTP ${response.status}.`);
        }
        const body = await response.text();
        return new Response(body, { status: response.status, headers: response.headers });
      } catch (error) {
        const http = error instanceof Error && /^B-roll queue request failed with HTTP \d+\.$/.test(error.message) ? error.message : "B-roll queue connection failed. Poll the saved request again.";
        throw new Error(http);
      }
    },
  });

  if (!state) {
    state = { key, status: "submitting" };
    await writeJson(args.statePath, state);
    const input = Object.freeze({ prompt, aspect_ratio: args.aspectRatio, duration: "6", resolution: "1080p", fps: "25", generate_audio: false, enable_safety_checker: true });
    const submitted = await client.queue.submit(MODEL, {
      input,
      abortSignal: signal,
    });
    state = { key, status: "pending", requestId: checkedRequestId(submitted.request_id) };
    await writeJson(args.statePath, state);
  }
  const requestId = checkedRequestId(state.requestId);
  const status = await client.queue.status(MODEL, { requestId, abortSignal: signal });
  if (status.status === "IN_QUEUE" || status.status === "IN_PROGRESS") return { status: "pending", requestId };
  if (status.status !== "COMPLETED") throw new Error("B-roll queue request failed. Review the saved request in fal provider history.");
  const result = await client.queue.result(MODEL, { requestId, abortSignal: signal });
  const url = trustedVideoUrl(result.data?.video?.url);
  await writeJson(args.statePath, { key, status: "completed", requestId, url } satisfies BrollVideoState);
  return { status: "completed", requestId, url };
}
