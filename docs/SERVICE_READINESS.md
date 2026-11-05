# Single-owner service readiness

Scope: one owner, one persistent Ubuntu/macOS host, web and worker sharing the same local files. This is not a multi-user SaaS launch checklist. Status below records implementation and isolated checks; it does not certify an untested server.

## Implemented and checked

- [x] Repeatable dependency/build installer and background web/worker service templates. Shell syntax checked; target-host installation still required.
- [x] Production preflight rejects missing build, missing/short owner token, unsupported Node, and inaccessible or invalid existing data directories.
- [x] `bash scripts/setup.sh access` creates a missing random owner credential in private `.env.local`, never prints it, preserves unrelated settings and valid credentials, and refuses to silently replace an invalid credential. Isolated fixtures verified these behaviors and file mode `0600`.
- [x] Persistent local queue and worker process; restarting the frontend does not intentionally terminate the separate worker. Existing queued jobs may start as soon as the worker starts.
- [x] Owner-protected Studio, API, and media routes; exported videos remain local/private. See [API access](API.md).
- [x] Real Mac episode completed with Fish, HeyGen, AI B-roll, captions, and export. This demonstrates that run, not every provider/account or Ubuntu deployment.

- [x] Current automated checks: 131 core tests and 27 web library tests passed. Browser inspection verified the expandable setup checks, saved Cast (including Rex at 1.25×), and Series details in a temporary local preview; authenticated production access was checked separately.

## Verified private Mac deployment · 2026-11-05

The selected scope is **this Mac, private access first**. Owner access was initialized privately in `.env.local`; production preflight passed. Both LaunchAgents were installed and started after confirming no queued/running jobs or duplicate processes.

- [x] Required selected connections checked: Codex, Fish website login, Whisper, HeyGen subscription, fal, and Pexels. Optional API/Claude providers remain unconfigured.
- [x] Owner authentication was verified first. At the owner’s request, private loopback Studio/media now open without a login prompt using explicit `PODFRAMES_LOCAL_ONLY=true`. Versioned API without a token returns 401; valid Bearer authentication returns 200. Cross-origin mutations return 403 and spoofed remote-forwarding requests are rejected. The owner token is retained, and the web server stays bound to `127.0.0.1`.
- [x] Idle worker restart tested with a new process ID and restored heartbeat. Launcher now runs Node directly so service signals reach the worker instead of an intermediate package-manager wrapper. Web session was not interrupted.
- [x] Local backup/restore drill: 1,571 files verified by SHA256, 272 restored project JSON documents parsed, SQLite integrity passed, and an existing output MP4 probed successfully. Queue restored into `.automation.recovery` so no copied jobs could start. Verified backup retained outside the repo at `/Users/jienweng/Code/Backups/podframes/2026-11-05`; it is private local storage, not an encrypted off-host backup.
- [ ] Physical reboot/login persistence has not been exercised; Mac agents still require the owner's desktop login.

Public HTTPS/domain and Ubuntu verification are outside this private Mac deployment, not blockers to local use. The checklist below applies when moving to another host or widening access.

## Finish on the chosen host

- [ ] Install as the dedicated regular account using [Setup](SETUP.md). Keep SQLite and media on persistent local disk.
- [ ] Run `bash scripts/setup.sh access` if owner access is missing. For existing invalid credentials, edit `.env.local` deliberately. Keep secrets off Git and out of shared logs.
- [ ] Complete provider logins as that same account; verify chosen billing mode, actual subscription entitlement, image access, and credit availability.
- [ ] Run `pnpm podframes doctor` and `bash scripts/run-service.sh check`. Neither command proves paid generation will succeed.
- [ ] Inspect queued/interrupted jobs before enabling the persistent services with `bash scripts/setup.sh services`. Do not start duplicate workers.
- [ ] Verify authenticated Studio, worker heartbeat, saved cast/series, media preview, and download. Use an SSH tunnel initially.
- [ ] For a public domain, configure HTTPS proxy/DNS separately, preserve authentication and streaming/uploads, and test unauthorized requests. The installer does not provision public hosting.
- [ ] Run the import-only smoke check, then one explicitly authorized short paid episode. On Ubuntu, verify software browser rendering and subscription authentication on that actual machine.
- [ ] While idle, test service restart/reboot behavior. Linux user lingering and Mac desktop-login requirements differ; see [background services](SETUP.md#5-run-in-the-background).
- [ ] Configure off-host encrypted backups and retention; test restoring an idle project and downloading its existing output without replaying paid jobs.
- [ ] Check disk space and service logs regularly. Configure host monitoring, HTTPS renewal, and log rotation for unattended operation.

## Remaining boundaries

Local owner access and idle service restart are now verified as described above. Local backup restore is verified; encrypted off-host retention, physical reboot, and any newly selected provider entitlement still need their own verification. Public HTTPS and Ubuntu end-to-end generation apply only if those deployment options are chosen. R2/cloud synchronization, separate-host workers, customer accounts/billing, and recurring scheduling are future work, not enabled by this checklist. See [deployment choices](DEPLOYMENT.md) and [recovery](AUTOMATION.md).
