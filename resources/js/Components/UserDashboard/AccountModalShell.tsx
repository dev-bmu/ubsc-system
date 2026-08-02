import {
    CSSProperties,
    KeyboardEvent as ReactKeyboardEvent,
    ReactNode,
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AccountModalShellProps {
    bannerGradient: string;
    eyebrow: string;
    title: string;
    subtitle: string;
    wordmark: string;
    accent?: string;
    serial?: string;
    index?: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    maxWidthClass?: string;
}

const sectionIndex: Record<string, string> = {
    Profil: "01",
    Riwayat: "02",
    Member: "03",
    Membership: "03",
    Bantuan: "04",
};

const ACCOUNT_WORKSPACE_CSS = String.raw`
    .ae-root {
        --ae-ink: #10151c;
        --ae-night: #0b1219;
        --ae-paper: #fcfcfb;
        --ae-bed: #f3f3f0;
        --ae-muted: #69717a;
        --ae-line: rgba(16,21,28,.10);
        --ae-blue: #15678d;
        --ae-red: #ff0000;
        position: fixed;
        inset: 0;
        z-index: 220;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        isolation: isolate;
        font-family: "BDO Grotesk", sans-serif;
        font-synthesis: none;
    }
    .ae-console,
    .ae-console * { font-family: "BDO Grotesk", sans-serif !important; }
    .ae-backdrop {
        position: absolute;
        inset: 0;
        border: 0;
        background:
            radial-gradient(circle at 18% 8%, rgba(21,103,141,.17), transparent 34%),
            radial-gradient(circle at 86% 92%, rgba(255,0,0,.08), transparent 31%),
            rgba(4,8,12,.78);
        backdrop-filter: blur(16px) saturate(.86);
        animation: ae-backdrop-in .24s ease both;
    }
    .ae-backdrop[data-leaving="true"] { animation: ae-backdrop-out .18s ease both; }
    .ae-console {
        position: relative;
        z-index: 1;
        display: flex;
        width: 100%;
        max-height: 96dvh;
        flex-direction: column;
        overflow: hidden;
        border-radius: 15px 15px 0 0;
        color: var(--ae-ink);
        background: var(--ae-night);
        box-shadow: 0 40px 110px -34px rgba(0,0,0,.82), inset 0 1px rgba(255,255,255,.12);
        animation: ae-console-in .34s cubic-bezier(.16,1,.3,1) both;
        transform-origin: 50% 100%;
    }
    .ae-console[data-leaving="true"] { animation: ae-console-out .18s cubic-bezier(.4,0,1,1) both; }
    .ae-stage {
        position: relative;
        height: 132px;
        flex: none;
        overflow: hidden;
        padding: 17px 18px 0;
        color: white;
        background:
            radial-gradient(ellipse at 73% 6%, rgba(21,103,141,.18), transparent 42%),
            linear-gradient(145deg, #121b24 0%, #0b1219 58%, #080d12 100%);
    }
    .ae-stage::before,
    .ae-stage::after { position: absolute; content: ""; pointer-events: none; }
    .ae-stage::before {
        inset: 0;
        background:
            linear-gradient(90deg, transparent 0 13%, rgba(255,255,255,.045) 13% 13.15%, transparent 13.15% 49%, rgba(255,255,255,.04) 49% 49.12%, transparent 49.12% 82%, rgba(255,255,255,.035) 82% 82.12%, transparent 82.12%),
            radial-gradient(ellipse at 18% 104%, rgba(255,0,0,.055), transparent 34%),
            radial-gradient(ellipse at 78% 98%, rgba(21,103,141,.14), transparent 40%);
        opacity: .82;
    }
    .ae-stage::after {
        right: -4%;
        bottom: 31px;
        width: 57%;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(153,205,232,.22), rgba(153,205,232,.04));
        box-shadow: 0 0 18px rgba(21,103,141,.08);
    }
    .ae-stage[data-surface="history"]::after,
    .ae-stage[data-surface="support"]::after {
        right: auto;
        left: -10%;
        background: linear-gradient(90deg, rgba(255,0,0,.03), rgba(255,0,0,.17), transparent);
        box-shadow: 0 0 18px rgba(255,0,0,.045);
    }
    .ae-topline {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 18px;
    }
    .ae-context { display: flex; min-width: 0; align-items: flex-start; gap: 10px; }
    .ae-context__mark {
        width: 3px;
        height: 30px;
        flex: none;
        border-radius: 2px;
        background: linear-gradient(to bottom, var(--ae-accent), color-mix(in srgb,var(--ae-accent) 38%,transparent));
        box-shadow: 0 0 18px color-mix(in srgb,var(--ae-accent) 24%,transparent);
    }
    .ae-context__copy { min-width: 0; }
    .ae-context__title {
        overflow: hidden;
        color: rgba(255,255,255,.95);
        font-size: 13px;
        font-weight: 600;
        line-height: 1.2;
        letter-spacing: -.012em;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ae-context__meta {
        margin-top: 4px;
        color: rgba(255,255,255,.54);
        font-size: 11px;
        line-height: 1.3;
    }
    .ae-head-actions { display: flex; flex: none; align-items: center; gap: 10px; }
    .ae-section-index {
        color: rgba(255,255,255,.73);
        font-size: 11px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        letter-spacing: .025em;
    }
    .ae-close {
        display: grid;
        width: 34px;
        height: 34px;
        place-items: center;
        border: 1px solid rgba(255,255,255,.14);
        border-radius: 10px;
        color: rgba(255,255,255,.86);
        background: rgba(255,255,255,.065);
        transition: color .2s ease, background .2s ease, transform .2s ease;
    }
    .ae-close svg { width: 15px; height: 15px; stroke-width: 1.7; }
    .ae-close:hover { color: white; background: rgba(255,255,255,.12); transform: translateY(-1px); }
    .ae-close:focus-visible { outline: 2px solid rgba(255,255,255,.88); outline-offset: 2px; }
    .ae-stage-rail {
        position: absolute;
        z-index: 2;
        right: 18px;
        bottom: 24px;
        left: 18px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        color: rgba(255,255,255,.48);
        font-size: 11px;
        line-height: 1.25;
    }
    .ae-stage-rail__secure { display: inline-flex; align-items: center; gap: 7px; }
    .ae-stage-rail__secure svg { width: 13px; height: 13px; color: rgba(162,205,230,.84); stroke-width: 1.7; }
    .ae-paper {
        position: relative;
        z-index: 3;
        display: flex;
        min-height: 0;
        flex: 1;
        flex-direction: column;
        margin-top: -28px;
        overflow: hidden;
        border-radius: 15px 15px 0 0;
        background: var(--ae-paper);
        box-shadow: 0 -1px rgba(255,255,255,.92), 0 -18px 44px rgba(0,0,0,.09);
    }
    .ae-identity {
        position: relative;
        flex: none;
        padding: 23px 18px 18px;
    }
    .ae-identity::after {
        position: absolute;
        right: 18px;
        bottom: 0;
        left: 18px;
        height: 1px;
        content: "";
        background: linear-gradient(90deg, var(--ae-line), rgba(16,21,28,.025) 72%, transparent);
    }
    .ae-title {
        max-width: 26ch;
        color: var(--ae-ink);
        font-size: clamp(27px,7vw,34px);
        font-weight: 600;
        line-height: 1;
        letter-spacing: -.035em;
        text-wrap: balance;
    }
    .ae-subtitle {
        max-width: 72ch;
        margin-top: 8px;
        color: rgba(16,21,28,.59);
        font-size: 12.5px;
        line-height: 1.48;
        text-wrap: pretty;
    }
    .ae-content-frame {
        display: flex;
        min-height: 0;
        flex: 1;
        flex-direction: column;
        margin: 12px 9px 9px;
        overflow: hidden;
        border-radius: 15px;
        background: var(--ae-bed);
        box-shadow: inset 0 1px rgba(255,255,255,.9), inset 0 0 0 1px rgba(16,21,28,.025);
    }
    .ae-scroll {
        min-height: 0;
        flex: 1;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 17px 14px max(20px,env(safe-area-inset-bottom));
        color: var(--ae-ink);
        font-size: 13px;
        line-height: 1.5;
        scrollbar-color: rgba(16,21,28,.22) transparent;
        scrollbar-width: thin;
    }
    .ae-scroll :where(p, label, small, input, select, textarea, button, a) { font-family: "BDO Grotesk", sans-serif !important; }
    .ae-scroll :where(input, select, textarea) { font-size: 14px !important; }
    .ae-scroll::-webkit-scrollbar { width: 5px; }
    .ae-scroll::-webkit-scrollbar-track { background: transparent; }
    .ae-scroll::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(16,21,28,.2); }
    .ae-dock {
        position: relative;
        flex: none;
        padding: 0 14px max(12px,env(safe-area-inset-bottom));
        background: linear-gradient(to bottom, rgba(243,243,240,.35), var(--ae-bed) 34%);
    }
    .ae-dock__actions { padding-top: 10px; border-top: 1px solid var(--ae-line); }
    .ae-primary,
    .ae-secondary {
        display: flex;
        min-height: 48px;
        width: 100%;
        align-items: center;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 600;
        transition: transform .2s ease, color .2s ease, background .2s ease, border-color .2s ease;
    }
    .ae-primary {
        justify-content: space-between;
        gap: 14px;
        padding: 5px 5px 5px 17px;
        border: 1px solid var(--ae-ink);
        color: white;
        background: var(--ae-ink);
        box-shadow: 0 14px 28px -22px rgba(16,21,28,.82);
    }
    .ae-primary:hover { transform: translateY(-1px); background: #05090d; }
    .ae-primary:disabled { cursor: not-allowed; opacity: .45; transform: none; }
    .ae-primary__copy { display: flex; min-width: 0; align-items: center; gap: 9px; }
    .ae-primary__orb {
        display: grid;
        width: 36px;
        height: 36px;
        flex: none;
        place-items: center;
        border-radius: 8px;
        color: var(--ae-ink);
        background: white;
        transform: rotate(-45deg);
        transition: transform .55s cubic-bezier(.76,0,.24,1), color .2s ease, background .2s ease;
    }
    .ae-primary:hover .ae-primary__orb,
    .ae-primary:focus-visible .ae-primary__orb { transform: rotate(0deg); }
    .ae-cta-arrow { display: block; width: 16px; height: 16px; flex: none; overflow: visible; }
    .ae-secondary {
        justify-content: center;
        gap: 8px;
        padding: 0 17px;
        border: 1px solid var(--ae-line);
        color: rgba(16,21,28,.66);
        background: rgba(255,255,255,.55);
    }
    .ae-secondary svg { width: 15px; height: 15px; stroke-width: 1.7; }
    .ae-secondary:hover { color: var(--ae-ink); border-color: rgba(16,21,28,.18); background: white; transform: translateY(-1px); }
    .ae-primary:focus-visible,
    .ae-secondary:focus-visible { outline: 2px solid var(--ae-blue); outline-offset: 2px; }
    .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-console,
    .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-stage::after,
    .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-context__mark,
    .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-paper,
    .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-content-frame,
    .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-primary {
        box-shadow: none;
    }
    @keyframes ae-console-in {
        from { opacity: 0; transform: translate3d(0,28px,0) scale(.982); }
        to { opacity: 1; transform: translate3d(0,0,0) scale(1); }
    }
    @keyframes ae-console-out {
        from { opacity: 1; transform: translate3d(0,0,0) scale(1); }
        to { opacity: 0; transform: translate3d(0,18px,0) scale(.99); }
    }
    @keyframes ae-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes ae-backdrop-out { from { opacity: 1; } to { opacity: 0; } }
    @media (min-width: 640px) {
        .ae-root { align-items: center; padding: 18px; }
        .ae-console {
            width: min(960px,calc(100vw - 44px));
            max-height: min(88dvh,790px);
            border-radius: 15px;
            transform-origin: 50% 50%;
        }
        .ae-stage { height: 148px; padding: 20px 26px 0; }
        .ae-stage-rail { right: 26px; bottom: 27px; left: 26px; }
        .ae-paper { margin-top: -31px; border-radius: 15px; }
        .ae-identity { padding: 25px 28px 19px; }
        .ae-identity::after { right: 28px; left: 28px; }
        .ae-title { font-size: 34px; }
        .ae-subtitle { max-width: 76ch; font-size: 13px; }
        .ae-content-frame { margin: 13px 17px 15px; }
        .ae-scroll { padding: 22px 23px 24px; }
        .ae-dock { padding: 0 23px 13px; }
    }
    @media (max-width: 639px) {
        .ae-stage-rail > span:first-child { display: none; }
        .ae-stage-rail { justify-content: flex-end; }
        .ae-title { max-width: 20ch; }
        .ae-close { width: 42px; height: 42px; }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-stage {
            height: 110px;
            padding: 14px 14px 0;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-stage-rail {
            right: 14px;
            bottom: 15px;
            left: 14px;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-paper {
            margin-top: -18px;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-identity {
            padding: 17px 16px 13px;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-identity::after {
            right: 16px;
            left: 16px;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-title {
            max-width: 18ch;
            font-size: 26px;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-subtitle {
            margin-top: 5px;
            font-size: 11.5px;
            line-height: 1.35;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-content-frame {
            margin: 8px 6px 6px;
            border-radius: 12px;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-scroll {
            padding: 10px 8px 12px;
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-dock {
            padding: 0 8px max(8px,env(safe-area-inset-bottom));
        }
        .ae-root:is([data-account-surface="membership"], [data-account-surface="ledger"]) .ae-dock__actions {
            padding-top: 8px;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .ae-console,
        .ae-backdrop { animation: none !important; }
        .ae-primary,
        .ae-primary__orb,
        .ae-secondary,
        .ae-close { transition: none !important; }
    }
`;

type AccountWorkspaceStyle = CSSProperties & { "--ae-accent": string };

export default function AccountModalShell({
    bannerGradient,
    eyebrow,
    title,
    subtitle,
    wordmark,
    accent = "#15678d",
    serial = "UBSC / 2026",
    index,
    onClose,
    children,
    footer,
    maxWidthClass = "sm:max-w-2xl",
}: AccountModalShellProps) {
    const [leaving, setLeaving] = useState(false);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeTimerRef = useRef<number | null>(null);
    const titleId = useId();
    const descriptionId = useId();
    const number = index ?? sectionIndex[wordmark] ?? "01";

    const requestClose = useCallback(() => {
        setLeaving((current) => {
            if (current) return current;
            closeTimerRef.current = window.setTimeout(onClose, 180);
            return true;
        });
    }, [onClose]);

    useEffect(() => () => {
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    }, []);

    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const scrollbar = window.innerWidth - html.clientWidth;
        const previous = {
            htmlOverflow: html.style.overflow,
            bodyOverflow: body.style.overflow,
            htmlPaddingRight: html.style.paddingRight,
        };

        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;

        const previouslyFocused = document.activeElement as HTMLElement | null;
        window.requestAnimationFrame(() => {
            dialogRef.current
                ?.querySelector<HTMLElement>(
                    "button, a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
                )
                ?.focus({ preventScroll: true });
        });

        return () => {
            html.style.overflow = previous.htmlOverflow;
            body.style.overflow = previous.bodyOverflow;
            html.style.paddingRight = previous.htmlPaddingRight;
            previouslyFocused?.focus?.({ preventScroll: true });
        };
    }, []);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") requestClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [requestClose]);

    const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab" || !dialogRef.current) return;
        const focusable = Array.from(
            dialogRef.current.querySelectorAll<HTMLElement>(
                "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
            ),
        ).filter((element) => element.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <div
            className="ae-root"
            style={{ "--ae-accent": accent } as AccountWorkspaceStyle}
            data-account-surface={bannerGradient}
            data-lenis-prevent
        >
            <style>{ACCOUNT_WORKSPACE_CSS}</style>
            <button
                type="button"
                className="ae-backdrop"
                data-leaving={leaving}
                onClick={requestClose}
                aria-label="Tutup panel akun"
                tabIndex={-1}
            />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descriptionId}
                onKeyDown={trapFocus}
                className={cn("ae-console", maxWidthClass)}
                data-leaving={leaving}
            >
                <header className="ae-stage" data-surface={bannerGradient}>
                    <div className="ae-topline">
                        <div className="ae-context">
                            <span className="ae-context__mark" aria-hidden="true" />
                            <div className="ae-context__copy">
                                <p className="ae-context__title">{eyebrow}</p>
                                <p className="ae-context__meta">{wordmark} · pusat akun</p>
                            </div>
                        </div>
                        <div className="ae-head-actions">
                            <span className="ae-section-index">{String(number).padStart(2, "0")} / 04</span>
                            <button type="button" className="ae-close" onClick={requestClose} aria-label="Tutup">
                                <X aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                    <div className="ae-stage-rail">
                        <span>{serial}</span>
                        <span className="ae-stage-rail__secure"><ShieldCheck aria-hidden="true" /> Sesi akun terlindungi</span>
                    </div>
                </header>

                <section className="ae-paper">
                    <div className="ae-identity">
                        <h2 id={titleId} className="ae-title">{title}</h2>
                        <p id={descriptionId} className="ae-subtitle">{subtitle}</p>
                    </div>

                    <div className="ae-content-frame">
                        <div className="account-modal-scroll ae-scroll">{children}</div>
                        {footer && <footer className="ae-dock"><div className="ae-dock__actions">{footer}</div></footer>}
                    </div>
                </section>
            </div>
        </div>
    );
}

export function PrimaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button {...props} className={cn("ae-primary", className)}>
            <span className="ae-primary__copy">{children}</span>
            <span className="ae-primary__orb" aria-hidden="true"><AccountCtaArrow /></span>
        </button>
    );
}

export function AccountCtaArrow({ className }: { className?: string }) {
    return (
        <svg
            className={cn("ae-cta-arrow", className)}
            viewBox="0 0 72 72"
            fill="none"
            aria-hidden="true"
        >
            <path d="M24 36H53" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M42 22L56 36L42 50" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M29 32.8C32.6 34.9 36 35.8 40 36" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity=".48" />
        </svg>
    );
}

export function SecondaryButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button {...props} className={cn("ae-secondary", className)}>
            <X aria-hidden="true" />
            {children}
        </button>
    );
}
