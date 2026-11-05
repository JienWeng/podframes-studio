import { createHash, timingSafeEqual } from "node:crypto";
import { sessionIdentity } from "../../../packages/core/src/sessions";
import { authenticateTeamMember, type TeamMember, type TeamRole } from "../../../packages/core/src/team";


export function automationAuthorization(
  request: Request,
  token: string | undefined,
  root?: string,
): Response | null {
  if (root) {
    const member = memberIdentity(request, root, false);
    if (member) return roleDenied(request, member.role);
  }
  if (!token || token.length < 32)
    return new Response(
      "Set PODFRAMES_API_TOKEN to a random token of at least 32 characters on the server.",
      { status: 503 },
    );
  const supplied =
    request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? "";
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(token), hash(supplied)))
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  return null;
}

export function cookieValue(request: Request, name: string): string {
  return request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
export function memberIdentity(request: Request, root: string, allowSession = true): TeamMember | null {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer (.+)$/i)?.[1];
  if (bearer) return authenticateTeamMember(root, bearer);
  const basic = authorization.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)?.[1];
  if (!basic) return !authorization && allowSession ? sessionIdentity(root, cookieValue(request, "podframes_session")) : null;
  const decoded = Buffer.from(basic, "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  return authenticateTeamMember(root, decoded.slice(colon + 1), decoded.slice(0, colon));
}
export function roleDenied(request: Request, role: TeamRole): Response | null {
  const path = new URL(request.url).pathname;
  if (role !== "owner" && (path === "/api/team" || path.startsWith("/api/team/") && path !== "/api/team/me")) return new Response("Owner access required", { status: 403 });
  if (role === "viewer" && !["GET", "HEAD", "OPTIONS"].includes(request.method)) return new Response("Viewer access is read-only", { status: 403 });
  return null;
}
