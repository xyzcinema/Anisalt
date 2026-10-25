import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Play, Info } from "lucide-react";
import { getHome } from "@/lib/anime.functions";
import { Shell, Row, Loading } from "@/components/site";

const homeQ = queryOptions({ queryKey: ["home"], queryFn: () => getHome(), staleTime: 300_000 });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AniSalt — Watch Anime Online in Hindi, English & Japanese" },
      { name: "description", content: "Stream trending anime series and movies with multi-language audio." },
      { property: "og:title", content: "AniSalt — Watch Anime Online" },
      { property: "og:description", content: "Stream trending anime series and movies with multi-language audio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQ),
  pendingComponent: () => <Shell><Loading /></Shell>,
  component: Index,
});

function Index() {
  const { data } = useSuspenseQuery(homeQ);
  const heroes = data.slice(0, 7);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (heroes.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % heroes.length), 6000);
    return () => clearInterval(t);
  }, [heroes.length]);
  const hero = heroes[i];
  const series = data.filter((c) => c.type !== "movie");
  const movies = data.filter((c) => c.type === "movie");

  return (
    <Shell flush>
      {hero && (
        <section className="relative -mt-px min-h-[560px] overflow-hidden">
          {hero.image && (
            <img key={hero.link} src={hero.image} alt="" referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover object-top animate-in fade-in duration-700" />
          )}
          <div className="absolute inset-0 bg-hero-fade" />
          <div className="relative mx-auto flex min-h-[560px] max-w-7xl flex-col justify-end gap-4 px-4 pb-10">
            <span className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.2em] text-primary">
              <span className="h-1 w-8 rounded-full bg-primary" /> Trending #{i + 1}
            </span>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight md:text-6xl">{hero.title}</h1>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border border-primary/40 bg-accent px-3 py-1 font-semibold text-primary">HD</span>
              <span className="rounded-full border border-border bg-scrim px-3 py-1">{hero.type === "movie" ? "Movie" : "Series"}</span>
              <span className="rounded-full border border-border bg-scrim px-3 py-1">Hindi · Eng · Jap</span>
            </div>
            <div className="flex gap-3">
              <Link to="/series" search={{ url: hero.link }}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 font-bold text-primary-foreground shadow-glow transition hover:scale-105">
                <Play className="h-5 w-5 fill-current" /> Play
              </Link>
              <Link to="/series" search={{ url: hero.link }}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-scrim px-6 py-3 font-semibold">
                <Info className="h-5 w-5" /> Details
              </Link>
            </div>
            <div className="flex gap-2 pt-2">
              {heroes.map((h, n) => (
                <button key={h.link} aria-label={`Show ${h.title}`} onClick={() => setI(n)}
                  className={`h-1.5 rounded-full transition-all ${n === i ? "w-14 bg-primary" : "w-5 bg-muted-foreground/50"}`} />
              ))}
            </div>
          </div>
        </section>
      )}
      <div className="mx-auto max-w-7xl pt-4">
        <Row title="Trending Now" subtitle="What everyone is watching today" items={data.slice(0, 16)} />
        <Row title="Popular Series" subtitle="Binge-worthy shows with every episode" items={series} />
        <Row title="Blockbuster Anime Movies" subtitle="Cinematic masterpieces and standalone adventures" items={movies} />
        <Row title="Fresh Picks" subtitle="Hand-picked titles to discover next" items={data.slice(16)} />
      </div>
    </Shell>
  );
}
