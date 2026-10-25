import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ChevronLeft, ChevronRight, Download, Play } from "lucide-react";
import { getStreams, getSeries, getSeason } from "@/lib/anime.functions";
import { Shell, Loading } from "@/components/site";

const wq = (url: string) => queryOptions({ queryKey: ["watch", url], queryFn: () => getStreams({ data: { url } }) });
const sq = (url: string) => queryOptions({ queryKey: ["series", url], queryFn: () => getSeries({ data: { url } }), staleTime: 300_000 });

export const Route = createFileRoute("/watch")({
  validateSearch: z.object({ url: z.string().catch(""), series: z.string().optional() }),
  loaderDeps: ({ search }) => ({ url: search.url }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(wq(deps.url)),
  head: ({ loaderData }) => {
    const t = loaderData?.title ? `Watch ${loaderData.title} — AniSalt` : "Watch — AniSalt";
    return { meta: [{ title: t }, { name: "description", content: "Stream this episode online." }, { property: "og:title", content: t }, { property: "og:description", content: "Stream this episode online." }] };
  },
  pendingComponent: () => <Shell><Loading /></Shell>,
  errorComponent: () => <Shell><p className="py-24 text-center text-muted-foreground">Couldn't load this episode. Try again later.</p></Shell>,
  component: WatchPage,
});

function WatchPage() {
  const { url, series } = Route.useSearch();
  const { data } = useSuspenseQuery(wq(url));
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [url]);
  const cur = data.streams[idx];

  return (
    <Shell>
      {series && (
        <Link to="/series" search={{ url: series }} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Back to details
        </Link>
      )}
      <div className="-mx-4 aspect-video overflow-hidden bg-card sm:mx-0 sm:rounded-2xl sm:border sm:border-border sm:shadow-glow">
        {cur ? (
          <iframe key={cur.link} src={cur.link} className="h-full w-full" allowFullScreen allow="autoplay; encrypted-media; fullscreen" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">No player available for this episode.</div>
        )}
      </div>

      <h1 className="mt-4 text-xl font-bold md:text-2xl">{data.title}</h1>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
        {data.streams.map((s, i) => (
          <button key={s.link + i} onClick={() => setIdx(i)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${i === idx ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted"}`}>
            {s.server}{s.language !== "Default" ? ` · ${s.language}` : ""}
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-between gap-2">
        {data.prev ? (
          <Link to="/watch" search={{ url: data.prev, series }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-4 py-2 text-sm font-semibold"><ChevronLeft className="h-4 w-4" /> Previous</Link>
        ) : <span />}
        {data.next && (
          <Link to="/watch" search={{ url: data.next, series }} className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Next <ChevronRight className="h-4 w-4" /></Link>
        )}
      </div>

      {series && <EpisodeList series={series} current={url} />}

      {data.downloads.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-xl font-bold">Downloads</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.downloads.map((d, i) => (
              <a key={i} href={d.link} target="_blank" rel="noreferrer noopener"
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm hover:border-primary">
                <span>{d.server} · {d.language} · {d.quality}</span>
                <Download className="h-4 w-4 text-primary" />
              </a>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

function EpisodeList({ series, current }: { series: string; current: string }) {
  const s = useQuery(sq(series));
  const first = s.data?.seasons[0];
  const [season, setSeason] = useState<string | null>(null);
  const sel = season ?? first?.seasonNum ?? "";
  const active = s.data?.seasons.find((x) => x.seasonNum === sel);
  const extra = useQuery({
    queryKey: ["season", active?.postId, sel],
    queryFn: () => getSeason({ data: { postId: active!.postId!, season: sel } }),
    enabled: !!active?.postId && sel !== first?.seasonNum,
  });

  if (s.isLoading) return <Loading />;
  if (!s.data) return null;
  const episodes = !first || sel === first.seasonNum ? s.data.episodes : extra.data ?? [];

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold">Episodes</h2>
          <p className="text-sm text-muted-foreground">{s.data.title}</p>
        </div>
        <span className="text-sm font-semibold text-primary">{episodes.length} EP</span>
      </div>
      {s.data.seasons.length > 1 && (
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
          {s.data.seasons.map((x) => (
            <button key={x.seasonNum} onClick={() => setSeason(x.seasonNum)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${x.seasonNum === sel ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted"}`}>
              {x.name}
            </button>
          ))}
        </div>
      )}
      {extra.isFetching ? <Loading /> : (
        <div className="flex flex-col gap-2">
          {episodes.map((e) => {
            const on = e.link === current;
            return (
              <Link key={e.link} to="/watch" search={{ url: e.link, series }}
                className={`flex items-center gap-3 rounded-2xl border p-2 transition ${on ? "border-primary bg-accent" : "border-border bg-card hover:border-primary/60"}`}>
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {e.image && <img src={e.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />}
                  <span className="absolute inset-0 grid place-items-center bg-scrim/40">
                    <Play className={`h-6 w-6 fill-current ${on ? "text-primary" : "text-foreground"}`} />
                  </span>
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${on ? "text-primary" : "text-muted-foreground"}`}>EP {e.epNum}{on ? " · Now playing" : ""}</p>
                  <p className="line-clamp-2 text-sm font-semibold">{e.title || `Episode ${e.epNum}`}</p>
                </div>
              </Link>
            );
          })}
          {!episodes.length && <p className="text-sm text-muted-foreground">No episodes available.</p>}
        </div>
      )}
    </section>
  );
}
