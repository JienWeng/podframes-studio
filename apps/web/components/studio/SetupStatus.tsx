"use client";

import { useCallback, useEffect, useState } from "react";

type Health = Record<string, boolean>;

export function SetupStatus({ videoProvider, heygenAuth = "subscription" }: { videoProvider?: string; heygenAuth?: string }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(response.status === 401 ? "Sign in again to check this workspace." : "Could not check setup. Check the web service and try again.");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Setup returned an invalid response.");
      setError("");
      setHealth(Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean")));
    } catch (cause) {
      setHealth(null);
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "Setup check timed out. Try again after checking the local tools.");
    } finally { setChecking(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void check(); }, 0);
    return () => window.clearTimeout(timer);
  }, [check]);

  const tools = [
    { label: "Generation worker", configured: health?.worker, help: "On the generation Mac, open the Podframes folder in a terminal and run pnpm worker. Keep that terminal running." },
    { label: "Codex ChatGPT login", configured: health?.codex, help: "On the generation Mac, run codex login and sign in with the account used for images and Fish speech." },
    { label: "Fish Audio connection", configured: health?.fish, help: "Run codex mcp add fish-audio --url https://api.fish.audio/mcp, then codex mcp login fish-audio." },
    { label: "Whisper captions", configured: health?.whisper, help: "Install whisper.cpp and a multilingual model, then set WHISPER_MODEL on the generation Mac if needed." },
    { label: "Audio/video tools", configured: health?.ffmpeg && health?.ffprobe, help: "Install ffmpeg and ffprobe on the generation Mac. On macOS, run brew install ffmpeg." },
  ];
  const provider = videoProvider === "heygen"
    ? { label: `HeyGen ${heygenAuth === "api" ? "API key" : "subscription login"}`, configured: heygenAuth === "api" ? health?.heygenApi : health?.heygen, help: heygenAuth === "api" ? "Set HEYGEN_API_KEY in the server environment, then restart the web app and worker." : "Run heygen auth login --oauth on the generation Mac. Choose Subscription in the Videos step." }
    : videoProvider === "fal-ltx"
      ? { label: "LTX video API key", configured: health?.fal, help: "Set FAL_API_KEY in the server environment, then restart the web app and worker." }
      : videoProvider === "replicate-p-video"
        ? { label: "P-Video API key", configured: health?.replicate, help: "Set REPLICATE_API_KEY in the server environment, or choose another provider in Script or Videos." }
        : { label: "At least one video connection", configured: health?.heygen || health?.heygenApi || health?.fal || health?.replicate, help: "Choose HeyGen subscription/API, LTX, or P-Video, then connect it on the generation Mac." };
  const rows = [...tools, provider];
  const missing = health ? rows.filter((row) => !row.configured).length : 0;

  return <details className="mb-5 rounded-xl border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4" open={!!error || (!!health && missing > 0)}>
    <summary className="cursor-pointer text-sm font-semibold">Workspace setup {checking ? "· checking…" : error ? "· check unavailable" : missing ? `· ${missing} steps need attention` : "· connections configured"}</summary>
    <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">These checks inspect local tools and saved connections. Credits, account permissions, and successful generation are checked when you run a stage. You can prepare cast and scripts while completing setup.</p>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">{error}</p>}
    {health && <ul className="mt-3 space-y-3">{rows.map((row) => <li key={row.label} className="text-sm"><span className="font-medium">{row.label}</span><span className="ml-2 text-xs" style={{ color: row.configured ? "var(--color-success)" : "var(--color-warn)" }}>{row.configured ? "Configured" : "Needs setup"}</span>{!row.configured && <p className="mt-1 break-words text-xs leading-relaxed text-[var(--color-text-secondary)]">{row.help}</p>}</li>)}</ul>}
    {health && <p className="mt-3 text-xs text-[var(--color-text-muted)]">Optional B-roll connections · Pexels {health.pexels ? "key configured" : "key missing"} · fal {health.fal ? "key configured" : "key missing"}. Choose your source in B-roll &amp; captions.</p>}
    <button type="button" onClick={() => { setChecking(true); setError(""); void check(); }} disabled={checking} className="btn btn-ghost mt-3 px-3 py-1.5 text-xs disabled:opacity-50">{checking ? "Checking…" : "Check setup again"}</button>
  </details>;
}
