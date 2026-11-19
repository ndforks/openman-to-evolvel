import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class name joiner used by the sidebar pages. */
export function cx(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
