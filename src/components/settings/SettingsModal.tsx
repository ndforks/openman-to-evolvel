"use client";

/** The Settings dialog: tab list on the left, one content pane per tab on the right. Open with `useUI().open("settings", { tab })`. */
import { useMemo, useRef, useState, type ComponentType } from "react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useUI } from "@/lib/ui-store";
import { ArrowUpRight, ChevronsUpDown, CircleDashed, CircleHelp, Search } from "lucide-react";
import { DEFAULT_SETTINGS_TAB, SETTINGS_GROUPS, normalizeSettingsTab, type SettingsTabId } from "./nav";
import { Avatar, cn } from "./ui";
import { useAccount } from "./useAccount";
import AccountTab from "./tabs/Account";
import ComputersTab from "./tabs/Computers";
import ConnectorsTab from "./tabs/Connectors";
import DataControlsTab from "./tabs/DataControls";
import DevelopersTab from "./tabs/Developers";
import EmailTab from "./tabs/Email";
import GeneralTab from "./tabs/General";
import IntegrationsTab from "./tabs/Integrations";
import MailAgentTab from "./tabs/MailAgent";
import PersonalizationTab from "./tabs/Personalization";
import PhoneTab from "./tabs/Phone";
import ShortcutsTab from "./tabs/Shortcuts";
import SignInSecurityTab from "./tabs/SignInSecurity";
import SkillsTab from "./tabs/Skills";
import UsageBillingTab from "./tabs/UsageBilling";

const PANES: Record<SettingsTabId, ComponentType<Record<string, unknown>>> = {
  account: AccountTab,
  security: SignInSecurityTab,
  billing: UsageBillingTab,
  general: GeneralTab,
  shortcuts: ShortcutsTab,
  personalization: PersonalizationTab,
  connectors: ConnectorsTab,
  skills: SkillsTab,
  mail: MailAgentTab,
  computers: ComputersTab,
  email: EmailTab,
  phone: PhoneTab,
  "data-controls": DataControlsTab,
  integrations: IntegrationsTab,
  developers: DevelopersTab,
};

const NAV_ITEM = "flex h-[32px] w-full self-stretch shrink-0 cursor-pointer items-center gap-[8px] rounded-[8px] pl-[14px] pr-[16px] text-left text-[14px] leading-[20px] text-[var(--om-text-1)] outline-none transition-colors hover:active:bg-[var(--om-fill-strong)] focus-visible:bg-[var(--om-fill-subtle)]";

export function SettingsModal({ tab }: { tab?: unknown }) {
  const requested = normalizeSettingsTab(tab);
  const [selected, setSelected] = useState<SettingsTabId>(requested ?? DEFAULT_SETTINGS_TAB);
  // A second `open("settings", { tab })` while the dialog is up switches tab (state adjusted during render, no effect needed).
  const [seenRequest, setSeenRequest] = useState(requested);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) setSelected(requested);
  }

  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const account = useAccount();
  const open = useUI((s) => s.open);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return SETTINGS_GROUPS;
    return SETTINGS_GROUPS.map((group) => ({ ...group, tabs: group.tabs.filter((item) => item.label.toLowerCase().includes(needle)) })).filter((group) => group.tabs.length > 0);
  }, [query]);

  const select = (id: SettingsTabId) => {
    setSelected(id);
    scroller.current?.scrollTo({ top: 0 });
  };

  const Pane = PANES[selected];
  // "knowledge" (an alias of Personalization) opens that tab on its Knowledge section.
  const paneProps = selected === "personalization" && typeof tab === "string" && tab.toLowerCase() === "knowledge" && seenRequest === "personalization" ? { initialTab: "knowledge" } : {};

  return (
    <ModalShell
      title="Settings"
      closeClassName="right-[12px] top-[12px] size-[28px] rounded-[6px] text-[var(--om-icon-3)] hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-icon-3)] focus-visible:bg-[var(--om-fill-subtle)]"
      closeSize={20}
      className="flex h-[90vh] max-h-[95vh] min-h-[400px] w-[80vw] min-w-[min(720px,calc(100vw-16px))] max-w-[1440px] overflow-hidden rounded-[16px] bg-[var(--om-bg)] text-[14px] leading-[20px] shadow-[0_0_0_1px_var(--om-shadow-highlight),0_0_0_1px_var(--om-shadow-md),0_24px_24px_-12px_var(--om-shadow-sm),0_3px_3px_-1.5px_var(--om-shadow-md),0_10px_20px_1px_var(--om-shadow-sm)]"
    >
      {/* A 221px column (220 + 1px rule), the same fill as the dialog. */}
      <nav aria-label="Settings sections" className="relative flex w-[221px] shrink-0 flex-col border-r border-[var(--om-border)]">
        <div className="mt-[12px] shrink-0 px-[16px]">
          <div className="flex min-h-[36px] items-center gap-[8px] px-[4px] pb-[10px] pt-[16px]">
            <div className="flex min-w-0 flex-1 items-center gap-[10px]">
              <span className="shrink-0 overflow-hidden rounded-full border border-[var(--om-border)]">
                <Avatar size={30} src={account.avatarUrl} name={account.name} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <span className="truncate text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">{account.name}</span>
                <span className="truncate text-[12px] leading-[16px] text-[var(--om-text-3)]">{account.workspace}</span>
              </div>
            </div>
            <span className="shrink-0 rounded-[6px] p-[4px] text-[var(--om-icon-2)]">
              <ChevronsUpDown size={16} strokeWidth={2} aria-hidden="true" />
            </span>
          </div>
        </div>

        <div className="shrink-0 px-[12px] pb-[8px] pt-[4px]">
          <label className="flex h-[32px] w-full items-center overflow-hidden rounded-[8px] border border-[var(--om-btn-border)] px-[8px] py-[4px] text-[14px] leading-[20px] transition-colors focus-within:border-[var(--om-border-focus)] hover:border-[var(--om-border-focus)]">
            <span className="me-[6px] flex size-[20px] shrink-0 items-center justify-center text-[var(--om-icon-3)]">
              <Search size={16} strokeWidth={2} aria-hidden="true" />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search settings"
              className="h-full min-w-px flex-1 bg-transparent px-[4px] text-[var(--om-text-1)] outline-none placeholder:text-[var(--om-text-disabled)]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-[12px] pb-[6px] [scrollbar-width:none]">
          <div className="flex flex-col">
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col items-start gap-[2px]">
                <div className="pb-[4px] pl-[14px] pr-[12px] pt-[12px] text-[13px] leading-[18px] text-[var(--om-text-3)]">{group.label}</div>
                {group.tabs.map((item) => {
                  const active = item.id === selected;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      onClick={() => select(item.id)}
                      className={cn(NAV_ITEM, active ? "bg-[var(--om-fill)] font-medium" : "hover:bg-[var(--om-fill-subtle)]")}
                    >
                      <span className={active ? "text-[var(--om-icon-1)]" : "text-[var(--om-icon-2)]"}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            {groups.length === 0 ? <div className="px-[14px] py-[8px] text-[13px] leading-[18px] text-[var(--om-text-3)]">No settings found</div> : null}

            <div className="w-full px-[12px] py-[10px]">
              <div className="h-px bg-[var(--om-border-tinted)]" />
            </div>
            <div className="flex flex-col gap-[2px]">
              <button type="button" onClick={() => open("team-plan")} className={cn(NAV_ITEM, "hover:bg-[var(--om-fill-subtle)]")}>
                <span className="text-[var(--om-icon-2)]">
                  <CircleDashed size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                </span>
                <span className="truncate">Create a team</span>
              </button>
              <a href="/docs" target="_blank" rel="noreferrer" className={cn(NAV_ITEM, "hover:bg-[var(--om-fill)]")}>
                <span className="text-[var(--om-icon-2)]">
                  <CircleHelp size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
                </span>
                <span className="min-w-0 flex-1 truncate">Get help</span>
                <ArrowUpRight size={16} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[var(--om-icon-3)]" />
              </a>
            </div>
          </div>
        </div>
      </nav>

      <div ref={scroller} className="h-full min-w-0 flex-1 overflow-y-auto bg-[var(--om-bg)] [scrollbar-color:var(--om-text-disabled)_transparent] [scrollbar-width:thin]">
        {/* 24px side padding, a column of at most 768px centred in the pane. */}
        <div className="flex min-h-full flex-col px-[24px]">
          <div className="mx-auto flex w-full max-w-[768px] flex-1 flex-col pb-[16px]">
            <Pane key={selected} {...paneProps} />
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
