# Podframes agent production workflow

Use this workflow to turn a topic or supplied script into one episode or an approved batch. The local worker runs the media pipeline and uses the machine's configured provider sessions. The Studio, API, and CLI operate on the same project artifacts.

## 1. Discover the workspace

Read `GET /api/v1/health`, `GET /api/v1/library`, and `GET /api/v1/projects` at the user's configured origin. Read the selected project when resuming. Repository agents should read `docs/API.md` for request schemas and `docs/AUTOMATION.md` for CLI and script-format details. Run `pnpm podframes --help` before constructing a CLI command.

API access uses the owner's `PODFRAMES_API_TOKEN` through a Bearer header. Static discovery documents also follow the whole-app authentication rules. Every versioned POST requires a persistent 16–128-character `Idempotency-Key`. Store operation identity with the episode and reuse the exact key and body on transport retries. Keep credentials in environment configuration.

Finish discovery when the selected cast/series exists, the project state is known, and provider readiness or a concrete missing connection has been identified. A connection check confirms configuration, while actual generation still depends on provider allowance.

## 2. Establish the episode brief

Infer choices already supplied in the conversation or saved series. Ask only for missing decisions, one question at a time, and wait for each answer. Establish single episode or batch, topic or exact imported script, language, target length, selected cast, and intended style. For a batch, establish the exact episode list and scope before drafting.

Offer real saved cast and series names returned by the library. Use their IDs for operations. A series episode inherits its saved snapshots, including portrait assets, Fish voice/model, delivery direction, speech speed, and export settings. Compare the resulting episode with the requested settings. Library edits can differ from an older series snapshot, so show the actual episode values and resolve a mismatch before generation.

Create a new episode from a selected series with `POST /api/v1/library` and `{"kind":"episode","seriesId":"<actual-id>"}`. Retain the returned slug before continuing. Use the documented project/cast endpoints when starting without a series. Every batch episode receives its own slug and operation keys.

## 3. Draft for review

Patch the episode brief and settings, then request only drafting with `POST /api/v1/generate` and `{"slug":"<actual-slug>","to":"script"}`. Follow its run events and read the saved script. Drafting through an API writer may itself incur model/search charges, so use the user's selected billing route and authorization. Imported scripts preserve wording unless the user asks for rewriting. Research claims needing current information and show the sources actually checked.

Complete the draft by presenting a compact approval preview containing the exact spoken script, source links and relevant dates, cast names and portraits, voice models and speeds, language, estimated length, avatar provider/billing mode, B-roll source/model, sticker treatment, and export pace. Summarize expected paid operations and available cost estimates. Label unavailable cost estimates and distinguish estimated duration from measured audio duration. A completed draft does not imply media-generation approval.

### Choose quotes, stickers, and supporting footage

Use these decisions when preparing the visual plan for approval and reviewing its generated cues. Keep the plan sparse and place each cue on the relevant spoken words.

| Spoken moment | Visual decision |
| --- | --- |
| Genuine punchline or meaningful reaction | Use a short, faithful quote card, ideally at most 12 Chinese characters or 6 English words. Avoid repeating the complete subtitle. |
| Concrete named task or object | Use a sticker-only beat for 1–2.5 seconds. “写文案” can use a pen and paper; “做 video” can use a clapperboard. The sticker has no quote panel or extra wording. |
| Factual claim, number, or named source | Prefer relevant supplied source footage/images or an accurately worded stat/lower-third. Keep generated footage clearly illustrative. |
| Sensitive allegation or serious account | Keep the presentation restrained and preserve attribution. Comic stickers and sensational decorations are inappropriate. |
| A line with no useful visual addition | Keep the speaker visible. Cue limits are ceilings, not targets. |

Reuse a saved sticker only when its meaning fits the specific line. Generate an original asset only when the beat benefits from it and the library has no semantic match, within the approved generation scope. Keep faces, captions, and other text clear. Current sticker placement uses fixed safe zones for standard podcast framing; inspect the resulting frames and adjust unusual framing manually.

The implementation lives in repository files `packages/core/src/stages/broll.ts`, `packages/core/src/stages/stickers.ts`, and `packages/core/src/compose/quote-layout.ts`. API cue data represents a sticker-only beat with `type: "quote"` and `stickerOnly: true`; the compositor displays only its artwork.

## 4. Obtain scoped generation approval

Ask for explicit approval to generate the presented episode using the displayed settings and provider credits. Approval already given for those exact inputs remains valid. For batches, the user may approve the listed episodes together with their scripts/settings and an agreed spend ceiling. Record which slugs and versions the approval covers in the conversation or job notes.

Wait for approval before speech synthesis, voice previews, new portraits, avatars, paid B-roll, or force regeneration. Script, identity, portrait, voice, speed, model, provider, or billing edits invalidate approval for affected paid work. Rebuild the changed preview and obtain the corresponding approval. Preserve completed reusable artifacts through unrelated edits.

This is an agent conduct rule. The current API has no approval-token gate, and a generation request can spend credits as soon as the worker executes it.

## 5. Generate and monitor

After approval, request `POST /api/v1/generate` with `{"slug":"<approved-slug>","to":"render"}`. Keep the operation key. Follow `GET /api/v1/projects/{slug}/run`, inspect persisted stage progress, and continue until done, failed, cancelled, or awaiting a required user action. The local worker processes queued jobs one at a time. Submit only the approved batch entries.

Use the shared pipeline through its supported entry points. It coordinates script, speech/alignment, portraits, avatar video, B-roll/stickers, composition, and export. Saved complete artifacts are reused. Export pace affects the finished picture and sound together. Separate source audio and subtitle downloads retain source timing.

When a connection drops, inspect the saved job and provider request IDs before sending more work. Resume the same pending provider job when its ID is known. An unknown paid-submission outcome requires provider-history reconciliation before another purchase. HTTP 409 and interrupted states require inspection rather than a fresh idempotency key. Use `acknowledgeInterrupted: true` only after reconciliation and authorized continuation. `force` represents fresh regeneration and can spend again.

Cancellation is cooperative. Read the resulting persisted state and account for provider work that completed before cancellation. A worker being offline is a concrete blocker; retain queued jobs and report how the worker can be restored.

## 6. Review and deliver

Read the finished project, confirm the MP4 exists, and inspect representative opening, speech, caption, B-roll, sticker, and closing moments. Verify audible dialogue, moving footage, captions clear of key visuals, and measured duration. Report which checks were completed and any remaining flaw. Deliver the playable MP4 or its authenticated media link, along with the episode slug and concise settings summary.

API responses may contain Studio `/api/media/...` URLs. Token clients use the equivalent `/api/v1/media/...` route with their Bearer header. Protect the owner token when sharing downloads.

For a batch, report each episode independently as completed, failed, or awaiting approval, with its output or saved recovery state. Completion means the requested outputs are available and reviewed, or a specific external blocker has been documented with the next required action.

## Shared team access

The owner approves membership only. Approved editors can generate using shared provider credits without per-generation owner approval. Any draft review in this workflow is approval from the requesting member, not a separate owner gate. Viewers remain read-only; use the member’s own credentials. See `docs/TEAM.md` from the repository root.
