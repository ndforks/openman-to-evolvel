import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { operatorFor } from "@/lib/observability/operator";
import { AdminConsole } from "./admin-console";

export const metadata: Metadata = { title: "Operations" };

/** Only an operator (see `src/lib/observability/operator.ts`) gets the console; everyone else gets the 404 page. */
async function Gate() {
  await connection();
  const session = await getSession().catch(() => null);
  const op = session ? await operatorFor(session).catch(() => null) : null;
  if (!op) notFound();
  return <AdminConsole />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="px-[24px] py-[32px] text-[14px] text-[var(--om-text-3)]">Loading…</div>}>
      <Gate />
    </Suspense>
  );
}
