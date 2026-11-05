import { NextResponse } from "next/server";
import { SESSION_SECONDS } from "../../../packages/core/src/sessions";
export function authOriginDenied(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  if (!origin) return false;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    return source.origin !== origin || source.protocol !== target.protocol || source.host !== (request.headers.get("host") ?? target.host);
  } catch { return true; }
}
export function sessionCookie(response: NextResponse, request: Request, token: string, signedOut = false): void {
  const secure = new URL(request.url).protocol === "https:";
  const options = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };
  response.cookies.set("podframes_session", token, { ...options, maxAge: token ? SESSION_SECONDS : 0 });
  response.cookies.set("podframes_signed_out", signedOut ? "1" : "", { ...options, maxAge: signedOut ? SESSION_SECONDS : 0 });
}
