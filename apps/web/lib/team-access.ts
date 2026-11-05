import { createHash, timingSafeEqual } from "node:crypto";
import { ensureEnvLoaded } from "@podframes/core";
import { memberIdentity, cookieValue } from "./api-auth";
import { localRequest } from "./local-access";
import { findRepoRoot } from "./root";

export function teamIdentity(request: Request) {
  const root = findRepoRoot();
  ensureEnvLoaded(root);
  const member = memberIdentity(request, root);
  if (member) return member;

  const token = process.env.PODFRAMES_API_TOKEN;
  if (!token || token.length < 32) return null;
  const owner = { id: "owner", name: "Workspace owner", role: "owner" as const };
  if (
    !request.headers.has("authorization") &&
    !cookieValue(request, "podframes_session") &&
    !cookieValue(request, "podframes_signed_out") &&
    process.env.PODFRAMES_LOCAL_ONLY === "true" &&
    localRequest(request)
  ) return owner;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.match(/^Bearer (.+)$/i)?.[1];
  const basic = auth.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)?.[1];
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (bearer && timingSafeEqual(hash(bearer), hash(token))) return owner;
  if (
    basic &&
    timingSafeEqual(
      hash(Buffer.from(basic, "base64").toString("utf8")),
      hash(`podframes:${token}`),
    )
  ) return owner;
  return null;
}
