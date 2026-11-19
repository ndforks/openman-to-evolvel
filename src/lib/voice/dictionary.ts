// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The user's voice input dictionary (Settings > General, pref `general.voiceDictionary`): names and terms
 * speech recognition often gets wrong. Used three ways: as a hint to the engine (Whisper's initial prompt,
 * ElevenLabs keyterms), and as a final correction pass over the text. Safe in the browser and on the server.
 */

export const DICTIONARY_PREF = "general.voiceDictionary";

/** Clean list: trimmed, non-empty, unique (case-insensitive), at most 200 terms of 50 characters. */
export function cleanDictionary(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const term = raw.trim().replace(/\s+/g, " ").slice(0, 50);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    out.push(term);
    if (out.length >= 200) break;
  }
  return out;
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Rewrites the text so dictionary terms are spelled the user's way:
 * - an exact match in another case ("open man" -> "OpenMan" style casing) is replaced;
 * - a term written as one word is matched when the recognizer split it ("open man" -> "OpenMan");
 * - a single word one edit away (two for 8+ letters), with a similar first letter, is replaced
 *   ("Argo" -> "Orgo"); four-letter terms only replace capitalized words. Short common words are left alone.
 */
export function applyDictionary(text: string, terms: string[]): string {
  if (!text || terms.length === 0) return text;
  let out = text;
  for (const term of terms) {
    // Exact phrase in any case, or a one-word term split by spaces.
    const letters = term.replace(/\s+/g, "");
    const spaced = letters.length >= 4 && !/\s/.test(term) ? letters.split(/(?=[A-Z])/).filter(Boolean) : [];
    const patterns = [escape(term).replace(/\\? /g, "\\s+")];
    if (spaced.length > 1) patterns.push(spaced.map(escape).join("\\s*"));
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])(?:${patterns.join("|")})(?![\\p{L}\\p{N}])`, "giu"), term);
  }
  // Near misses, word by word, for single-word terms.
  const single = terms.filter((t) => !/\s/.test(t) && t.length >= 4);
  if (single.length === 0) return out;
  return out.replace(/[\p{L}][\p{L}\p{N}'’-]*/gu, (word) => {
    const lower = word.toLowerCase();
    let best: string | null = null;
    let bestScore = Infinity;
    for (const term of single) {
      const t = term.toLowerCase();
      if (t === lower) return term;
      if (Math.abs(t.length - lower.length) > 2) continue;
      // Four-letter terms only replace a capitalized word (a name the recognizer misspelled), never "same" for "Sage".
      if (t.length < 5 && word[0] === lower[0]) continue;
      const allowed = t.length >= 8 ? 2 : 1;
      const d = distance(lower, t);
      const vowel = /[aeiou]/;
      const sameStart = lower[0] === t[0] || (vowel.test(lower[0]) && vowel.test(t[0]));
      if (d <= allowed && sameStart && d < bestScore) {
        best = term;
        bestScore = d;
      }
    }
    return best ?? word;
  });
}
