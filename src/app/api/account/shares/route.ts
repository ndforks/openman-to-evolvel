import { NextResponse, type NextRequest } from "next/server";
import { withSession } from "@/lib/agent/server/http";
import { db, fail } from "@/lib/db/client";

/** GET /api/account/shares: `{ shares: [{ taskId, title, visibility, url, updatedAt }] }`, the caller's live share links. */
export function GET(req: NextRequest) {
  return withSession(req, async (session) => {
    const { data, error } = await db().from("shares").select("task_id,token,visibility,updated_at,tasks(title)").eq("user_id", session.userId).eq("visibility", "public").order("updated_at", { ascending: false });
    if (error) fail("list shares", error);
    const rows = (data ?? []) as unknown as { task_id: string; token: string; visibility: string; updated_at: string; tasks: { title: string } | { title: string }[] | null }[];
    return NextResponse.json({
      shares: rows.map((r) => ({
        taskId: r.task_id,
        title: (Array.isArray(r.tasks) ? r.tasks[0]?.title : r.tasks?.title) ?? "Untitled task",
        visibility: r.visibility,
        url: `${req.nextUrl.origin}/share/${r.token}`,
        updatedAt: r.updated_at,
      })),
    });
  });
}
