"use client";

/**
 * The body of a "Update project?" card: what the agent proposes to change in the project, as a diff. Instructions get
 * a line diff; files added and removed and the skills list are shown as lists. Nothing changes until approval.
 */
import { useEffect, useState } from "react";
import { FileMinus, FilePlus } from "lucide-react";
import { cn } from "@/components/ui/cn";

interface Proposal {
  id: string;
  projectId: string;
  status: "open" | "applied" | "dismissed";
  summary: string;
  projectName: string;
  changes: {
    instructions?: { before: string; after: string };
    addFiles?: { name: string; content: string }[];
    removeFiles?: { id: string; name: string }[];
    skills?: { before: string[]; after: string[] };
  };
}

type Line = { kind: "same" | "add" | "del"; text: string };

/** Line diff by longest common subsequence (instructions are at most 20,000 characters). */
export function lineDiff(before: string, after: string): Line[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (a.length * b.length > 400_000) return [...a.map((text) => ({ kind: "del" as const, text })), ...b.map((text) => ({ kind: "add" as const, text }))];
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ kind: "del", text: a[i++] });
    else out.push({ kind: "add", text: b[j++] });
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++] });
  while (j < b.length) out.push({ kind: "add", text: b[j++] });
  return out;
}

const SECTION = "flex flex-col gap-[6px]";
const LABEL = "text-[12px] font-medium uppercase tracking-[0.04em] text-[var(--om-text-3)]";
const BOX = "tv-scroll max-h-[240px] overflow-auto rounded-[8px] border border-[var(--om-border-subtle)] bg-[var(--om-fill-sunken)] py-[6px] font-mono text-[12.5px] leading-[19px]";

function DiffLines({ lines }: { lines: Line[] }) {
  return (
    <div className={BOX} aria-label="Instructions diff">
      {lines.map((l, k) => (
        <div
          key={k}
          data-diff={l.kind}
          className={cn("whitespace-pre-wrap break-words px-[10px]", l.kind === "add" && "bg-[rgba(46,160,67,0.16)] text-[var(--om-text-1)]", l.kind === "del" && "bg-[rgba(248,81,73,0.14)] text-[var(--om-text-2)] line-through decoration-[rgba(248,81,73,0.5)]", l.kind === "same" && "text-[var(--om-text-3)]")}
        >
          <span aria-hidden="true" className="inline-block w-[14px] select-none">
            {l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}
          </span>
          {l.text || " "}
        </div>
      ))}
    </div>
  );
}

export function ProposalDiff({ proposalId, fallback }: { proposalId: string; fallback?: string }) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/projects/proposals/${encodeURIComponent(proposalId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ proposal: Proposal }>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => alive && setProposal(b.proposal))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [proposalId]);

  if (failed || !proposal) {
    return failed && fallback ? <p className="text-[14px] leading-5 text-[var(--om-text-2)]">{fallback}</p> : <div className="h-[60px] animate-pulse rounded-[8px] bg-[var(--om-fill)]" />;
  }
  const c = proposal.changes;
  return (
    <div className="flex flex-col gap-[12px]" data-proposal={proposal.id}>
      {proposal.summary ? <p className="text-[14px] leading-5 text-[var(--om-text-2)]">{proposal.summary}</p> : null}
      {c.instructions ? (
        <div className={SECTION}>
          <span className={LABEL}>Instructions</span>
          <DiffLines lines={lineDiff(c.instructions.before, c.instructions.after)} />
        </div>
      ) : null}
      {c.addFiles?.length || c.removeFiles?.length ? (
        <div className={SECTION}>
          <span className={LABEL}>Files</span>
          <ul className="flex flex-col gap-[4px]">
            {(c.addFiles ?? []).map((f) => (
              <li key={`a-${f.name}`} className="flex flex-col gap-[4px]">
                <button type="button" onClick={() => setOpen(open === f.name ? null : f.name)} className="flex cursor-pointer items-center gap-[8px] text-left text-[14px] text-[var(--om-text-1)] outline-none hover:opacity-80">
                  <FilePlus size={15} className="shrink-0 text-[var(--om-success)]" />
                  <span className="min-w-0 flex-1 truncate">Add {f.name}</span>
                  <span className="shrink-0 text-[12px] text-[var(--om-text-3)]">{open === f.name ? "Hide" : "Preview"}</span>
                </button>
                {open === f.name ? <pre className={cn(BOX, "whitespace-pre-wrap break-words px-[10px] text-[var(--om-text-2)]")}>{f.content.slice(0, 20_000)}</pre> : null}
              </li>
            ))}
            {(c.removeFiles ?? []).map((f) => (
              <li key={`r-${f.id}`} className="flex items-center gap-[8px] text-[14px] text-[var(--om-text-2)]">
                <FileMinus size={15} className="shrink-0 text-[var(--om-danger)]" />
                <span className="min-w-0 flex-1 truncate">Remove {f.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {c.skills ? (
        <div className={SECTION}>
          <span className={LABEL}>Skills</span>
          <div className="flex flex-wrap gap-[6px] text-[13px]">
            {[...new Set([...c.skills.before, ...c.skills.after])].map((s) => {
              const added = !c.skills!.before.includes(s);
              const removed = !c.skills!.after.includes(s);
              return (
                <span key={s} className={cn("rounded-[6px] px-[8px] py-[2px]", added ? "bg-[rgba(46,160,67,0.16)]" : removed ? "bg-[rgba(248,81,73,0.14)] line-through" : "bg-[var(--om-fill)]")}>
                  {added ? "+ " : removed ? "- " : ""}
                  {s}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      {proposal.status !== "open" ? <p className="text-[13px] text-[var(--om-text-3)]">{proposal.status === "applied" ? "Applied to the project." : "Dismissed: the project was not changed."}</p> : null}
    </div>
  );
}
