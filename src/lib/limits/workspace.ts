// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Task workspace hygiene: a task's working folder on the home computer (`~/tasks/<id>`, plus its uploads) is removed
 * once the task has been idle this many days. Files it delivered or was given are kept in the server's file cache
 * first and put back when the task runs again. Override with `OM_TASK_FOLDER_IDLE_DAYS` (1-365).
 */
export const TASK_FOLDER_IDLE_DAYS = 7;

/** The sweep runs at most this often (it rides the scheduler tick, which runs every minute). */
export const SWEEP_EVERY_MS = 24 * 60 * 60_000;

/** Tasks swept per user per pass, so one pass stays short. */
export const SWEEP_MAX_TASKS_PER_USER = 50;

/** Files larger than this are not cached; a task with one is left alone rather than lose it. */
export const SWEEP_MAX_FILE_BYTES = 25 * 1024 * 1024;

export function idleDays(): number {
  const raw = Number(process.env.OM_TASK_FOLDER_IDLE_DAYS);
  return Number.isInteger(raw) && raw >= 1 && raw <= 365 ? raw : TASK_FOLDER_IDLE_DAYS;
}
