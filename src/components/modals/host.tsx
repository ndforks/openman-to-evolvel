"use client";

/**
 * Renders whichever modal `useUI()` says is open. Mount once in the app layout: `<ModalHost />`.
 *
 * open("settings", { tab })                      tab: id, label or alias ("usage", "account", "connectors", ...)
 * open("search")
 * open("create-project", { onCreated, stay })    onCreated(project) is optional; without `stay` the new project's page opens
 * open("upgrade-pro") / open("team-plan")
 * open("create-computer", { preset })            preset: "run-automations" | "ios-mac-apps" | "game-server" | "render-3d" | "windows-apps" | "host-apps"
 * open("customize-computer", { os, plan })
 * open("share", { taskId, url, title })
 * open("use-anywhere")
 *
 * "sign-in" belongs to another area and is ignored here.
 *
 * Deep links: `?settings=<tab>` opens Settings on that tab (`?settings` alone opens General) and
 * `?modal=<name>` opens one of the modals that needs no props. The parameter is dropped once it has been read.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { readPref } from "@/components/settings/prefs";
import { useUI, type ModalName } from "@/lib/ui-store";
import { CreateComputerModal } from "./CreateComputerModal";
import { CreateProjectModal } from "./CreateProjectModal";
import { CustomizeComputerModal } from "./CustomizeComputerModal";
import { SearchModal } from "./SearchModal";
import { ShareModal } from "./ShareModal";
import { TeamPlanModal } from "./TeamPlanModal";
import { UpgradeProModal } from "./UpgradeProModal";
import { UseAnywhereModal } from "./UseAnywhereModal";
import { applyTheme, registerThemeHost, syncTheme, type ThemeChoice } from "./theme";

type ModalProps = Record<string, unknown>;
type ProjectCreated = (project: { id: string; name: string; instructions: string }) => void;

const str = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

function renderModal(name: ModalName, props: ModalProps): ReactNode {
  switch (name) {
    case "settings":
      return <SettingsModal tab={props.tab} />;
    case "search":
      return <SearchModal />;
    case "create-project":
      return <CreateProjectModal onCreated={typeof props.onCreated === "function" ? (props.onCreated as ProjectCreated) : undefined} stay={props.stay === true} />;
    case "upgrade-pro":
      return <UpgradeProModal />;
    case "team-plan":
      return <TeamPlanModal />;
    case "create-computer":
      return <CreateComputerModal key={str(props.preset) ?? "default"} preset={str(props.preset)} />;
    case "customize-computer":
      return <CustomizeComputerModal os={str(props.os)} plan={str(props.plan)} />;
    case "share":
      return <ShareModal key={str(props.taskId) ?? "share"} taskId={str(props.taskId)} url={str(props.url)} title={str(props.title)} />;
    case "use-anywhere":
      return <UseAnywhereModal />;
    default:
      return null;
  }
}

/** Modals a URL may open: the ones that work without props. */
const LINKABLE: ReadonlySet<string> = new Set<ModalName>(["search", "create-project", "upgrade-pro", "team-plan", "create-computer", "use-anywhere"]);

/** Opens the modal named in the URL, then removes the parameter so a reload or a close does not bring it back. */
function useModalDeepLink(): void {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const open = useUI((s) => s.open);
  const settingsTab = params.get("settings");
  const named = params.get("modal");
  const query = params.toString();

  useEffect(() => {
    if (settingsTab === null && named === null) return;
    if (settingsTab !== null) open("settings", settingsTab ? { tab: settingsTab } : undefined);
    else if (named !== null && LINKABLE.has(named)) open(named as ModalName);

    const rest = new URLSearchParams(query);
    rest.delete("settings");
    rest.delete("modal");
    const remaining = rest.toString();
    router.replace(remaining ? `${pathname}?${remaining}` : pathname, { scroll: false });
  }, [settingsTab, named, query, pathname, router, open]);
}

export function ModalHost() {
  const modal = useUI((s) => s.modal);
  useModalDeepLink();

  // Honour an explicit Light / Dark choice from Settings > General across reloads ("auto" keeps the layout's default).
  useEffect(() => {
    const stored = readPref<ThemeChoice>("general.theme", "auto");
    if (stored === "light" || stored === "dark") applyTheme(stored);
  }, []);

  useEffect(() => {
    if (modal) syncTheme();
  }, [modal]);

  return (
    <>
      <span ref={registerThemeHost} hidden aria-hidden="true" />
      {modal ? renderModal(modal.name, modal.props ?? {}) : null}
    </>
  );
}

export default ModalHost;
