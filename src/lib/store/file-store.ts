/** File-backed store. Works with no account: one folder per task under `.data/tasks/`. */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AgentEvent } from "@/lib/agent/types";
import { isValidTaskId, type Store, type TaskPatch, type TaskRecord } from "./types";

interface FileStoreState {
  /** One promise chain per task so writes to the same task never interleave. */
  locks: Map<string, Promise<unknown>>;
  lastSeq: Map<string, number>;
}

// Kept on globalThis so dev-server module reloads do not fork the lock table.
const g = globalThis as typeof globalThis & { __openmanFileStore?: FileStoreState };
const state: FileStoreState = (g.__openmanFileStore ??= { locks: new Map(), lastSeq: new Map() });

function dataRoot(): string {
  return path.join(process.env.OPENMAN_DATA_DIR || path.join(process.cwd(), ".data"), "tasks");
}

function taskDir(id: string): string {
  if (!isValidTaskId(id)) throw new Error(`Invalid task id: ${id}`);
  return path.join(dataRoot(), id);
}

function locked<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = state.locks.get(id) ?? Promise.resolve();
  const next = previous.then(work, work);
  const tail = next.catch(() => undefined);
  state.locks.set(id, tail);
  void tail.then(() => {
    if (state.locks.get(id) === tail) state.locks.delete(id);
  });
  return next;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Write to a temp file then rename, so a crash never leaves a half-written task.json. */
async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

async function readEvents(id: string): Promise<AgentEvent[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(taskDir(id), "events.jsonl"), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const events: AgentEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line) as AgentEvent);
    } catch {
      // A torn last line after a crash is skipped rather than failing the whole task.
    }
  }
  return events;
}

class FileStore implements Store {
  readonly kind = "file" as const;
  readonly ownerId = "local";

  async listTasks(opts: { archived?: boolean | "all" } = {}): Promise<TaskRecord[]> {
    let names: string[];
    try {
      names = await fs.readdir(dataRoot());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const tasks = await Promise.all(
      names.filter(isValidTaskId).map((name) => readJson<TaskRecord>(path.join(dataRoot(), name, "task.json")).catch(() => null)),
    );
    const archived = opts.archived ?? false;
    return tasks
      .filter((t): t is TaskRecord => t !== null)
      .filter((t) => archived === "all" || (t.archived ?? false) === archived)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  }

  async getTask(id: string): Promise<TaskRecord | null> {
    if (!isValidTaskId(id)) return null;
    return readJson<TaskRecord>(path.join(taskDir(id), "task.json"));
  }

  createTask(task: TaskRecord): Promise<void> {
    return locked(task.id, async () => {
      const dir = taskDir(task.id);
      await fs.mkdir(dir, { recursive: true });
      await writeJsonAtomic(path.join(dir, "task.json"), task);
      state.lastSeq.set(task.id, 0);
    });
  }

  updateTask(id: string, patch: TaskPatch): Promise<void> {
    return locked(id, async () => {
      const file = path.join(taskDir(id), "task.json");
      const current = await readJson<TaskRecord>(file);
      if (!current) throw new Error(`Task not found: ${id}`);
      await writeJsonAtomic(file, { ...current, ...patch, id: current.id, createdAt: current.createdAt });
    });
  }

  appendEvents(id: string, events: AgentEvent[]): Promise<void> {
    if (events.length === 0) return Promise.resolve();
    return locked(id, async () => {
      const known = state.lastSeq.get(id) ?? (await this.readLastSeq(id));
      // Skip anything already on disk so a retried batch does not duplicate lines.
      const fresh = events.filter((e) => e.seq > known);
      if (fresh.length === 0) return;
      const dir = taskDir(id);
      await fs.mkdir(dir, { recursive: true });
      await fs.appendFile(path.join(dir, "events.jsonl"), fresh.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
      state.lastSeq.set(id, fresh[fresh.length - 1].seq);
    });
  }

  async listEvents(id: string, afterSeq = 0): Promise<AgentEvent[]> {
    if (!isValidTaskId(id)) return [];
    const events = await readEvents(id);
    return afterSeq > 0 ? events.filter((e) => e.seq > afterSeq) : events;
  }

  async lastSeq(id: string): Promise<number> {
    if (!isValidTaskId(id)) return 0;
    return state.lastSeq.get(id) ?? (await this.readLastSeq(id));
  }

  deleteTask(id: string): Promise<boolean> {
    if (!isValidTaskId(id)) return Promise.resolve(false);
    return locked(id, async () => {
      const dir = taskDir(id);
      try {
        await fs.access(path.join(dir, "task.json"));
      } catch {
        return false;
      }
      await fs.rm(dir, { recursive: true, force: true });
      state.lastSeq.delete(id);
      return true;
    });
  }

  private async readLastSeq(id: string): Promise<number> {
    const events = await readEvents(id);
    const last = events.length ? events[events.length - 1].seq : 0;
    state.lastSeq.set(id, last);
    return last;
  }
}

const instance = new FileStore();
export function fileStore(): Store {
  return instance;
}
