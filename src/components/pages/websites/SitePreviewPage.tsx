// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

import { useEffect, useState } from "react";
import { WebsitePreview } from "@/components/task/website-preview";
import { getWebsite } from "@/lib/websites/client";

/** The task preview component for a site's latest task, filling the page. */
export function SitePreviewPage({ siteId }: { siteId: string }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getWebsite(siteId, "0")
      .then(({ site }) => {
        if (!alive) return;
        const id = site.taskIds.at(-1) ?? site.taskId;
        if (id) setTaskId(id);
        else setError("This website has no task yet. Open its dashboard to start one.");
      })
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : "This website could not be loaded."));
    return () => {
      alive = false;
    };
  }, [siteId]);
  if (error) return <div className="flex flex-1 items-center justify-center text-[14px] text-[var(--om-text-2)]">{error}</div>;
  return <div className="flex h-dvh min-h-0 flex-1 flex-col">{taskId ? <WebsitePreview taskId={taskId} /> : null}</div>;
}
