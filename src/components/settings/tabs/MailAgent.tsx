"use client";

/** Settings → Mail <product>: the agent's inbound address, workflow emails, trigger emails and approved senders. */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Ellipsis, Mail, Pencil, Plus } from "lucide-react";
import { useThemeClass } from "@/components/modals/theme";
import { Button, cn, DIVIDER, TAB_LIST, tabClass, TextInput, useCopy } from "@/components/settings/ui";
import { brand } from "@/config/brand";
import { useUI } from "@/lib/ui-store";
import { call, newAddressDomain, shortDate, useResource, type MailOverview, type MailRecord } from "./mailPhoneApi";

/** Where "Open Automations" sends the user. */
const AUTOMATIONS_HREF = "/app/automations";
const LEARN_MORE_HREF = "/docs";

type MailTab = "settings" | "inbox";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const OUTLINE_BUTTON =
  "inline-flex h-[28px] shrink-0 cursor-pointer items-center justify-center gap-[5px] whitespace-nowrap rounded-[7px] border border-[var(--om-border-strong)] px-[8px] text-[13px] font-medium leading-[16px] text-[var(--om-text-1)] outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]";
const MENU_CONTENT = "z-[120] min-w-[170px] rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[4px] font-sans text-[var(--om-text-1)] shadow-[0_8px_32px_rgba(0,0,0,0.32)]";
const MENU_ITEM = "flex h-[32px] cursor-pointer select-none items-center rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)]";

/** Keep only characters that are safe in the part before the @. */
function toLocalPart(raw: string): string {
  return raw.trim().toLowerCase().replace(/@.*$/, "").replace(/[^a-z0-9._-]/g, "");
}

const ERROR_LINE = "text-[13px] leading-[18px] text-[var(--om-danger-solid)]";
const MUTED_LINE = "text-[13px] leading-[18px] text-[var(--om-text-3)]";

function PlusGlyph() {
  return (
    <Plus size={12} strokeWidth={2} aria-hidden="true" className="shrink-0" />
  );
}

function MailGlyph({ size = 14, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return (
    <Mail size={size} strokeWidth={strokeWidth} aria-hidden="true" className="shrink-0 text-[var(--om-icon-2)]" />
  );
}

/** Title + description on the left, one control on the right (18px between rows, 24px above the first). */
function MailRow({ title, description, first, children }: { title: ReactNode; description: ReactNode; first?: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-[24px]", first ? "pt-[24px]" : "pt-[18px]")}>
      <div className="flex min-w-0 flex-col gap-[2px]">
        <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{title}</div>
        <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">{description}</div>
      </div>
      {children}
    </div>
  );
}

/** The three-dot menu at the end of an address card. */
function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const themeClass = useThemeClass();
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={label}
        className="-mr-[5px] flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]"
      >
        <Ellipsis size={14} strokeWidth={2.4} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={cn(themeClass, MENU_CONTENT)}>
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** One 40px address card: mail icon, address, optional note, three-dot menu. */
function AddressCard({ address, note, onRemove, removeLabel = "Remove" }: { address: string; note?: string; onRemove: () => void; removeLabel?: string }) {
  const [copied, copy] = useCopy();
  return (
    <div className={cn("flex h-[40px] shrink-0 items-center gap-[9px] rounded-[10px] border bg-[var(--om-bg-sidebar)] px-[14px]", DIVIDER)}>
      <MailGlyph />
      <div className="flex min-w-0 flex-1 items-baseline gap-[10px]">
        <span className="shrink-0 text-[14px] leading-[20px] text-[var(--om-text-1)]">{copied ? "Copied" : address}</span>
        {note ? <span className="min-w-0 truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">{note}</span> : null}
      </div>
      <RowMenu label={`Options for ${address}`}>
        <DropdownMenu.Item className={MENU_ITEM} onSelect={() => copy(address)}>
          Copy address
        </DropdownMenu.Item>
        <DropdownMenu.Item className={cn(MENU_ITEM, "text-[var(--om-danger-solid)]")} onSelect={onRemove}>
          {removeLabel}
        </DropdownMenu.Item>
      </RowMenu>
    </div>
  );
}


const STATUS_LABEL: Record<MailRecord["status"], string> = {
  task: "Task created",
  continued: "Added to task",
  blocked: "Held for review",
  sent: "Reply sent",
  failed: "Reply failed",
  ignored: "Ignored",
};

/** Inbox: what the agent received and sent. Held mail can approve its sender or be dismissed. */
function InboxList({ address }: { address: string | null }) {
  const close = useUI((s) => s.close);
  const { data, error, reload } = useResource<{ messages: MailRecord[] }>("/api/mail/messages");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const act = async (id: string, action: "approve-sender" | "dismiss") => {
    setBusy(id);
    setActionError(null);
    try {
      await call("POST", `/api/mail/messages/${id}`, { action });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  if (error) return <div className={cn("pt-[24px]", ERROR_LINE)}>{error}</div>;
  const messages = data?.messages ?? [];
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center gap-[5px] pb-[56px] pt-[120px]">
        <MailGlyph size={28} strokeWidth={1.5} />
        <div className="pt-[6px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Inbox is empty</div>
        <div className={MUTED_LINE}>{address ? `Mail that reaches ${address} is listed here.` : "Incoming mail is listed here."}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-[8px] pt-[18px]">
      {actionError ? <div className={ERROR_LINE}>{actionError}</div> : null}
      {messages.map((m) => (
        <div key={m.id} className={cn("flex flex-col gap-[4px] rounded-[10px] border bg-[var(--om-bg-sidebar)] px-[14px] py-[10px]", DIVIDER)}>
          <div className="flex items-baseline justify-between gap-[12px]">
            <div className="min-w-0 truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{m.subject || "(no subject)"}</div>
            <div className="shrink-0 text-[12px] leading-[16px] text-[var(--om-text-3)]">{shortDate(m.createdAt)}</div>
          </div>
          <div className={cn("truncate", MUTED_LINE)}>
            {m.direction === "outbound" ? "To thread" : m.sender} · {STATUS_LABEL[m.status]}
            {m.reason ? ` · ${m.reason}` : ""}
          </div>
          {m.status === "blocked" || m.taskId ? (
            <div className="flex gap-[7px] pt-[4px]">
              {m.taskId ? (
                <Link href={`/app/task/${m.taskId}`} onClick={close} className={OUTLINE_BUTTON}>
                  Open task
                </Link>
              ) : null}
              {m.status === "blocked" && m.direction === "inbound" ? (
                <>
                  <button type="button" disabled={busy === m.id} className={OUTLINE_BUTTON} onClick={() => void act(m.id, "approve-sender")}>
                    Approve sender
                  </button>
                  <button type="button" disabled={busy === m.id} className={OUTLINE_BUTTON} onClick={() => void act(m.id, "dismiss")}>
                    Dismiss
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function MailAgentTab() {
  const close = useUI((s) => s.close);
  const [tab, setTab] = useState<MailTab>("settings");
  const { data, error: loadError, loading, reload } = useResource<MailOverview>("/api/mail");
  const [addressCopied, copyAddress] = useCopy();

  const [editingAddress, setEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addingWorkflow, setAddingWorkflow] = useState(false);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowUser, setWorkflowUser] = useState("");
  const [workflowInstructions, setWorkflowInstructions] = useState("");
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [addingSender, setAddingSender] = useState(false);
  const [senderDraft, setSenderDraft] = useState("");
  const [senderError, setSenderError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Every user gets an address: create it the first time this tab opens on a server where email is set up.
  const creating = useRef(false);
  useEffect(() => {
    if (!data?.configured || data.personal || creating.current) return;
    creating.current = true;
    void call("POST", "/api/mail")
      .then(() => reload())
      .catch((err: unknown) => setSetupError(err instanceof Error ? err.message : String(err)));
  }, [data, reload]);

  const address = data?.personal?.address ?? null;
  const senders = data?.senders ?? [];
  const workflows = data?.workflows ?? [];
  const newDomain = newAddressDomain(data);

  const run = async (fn: () => Promise<unknown>, onError: (message: string) => void): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      await reload();
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveAddress = async (event: FormEvent) => {
    event.preventDefault();
    const local = toLocalPart(addressDraft);
    if (!local) return;
    if (await run(() => call("PATCH", "/api/mail/address", { username: local }), setAddressError)) setEditingAddress(false);
  };

  const addWorkflow = async (event: FormEvent) => {
    event.preventDefault();
    if (!workflowName.trim()) return;
    const ok = await run(() => call("POST", "/api/mail/workflows", { name: workflowName.trim(), username: toLocalPart(workflowUser) || undefined, prompt: workflowInstructions.trim() }), setWorkflowError);
    if (!ok) return;
    setWorkflowName("");
    setWorkflowUser("");
    setWorkflowInstructions("");
    setAddingWorkflow(false);
  };

  const addSender = async (event: FormEvent) => {
    event.preventDefault();
    const email = senderDraft.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setSenderError("Enter a valid email address.");
      return;
    }
    if (await run(() => call("POST", "/api/mail/senders", { email }), setSenderError)) {
      setSenderDraft("");
      setSenderError(null);
      setAddingSender(false);
    }
  };

  const tabs: { id: MailTab; label: string }[] = [
    { id: "settings", label: "Settings" },
    { id: "inbox", label: "Inbox" },
  ];

  const header = (
    <div className={cn("flex flex-col gap-[4px] border-b pb-[16px] pt-[34px]", DIVIDER)}>
      <h2 className="text-[24px] font-medium leading-[30px] text-[var(--om-text-1)]">Mail {brand.name}</h2>
      <p className="text-[14px] leading-[20px] text-[var(--om-text-2)]">
        Forward or write to the agent and it starts a task. Copy teammates in to keep them in the loop.{"\u00a0"}
        <a href={LEARN_MORE_HREF} target="_blank" rel="noreferrer" className="underline">
          How it works
        </a>
      </p>
    </div>
  );

  if (loading || loadError || !data?.configured) {
    return (
      <div className="flex flex-col">
        {header}
        {loading ? null : <div className={cn("pt-[24px]", loadError ? ERROR_LINE : MUTED_LINE)}>{loadError ?? data?.notice ?? "Email isn't set up on this server yet."}</div>}
      </div>
    );
  }

  const nextChange = data.nextAddressChangeAt;

  return (
    <div className="flex flex-col">
      {header}

      <div role="tablist" aria-label={`Mail ${brand.name}`} className={cn(TAB_LIST, "mt-[24px]")}>
        {tabs.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={tabClass(active)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "inbox" ? (
        <InboxList address={address} />
      ) : (
        <>
          <MailRow first title={`${brand.name}'s email`} description={nextChange ? `Anything sent here becomes a task. Next address change possible on ${shortDate(nextChange)}.` : "Anything sent here becomes a task."}>
            {!address ? (
              <div className={setupError ? ERROR_LINE : MUTED_LINE}>{setupError ?? "Creating your address…"}</div>
            ) : editingAddress ? (
              <form onSubmit={saveAddress} className="flex shrink-0 items-center gap-[7px]">
                <TextInput
                  autoFocus
                  value={addressDraft}
                  onChange={(event) => {
                    setAddressDraft(event.target.value);
                    setAddressError(null);
                  }}
                  aria-label="Email name"
                  maxLength={40}
                  className="h-[28px] w-[130px] px-[9px]"
                />
                {newDomain ? <span className="text-[14px] leading-[20px] text-[var(--om-text-3)]">@{newDomain}</span> : null}
                <Button type="submit" variant="primary" disabled={busy || !toLocalPart(addressDraft)}>
                  Save
                </Button>
                <Button onClick={() => setEditingAddress(false)}>Cancel</Button>
              </form>
            ) : (
              <div className="flex shrink-0 items-center gap-[7px]">
                <button type="button" title="Copy address" onClick={() => copyAddress(address)} className="cursor-pointer text-[14px] font-medium leading-[20px] text-[var(--om-text-1)] outline-none focus-visible:underline">
                  {addressCopied ? "Copied" : address}
                </button>
                <button
                  type="button"
                  aria-label="Edit email address"
                  disabled={!!nextChange}
                  title={nextChange ? `One address change per week.` : "Change address"}
                  onClick={() => {
                    setAddressDraft(address.replace(/@.*$/, ""));
                    setAddressError(null);
                    setEditingAddress(true);
                  }}
                  className="cursor-pointer text-[var(--om-icon-2)] outline-none transition-colors hover:text-[var(--om-icon-1)] focus-visible:text-[var(--om-icon-1)] disabled:cursor-default disabled:opacity-40"
                >
                  <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            )}
          </MailRow>
          {addressError ? <div className={cn("pt-[8px] text-right", ERROR_LINE)}>{addressError}</div> : null}

          <MailRow title="Routing addresses" description="Extra inboxes, each with its own standing instructions">
            <button
              type="button"
              className={OUTLINE_BUTTON}
              disabled={workflows.length >= data.limits.workflows}
              onClick={() => {
                setWorkflowError(null);
                setAddingWorkflow(true);
              }}
            >
              <PlusGlyph />
              Add
            </button>
          </MailRow>
          {addingWorkflow ? (
            <form onSubmit={addWorkflow} className={cn("mt-[13px] flex flex-col gap-[8px] rounded-[10px] border bg-[var(--om-bg-sidebar)] p-[12px]", DIVIDER)}>
              <TextInput autoFocus value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} placeholder="Label, e.g. Receipts" aria-label="Workflow email name" maxLength={80} />
              <div className="flex items-center gap-[7px]">
                <TextInput value={workflowUser} onChange={(event) => setWorkflowUser(event.target.value)} placeholder="address (optional)" aria-label="Workflow email address" maxLength={40} className="w-[180px]" />
                {newDomain ? <span className="text-[14px] leading-[20px] text-[var(--om-text-3)]">@{newDomain}</span> : null}
              </div>
              <TextInput value={workflowInstructions} onChange={(event) => setWorkflowInstructions(event.target.value)} placeholder={`Standing instructions: what ${brand.name} should do with each message here`} aria-label="Default prompt" maxLength={4000} />
              {workflowError ? <div className={ERROR_LINE}>{workflowError}</div> : null}
              <div className="flex items-center justify-between gap-[7px] pt-[2px]">
                <span className={MUTED_LINE}>
                  {workflows.length} of {data.limits.workflows} on your plan
                </span>
                <div className="flex gap-[7px]">
                  <Button onClick={() => setAddingWorkflow(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={busy || !workflowName.trim()}>
                    Create
                  </Button>
                </div>
              </div>
            </form>
          ) : null}
          {workflows.length > 0 ? (
            <div className="mt-[13px] flex flex-col gap-[8px]">
              {workflows.map((workflow) => (
                <AddressCard
                  key={workflow.id}
                  address={workflow.address}
                  note={workflow.name + (workflow.defaultPrompt ? ` · ${workflow.defaultPrompt}` : "")}
                  removeLabel="Delete"
                  onRemove={() => void run(() => call("DELETE", `/api/mail/workflows/${workflow.id}`), setWorkflowError)}
                />
              ))}
            </div>
          ) : null}
          {!addingWorkflow && workflowError ? <div className={cn("pt-[8px]", ERROR_LINE)}>{workflowError}</div> : null}

          <MailRow title="Automation inboxes" description="Addresses that start an automation when mail arrives. Set them up from Automations.">
            <Link href={AUTOMATIONS_HREF} onClick={close} className={OUTLINE_BUTTON}>
              <PlusGlyph />
              Open Automations
            </Link>
          </MailRow>

          <MailRow title="Trusted senders" description={`Mail from anyone else is ignored. Room for ${data.limits.senders}.`}>
            <button
              type="button"
              className={OUTLINE_BUTTON}
              disabled={senders.length >= data.limits.senders}
              onClick={() => {
                setSenderError(null);
                setAddingSender(true);
              }}
            >
              <PlusGlyph />
              Add approved sender
            </button>
          </MailRow>
          {addingSender ? (
            <form onSubmit={addSender} className="mt-[13px] flex flex-col gap-[6px]">
              <div className="flex items-center gap-[7px]">
                <TextInput
                  autoFocus
                  type="email"
                  value={senderDraft}
                  onChange={(event) => {
                    setSenderDraft(event.target.value);
                    setSenderError(null);
                  }}
                  placeholder="name@example.com"
                  aria-label="Approved sender email"
                  aria-invalid={senderError !== null}
                  className="flex-1"
                />
                <Button type="submit" variant="primary" className="h-[31px] px-[12px]" disabled={busy}>
                  Add
                </Button>
                <Button className="h-[31px] px-[12px]" onClick={() => setAddingSender(false)}>
                  Cancel
                </Button>
              </div>
              {senderError ? <div className={ERROR_LINE}>{senderError}</div> : null}
            </form>
          ) : null}
          {senders.length > 0 ? (
            <div className="mt-[13px] flex flex-col gap-[8px]">
              {senders.map((sender) => (
                <AddressCard key={sender} address={sender} onRemove={() => void run(() => call("DELETE", `/api/mail/senders?email=${encodeURIComponent(sender)}`), setSenderError)} />
              ))}
            </div>
          ) : (
            <div className={cn("pt-[13px]", MUTED_LINE)}>The list is empty, so no email can start a task yet. Add your own address to begin.</div>
          )}
          {!addingSender && senderError ? <div className={cn("pt-[8px]", ERROR_LINE)}>{senderError}</div> : null}
        </>
      )}
    </div>
  );
}
