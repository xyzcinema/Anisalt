import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as cheerio from "cheerio/slim";

const SALT = "https://animesalt.cx";
const TOON = "https://toonstream.us";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type Source = "salt" | "toon";
export type Card = { title: string; link: string; image: string | null; type: string; source: Source };
export type Episode = { epNum: string; title: string; link: string; image: string | null };
export type Season = { name: string; seasonNum: string; postId?: string };
export type Stream = { server: string; language: string; link: string };
export type Download = { server: string; language: string; quality: string; link: string };


// Live content API (see anime-api docs). Tried first; built-in scraper is the fallback.
export const ANIME_API = "https://anime-api-twvv.onrender.com/api";
type ApiItem = { title?: string; anime_id?: string; poster?: string | null; season?: string | number; episode?: string | number };

export async function api<T = any>(path: string, timeoutMs = 15000): Promise<T> {
  const res = await fetch(`${ANIME_API}${path}`, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json || json.success === false) throw new Error(json?.message || `API error ${res.status}`);
  return json as T;
}

export function apiToCards(items: ApiItem[] | undefined): Card[] {
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const it of items ?? []) {
    if (!it?.anime_id || seen.has(it.anime_id)) continue;
    seen.add(it.anime_id);
    out.push({ title: it.title || it.anime_id, link: `${SALT}/series/${it.anime_id}/`, image: it.poster ? String(it.poster).replace(/\\\//g, "/") : null, type: "Series", source: "salt" });
  }
  return out;
}

const idFrom = (url: string, kind: "series" | "episode") => {
  const m = new URL(url).pathname.match(new RegExp(`/${kind}/([^/]+)`));
  return m?.[1] ?? null;
};

async function get(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, Accept: "text/html,*/*", "Accept-Language": "en-US,en;q=0.9", Referer: SALT, ...(init?.headers || {}) },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`The anime source is not responding right now (${res.status}). Please try again shortly.`);
  return res.text();
}

const abs = (u: string | undefined, base: string) => {
  if (!u) return null;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("/")) return base + u;
  return u;
};

function allowed(url: string) {
  const h = new URL(url).hostname;
  return h.endsWith("animesalt.cx") || h.startsWith("toonstream") || h.includes("toon-stream");
}

function parseCards($: cheerio.CheerioAPI, base: string, source: Source): Card[] {
  const out: Card[] = [];
  const seen = new Set<string>();
  $("article.post").each((_, el) => {
    const a = $(el).find("a.lnk-blk").attr("href");
    const link = abs(a, base);
    if (!link || !/\/(series|movies)\//.test(link) || seen.has(link)) return;
    const title = $(el).find(".entry-title").first().text().trim() || $(el).find("img").attr("alt")?.replace(/^Image\s*/, "").trim() || "";
    if (!title) return;
    seen.add(link);
    const img = $(el).find("img");
    out.push({
      title,
      link,
      image: abs(img.attr("data-src") || img.attr("src"), base),
      type: link.includes("/movies/") ? "movie" : "series",
      source,
    });
  });
  return out;
}

export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const r = await api<{ results: ApiItem[] }>("/newadded");
    const cards = apiToCards(r.results);
    if (cards.length) return cards.slice(0, 48);
  } catch { /* fall back */ }
  try {
    const $ = cheerio.load(await get(SALT + "/"));
    return parseCards($, SALT, "salt").slice(0, 48);
  } catch {
    return [] as Card[];
  }
});

export const searchAnime = createServerFn({ method: "GET" })
  .inputValidator((d: { q: string }) => z.object({ q: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const q = encodeURIComponent(data.q);
    try {
      const r = await api<{ results: { results?: ApiItem[] } | ApiItem[] }>(`/search?s=${q}&page=1`);
      const list = Array.isArray(r.results) ? r.results : r.results?.results;
      const cards = apiToCards(list);
      if (cards.length) return cards;
    } catch { /* fall back */ }
    const [a, b] = await Promise.all([
      get(`${SALT}/?s=${q}`).then((h) => parseCards(cheerio.load(h), SALT, "salt")).catch(() => []),
      get(`${TOON}/?s=${q}`).then((h) => parseCards(cheerio.load(h), TOON, "toon")).catch(() => []),
    ]);
    return [...a, ...b];
  });

function parseEpisodes($: cheerio.CheerioAPI, base: string): Episode[] {
  const eps: Episode[] = [];
  $("li").each((i, el) => {
    const link = abs($(el).find("a.lnk-blk").attr("href"), base);
    if (!link || !link.includes("/episode")) return;
    const img = $(el).find("img");
    eps.push({
      epNum: $(el).find(".num-epi").text().trim() || String(i + 1),
      title: $(el).find(".entry-title, .entry-title1").first().text().trim(),
      link,
      image: abs(img.attr("data-src") || img.attr("src"), base),
    });
  });
  return eps;
}

export const getSeries = createServerFn({ method: "GET" })
  .inputValidator((d: { url: string }) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    if (!allowed(data.url)) throw new Error("Unsupported source");
    const base = new URL(data.url).origin;
    const sid = idFrom(data.url, "series");
    let html: string | null = null;
    try { html = await get(data.url); } catch (e) {
      if (!sid) throw e;
      const info = (await api<{ data: any }>(`/info?id=${sid}`)).data ?? {};
      const total = Number(info.seasons) || 1;
      const ep = await api<{ results: { episodes?: ApiItem[] } }>(`/episode?id=${sid}&season=1`).catch(() => null);
      return {
        title: info.title || sid, overview: info.overview || "", poster: info.poster || null, backdrop: info.poster || null,
        genres: (info.genres ?? []).slice(0, 6) as string[], isMovie: false,
        seasons: Array.from({ length: total }, (_, i) => ({ name: `Season ${i + 1}`, seasonNum: String(i + 1) })) as Season[],
        episodes: (ep?.results?.episodes ?? []).map((e) => ({
          epNum: String(e.episode ?? ""), title: e.title || `Episode ${e.episode}`,
          link: `${SALT}/episode/${sid}-${e.season ?? 1}x${e.episode}/`, image: e.poster ?? null,
        })) as Episode[],
      };
    }
    const $ = cheerio.load(html);
    const seasons: Season[] = [];
    $(".season-btn").each((_, el) => {
      const s = $(el).attr("data-season");
      if (s) seasons.push({ name: $(el).text().trim(), seasonNum: s, postId: $(el).attr("data-post") ?? "" });
    });
    const img = $(".post-thumbnail img").first();
    const back = $(".bghd img").first();
    const genres: string[] = [];
    $(".genres a, .entry-meta .genres a").each((_, el) => { genres.push($(el).text().trim()); });
    const isMovie = data.url.includes("/movies/");
    return {
      title: $("h1").first().text().trim(),
      overview: $(".description p, .entry-content p").first().text().trim(),
      poster: abs(img.attr("data-src") || img.attr("src"), base),
      backdrop: abs(back.attr("data-src") || back.attr("src"), base),
      genres: [...new Set(genres)].slice(0, 6),
      isMovie,
      seasons,
      episodes: $("#episode_by_temp").length ? parseEpisodes(cheerio.load($("#episode_by_temp").html() || ""), base) : [],
    };
  });

export const getSeason = createServerFn({ method: "GET" })
  .inputValidator((d: { postId: string; season: string }) =>
    z.object({ postId: z.string().regex(/^\d+$/), season: z.string().regex(/^\d+$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const html = await get(`${SALT}/wp-admin/admin-ajax.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `action=action_select_season&season=${data.season}&post=${data.postId}`,
    });
    return parseEpisodes(cheerio.load(`<ul>${html}</ul>`), SALT);
  });

export const getStreams = createServerFn({ method: "GET" })
  .inputValidator((d: { url: string }) => z.object({ url: z.string().url() }).parse(d))
  .handler(async ({ data }) => {
    if (!allowed(data.url)) throw new Error("Unsupported source");
    const base = new URL(data.url).origin;
    const slug = idFrom(data.url, "episode");
    const m = slug?.match(/^(.+)-(\d+)x(\d+)$/);
    let apiStreams: Stream[] = [];
    if (m) {
      try {
        const r = await api<{ results: any[] }>(`/stream?id=${m[1]}&season=${m[2]}&ep=${m[3]}`, 20000);
        apiStreams = (r.results ?? [])
          .map((x: any) => ({ server: x.server || x.name || "API", language: x.language || x.lang || "Default", link: x.link || x.url || x.src }))
          .filter((x: Stream) => typeof x.link === "string" && x.link.startsWith("http"));
      } catch { /* fall back */ }
    }
    let html = "";
    try { html = await get(data.url); } catch (e) { if (!apiStreams.length) throw e; }
    const $ = cheerio.load(html);
    const streams: Stream[] = [...apiStreams];
    $("iframe").each((_, el) => {
      const src = abs($(el).attr("src") || $(el).attr("data-src"), base);
      if (!src || src === "about:blank") return;
      if (src.includes("?data=")) {
        try {
          const b64 = new URL(src).searchParams.get("data") || "";
          const list = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
          for (const s of list) streams.push({ server: "Abyss", language: s.language, link: s.link });
        } catch { /* skip */ }
      } else if (!streams.some((s) => s.link === src)) {
        streams.push({ server: src.includes("as-cdn") ? "playX" : (new URL(src).hostname.split(".")[0] ?? "Server"), language: "Default", link: src });
      }
    });
    const downloads: Download[] = [];
    $("#mdl-download table tbody tr").each((_, el) => {
      const link = abs($(el).find("a").attr("href"), base);
      if (!link) return;
      downloads.push({
        server: $(el).find("td").first().text().replace(/#\d+\s*/g, "").trim() || "Download",
        language: $(el).find("td:nth-child(2)").text().trim() || "Default",
        quality: $(el).find("td:nth-child(3)").text().trim() || "HD",
        link,
      });
    });
    let prev: string | null = null, next: string | null = null;
    $("a").each((_, el) => {
      const t = $(el).text().trim().toLowerCase();
      const h = abs($(el).attr("href"), base);
      if (!h || !h.includes("/episode")) return;
      if (!prev && t.startsWith("prev")) prev = h;
      if (!next && t.startsWith("next")) next = h;
    });
    return { title: $("h1").first().text().trim(), streams, downloads, prev, next };
  });
