import type { Metadata } from "next";
import { DocPageView, docMetadata } from "./_components/doc-page";

export const metadata: Metadata = docMetadata("");

/** `/docs`: the docs home, from `content/docs/index.md`. */
export default function DocsHome() {
  return <DocPageView slug="" />;
}
