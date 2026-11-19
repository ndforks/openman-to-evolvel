/**
 * Turns the raw result preview of a tool call into something a person can read.
 *
 * The agent runtime hands results over the way the model sees them: wrapped in an
 * `<untrusted_tool_result>` block with a standing notice, usually as JSON (`{"success": true, "output": "..."}`,
 * `{"data": {"web": [...]}}`), and cut off after about a thousand characters, so the JSON is often incomplete.
 * Everything here is display-only and treats the text purely as data. No React, no browser APIs.
 */

const WRAPPER_OPEN = /^\s*<untrusted_tool_result\b[^>]*>\s*/i;
const WRAPPER_NOTICE = /^The following content was retrieved from an external source\.[^\n]*(?:\n+|$)/;
const WRAPPER_CLOSE = /\s*<\/untrusted_tool_result>\s*$/i;
/** Keys that mark a JSON object as a tool's result envelope rather than data the user asked to see. */
const ENVELOPE_KEYS = ["success", "exit_code", "output", "stdout", "stderr", "results", "data", "responses", "outcome", "error", "content"];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonRecord = { [key: string]: Json };

const isRecord = (value: Json | undefined): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: Json | undefined): string | null => (typeof value === "string" && value.trim() ? value : null);
const oneLine = (value: string) => value.replace(/\\[rn]/g, " ").replace(/\s+/g, " ").replace(/(^|\s)#{1,6}(?=\s|$)/g, "$1").replace(/\s+/g, " ").trim();
const dropEllipsis = (value: string) => value.replace(/…$/, "");

interface Hit {
  url: string;
  title: string;
  description: string;
  content: string;
}

function toHit(value: Json): Hit | null {
  if (!isRecord(value)) return null;
  const url = text(value.url) ?? text(value.link) ?? text(value.href);
  if (!url) return null;
  return { url, title: text(value.title) ?? text(value.name) ?? "", description: text(value.description) ?? text(value.snippet) ?? text(value.summary) ?? "", content: text(value.content) ?? text(value.markdown) ?? text(value.text) ?? "" };
}

/** First list of link-like records found within a few levels: search results or extracted pages. */
function findHits(value: Json, depth = 0): Hit[] | null {
  if (Array.isArray(value)) {
    const hits = value.map(toHit).filter((hit): hit is Hit => hit !== null);
    return hits.length > 0 && hits.length >= value.length / 2 ? hits : null;
  }
  if (!isRecord(value) || depth > 2) return null;
  for (const key of ["web", "results", "organic", "items", "pages", "data"]) {
    const child = value[key];
    if (child === undefined) continue;
    const hits = findHits(child, depth + 1);
    if (hits) return hits;
  }
  return null;
}

function hitsToMarkdown(hits: Hit[]): string {
  // Pages that were read in full come with their text; search results only with a line of description.
  if (hits.some((hit) => hit.content)) {
    return hits
      .map((hit) => {
        const content = dropEllipsis(hit.content).trim();
        // A page that is data or markup rather than prose is shown as it is, not interpreted as Markdown.
        const body = /^[{[<]/.test(content) ? `\`\`\`\n${content.replace(/`{3,}/g, "``")}\n\`\`\`` : content;
        return [`## ${hit.title || hit.url.replace(/^https?:\/\/(www\.)?/, "")}`, `<${hit.url}>`, body].filter(Boolean).join("\n\n");
      })
      .join("\n\n");
  }
  return hits
    .map((hit) => {
      const title = (hit.title || hit.url).replace(/[[\]]/g, "");
      const description = oneLine(dropEllipsis(hit.description)).slice(0, 240);
      return `- [${title}](${hit.url})${description ? `  \n  ${description}` : ""}`;
    })
    .join("\n");
}

function fromValue(value: Json): string | null {
  if (typeof value === "string") return value;
  const hits = findHits(value);
  if (hits) return hitsToMarkdown(hits);
  if (!isRecord(value)) return null;
  // A question that was answered: show the answer.
  if (Array.isArray(value.responses)) {
    const answers = value.responses.map((r) => (isRecord(r) ? (text(r.user_response) ?? text(r.answer)) : null)).filter((a): a is string => a !== null);
    if (answers.length > 0) return answers.map((a) => `Answered: ${a}`).join("\n");
  }
  const out = text(value.output) ?? text(value.stdout) ?? text(value.result) ?? text(value.content) ?? text(value.text) ?? text(value.message);
  const err = text(value.stderr) ?? text(value.error);
  const failed = value.success === false || (typeof value.exit_code === "number" && value.exit_code !== 0);
  if (out || err) return [out, err && (!out || failed) ? err : null].filter((part): part is string => part !== null).join("\n");
  if (isRecord(value.data)) return fromValue(value.data);
  return null;
}

/**
 * Every string stored under `key` in JSON text, in order of appearance. Reads by hand instead of parsing,
 * so it also works on JSON that was cut off in the middle of a value.
 */
function stringFields(json: string, key: string): string[] {
  const found: string[] = [];
  const pattern = new RegExp(`"${key}"\\s*:\\s*"`, "g");
  while (pattern.exec(json)) {
    let value = "";
    let i = pattern.lastIndex;
    for (; i < json.length; i += 1) {
      const char = json[i];
      if (char === '"') break;
      if (char !== "\\") {
        value += char;
        continue;
      }
      const next = json[i + 1];
      if (next === undefined) break;
      i += 1;
      if (next === "n") value += "\n";
      else if (next === "t") value += "\t";
      else if (next === "r") value += "";
      else if (next === "u" && /^[0-9a-f]{4}$/i.test(json.slice(i + 1, i + 5))) {
        value += String.fromCharCode(parseInt(json.slice(i + 1, i + 5), 16));
        i += 4;
      } else value += next;
    }
    found.push(dropEllipsis(value));
    // Skip past the value, so keys quoted inside it are not mistaken for fields.
    pattern.lastIndex = Math.min(i + 1, json.length);
  }
  return found;
}

/** Best effort on JSON that does not parse (it was cut off): pull out the fields worth showing. */
function fromPartial(json: string): string | null {
  const urls = stringFields(json, "url");
  if (urls.length > 0) {
    const titles = stringFields(json, "title");
    const descriptions = stringFields(json, "description");
    const contents = stringFields(json, "content");
    return hitsToMarkdown(urls.map((url, i) => ({ url, title: titles[i] ?? "", description: descriptions[i] ?? "", content: contents[i] ?? "" })));
  }
  const out = stringFields(json, "output")[0] ?? stringFields(json, "stdout")[0] ?? stringFields(json, "content")[0];
  const err = stringFields(json, "stderr")[0] ?? stringFields(json, "error")[0];
  const failed = /"success"\s*:\s*false/.test(json) || /"exit_code"\s*:\s*[1-9]/.test(json);
  if (out?.trim() || err?.trim()) return [out?.trim() ? out : null, err?.trim() && (!out?.trim() || failed) ? err : null].filter((part): part is string => part !== null).join("\n");
  return null;
}

const cache = new Map<string, string>();

/** The readable form of a tool result preview. Plain results (a command's output, a write receipt) come back unchanged. */
export function cleanOutput(raw: string | undefined): string {
  if (!raw) return "";
  const known = cache.get(raw);
  if (known !== undefined) return known;

  const opened = raw.replace(WRAPPER_OPEN, "");
  const wrapped = opened !== raw;
  const body = (wrapped ? opened.replace(WRAPPER_NOTICE, "") : raw).replace(WRAPPER_CLOSE, "").trim();
  let result = wrapped ? body : raw;

  if (/^[{[]/.test(body)) {
    let parsed: Json | undefined;
    try {
      parsed = JSON.parse(body) as Json;
    } catch {
      parsed = undefined;
    }
    if (parsed === undefined) {
      // Only text that came in the wrapper is known to be a result envelope; anything else stays as it is.
      if (wrapped) result = fromPartial(body) ?? dropEllipsis(body);
    } else if (wrapped || (isRecord(parsed) && ENVELOPE_KEYS.some((key) => key in parsed))) {
      result = fromValue(parsed) ?? JSON.stringify(parsed, null, 2);
    }
  }

  result = result.replace(/\s+$/, "");
  if (cache.size > 400) cache.clear();
  cache.set(raw, result);
  return result;
}

/** True when the result envelope itself reports a failure (`"success": false` or a non-zero exit code). */
export function outputFailed(raw: string | undefined): boolean {
  if (!raw || !WRAPPER_OPEN.test(raw)) return false;
  const head = raw.slice(0, 600);
  return /"success"\s*:\s*false/.test(head) || /"exit_code"\s*:\s*[1-9]/.test(head);
}
