import { redirect } from "next/navigation";

/**
 * There are no desktop or mobile apps: the product runs in the browser. `/download` (linked from the app's
 * "Use anywhere" dialog) sends people to the getting-started guide.
 */
export default function DownloadPage() {
  redirect("/docs/getting-started");
}
