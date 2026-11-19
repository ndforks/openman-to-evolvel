// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Organic Intelligence, Inc.
/**
 * Shared helpers for the artifact viewers: what kind of file something is, where its bytes are, and
 * parsers for the table formats (CSV/TSV, and XLSX read in the browser with no library: a ZIP reader on
 * top of `DecompressionStream("deflate-raw")` plus the sheet XML).
 */

/** One file to show: a name, where to load it inline, and where to download it. */
export interface ArtifactSource {
  name: string;
  url: string;
  downloadUrl?: string;
  mime?: string;
  size?: number;
}

export type ArtifactKind = "markdown" | "code" | "text" | "pdf" | "image" | "table" | "chart" | "audio" | "video" | "html" | "slides" | "binary";

const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

const CODE_EXT = new Set(["js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "sh", "bash", "go", "rs", "java", "c", "h", "cpp", "sql", "rb", "php", "swift", "kt", "lua", "r", "css", "scss", "yaml", "yml", "toml", "xml", "ini", "tex", "ipynb", "json", "jsonl"]);
const TEXT_EXT = new Set(["txt", "log", "srt", "vtt", "env"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]);
const AUDIO_EXT = new Set(["mp3", "wav", "m4a", "ogg", "aac", "flac", "opus"]);
const VIDEO_EXT = new Set(["mp4", "webm", "mov", "m4v"]);

export function kindOf(file: { name: string; mime?: string }): ArtifactKind {
  const e = ext(file.name);
  const mime = file.mime ?? "";
  if (file.name === "deck.json") return "slides";
  if (/\.chart\.json$/i.test(file.name)) return "chart";
  if (e === "md" || e === "markdown" || e === "mdx" || mime === "text/markdown") return "markdown";
  if (e === "pdf" || mime === "application/pdf") return "pdf";
  if (IMAGE_EXT.has(e) || mime.startsWith("image/")) return "image";
  if (["csv", "tsv", "xlsx", "xlsm"].includes(e) || /csv|spreadsheetml|tab-separated/.test(mime)) return "table";
  if (AUDIO_EXT.has(e) || mime.startsWith("audio/")) return "audio";
  if (VIDEO_EXT.has(e) || mime.startsWith("video/")) return "video";
  if (e === "html" || e === "htm" || mime === "text/html") return "html";
  if (CODE_EXT.has(e)) return "code";
  if (TEXT_EXT.has(e) || mime.startsWith("text/")) return "text";
  return "binary";
}

export function taskFileSource(taskId: string, file: { fileId: string; name: string; mime?: string; size?: number }): ArtifactSource {
  const base = `/api/tasks/${encodeURIComponent(taskId)}/files/${encodeURIComponent(file.fileId)}`;
  return { name: file.name, url: base, downloadUrl: `${base}?download=1`, mime: file.mime, size: file.size };
}

export function formatBytes(n: number | undefined): string {
  if (n === undefined) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* --------------------------------------------------------------------- CSV */

export type Cell = string | number | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
}

/** RFC 4180 CSV (quoted fields, doubled quotes, newlines inside quotes). Numbers become numbers. */
export function parseDelimited(text: string, delimiter = ","): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  const push = () => {
    row.push(wasQuoted ? field : toCell(field));
    field = "";
    wasQuoted = false;
  };
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      quoted = true;
      wasQuoted = true;
    } else if (ch === delimiter) push();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      push();
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    push();
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && (r[0] === null || r[0] === "")));
}

function toCell(raw: string): Cell {
  const t = raw.trim();
  if (t === "") return null;
  if (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t) && !/^0\d/.test(t)) return Number(t);
  return raw;
}

/* -------------------------------------------------------------------- XLSX */

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The entries of a ZIP archive, read from its central directory. */
async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file");
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const lNameLen = view.getUint16(local + 26, true);
    const lExtraLen = view.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + compSize);
    const data = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
    if (data) out.set(name, dec.decode(data));
  }
  return out;
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** The sheets of an .xlsx workbook as rows of cells (values as last calculated; formulas are not re-run). */
export async function parseXlsx(buf: ArrayBuffer, maxRows = 5000): Promise<Sheet[]> {
  const files = await unzip(buf, (n) => n === "xl/workbook.xml" || n === "xl/sharedStrings.xml" || n === "xl/_rels/workbook.xml.rels" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const parser = new DOMParser();
  const xml = (name: string) => (files.has(name) ? parser.parseFromString(files.get(name)!, "application/xml") : null);
  const text = (el: Element) => Array.from(el.getElementsByTagName("t"), (t) => t.textContent ?? "").join("");
  const shared = Array.from(xml("xl/sharedStrings.xml")?.getElementsByTagName("si") ?? [], text);
  const rels = new Map(Array.from(xml("xl/_rels/workbook.xml.rels")?.getElementsByTagName("Relationship") ?? [], (r) => [r.getAttribute("Id") ?? "", (r.getAttribute("Target") ?? "").replace(/^\/?xl\//, "")]));
  const sheetsMeta = Array.from(xml("xl/workbook.xml")?.getElementsByTagName("sheet") ?? [], (s, i) => {
    const rid = s.getAttribute("r:id") ?? s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    return { name: s.getAttribute("name") ?? `Sheet${i + 1}`, path: `xl/${rels.get(rid) ?? `worksheets/sheet${i + 1}.xml`}` };
  });
  const sheets: Sheet[] = [];
  for (const meta of sheetsMeta.length ? sheetsMeta : [{ name: "Sheet1", path: "xl/worksheets/sheet1.xml" }]) {
    const doc = xml(meta.path);
    if (!doc) continue;
    const rows: Cell[][] = [];
    for (const r of Array.from(doc.getElementsByTagName("row")).slice(0, maxRows)) {
      const row: Cell[] = [];
      for (const c of Array.from(r.getElementsByTagName("c"))) {
        const idx = colIndex(c.getAttribute("r") ?? "A");
        const type = c.getAttribute("t");
        const v = c.getElementsByTagName("v")[0]?.textContent ?? null;
        let value: Cell = null;
        if (type === "s" && v !== null) value = shared[Number(v)] ?? "";
        else if (type === "inlineStr") value = text(c);
        else if (type === "b") value = v === "1" ? "TRUE" : v === null ? null : "FALSE";
        else if (type === "str" || type === "e") value = v;
        else if (v !== null) value = Number.isFinite(Number(v)) ? Number(v) : v;
        // A formula never calculated (openpyxl writes none): show the formula rather than an empty cell.
        if (value === null) {
          const f = c.getElementsByTagName("f")[0]?.textContent;
          if (f) value = `=${f}`;
        }
        while (row.length < idx) row.push(null);
        row[idx] = value;
      }
      rows.push(row);
    }
    sheets.push({ name: meta.name, rows });
  }
  return sheets;
}

/** Loads any table file into sheets. */
export async function loadTable(src: ArtifactSource): Promise<Sheet[]> {
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`Could not load ${src.name} (${res.status})`);
  const e = ext(src.name);
  if (e === "xlsx" || e === "xlsm" || /spreadsheetml/.test(src.mime ?? "")) return parseXlsx(await res.arrayBuffer());
  const text = await res.text();
  return [{ name: src.name, rows: parseDelimited(text, e === "tsv" ? "\t" : ",") }];
}
