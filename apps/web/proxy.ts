import { createHash, timingSafeEqual } from "node:crypto";
import { ensureEnvLoaded } from "@podframes/core";
import { NextResponse, type NextRequest } from "next/server";
import { memberIdentity, roleDenied, cookieValue } from "./lib/api-auth";
import { localRequest } from "./lib/local-access";
import { findRepoRoot } from "./lib/root";
import { generationAdmission } from "./lib/usage-limits";

ensureEnvLoaded(findRepoRoot());

function authorizedResponse(request: NextRequest): NextResponse {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);
    let sameOrigin = !origin;
    if (origin) {
      try {
        const source = new URL(origin);
        sameOrigin =
          source.origin === origin &&
          source.protocol === url.protocol &&
          source.host === (request.headers.get("host") ?? url.host);
      } catch {
        sameOrigin = false;
      }
    }
    if (request.headers.get("sec-fetch-site") === "cross-site" || !sameOrigin) {
      return new NextResponse("Cross-origin mutation denied", {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }
  try {
    const denied = generationAdmission(findRepoRoot(), request);
    if (denied)
      return new NextResponse(denied.body, {
        status: denied.status,
        headers: denied.headers,
      });
  } catch {
    return new NextResponse(
      "Generation admission unavailable. No generation was started.",
      { status: 503 },
    );
  }
  return NextResponse.next();
}

export function proxy(request: NextRequest): NextResponse {
  const path = new URL(request.url).pathname;
  if (path === "/login" || path.startsWith("/_next/static/") || path === "/icon.png" || ["/api/auth/login", "/api/auth/logout", "/api/auth/me"].includes(path)) return authorizedResponse(request);
  const token = process.env.PODFRAMES_API_TOKEN;
  const member = memberIdentity(request, findRepoRoot(), !path.startsWith("/api/v1/"));
  if (member) {
    const denied = roleDenied(request, member.role);
    return denied ? new NextResponse("Forbidden", { status: 403 }) : authorizedResponse(request);
  }
  if (
    !request.headers.has("authorization") &&
    !cookieValue(request, "podframes_session") &&
    !cookieValue(request, "podframes_signed_out") &&
    (!token || token.length >= 32) &&
    !new URL(request.url).pathname.startsWith("/api/v1/") &&
    process.env.PODFRAMES_LOCAL_ONLY === "true" &&
    localRequest(request)
  )
    return authorizedResponse(request);
  if (!token || token.length < 32) {
    return new NextResponse(
      "Set PODFRAMES_API_TOKEN to a random token of at least 32 characters on the server.",
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (bearer && timingSafeEqual(createHash("sha256").update(token).digest(), createHash("sha256").update(bearer).digest())) return authorizedResponse(request);
  const basic = request.headers
    .get("authorization")
    ?.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)?.[1];
  if (basic) {
    const expected = createHash("sha256").update(`podframes:${token}`).digest();
    const supplied = createHash("sha256")
      .update(Buffer.from(basic, "base64"))
      .digest();
    if (timingSafeEqual(expected, supplied)) return authorizedResponse(request);
  }
  if (request.method === "GET" && !path.startsWith("/api/") && request.headers.get("accept")?.includes("text/html")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Podframes", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}
