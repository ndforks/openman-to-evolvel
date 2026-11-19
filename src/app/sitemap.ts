import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";
import { visiblePages } from "./docs/_components/doc-page";
import { docHref } from "./docs/_lib/manifest";

/** Every public page: the marketing pages, the docs and the legal pages. */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = brand.url;
  const marketing: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/pricing", priority: 0.9 },
    { path: "/features", priority: 0.8 },
    { path: "/team", priority: 0.6 },
    { path: "/terms", priority: 0.3 },
    { path: "/privacy", priority: 0.3 },
  ];
  const docs = visiblePages().map((page) => ({ path: docHref(page.slug), priority: page.slug ? 0.7 : 0.8 }));
  return [...marketing, ...docs].map(({ path, priority }) => ({ url: `${origin}${path === "/" ? "" : path}`, priority }));
}
