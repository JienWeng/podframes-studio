"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { inputClass } from "@/components/studio/wizard/ui";
export default function LoginPage() {
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");const form=new FormData(event.currentTarget);
    try { const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:form.get("username"),password:form.get("password")})});
      if(!response.ok) throw new Error("Could not sign in. Check your username and password.");
      window.location.assign("/studio");
    }catch(e){setError(e instanceof Error?e.message:"Could not sign in.");setBusy(false);}
  }
  return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12 sm:px-8"><Link href="/" className="mb-10 self-start" aria-label="Podframes home"><Wordmark /></Link><section className="panel p-6 sm:p-9"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--color-accent)]">Your shared studio</p><h1 className="text-3xl font-bold tracking-tight">Welcome back</h1><p className="mb-7 mt-3 text-sm leading-relaxed text-[var(--color-text-muted)]">Sign in to your shared studio. Your team’s cast, videos and provider accounts are ready here.</p><form onSubmit={submit} className="space-y-4"><label className="block text-sm font-medium">Username<input name="username" autoComplete="username" required className={`${inputClass} mt-2 w-full`} /></label><label className="block text-sm font-medium">Password<input name="password" type="password" autoComplete="current-password" required className={`${inputClass} mt-2 w-full`} /></label>{error&&<p role="alert" className="rounded-xl border border-[var(--color-danger)] p-3 text-sm text-[var(--color-danger)]">{error}</p>}<button disabled={busy} className="btn btn-primary min-h-11 w-full px-5 text-sm">{busy?"Signing in…":"Sign in"}</button></form></section><p className="mt-6 text-sm leading-relaxed text-[var(--color-text-muted)]">Need access or a password reset? Ask your studio owner. First-time owners can configure their login from Team on the host using existing owner access.</p></main>;
}
