import { passwordUsernames, setPassword, validatePassword } from "../../../../../packages/core/src/sessions";
import { createTeamMember, revokeTeamMember, teamMembers } from "../../../../../packages/core/src/team";
import { teamIdentity } from "@/lib/team-access";
import { findRepoRoot } from "@/lib/root";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function owner(request: Request) {
  return teamIdentity(request)?.role === "owner";
}

export async function GET(request: Request) {
  if (!owner(request)) return new Response("Owner access required", { status: 403 });
  return Response.json(
    { identity: teamIdentity(request), members: teamMembers(findRepoRoot()).map(member => ({ ...member, username: passwordUsernames(findRepoRoot())[member.id] })), usernames: passwordUsernames(findRepoRoot()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!owner(request)) return new Response("Owner access required", { status: 403 });
  try {
    const { name, role, username, password } = await request.json();
    if (username !== undefined || password !== undefined) validatePassword(username, password);
    const created = createTeamMember(findRepoRoot(), name, role);
    try {
      if (username !== undefined) setPassword(findRepoRoot(), created.member.id, username, password);
    } catch (error) {
      revokeTeamMember(findRepoRoot(), created.member.id);
      throw error;
    }
    return Response.json(created, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid member", { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const identity = teamIdentity(request);
  if (identity?.role !== "owner") return new Response("Owner access required", { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || id === identity.id) return new Response("Choose another member to revoke", { status: 400 });
  return revokeTeamMember(findRepoRoot(), id)
    ? Response.json({ ok: true })
    : new Response("Member not found", { status: 404 });
}

export async function PATCH(request: Request) {
  if (!owner(request)) return new Response("Owner access required", { status: 403 });
  try {
    const { id, username, password } = await request.json();
    setPassword(findRepoRoot(), id, username, password);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid credential", { status: 400 });
  }
}
