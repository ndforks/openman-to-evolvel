// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { randomBytes } from "node:crypto";

const ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** 22 characters from a 62-letter alphabet: short, URL-safe task ids. */
export function newTaskId(): string {
  return Array.from(randomBytes(22), (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}
