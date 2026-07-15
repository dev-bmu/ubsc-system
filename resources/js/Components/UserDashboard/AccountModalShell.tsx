import { ReactNode, useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Guilloche, Microtext, FoilText, Serial, Perforation } from "./PassKit";

/* ════════════════════════════════════════════════════════════════════
   ACCOUNT MODAL SHELL — "Obsidian Lux" Premium dialog frame
   --------------------------------------------------------------------
   Award-caliber, fully CSS-driven (no framer-motion). Shared by
   ProfileModal · PaymentHistoryModal · GymMembershipModal.

   Signature moments:
     • Smooth aurora gradient banner — drifting glow blobs
     • Cinematic entrance with spring-bounce overshoot
     • One-shot specular sheen wipe on open
     • Editorial entrance: UB/wordmark clip-reveal, title prints up,
       hairline rule draws itself, body cascades on a stagger
     • Frosted close button that spins its glyph on hover
     • Graceful exit via [data-leaving] + deferred unmount
     • Desktop dialog ↔ mobile bottom-sheet, reduced-motion safe
   ════════════════════════════════════════════════════════════════════ */

export interface AccountModalShellProps {
    bannerGradient: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    wordmark: string;
    accent?: string;
    /** Engraved serial shown top-right of the pass header */
    serial?: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    maxWidthClass?: string;
}

export default function AccountModalShell({
    bannerGradient,
    eyebrow,
    title,
    subtitle,
    wordmark,
    accent = "#D50000",
    serial = "UBSC · 2026",
    onClose,
    children,
    footer,
    maxWidthClass = "sm:max-w-lg",
}: AccountModalShellProps) {
    const [leaving, setLeaving] = useState(false);

    /* Animate out, then unmount via parent's onClose */
    const requestClose = useCallback(() => {
        setLeaving((l) => {
            if (l) return l;
            window.setTimeout(onClose, 250);
            return true;
        });
    }, [onClose]);

    /* Page scroll lock — locks the real scroll element (<html>, used by
       Lenis), not just <body>. Compensates scrollbar width to avoid a
       layout jump. The modal's own content still scrolls natively because
       the overlay carries data-lenis-prevent. */
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const scrollbar = window.innerWidth - html.clientWidth;
        const prev = {
            htmlOverflow: html.style.overflow,
            bodyOverflow: body.style.overflow,
            htmlPadRight: html.style.paddingRight,
        };
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;
        return () => {
            html.style.overflow = prev.htmlOverflow;
            body.style.overflow = prev.bodyOverflow;
            html.style.paddingRight = prev.htmlPadRight;
        };
    }, []);

    /* Escape to close */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") requestClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [requestClose]);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:p-4"
            data-lenis-prevent
        >
            {/* Backdrop — enhanced with blur transition */}
            <div
                className="kl-backdrop absolute inset-0 bg-navy-950/60 backdrop-blur-xl"
                data-leaving={leaving}
                onClick={requestClose}
            />

            {/* Dialog / bottom sheet */}
            <div
                className={cn(
                    "kl-dialog kl-glass-border relative z-10 flex w-full flex-col overflow-hidden bg-[#FAF9F7]",
                    "max-h-[94vh] rounded-t-[32px] sm:max-h-[92vh] sm:rounded-[30px]",
                    "shadow-[0_-8px_60px_rgba(7,21,48,0.35)] sm:shadow-[0_32px_100px_-24px_rgba(7,21,48,0.6),0_0_0_1px_rgba(255,255,255,0.08)]",
                    maxWidthClass,
                )}
                data-leaving={leaving}
            >
                {/* Mobile grab handle */}
                <div className="flex justify-center pt-2.5 sm:hidden">
                    <span className="h-1.5 w-11 rounded-full bg-navy-900/15" />
                </div>

                {/* ── PASS HEADER — Aurora Gradient ── */}
                <div
                    className={cn(
                        "pass-foil-host relative isolate overflow-hidden bg-gradient-to-br px-6 pb-8 pt-3 sm:px-7",
                        bannerGradient,
                    )}
                >
                    {/* Aurora wave background (replaces old Guilloché moiré) */}
                    <Guilloche />

                    {/* One-shot specular sheen on open */}
                    <div className="kl-sheen-bar" aria-hidden="true" />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" />

                    {/* Security microtext top border */}
                    <Microtext
                        className="relative -mx-6 mb-3 text-white/35 sm:-mx-7"
                        text="UB Sport Center · Member Pass"
                    />

                    {/* Close button — frosted glass with rotation glow */}
                    <button
                        type="button"
                        onClick={requestClose}
                        aria-label="Tutup"
                        className="kl-close absolute right-4 top-7 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/90 backdrop-blur-sm hover:bg-white/25 hover:text-white"
                    >
                        <X className="h-4 w-4" />
                    </button>

                    {/* Brand mark row — foil + serial */}
                    <div className="relative flex items-start justify-between pr-10">
                        <div
                            className="kl-clip"
                            style={{ ["--i" as string]: 0 }}
                        >
                            <span className="flex items-baseline gap-2">
                                <FoilText className="font-clash text-2xl font-bold tracking-tight">
                                    UB
                                </FoilText>
                                <span className="font-clash text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
                                    Sport Center
                                </span>
                            </span>
                        </div>
                    </div>

                    {/* Pass type wordmark */}
                    <div className="relative mt-4 flex items-end justify-between pr-2">
                        <div>
                            <p
                                className="kl-stagger font-bdo text-[9px] font-bold uppercase tracking-[0.3em] text-white/40"
                                style={{ ["--i" as string]: 1 }}
                            >
                                Member Pass
                            </p>
                            <h3
                                className="kl-clip font-clash text-[26px] font-bold uppercase leading-none tracking-tight text-white sm:text-[30px]"
                                style={{ ["--i" as string]: 2 }}
                            >
                                <span>{wordmark}</span>
                            </h3>
                        </div>
                        <Serial
                            className="kl-stagger mb-0.5 text-[10px] font-semibold uppercase text-white/45"
                            style={{ ["--i" as string]: 3 }}
                        >
                            № {serial}
                        </Serial>
                    </div>
                </div>

                {/* Ticket perforation seam */}
                <Perforation />

                {/* ── Title block ── */}
                <div className="flex-shrink-0 px-6 pt-5 sm:px-7">
                    <p
                        className="kl-stagger flex items-center gap-1.5 font-bdo text-[10px] font-bold uppercase tracking-[0.22em]"
                        style={{ color: accent, ["--i" as string]: 1 }}
                    >
                        <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{
                                background: accent,
                                animation:
                                    "kl-dot-pulse 3s ease-in-out infinite",
                            }}
                        />
                        {eyebrow}
                    </p>
                    <h2
                        className="kl-stagger mt-1.5 font-clash text-[22px] font-semibold leading-tight text-navy-900"
                        style={{ ["--i" as string]: 2 }}
                    >
                        {title}
                    </h2>
                    <p
                        className="kl-stagger mt-1 font-bdo text-[13px] leading-relaxed text-navy-900/55"
                        style={{ ["--i" as string]: 3 }}
                    >
                        {subtitle}
                    </p>
                    <div
                        className="kl-rule mt-4 h-px w-full bg-gradient-to-r from-navy-900/20 via-navy-900/10 to-transparent"
                        style={{ ["--i" as string]: 4 }}
                    />
                </div>

                {/* ── Scrollable content ── */}
                <div className="account-modal-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-7">
                    {children}
                </div>

                {/* ── Sticky footer ── */}
                {footer && (
                    <div className="relative flex-shrink-0 border-t border-navy-900/[0.07] bg-[#FAF9F7]/95 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm sm:px-7">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60" />
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

/* ── Shared buttons (bevel + hover sheen + tactile press) ── */

export function PrimaryButton({
    children,
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            className={cn(
                "group relative flex h-[52px] w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-navy-900 px-5 font-clash text-[15px] font-semibold text-white transition-all hover:bg-navy-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_24px_-8px_rgba(11,30,59,0.6)] active:shadow-[inset_0_3px_8px_rgba(0,0,0,0.32)]",
                className,
            )}
        >
            {/* Hover sheen */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-[130%] skew-x-[-18deg] bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[230%]"
            />
            <span className="relative flex items-center gap-2.5">{children}</span>
        </button>
    );
}

export function SecondaryButton({
    children,
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            {...props}
            className={cn(
                "flex h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-transparent px-5 font-clash text-[14px] font-semibold text-navy-900/60 transition-all hover:bg-navy-900/[0.04] hover:text-navy-900 active:scale-[0.99]",
                className,
            )}
        >
            {children}
        </button>
    );
}
