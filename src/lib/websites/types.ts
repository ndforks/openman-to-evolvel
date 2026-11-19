// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Website shapes shared by the server, the routes and the browser. No server imports here. */

/** Who may open the published site. Maps to Orgo access modes: public = link, invite = people, private = team. */
export type SiteVisibility = "public" | "invite" | "private";

export type SiteStatus = "building" | "ready" | "draft" | "publishing" | "published" | "failed" | "unpublished";

export type SiteTemplate = "static" | "vite-react" | "fullstack";

export interface SiteCheckpoint {
  /** Full git commit id in the site folder. */
  sha: string;
  message: string;
  at: string;
  /** True when a screenshot was captured for this version. */
  screenshot: boolean;
  /** True for the version the published site was built from. */
  published?: boolean;
}

/** A site as the browser sees it. */
export interface Website {
  id: string;
  name: string;
  slug: string | null;
  taskId: string | null;
  computerId: string | null;
  folder: string | null;
  template: SiteTemplate | null;
  devPort: number | null;
  prodPort: number | null;
  previewUrl: string | null;
  publishedUrl: string | null;
  visibility: SiteVisibility;
  autoPublish: boolean;
  showBadge: boolean;
  status: SiteStatus;
  publishedAt: string | null;
  publishedSha: string | null;
  /** Every task that worked on the site, oldest first. */
  taskIds: string[];
  /** Last error from a build or publish, shown on the dashboard. */
  error: string | null;
  /** Version whose screenshot serves as the thumbnail. */
  thumbSha: string | null;
  /** What the agent reported the site uses (full-stack template): "database", "auth", "uploads", "ai". */
  features: string[];
  /** The owner let the site's server call the model (full-stack sites, `POST /api/ai`, signed-in visitors only). */
  aiEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewState {
  /** "live": the dev server answers; "paused": the computer sleeps; "stopped": no dev server; "building": the agent has not reported a site yet. */
  state: "live" | "paused" | "stopped" | "building";
  url: string | null;
  /** Secrets the agent asked for (`.openman/needs-secrets.json`) that the owner has not set yet. */
  needsSecrets?: SecretRequest[];
}

export interface SecretRequest {
  name: string;
  why?: string;
}

/** A saved secret as the browser sees it: never the value. */
export interface SiteSecret {
  name: string;
  updatedAt: string;
}

export interface SiteSchedule {
  id: string;
  name: string;
  /** Five-field cron, computer local time. */
  cron: string;
  /** Shell command run in the site folder (the site's secrets and SITE_URL are in its environment). */
  command: string;
  enabled: boolean;
}

export interface ScheduleRun {
  job: string;
  name: string;
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  code: number | null;
  output: string;
}

export interface DbColumn {
  name: string;
  type: string;
  notnull: boolean;
  default: unknown;
  pk: boolean;
  /** Password, token and hash columns: shown as dots, never editable here. */
  masked: boolean;
}

export interface SiteAnalytics {
  days: { day: string; views: number; visitors: number }[];
  sources: { source: string; views: number; visitors: number }[];
  pages: { path: string; views: number }[];
  totals: { views: number; visitors: number };
}

export interface SiteDomain {
  id: string;
  domain: string;
  status: string;
  targetPort: number | null;
  certStatus: string | null;
  records: { type: string; name: string; host: string; value: string }[];
}

export interface DomainsState {
  /** False: the user's Orgo plan or account cannot add domains here; the UI renders no control. */
  available: boolean;
  limit: number;
  used: number;
  domains: SiteDomain[];
}

export const VISIBILITY_LABELS: Record<SiteVisibility, { label: string; hint: string }> = {
  public: { label: "Public", hint: "Anyone with the link can open it." },
  invite: { label: "Invite only", hint: "Only people you invite, after an emailed code." },
  private: { label: "Private", hint: "Only you and your Orgo workspace." },
};
