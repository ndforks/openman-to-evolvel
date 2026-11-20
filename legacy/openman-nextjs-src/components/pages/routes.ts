// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Routes the sidebar pages link to. */
export const NEW_TASK_HREF = "/app";
export const AUTOMATIONS_HREF = "/app/automations";
export const NEW_AUTOMATION_HREF = "/app/automations/new";
export const SKILLS_HREF = "/app/skills";
export const PLUGINS_HREF = "/app/plugins";

/** Page showing a single task. */
export function taskHref(id: string): string {
  return `/app/task/${encodeURIComponent(id)}`;
}
