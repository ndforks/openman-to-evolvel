import type { NextRequest } from "next/server";
import { deleteCustomConnector, getCustomConnector, listCustomConnectors } from "@/lib/db/connectors";
import { homeComputerId, syncApisOnComputer, writeHermesMcp } from "@/lib/connectors/server";
import { BadRequest, json, withUser } from "@/lib/orgo/http";

const UUID = /^[0-9a-f-]{36}$/i;

/** DELETE /api/connectors/custom/{id}: removes a custom connector here and from Hermes on the user's computer. */
export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withUser(req, async ({ session, orgo }) => {
    const { id } = await params;
    if (!UUID.test(id)) throw new BadRequest("Which connector?");
    const record = await getCustomConnector(session.userId, id);
    if (!record) return json({ error: "Not found." }, 404);
    await deleteCustomConnector(session.userId, id);
    const computerId = await homeComputerId(session);
    let warning: string | undefined;
    if (computerId) {
      try {
        if (record.kind === "api") await syncApisOnComputer(orgo, computerId, (await listCustomConnectors(session.userId)).filter((c) => c.kind === "api"));
        else await writeHermesMcp(orgo, computerId, { [record.serverName]: null });
      } catch (err) {
        warning = err instanceof Error ? err.message : "Couldn't update your computer.";
      }
    }
    return json({ ok: true, ...(warning ? { warning } : {}) });
  });
}
