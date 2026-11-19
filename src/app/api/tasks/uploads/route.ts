// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { jsonError, withStore } from "@/lib/agent/server/http";
import { membershipFor } from "@/lib/agent/server/collab";
import { computerFor, orgoClientFor, primeConnectionFor } from "@/lib/agent/server/connection";
import { remoteComputerId } from "@/lib/agent/server/remote";
import { putUploadPart, UploadError, UPLOAD_PART_BYTES } from "@/lib/agent/server/uploads";
import { DbStore, isValidTaskId } from "@/lib/store";
import { BodyTooLarge, readLimited } from "@/lib/net/body";

const COMPUTER_ID = /^[A-Za-z0-9_-]{6,80}$/;

/**
 * POST /api/tasks/uploads?upload=<24 hex>&name=<file name>&size=<bytes>&part=<i>&parts=<n>[&task=<id> | &target=<computer id>]
 * Body: the raw bytes of part `i` (at most 8 MB). Parts go, in order, to the computer the message's task works on:
 * - `task`: an existing task (the caller's own, or one they collaborate on): the computer it was given, else its
 *   owner's home computer;
 * - `target`: a computer of the caller's that a new task will run on;
 * - neither: the caller's own home computer.
 * Only Linux computers take attachments directly (Orgo's file transfer and the join step are Linux ones).
 * The last part answers 201 `{ file: { name, path, size, mime?, preview? } }`, earlier ones 202 `{ ok: true }`.
 */
export function POST(req: NextRequest) {
  return withStore(req, async (store, session) => {
    const q = req.nextUrl.searchParams;
    const uploadId = q.get("upload") ?? "";
    const name = q.get("name") ?? "";
    const size = Number(q.get("size"));
    const index = Number(q.get("part") ?? "0");
    const parts = Number(q.get("parts") ?? "1");
    if (!name.trim()) return jsonError("The file needs a name.", 400);

    // Whose computers, and which one.
    let owner = session.userId;
    let remote: string | null = null;
    const taskId = q.get("task");
    const target = q.get("target");
    if (taskId) {
      if (!isValidTaskId(taskId)) return jsonError("Task not found.", 404);
      let task = await store.getTask(taskId);
      if (!task && store.kind === "supabase") {
        const member = await membershipFor(taskId, session);
        if (member) {
          await primeConnectionFor(member.ownerId);
          task = await new DbStore(member.ownerId).getTask(taskId);
          if (task) owner = member.ownerId;
        }
      }
      if (!task) return jsonError("Task not found.", 404);
      remote = remoteComputerId(task.meta.target);
    } else if (target) {
      if (!COMPUTER_ID.test(target)) return jsonError("Unknown computer.", 400);
      remote = target;
    }
    const orgo = orgoClientFor(owner) ?? (owner === session.userId ? orgoClientFor(store.ownerId) : null);
    const home = (computerFor(owner) ?? (owner === session.userId ? computerFor(store.ownerId) : null))?.computerId;
    if (!orgo) return jsonError("Your computer is not ready yet, so files cannot be attached. Try again once it is set up.", 409);
    let computerId = home;
    if (remote && remote.toLowerCase() !== home?.toLowerCase()) {
      // The computer must be the owner's own (their Orgo listing), running, and Linux.
      const listed = (await orgo.listComputers().catch(() => [])).find((c) => c.id.toLowerCase() === remote!.toLowerCase());
      if (!listed || listed.status === "deleted") return jsonError("That computer is not one of yours.", 404);
      if ((listed.os ?? "linux") !== "linux") return jsonError(`Files can be attached to Linux computers only; "${listed.name}" runs ${listed.os}. Put the file there yourself, or run the task on a Linux computer.`, 409);
      if (index === 0 && listed.status !== "running") await orgo.startComputer(listed.id).catch(() => undefined);
      computerId = listed.id;
    }
    if (!computerId) return jsonError("Your computer is not ready yet, so files cannot be attached. Try again once it is set up.", 409);
    let bytes: Buffer;
    try {
      bytes = await readLimited(req, UPLOAD_PART_BYTES); // limited before buffering
    } catch (err) {
      if (err instanceof BodyTooLarge) return jsonError("A part is too large.", 413);
      throw err;
    }
    try {
      const file = await putUploadPart(orgo, computerId, { uploadId, name, index, parts, size, bytes: new Uint8Array(bytes) });
      return file ? NextResponse.json({ file }, { status: 201 }) : NextResponse.json({ ok: true }, { status: 202 });
    } catch (err) {
      if (err instanceof UploadError) return jsonError(err.message, err.status);
      throw err;
    }
  });
}
