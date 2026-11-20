// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Field rules shared by the project routes. */
import { z } from "zod";

export const projectFields = {
  name: z.string().trim().min(1, "Name the project.").max(200),
  instructions: z.string().max(20_000),
  connectors: z.array(z.string().max(200)).max(100),
  skills: z.array(z.string().max(200)).max(100),
  folder: z.string().max(1000),
  computer: z.enum(["local", "cloud"]).nullable(),
  pinned: z.boolean(),
  order: z.number().int().min(0).max(100_000),
};
