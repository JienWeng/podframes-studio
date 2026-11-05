import { NextResponse } from "next/server";
import { login } from "../../../../../../packages/core/src/sessions";
import { findRepoRoot } from "@/lib/root";
import { authOriginDenied, sessionCookie } from "@/lib/browser-session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (authOriginDenied(request)) return new Response("Cross-origin login denied", { status: 403 });
  if (Number(request.headers.get("content-length")) > 4096) return new Response("Login request too large", { status: 413 });
  let input;
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return new Response("Login request too large", { status: 413 });
        }
        chunks.push(value);
      }
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return new Response("Invalid login", { status: 400 });
  }
  const result = login(findRepoRoot(), input?.username, input?.password);
  if (!result) return new Response("Unable to sign in. Check your credentials or try again later.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const response = NextResponse.json({ identity: result.identity }, { headers: { "Cache-Control": "no-store" } });
  sessionCookie(response, request, result.token);
  return response;
}
