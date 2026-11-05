import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { durableRead, durableUpdate } from "./util/durable";

export type TeamRole = "owner" | "editor" | "viewer";
export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  createdAt: string;
  revokedAt?: string;
}
interface Credential extends TeamMember {
  tokenHash: string;
}
interface Team {
  members: Credential[];
}

const empty = (): Team => ({ members: [] });
const digest = (token: string) => createHash("sha256").update(token).digest();
const publicMember = ({ tokenHash: _, ...member }: Credential): TeamMember => member;

export function teamMembers(root: string): TeamMember[] {
  return durableRead(root, "team", empty).members.map(publicMember);
}

export function createTeamMember(
  root: string,
  name: string,
  role: TeamRole,
): { member: TeamMember; token: string } {
  if (typeof name !== "string" || !name.trim() || name.length > 80) {
    throw new Error("Name must be 1–80 characters.");
  }
  if (!["owner", "editor", "viewer"].includes(role)) {
    throw new Error("Choose owner, editor or viewer.");
  }
  const token = randomBytes(32).toString("hex");
  const member: Credential = {
    id: randomUUID(),
    name: name.trim(),
    role,
    createdAt: new Date().toISOString(),
    tokenHash: digest(token).toString("hex"),
  };
  durableUpdate(root, "team", empty, (team) => {
    if (team.members.filter((member) => !member.revokedAt).length >= 100) {
      throw new Error("Team limit reached.");
    }
    team.members.push(member);
  });
  return { member: publicMember(member), token };
}

export function revokeTeamMember(root: string, id: string): boolean {
  return durableUpdate(root, "team", empty, (team) => {
    const member = team.members.find((member) => member.id === id);
    if (!member) return false;
    member.revokedAt ??= new Date().toISOString();
    return true;
  });
}

export function authenticateTeamMember(
  root: string,
  token: string,
  id?: string,
): TeamMember | null {
  if (!token || token.length > 256) return null;
  const supplied = digest(token);
  const member = durableRead(root, "team", empty).members.find(
    (member) =>
      !member.revokedAt &&
      (!id || member.id === id) &&
      timingSafeEqual(Buffer.from(member.tokenHash, "hex"), supplied),
  );
  return member ? publicMember(member) : null;
}
