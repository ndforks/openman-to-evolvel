/**
 * Lets another page hand a prompt to the Home composer.
 * The text waits in sessionStorage, so it survives the navigation and a sign-in round trip.
 * "send": Home starts the task as soon as it opens. "draft": Home shows the text for the user to finish.
 */
export const PENDING_PROMPT_KEY = "openman:pending-prompt";
export const DRAFT_PROMPT_KEY = "openman:draft-prompt";

export type HandoffMode = "send" | "draft";

export function stashPrompt(text: string, mode: HandoffMode = "draft"): void {
  try {
    window.sessionStorage.setItem(mode === "send" ? PENDING_PROMPT_KEY : DRAFT_PROMPT_KEY, text);
  } catch {
    // Storage is blocked (private mode): the page still opens, only the text is lost.
  }
}

/** Reads and clears the waiting prompt, so it is used exactly once. */
export function takeStashedPrompt(): { text: string; send: boolean } | null {
  try {
    const storage = window.sessionStorage;
    const pending = storage.getItem(PENDING_PROMPT_KEY);
    const draft = storage.getItem(DRAFT_PROMPT_KEY);
    storage.removeItem(PENDING_PROMPT_KEY);
    storage.removeItem(DRAFT_PROMPT_KEY);
    if (pending && pending.trim() !== "") return { text: pending, send: true };
    if (draft && draft !== "") return { text: draft, send: false };
  } catch {
    // Nothing stored, or storage is blocked.
  }
  return null;
}
