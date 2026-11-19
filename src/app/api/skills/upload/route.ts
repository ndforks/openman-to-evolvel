import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/session";
import { createSkill, installArchive, MAX_UPLOAD_BYTES, SkillError, slugifySkillName, type SkillFileInput } from "@/lib/skills";
import { ok, skillError } from "@/lib/skills/http";
import { BodyTooLarge, readFormLimited } from "@/lib/net/body";


/**
 * POST /api/skills/upload (multipart): `file` = one .zip / .skill archive or a SKILL.md, or several `file`
 * parts with `path` names (a folder picked in the browser; each part's filename is its path inside the folder).
 * `overwrite=1` replaces a skill with the same name.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    let form: FormData;
    try {
      // The whole multipart body is limited before it is buffered (the 8 MB of files plus room for the form).
      form = await readFormLimited(req, MAX_UPLOAD_BYTES + 512 * 1024);
    } catch (err) {
      if (err instanceof BodyTooLarge) throw new SkillError("That upload is larger than 8 MB.", "too_large", 413);
      throw new SkillError("Send the skill as a file upload.", "bad_archive");
    }
    const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
    const paths = form.getAll("path").map(String);
    const overwrite = form.get("overwrite") === "1";
    if (!files.length) throw new SkillError("Choose a .zip, .skill or SKILL.md file, or a folder.", "bad_archive");
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > MAX_UPLOAD_BYTES) throw new SkillError("That upload is larger than 8 MB.", "too_large", 413);

    if (files.length === 1 && /\.(zip|skill)$/i.test(files[0].name)) {
      const b64 = Buffer.from(await files[0].arrayBuffer()).toString("base64");
      return ok({ skill: await installArchive(session, b64, { overwrite }) }, 201);
    }

    // A folder (or a lone SKILL.md): strip the common top folder, keep the files under it.
    const entries = await Promise.all(files.map(async (f, i) => ({ path: (paths[i] || f.name).replace(/\\/g, "/").replace(/^\/+/, ""), file: f })));
    const md = entries.filter((e) => /(^|\/)SKILL\.md$/i.test(e.path) || (entries.length === 1 && /\.md$/i.test(e.path))).sort((a, b) => a.path.split("/").length - b.path.split("/").length)[0];
    if (!md) throw new SkillError("The folder has no SKILL.md.", "no_skill_md");
    const root = md.path.includes("/") ? md.path.slice(0, md.path.lastIndexOf("/") + 1) : "";
    const out: SkillFileInput[] = [];
    for (const e of entries) {
      if (!e.path.startsWith(root)) continue;
      const rel = e === md ? "SKILL.md" : e.path.slice(root.length);
      if (!rel || rel.split("/").some((p) => p.startsWith(".") || p === "__pycache__" || p === "node_modules")) continue;
      out.push({ path: rel, b64: Buffer.from(await e.file.arrayBuffer()).toString("base64") });
    }
    const text = Buffer.from(out.find((f) => f.path === "SKILL.md")!.b64!, "base64").toString("utf8");
    const named = text.match(/^---\s*\n[\s\S]*?^name:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
    const folder = root.replace(/\/$/, "").split("/").pop();
    const name = slugifySkillName(named || folder || md.file.name.replace(/\.md$/i, ""));
    const skill = await createSkill(session, { name, files: out.map((f) => (f.path === "SKILL.md" && out.length === 1 ? { path: "SKILL.md", content: text } : f)) }).catch(async (err) => {
      if (overwrite && err instanceof SkillError && err.code === "exists") {
        const { updateSkill } = await import("@/lib/skills");
        return updateSkill(session, name, out);
      }
      throw err;
    });
    return ok({ skill }, 201);
  } catch (err) {
    return skillError(err, "POST /api/skills/upload");
  }
}
