import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { createTeamMember, revokeTeamMember } from "../../../packages/core/src/team";
import { setPassword, login, sessionIdentity, logout } from "../../../packages/core/src/sessions";
import { durableUpdate } from "../../../packages/core/src/util/durable";
import { proxy } from "../proxy";
import { teamIdentity } from "./team-access";
import * as loginRoute from "../app/api/auth/login/route";
import * as logoutRoute from "../app/api/auth/logout/route";

test("password sessions enforce roles, reset/revocation/expiry and signed-out local access", async t => {
  const root = await mkdtemp(join(tmpdir(), "podframes-session-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "pnpm-workspace.yaml"), "packages: []");
  t.mock.method(process, "cwd", () => root);
  const oldToken = process.env.PODFRAMES_API_TOKEN;
  const oldLocal = process.env.PODFRAMES_LOCAL_ONLY;
  process.env.PODFRAMES_API_TOKEN = "owner-test-token-more-than-thirty-two-characters";
  process.env.PODFRAMES_LOCAL_ONLY = "true";
  t.after(() => {
    if (oldToken === undefined) delete process.env.PODFRAMES_API_TOKEN; else process.env.PODFRAMES_API_TOKEN = oldToken;
    if (oldLocal === undefined) delete process.env.PODFRAMES_LOCAL_ONLY; else process.env.PODFRAMES_LOCAL_ONLY = oldLocal;
  });
  for (const username of ["__proto__", "constructor"]) {
    assert.equal(login(root, username, "wrong-password"), null);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "count"), false);
  const oversized = await loginRoute.POST(new Request("http://localhost:3000/api/auth/login", {
    method: "POST", body: "x".repeat(4097), headers: { "content-length": "1" },
  }));
  assert.equal(oversized.status, 413);
  const { member } = createTeamMember(root, "Viewer", "viewer");
  setPassword(root, member.id, "viewer.test", "correct-password-123");
  assert.equal(login(root, "viewer.test", "wrong-password"), null);
  const session = login(root, "VIEWER.TEST", "correct-password-123")!;
  assert.equal(session.identity.role, "viewer");
  const request = (path: string, cookie: string, method = "GET") => new NextRequest(`http://localhost:3000${path}`, { method, headers: { host: "localhost:3000", cookie } });
  const cookie = `podframes_session=${session.token}`;
  assert.equal(proxy(request("/studio", cookie)).headers.get("x-middleware-next"), "1");
  assert.equal(proxy(request("/api/projects", cookie, "POST")).status, 403);
  assert.equal(proxy(request("/api/v1/health", cookie)).status, 401);
  assert.equal(proxy(request("/api/auth/logout", cookie, "POST")).headers.get("x-middleware-next"), "1");
  assert.equal(teamIdentity(request("/", "podframes_session=invalid")), null);
  assert.equal(teamIdentity(request("/", "podframes_signed_out=1")), null);
  setPassword(root, member.id, "viewer.test", "replacement-password-123");
  assert.equal(sessionIdentity(root, session.token), null);
  const replacement = login(root, "viewer.test", "replacement-password-123")!;
  logout(root, replacement.token);
  assert.equal(sessionIdentity(root, replacement.token), null);
  const expired = login(root, "viewer.test", "replacement-password-123")!;
  durableUpdate(root, "sessions", () => ({ sessions: [] as Array<{ expires: number }> }), state => { for (const item of state.sessions) item.expires = 0; });
  assert.equal(sessionIdentity(root, expired.token), null);
  const revoked = login(root, "viewer.test", "replacement-password-123")!;
  revokeTeamMember(root, member.id);
  assert.equal(sessionIdentity(root, revoked.token), null);
  setPassword(root, "owner", "owner.test", "owner-password-123");
  const response = await loginRoute.POST(new Request("https://studio.example.com/api/auth/login", { method: "POST", headers: { host: "studio.example.com", origin: "https://studio.example.com", "content-type": "application/json" }, body: JSON.stringify({ username: "owner.test", password: "owner-password-123" }) }));
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /Secure/i); assert.match(setCookie, /SameSite=lax/i);
  const crossSite = new Request("https://studio.example.com/api/auth/logout", { method: "POST", headers: { host: "studio.example.com", origin: "https://evil.example" } });
  assert.equal((await logoutRoute.POST(crossSite)).status, 403);
  for (let index = 0; index < 10; index++) login(root, "owner.test", "incorrect-password");
  assert.equal(login(root, "owner.test", "owner-password-123"), null);
});
