export interface PexelsVideo {
  id: number;
  url: string;
  image: string;
  duration: number;
  width: number;
  height: number;
  author: string;
  authorUrl: string;
  videoUrl: string;
}

type AspectRatio = "9:16" | "16:9";
interface VideoFile {
  url: string;
  width: number;
  height: number;
}

function pexelsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "pexels.com" || url.hostname.endsWith(".pexels.com"))
    )
      return url.href;
  } catch {
    /* Invalid provider URLs are excluded from results. */
  }
  return undefined;
}

function pexelsMediaUrl(value: unknown): string | undefined {
  const pexels = pexelsUrl(value);
  if (pexels) return pexels;
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname === "player.vimeo.com"
    )
      return url.href;
  } catch {
    /* Pexels also returns direct video files hosted on Vimeo. */
  }
  return undefined;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function orientation(aspectRatio: AspectRatio): "portrait" | "landscape" {
  if (aspectRatio !== "9:16" && aspectRatio !== "16:9")
    throw new Error("Pexels aspect ratio must be 9:16 or 16:9.");
  return aspectRatio === "9:16" ? "portrait" : "landscape";
}

function videoResult(
  value: unknown,
  aspectRatio: AspectRatio,
): PexelsVideo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const video = value as Record<string, unknown>;
  if (
    !positiveInteger(video.id) ||
    !positiveInteger(video.width) ||
    !positiveInteger(video.height) ||
    typeof video.duration !== "number" ||
    !Number.isFinite(video.duration) ||
    video.duration <= 0 ||
    !video.user ||
    typeof video.user !== "object" ||
    !Array.isArray(video.video_files)
  )
    return undefined;
  const user = video.user as Record<string, unknown>;
  const url = pexelsUrl(video.url);
  const image = pexelsUrl(video.image);
  const authorUrl = pexelsUrl(user.url);
  if (
    !url ||
    !image ||
    !authorUrl ||
    typeof user.name !== "string" ||
    !user.name.trim()
  )
    return undefined;
  const files: VideoFile[] = [];
  for (const item of video.video_files) {
    if (!item || typeof item !== "object") continue;
    const file = item as Record<string, unknown>;
    const link = pexelsMediaUrl(file.link);
    if (
      file.file_type !== "video/mp4" ||
      !link ||
      !positiveInteger(file.width) ||
      !positiveInteger(file.height) ||
      Math.max(file.width, file.height) > 1920
    )
      continue;
    files.push({ url: link, width: file.width, height: file.height });
  }
  const portrait = aspectRatio === "9:16";
  const matches = (file: VideoFile) =>
    portrait ? file.height > file.width : file.width > file.height;
  const ratio = portrait ? 9 / 16 : 16 / 9;
  files.sort(
    (a, b) =>
      Number(matches(b)) - Number(matches(a)) ||
      Math.abs(Math.min(a.width, a.height) - 720) -
        Math.abs(Math.min(b.width, b.height) - 720) ||
      Math.abs(a.width / a.height - ratio) -
        Math.abs(b.width / b.height - ratio) ||
      a.width * a.height - b.width * b.height,
  );
  const file = files[0];
  if (!file) return undefined;
  return {
    id: video.id,
    url,
    image,
    duration: video.duration,
    width: file.width,
    height: file.height,
    author: user.name.trim(),
    authorUrl,
    videoUrl: file.url,
  };
}

async function pexelsRequest(url: URL, apiKey: string): Promise<unknown> {
  if (typeof apiKey !== "string" || !apiKey.trim())
    throw new Error("PEXELS_API_KEY is required for stock video search.");
  const signal = AbortSignal.timeout(15_000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: apiKey, Accept: "application/json" },
      redirect: "error",
      credentials: "omit",
      signal,
    });
  } catch {
    throw new Error(
      signal.aborted
        ? "Pexels request timed out. Try again."
        : "Could not connect to Pexels. Try again.",
    );
  }
  if (response.status === 401)
    throw new Error(
      "Pexels authentication failed (401). Check PEXELS_API_KEY on the server.",
    );
  if (response.status === 429)
    throw new Error("Pexels rate limit reached (429). Try again later.");
  if (!response.ok)
    throw new Error(`Pexels request failed (HTTP ${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error("Pexels returned an invalid response.");
  }
}

export async function searchPexelsVideos(args: {
  apiKey: string;
  query: string;
  aspectRatio: AspectRatio;
  page?: number;
}): Promise<{ videos: PexelsVideo[]; page: number; hasMore: boolean }> {
  if (
    typeof args.query !== "string" ||
    !args.query.trim() ||
    args.query.trim().length > 200
  )
    throw new Error("Pexels search query must contain 1–200 characters.");
  const page = args.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1 || page > 100)
    throw new Error("Pexels page must be an integer from 1 to 100.");
  const url = new URL("https://api.pexels.com/v1/videos/search");
  url.searchParams.set("query", args.query.trim());
  url.searchParams.set("orientation", orientation(args.aspectRatio));
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", "12");
  const value = await pexelsRequest(url, args.apiKey);
  if (!value || typeof value !== "object")
    throw new Error("Pexels returned an invalid search response.");
  const result = value as Record<string, unknown>;
  if (
    !Array.isArray(result.videos) ||
    result.page !== page ||
    typeof result.total_results !== "number" ||
    !Number.isSafeInteger(result.total_results) ||
    result.total_results < 0
  )
    throw new Error("Pexels returned an invalid search response.");
  const videos = result.videos
    .slice(0, 12)
    .map((video) => videoResult(video, args.aspectRatio))
    .filter((video): video is PexelsVideo => Boolean(video));
  return {
    videos,
    page,
    hasMore: page < 100 && result.total_results > page * 12,
  };
}

export async function getPexelsVideo(args: {
  apiKey: string;
  id: number;
  aspectRatio: AspectRatio;
}): Promise<PexelsVideo> {
  if (!positiveInteger(args.id))
    throw new Error("Pexels video ID must be a positive integer.");
  orientation(args.aspectRatio);
  const raw = await pexelsRequest(
    new URL(`https://api.pexels.com/v1/videos/videos/${args.id}`),
    args.apiKey,
  );
  const video = videoResult(raw, args.aspectRatio);
  if (!video || video.id !== args.id)
    throw new Error(
      "Pexels returned an unusable video. Choose another clip with an MP4 version up to 1080p.",
    );
  return video;
}
