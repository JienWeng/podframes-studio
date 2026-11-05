# Deploy Podframes

## Recommended now: one persistent host

Run the web/API and the generation worker as **two processes on the same Ubuntu VM or Mac**, under the same user and checkout. They share local project files, provider logins, and `.automation/state.sqlite`. Keep this database on a local persistent disk. This is the implemented deployment; moving only the web frontend to a separate server will not work with the current storage and queue.

[SETUP.md](SETUP.md) provides installation, provider authentication, background services, backups, and recovery. The existing installer supports Ubuntu 24.04 x86_64 and macOS. Our completed video was generated on a Mac; Ubuntu installation support is not an end-to-end production benchmark or a verified subscription-login guarantee.

### Machine sizing

These are planning recommendations for **one active video job**, not measured minimum requirements. Most image, voice, avatar, and AI B-roll generation happens at providers; local CPU/RAM handles Whisper, browser frame capture, and encoding. A dedicated GPU is not required.

| Host | Starting configuration | Preferred configuration |
| --- | --- | --- |
| Ubuntu VM | 8 dedicated vCPUs, 16 GB RAM, 250 GB persistent SSD | 8 dedicated vCPUs, 32 GB RAM, 500 GB SSD |
| Apple Silicon Mac | 24 GB unified memory, 512 GB SSD | 32 GB unified memory, 512 GB or larger SSD plus a 1 TB external SSD for media/backups |

CPU architecture, sustained performance, browser rendering, and provider latency matter more than the vCPU count alone. Keep one worker instance initially. More jobs require capacity and queue-concurrency work; starting duplicate workers is not a scaling plan. A Mac must stay awake and connected, and its LaunchAgents require the service user's desktop login after reboot. A Linux VM is simpler for unattended reboot recovery.

The measured Northwoods episode contains about **42 MB retained project data**, including a **14.4 MB, 33.2-second final export** from roughly 42 seconds of source dialogue. Intermediate raw output previously occupied about **55.8 MB** and was removed after successful export. This is one short example, not a storage limit. Budget **0.5–2 GB of temporary working space per short episode** as a generous starting allowance, then measure your own resolution, clip count, and retry history. Models, browser binaries, dependencies, and backups need additional disk.

### Installation and automatic startup

After installing and authenticating using [Setup](SETUP.md), install the repository's existing service templates:

```sh
cd "$HOME/podframes"
bash scripts/setup.sh services
```

On Ubuntu this installs `~/.config/systemd/user/podframes-{web,worker}.service` and enables user lingering. Check both processes:

```sh
systemctl --user status podframes-web podframes-worker
journalctl --user -u podframes-worker -f
```

On macOS it installs `~/Library/LaunchAgents/com.podframes.{web,worker}.plist`:

```sh
launchctl print "gui/$(id -u)/com.podframes.web"
launchctl print "gui/$(id -u)/com.podframes.worker"
```

Use the supplied persistent worker service, not a one-shot worker. The web app can accept jobs while the worker is offline, but they remain queued. Do not start another foreground worker alongside the service. The [startup and shutdown commands](SETUP.md#5-run-in-the-background) are the authoritative service instructions; no separate handwritten service files are needed.

### Video storage and access

Current exports live at `projects/<slug>/output.mp4`; project folders also hold reusable paid audio, avatar clips, B-roll, provider receipts, and timing data. Saved cast and series live under `library/`. Studio serves the final video through the protected `/api/media/<slug>/output.mp4` route. The owner can preview/download it in Studio, or copy it over SSH/SFTP. Do not publish the project directory as an unauthenticated static folder.

For private remote access, keep the service on localhost and use the [SSH tunnel](SETUP.md#4-check-readiness-and-start-manually). For a public domain, put an HTTPS reverse proxy in front of localhost:3000, preserve Host/Origin and streaming/upload support, and keep owner authentication enabled. This requires proxy/DNS configuration beyond the installer. The authenticated [automation API](API.md) runs in the same application; the worker is a separate process, not an independently hosted API service.

Back up `projects/`, `library/`, and `.automation/` together while services are idle, plus encrypted settings and custom scripts. Keep an off-host backup; an external SSD attached to the same Mac is useful working storage but not the only backup. Follow [migration precautions](SETUP.md#backup-and-move-to-another-machine) before restoring queued or interrupted paid jobs.

**Future storage option:** private Cloudflare R2 for durable video/media objects, with short-lived signed download URLs. It would reduce VM disk pressure and simplify remote downloads. R2 upload, manifests, retention, signed URLs, and recovery synchronization are **not implemented**; adding bucket credentials alone does not enable them. R2 Standard lists $0.015/GB-month with a 10 GB-month free allowance and no Internet egress charge; request operations are billed separately. Check [official pricing](https://developers.cloudflare.com/r2/pricing/) before provisioning. Keep active render scratch and SQLite on local disk even after object storage is added.

### First-host acceptance check

1. Run `pnpm podframes doctor`; verify persistent worker heartbeat and authenticated Studio/API access.
2. Complete Codex, Fish MCP, and selected HeyGen subscription/API authentication on the actual host. Confirm subscription entitlement, remaining credits, and Codex image availability; a successful login alone is insufficient.
3. Run the [import-only smoke check](SETUP.md#6-verify-without-buying-generation), then explicitly authorize one short paid episode.
4. Review audio, captions, portrait identity, lip sync, B-roll motion, and final download. Test Ubuntu's software browser rendering rather than assuming Mac performance transfers.
5. While idle, restart both services and verify queued work, library assets, and existing downloads survive. Prove a backup restore without launching copied paid jobs twice.

## Future: hosted web with a separate Mac worker

The remaining sections are a **distributed deployment proposal**, not the current installation. Outbound cloud-to-Mac job transport, cloud asset synchronization, individual customer accounts, schedules, and the hosted automation hub still need implementation. Current owner authentication, the versioned automation API, durable request receipts, SQLite queue/events, operation limits, and separate local worker are implemented. Codex, Claude Code, OpenAI API, and Anthropic API writers are selectable.

## Hosting choice

Use Railway for the Next.js web studio, a small automation API service, PostgreSQL, and private object storage. This keeps the online services in one hosting account. Use a generated Railway domain for the first private deployment, then attach a custom domain when selected. Railway supports Next.js, PostgreSQL, and S3-compatible buckets.

Official setup references

- https://railway.com/guides/nextjs
- https://docs.railway.com/databases/postgresql
- https://docs.railway.com/data-storage

## Responsibilities

| Component | Location | Owns |
| --- | --- | --- |
| Web studio | Railway | Library, editor, automation hub, signed-in user session, progress and downloads |
| Automation API | Railway | Authorized project operations, schedules, job queue, worker registration, durable events and artifact manifests |
| PostgreSQL | Railway private network | Project metadata, template versions, jobs, schedules, worker heartbeats, review state |
| Private object storage | Railway | Uploaded portraits, template images, generated audio, clips and finished exports |
| Generation worker | This Mac | Codex CLI, Fish MCP, HeyGen CLI, Whisper, ffmpeg, HyperFrames and local working files |

The API is a separate service from the frontend. It imports shared project contracts and validates requests. The Mac worker reuses the existing core pipeline. The browser talks to the online API through its authenticated web session. The worker polls the online API over outbound HTTPS with its own revocable credential.

The Mac retains its local Codex, Fish and HeyGen login state. The cloud API issues scoped job instructions and short-lived artifact upload/download URLs. It never receives copies of subscription sessions. The Mac needs to remain awake and connected for generation. The web app remains available while the worker is offline, and jobs remain queued.

## Job lifecycle

1. A signed-in creator chooses a saved template, topic or imported script, language, target duration, voice model for each host, video provider and billing mode.
2. The API saves an immutable input snapshot, including the exact template/portrait versions and script references. A client request key prevents duplicate submissions.
3. The worker atomically claims one eligible job. A lease and heartbeat identify ownership, and each state update carries the claim token.
4. The worker downloads required assets into its local project folder, then runs the existing pipeline. Progress events and provider job IDs are persisted before acknowledgement.
5. Completed artifacts are uploaded to private storage and their manifests committed before the job becomes complete.
6. The hub offers review and downloads. Schedules create jobs from saved configurations and hold completed videos for review.

Queued jobs survive app and API deployments. A lost worker lease during a paid stage enters a needs-review state. An interrupted job must reconcile saved provider job IDs and local stage state before an explicit resume. Retrying upload or status reporting must reuse the same artifacts and job identifiers. Cancellation is cooperative, and an active provider request may finish after cancellation is requested.

## Automation hub

The first hub should provide worker online/offline status, new-job creation from a template, queued/running/completed/failed/needs-review jobs, per-stage progress, review/download links, cancellation, and explicit resume. Recurring schedules include a timezone and a unique schedule-occurrence key, preventing duplicate episodes after scheduler restarts. Saved settings include each host's `fish/s2.1-pro` or `fish/drama-3` model.

## Configuration to prepare

These variable names describe the proposed deployment contract. They are not implemented application settings yet.

| Location | Proposed settings |
| --- | --- |
| Web studio | `AUTOMATION_API_URL`, server-to-server credential, login/session configuration |
| Automation API | `DATABASE_URL`, allowed studio origin, artifact bucket endpoint/name/credentials, session-verification settings, worker-token hashes |
| Mac worker | `AUTOMATION_API_URL`, revocable worker credential, worker ID, local working directory |

Store cloud settings in Railway service variables. Store the worker credential locally with restricted file permissions. Keep subscription authentication on the Mac through the existing CLI login commands. Run the worker as a macOS launch agent with a single active instance and restart-on-failure behavior. Machine restart and login expiration must appear as worker-offline or action-required states in the hub.

## Rollout sequence

1. Implement and locally exercise API/worker separation with fake generation and durable jobs.
2. Move project reads, writes, uploads and media serving away from frontend local disk, including character generation, delivery direction and voice previews.
3. Add signed-in access, worker authentication, storage synchronization and the automation hub. Verify light and dark themes and narrow layouts.
4. Create the Railway project and its services, database and bucket. Configure variables and database migrations. Run the API's scheduler as one elected process, protected by database locking.
5. Authenticate the Mac worker and connect it to the staging API. Import selected existing templates and check exact portrait and voice preservation.
6. Prove an import-only run, worker-offline queueing, deployment during a job, lease loss, duplicate submission, and artifact upload retry.
7. Run one explicitly authorized paid video, review its artifacts, then enable recurring schedules and attach a domain.

## Completion criteria

The online studio can create, edit and download an episode while generation runs in a separate Mac process. Restarting the web frontend does not terminate generation. Queued jobs survive API restarts. The hub reports the Mac offline accurately. Saved voice models reach both previews and full synthesis. Interrupted paid calls require reconciliation before resubmission.
