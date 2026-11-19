"use client";

/**
 * Loads one task and keeps it live: `getTask` for the stored events, then the SSE stream for new ones,
 * all reduced into the view model. Also exposes the actions the screen needs (send, stop, answer).
 * With `mock` set, nothing touches the network and a scripted session plays instead.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getTask, respond as respondRequest, sendMessage, stopTask, subscribe } from "@/lib/agent/client";
import type { AgentEvent, TaskAttachment, TaskStatus, TaskSummary } from "@/lib/agent/types";
import { refreshTasks } from "@/components/shell/tasks-store";
import { MOCK_TITLE, startMockSession, type MockSession } from "./mock";
import { cleanOutput } from "./output";
import { initialState, isBusy, taskReducer, type SendMode, type TaskViewModel } from "./reducer";

export interface TaskController {
  state: TaskViewModel;
  task: TaskSummary | null;
  /** True until the stored events have been applied. */
  loading: boolean;
  /** Set when the task could not be loaded at all. */
  loadError: string | null;
  /** Last failed action (send, stop, answer), shown above the composer until the next action. */
  actionError: string | null;
  mock: boolean;
  send: (text: string, mode: SendMode, extra?: SendExtra) => Promise<void>;
  stop: () => Promise<void>;
  answer: (requestId: string, reply: { choice?: string; answer?: string }) => Promise<void>;
  reload: () => void;
  /** Applies a change made elsewhere (rename, favourite) to the summary held here. */
  patchTask: (patch: Partial<TaskSummary>) => void;
}

const TERMINAL: readonly TaskStatus[] = ["completed", "stopped", "error"];

/** `window.dispatchEvent(new CustomEvent(TASK_REFRESH_EVENT, { detail: taskId }))` makes an open task view follow its events again. */
export const TASK_REFRESH_EVENT = "openman:task-refresh";

/** What a message can carry besides its text: earlier tasks it refers to, and Plan mode toggled for it. */
export interface SendExtra {
  references?: string[];
  interaction?: "agent" | "plan";
  /** Files uploaded to the user's computer for this message (`uploadAttachment`). */
  attachments?: TaskAttachment[];
}

function messageOf(err: unknown, fallback: string): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  // The fetch helper throws "<status> <body>"; surface the server's own sentence when the body is JSON.
  const match = /^\d{3}\s+([\s\S]*)$/.exec(err.message);
  if (!match) return err.message;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === "string") return record.error;
      if (typeof record.message === "string") return record.message;
    }
  } catch {
    // Not JSON: fall through to the plain text.
  }
  return match[1].slice(0, 200) || fallback;
}

/** Tool results arrive the way the model reads them (wrapped, as JSON); the screen gets the readable form. */
function readable(event: AgentEvent): AgentEvent {
  if (event.type !== "tool.completed" || !event.preview) return event;
  const preview = cleanOutput(event.preview);
  return preview === event.preview ? event : { ...event, preview };
}

function mockSummary(taskId: string): TaskSummary {
  const now = new Date().toISOString();
  return { id: taskId, title: MOCK_TITLE, status: "running", createdAt: now, updatedAt: now };
}

export function useTask(taskId: string, mock: boolean): TaskController {
  const [state, dispatch] = useReducer(taskReducer, undefined, initialState);
  const [task, setTask] = useState<TaskSummary | null>(() => (mock ? mockSummary(taskId) : null));
  const [loading, setLoading] = useState(!mock);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const mockRef = useRef<MockSession | null>(null);
  /** Opens the event stream if it is not open. Set by the effect below; a no-op in mock mode. */
  const ensureStream = useRef<() => void>(() => {});

  // The caller remounts this hook per task (`key={taskId}`), so the effect never has to clear old state.
  useEffect(() => {
    let cancelled = false;

    if (mock) {
      const session = startMockSession((event) => {
        if (!cancelled) dispatch({ type: "event", event });
      });
      mockRef.current = session;
      return () => {
        cancelled = true;
        session.dispose();
        mockRef.current = null;
      };
    }

    let unsubscribe: (() => void) | null = null;
    let buffer: AgentEvent[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      if (cancelled || buffer.length === 0) return;
      const events = buffer;
      buffer = [];
      dispatch({ type: "events", events });
    };
    const open = () => {
      if (cancelled || unsubscribe) return;
      const after = Math.max(0, stateRef.current.lastSeq);
      unsubscribe = subscribe(
        taskId,
        after,
        (event) => {
          // Token deltas can arrive faster than the screen refreshes; apply them once per frame.
          buffer.push(readable(event));
          if (!frame) frame = requestAnimationFrame(flush);
        },
        () => {
          // EventSource retries on its own. Once the task is at rest there is nothing to wait for, so let go of the connection.
          if (TERMINAL.includes(stateRef.current.status) && unsubscribe) {
            unsubscribe();
            unsubscribe = null;
          }
        },
      );
    };
    ensureStream.current = open;
    // A change made outside this hook (Switch to Agent, Confirm a plan) appends events to a task at rest: listen again.
    const onRefresh = (e: Event) => {
      if ((e as CustomEvent<string>).detail === taskId) open();
    };
    window.addEventListener(TASK_REFRESH_EVENT, onRefresh);

    getTask(taskId)
      .then(({ task: summary, events }) => {
        if (cancelled) return;
        setTask(summary);
        dispatch({ type: "events", events: events.map(readable) });
        // The stored status is the authority when the history has no closing event (or none at all).
        dispatch({ type: "local.status", status: summary.status, at: summary.updatedAt });
        stateRef.current = { ...stateRef.current, lastSeq: events.reduce((max, e) => Math.max(max, e.seq), -1), status: summary.status };
        setLoading(false);
        open();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(messageOf(err, "This task could not be loaded."));
        setLoading(false);
      });

    return () => {
      cancelled = true;
      window.removeEventListener(TASK_REFRESH_EVENT, onRefresh);
      ensureStream.current = () => {};
      if (frame) cancelAnimationFrame(frame);
      unsubscribe?.();
      unsubscribe = null;
    };
  }, [taskId, mock, attempt]);

  // When a run that was watched here comes to rest: pick up the title the backend wrote meanwhile and refresh the sidebar.
  const busy = isBusy(state.status);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current || mock) return;
    wasBusy.current = false;
    let cancelled = false;
    // Now, and once more a moment later: the closing event can reach this screen before the task list
    // on the server shows the new status, and a list request already in flight still carries the old one.
    void refreshTasks();
    const again = window.setTimeout(() => void refreshTasks(), 1500);
    getTask(taskId)
      .then(({ task: summary }) => {
        if (!cancelled) setTask(summary);
      })
      .catch(() => {
        // Keep the summary we have.
      });
    return () => {
      cancelled = true;
      window.clearTimeout(again);
    };
  }, [taskId, mock, busy]);

  const send = useCallback(
    async (text: string, mode: SendMode, extra?: SendExtra) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setActionError(null);
      const before = stateRef.current.status;
      const id = `local-${Date.now()}`;
      dispatch({ type: "local.user", id, text: trimmed, mode, at: new Date().toISOString() });
      if (mock) {
        mockRef.current?.send(trimmed, mode);
        return;
      }
      ensureStream.current();
      try {
        await sendMessage(taskId, { text: trimmed, mode, ...(extra?.references?.length ? { references: extra.references } : {}), ...(extra?.interaction ? { interaction: extra.interaction } : {}), ...(extra?.attachments?.length ? { attachments: extra.attachments } : {}) });
      } catch (err) {
        setActionError(messageOf(err, "The message could not be sent."));
        // Nothing started: take the message back out of the queue and stop showing the task as busy.
        if (mode === "queue") dispatch({ type: "local.unqueue", id });
        if (!isBusy(before)) dispatch({ type: "local.status", status: before });
      }
    },
    [taskId, mock],
  );

  const stop = useCallback(async () => {
    setActionError(null);
    if (mock) {
      mockRef.current?.stop();
      return;
    }
    try {
      await stopTask(taskId);
      dispatch({ type: "local.status", status: "stopped" });
    } catch (err) {
      setActionError(messageOf(err, "The task could not be stopped."));
    }
  }, [taskId, mock]);

  const answer = useCallback(
    async (requestId: string, reply: { choice?: string; answer?: string }) => {
      setActionError(null);
      const value = reply.choice ?? reply.answer ?? "";
      if (mock) {
        dispatch({ type: "local.resolved", requestId, value });
        mockRef.current?.respond(requestId);
        return;
      }
      try {
        await respondRequest(taskId, { requestId, ...reply });
        dispatch({ type: "local.resolved", requestId, value });
      } catch (err) {
        setActionError(messageOf(err, "The answer could not be sent."));
      }
    },
    [taskId, mock],
  );

  const reload = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  const patchTask = useCallback((patch: Partial<TaskSummary>) => setTask((current) => (current ? { ...current, ...patch } : current)), []);

  return { state, task, loading, loadError, actionError, mock, send, stop, answer, reload, patchTask };
}
