import Link from "next/link";
import { SessionControl } from "@/components/SessionControl";
import { Wordmark } from "@/components/Wordmark";

export function StudioSidebar({ library = false, section }: { library?: boolean; section?: "cast" | "series" | "team" }) {
  return (
    <aside className="studio-sidebar">
      <Link href="/" aria-label="Podframes home"><Wordmark /></Link>
      <nav aria-label="Studio navigation">
        <Link href="/studio?new=1" aria-current={!library && !section ? "page" : undefined}>＋ Create</Link>
        <Link href="/studio" aria-current={library ? "page" : undefined}>Your videos</Link>
        <Link href="/studio/cast" aria-current={section === "cast" ? "page" : undefined}>Cast</Link>
        <Link href="/studio/series" aria-current={section === "series" ? "page" : undefined}>Series</Link>
        <Link href="/studio/team" aria-current={section === "team" ? "page" : undefined}>Team</Link>
      </nav>
      <SessionControl />
      <p className="sidebar-note">Your cast.<br />Your conversation.<br />Your next episode.</p>
    </aside>
  );
}
