/**
 * Batch research cost estimate. Model prices are Orgo's rate card for the models its proxy serves
 * (orgo-web `lib/credits-shared.ts`, read in `research/orgo-web-billing.md`), charged at list price plus
 * Orgo's margin (`CREDITS.modelMarkupPercent` in `src/lib/orgo/plans.ts`). Client-safe.
 */
import { CREDITS } from "@/lib/orgo/plans";
import type { CostEstimate } from "./types";

/** Raw US dollars per million tokens: input, output, and the cache-read multiple of input. */
const RATES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.1 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.05 },
};

/**
 * Tokens one sub-agent uses for one item: a few searches and page reads, then a short structured answer.
 * Most of its input is the growing conversation re-read each turn; about 70% of that is served from cache.
 */
const PER_ITEM = { low: { input: 40_000, output: 2_500 }, high: { input: 140_000, output: 7_000 } };
/** The main agent: planning, launching the batches, reading every result and merging. */
const MERGE = { low: { input: 60_000, output: 6_000 }, high: { input: 220_000, output: 16_000 } };
const CACHED_SHARE = 0.7;

function cost(model: string, input: number, output: number): number {
  const r = RATES[model] ?? RATES["claude-sonnet-5-5"];
  const fresh = input * (1 - CACHED_SHARE) * r.input;
  const cached = input * CACHED_SHARE * r.input * r.cacheRead;
  return ((fresh + cached + output * r.output) / 1_000_000) * (1 + CREDITS.modelMarkupPercent / 100);
}

const round2 = (n: number) => Math.max(0.01, Math.round(n * 100) / 100);

export function estimateWideResearch(subtasks: number, model: string): CostEstimate {
  const m = RATES[model] ? model : "claude-sonnet-5-5";
  const low = subtasks * cost(m, PER_ITEM.low.input, PER_ITEM.low.output) + cost(m, MERGE.low.input, MERGE.low.output);
  const high = subtasks * cost(m, PER_ITEM.high.input, PER_ITEM.high.output) + cost(m, MERGE.high.input, MERGE.high.output);
  return {
    subtasks,
    model: m,
    lowUsd: round2(low),
    highUsd: round2(high),
    basis: `${subtasks} sub-agents at ${PER_ITEM.low.input / 1000}k-${PER_ITEM.high.input / 1000}k input and ${PER_ITEM.low.output / 1000}-${PER_ITEM.high.output / 1000}k output tokens each, plus planning and merging, on ${m} at Orgo's price (list + ${CREDITS.modelMarkupPercent}%).`,
  };
}
