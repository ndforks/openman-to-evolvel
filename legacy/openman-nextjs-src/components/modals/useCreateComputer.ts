// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/**
 * Shared "subscribe" action for the Create and Customize computer modals. It creates a real computer through
 * POST /api/computers and follows it until Orgo reports it running, exposing progress, success and error states.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useComposerStore } from "@/components/composer/store";
import { useComputersStore } from "@/components/pages/computers/useComputers";
import type { CloudComputer, CreateComputerBody, CreateComputerResponse } from "@/lib/orgo/types";
import { useUI } from "@/lib/ui-store";

export type CreateComputerInput = CreateComputerBody;

export type CreateComputerStatus = "idle" | "loading" | "success" | "error";

export interface UseCreateComputer {
  status: CreateComputerStatus;
  /** Loading: what is happening now. Error: the reason. Success: "<name> is running". */
  message: string | null;
  /** The computer, as soon as Orgo has made it. */
  computer: CloudComputer | null;
  /** Whole seconds since the request was sent. */
  elapsed: number;
  create: (input: CreateComputerInput) => Promise<void>;
  reset: () => void;
}

/** Fired on `window` once a computer exists; `detail` is the route's JSON response (`{ computer }`). */
export const COMPUTER_CREATED_EVENT = "openman:computer-created";

const ENDPOINT = "/api/computers";
const NOT_ENABLED = `Cloud computers aren't switched on in this build yet (POST ${ENDPOINT} returned 404).`;
const NOT_SENT = "The request could not be sent. Check your connection and try again.";
/** How long the success state stays up before the modal closes itself. */
const CLOSE_AFTER_MS = 1800;
/** How often, and for how long, a computer that came back still starting is checked. */
const POLL_MS = 2000;
const POLL_LIMIT_MS = 240_000;

/** Pull a readable reason out of an error response: `{ error }`, `{ message }`, or short plain text. */
function errorDetail(json: unknown, text: string): string {
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    const reason = record.error ?? record.message;
    if (typeof reason === "string" && reason.trim()) return reason.trim();
    if (reason && typeof reason === "object") {
      const nested = (reason as Record<string, unknown>).message;
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  const plain = text.trim();
  // An HTML error page is not worth showing.
  if (!plain || plain.startsWith("<")) return "";
  return plain.length > 160 ? `${plain.slice(0, 160)}…` : plain;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface State {
  status: CreateComputerStatus;
  message: string | null;
  computer: CloudComputer | null;
}

const IDLE: State = { status: "idle", message: null, computer: null };

export function useCreateComputer(): UseCreateComputer {
  const [state, setState] = useState<State>(IDLE);
  const [elapsed, setElapsed] = useState(0);
  const mounted = useRef(true);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Count the seconds while Orgo works, so a slow start reads as progress and not as a hang.
  useEffect(() => {
    if (state.status !== "loading") return;
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(tick);
  }, [state.status]);

  const create = useCallback(async (input: CreateComputerInput) => {
    // Whether the composer should run its next task on the new computer (the "Run this task on" menu asks for this).
    const selectAsTarget = useUI.getState().modal?.props?.selectTarget === true;
    setElapsed(0);
    setState({ status: "loading", message: `Creating ${input.name} on Orgo…`, computer: null });

    let res: Response;
    try {
      res = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    } catch {
      if (mounted.current) setState({ status: "error", message: NOT_SENT, computer: null });
      return;
    }

    if (res.status === 404) {
      if (mounted.current) setState({ status: "error", message: NOT_ENABLED, computer: null });
      return;
    }

    const text = await res.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON: fall back to the raw text below.
    }

    if (!res.ok) {
      const detail = errorDetail(json, text);
      if (mounted.current) setState({ status: "error", message: detail ? `Couldn't create the computer: ${detail}` : `Couldn't create the computer (the server answered ${res.status}).`, computer: null });
      return;
    }

    let computer = (json as CreateComputerResponse | null)?.computer ?? null;
    if (!computer) {
      if (mounted.current) setState({ status: "error", message: "The computer was created, but the server's answer could not be read. Look under Computers.", computer: null });
      void useComputersStore.getState().refresh();
      return;
    }

    // From here the computer exists, whether or not this modal is still open.
    const store = useComputersStore.getState();
    store.upsert(computer);
    window.dispatchEvent(new CustomEvent(COMPUTER_CREATED_EVENT, { detail: json }));
    if (selectAsTarget) useComposerStore.getState().setTarget({ kind: "cloud-persistent", computerId: computer.id });

    // Orgo usually answers once the computer is running. When it is still starting, follow it.
    const deadline = Date.now() + POLL_LIMIT_MS;
    while (computer.status !== "running" && Date.now() < deadline) {
      if (computer.status === "error" || computer.status === "stopped" || computer.status === "deleted") {
        if (mounted.current) setState({ status: "error", message: `${computer.name} was created but did not start (Orgo reports "${computer.rawStatus}"). It is listed under Computers.`, computer });
        return;
      }
      if (!mounted.current) return;
      setState({ status: "loading", message: `Starting ${computer.name}…`, computer });
      await sleep(POLL_MS);
      await store.refresh();
      const id: string = computer.id;
      computer = useComputersStore.getState().computers.find((candidate) => candidate.id === id) ?? computer;
    }
    if (!mounted.current) return;

    setState({ status: "success", message: computer.status === "running" ? `${computer.name} is running` : `${computer.name} is still starting`, computer });
    // Unmounting (the user closed or switched modals first) clears this timer, so it can only close our own modal.
    closeTimer.current = setTimeout(() => useUI.getState().close(), CLOSE_AFTER_MS);
  }, []);

  const reset = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setState(IDLE);
  }, []);

  return { status: state.status, message: state.message, computer: state.computer, elapsed, create, reset };
}
