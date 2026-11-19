import type { NextRequest } from "next/server";
import { list, paginate, v1 } from "@/lib/public-api/http";
import { listSkills } from "@/lib/skills";

/** GET /api/v1/skills: skills the agent on the account's computer can load (pass names in `skills` on task create). */
export function GET(req: NextRequest) {
  return v1(req, async (ctx) => {
    const skills = (await listSkills(ctx.session)).map((s) => ({
      name: s.name,
      object: "skill" as const,
      description: s.description,
      category: s.category,
      source: s.source,
      enabled: (s as { enabled?: boolean }).enabled ?? true,
    }));
    return list(ctx, paginate(skills, req, (s) => s.name, 100));
  });
}
