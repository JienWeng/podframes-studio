# Run Podframes through remote Codex

Use your phone or another supported device to direct Codex on the Mac that already runs Podframes. Podframes keeps its existing local web service, queue, worker, media and provider logins. The remote chat supplies instructions and approvals; it does not move generation onto the phone.

To expose Studio at your own URL separately, follow [production hosting](PRODUCTION.md).

## Connect your Mac

1. On the host, open the ChatGPT desktop app → **Settings → Connections → Control this Mac → Set up/Add**. You approve access and complete verification yourself.
2. Scan the displayed QR code on your phone and finish pairing with the same account/workspace.
3. Select that host in mobile Codex (sometimes labelled Remote), then open the **Podframes** project folder, not an unrelated repository.
4. Keep the Mac powered, awake, connected and the desktop app available. Review the host's keep-awake setting.

These steps follow [OpenAI's remote connection guide](https://learn.chatgpt.com/docs/remote-connections), checked 2026-11-05. Availability depends on your app/account. Pairing has not been performed by this repository. The existing private Studio need not become a public website for this workflow.

## Make an episode

Start with:

```text
$podframes-producer Use my saved series and its existing cast. Draft one
30-second Mandarin episode about [topic]. Check recent sources where needed.
Ask missing questions one at a time. Show the exact script, cast, speeds,
visual plan and paid settings before generating media.
```

The [producer skill](../.agents/skills/podframes-producer/SKILL.md) loads the [canonical workflow](../apps/web/public/agent-guide.md). If the picker does not show it, explicitly ask the connected session to read that file from the Podframes checkout.

Codex inspects the local library and worker, prepares a draft, then presents the exact episode for review. Approve that episode's paid generation explicitly when satisfied. The persistent Podframes worker runs the saved job; Codex monitors it and reports the output or a specific recovery action. Closing the chat is not a job cancellation. Changed paid inputs need renewed approval for the affected work; unchanged approval need not be requested again.

Approval in this skill is an agent workflow convention. Existing generation endpoints can execute immediately, so do not call them as a preview. Never paste owner tokens or provider keys into the chat. Keep saved request IDs and reconcile uncertain paid submissions before retrying. Use [automation recovery](AUTOMATION.md) for interrupted work.

## Native producer commands

Run from the connected host's Podframes checkout. First create or import the episode through Studio or the existing [CLI workflow](AUTOMATION.md); these commands operate on its saved slug.

```sh
pnpm producer discover
pnpm producer status --slug SLUG
# Queue only script drafting; the persistent worker performs it.
pnpm producer queue --slug SLUG --to script
# Repeat after the draft job finishes; review the exact script and settings.
pnpm producer status --slug SLUG
# Only after explicit approval, use reviewHash from the latest status:
pnpm producer queue --slug SLUG --to render --approve REVIEW_HASH
# Monitor saved stage/job progress and output:
pnpm producer status --slug SLUG
```

The render command requires an existing script and a matching current review hash; changed reviewed inputs invalidate that hash. Supplying a hash is not itself evidence that the person approved: the agent must obtain approval first. This command enqueues work rather than generating in the chat process. Existing queued/running work is rejected instead of duplicated.

For interrupted work, inspect the saved job and provider receipts first. Add `--acknowledge-interrupted` only after reconciling uncertain provider requests. Never use it as a general retry flag. Direct API/other CLI generation paths remain available and are not protected by this producer command's review-hash check.

## If the generation host moves to Ubuntu

Treat that as a separate deployment. Install Podframes, its web/worker, dependencies and provider logins together on the Ubuntu host using [Setup](SETUP.md). Connect it through the desktop app's SSH connection support and select its remote project. Commands and credentials then belong to that host; the Mac's Fish/HeyGen sessions do not transfer automatically. The phone connects through the configured desktop host. See OpenAI's guide above for SSH setup.

This is host orchestration, not support for a web server and worker on different machines sharing SQLite. Keep one authoritative data directory and one worker. No public app-server listener, new cloud hosting, or automatic cross-host data migration is required or configured here.
