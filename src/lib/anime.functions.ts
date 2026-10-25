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


// ---- External FetchStream API (set ANIME_API_URL in Vercel → Settings → Environment Variables) ----
const DEFAULT_API = "https://stream-mu-opal.vercel.app";
function apiBase() {
  const raw = (process.env["ANIME_API_URL"] || process.env["VITE_ANIME_API_URL"] || DEFAULT_API).trim();
  // The API's Express routes live at the root, so strip a trailing "/api" or "/".
  return raw.replace(/\/+$/, "").replace(/\/api$/, "");
}
async function api<T>(path: string): Promise<T> {
  const res = await fetch(apiBase() + path, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return (await res.json()) as T;
}
type ApiCard = { title: string; link: string; image: string | null; type: string; source: string };
const toCard = (c: ApiCard): Card => ({
  title: c.title, link: c.link, image: c.image ?? null, type: c.type || "series",
  source: /toon/i.test(c.source) ? "toon" : "salt",
});
const apiPrefix = (url: string) => (/toon/i.test(new URL(url).hostname) ? "/toonstream" : "/animesalt");
const slugTitle = (url: string) =>
  (new URL(url).pathname.split("/").filter(Boolean).pop() || "").replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
async function apiSearch(q: string): Promise<Card[]> {
  const r = await api<{ results: ApiCard[] }>(`/search?q=${encodeURIComponent(q)}`);
  return (r.results || []).map(toCard);
}

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
    const $ = cheerio.load(await get(SALT + "/"));
    const cards = parseCards($, SALT, "salt");
    if (cards.length) return cards.slice(0, 48);
  } catch { /* fall back to API */ }
  // Fallback: build the home list from the FetchStream API using popular titles.
  const picks = ["naruto", "one piece", "dragon ball", "demon slayer", "jujutsu kaisen", "pokemon", "doraemon", "shinchan"];
  const lists = await Promise.all(picks.map((q) => apiSearch(q).catch(() => [] as Card[])));
  const seen = new Set<string>();
  const out: Card[] = [];
  for (const c of lists.flat()) if (!seen.has(c.link)) { seen.add(c.link); out.push(c); }
  return out.slice(0, 48);
});

export const searchAnime = createServerFn({ method: "GET" })
  .inputValidator((d: { q: string }) => z.object({ q: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ data }) => {
    const q = encodeURIComponent(data.q);
    const [a, b] = await Promise.all([
      get(`${SALT}/?s=${q}`).then((h) => parseCards(cheerio.load(h), SALT, "salt")).catch(() => []),
      get(`${TOON}/?s=${q}`).then((h) => parseCards(cheerio.load(h), TOON, "toon")).catch(() => []),
    ]);
    if (a.length || b.length) return [...a, ...b];
    return apiSearch(data.q).catch(() => [] as Card[]);
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
    let html: string;
    try {
      html = await get(data.url);
    } catch (e) {
      const r = await api<{ seasons: { name: string; seasonNum: string; postId?: string }[]; episodes: Episode[] }>(
        `${apiPrefix(data.url)}/episodes?url=${encodeURIComponent(data.url)}`,
      ).catch(() => { throw e; });
      return {
        title: slugTitle(data.url), overview: "", poster: r.episodes?.[0]?.image ?? null, backdrop: null,
        genres: [] as string[], isMovie: data.url.includes("/movies/"),
        seasons: (r.seasons || []).map((x) => ({ name: x.name, seasonNum: x.seasonNum, postId: x.postId ?? "" })),
        episodes: r.episodes || [],
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
    let html: string;
    try {
      html = await get(data.url);
    } catch (e) {
      const r = await api<{ title: string | null; streams: { server: string; language?: string; link: string }[]; downloads: { server: string; language?: string; quality?: string; link: string }[] }>(
        `${apiPrefix(data.url)}/streams?url=${encodeURIComponent(data.url)}`,
      ).catch(() => { throw e; });
      return {
        title: r.title || slugTitle(data.url),
        streams: (r.streams || []).map((x) => ({ server: x.server, language: x.language || "Default", link: x.link })),
        downloads: (r.downloads || []).map((x) => ({ server: x.server, language: x.language || "Default", quality: x.quality || "HD", link: x.link })),
        prev: null as string | null, next: null as string | null,
      };
    }
    const $ = cheerio.load(html);
    const streams: Stream[] = [];
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
