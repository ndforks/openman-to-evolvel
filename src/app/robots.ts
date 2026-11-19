// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { MetadataRoute } from "next";
import { brand } from "@/config/brand";

/** Public pages may be crawled; the signed-in app, the API, shared tasks and the auth screens may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/app", "/api/", "/share/", "/auth/", "/waitlist"] },
    sitemap: `${brand.url}/sitemap.xml`,
  };
}
