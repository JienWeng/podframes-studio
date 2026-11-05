"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function SessionControl() {
  const [identity, setIdentity] = useState<{name:string;role:string}|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(() => { void fetch("/api/auth/me",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(data=>setIdentity(data?.identity??null)).catch(()=>{}); },[]);
  async function logout() { setBusy(true); try { const response=await fetch("/api/auth/logout",{method:"POST"}); if(!response.ok) throw new Error(); window.location.assign("/login"); } catch {setError("Could not sign out. Try again.");setBusy(false);} }
  return <div className="session-control flex min-w-0 flex-wrap items-center gap-3 text-sm">{identity ? <><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{identity.name}</span><span className="mt-0.5 block text-xs capitalize text-[var(--color-text-muted)]">{identity.role}</span></span><button disabled={busy} className="btn btn-ghost min-h-11 px-3 text-xs" onClick={()=>void logout()}>Sign out</button></> : <Link href="/login" className="btn btn-ghost min-h-11 px-3 text-xs">Sign in</Link>}{error&&<span role="alert" className="w-full text-xs text-[var(--color-danger)]">{error}</span>}</div>;
}
