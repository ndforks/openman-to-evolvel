// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
import { NextResponse, type NextRequest } from "next/server";
import { handleWebhook } from "@/lib/automations/inbound";


async function readBody(req: NextRequest): Promise<unknown> {
  const text = (await req.text().catch(() => "")).slice(0, 256_000);
  if (!text) return {};
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function handle(req: NextRequest, params: Promise<{ token: string }>) {
  const { token } = await params;
  try {
    const body = req.method === "GET" ? {} : await readBody(req);
    const query = Object.fromEntries(req.nextUrl.searchParams);
    const res = await handleWebhook(token, req.headers, body, query);
    return NextResponse.json(res.body, { status: res.status });
  } catch (err) {
    console.error("[hooks] failed:", err);
    return NextResponse.json({ error: "The webhook could not be handled." }, { status: 500 });
  }
}

/** Inbound webhook trigger. Public; protected by its unguessable token and an optional auth header. */
export function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle(req, params);
}
export function PUT(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle(req, params);
}
