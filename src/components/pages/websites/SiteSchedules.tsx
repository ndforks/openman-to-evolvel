"use client";

/** Scheduled jobs that run inside the published site (cron), with run history. */
import { Play, Plus, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { getSchedules, runSchedule, saveSchedules, timeAgo } from "@/lib/websites/client";
import type { ScheduleRun, SiteSchedule, Website } from "@/lib/websites/types";
import { BTN, BTN_PRIMARY, Card, INPUT, Muted, errorText } from "./site-ui";

type Draft = Omit<SiteSchedule, "id"> & { id?: string };
const EMPTY: Draft = { name: "", cron: "0 9 * * *", command: "", enabled: true };

export function SiteSchedules({ site }: { site: Website }) {
  const [jobs, setJobs] = useState<Draft[]>([]);
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [active, setActive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getSchedules(site.id)
      .then((r) => {
        setJobs(r.schedules);
        setRuns(r.runs);
        setActive(r.active);
        setDirty(false);
      })
      .catch((err: unknown) => toast(errorText(err), "error"));
  }, [site.id]);
  useEffect(load, [load]);

  const edit = (i: number, patch: Partial<Draft>) => {
    setJobs((list) => list.map((j, k) => (k === i ? { ...j, ...patch } : j)));
    setDirty(true);
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <Card
        title="Schedules"
        actions={
          <button type="button" className={BTN} onClick={() => (setJobs((l) => [...l, { ...EMPTY }]), setDirty(true))} disabled={jobs.length >= 20}>
            <Plus size={14} aria-hidden /> Add job
          </button>
        }
      >
        <Muted>
          Jobs run inside the published site on your computer, on a cron schedule in the computer&apos;s time (minute hour day month weekday). A command runs in the site
          folder with the site&apos;s secrets and <code>SITE_URL</code> (for example <code>curl -s $SITE_URL/api/digest</code>).
          {active ? "" : " Publish the site to start running them."}
        </Muted>
        <div className="mt-[12px] flex flex-col gap-[10px]">
          {jobs.map((j, i) => (
            <div key={j.id ?? `new-${i}`} className="flex flex-col gap-[8px] rounded-[10px] border border-[var(--om-border)] p-[10px]">
              <div className="flex flex-wrap items-center gap-[8px]">
                <input className={`${INPUT} w-[200px]`} value={j.name} placeholder="Name" aria-label="Job name" onChange={(e) => edit(i, { name: e.target.value })} />
                <input className={`${INPUT} w-[150px] font-mono`} value={j.cron} placeholder="0 9 * * *" aria-label="Schedule" onChange={(e) => edit(i, { cron: e.target.value })} />
                <Switch checked={j.enabled} onCheckedChange={(v) => edit(i, { enabled: v })} aria-label="Enabled" />
                <span className="flex-1" />
                {j.id && active ? (
                  <button
                    type="button"
                    className={BTN}
                    onClick={() =>
                      void runSchedule(site.id, j.id!)
                        .then(() => {
                          toast("Started. Its run appears below within a few seconds.", "success");
                          window.setTimeout(load, 8000);
                        })
                        .catch((err: unknown) => toast(errorText(err), "error"))
                    }
                  >
                    <Play size={14} aria-hidden /> Run now
                  </button>
                ) : null}
                <button type="button" className={BTN} aria-label="Remove job" onClick={() => (setJobs((l) => l.filter((_, k) => k !== i)), setDirty(true))}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>
              <input className={`${INPUT} w-full font-mono text-[13px]`} value={j.command} placeholder="Command, e.g. node scripts/cleanup.mjs" aria-label="Command" onChange={(e) => edit(i, { command: e.target.value })} />
            </div>
          ))}
          {!jobs.length ? <Muted>No jobs yet.</Muted> : null}
        </div>
        {dirty ? (
          <div className="mt-[12px] flex justify-end gap-[8px]">
            <button type="button" className={BTN} onClick={load}>
              Discard
            </button>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                saveSchedules(site.id, jobs)
                  .then((r) => {
                    setJobs(r.schedules);
                    setDirty(false);
                    toast("Schedules saved.", "success");
                  })
                  .catch((err: unknown) => toast(errorText(err), "error"))
                  .finally(() => setBusy(false));
              }}
            >
              Save schedules
            </button>
          </div>
        ) : null}
      </Card>
      <Card
        title="Run history"
        actions={
          <button type="button" className={BTN} aria-label="Refresh" onClick={load}>
            <RotateCw size={14} aria-hidden />
          </button>
        }
      >
        {runs.length ? (
          <div className="flex flex-col">
            {runs.map((r, i) => (
              <details key={`${r.startedAt}-${i}`} className="border-t border-[var(--om-border-subtle)] py-[8px] text-[13px] first:border-t-0">
                <summary className="flex cursor-pointer items-center gap-[8px] text-[var(--om-text-1)]">
                  <span className={`size-[7px] rounded-full ${r.ok ? "bg-[var(--om-success)]" : "bg-[var(--om-danger)]"}`} />
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[var(--om-text-3)]">
                    {timeAgo(r.startedAt)} · {r.ok ? "succeeded" : `failed (exit ${r.code ?? "killed"})`} · {Math.max(0, Math.round((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 100) / 10)} s
                  </span>
                </summary>
                {r.output ? <pre className="mt-[6px] max-h-[200px] overflow-auto rounded-[8px] bg-[var(--om-fill)] p-[8px] text-[12px] text-[var(--om-text-2)]">{r.output}</pre> : null}
              </details>
            ))}
          </div>
        ) : (
          <Muted>No runs yet.</Muted>
        )}
      </Card>
    </div>
  );
}
