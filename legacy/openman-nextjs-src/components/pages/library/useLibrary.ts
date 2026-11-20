// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Library state: the files the server loaded (every `task_files` row plus the user's websites), and favourites
 * kept in the database through `/api/settings` (`library.favorites`).
 */
import { useCallback, useRef, useState } from "react";
import type { LibraryFile } from "../data/library";

export { categoryOf } from "./categories";

export interface LibraryItem extends LibraryFile {
  mime?: string;
  /** Page to open instead of the raw file (websites open their dashboard). */
  href?: string;
  /** Image shown in grid view. */
  thumb?: string;
  kind: "file" | "site";
}

export interface Library {
  files: LibraryItem[];
  ready: boolean;
  favourites: readonly string[];
  toggleFavourite: (id: string) => void;
}

export function useLibrary(initial: LibraryItem[], initialFavourites: string[]): Library {
  const [favourites, setFavourites] = useState<string[]>(initialFavourites);
  const saved = useRef(initialFavourites);

  const toggleFavourite = useCallback((id: string) => {
    setFavourites((current) => {
      const next = current.includes(id) ? current.filter((f) => f !== id) : [...current, id];
      void fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ library: { favorites: next } }) })
        .then((r) => {
          if (!r.ok) throw new Error();
          saved.current = next;
        })
        .catch(() => setFavourites(saved.current));
      return next;
    });
  }, []);

  return { files: initial, ready: true, favourites, toggleFavourite };
}

/** Save one file through the browser's download flow. */
export function downloadFile(file: LibraryFile): void {
  if (!file.url) return;
  const link = document.createElement("a");
  // Task files are served inline by default; `download=1` asks the API for an attachment instead.
  link.href = file.url.startsWith("/api/tasks/") ? `${file.url}${file.url.includes("?") ? "&" : "?"}download=1` : file.url;
  link.download = file.name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Save every file that has a URL, one after another so the browser does not drop any. */
export function downloadAll(files: readonly LibraryFile[]): void {
  files
    .filter((file) => file.url)
    .forEach((file, index) => {
      window.setTimeout(() => downloadFile(file), index * 400);
    });
}
