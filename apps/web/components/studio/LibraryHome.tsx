"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { StudioSidebar } from "./wizard/StudioSidebar";
import { inputClass } from "./wizard/ui";
import type { SavedCast, SavedSeries } from "@/lib/library";
import type { ProjectSummary } from "@/lib/dto";

type Library = { cast: SavedCast[]; series: SavedSeries[] };

export function LibraryHome({
  section,
  initial,
  projects,
}: {
  section: "cast" | "series";
  initial: Library;
  projects: ProjectSummary[];
}) {
  const [library, setLibrary] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SavedCast | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portraitDraft, setPortraitDraft] = useState<{
    file: File;
    url: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const generating = useRef(false);
  useEffect(
    () => () => {
      if (portraitDraft) URL.revokeObjectURL(portraitDraft.url);
    },
    [portraitDraft],
  );
  const templates = projects.filter((project) => project.templateReady);

  async function submit(body: FormData | Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const form = body instanceof FormData;
      const response = await fetch("/api/library", {
        method: form && editing ? "PATCH" : "POST",
        ...(form
          ? { body }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      if ("slug" in result) {
        window.location.assign(
          `/studio?slug=${encodeURIComponent(result.slug)}&step=1`,
        );
        return;
      }
      const refreshed = await fetch("/api/library", { cache: "no-store" });
      if (!refreshed.ok)
        throw new Error(
          "Saved, but the list could not refresh. Reload this page.",
        );
      setLibrary(await refreshed.json());
      setAdding(false);
      setEditing(null);
      setPortraitDraft(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (generating.current) return;
    const data = new FormData(event.currentTarget);
    if (portraitDraft) data.set("portrait", portraitDraft.file);
    if (section === "cast") void submit(data);
    else
      void submit({
        kind: "series",
        title: String(data.get("title")),
        description: String(data.get("description")),
        template: String(data.get("template")),
      });
  }

  async function regeneratePortrait() {
    if (!editing || !formRef.current || generating.current || busy) return;
    const appearance = String(
      new FormData(formRef.current).get("appearance") ?? "",
    ).trim();
    if (!appearance) {
      setError(
        "Describe the portrait in Appearance notes before regenerating.",
      );
      return;
    }
    generating.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/library/cast/${editing.id}/regenerate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            version: editing.revision ?? editing.updatedAt ?? editing.createdAt,
            appearance,
          }),
        },
      );
      if (!response.ok) throw new Error(await response.text());
      const file = new File([await response.blob()], "generated-portrait.png", {
        type: "image/png",
      });
      setPortraitDraft({ file, url: URL.createObjectURL(file) });
      formRef.current?.scrollIntoView({ block: "start" });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Portrait generation failed.",
      );
    } finally {
      generating.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="studio-shell">
      <StudioSidebar section={section} />
      <main className="mx-auto w-full min-w-0 max-w-7xl px-5 py-8 sm:px-10">
        <header className="library-header flex flex-wrap items-center justify-between gap-5">
          <div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
              {section === "cast" ? "Your cast" : "Your series"}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)]">
              {section === "cast"
                ? "Save a character once. Bring their face, voice, and delivery into your next video."
                : "Keep the cast, visual style, and episodes of each show together."}
            </p>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setPortraitDraft(null);
              setAdding(!adding);
              setError("");
            }}
            disabled={busy}
            aria-expanded={adding}
            className="btn btn-primary px-5 py-2 text-sm"
          >
            {adding
              ? "Close form"
              : section === "cast"
                ? "+ Add cast member"
                : "+ New series"}
          </button>
        </header>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl border border-[var(--color-danger)] p-3 text-sm text-[var(--color-danger)]"
          >
            {error}
          </p>
        )}
        {adding && (
          <form
            ref={formRef}
            key={editing?.id ?? "new"}
            onSubmit={save}
            className="studio-editor mb-8 max-w-3xl space-y-5 p-5 sm:p-7"
          >
            <h2 className="text-2xl font-bold">
              {section === "cast"
                ? editing
                  ? `Edit ${editing.name}`
                  : "Add a cast member"
                : "Create a series"}
            </h2>
            {section === "cast" ? (
              <>
                {editing && (
                  <>
                    <input type="hidden" name="id" value={editing.id} />
                    <input
                      type="hidden"
                      name="version"
                      value={
                        editing.revision ??
                        editing.updatedAt ??
                        editing.createdAt
                      }
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={portraitDraft?.url ?? editing.portraitUrl}
                      alt={`${editing.name} ${portraitDraft ? "new portrait preview" : "current portrait"}`}
                      className="h-48 w-36 rounded-xl object-cover"
                    />
                  </>
                )}
                <label className="block text-sm font-medium">
                  Name
                  <input
                    name="name"
                    defaultValue={editing?.host.name ?? ""}
                    required
                    maxLength={80}
                    className={`${inputClass} mt-2`}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Portrait
                  <input
                    name="portrait"
                    type="file"
                    required={!editing}
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setPortraitDraft(
                        file ? { file, url: URL.createObjectURL(file) } : null,
                      );
                    }}
                    className={`${inputClass} mt-2`}
                  />
                  <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                    PNG, JPEG, or WebP up to 10 MB. You can also save a
                    generated host from any video&apos;s Cast &amp; voice step.
                    {editing && " Choose a file to replace this portrait."}
                  </span>
                  {portraitDraft && (
                    <span
                      role="status"
                      className="mt-2 block text-sm text-[var(--color-success)]"
                    >
                      New portrait ready. Save changes to use it.
                    </span>
                  )}
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Speech model
                    <select
                      name="model"
                      defaultValue={editing?.host.model ?? "fish/drama-3"}
                      className={`${inputClass} mt-2`}
                    >
                      <option value="fish/s2.1-pro">S2.1 Pro</option>
                      <option value="fish/drama-3">Drama 3</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium">
                    Fish voice ID
                    <input
                      name="voice"
                      defaultValue={editing?.host.voice ?? ""}
                      required
                      maxLength={128}
                      pattern="[a-zA-Z0-9_-]+"
                      className={`${inputClass} mt-2`}
                      placeholder="ID after /m/ in a voice link"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Speech speed
                  <input name="speechSpeed" type="number" min={0.75} max={1.5} step={0.01} defaultValue={editing?.host.speechSpeed ?? 1} required className={`${inputClass} mt-2`} />
                  <span className="mt-1 block text-xs text-[var(--muted)]">1× normal · 1.1× brisk · 1.25× fast. Saved for future videos.</span>
                </label>
                <label className="block text-sm font-medium">
                  Delivery style
                  <input
                    name="style"
                    defaultValue={editing?.host.defaultStyle ?? ""}
                    maxLength={500}
                    className={`${inputClass} mt-2`}
                    placeholder="Warm, curious, lightly playful"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Personality
                  <textarea
                    name="persona"
                    defaultValue={editing?.host.persona ?? ""}
                    maxLength={2000}
                    rows={2}
                    className={`${inputClass} mt-2`}
                    placeholder="How this character contributes to the conversation"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Appearance notes
                  <textarea
                    name="appearance"
                    disabled={busy}
                    defaultValue={editing?.host.appearance ?? ""}
                    maxLength={2000}
                    rows={2}
                    className={`${inputClass} mt-2`}
                  />
                </label>
                {editing && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => void regeneratePortrait()}
                      disabled={busy}
                      className="btn btn-ghost px-4 py-2 text-sm disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Regenerate portrait"}
                    </button>
                    <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                      Uses your ChatGPT image allowance and Appearance notes to
                      create a new portrait. Review it above, then save changes.
                      Generation can take a few minutes.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <label className="block text-sm font-medium">
                  Series title
                  <input
                    name="title"
                    required
                    maxLength={120}
                    className={`${inputClass} mt-2`}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Description
                  <textarea
                    name="description"
                    maxLength={2000}
                    rows={2}
                    className={`${inputClass} mt-2`}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Show template
                  <select
                    name="template"
                    required
                    className={`${inputClass} mt-2`}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Choose a video with saved host portraits
                    </option>
                    {templates.map((project) => (
                      <option key={project.slug} value={project.slug}>
                        {project.title || project.topic}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Copies the selected cast, voices, speech models, captions, video
                  settings, and reusable imagery. New episodes get their own
                  script and media.
                </p>
                {!templates.length && (
                  <p className="text-sm text-[var(--color-warn)]">
                    Save all selected host portraits in a video first, then return here
                    to use it as your show template. <a href="/studio?new=1" className="underline">Create a video →</a>
                  </p>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={busy || (section === "series" && !templates.length)}
                className="btn btn-primary px-5 py-2 text-sm disabled:opacity-50"
              >
                {busy
                  ? "Saving…"
                  : section === "cast"
                    ? editing
                      ? "Save changes"
                      : "Save cast member"
                    : "Create series"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setEditing(null);
                  setPortraitDraft(null);
                  setError("");
                }}
                disabled={busy}
                className="btn btn-ghost px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {section === "cast" ? (
          <>
            {!library.cast.length && !adding && (
              <Empty text="Your reusable cast will appear here. Add a portrait and voice, or save a host from an existing video." />
            )}
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {library.cast.map((cast) => (
                <article key={cast.id} className="panel overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cast.portraitUrl}
                    alt={cast.name}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <div className="space-y-3 p-5">
                    <h2 className="text-xl font-bold">{cast.name}</h2>
                    <p className="text-sm text-[var(--color-accent)]">
                      Fish Audio ·{" "}
                      {cast.host.model === "fish/drama-3"
                        ? "Drama 3"
                        : "S2.1 Pro"}
                    </p>
                    <p className="line-clamp-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      {cast.host.defaultStyle ||
                        cast.host.persona ||
                        "Ready for your next conversation."}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(cast);
                        setPortraitDraft(null);
                        setAdding(true);
                        setError("");
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className="btn btn-ghost w-full px-4 py-2 text-sm disabled:opacity-50"
                    >
                      Edit character & portrait
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void submit({ kind: "cast-video", castId: cast.id })
                      }
                      className="btn btn-ghost w-full px-4 py-2 text-sm disabled:opacity-50"
                    >
                      Use in a new video →
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <>
            {!library.series.length && !adding && (
              <Empty text="Create a series from one of your saved videos, then start each episode with the same cast and styling." />
            )}
            <div className="space-y-6">
              {library.series.map((series) => {
                const episodes = projects.filter(
                  (project) => project.seriesId === series.id,
                );
                return (
                  <article key={series.id} className="panel p-5 sm:p-7">
                    <div className="flex flex-wrap items-start justify-between gap-5">
                      <div className="max-w-2xl">
                        <h2 className="text-2xl font-bold">{series.title}</h2>
                        {series.description && (
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-secondary)]">
                            {series.description}
                          </p>
                        )}
                        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                          {series.hosts.join(" & ")} · {episodes.length} episode
                          {episodes.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void submit({ kind: "episode", seriesId: series.id })
                        }
                        className="btn btn-primary px-5 py-2 text-sm disabled:opacity-50"
                      >
                        + New episode
                      </button>
                    </div>
                    <div className="mt-6 border-t border-[var(--color-hairline)]">
                      {episodes.length ? (
                        episodes.map((episode) => (
                          <Link
                            key={episode.slug}
                            href={`/studio?slug=${encodeURIComponent(episode.slug)}`}
                            className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-hairline)] py-4 text-sm hover:text-[var(--color-accent)]"
                          >
                            <span className="font-semibold">
                              {episode.title || episode.topic}
                            </span>
                            <span className="text-[var(--color-text-muted)]">
                              {episode.hasOutput ? "Ready" : "Draft"} →
                            </span>
                          </Link>
                        ))
                      ) : (
                        <p className="pt-5 text-sm text-[var(--color-text-muted)]">
                          Your first episode starts with this show&apos;s saved
                          template.
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-hairline)] px-6 py-16 text-center">
      <p className="mx-auto max-w-lg text-base leading-relaxed text-[var(--color-text-secondary)]">
        {text}
      </p>
    </div>
  );
}
