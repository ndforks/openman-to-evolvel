import type { Website } from "@/lib/websites/types";

export function websiteView(w: Website) {
  return {
    id: w.id,
    object: "website" as const,
    name: w.name,
    status: w.status,
    visibility: w.visibility,
    preview_url: w.previewUrl,
    published_url: w.publishedUrl,
    published_at: w.publishedAt,
    task_id: w.taskId,
    task_ids: w.taskIds,
    error: w.error,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
  };
}
