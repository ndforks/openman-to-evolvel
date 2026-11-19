import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/session";
import { downloadSkill } from "@/lib/skills";
import { skillError } from "@/lib/skills/http";


/** GET /api/skills/[name]/download: the skill folder as a .zip. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const session = await requireSession();
    const { name } = await params;
    const { filename, bytes } = await downloadSkill(session, name);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`, "Cache-Control": "no-store" },
    });
  } catch (err) {
    return skillError(err, "GET /api/skills/[name]/download");
  }
}
