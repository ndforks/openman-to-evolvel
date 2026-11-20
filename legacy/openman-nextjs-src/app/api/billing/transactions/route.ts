// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import type { NextRequest } from "next/server";
import { json, withUser } from "@/lib/orgo/http";
import { OrgoError } from "@/lib/orgo/user-client";

/** GET /api/billing/transactions: the last 50 rows of the user's Orgo credit ledger. */
export function GET(req: NextRequest) {
  return withUser(req, async ({ orgo }) => {
    try {
      const rows = await orgo.transactions();
      return json({
        available: true,
        transactions: rows.map((t) => ({
          id: t.id ?? null,
          amountCents: t.amount_cents,
          balanceAfterCents: t.balance_after_cents ?? null,
          type: t.type ?? null,
          description: t.description ?? null,
          model: t.model ?? null,
          inputTokens: t.input_tokens ?? null,
          outputTokens: t.output_tokens ?? null,
          createdAt: t.created_at ?? null,
        })),
      });
    } catch (err) {
      if (err instanceof OrgoError && err.status === 403) return json({ available: false, transactions: [], reason: err.message });
      throw err;
    }
  });
}
