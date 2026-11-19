// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Advanced automation: turns a plain-language description into an automation draft (timing rules,
 * feed / webhook / email triggers and the instruction). Deterministic, so the same words always give
 * the same draft, and the person reviews it before it is created.
 */
import type { RepeatRule, TriggerInput } from "./types";

export interface ParsedDraft {
  name: string;
  prompt: string;
  repeat: RepeatRule | null;
  triggers: TriggerInput[];
  /** One line per thing that was understood, shown on the review card. */
  understood: string[];
}

const DAYS: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const DAY_RE = "(sun|mon|tues?|wed|thu(?:rs?)?|fri|sat)[a-z]*";

function toHHMM(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function readTime(text: string): { time: string; match: string } | null {
  const named = text.match(/\b(?:at\s+)?(noon|midnight)\b/i);
  if (named) return { time: named[1].toLowerCase() === "noon" ? "12:00" : "00:00", match: named[0] };
  const a = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?![\d/])/i);
  const b = a ? null : text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i);
  const c = a || b ? null : text.match(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)(?=\W|$)/i);
  const parts = a ? [a[0], a[1], a[2], a[3]] : b ? [b[0], b[1], b[2], b[3]] : c ? [c[0], c[1], undefined, c[2]] : null;
  if (parts) {
    let h = Number(parts[1]);
    const min = Number(parts[2] ?? 0);
    const ap = (parts[3] ?? "").toLowerCase().replace(/\./g, "");
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return { time: toHHMM(h, min), match: parts[0] as string };
  }
  if (/\bmorning\b/i.test(text)) return { time: "09:00", match: "" };
  if (/\b(afternoon)\b/i.test(text)) return { time: "14:00", match: "" };
  if (/\b(evening|tonight)\b/i.test(text)) return { time: "18:00", match: "" };
  return null;
}

function localDate(tz: string, addDays: number): string {
  const d = new Date(Date.now() + addDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts;
}

export function parseDescription(text: string, tz: string, opts: { emailTriggers?: boolean } = {}): ParsedDraft {
  const understood: string[] = [];
  let rest = ` ${text.trim()} `;
  let repeat: RepeatRule | null = null;
  const timers: RepeatRule[] = [];
  const triggers: TriggerInput[] = [];
  const cut = (re: RegExp) => {
    rest = rest.replace(re, " ");
  };

  const time = readTime(text);
  const at = time?.time ?? "09:00";

  // Intervals: every 15 minutes / every 2 hours / hourly.
  const iv = text.match(/\bevery\s+(\d+)\s*(min(?:ute)?s?|h(?:ou)?rs?)\b/i);
  const hourly = /\b(hourly|every hour)\b/i.test(text);
  if (iv) {
    const n = Number(iv[1]);
    const minutes = /^h/i.test(iv[2]) ? n * 60 : n;
    timers.push({ freq: "interval", everyMinutes: minutes });
    cut(new RegExp(iv[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  } else if (hourly) {
    timers.push({ freq: "interval", everyMinutes: 60 });
    cut(/\b(hourly|every hour)\b/i);
  }

  if (/\b(every\s+weekday|weekdays|every\s+work(ing)?\s*day|monday\s+(to|through|-)\s+friday)\b/i.test(text)) {
    timers.push({ freq: "weekdays", time: at });
    cut(/\b(on\s+)?(every\s+weekday|weekdays|every\s+work(ing)?\s*day|monday\s+(to|through|-)\s+friday)\b/i);
  } else if (/\b(every\s+day|daily|each\s+day|every\s+(morning|evening|afternoon|night))\b/i.test(text)) {
    timers.push({ freq: "daily", time: at });
    cut(/\b(every\s+day|daily|each\s+day|every\s+(morning|evening|afternoon|night))\b/i);
  } else if (/\b(month|monthly)\b/i.test(text)) {
    const dates = [...text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi)].map((m) => Number(m[1])).filter((d) => d >= 1 && d <= 31);
    timers.push({ freq: "monthly", dates: dates.length ? [...new Set(dates)] : [1], time: at });
    cut(/\b(on\s+the\s+)?(\d{1,2}(st|nd|rd|th)(\s*(,|and)\s*(the\s+)?\d{1,2}(st|nd|rd|th))*)?\s*(of\s+)?(every|each)\s+month\b|\bmonthly\b/gi);
  } else {
    const dayMatches = [...text.matchAll(new RegExp(`\\b(?:every|each|on)?\\s*${DAY_RE}s?\\b`, "gi"))];
    const days = [...new Set(dayMatches.map((m) => DAYS[m[1].toLowerCase()]).filter((d) => d !== undefined))];
    if (days.length && /\b(every|each|weekly|on)\b|days?s\b|\w+days\b/i.test(text)) {
      timers.push({ freq: "weekly", days, time: at });
      for (const m of dayMatches) cut(new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      cut(/\b(every|each)\s+week\b/gi);
    } else if (/\b(weekly|every\s+week)\b/i.test(text)) {
      timers.push({ freq: "weekly", days: [1], time: at });
      cut(/\b(weekly|every\s+week)\b/gi);
    } else if (/\btomorrow\b/i.test(text)) {
      timers.push({ freq: "once", date: localDate(tz, 1), time: at });
      cut(/\btomorrow\b/gi);
    } else if (/\btoday\b|\btonight\b/i.test(text) && time) {
      timers.push({ freq: "once", date: localDate(tz, 0), time: at });
      cut(/\btoday\b|\btonight\b/gi);
    } else {
      const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (iso) {
        timers.push({ freq: "once", date: iso[1], time: at });
        cut(new RegExp(`\\b(on\\s+)?${iso[1]}\\b`));
      }
    }
  }
  if (time?.match) cut(new RegExp(time.match.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  cut(/\b(in the )?(morning|afternoon|evening)\b/gi);

  // Feeds: any URL said with feed words.
  for (const m of text.matchAll(/https?:\/\/[^\s,)]+/gi)) {
    const url = m[0].replace(/[.;]+$/, "");
    const nearby = text.slice(Math.max(0, m.index! - 60), m.index! + url.length + 40);
    if (/\b(rss|feed|atom|posts?|publishes|blog|new (items?|articles?|episodes?))\b/i.test(nearby) || /\.(xml|rss)(\?|$)|\/feed\/?$|\/rss\/?$/i.test(url)) {
      triggers.push({ type: "rss", url, conditions: [] });
      understood.push(`When ${url} has new items`);
    }
  }
  if (/\bwebhook\b|\bis called\b|\bgets? a (post|request)\b/i.test(text)) {
    triggers.push({ type: "webhook", conditions: [] });
    understood.push("When the webhook is called");
    cut(/\b(when(ever)?\s+)?(the\s+|a\s+|my\s+)?webhook(\s+is\s+(called|hit|triggered)|\s+receives\s+\w+)?\b/gi);
  }
  if (opts.emailTriggers && /\b(email|e-mail)s?\b.*\b(arrives?|receive|get|comes? in|sent to)\b|\bwhen (i|we) (get|receive) an? (email|e-mail)\b/i.test(text)) {
    triggers.push({ type: "email", senders: [], conditions: [] });
    understood.push("When an email arrives at the automation's address");
  }

  // "Every 30 minutes check this feed": feeds are polled anyway, so the interval is how often to look, not a separate run.
  if (triggers.some((t) => t.type === "rss")) {
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].freq === "interval") timers.splice(i, 1);
  }
  if (timers.length === 1 && triggers.length === 0) repeat = timers[0];
  else for (const rule of timers) triggers.unshift({ type: "timer", rule });
  for (const rule of timers) understood.unshift(describe(rule));

  let prompt = rest
    .replace(/\b(when(ever)?|if)\s*,/gi, " ")
    .replace(/^\s*(please\s+)?(,|and|then|to)\s+/i, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/^[\s,.;:-]+|[\s,;:-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (prompt.length < 4) prompt = text.trim();
  prompt = prompt.charAt(0).toUpperCase() + prompt.slice(1);
  const name = prompt.length > 60 ? `${prompt.slice(0, 57).replace(/\s+\S*$/, "")}…` : prompt;
  return { name, prompt, repeat, triggers: triggers.slice(0, 10), understood };
}

function describe(rule: RepeatRule): string {
  switch (rule.freq) {
    case "interval":
      return `Every ${rule.everyMinutes} minutes`;
    case "once":
      return `Once on ${rule.date} at ${rule.time}`;
    case "daily":
      return `Every day at ${rule.time}`;
    case "weekdays":
      return `Every weekday at ${rule.time}`;
    case "weekly":
      return `Weekly on ${rule.days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")} at ${rule.time}`;
    case "monthly":
      return `Monthly on day ${rule.dates.join(", ")} at ${rule.time}`;
  }
}
