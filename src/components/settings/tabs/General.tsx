"use client";

/**
 * Settings > General: appearance, conversations, notifications. Every value is a synced
 * preference (`general.*`, `chat.*`, `notify.*`), stored in the user's settings so it follows them across devices.
 */
import { useState, type FormEvent } from "react";
import { ChevronLeft, Moon, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { brand } from "@/config/brand";
import { applyTheme, type ThemeChoice } from "@/components/modals/theme";
import { usePref } from "../prefs";
import { Button, ChevronRight, DIVIDER, FieldLabel, Pane, Row, Section, SectionHeading, SelectBox, TextInput, Toggle, cn, type Option } from "../ui";

/** Only languages the interface is actually translated into. */
const LANGUAGES: Option[] = [{ value: "en", label: "English" }];

/** Values match `sendMessage(..., { mode })` in `@/lib/agent/client`. */
type RunningAction = "steer" | "queue" | "interrupt";
const RUNNING_ACTIONS: Option<RunningAction>[] = [
  { value: "steer", label: "Add to the current run" },
  { value: "queue", label: "Hold until it finishes" },
  { value: "interrupt", label: "Stop it and send now" },
];

const THEMES: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "auto", label: "Auto", icon: SunMoon },
];

function ThemeCards() {
  const [theme, setTheme] = usePref<ThemeChoice>("general.theme", "dark");
  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-wrap items-center gap-[8px]">
      {THEMES.map((option) => {
        const active = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              setTheme(option.value);
              applyTheme(option.value);
            }}
            className={cn(
              "flex min-h-[32px] w-[110px] shrink-0 cursor-pointer flex-col items-center justify-center gap-[2px] rounded-[10px] px-[8px] pb-[8px] pt-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--om-border-focus)]",
              active ? "border-[1.5px] border-[var(--om-btn-primary)] text-[var(--om-text-1)]" : "border border-[var(--om-btn-border)] text-[var(--om-text-2)] hover:bg-[var(--om-fill-subtle)] hover:text-[var(--om-text-1)] active:bg-[var(--om-fill)]",
            )}
          >
            <option.icon size={20} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
            <span className="px-[2px] text-[14px] font-medium leading-[20px]">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Sub-page behind the "Dictation vocabulary" row. */
function VoiceDictionary({ onBack }: { onBack: () => void }) {
  const [terms, setTerms] = usePref<string[]>("general.voiceDictionary", []);
  const [draft, setDraft] = useState("");

  const add = (e: FormEvent) => {
    e.preventDefault();
    const term = draft.trim();
    if (!term) return;
    setTerms((prev) => (prev.some((t) => t.toLowerCase() === term.toLowerCase()) ? prev : [...prev, term]));
    setDraft("");
  };

  return (
    <div className="flex flex-col">
      <div className={cn("flex shrink-0 items-center gap-[8px] border-b pb-[16px] pt-[34px]", DIVIDER)}>
        <button
          type="button"
          aria-label="Back to General"
          onClick={onBack}
          className="-ml-[4px] flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--om-icon-1)] outline-none transition-colors hover:bg-[var(--om-fill)] focus-visible:bg-[var(--om-fill)]"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>
        <h2 className="text-[24px] font-medium leading-[30px] text-[var(--om-text-1)]">Dictation vocabulary</h2>
      </div>
      <Section last>
        <div className="text-[13px] leading-[18px] text-[var(--om-text-3)]">List the names, brands and jargon dictation tends to mishear. {brand.name} checks every transcript against this list.</div>
        <form onSubmit={add} className="mt-[14px] flex items-center gap-[8px]">
          <TextInput autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A name, product or acronym" aria-label="New dictionary term" maxLength={80} className="flex-1" />
          <Button type="submit" variant="primary" disabled={!draft.trim()} className="h-[31px] px-[13px]">
            Add
          </Button>
        </form>
        {terms.length === 0 ? (
          <div className="pt-[40px] text-center text-[13px] leading-[18px] text-[var(--om-text-3)]">Nothing on the list</div>
        ) : (
          <ul className="mt-[14px] flex flex-col">
            {terms.map((term) => (
              <li key={term} className={cn("flex h-[40px] items-center justify-between gap-[12px] border-b text-[14px] leading-[20px] text-[var(--om-text-1)]", DIVIDER)}>
                <span className="min-w-0 truncate">{term}</span>
                <Button variant="ghost" aria-label={`Remove ${term}`} onClick={() => setTerms((prev) => prev.filter((t) => t !== term))} className="text-[var(--om-text-2)]">
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function GeneralTab() {
  const [view, setView] = useState<"main" | "dictionary">("main");
  const [language, setLanguage] = usePref<string>("general.language", "en");
  const [runningAction, setRunningAction] = usePref<RunningAction>("chat.defaultAction", "steer");
  const [browserNotifications, setBrowserNotifications] = usePref<boolean>("notify.browser", false);
  const [soundAlert, setSoundAlert] = usePref<boolean>("notify.sound", false);

  if (view === "dictionary") return <VoiceDictionary onBack={() => setView("main")} />;

  const toggleBrowserNotifications = (next: boolean) => {
    setBrowserNotifications(next);
    // Ask the browser once; the preference is kept either way so it applies when permission is granted later.
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  };

  return (
    <Pane title="General">
      <Section className="gap-[16px]">
        <SectionHeading>Appearance</SectionHeading>
        <div className="flex flex-col gap-[24px]">
          <div className="flex flex-col gap-[8px]">
            <FieldLabel>Language</FieldLabel>
            <SelectBox value={language} onValueChange={setLanguage} options={LANGUAGES} ariaLabel="Language" className="w-[208px]" />
          </div>
          <div className="flex flex-col gap-[8px]">
            <FieldLabel>Theme</FieldLabel>
            <ThemeCards />
          </div>
        </div>
      </Section>

      <Section className="gap-[16px]">
        <SectionHeading>Conversations</SectionHeading>
        <div className="flex flex-col gap-[24px]">
          <Row
            title="Messages sent mid-task"
            description="What happens when you write while a task is still working: the agent takes it into account right away, picks it up once the run ends, or stops and starts again from your message."
          >
            <SelectBox value={runningAction} onValueChange={setRunningAction} options={RUNNING_ACTIONS} ariaLabel="Messages sent mid-task" align="end" className="w-[230px]" />
          </Row>
          <button type="button" onClick={() => setView("dictionary")} className="-mx-[8px] flex w-[calc(100%+16px)] cursor-pointer items-center justify-between rounded-[8px] p-[8px] text-start outline-none transition-colors hover:bg-[var(--om-fill-subtle)] focus-visible:bg-[var(--om-fill-subtle)]">
            <div className="min-w-0">
              <div className="text-[14px] font-medium leading-[20px] text-[var(--om-text-1)]">Dictation vocabulary</div>
              <p className="text-[13px] leading-[19.5px] text-[var(--om-text-3)]">Words dictation should always spell your way.</p>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </Section>

      <Section last className="gap-[16px]">
        <SectionHeading>Notifications</SectionHeading>
        <div className="flex flex-col gap-[24px]">
          <Row title="Browser notifications" description="A desktop notification when a task moves forward or wraps up.">
            <Toggle checked={browserNotifications} onCheckedChange={toggleBrowserNotifications} label="Browser notifications" />
          </Row>
          <Row title="Completion chime" description="A short sound when a task finishes while you are in another tab.">
            <Toggle checked={soundAlert} onCheckedChange={setSoundAlert} label="Completion chime" />
          </Row>
        </div>
      </Section>
    </Pane>
  );
}
