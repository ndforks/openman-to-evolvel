"use client";

/**
 * Click-to-edit panel for the website preview. The preview's inspector (injected into the preview only) sends the
 * selected element; style changes are shown live in the preview, then sent to the agent as a scoped follow-up in the
 * site's task, together with "edit with a prompt".
 */
import { Send, X } from "lucide-react";
import { useState } from "react";
import { sendMessage } from "@/lib/agent/client";
import { toast } from "@/components/ui/toast";
import { BTN, BTN_PRIMARY, INPUT, errorText } from "./site-ui";

export interface Selection {
  selector: string;
  tag: string;
  id: string | null;
  classes: string;
  text: string;
  html: string;
  path: string;
  styles: Record<string, string>;
}

/** rgb(a) from getComputedStyle to #rrggbb for a colour input (transparent becomes empty). */
function hex(c: string | undefined): string {
  const m = c?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m || m[4] === "0") return "";
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

const FIELDS: { key: string; label: string; css: string; kind: "color" | "text" | "select"; options?: string[] }[] = [
  { key: "color", label: "Text colour", css: "color", kind: "color" },
  { key: "backgroundColor", label: "Background", css: "background-color", kind: "color" },
  { key: "fontSize", label: "Font size", css: "font-size", kind: "text" },
  { key: "fontWeight", label: "Weight", css: "font-weight", kind: "select", options: ["300", "400", "500", "600", "700", "800"] },
  { key: "textAlign", label: "Align", css: "text-align", kind: "select", options: ["left", "center", "right", "justify"] },
  { key: "padding", label: "Padding", css: "padding", kind: "text" },
  { key: "margin", label: "Margin", css: "margin", kind: "text" },
  { key: "borderWidth", label: "Border width", css: "border-width", kind: "text" },
  { key: "borderColor", label: "Border colour", css: "border-color", kind: "color" },
  { key: "borderRadius", label: "Radius", css: "border-radius", kind: "text" },
];

function describe(sel: Selection): string {
  return [
    `Page: ${sel.path}`,
    `Selector: \`${sel.selector}\``,
    `Element: ${sel.html}`,
    sel.text ? `Its text starts: "${sel.text.slice(0, 80)}"` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function ElementEditor({ taskId, selection, onStyle, onClose }: { taskId: string; selection: Selection; onStyle: (styles: Record<string, string>) => void; onClose: () => void }) {
  const initial = () => Object.fromEntries(FIELDS.map((f) => [f.key, f.kind === "color" ? hex(selection.styles[f.key]) : (selection.styles[f.key] ?? "")]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [start] = useState<Record<string, string>>(initial);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const changed = FIELDS.filter((f) => values[f.key] !== start[f.key] && values[f.key] !== "");

  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (value) onStyle({ [key]: value });
  };

  const send = async (text: string, done: string) => {
    setBusy(true);
    try {
      await sendMessage(taskId, { text, mode: "queue" });
      toast(done, "success");
      onClose();
    } catch (err) {
      toast(errorText(err, "The change could not be sent to the agent."), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute bottom-[12px] right-[12px] z-10 flex max-h-[calc(100%-24px)] w-[320px] flex-col gap-[10px] overflow-y-auto rounded-[14px] border border-[var(--om-border)] bg-[var(--om-surface)] p-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
      <div className="flex items-center justify-between gap-[8px]">
        <span className="min-w-0 truncate font-mono text-[12px] text-[var(--om-text-2)]" title={selection.selector}>
          &lt;{selection.tag}&gt;{selection.id ? `#${selection.id}` : ""} {selection.text ? `“${selection.text.slice(0, 30)}”` : ""}
        </span>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-[6px] p-[4px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-[8px]">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-[3px] text-[11px] text-[var(--om-text-3)]">
            {f.label}
            {f.kind === "color" ? (
              <input type="color" value={values[f.key] || "#000000"} onChange={(e) => set(f.key, e.target.value)} className="h-[30px] w-full cursor-pointer rounded-[8px] border border-[var(--om-border)] bg-transparent" />
            ) : f.kind === "select" ? (
              <select value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} className={`${INPUT} h-[30px] text-[13px]`}>
                {[values[f.key], ...(f.options ?? [])].filter((v, i, a) => v && a.indexOf(v) === i).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} className={`${INPUT} h-[30px] text-[13px]`} />
            )}
          </label>
        ))}
      </div>
      <button
        type="button"
        className={BTN_PRIMARY}
        disabled={busy || !changed.length}
        onClick={() =>
          void send(
            `Restyle one element of the website (I selected it in the preview).\n${describe(selection)}\nSet: ${changed.map((f) => `${f.css}: ${values[f.key]}`).join("; ")}.\nFind it in the source (by its selector, classes or text), change only this element's styles (use a class or rule in the stylesheet, not a global change), keep everything else as it is, then commit.`,
            "Style change sent to the agent.",
          )
        }
      >
        Apply {changed.length ? `${changed.length} change${changed.length === 1 ? "" : "s"}` : "style"}
      </button>
      <form
        className="flex flex-col gap-[6px] border-t border-[var(--om-border-subtle)] pt-[10px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!prompt.trim()) return;
          void send(
            `Edit one element of the website (I selected it in the preview).\n${describe(selection)}\nWhat to do: ${prompt.trim()}\nChange only this element unless the request needs more, then commit.`,
            "Edit sent to the agent.",
          );
        }}
      >
        <span className="text-[11px] text-[var(--om-text-3)]">Edit with a prompt</span>
        <div className="flex gap-[6px]">
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Make this a gradient button…" className={`${INPUT} flex-1 text-[13px]`} />
          <button type="submit" className={BTN} disabled={busy || !prompt.trim()} aria-label="Send">
            <Send size={14} aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
