// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

import { useEffect } from "react";

const EPOCH_KEY = "openman:epoch";
const OWNED_PREFIXES = ["openman:", "om."];
const OWNED_KEYS = ["composer-prefs"];

function owned(key: string): boolean {
  return key !== EPOCH_KEY && (OWNED_KEYS.includes(key) || OWNED_PREFIXES.some((p) => key.startsWith(p)));
}

/**
 * Clears this app's saved browser state after a "fresh start" on the server.
 * Only keys this app owns are removed, so other projects on the same localhost port keep theirs.
 */
export function EpochGuard() {
  useEffect(() => {
    let cancelled = false;
    fetch("/api/epoch", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ epoch: string }>)
      .then(({ epoch }) => {
        if (cancelled) return;
        const seen = window.localStorage.getItem(EPOCH_KEY);
        if (seen === epoch) return;
        let removed = 0;
        for (const storage of [window.localStorage, window.sessionStorage]) {
          const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => !!k && owned(k));
          keys.forEach((k) => storage.removeItem(k));
          removed += keys.length;
        }
        window.localStorage.setItem(EPOCH_KEY, epoch);
        if (removed > 0) window.location.replace("/app");
      })
      .catch(() => {
        // Offline or storage blocked: keep whatever state exists.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
