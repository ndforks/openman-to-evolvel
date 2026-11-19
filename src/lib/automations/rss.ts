/** Minimal RSS 2.0 / Atom reader for feed triggers. No dependencies; tolerant of odd feeds. */
import { safeFetch } from "@/lib/net/safe-fetch";

export interface FeedItem {
  id: string;
  title: string;
  link: string;
  summary: string;
  author: string;
  published: string;
  categories: string[];
}

const decode = (s: string): string =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();

const stripTags = (s: string): string => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
}

function tags(block: string, name: string): string[] {
  return [...block.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi"))].map((m) => decode(m[1]));
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const rss = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  for (const b of rss) {
    const link = tag(b, "link");
    const guid = tag(b, "guid");
    items.push({
      id: guid || link || tag(b, "title"),
      title: stripTags(tag(b, "title")),
      link,
      summary: stripTags(tag(b, "description") || tag(b, "content:encoded")).slice(0, 2000),
      author: tag(b, "author") || tag(b, "dc:creator"),
      published: tag(b, "pubDate") || tag(b, "dc:date"),
      categories: tags(b, "category"),
    });
  }
  if (items.length) return items;
  const atom = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  for (const b of atom) {
    const href = b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "";
    items.push({
      id: tag(b, "id") || href,
      title: stripTags(tag(b, "title")),
      link: decode(href),
      summary: stripTags(tag(b, "summary") || tag(b, "content")).slice(0, 2000),
      author: tag(tag(b, "author"), "name") || stripTags(tag(b, "author")),
      published: tag(b, "published") || tag(b, "updated"),
      categories: [...b.matchAll(/<category[^>]*term="([^"]+)"/gi)].map((m) => decode(m[1])),
    });
  }
  return items;
}

/** Reads a feed through `safeFetch`: public addresses only, redirects re-checked, 3 MB and 15 s at most. */
export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await safeFetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (automations feed reader)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    timeoutMs: 15_000,
    maxBytes: 3_000_000,
  });
  if (!res.ok) throw new Error(`The feed answered ${res.status}.`);
  return parseFeed(await res.text());
}
