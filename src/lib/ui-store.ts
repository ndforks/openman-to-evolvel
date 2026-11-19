/** Tiny global UI state shared across areas: which modal or panel is open. */
import { create } from "zustand";

export type ModalName = "settings" | "search" | "create-project" | "upgrade-pro" | "team-plan" | "create-computer" | "customize-computer" | "sign-in" | "share" | "use-anywhere";
interface UIState { modal: { name: ModalName; props?: Record<string, unknown> } | null; open: (name: ModalName, props?: Record<string, unknown>) => void; close: () => void; sidebarCollapsed: boolean; toggleSidebar: () => void }
export const useUI = create<UIState>((set) => ({ modal: null, open: (name, props) => set({ modal: { name, props } }), close: () => set({ modal: null }), sidebarCollapsed: false, toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })) }));
