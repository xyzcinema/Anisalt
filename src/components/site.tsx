import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Bell, Home, Compass, Bookmark, User, Tv } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Card } from "@/lib/anime.functions";

export function Shell({ children, flush }: { children: ReactNode; flush?: boolean }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-primary"><Tv className="h-5 w-5" /></span>
            <span className="relative font-display text-xl font-bold tracking-tight">
              AniSalt
              <span className="absolute -top-2 -right-9 text-[10px] font-bold tracking-widest text-primary">.TV</span>
            </span>
          </Link>
          <form
            className="ml-auto flex min-w-0 max-w-md flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) nav({ to: "/search", search: { q: q.trim() } });
            }}
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search anime..."
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </form>
          <button aria-label="Notifications" className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
          </button>
        </div>
      </header>
      <main className={flush ? "" : "mx-auto max-w-7xl px-4 py-6"}>{children}</main>

    </div>
  );
}

function BottomNav() {
  const item = "flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground";
  const active = { className: "text-primary" };
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-lg">
      <div className="relative flex items-center rounded-3xl border border-border bg-card/90 px-2 backdrop-blur-md">
        <Link to="/" className={item} activeProps={active} activeOptions={{ exact: true }}><Home className="h-5 w-5" />Home</Link>
        <Link to="/search" search={{ q: "" }} className={item}><Compass className="h-5 w-5" />Browse</Link>
        <div className="flex-1" />
        <Link to="/search" search={{ q: "" }} aria-label="Search"
          className="absolute left-1/2 -top-5 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
          <Search className="h-7 w-7" />
        </Link>
        <span className={item}><Bookmark className="h-5 w-5" />List</span>
        <span className={item}><User className="h-5 w-5" />You</span>
      </div>
    </nav>
  );
}

export function PosterCard({ c, wide }: { c: Card; wide?: boolean }) {
  return (
    <Link to="/series" search={{ url: c.link }} className={`group block shrink-0 ${wide ? "" : "w-36 sm:w-44"}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-muted">
        {c.image && (
          <img src={c.image} alt={c.title} loading="lazy" referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        )}
        <span className="absolute left-2 top-2 rounded-full bg-scrim px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
          {c.type === "movie" ? "Movie" : "TV"}
        </span>
      </div>
      <p className="mt-2 line-clamp-1 text-sm font-semibold">{c.title}</p>
      <p className="text-xs text-muted-foreground">{c.type === "movie" ? "Movie" : "Series"}</p>
    </Link>
  );
}

export function Row({ title, subtitle, items }: { title: string; subtitle?: string; items: Card[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-end justify-between px-4">
        <div>
          <h2 className="text-xl font-bold md:text-2xl">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
        {items.map((c) => <PosterCard key={c.link} c={c} />)}
      </div>
    </section>
  );
}

export function Grid({ items }: { items: Card[] }) {
  if (!items.length) return <p className="py-16 text-center text-muted-foreground">Nothing found.</p>;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {items.map((c) => <PosterCard key={c.link} c={c} wide />)}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-24">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-secondary border-t-primary" />
    </div>
  );
}
