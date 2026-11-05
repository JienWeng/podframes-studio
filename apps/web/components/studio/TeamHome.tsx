"use client";
import { useEffect, useState, type FormEvent } from "react";
import { StudioSidebar } from "./wizard/StudioSidebar";
import { inputClass } from "./wizard/ui";
type Role = "owner" | "editor" | "viewer";
type Member = { id: string; name: string; role: Role; createdAt: string; revokedAt?: string };
type Identity = { id: string; name: string; role: Role };
export function TeamHome() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ member: Member; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  async function refresh() {
    const me = await fetch("/api/team/me", { cache: "no-store" });
    if (!me.ok) throw new Error("Unable to load your team access.");
    const data = await me.json();
    const current = data.identity ?? data;
    setIdentity(current);
    if (current.role === "owner") {
      const result = await fetch("/api/team", { cache: "no-store" });
      if (!result.ok) throw new Error("Unable to load members.");
      setMembers((await result.json()).members);
    }
  }
  useEffect(() => { const timer = setTimeout(() => { void refresh().catch(e => setError(String(e.message))); }, 0); return () => clearTimeout(timer); }, []);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError(""); setIssued(null); setCopied(false);
    try {
      const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: data.get("name"), role: data.get("role"), username: data.get("username"), password: data.get("password") }) });
      if (!response.ok) throw new Error("Could not add member. Check your owner access and member name.");
      setIssued(await response.json()); form.reset(); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add member."); } finally { setBusy(false); }
  }
  async function credentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=event.currentTarget;const data=new FormData(form);setBusy(true);setError("");
    try {const response=await fetch("/api/team",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:data.get("id"),username:data.get("username"),password:data.get("password")})});if(!response.ok)throw new Error("Could not save login. Use a unique username and a password of at least 12 characters.");form.reset();window.alert("Login saved. Existing sessions for this account have been signed out.");}catch(e){setError(e instanceof Error?e.message:"Could not save login.");}finally{setBusy(false);}
  }
  async function revoke(member: Member) {
    if (!window.confirm(`Revoke ${member.name}'s access? Their future requests will be denied.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/team?id=${encodeURIComponent(member.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not revoke this membership.");
      if (issued?.member.id === member.id) setIssued(null);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not revoke member."); } finally { setBusy(false); }
  }
  return <div className="studio-shell"><StudioSidebar section="team" /><main className="team-workspace mx-auto w-full max-w-5xl space-y-6 p-5 md:p-10">
    <header><h1 className="text-3xl font-bold tracking-tight">Team</h1><p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">Share this studio, its cast, episodes and provider credits with approved members.</p></header>
    {error && <p role="alert" className="rounded-xl border border-[var(--color-danger)] p-4 text-sm text-[var(--color-danger)]">{error}</p>}
    {!identity ? <p>Loading team access…</p> : <p className="text-sm text-[var(--color-text-muted)]">Manage access to your shared creative workspace.</p>}
    {identity && identity.role !== "owner" && <p>Only an owner can add or revoke members. {identity.role === "editor" ? "You can create and generate with the shared provider accounts; each generation does not need owner approval." : "Your access is read-only."}</p>}
    {identity?.role === "owner" && <>
      <form onSubmit={create} className="panel space-y-5 p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Add approved member</h2>
        <label className="block text-sm font-medium">Name<input name="name" required maxLength={100} className={`${inputClass} mt-2 w-full`} /></label>
        <label className="block text-sm font-medium">Access<select name="role" defaultValue="editor" className={`${inputClass} mt-2 w-full`}><option value="editor">Editor — create and generate</option><option value="viewer">Viewer — read only</option><option value="owner">Owner — manage members too</option></select></label>
        <label className="block text-sm font-medium">Username<input name="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" autoComplete="off" className={`${inputClass} mt-2 w-full`} /></label>
        <label className="block text-sm font-medium">Initial password<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className={`${inputClass} mt-2 w-full`} /></label>
        <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">Editors use this host’s shared credits without per-video owner approval. Owners can also grant access to others.</p>
        <button className="btn btn-primary min-h-11 px-5 text-sm" disabled={busy}>Add member</button>
      </form>
      {issued && <section className="panel space-y-4 border-[var(--color-accent)] p-5 sm:p-7" aria-live="polite"><h2 className="font-semibold">Save this API credential now</h2><p className="text-sm">The token is shown once. Share privately with this member; it cannot be retrieved later.</p><label className="block text-sm font-medium">Username<input readOnly value={issued.member.id} className={`${inputClass} mt-1 w-full`} /></label><label className="block text-sm font-medium">API token (separate from sign-in password)<input readOnly value={issued.token} className={`${inputClass} mt-1 w-full font-mono`} /></label><button className="btn btn-ghost min-h-11 px-4 text-sm" onClick={async () => { try { await navigator.clipboard.writeText(`Username: ${issued.member.id}\nPassword: ${issued.token}`); setCopied(true); } catch { setError("Clipboard unavailable. Select and copy the login fields above."); } }}>{copied ? "Copied" : "Copy login"}</button><button className="btn btn-ghost min-h-11 px-4 text-sm" onClick={() => setIssued(null)}>Dismiss saved login</button><p className="text-sm">Send the private Studio URL separately. The member first needs access to your Tailscale network, then signs in at /login using the username and initial password you set. These token fields are for API or legacy access.</p></section>}
      <form onSubmit={credentials} className="panel space-y-5 p-5 sm:p-7"><h2 className="text-lg font-semibold">Set or reset a sign-in</h2><p className="text-sm leading-relaxed text-[var(--color-text-muted)]">Configure the original owner login or reset a member. This signs out that account’s existing sessions.</p><label className="block text-sm font-medium">Account<select name="id" className={`${inputClass} mt-1 w-full`}><option value="owner">Original studio owner</option>{members.filter(m=>!m.revokedAt).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label className="block text-sm font-medium">Username<input name="username" required minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" autoComplete="off" className={`${inputClass} mt-1 w-full`} /></label><label className="block text-sm font-medium">New password<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" className={`${inputClass} mt-1 w-full`} /></label><button disabled={busy} className="btn btn-primary min-h-11 px-5 text-sm">Save login</button></form>
      <section className="pt-3"><h2 className="mb-4 text-lg font-semibold">Members</h2>{members.length === 0 ? <p>No additional members yet.</p> : <ul className="space-y-2">{members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 panel p-4 sm:p-5"><div><strong>{member.name}</strong><p className="text-sm leading-relaxed text-[var(--color-text-muted)]">{member.role} · {member.revokedAt ? "Revoked" : "Active"}</p></div>{!member.revokedAt && member.id !== identity.id && <button className="btn btn-ghost min-h-11 px-4 text-sm" disabled={busy} onClick={() => void revoke(member)}>Revoke</button>}</li>)}</ul>}</section>
    </>}
  </main></div>;
}
