import { connection, NextResponse } from "next/server";
import { listInvites, inviteGateOn } from "@/lib/session/invites";
import { costStats } from "@/lib/observability/costs";
import { deepHealth } from "@/lib/observability/health";
import { provisioningByDay, recentErrors, signupsByDay, tasksByDay, totals } from "@/lib/observability/metrics";
import { maskEmail, NotOperator, requireOperator } from "@/lib/observability/operator";
import { withErrorReporting } from "@/lib/observability/route";

/**
 * GET /api/admin/overview: everything `/app/admin` shows, for an operator only (404 for anyone else).
 * Aggregates, the redacted error log and the invite list (emails visible to the owner only).
 */
export const GET = withErrorReporting("admin.overview", async () => {
  await connection();
  let op;
  try {
    op = await requireOperator();
  } catch (err) {
    if (err instanceof NotOperator) return NextResponse.json({ error: "Not found." }, { status: 404 });
    throw err;
  }
  const settle = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [health, signups, tasks, provisioning, errors, total, costs, invites] = await Promise.all([
    deepHealth(),
    settle(signupsByDay(30), []),
    settle(tasksByDay(30), []),
    settle(provisioningByDay(30), []),
    settle(recentErrors(50), []),
    settle(totals(), { accounts: null, tasks: null, automations: null }),
    settle(costStats(90), []),
    settle(listInvites(), []),
  ]);
  return NextResponse.json(
    {
      viewer: { owner: op.owner, via: op.via },
      health,
      totals: total,
      signups,
      tasks,
      provisioning,
      errors,
      costs,
      invites: {
        gateOn: inviteGateOn(),
        canManage: op.owner,
        members: invites.map((i) => ({ id: i.id, email: op.owner ? i.email : maskEmail(i.email), hasOrgoId: !!i.orgoUserId, role: i.role, createdAt: i.createdAt })),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
});
