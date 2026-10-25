import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { searchAnime } from "@/lib/anime.functions";
import { Shell, Grid, Loading } from "@/components/site";

const q = (s: string) => queryOptions({ queryKey: ["search", s], queryFn: () => searchAnime({ data: { q: s } }) });

export const Route = createFileRoute("/search")({
  validateSearch: z.object({ q: z.string().catch("") }),
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ context, deps }) => (deps.q ? context.queryClient.ensureQueryData(q(deps.q)) : []),
  head: () => ({
    meta: [
      { title: "Search anime — AniSalt" },
      { name: "description", content: "Find anime series and movies to stream." },
      { property: "og:title", content: "Search anime — AniSalt" },
      { property: "og:description", content: "Find anime series and movies to stream." },
    ],
  }),
  pendingComponent: () => <Shell><Loading /></Shell>,
  component: SearchPage,
});

function SearchPage() {
  const { q: term } = Route.useSearch();
  return (
    <Shell>
      <h1 className="mb-6 text-3xl font-bold">Results for “{term}”</h1>
      {term ? <Results term={term} /> : null}
    </Shell>
  );
}

function Results({ term }: { term: string }) {
  const { data } = useSuspenseQuery(q(term));
  return <Grid items={data} />;
}
