import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Play } from "lucide-react";
import { getSeries, getSeason } from "@/lib/anime.functions";
import { Shell, Loading } from "@/components/site";

const sq = (url: string) => queryOptions({ queryKey: ["series", url], queryFn: () => getSeries({ data: { url } }), staleTime: 300_000 });

export const Route = createFileRoute("/series")({
  validateSearch: z.object({ url: z.string().catch("") }),
  loaderDeps: ({ search }) => ({ url: search.url }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(sq(deps.url)),
  head: ({ loaderData }) => {
    const t = loaderData?.title ? `${loaderData.title} — AniSalt` : "Anime — AniSalt";
    const d = loaderData?.overview?.slice(0, 155) || "Watch all episodes online.";
    return { meta: [{ title: t }, { name: "description", content: d }, { property: "og:title", content: t }, { property: "og:description", content: d }] };
  },
  pendingComponent: () => <Shell><Loading /></Shell>,
  errorComponent: () => <Shell><p className="py-24 text-center text-muted-foreground">Couldn't load this title. Try again later.</p></Shell>,
  component: SeriesPage,
});

function SeriesPage() {
  const { url } = Route.useSearch();
  const { data: s } = useSuspenseQuery(sq(url));
  const first = s.seasons[0];
  const [season, setSeason] = useState(first?.seasonNum ?? "");
  const active = s.seasons.find((x) => x.seasonNum === season);
  const extra = useQuery({
    queryKey: ["season", active?.postId, season],
    queryFn: () => getSeason({ data: { postId: active!.postId!, season } }),
    enabled: !!active?.postId && season !== first?.seasonNum,
  });
  const episodes = season === first?.seasonNum || !first ? s.episodes : extra.data ?? [];

  return (
    <Shell>
      <section className="relative mb-10 overflow-hidden rounded-2xl border border-border">
        {(s.backdrop || s.poster) && (
          <img src={s.backdrop || s.poster!} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        )}
        <div className="absolute inset-0 bg-hero-fade" />
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:p-10">
          {s.poster && <img src={s.poster} alt={s.title} referrerPolicy="no-referrer" className="w-40 shrink-0 rounded-xl shadow-glow md:w-52" />}
          <div className="flex flex-col justify-end gap-3">
            <h1 className="text-3xl font-extrabold md:text-5xl">{s.title}</h1>
            {s.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {s.genres.map((g) => <span key={g} className="rounded-full bg-secondary px-3 py-1 text-xs">{g}</span>)}
              </div>
            )}
            {s.overview && <p className="max-w-3xl text-sm text-muted-foreground">{s.overview}</p>}
            {s.isMovie && (
              <Link to="/watch" search={{ url }} className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-glow">
                <Play className="h-4 w-4 fill-current" /> Watch movie
              </Link>
            )}
          </div>
        </div>
      </section>

      {s.seasons.length > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {s.seasons.map((x) => (
            <button key={x.seasonNum} onClick={() => setSeason(x.seasonNum)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${x.seasonNum === season ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted"}`}>
              {x.name}
            </button>
          ))}
        </div>
      )}

      {extra.isFetching ? <Loading /> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {episodes.map((e) => (
            <Link key={e.link} to="/watch" search={{ url: e.link, series: url }} className="group overflow-hidden rounded-lg border border-border bg-card">
              <div className="relative aspect-video bg-muted">
                {e.image && <img src={e.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition group-hover:scale-105" />}
                <span className="absolute bottom-2 left-2 rounded bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">EP {e.epNum}</span>
              </div>
              <p className="line-clamp-1 p-3 text-sm font-medium">{e.title}</p>
            </Link>
          ))}
        </div>
      )}
      {!s.isMovie && !episodes.length && !extra.isFetching && <p className="text-muted-foreground">No episodes available.</p>}
    </Shell>
  );
}
