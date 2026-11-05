import { teamIdentity } from "@/lib/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = teamIdentity(request);
  return identity
    ? Response.json({ identity }, { headers: { "Cache-Control": "no-store" } })
    : new Response("Unauthorized", { status: 401 });
}
