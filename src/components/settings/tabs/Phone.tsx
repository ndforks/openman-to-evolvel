"use client";

/** Settings → Phone: the agent's own number (AgentPhone), who may reach it, outbound texts awaiting permission, and call/SMS history. */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Ellipsis, Smartphone } from "lucide-react";
import { useThemeClass } from "@/components/modals/theme";
import { Button, DIVIDER, Pane, SelectBox, TextInput, cn, useCopy, type Option } from "@/components/settings/ui";
import { useUI } from "@/lib/ui-store";
import { call, phonePriceLine, shortDate, useResource, type CallRecord, type PhoneAvailable, type PhoneLine, type PhoneOverview, type SmsRecord } from "./mailPhoneApi";

type Region = "US" | "CA";

const REGIONS: Option<Region>[] = [
  { value: "US", label: "United States (+1)" },
  { value: "CA", label: "Canada (+1)" },
];

/** Fills the pane below the 70px title so the empty state sits in the middle of it. */
const FILL = "min-h-[calc(min(660px,100vh_-_68px)_-_126px)]";
const MENU_CONTENT = "z-[120] min-w-[170px] rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[4px] font-sans text-[var(--om-text-1)] shadow-[0_8px_32px_rgba(0,0,0,0.32)]";
const MENU_ITEM = "flex h-[32px] cursor-pointer select-none items-center rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)]";
const ERROR_LINE = "text-[13px] leading-[18px] text-[var(--om-danger-solid)]";
const MUTED_LINE = "text-[13px] leading-[18px] text-[var(--om-text-3)]";
const PHONE_PATTERN = /^\+?[\d\s().-]{8,20}$/;

function smsState(line: PhoneLine): string {
  if (line.outboundSms === "enabled") return "Calls and SMS ready";
  if (line.outboundSms === "registration_required") return "Receives calls and SMS · sending SMS needs carrier registration";
  if (line.outboundSms === "activating") return "Receives calls and SMS · sending SMS is activating";
  return "Receives calls and SMS";
}

/** The phone glyph used on the number card and the empty state. */
function PhoneArt() {
  return <Smartphone size={26} strokeWidth={1.6} aria-hidden="true" className="shrink-0 text-[var(--om-icon-2)]" />;
}

function LineCard({ line, onRelease }: { line: PhoneLine; onRelease: () => void }) {
  const themeClass = useThemeClass();
  const [copied, copy] = useCopy();
  return (
    <div className={cn("flex h-[61px] shrink-0 items-center gap-[13px] rounded-[12px] border bg-[var(--om-bg-sidebar)] pl-[13px] pr-[11px]", DIVIDER)}>
      <PhoneArt />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{copied ? "Copied" : line.number}</div>
        <div className="truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">{smsState(line)}</div>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={`Options for ${line.number}`}
          className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]"
        >
          <Ellipsis size={14} strokeWidth={2.4} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={cn(themeClass, MENU_CONTENT)}>
            <DropdownMenu.Item className={MENU_ITEM} onSelect={() => copy(line.number)}>
              Copy number
            </DropdownMenu.Item>
            <DropdownMenu.Item className={cn(MENU_ITEM, "text-[var(--om-danger-solid)]")} onSelect={onRelease}>
              Release number
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="pb-[10px] pt-[26px] text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">{children}</h3>;
}

function HistoryRow({ title, meta, body, taskId }: { title: string; meta: string; body?: string; taskId: string | null }) {
  const close = useUI((s) => s.close);
  return (
    <div className={cn("flex flex-col gap-[3px] rounded-[10px] border bg-[var(--om-bg-sidebar)] px-[14px] py-[9px]", DIVIDER)}>
      <div className="flex items-baseline justify-between gap-[12px]">
        <div className="min-w-0 truncate text-[14px] leading-[20px] text-[var(--om-text-1)]">{title}</div>
        {taskId ? (
          <Link href={`/app/task/${taskId}`} onClick={close} className="shrink-0 text-[13px] leading-[18px] text-[var(--om-text-2)] underline decoration-1 [text-underline-position:from-font]">
            Open task
          </Link>
        ) : null}
      </div>
      <div className={MUTED_LINE}>{meta}</div>
      {body ? <div className="line-clamp-2 text-[13px] leading-[18px] text-[var(--om-text-2)]">{body}</div> : null}
    </div>
  );
}

const SMS_STATUS: Record<SmsRecord["status"], string> = {
  received: "Received",
  blocked: "Held: not an approved number",
  awaiting_approval: "Waiting for your permission",
  approved: "Approved",
  denied: "Not sent",
  sent: "Sent",
  failed: "Failed",
};

function Activity({ line }: { line: PhoneLine }) {
  const { data, reload } = useResource<{ messages: SmsRecord[]; calls: CallRecord[] }>("/api/phone/history");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pending = (data?.messages ?? []).filter((m) => m.status === "awaiting_approval");
  const decide = async (id: string, decision: "approve" | "deny") => {
    setBusy(id);
    setError(null);
    try {
      await call("POST", `/api/phone/approvals/${id}`, { decision });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {pending.length > 0 ? (
        <>
          <SubHeading>Waiting for your permission</SubHeading>
          <div className="flex flex-col gap-[8px]">
            {pending.map((m) => (
              <div key={m.id} className={cn("flex items-center gap-[12px] rounded-[10px] border bg-[var(--om-bg-sidebar)] px-[14px] py-[9px]", DIVIDER)}>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <div className="text-[14px] leading-[20px] text-[var(--om-text-1)]">
                    Send SMS from {line.number} to {m.counterpart}
                  </div>
                  <div className="line-clamp-2 text-[13px] leading-[18px] text-[var(--om-text-2)]">{m.body}</div>
                </div>
                <Button disabled={busy === m.id} onClick={() => void decide(m.id, "deny")}>
                  Deny
                </Button>
                <Button variant="primary" disabled={busy === m.id} onClick={() => void decide(m.id, "approve")}>
                  Allow
                </Button>
              </div>
            ))}
          </div>
          {error ? <div className={cn("pt-[8px]", ERROR_LINE)}>{error}</div> : null}
        </>
      ) : null}

      <SubHeading>Call history</SubHeading>
      {(data?.calls ?? []).length === 0 ? (
        <div className={MUTED_LINE}>No calls yet.</div>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {data!.calls.map((c) => (
            <HistoryRow
              key={c.id}
              title={`${c.direction === "outbound" ? "To" : "From"} ${c.counterpart || "unknown"}`}
              meta={`${shortDate(c.startedAt)} · ${c.status}${c.durationSeconds != null ? ` · ${Math.floor(c.durationSeconds / 60)}m ${c.durationSeconds % 60}s` : ""}`}
              body={c.summary ?? undefined}
              taskId={c.taskId}
            />
          ))}
        </div>
      )}

      <SubHeading>Text messages</SubHeading>
      {(data?.messages ?? []).length === 0 ? (
        <div className={MUTED_LINE}>No messages yet.</div>
      ) : (
        <div className="flex flex-col gap-[8px]">
          {data!.messages.map((m) => (
            <HistoryRow key={m.id} title={`${m.direction === "outbound" ? "To" : "From"} ${m.counterpart}`} meta={`${shortDate(m.createdAt)} · ${SMS_STATUS[m.status]}${m.error ? ` · ${m.error}` : ""}`} body={m.body} taskId={m.taskId} />
          ))}
        </div>
      )}
    </>
  );
}

function ApprovedCallers({ line, onChanged }: { line: PhoneLine; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = async (next: string[]) => {
    try {
      await call("PATCH", `/api/phone/${line.id}`, { approvedCallers: next });
      await onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };
  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!PHONE_PATTERN.test(draft.trim())) {
      setError("Enter a phone number with its country code, e.g. +1 415 555 0100.");
      return;
    }
    if (await save([...line.approvedSenders, draft.trim()])) setDraft("");
  };
  return (
    <>
      <SubHeading>Allowed callers</SubHeading>
      <div className={cn("pb-[10px]", MUTED_LINE)}>Anyone else who calls or texts is held back and starts nothing.</div>
      <form onSubmit={add} className="flex items-center gap-[7px]">
        <TextInput
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder="+1 415 555 0100"
          aria-label="Approved phone number"
          className="flex-1"
        />
        <Button type="submit" variant="primary" className="h-[31px] px-[12px]" disabled={line.approvedSenders.length >= 10}>
          Add
        </Button>
      </form>
      {error ? <div className={cn("pt-[6px]", ERROR_LINE)}>{error}</div> : null}
      {line.approvedSenders.length > 0 ? (
        <div className="mt-[10px] flex flex-wrap gap-[7px]">
          {line.approvedSenders.map((n) => (
            <span key={n} className={cn("inline-flex h-[28px] items-center gap-[6px] rounded-[7px] border bg-[var(--om-bg-sidebar)] pl-[9px] pr-[4px] text-[13px] leading-[16px] text-[var(--om-text-1)]", DIVIDER)}>
              {n}
              <button type="button" aria-label={`Remove ${n}`} onClick={() => void save(line.approvedSenders.filter((x) => x !== n))} className="flex size-[20px] cursor-pointer items-center justify-center rounded-[5px] text-[var(--om-icon-2)] hover:bg-[var(--om-fill)]">
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <div className={cn("pt-[8px]", MUTED_LINE)}>Nobody on the list. Add your own number first so you can reach the agent.</div>
      )}
    </>
  );
}

export default function PhoneTab() {
  const { data, error: loadError, loading, reload } = useResource<PhoneOverview>("/api/phone");
  const [creating, setCreating] = useState(false);
  const [region, setRegion] = useState<Region>("US");
  const [areaCode, setAreaCode] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<PhoneAvailable | null>(null);

  // Live inventory and price for the picker (`GET /api/phone/available`), refreshed when the area code is complete.
  useEffect(() => {
    if (!creating || (areaCode && areaCode.length !== 3)) return;
    let live = true;
    const qs = new URLSearchParams({ country: region, ...(areaCode ? { areaCode } : {}) });
    call<PhoneAvailable>("GET", `/api/phone/available?${qs}`).then(
      (next) => live && setAvailable(next),
      () => live && setAvailable(null),
    );
    return () => {
      live = false;
    };
  }, [creating, region, areaCode]);
  const pricing = available?.pricing ?? data?.pricing;

  const act = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (areaCode && !/^\d{3}$/.test(areaCode)) return setError("An area code is three digits.");
    if (owner && !PHONE_PATTERN.test(owner)) return setError("Enter your phone number with its country code.");
    const ok = await act(() => call("POST", "/api/phone", { country: region, ...(areaCode ? { areaCode } : {}), approvedCallers: owner ? [owner] : [] }));
    if (ok) setCreating(false);
  };

  if (loading || loadError || !data?.configured) {
    return (
      <Pane title="Phone">
        {loading ? null : <div className={cn("pt-[22px]", loadError ? ERROR_LINE : MUTED_LINE)}>{loadError ?? data?.notice ?? "Phone isn't set up on this server yet."}</div>}
      </Pane>
    );
  }

  const picker = (
    <form onSubmit={create} className="flex flex-col items-center gap-[8px]">
      <div className="flex items-center gap-[7px]">
        <SelectBox value={region} onValueChange={setRegion} options={REGIONS} ariaLabel="Country" className="h-[28px] w-[170px] px-[9px] text-[13px]" />
        <TextInput value={areaCode} onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Area code" aria-label="Area code (optional)" className="h-[28px] w-[90px] px-[9px]" />
        <TextInput value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Your phone" aria-label="Your phone number (allowed to reach the agent)" className="h-[28px] w-[140px] px-[9px]" />
      </div>
      <div className="flex items-center gap-[7px]">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Getting number…" : "Get number"}
        </Button>
        <Button onClick={() => setCreating(false)}>Cancel</Button>
      </div>
      {available && available.numbers.length > 0 ? (
        <div className={MUTED_LINE}>
          {available.widened ? `${areaCode} is sold out; nearby numbers are available` : "Available now"}: {available.numbers.slice(0, 2).map((n) => n.phoneNumber).join(", ")}
        </div>
      ) : available ? (
        <div className={MUTED_LINE}>No numbers are available for that choice right now.</div>
      ) : null}
      <div className={MUTED_LINE}>{pricing ? `${phonePriceLine(pricing)} Released when you cancel.` : "Released when you cancel."}</div>
      {error ? <div className={ERROR_LINE}>{error}</div> : null}
    </form>
  );

  const line = data.numbers[0];
  if (!line) {
    return (
      <Pane title="Phone">
        <div className={cn("flex flex-col items-center justify-center gap-[5px] text-center", FILL)}>
          <div className="flex size-[59px] shrink-0 items-center justify-center rounded-[12px] bg-[var(--om-fill)]">
            <PhoneArt />
          </div>
          <div className="pt-[6px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">No number yet</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Rent a number and the agent can place calls, pick up and trade texts.</div>
          <div className="mt-[7px] flex">
            {creating ? (
              picker
            ) : (
              <Button variant="primary" className="border border-[var(--om-btn-primary)] px-[8px]" onClick={() => setCreating(true)}>
                <span className="whitespace-pre">+{"  "}Get a number</span>
              </Button>
            )}
          </div>
        </div>
      </Pane>
    );
  }

  return (
    <Pane title="Phone">
      <div className="flex items-center justify-between pb-[12px] pt-[22px]">
        <h3 className="text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">Phone number</h3>
      </div>
      <LineCard
        line={line}
        onRelease={() => {
          if (window.confirm(`Release ${line.number}? The number goes back to the carrier and can't be recovered.`)) void act(() => call("DELETE", `/api/phone/${line.id}`));
        }}
      />
      {error ? <div className={cn("pt-[8px]", ERROR_LINE)}>{error}</div> : null}
      <ApprovedCallers line={line} onChanged={reload} />
      <Activity line={line} />
    </Pane>
  );
}
