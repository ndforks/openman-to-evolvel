/** Shared bits of the /api/channels routes. Server only. */
import { homeComputerId } from "@/lib/connectors/server";
import { BadRequest } from "@/lib/orgo/http";
import type { Session } from "@/lib/session";

/** The computer whose Hermes talks on the chat apps. Throws 409 until it exists. */
export async function requireComputer(session: Session): Promise<string> {
  const id = await homeComputerId(session);
  if (!id) throw new BadRequest("Your agent's computer isn't set up yet.", 409);
  return id;
}

export function readForce(req: Request): boolean {
  return new URL(req.url).searchParams.get("force") === "1";
}
