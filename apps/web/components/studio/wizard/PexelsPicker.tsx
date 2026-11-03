"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PexelsVideo } from "@podframes/core";
import { inputClass } from "./ui";

export function PexelsPicker({
  query,
  aspectRatio,
  disabled,
  onUse,
}: {
  query: string;
  aspectRatio: "9:16" | "16:9";
  disabled: boolean;
  onUse: (id: number) => Promise<void>;
}) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(query);
  const [searched, setSearched] = useState("");
  const [videos, setVideos] = useState<PexelsVideo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function search(nextPage = 1) {
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    const keywords = nextPage === 1 ? draft.trim() : searched;
    try {
      const params = new URLSearchParams({
        query: keywords,
        aspect: aspectRatio,
        page: String(nextPage),
      });
      const response = await fetch(`/api/stock/pexels?${params}`, {
        signal: request.signal,
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      setVideos(result.videos);
      setPage(result.page);
      setHasMore(result.hasMore);
      setSearched(keywords);
    } catch (failure) {
      if (!request.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Search failed.");
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  async function choose(id: number) {
    setBusy(true);
    setError("");
    try {
      await onUse(id);
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not import footage.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-hairline)] p-3">
      <button
        type="button"
        disabled={disabled || busy}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
      >
        {open ? "−" : "+"} Search Pexels videos
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
            className="space-y-2"
          >
            <label
              htmlFor={fieldId}
              className="block text-xs text-[var(--color-text-secondary)]"
            >
              Describe the footage
            </label>
            <div className="flex gap-2">
              <input
                id={fieldId}
                value={draft}
                maxLength={200}
                disabled={disabled || busy}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="e.g. tired office worker"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={disabled || busy || !draft.trim()}
                className="btn btn-ghost px-3 text-xs disabled:opacity-50"
              >
                {busy ? "Working…" : "Search"}
              </button>
            </div>
          </form>
          <a
            href="https://www.pexels.com"
            target="_blank"
            rel="noreferrer"
            className="block text-xs font-semibold text-[var(--color-accent)] underline"
          >
            Videos provided by Pexels ↗
          </a>
          {error && (
            <p role="alert" className="text-xs text-[var(--color-danger)]">
              {error}
            </p>
          )}
          {searched && !videos.length && !busy && !error && (
            <p className="text-xs text-[var(--color-text-muted)]">
              No matching videos. Try a simpler subject or action.
            </p>
          )}
          <div className="grid max-h-[460px] gap-3 overflow-y-auto sm:grid-cols-2">
            {videos.map((video) => (
              <article
                key={video.id}
                className="overflow-hidden rounded-lg border border-[var(--color-hairline)] bg-[var(--color-surface-2)]"
              >
                <video
                  controls
                  playsInline
                  preload="none"
                  poster={video.image}
                  src={video.videoUrl}
                  aria-label={`Preview footage by ${video.author}`}
                  className="aspect-video w-full bg-black object-contain"
                />
                <div className="space-y-2 p-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate underline"
                    >
                      {video.author} on Pexels ↗
                    </a>
                    <span className="shrink-0 text-[var(--color-text-muted)]">
                      {Math.round(video.duration)}s
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => void choose(video.id)}
                    className="btn btn-ghost w-full py-2 text-xs disabled:opacity-50"
                  >
                    Use this footage
                  </button>
                </div>
              </article>
            ))}
          </div>
          {searched && (
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                disabled={disabled || busy || page <= 1}
                onClick={() => void search(page - 1)}
                className="btn btn-ghost px-3 py-2 disabled:opacity-50"
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                disabled={disabled || busy || !hasMore}
                onClick={() => void search(page + 1)}
                className="btn btn-ghost px-3 py-2 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
