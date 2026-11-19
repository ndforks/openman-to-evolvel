import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { LibraryPage } from "@/components/pages/library/LibraryPage";
import { loadLibrary } from "./data";

export const metadata: Metadata = { title: "Library" };

/** Reads the session and the user's files on the server; inside Suspense because it needs the request. */
async function LibraryWithData() {
  await connection();
  const { items, favourites } = await loadLibrary().catch(() => ({ items: [], favourites: [] as string[] }));
  return <LibraryPage initialFiles={items} initialFavourites={favourites} />;
}

export default function Page() {
  return (
    <Suspense fallback={<LibraryPage loading />}>
      <LibraryWithData />
    </Suspense>
  );
}
