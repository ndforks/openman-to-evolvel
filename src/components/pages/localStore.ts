// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** A value kept in localStorage and readable from React without effects. */
import { useSyncExternalStore } from "react";

export interface LocalStore<T> {
  read: () => T;
  write: (value: T) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
  fallback: T;
}

export function createLocalStore<T>(key: string, fallback: T, parse: (raw: unknown) => T): LocalStore<T> {
  const listeners = new Set<() => void>();
  let memory: string | null = null; // used when storage is unavailable (private mode, blocked cookies)
  let storageOk = true;
  let cachedRaw: string | null | undefined;
  let cached: T = fallback;

  const getRaw = (): string | null => {
    if (!storageOk) return memory;
    try {
      return window.localStorage.getItem(key);
    } catch {
      storageOk = false;
      return memory;
    }
  };

  const read = (): T => {
    const raw = getRaw();
    if (raw === cachedRaw) return cached;
    cachedRaw = raw;
    if (raw === null) {
      cached = fallback;
    } else {
      try {
        cached = parse(JSON.parse(raw));
      } catch {
        cached = fallback;
      }
    }
    return cached;
  };

  const emit = () => listeners.forEach((listener) => listener());

  const write = (value: T) => {
    const raw = JSON.stringify(value);
    memory = raw;
    if (storageOk) {
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        storageOk = false;
      }
    }
    emit();
  };

  const clear = () => {
    memory = null;
    if (storageOk) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        storageOk = false;
      }
    }
    emit();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return { read, write, clear, subscribe, fallback };
}

/** Current value of a store. Returns the fallback while rendering on the server and during hydration. */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(
    store.subscribe,
    store.read,
    () => store.fallback,
  );
}
