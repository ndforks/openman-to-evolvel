// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Server-side loader for the Library: every file the user's tasks produced (`task_files`), plus their websites. */
import { db } from "@/lib/db/client";
import { getSettings } from "@/lib/db/settings";
import { listWebsiteRows, toWebsite } from "@/lib/db/websites";
import { getSession } from "@/lib/session";
import type { LibraryItem } from "@/components/pages/library/useLibrary";
import { categoryOf } from "@/components/pages/library/categories";

interface FileRow {
  task_id: string;
  file_id: string;
  name: string;
  mime: string | null;
  size: number | null;
  created_at: string;
  tasks: { title: string | null } | { title: string | null }[] | null;
}

export async function loadLibrary(): Promise<{ items: LibraryItem[]; favourites: string[]; signedIn: boolean }> {
  const session = await getSession();
  if (!session) return { items: [], favourites: [], signedIn: false };
  const [files, sites, settings] = await Promise.all([
    db()
      .from("task_files")
      .select("task_id,file_id,name,mime,size,created_at,tasks(title)")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as FileRow[];
      }),
    listWebsiteRows(session.userId).catch(() => []),
    getSettings(session.userId).catch(() => ({}) as Record<string, unknown>),
  ]);
  const items: LibraryItem[] = files.map((f) => {
    const task = Array.isArray(f.tasks) ? f.tasks[0] : f.tasks;
    return {
      id: `${f.task_id}:${f.file_id}`,
      name: f.name,
      category: categoryOf(f.name, f.mime ?? undefined),
      taskId: f.task_id,
      taskTitle: task?.title || "New task",
      createdAt: new Date(f.created_at).toISOString(),
      size: f.size === null ? 0 : Number(f.size),
      mime: f.mime ?? undefined,
      url: `/api/tasks/${encodeURIComponent(f.task_id)}/files/${encodeURIComponent(f.file_id)}`,
      kind: "file",
    };
  });
  for (const site of sites.map(toWebsite)) {
    items.push({
      id: `site:${site.id}`,
      name: site.name,
      category: "Websites",
      taskId: site.taskId ?? "",
      taskTitle: site.publishedUrl ? site.publishedUrl.replace(/^https?:\/\//, "") : "Website",
      createdAt: site.createdAt,
      size: 0,
      url: `/api/websites/${site.id}/download`,
      href: `/app/website/${site.id}`,
      thumb: site.thumbSha ? `/api/websites/${site.id}/checkpoints/${site.thumbSha}` : undefined,
      kind: "site",
    });
  }
  const lib = (settings as { library?: { favorites?: unknown } }).library;
  const favourites = Array.isArray(lib?.favorites) ? lib.favorites.filter((v): v is string => typeof v === "string") : [];
  return { items, favourites, signedIn: true };
}
