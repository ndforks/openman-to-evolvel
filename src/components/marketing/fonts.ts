/** Serif used by marketing headings. Exposes `--font-libre-baskerville`, which `font-serif` reads. */
import { Libre_Baskerville } from "next/font/google";

export const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-libre-baskerville",
  display: "swap",
});
