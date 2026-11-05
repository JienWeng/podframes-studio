import { teamIdentity } from "@/lib/team-access";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return Response.json({ identity: teamIdentity(request) }, { headers: { "Cache-Control": "no-store" } });
}
