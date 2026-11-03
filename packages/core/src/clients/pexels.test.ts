import assert from "node:assert/strict";
import { test } from "node:test";
import { getPexelsVideo, searchPexelsVideos } from "./pexels";

function source() {
  return {
    id: 123,
    width: 3840,
    height: 2160,
    duration: 12,
    url: "https://www.pexels.com/video/ocean-123/",
    image: "https://images.pexels.com/videos/123/preview.jpg",
    user: {
      name: " Ocean Filmmaker ",
      url: "https://www.pexels.com/@filmmaker",
    },
    video_files: [
      {
        file_type: "video/mp4",
        width: 3840,
        height: 2160,
        link: "https://videos.pexels.com/4k.mp4",
      },
      {
        file_type: "video/mp4",
        width: 1920,
        height: 1080,
        link: "https://videos.pexels.com/1080.mp4",
      },
      {
        file_type: "video/mp4",
        width: 1280,
        height: 720,
        link: "https://videos.pexels.com/720.mp4",
      },
      {
        file_type: "video/mp4",
        width: 640,
        height: 360,
        link: "https://videos.pexels.com/360.mp4",
      },
      {
        file_type: "video/mp4",
        width: 720,
        height: 1280,
        link: "https://videos.pexels.com/portrait.mp4",
      },
    ],
  };
}

const args = {
  apiKey: "private-pexels-key",
  query: "ocean",
  aspectRatio: "16:9" as const,
};

test("search uses official URL, server header, fixed page size and sanitized attribution", async (t) => {
  let calledUrl: URL | undefined;
  let calledInit: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (url: URL, init: RequestInit) => {
    calledUrl = url;
    calledInit = init;
    return Response.json({ page: 2, total_results: 37, videos: [source()] });
  });
  const result = await searchPexelsVideos({
    ...args,
    query: "  ocean 海浪 & waves  ",
    page: 2,
  });
  assert.equal(
    calledUrl?.origin + calledUrl!.pathname,
    "https://api.pexels.com/v1/videos/search",
  );
  assert.equal(calledUrl?.searchParams.get("query"), "ocean 海浪 & waves");
  assert.equal(calledUrl?.searchParams.get("orientation"), "landscape");
  assert.equal(calledUrl?.searchParams.get("page"), "2");
  assert.equal(calledUrl?.searchParams.get("per_page"), "12");
  assert.equal(
    new Headers(calledInit?.headers).get("authorization"),
    args.apiKey,
  );
  assert.equal(calledInit?.redirect, "error");
  assert.ok(calledInit?.signal instanceof AbortSignal);
  assert.equal(result.page, 2);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.videos[0], {
    id: 123,
    width: 1280,
    height: 720,
    duration: 12,
    url: source().url,
    image: source().image,
    author: "Ocean Filmmaker",
    authorUrl: source().user.url,
    videoUrl: "https://videos.pexels.com/720.mp4",
  });
  assert.equal(JSON.stringify(result).includes(args.apiKey), false);
});

test("get uses exact official lookup path and prefers portrait rendition when selected", async (t) => {
  let called = "";
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    called = url.href;
    return Response.json(source());
  });
  const video = await getPexelsVideo({
    apiKey: args.apiKey,
    id: 123,
    aspectRatio: "9:16",
  });
  assert.equal(called, "https://api.pexels.com/v1/videos/videos/123");
  assert.equal(video.videoUrl, "https://videos.pexels.com/portrait.mp4");
  assert.equal(video.width, 720);
  assert.equal(video.height, 1280);
});

test("official Vimeo-hosted Pexels MP4 links work for search and lookup", async (t) => {
  const videoUrl =
    "https://player.vimeo.com/external/342571552.hd.mp4?profile_id=175";
  const video = {
    ...source(),
    video_files: [
      {
        file_type: "video/mp4",
        width: 1280,
        height: 720,
        link: videoUrl,
      },
    ],
  };
  t.mock.method(globalThis, "fetch", async (url: URL) =>
    Response.json(
      url.pathname.endsWith("/search")
        ? { page: 1, total_results: 1, videos: [video] }
        : video,
    ),
  );
  assert.equal((await searchPexelsVideos(args)).videos[0]?.videoUrl, videoUrl);
  assert.equal(
    (
      await getPexelsVideo({
        apiKey: args.apiKey,
        id: 123,
        aspectRatio: "16:9",
      })
    ).videoUrl,
    videoUrl,
  );
});

test("Vimeo media allowance excludes deceptive URLs and keeps metadata Pexels-only", async (t) => {
  const video = {
    ...source(),
    video_files: [
      {
        file_type: "video/mp4",
        width: 1280,
        height: 720,
        link: "https://player.vimeo.com/external/342571552.hd.mp4",
      },
    ],
  };
  let output: unknown = video;
  t.mock.method(globalThis, "fetch", async () => Response.json(output));
  for (const link of [
    "https://player.vimeo.com.evil.com/clip.mp4",
    "https://evil-player.vimeo.com/clip.mp4",
    "http://player.vimeo.com/clip.mp4",
    "https://user:password@player.vimeo.com/clip.mp4",
    "https://player.vimeo.com:8443/clip.mp4",
    "https://player.vimeo.com@evil.com/clip.mp4",
  ]) {
    output = {
      ...video,
      video_files: [{ ...video.video_files[0], link }],
    };
    await assert.rejects(
      getPexelsVideo({ apiKey: args.apiKey, id: 123, aspectRatio: "16:9" }),
      /unusable video/,
    );
  }
  for (const metadata of [
    { url: "https://player.vimeo.com/external/clip.mp4" },
    { image: "https://player.vimeo.com/preview.jpg" },
    { user: { name: "Author", url: "https://player.vimeo.com/author" } },
  ]) {
    output = { ...video, ...metadata };
    await assert.rejects(
      getPexelsVideo({ apiKey: args.apiKey, id: 123, aspectRatio: "16:9" }),
      /unusable video/,
    );
  }
});

test("search excludes unsafe URLs, bad metadata, non-MP4 files and 4K-only clips", async (t) => {
  const invalidPage = {
    ...source(),
    url: "https://pexels.com.evil.com/video/123",
  };
  const invalidImage = {
    ...source(),
    image: "http://images.pexels.com/image.jpg",
  };
  const invalidAuthor = {
    ...source(),
    user: {
      name: "Filmmaker",
      url: "https://user:pass@www.pexels.com/@author",
    },
  };
  const invalidDuration = { ...source(), duration: -1 };
  const invalidId = { ...source(), id: 0 };
  const huge = { ...source(), video_files: [source().video_files[0]] };
  const unsafeFile = {
    ...source(),
    video_files: [
      {
        file_type: "video/mp4",
        width: 1280,
        height: 720,
        link: "https://videos.pexels.com:8443/clip.mp4",
      },
    ],
  };
  const nonMp4 = {
    ...source(),
    video_files: [
      {
        file_type: "text/html",
        width: 1280,
        height: 720,
        link: "https://videos.pexels.com/clip.mp4",
      },
    ],
  };
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      page: 1,
      total_results: 9,
      videos: [
        invalidPage,
        invalidImage,
        invalidAuthor,
        invalidDuration,
        invalidId,
        huge,
        unsafeFile,
        nonMp4,
        source(),
      ],
    }),
  );
  const result = await searchPexelsVideos(args);
  assert.equal(result.videos.length, 1);
  assert.equal(result.hasMore, false);
});

test("authentication and rate errors are explicit and never echo response secrets", async (t) => {
  let status = 401;
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(args.apiKey, { status }),
  );
  await assert.rejects(
    searchPexelsVideos(args),
    (error: Error) =>
      /401.*PEXELS_API_KEY/.test(error.message) &&
      !error.message.includes(args.apiKey),
  );
  status = 429;
  await assert.rejects(searchPexelsVideos(args), /rate limit.*429/);
});

test("transport failures and redirects produce a safe connection error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error(`redirect or network error ${args.apiKey}`);
  });
  await assert.rejects(
    searchPexelsVideos(args),
    (error: Error) =>
      error.message === "Could not connect to Pexels. Try again.",
  );
});

test("invalid arguments fail before sending requests", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("unexpected fetch");
  });
  await assert.rejects(
    searchPexelsVideos({ ...args, apiKey: "" }),
    /PEXELS_API_KEY/,
  );
  for (const query of ["", " ", "x".repeat(201)])
    await assert.rejects(searchPexelsVideos({ ...args, query }), /1–200/);
  for (const page of [0, 1.5, 101, NaN])
    await assert.rejects(searchPexelsVideos({ ...args, page }), /page/);
  await assert.rejects(
    searchPexelsVideos({ ...args, aspectRatio: "1:1" as "16:9" }),
    /aspect ratio/,
  );
  for (const id of [0, -1, 1.5, NaN])
    await assert.rejects(
      getPexelsVideo({ apiKey: args.apiKey, id, aspectRatio: "16:9" }),
      /video ID/,
    );
  assert.equal(mock.mock.callCount(), 0);
});

test("lookup rejects mismatched IDs and invalid payloads", async (t) => {
  let output: unknown = { ...source(), id: 124 };
  t.mock.method(globalThis, "fetch", async () => Response.json(output));
  await assert.rejects(
    getPexelsVideo({ apiKey: args.apiKey, id: 123, aspectRatio: "16:9" }),
    /unusable video/,
  );
  output = { videos: [] };
  await assert.rejects(searchPexelsVideos(args), /invalid search response/);
});
