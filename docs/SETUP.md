# Set up Podframes on Ubuntu or macOS

This guide runs the complete Studio and generation worker on **one machine**: Ubuntu 24.04 x86_64, an Ubuntu VM, or a Mac/macOS VM. Both processes use the same checkout, user account, files, and provider sessions. No cloud database or object storage is required. You can use the browser from another computer through SSH.

The installer prepares dependencies and builds the app. You complete provider logins, configure a video provider, and then enable background services. Installation does not generate content or spend generation credits. A working login does not guarantee that the account has image-generation access or sufficient provider allowance.

## 1. Prepare the machine

As an initial sizing estimate, use **4 vCPUs, 8 GB RAM, and 60 GB free SSD space** for short episodes. This is not a benchmark or minimum guarantee. More RAM/CPU helps local Whisper, browser rendering, and the production build; episode media can consume much more disk. A GPU is optional: Ubuntu setup selects software rendering. Keep project storage on a persistent local disk, not a temporary VM disk or network-mounted SQLite database.

Use a dedicated regular account with a writable home directory. Do not run the app as root. The Ubuntu installer needs `sudo` to install operating-system packages. Allow outbound HTTPS for package downloads, provider calls, model downloads, and live research. Keep port 3000 private; the supplied launcher binds to `127.0.0.1`.

### Ubuntu 24.04 x86_64

Create the VM using your provider's Ubuntu 24.04 image. Configure an SSH key and permit SSH from your own IP in the provider's firewall. Connect as its regular sudo-capable user:

```sh
ssh your-user@YOUR_VM_IP
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/JienWeng/podframes-studio.git "$HOME/podframes"
cd "$HOME/podframes"
bash scripts/setup.sh
```

For a private repository, authenticate Git on the machine or use a read-only SSH deploy key before cloning. The script supports Ubuntu 24.04 on **x86_64**, not Ubuntu ARM. It installs system media/browser libraries, a user-local Node 22 when an adequate Node is missing, pinned pnpm, Codex CLI, whisper.cpp v1.8.2, the multilingual base model, the HyperFrames browser, and project dependencies. Node archives are checked against the checksum file served by nodejs.org. Whisper is built with two compiler workers to limit setup memory use.

### macOS, Apple Silicon or Intel

For a macOS VM, use an Apple-supported virtualization environment and a macOS guest. Log into the VM's desktop as the account that will run Podframes. The LaunchAgent setup below needs that user's GUI login session; it does not create a boot-time system daemon.

Install Apple's command-line tools if they are missing:

```sh
xcode-select --install
```

Complete the installer dialog. Install [Homebrew](https://brew.sh/) using its official instructions, including its shell PATH instructions. Then:

```sh
git clone https://github.com/JienWeng/podframes-studio.git "$HOME/podframes"
cd "$HOME/podframes"
bash scripts/setup.sh
```

The macOS path uses Homebrew for Node 22, ffmpeg, and whisper.cpp. Other dependencies and the model are installed as on Ubuntu. Homebrew may request its normal package prerequisites. Hardware browser rendering remains the default on macOS; for a guest without working GPU acceleration, set `PRODUCER_BROWSER_GPU_MODE=software` in `.env.local`.

### After either installer

Use this PATH in your current shell and add it to `~/.bashrc` on Ubuntu or `~/.zshrc` on macOS:

```sh
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
```

Use a checkout and home path without spaces or special characters, such as `~/podframes`. The service installer checks this. The installer can be rerun after a failed download/build; it preserves existing `.env.local`, projects, library, and login state. It may update the installed Codex CLI and Homebrew packages. It is not an unattended app-upgrade command: stop services first when replacing runtime dependencies.

## 2. Configure access and one video provider

On the first run, setup creates a private `.env.local` with a random owner token and a browser GPU mode. It sets file permissions to `600`. If the file already exists, setup preserves it instead of overwriting your settings.

```sh
cd "$HOME/podframes"
nano .env.local
```

Keep the generated `PODFRAMES_API_TOKEN`. If you brought an existing file, ensure the token contains at least 32 characters. You can generate a replacement locally with:

```sh
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Paste that output into the file yourself. Do not include secrets in Git, screenshots, or support requests.

Choose one video provider:

| Provider | `.env.local` setting | Studio selection |
| --- | --- | --- |
| Replicate P-Video, default | `REPLICATE_API_KEY=your-key` | P-Video Avatar |
| fal LTX-2.3 | `FAL_API_KEY=your-key` | LTX-2.3 |
| HeyGen API credits | `HEYGEN_API_KEY=your-key` | HeyGen / API credits |
| HeyGen subscription credits | No HeyGen API key required; CLI OAuth login below | HeyGen / Subscription |

Obtain keys from your selected provider's account. Only configure services you intend to use. `PEXELS_API_KEY` is optional for stock B-roll. OpenAI/Anthropic API writing keys are optional and do not replace the Codex login required for images and Fish MCP speech. See [writing connections](API.md#writing-providers).

Optional operating limits:

```dotenv
PODFRAMES_DAILY_GENERATION_LIMIT=30
PODFRAMES_MAX_EPISODE_SECONDS=180
```

These are input/operation limits, not spending caps. CLI runs bypass the HTTP operation budget. Choose provider billing limits separately. Keep `PODFRAMES_LOCAL_ONLY` unset: this setup uses the owner token even through localhost.

## 3. Authenticate on the machine running Podframes

Run these as the **same regular user** used for installation and services. A login on your laptop does not automatically authenticate a remote VM. Never use `sudo codex` or `sudo heygen`.

### Codex / ChatGPT

```sh
codex login --device-auth
codex login status
```

Open the displayed link on your own computer and enter the one-time code. Device-code login must be allowed in your account/workspace. If unavailable, follow the [official headless authentication alternatives](https://developers.openai.com/codex/auth/). Authentication state remains in the VM user's home, so it survives service restarts. ChatGPT image availability and subscription limits still apply.

### Fish Audio website credits

```sh
codex mcp add fish-audio --url https://api.fish.audio/mcp
codex mcp login fish-audio
```

Open the authorization URL and sign in to the Fish account whose website credits you want to use. On a remote machine, if the callback points at `localhost`, the browser needs a tunnel to the **actual callback port printed by the CLI**. In a second terminal on your computer, use:

```sh
ssh -N -L CALLBACK_PORT:127.0.0.1:CALLBACK_PORT your-user@YOUR_VM_IP
```

Replace both `CALLBACK_PORT` values with the printed port, then finish the browser flow while that tunnel remains open. Do not substitute port 3000 unless that is the actual callback port. If the CLI does not expose a stable callback usable over SSH, finish this login in the VM's desktop browser; do not assume headless OAuth will work for every CLI/account combination. See [Fish's official MCP guide](https://docs.fish.audio/overview/mcp).

`FISH_API_KEY` is not used. Missing Whisper or invalid measured timestamps fails speech instead of inventing caption timing.

### HeyGen, only if selected

Install the CLI using the [official platform-specific instructions](https://github.com/heygen-com/heygen-cli#install). Confirm `command -v heygen` resolves in `~/.local/bin`, `/opt/homebrew/bin`, or `/usr/local/bin`, which are on the background service PATH. For a binary elsewhere, link that binary into `~/.local/bin`.

For subscription credits:

```sh
heygen auth login --oauth
heygen auth status
```

Use the printed browser flow; if needed, tunnel its actual localhost callback port as above. API mode uses the key in `.env.local`. The CLI stores one credential type at a time; OAuth login can replace a stored API credential. Do not switch modes merely to work around an uncertain paid request.

## 4. Check readiness and start manually

```sh
cd "$HOME/podframes"
pnpm podframes doctor
```

Resolve missing tools, sessions, model, or video credentials before generating. The setup build does not require provider authentication, but generation does. `doctor` checks readiness; it does not prove every remote generation permission or complete a test episode.

For an initial foreground check, run these in two separate terminals on the target machine:

```sh
bash scripts/run-service.sh web
```

```sh
bash scripts/run-service.sh worker
```

Open `http://localhost:3000/studio` on that machine. The browser login username is **`podframes`** and the password is the `PODFRAMES_API_TOKEN` value from `.env.local`. Full generation needs both web and worker running. An offline worker leaves submitted jobs queued.

For a VM, on your computer:

```sh
ssh -N -L 3000:127.0.0.1:3000 your-user@YOUR_VM_IP
```

Keep the tunnel running and open `http://localhost:3000/studio` locally. Do not open the VM's port 3000 to the Internet. Public-domain hosting requires a separately configured HTTPS reverse proxy, owner authentication, correct Host/Origin forwarding, and streaming/upload support. It is not configured by this installer.

Stop the two foreground processes with Ctrl-C while idle before installing services.

## 5. Run in the background

```sh
cd "$HOME/podframes"
bash scripts/setup.sh services
```

This installs both services without running any generation automatically. It does not interrupt an already loaded macOS worker. Install only one service pair per account, and do not start a second foreground worker alongside it.

### Ubuntu systemd user services

Setup enables user lingering so services can start after reboot without an SSH login. Run service commands without `sudo`; only the lingering configuration needs it.

```sh
systemctl --user status podframes-web podframes-worker
journalctl --user -u podframes-web -u podframes-worker -f
systemctl --user stop podframes-web podframes-worker
systemctl --user start podframes-web podframes-worker
```

Units live in `~/.config/systemd/user/podframes-{web,worker}.service`. If `systemctl --user` cannot connect to the user bus, reconnect through a real SSH login as the service user; avoid an account reached only through `sudo su`. Ensure the VM includes systemd user sessions and `dbus-user-session`.

### macOS LaunchAgents

```sh
launchctl print "gui/$(id -u)/com.podframes.web"
launchctl print "gui/$(id -u)/com.podframes.worker"
tail -f "$HOME/Library/Logs/Podframes/worker.log" "$HOME/Library/Logs/Podframes/worker.error.log"
```

Agents live in `~/Library/LaunchAgents/com.podframes.{web,worker}.plist`. They start when this user logs into the desktop, not before login after a reboot. Keep the Mac/VM awake and connected; configure sleep in macOS settings. For unattended reboot operation, provision an appropriate user session separately. Do not enable automatic login without considering access to the machine and its credentials.

To stop, while no job is running:

```sh
launchctl bootout "gui/$(id -u)/com.podframes.web"
launchctl bootout "gui/$(id -u)/com.podframes.worker"
```

To start again, run `bash scripts/setup.sh services`. After editing `.env.local`, stop/start the affected services so both processes reload configuration.

## 6. Verify without buying generation

Confirm Studio loads, projects/library can be viewed, and the worker appears online in the health response. The API requires Bearer authentication. This example prompts without echoing your token and keeps it out of the curl command arguments:

```sh
read -rs -p 'Owner token: ' PODFRAMES_CHECK_TOKEN; echo
printf 'header = "Authorization: Bearer %s"\n' "$PODFRAMES_CHECK_TOKEN" \
  | curl --config - --fail --silent --show-error http://localhost:3000/api/v1/health
unset PODFRAMES_CHECK_TOKEN
```

Run this snippet in **Bash** (`bash` first if your shell is zsh). Readiness/health calls do not generate an episode. Validate import-only behavior with the included script:

```sh
pnpm podframes generate --script examples/automation/episode.md --slug setup-import-check --language zh --only script
```

This creates a project and validates imported dialogue without calling generation services. It does not verify browser rendering, Fish speech, or lip-sync. For the first paid check, deliberately create one short episode, verify the selected provider/billing mode, then review audio, captions, lip-sync, and the resulting `projects/<slug>/output.mp4`. Do not treat setup success as an end-to-end generation test.

## Updates

1. Wait for all jobs to finish. Check Studio and the worker logs; do not stop a worker in the middle of a paid call.
2. Back up data as below, then stop both services using your platform's commands.
3. In the checkout:

   ```sh
   git status --short
   git pull --ff-only origin main
   pnpm install --frozen-lockfile
   pnpm build:web
   pnpm podframes doctor
   ```

4. Start both services again. If the update fails, keep services stopped and resolve it before resuming. Do not reset or clean the checkout to fix an update: generated data and local changes may matter.

Use `bash scripts/setup.sh` again only when dependencies need repair/update. It preserves your env file but may change tool versions. The pnpm lockfile fixes app dependencies; Codex, Homebrew packages, browser downloads, and the downloaded Whisper model are not a fully immutable VM image.

## Backup and move to another machine

While both services and any CLI generation are stopped, copy these to encrypted storage:

- `projects/`: episode state, paid artifacts, remote-job receipts, and final videos.
- `library/`: saved cast and series.
- `.automation/`: SQLite queue, event history, worker state, and HTTP receipts. Copy the entire directory while idle, including any SQLite sidecar files.
- `.env.local` and any `.env`: secrets and settings; restrict access.
- Any custom `episodes/` or `examples/script-library/` content you want to retain.

Install a fresh checkout on the destination, stop its services, restore those files with the destination account as owner, and authenticate providers there. Restore `chmod 600 .env.local`. Preserve the same episode slugs and provider-job files. Never run original and restored workers simultaneously against copied queued/paid jobs: local SQLite and project locks cannot coordinate across machines.

Recheck old queued/interrupted jobs before starting a restored worker. A restored `queued` job can be claimed immediately. Do not restore stale provider state and blindly regenerate; the remote request may already have spent credits. Local CLI authentication directories are secrets, separate from app data; prefer fresh login on the destination. VM snapshots containing them need equivalent protection.

## Troubleshooting

| Symptom | Check / action |
| --- | --- |
| HTTP 503 about owner token | Set a token of at least 32 characters in root `.env.local`; restart web. |
| Browser repeatedly asks for credentials | Username `podframes`, password is the owner token; clear old saved browser credentials. |
| Jobs remain queued | Start the worker under the same account and checkout; inspect service logs and health heartbeat. |
| CLI works, background service fails | Verify the service PATH, same home/login account, `.env.local`, and executable locations. NVM-only shell configuration is not loaded by services. |
| Whisper missing | Check `whisper-cli --help` and `~/.cache/podframes/ggml-base.bin`; set `WHISPER_MODEL` in `.env.local` for a different model path. |
| Browser download/start fails | Run `pnpm --filter @podframes/core exec hyperframes browser ensure`; verify disk, outbound downloads, Linux browser libraries, and a regular non-root user. Do not bypass browser sandboxing as a generic fix. |
| VM render/GPU fails | Set `PRODUCER_BROWSER_GPU_MODE=software`, restart services, and retry compose/render only after inspecting stage state. Software rendering can be slower. |
| Build is killed | Check RAM and OS OOM logs; add VM memory or separately configured swap, then rebuild with services stopped. |
| macOS `gui/<uid>` domain missing | Log into the target user's desktop session, then install agents from that account. |
| Login expires | Stop admitting new work, reauthenticate as the service user, check doctor, restart while idle. |
| Worker crashed during a paid stage | Inspect saved artifacts and provider job status. Use the existing explicit interrupted-job acknowledgement only after reconciling the remote outcome. |
| Disk nearly full | Back up completed episodes and intentionally delete old projects through Studio. Do not delete in-progress caches or remote-job receipts. Rotate macOS log files while services are stopped. |

For episode commands, reuse, and recovery, see [automation](AUTOMATION.md). For a visual automation alternative, import the [n8n seven-stage workflow](N8N.md). For owner authentication, limits, idempotency, and endpoints, see [API](API.md). The separate hosted-web/Mac-worker architecture remains a [future deployment proposal](DEPLOYMENT.md).
