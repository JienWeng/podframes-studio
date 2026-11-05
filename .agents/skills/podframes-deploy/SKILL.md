---
name: podframes-deploy
description: Install, build, host, deploy or configure a domain for the single-owner Podframes Studio and generation worker. Use for production URL setup, service startup, HTTPS, and deployment verification.
---

# Deploy Podframes

Read [production deployment](../../../docs/PRODUCTION.md), then the linked setup sections for the actual host. Keep web and worker together on one persistent machine.

Inspect the existing checkout, service state, owner authentication and available host/domain context first. Ask one missing decision at a time: target host, then domain. Do not buy hosting, change DNS, expose services, replace credentials or enable remote pairing without authorization for that concrete action; existing explicit authorization remains valid. Prepare the build and reviewable configuration before requesting any remaining approval.

Use `pnpm production --domain DOMAIN --output NEW_FILE` to prepare a proxy configuration without deploying. Add `--check-host` on the prepared target to check owner authentication settings. The parent directory must exist; the helper refuses overwrites. Use installed command help to confirm flags. Preserve existing services, queued paid jobs and provider receipts. A generated proxy file is not a deployment. Do not execute paid media as a health probe.

Verify actual HTTPS, unauthorized rejection, authenticated Studio/API/media and worker heartbeat. Report the tested URL and remaining limitations. Update [service readiness](../../../docs/SERVICE_READINESS.md) with evidence, without treating a local build as a live-host test. For content creation, use the sibling `podframes-producer` skill.
