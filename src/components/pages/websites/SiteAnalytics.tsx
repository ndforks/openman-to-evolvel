"use client";

/** Analytics of the published site: page views and visitors per day, top sources and pages. Logged by the site's own server on the user's computer. */
import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { getAnalytics } from "@/lib/websites/client";
import type { SiteAnalytics as Data, Website } from "@/lib/websites/types";
import { BTN, Card, Muted, errorText } from "./site-ui";

const RANGES = [7, 30, 90] as const;

function Chart({ days }: { days: Data["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.views));
  const w = 100 / days.length;
  return (
    <div className="flex flex-col gap-[6px]">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-[160px] w-full" role="img" aria-label="Page views and visitors per day">
        {days.map((d, i) => (
          <g key={d.day}>
            <rect x={i * w + w * 0.15} width={w * 0.7} y={40 - (d.views / max) * 38} height={(d.views / max) * 38} rx={0.4} className="fill-[var(--om-icon-3)] opacity-40">
              <title>{`${d.day}: ${d.views} views, ${d.visitors} visitors`}</title>
            </rect>
            <rect x={i * w + w * 0.3} width={w * 0.4} y={40 - (d.visitors / max) * 38} height={(d.visitors / max) * 38} rx={0.3} className="fill-[var(--om-icon-accent)]">
              <title>{`${d.day}: ${d.visitors} visitors`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <div className="flex justify-between text-[11px] text-[var(--om-text-3)]">
        <span>{days[0]?.day}</span>
        <span className="flex items-center gap-[10px]">
          <span className="flex items-center gap-[4px]">
            <span className="size-[8px] rounded-[2px] bg-[var(--om-icon-accent)]" /> Visitors
          </span>
          <span className="flex items-center gap-[4px]">
            <span className="size-[8px] rounded-[2px] bg-[var(--om-icon-3)] opacity-40" /> Page views
          </span>
        </span>
        <span>{days[days.length - 1]?.day}</span>
      </div>
    </div>
  );
}

function Table({ head, rows }: { head: [string, string]; rows: [string, number][] }) {
  if (!rows.length) return <Muted>Nothing yet.</Muted>;
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="flex flex-col gap-[4px] text-[13px]">
      <div className="flex justify-between text-[12px] text-[var(--om-text-3)]">
        <span>{head[0]}</span>
        <span>{head[1]}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="relative flex justify-between overflow-hidden rounded-[6px] px-[8px] py-[5px]">
          <span className="absolute inset-y-0 left-0 bg-[var(--om-fill)]" style={{ width: `${(v / max) * 100}%` }} />
          <span className="relative truncate text-[var(--om-text-1)]">{k}</span>
          <span className="relative tabular-nums text-[var(--om-text-2)]">{v}</span>
        </div>
      ))}
    </div>
  );
}

export function SiteAnalytics({ site }: { site: Website }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (n: number) => {
    setLoading(true);
    try {
      setData(await getAnalytics(site.id, n));
      setError(null);
    } catch (err) {
      setError(errorText(err, "Analytics could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [site.id]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(days), 0);
    return () => window.clearTimeout(t);
  }, [days, load]);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex items-center justify-between">
        <div className="flex gap-[4px] rounded-[10px] border border-[var(--om-border)] p-[3px]">
          {RANGES.map((n) => (
            <button key={n} type="button" onClick={() => setDays(n)} className={cn("h-[26px] rounded-[7px] px-[10px] text-[13px]", days === n ? "bg-[var(--om-fill-strong)] text-[var(--om-text-1)]" : "text-[var(--om-text-3)]")}>
              {n} days
            </button>
          ))}
        </div>
        <button type="button" className={BTN} disabled={loading} onClick={() => void load(days)}>
          <RotateCw size={14} aria-hidden className={loading ? "animate-spin" : undefined} /> Refresh
        </button>
      </div>
      {site.status !== "published" ? <Muted>Analytics count visits to the published site. Publish it to start counting; past visits stay here after you unpublish.</Muted> : null}
      {error ? <Muted>{error}</Muted> : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-[12px]">
            <Card>
              <div className="text-[12px] text-[var(--om-text-3)]">Visitors</div>
              <div className="text-[28px] font-semibold tabular-nums text-[var(--om-text-1)]">{data.totals.visitors}</div>
            </Card>
            <Card>
              <div className="text-[12px] text-[var(--om-text-3)]">Page views</div>
              <div className="text-[28px] font-semibold tabular-nums text-[var(--om-text-1)]">{data.totals.views}</div>
            </Card>
          </div>
          <Card title="Over time">
            <Chart days={data.days} />
          </Card>
          <div className="grid grid-cols-1 gap-[16px] min-[760px]:grid-cols-2">
            <Card title="Traffic sources">
              <Table head={["Source", "Visitors"]} rows={data.sources.map((s) => [s.source, s.visitors])} />
            </Card>
            <Card title="Top pages">
              <Table head={["Page", "Views"]} rows={data.pages.map((p) => [p.path, p.views])} />
            </Card>
          </div>
          <Muted>Counted by the site&apos;s own server on your computer: no cookies and no third-party tracker. A visitor is an anonymous hash that changes every day.</Muted>
        </>
      ) : null}
    </div>
  );
}
