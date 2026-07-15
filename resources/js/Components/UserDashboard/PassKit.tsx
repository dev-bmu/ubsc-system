import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════════
   PASS KIT — reusable "UBSC PASS" security-document building blocks.
   Pure-CSS materials (see app.css .pass-*) wrapped as small components.
   ════════════════════════════════════════════════════════════════════ */

/** Guilloché rosette engraving — animated moiré security pattern. */
export function Guilloche({
    ink = false,
    className,
}: {
    ink?: boolean;
    className?: string;
}) {
    return (
        <div
            aria-hidden="true"
            className={cn(
                "pass-guilloche",
                ink && "pass-guilloche-ink",
                className,
            )}
        />
    );
}

/** Repeating security microtext strip (slow marquee). */
export function Microtext({
    text = "UB SPORT CENTER",
    className,
}: {
    text?: string;
    className?: string;
}) {
    const unit = ` ${text} ✦ `.toUpperCase();
    const line = unit.repeat(14);
    return (
        <div className={cn("pass-microtext", className)} aria-hidden="true">
            <span>{line + line}</span>
        </div>
    );
}

/** Ticket perforation / tear seam — punched holes + dashed line. */
export function Perforation({ className }: { className?: string }) {
    return (
        <div className={cn("pass-tear", className)} aria-hidden="true">
            <span className="pass-tear-hole pass-tear-hole-l" />
            <span className="pass-tear-line" />
            <span className="pass-tear-hole pass-tear-hole-r" />
        </div>
    );
}

/** CSS barcode strip (inherits currentColor). */
export function Barcode({ className }: { className?: string }) {
    return (
        <div
            aria-hidden="true"
            className={cn("pass-barcode", className)}
        />
    );
}

/** Holographic foil text. */
export function FoilText({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return <span className={cn("pass-foil", className)}>{children}</span>;
}

/** Engraved serial / data tag. */
export function Serial({
    children,
    className,
    style,
}: {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}) {
    return (
        <span className={cn("pass-serial font-bdo", className)} style={style}>
            {children}
        </span>
    );
}

/* ── Odometer reel: digits physically roll into place on mount ── */
function ReelDigit({ digit, delay }: { digit: number; delay: number }) {
    const [shown, setShown] = useState(0);
    useEffect(() => {
        const t = window.setTimeout(() => setShown(digit), 60 + delay);
        return () => window.clearTimeout(t);
    }, [digit, delay]);
    return (
        <span className="pass-reel-col" aria-hidden="true">
            <span
                className="pass-reel-strip"
                style={{ transform: `translateY(-${shown}em)` }}
            >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <span key={n} className="pass-reel-cell">
                        {n}
                    </span>
                ))}
            </span>
        </span>
    );
}

/**
 * Odometer number — rolls each digit up to the value on mount.
 * Accessible label provided; reels themselves are aria-hidden.
 */
export function NumberReel({
    value,
    className,
}: {
    value: number;
    className?: string;
}) {
    const digits = String(Math.max(0, Math.round(value))).split("").map(Number);
    return (
        <span className={cn("pass-reel", className)} aria-label={String(value)}>
            {digits.map((d, i) => (
                <ReelDigit key={`${i}-${digits.length}`} digit={d} delay={i * 110} />
            ))}
        </span>
    );
}
