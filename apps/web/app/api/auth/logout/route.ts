import { NextResponse } from "next/server";
import { logout } from "../../../../../../packages/core/src/sessions";
import { findRepoRoot } from "@/lib/root";
import { cookieValue } from "@/lib/api-auth";
import { authOriginDenied, sessionCookie } from "@/lib/browser-session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (authOriginDenied(request)) return new Response("Cross-origin logout denied", { status: 403 });
  logout(findRepoRoot(), cookieValue(request, "podframes_session"));
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  sessionCookie(response, request, "", true);
  return response;
}
