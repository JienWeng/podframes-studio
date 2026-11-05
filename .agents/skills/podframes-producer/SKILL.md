---
name: podframes-producer
description: Produce Podframes episodes or batches from a topic, imported script, saved cast, or series. Use when asked to create, draft, review, generate, resume, or export podcast videos through this repository's Studio, CLI, or automation API.
---

# Podframes producer

Read [the production workflow](../../../apps/web/public/agent-guide.md) before creating or resuming an episode. Resolve its repository file references from this repository root.

Use the workflow to discover available cast and series, clarify one missing choice at a time, prepare a reviewable draft, obtain approval for the exact paid generation, and monitor the saved job through export. Existing explicit approval for the same episode inputs remains valid. A changed script, cast, portrait, voice, billing source, or generation model requires approval for the affected paid work.

For remote phone/desktop operation, read [remote host setup](../../../docs/REMOTE_CODEX.md); use the connected Podframes host and its existing worker. Pairing is completed by the owner. Prefer `pnpm producer discover` and `status --slug SLUG` for inspection, `queue --to script` for drafting, and `queue --to render --approve REVIEW_HASH` only after reviewing the latest status and obtaining the user’s approval. Include `--slug SLUG` on queue commands.

For API request shapes and authentication, read [API documentation](../../../docs/API.md). For script formats, template reuse and CLI operations, read [automation documentation](../../../docs/AUTOMATION.md). Use installed command help to verify flags before execution.

Completion requires either a verified playable output and reported review results, or a concrete blocked provider/job state with the action needed to resume safely. This skill defines an agent workflow; the server's generation endpoints can execute immediately when called.

## Shared team access

The owner approves membership only. Approved editors can generate using shared provider credits without per-generation owner approval. Any draft review in this workflow is approval from the requesting member, not a separate owner gate. Viewers remain read-only; use the member’s own credentials. See `docs/TEAM.md` from the repository root.
