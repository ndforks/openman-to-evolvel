"use client";

/** Shared dialog frame: Radix focus handling, dimmed overlay, centred content box and an optional close button. */
import * as Dialog from "@radix-ui/react-dialog";
import { clsx, type ClassValue } from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useUI } from "@/lib/ui-store";
import { useThemeClass } from "./theme";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const KEYFRAMES = `
@keyframes om-overlay-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes om-modal-in { from { opacity: 0; transform: translateY(6px) scale(0.985) } to { opacity: 1; transform: none } }
`;

export interface ModalShellProps {
  /** Accessible name. Rendered visually hidden; draw your own visible heading inside `children`. */
  title: string;
  children: ReactNode;
  /** Classes for the content box: size, radius, background, border, shadow. */
  className?: string;
  /** Defaults to `useUI().close`. */
  onClose?: () => void;
  /** Show the top-right close button (default true). */
  closeButton?: boolean;
  /** Position / colour overrides for the close button. */
  closeClassName?: string;
  /** Size of the close glyph in px (default 18). */
  closeSize?: number;
  /** Set false to stop a click on the dimmed backdrop from closing the modal. */
  dismissOnOutside?: boolean;
  /** Inline position for a dialog anchored to a control instead of centred (pair with position classes in `className`). */
  style?: CSSProperties;
  /** Classes for the backdrop, e.g. "bg-transparent" for a popover-like dialog. */
  overlayClassName?: string;
}

export function ModalShell({ title, children, className, onClose, closeButton = true, closeClassName, closeSize = 20, dismissOnOutside = true, style, overlayClassName }: ModalShellProps) {
  const close = useUI((s) => s.close);
  const themeClass = useThemeClass();
  const handleClose = onClose ?? close;

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={cn(themeClass, "fixed inset-0 z-[100] bg-[var(--om-scrim)] backdrop-blur-[4px] [animation:om-overlay-in_140ms_ease-out]", overlayClassName)}>
          <style>{KEYFRAMES}</style>
        </Dialog.Overlay>
        <Dialog.Content
          aria-describedby={undefined}
          style={style}
          onPointerDownOutside={(e) => {
            if (!dismissOnOutside) e.preventDefault();
          }}
          className={cn(
            themeClass,
            "fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2 font-sans text-[var(--om-text-1)] antialiased outline-none [animation:om-modal-in_160ms_ease-out] [font-synthesis:none]",
            className,
          )}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
          {closeButton ? (
            <Dialog.Close
              aria-label="Close"
              className={cn(
                "absolute right-[20px] top-[18px] flex size-[24px] items-center justify-center rounded-[6px] text-[var(--om-icon-2)] outline-none transition-colors hover:bg-[var(--om-fill)] hover:text-[var(--om-icon-1)] focus-visible:bg-[var(--om-fill)]",
                closeClassName,
              )}
            >
              <X size={closeSize} strokeWidth={2} aria-hidden="true" />
            </Dialog.Close>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
