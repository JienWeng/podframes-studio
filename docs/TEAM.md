# Private shared studio

One host runs the Studio, worker and shared provider accounts. The owner approves **membership** in Studio → Team. Approved editors can create episodes and spend shared generation credits directly; the owner does not approve each video. Viewers can read existing work. Owners can also manage members. All members share the same project/cast/series library; there is no per-project isolation or per-member credit budget.

## Give someone access

1. The owner grants the person access to the private Tailscale host through the chosen tailnet access policy.
2. In **Team**, add their name, username and initial password; choose Editor, Viewer or Owner. Prefer Editor for creators. Passwords require at least 12 characters.
3. Share the sign-in username and initial password privately. The separate API token is displayed once if needed for automation; stored credentials are hashed. Do not share the owner’s credential.
4. Send the actual private Studio HTTPS URL. The member connects to Tailscale and signs in at `/login`. Individual browser sessions share the same workspace; Sign out ends that session. API clients can still use their member Bearer token.

Revoking a member denies subsequent requests. It does not cancel already running generation or erase downloaded files. Owners configure their initial human login or reset member passwords in Team → Set or reset a sign-in. Password resets revoke that account’s existing sessions. If an API token is lost, revoke it and create a replacement membership. Browser Basic-auth credentials may remain cached: use a separate browser profile/private window when switching identities.

## Private HTTPS on the host

Keep Podframes bound to `127.0.0.1:3000`. Disable `PODFRAMES_LOCAL_ONLY` bypass and keep owner/member authentication active behind a proxy. After the owner authorizes the network setup, use:

```sh
tailscale serve --bg http://127.0.0.1:3000
tailscale serve status
```

Review existing Serve configuration first. Use the exact HTTPS URL reported by Tailscale; do not invent one. Serve exposes the app within the tailnet according to its access policy. It is separate from public Funnel. Follow [Tailscale's Serve documentation](https://tailscale.com/docs/reference/tailscale-cli/serve) for version-specific requirements and HTTPS setup. This guide alone does not enable networking.

Test an editor creating a draft, a viewer being denied mutation, unauthenticated rejection, and revoked-token rejection. Check production worker availability before inviting creators. Member access uses the host's existing provider sessions and credits; it does not require giving each member provider keys.

## Agents and independent installs

Roles restrict requests through the Studio and HTTP API. They do **not** restrict someone with the service account's shell, SSH access, or an owner-connected remote Codex session: that person can read local credentials and data or invoke generation outside the HTTP role checks.

Team members should use their **own Codex accounts** with their own member-scoped HTTP token to this shared API. Do not give them the owner's remote OS session as a substitute for membership. Independent operation requires a separate installation and appropriately isolated OS account, data and provider credentials.

An approved editor's agent uses their own member credentials. The producer skill may ask the **requesting member** to review an exact draft before generating; no separate owner approval is required. Never use a different owner's session to bypass viewer restrictions.

For an independent installation with separate data, credentials and billing, follow [Setup](SETUP.md) and [production hosting](PRODUCTION.md). Joining this shared studio does not install Podframes on a member's machine. Hosted agents explicitly read authenticated `/llms.txt`; repository sessions can invoke the producer skill.
