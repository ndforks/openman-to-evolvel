"use client";

/** Settings → Email: the agent's email addresses (its personal address plus extra addresses), backed by `/api/mail`. */
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState, type FormEvent } from "react";
import { Ellipsis, Mail } from "lucide-react";
import { useThemeClass } from "@/components/modals/theme";
import { Button, DIVIDER, Pane, TextInput, cn, useCopy } from "@/components/settings/ui";
import { call, newAddressDomain, useResource, type Mailbox, type MailOverview } from "./mailPhoneApi";

/** Fills the pane below the 70px title so the empty state sits in the middle of it. */
const FILL = "min-h-[calc(min(660px,100vh_-_68px)_-_126px)]";
const MENU_CONTENT = "z-[120] min-w-[170px] rounded-[12px] border border-[var(--om-border-strong)] bg-[var(--om-surface)] p-[4px] font-sans text-[var(--om-text-1)] shadow-[0_8px_32px_rgba(0,0,0,0.32)]";
const MENU_ITEM = "flex h-[32px] cursor-pointer select-none items-center rounded-[8px] px-[10px] text-[14px] leading-[20px] outline-none data-[highlighted]:bg-[var(--om-fill)]";

/** Keep only characters that are safe in the part before the @. */
function toLocalPart(raw: string): string {
  return raw.trim().toLowerCase().replace(/@.*$/, "").replace(/[^a-z0-9._-]/g, "");
}

function MailGlyph({ size, strokeWidth }: { size: number; strokeWidth: number }) {
  return (
    <Mail size={size} strokeWidth={strokeWidth} aria-hidden="true" className="shrink-0 text-[var(--om-icon-2)]" />
  );
}

function MailboxCard({ mailbox, onDelete }: { mailbox: Mailbox; onDelete?: () => void }) {
  const themeClass = useThemeClass();
  const [copied, copy] = useCopy();
  return (
    <div className={cn("flex h-[40px] shrink-0 items-center gap-[9px] rounded-[10px] border bg-[var(--om-bg-sidebar)] px-[14px]", DIVIDER)}>
      <MailGlyph size={14} strokeWidth={1.8} />
      <div className="flex min-w-0 flex-1 items-baseline gap-[10px]">
        <span className="shrink-0 text-[14px] leading-[20px] text-[var(--om-text-1)]">{copied ? "Copied" : mailbox.address}</span>
        <span className="min-w-0 truncate text-[13px] leading-[18px] text-[var(--om-text-3)]">{mailbox.kind === "personal" ? "Main address" : mailbox.name}</span>
      </div>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label={`Options for ${mailbox.address}`}
          className="-mr-[5px] flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)] data-[state=open]:bg-[var(--om-fill)]"
        >
          <Ellipsis size={14} strokeWidth={2.4} aria-hidden="true" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className={cn(themeClass, MENU_CONTENT)}>
            <DropdownMenu.Item className={MENU_ITEM} onSelect={() => copy(mailbox.address)}>
              Copy address
            </DropdownMenu.Item>
            {onDelete ? (
              <DropdownMenu.Item className={cn(MENU_ITEM, "text-[var(--om-danger-solid)]")} onSelect={onDelete}>
                Delete
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}

export default function EmailTab() {
  const { data, error: loadError, loading, reload } = useResource<MailOverview>("/api/mail");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const mailboxes: Mailbox[] = data ? [...(data.personal ? [data.personal] : []), ...data.workflows] : [];
  const newDomain = newAddressDomain(data);

  const startCreating = () => {
    setDraft("");
    setError(null);
    setCreating(true);
  };

  const act = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
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
    const local = toLocalPart(draft);
    if (!local) {
      setError("Use letters, numbers, dots or dashes.");
      return;
    }
    // The first address is the agent's main one; later ones are extra addresses with no default instructions.
    const ok = await act(() => (data?.personal ? call("POST", "/api/mail/workflows", { name: local, username: local, prompt: "" }) : call("POST", "/api/mail")));
    if (ok) setCreating(false);
  };

  if (loading || loadError || !data?.configured) {
    return (
      <Pane title="Email">
        {loading ? null : <div className={cn("pt-[22px] text-[13px] leading-[18px]", loadError ? "text-[var(--om-danger-solid)]" : "text-[var(--om-text-3)]")}>{loadError ?? data?.notice ?? "Email isn't set up on this server yet."}</div>}
      </Pane>
    );
  }

  const form = (
    <form onSubmit={create} className="flex flex-col items-center gap-[6px]">
      <div className="flex items-center gap-[7px]">
        <TextInput
          autoFocus
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          placeholder="name"
          aria-label="Email name"
          aria-invalid={error !== null}
          maxLength={40}
          className="h-[28px] w-[150px] px-[9px]"
        />
        {newDomain ? <span className="text-[14px] leading-[20px] text-[var(--om-text-3)]">@{newDomain}</span> : null}
        <Button type="submit" variant="primary" disabled={busy}>
          Create
        </Button>
        <Button onClick={() => setCreating(false)}>Cancel</Button>
      </div>
      {error ? <div className="text-[13px] leading-[18px] text-[var(--om-danger-solid)]">{error}</div> : null}
    </form>
  );

  if (mailboxes.length === 0) {
    return (
      <Pane title="Email">
        <div className={cn("flex flex-col items-center justify-center gap-[5px] text-center", FILL)}>
          <MailGlyph size={28} strokeWidth={1.5} />
          <div className="pt-[6px] text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">No addresses yet</div>
          <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">Give the agent an inbox and it can send, receive and act on mail.</div>
          <div className="mt-[7px] flex">
            {creating ? (
              form
            ) : (
              <Button className="px-[8px]" onClick={startCreating}>
                Create new
              </Button>
            )}
          </div>
        </div>
      </Pane>
    );
  }

  return (
    <Pane title="Email">
      <div className="flex items-center justify-between pb-[12px] pt-[22px]">
        <h3 className="text-[16px] font-medium leading-[22px] text-[var(--om-text-1)]">Email addresses</h3>
        <Button className="px-[8px]" onClick={startCreating}>
          Create new
        </Button>
      </div>
      {creating ? <div className="flex justify-start pb-[12px]">{form}</div> : null}
      <div className="flex flex-col gap-[8px]">
        {mailboxes.map((mailbox) => (
          <MailboxCard key={mailbox.id} mailbox={mailbox} onDelete={mailbox.kind === "workflow" ? () => void act(() => call("DELETE", `/api/mail/workflows/${mailbox.id}`)) : undefined} />
        ))}
      </div>
      {!creating && error ? <div className="pt-[12px] text-[13px] leading-[18px] text-[var(--om-danger-solid)]">{error}</div> : null}
    </Pane>
  );
}
