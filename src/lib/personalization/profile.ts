// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * The user's personalization profile and the knowledge switch, stored in the per-user settings
 * document (`settings.data.personalization`). One source of truth for the Settings tab, the
 * Personalization page, every agent run (`agentContextFor`) and Hermes' own USER.md (`./hermes-user`).
 * Server only.
 */
import { brand } from "@/config/brand";
import { getSettings, patchSettings } from "@/lib/db/settings";

export interface Personalization {
  nickname: string;
  occupation: string;
  /** "More about you". */
  about: string;
  /** "Custom instructions". */
  instructions: string;
}

export interface PersonalizationDoc extends Personalization {
  /** The global "Use knowledge" switch. When false, no knowledge entry reaches the agent. */
  useKnowledge: boolean;
  updatedAt: string | null;
}

export const PERSONALIZATION_FIELDS = ["nickname", "occupation", "about", "instructions"] as const;
export const PERSONALIZATION_LIMITS: Record<keyof Personalization, number> = { nickname: 50, occupation: 100, about: 2000, instructions: 3000 };

export const EMPTY_PERSONALIZATION: PersonalizationDoc = { nickname: "", occupation: "", about: "", instructions: "", useKnowledge: true, updatedAt: null };

function parse(raw: unknown): PersonalizationDoc {
  const src = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: PersonalizationDoc = { ...EMPTY_PERSONALIZATION };
  for (const f of PERSONALIZATION_FIELDS) if (typeof src[f] === "string") out[f] = (src[f] as string).slice(0, PERSONALIZATION_LIMITS[f]);
  if (typeof src.useKnowledge === "boolean") out.useKnowledge = src.useKnowledge;
  if (typeof src.updatedAt === "string") out.updatedAt = src.updatedAt;
  return out;
}

export async function getPersonalization(userId: string): Promise<PersonalizationDoc> {
  return parse((await getSettings(userId)).personalization);
}

export async function savePersonalization(userId: string, patch: Partial<Personalization> & { useKnowledge?: boolean }): Promise<PersonalizationDoc> {
  const clean: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const f of PERSONALIZATION_FIELDS) if (typeof patch[f] === "string") clean[f] = patch[f]!.slice(0, PERSONALIZATION_LIMITS[f]);
  if (typeof patch.useKnowledge === "boolean") clean.useKnowledge = patch.useKnowledge;
  const doc = await patchSettings(userId, { personalization: clean });
  return parse(doc.personalization);
}

export function hasProfile(p: Personalization): boolean {
  return PERSONALIZATION_FIELDS.some((f) => p[f].trim() !== "");
}

/** The profile as plain lines (also what goes into USER.md). Empty string when nothing is filled in. */
export function profileText(p: Personalization): string {
  const lines: string[] = [];
  if (p.nickname.trim()) lines.push(`Call the user: ${p.nickname.trim()}`);
  if (p.occupation.trim()) lines.push(`Occupation: ${p.occupation.trim()}`);
  if (p.about.trim()) lines.push(`About the user: ${p.about.trim()}`);
  if (p.instructions.trim()) lines.push(`Custom instructions from the user: ${p.instructions.trim()}`);
  return lines.join("\n");
}

/**
 * What every run should carry: the profile as system guidance, and whether knowledge may be used.
 * Never throws; a database failure gives an empty profile with knowledge on (the old behaviour).
 */
export async function agentContextFor(userId: string): Promise<{ instructions: string | null; useKnowledge: boolean }> {
  try {
    const p = await getPersonalization(userId);
    const text = profileText(p);
    return {
      instructions: text ? `About the user (from their ${brand.name} personalization settings; apply across all tasks):\n${text}` : null,
      useKnowledge: p.useKnowledge,
    };
  } catch {
    return { instructions: null, useKnowledge: true };
  }
}
