// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
"use client";

/** Carries the choice made in the Create menu over to the "Automate your work" screen. */
import { create } from "zustand";
import type { AutomationStart } from "../data/automations";

interface AutomationDraft {
  start: AutomationStart | null;
  prompt: string;
  setStart: (start: AutomationStart | null) => void;
  setPrompt: (prompt: string) => void;
  reset: () => void;
}

export const useAutomationDraft = create<AutomationDraft>((set) => ({
  start: null,
  prompt: "",
  setStart: (start) => set({ start }),
  setPrompt: (prompt) => set({ prompt }),
  reset: () => set({ start: null, prompt: "" }),
}));
