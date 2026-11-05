import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { durableRead, durableUpdate } from "./util/durable";
import { teamMembers, type TeamMember } from "./team";
interface Password { id: string; username: string; salt: string; hash: string; version: string }
interface Session { hash: string; id: string; version: string; expires: number }
interface AuthState { passwords: Password[]; sessions: Session[]; attempts: Record<string, { count: number; until: number }> }
const initial = (): AuthState => ({ passwords: [], sessions: [], attempts: {} });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export function validatePassword(username: unknown, password: unknown): asserts username is string {
  if (typeof username !== "string" || !/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new Error("Username must be 3–40 letters, numbers, dots, underscores or hyphens.");
  if (typeof password !== "string" || password.length < 12 || password.length > 256) throw new Error("Password must be 12–256 characters.");
}
function identity(root: string, id: string): TeamMember | null {
  if (id === "owner") return { id, name: "Workspace owner", role: "owner", createdAt: "" };
  return teamMembers(root).find(member => member.id === id && !member.revokedAt) ?? null;
}
export function setPassword(root: string, id: string, username: string, password: string): void {
  validatePassword(username, password);
  if (!identity(root, id)) throw new Error("Active member not found.");
  const normalized = username.toLowerCase();
  const salt = randomBytes(16).toString("hex");
  const credential = { id, username: normalized, salt, hash: scryptSync(password, salt, 64).toString("hex"), version: randomBytes(16).toString("hex") };
  durableUpdate(root, "sessions", initial, state => {
    if (state.passwords.some(item => item.username === normalized && item.id !== id)) throw new Error("Username already in use.");
    state.passwords = state.passwords.filter(item => item.id !== id);
    state.passwords.push(credential);
    state.sessions = state.sessions.filter(item => item.id !== id);
    delete state.attempts[hash(normalized)];
  });
}
export function passwordUsernames(root: string): Record<string, string> {
  return Object.fromEntries(durableRead(root, "sessions", initial).passwords.map(item => [item.id, item.username]));
}
export function login(root: string, username: unknown, password: unknown): { token: string; identity: TeamMember } | null {
  if (typeof username !== "string" || typeof password !== "string" || username.length > 40 || password.length > 256) return null;
  const normalized = username.toLowerCase();
  return durableUpdate(root, "sessions", initial, state => {
    const now = Date.now();
    for (const [key, attempt] of Object.entries(state.attempts)) if (attempt.until <= now) delete state.attempts[key];
    // Global ceiling prevents unbounded random-username attempts as well as per-user guessing.
    const global = state.attempts["*"] ?? { count: 0, until: now + 15 * 60_000 };
    const attempt = state.attempts[hash(normalized)] ?? { count: 0, until: now + 15 * 60_000 };
    if (global.count >= 100 || attempt.count >= 10) return null;
    global.count++; attempt.count++;
    state.attempts["*"] = global; state.attempts[hash(normalized)] = attempt;
    const credential = state.passwords.find(item => item.username === normalized);
    const supplied = scryptSync(password, credential?.salt ?? "unknown-user", 64);
    if (!credential || !timingSafeEqual(supplied, Buffer.from(credential.hash, "hex"))) return null;
    const member = identity(root, credential.id);
    if (!member) return null;
    delete state.attempts[hash(normalized)];
    const token = randomBytes(32).toString("hex");
    state.sessions = state.sessions.filter(item => item.expires > now).slice(-999);
    state.sessions.push({ hash: hash(token), id: credential.id, version: credential.version, expires: now + SESSION_SECONDS * 1000 });
    return { token, identity: member };
  });
}
export function sessionIdentity(root: string, token: string): TeamMember | null {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const state = durableRead(root, "sessions", initial);
  const session = state.sessions.find(item => item.hash === hash(token) && item.expires > Date.now());
  if (!session || !state.passwords.some(item => item.id === session.id && item.version === session.version)) return null;
  return identity(root, session.id);
}
export function logout(root: string, token: string): void {
  durableUpdate(root, "sessions", initial, state => { state.sessions = state.sessions.filter(item => item.hash !== hash(token)); });
}
