# Host Podframes at your own URL

Use **one persistent Ubuntu 24.04 x86_64 server** for the Studio, queue, worker, media and provider sessions. The existing Mac can also host them, provided it stays awake and reachable; macOS user services require desktop login. This is a single-owner deployment, not separate frontend/worker hosting or multi-user SaaS.

## Prepare the host

Choose an existing server and domain first. See [Setup](SETUP.md) for machine sizing, installation and platform service commands. Keep the checkout and media on persistent local disk under a regular account. Do not copy SQLite onto a shared network drive.

```sh
bash scripts/setup.sh
bash scripts/setup.sh access
# Complete the provider logins and selected billing credentials from SETUP.md.
pnpm podframes doctor
pnpm build:web
bash scripts/run-service.sh check
```

Keep `PODFRAMES_LOCAL_ONLY` unset or explicitly `false` in both env files and service environment before public proxying. The owner token must be configured; local-only bypass is unsuitable behind a proxy. Keep env files private. Inspect existing queued/interrupted jobs before starting services, because the worker can claim them immediately.

```sh
bash scripts/setup.sh services
```

The supplied web launcher listens only on `127.0.0.1:3000`. Leave port 3000 closed in host and cloud firewalls. Check authenticated local Studio and API access plus the worker heartbeat before adding a domain. Provider authentication checks do not prove available credits or successful rendering.

## Add HTTPS

Use a domain you control, such as `studio.example.com`. Point its A record at this server; add AAAA only when IPv6 reaches the same working server. Allow inbound TCP 80/443 for Caddy; restrict SSH to trusted access. Install Caddy using its [official installation instructions](https://caddyserver.com/docs/install).

Prepare a configuration without changing DNS, services or environment settings:

```sh
pnpm production --domain studio.example.com --output /tmp/Podframes.Caddyfile
# On the actual prepared target, also validate owner/local-only settings:
pnpm production --domain studio.example.com --output /tmp/Podframes-checked.Caddyfile --check-host
```

The destination parent must exist and the file must not exist. The helper refuses overwrites. `--check-host` rejects local-only bypass or an invalid owner token; it does not verify DNS, certificates or provider credits. Its printed URL is the intended address, not proof that the site is live. The generated proxy preserves the public Host header and streams responses promptly.

The essential configuration is:

```caddyfile
studio.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

For the usual packaged Linux service, place the reviewed configuration at `/etc/caddy/Caddyfile`, then validate and reload:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Preserve existing sites if Caddy already serves other domains. Installation/service commands differ on macOS; follow the Caddy package's service instructions. Caddy obtains and renews public certificates when DNS, reachable ports and persistent certificate storage are configured. See [automatic HTTPS](https://caddyserver.com/docs/automatic-https) and [reverse proxy configuration](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). Do not remove Podframes authentication or rewrite authorization headers.

## Verify the actual URL

- Check HTTP redirects to HTTPS and the certificate matches the chosen domain.
- Without credentials, Studio, API, media and agent documents must reject access. Confirm authenticated Studio loads, worker is online, existing media plays and downloads, and progress updates stream.
- Inspect Cast and Series, then perform the import-only smoke check in [Setup](SETUP.md). Generate a short paid test only when explicitly authorized with its chosen providers.
- Test idle service restart, reboot behavior, disk monitoring and [backup/restore](SETUP.md#backup-and-move-to-another-machine). Keep encrypted backups off the server and retain Caddy certificate storage.

Building or writing a Caddyfile is preparation, not evidence of deployment. Record the tested URL and any unresolved check in [service readiness](SERVICE_READINESS.md).

## Agent discovery

In this checkout, invoke `$podframes-deploy` for installation/hosting, or `$podframes-producer` for episodes. At a deployed origin, explicitly ask an authenticated agent to read `/llms.txt`, then `/agent-guide.md`. Those routes retain owner authentication. Reading them is opt-in; a public URL does not automatically install skills or grant local command access. Keep tokens out of prompts and shared links.

For a phone controlling the generation host, use [remote Codex](REMOTE_CODEX.md). Remote pairing and public Studio hosting are separate choices; neither transfers provider sessions to a different host.
