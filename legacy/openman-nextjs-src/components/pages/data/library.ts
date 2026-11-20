// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/** Categories, file shape and sort orders of the Library page. */

export const LIBRARY_CATEGORIES = ["Text & PDF", "Websites", "Slides", "Games", "Spreadsheets", "Images", "Videos", "Audio", "Mobile apps", "Others"] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];

export interface LibraryFile {
  id: string;
  name: string;
  category: LibraryCategory;
  /** Task that produced the file. */
  taskId: string;
  taskTitle: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Size in bytes. */
  size: number;
  /** Where the file can be fetched from; used by "Download all files". */
  url?: string;
}

export type LibrarySort = "newest" | "oldest" | "name";

export const LIBRARY_SORTS: { id: LibrarySort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "name", label: "Name" },
];
