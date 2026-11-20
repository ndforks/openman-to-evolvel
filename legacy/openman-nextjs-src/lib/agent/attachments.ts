// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The request shape of attachments on a new task (shared by the task, website and generator routes): a link, or a
 * file already uploaded to the user's computer through `POST /api/tasks/uploads`.
 */
import { z } from "zod";

/** `/root/uploads/<24 hex>/<name>`: the only paths an attachment may name. */
export const UPLOAD_PATH = /^\/root\/uploads\/[a-f0-9]{24}\/[^/\u0000-\u001f\\]{1,180}$/;

export const attachmentSchema = z
  .object({
    name: z.string().trim().min(1).max(500),
    url: z.string().max(4000).optional(),
    path: z.string().regex(UPLOAD_PATH, "not an uploaded file").optional(),
    size: z.number().int().nonnegative().max(200 * 1024 * 1024).optional(),
    mime: z.string().max(200).optional(),
    preview: z.string().max(2000).optional(),
  })
  .refine((a) => !!a.url || !!a.path, "an attachment needs a url or an uploaded path");

export const attachmentsSchema = z.array(attachmentSchema).max(50);
