import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
    "[data-modal-autofocus]",
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

function visibleFocusable(container: HTMLElement) {
    return Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter(
        (element) =>
            element.getAttribute("aria-hidden") !== "true" &&
            element.getClientRects().length > 0,
    );
}

/** Accessible focus containment with trigger restoration for nested modals. */
export default function useModalFocusTrap(
    dialogRef: RefObject<HTMLElement | null>,
    active: boolean,
    lifecycleActive = active,
) {
    const triggerRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!lifecycleActive) return;

        if (!triggerRef.current) {
            triggerRef.current =
                document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null;
        }

        return () => {
            const trigger = triggerRef.current;
            triggerRef.current = null;
            if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        };
    }, [lifecycleActive]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!active || !dialog) return;
        const focusFrame = window.requestAnimationFrame(() => {
            const focusable = visibleFocusable(dialog);
            const preferred = dialog.querySelector<HTMLElement>(
                "[data-modal-autofocus]",
            );
            (preferred && preferred.getClientRects().length > 0
                ? preferred
                : focusable[0] ?? dialog
            ).focus({ preventScroll: true });
        });

        const containFocus = (event: FocusEvent) => {
            if (event.target instanceof Node && dialog.contains(event.target)) {
                return;
            }
            const focusable = visibleFocusable(dialog);
            (focusable[0] ?? dialog).focus({ preventScroll: true });
        };

        const cycleFocus = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;
            const focusable = visibleFocusable(dialog);
            if (focusable.length === 0) {
                event.preventDefault();
                dialog.focus({ preventScroll: true });
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const current = document.activeElement;
            if (event.shiftKey && (current === first || !dialog.contains(current))) {
                event.preventDefault();
                last.focus({ preventScroll: true });
            } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
                event.preventDefault();
                first.focus({ preventScroll: true });
            }
        };

        document.addEventListener("focusin", containFocus);
        document.addEventListener("keydown", cycleFocus);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener("focusin", containFocus);
            document.removeEventListener("keydown", cycleFocus);
        };
    }, [active, dialogRef]);
}
