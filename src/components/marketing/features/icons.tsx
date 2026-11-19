/** Icons for the Features page (lucide-react). They inherit the text colour. */
import { Blocks, FileStack, Plug, Repeat, Search, Telescope, type LucideIcon } from "lucide-react";
import type { CategoryId } from "./data";

export function SearchIcon() {
  return <Search aria-hidden size={18} strokeWidth={1.8} className="shrink-0" />;
}

const categoryIcons: Record<CategoryId, LucideIcon> = {
  build: Blocks,
  create: FileStack,
  research: Telescope,
  automate: Repeat,
  connectors: Plug,
};

export function CategoryIcon({ id }: { id: CategoryId }) {
  const Icon = categoryIcons[id];
  return <Icon aria-hidden size={17} strokeWidth={1.7} className="shrink-0" />;
}
