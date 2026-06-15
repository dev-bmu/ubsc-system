import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

interface EntranceLoaderProps {
    /** Called when the full entrance animation (including exit) is complete */
    onComplete: () => void;
    /** Called when the intro content is done and exit begins */
    onExitStart?: () => void;
}

const META_ITEMS = ["Training", "Court", "Membership"];
const TAGLINE_WORDS = ["Train.", "Play.", "Recover.", "Belong."];

/**
 * Full-screen cinematic entrance loader.
 *
 * Animation timeline (all CSS-driven):
 *   Phase 1  (0–400ms)    Background fade-in + grain overlay
 *   Phase 2  (200–800ms)  Logo clip-path reveal from center
 *   Phase 3  (600–1200ms) Horizontal line extends outward
 *   Phase 4  (800–1400ms) Tagline words stagger up
 *   Phase 5  (1200–1800ms) Meta tags fade in
 *   Phase 6  (1400–2200ms) Progress bar fills
 *   Phase 7  (2200–2800ms) Split-curtain exit
 */
export default function EntranceLoader({
    onComplete,
    onExitStart,
}: EntranceLoaderProps) {
    const [phase, setPhase] = useState<"intro" | "exit" | "done">("intro");

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Start exit phase after intro animations complete
        const exitTimer = window.setTimeout(() => {
            setPhase("exit");
            onExitStart?.();
        }, 1480);

        // Fully remove after curtain animation
        const doneTimer = window.setTimeout(() => {
            setPhase("done");
            onComplete();
        }, 2140);

        return () => {
            window.clearTimeout(exitTimer);
            window.clearTimeout(doneTimer);
        };
    }, [onComplete, onExitStart]);

    if (phase === "done" || !mounted) return null;

    const isExiting = phase === "exit";

    return createPortal(
        <div
            className={`entrance-loader ${isExiting ? "entrance-loader--exit" : ""}`}
            aria-label="Loading UB Sport Center"
            role="progressbar"
        >
            {/* ── Background ── */}
            <div className="entrance-bg" />
            <div className="entrance-grain" aria-hidden="true" />

            {/* ── Subtle frame lines ── */}
            <div className="entrance-frame" aria-hidden="true">
                <span className="entrance-frame-line entrance-frame-line--top" />
                <span className="entrance-frame-line entrance-frame-line--right" />
                <span className="entrance-frame-line entrance-frame-line--bottom" />
                <span className="entrance-frame-line entrance-frame-line--left" />
            </div>

            {/* ── Center Stage ── */}
            <div className="entrance-stage">
                {/* Logo */}
                <div className="entrance-logo-wrap">
                    <img
                        src="/ubsc.svg"
                        alt="UB Sport Center"
                        className="entrance-logo"
                        draggable={false}
                    />
                    <div className="entrance-logo-glow" aria-hidden="true" />
                </div>

                {/* Horizontal line */}
                <div className="entrance-line" aria-hidden="true" />

                {/* Tagline */}
                <div className="entrance-tagline" aria-hidden="true">
                    {TAGLINE_WORDS.map((word, i) => (
                        <span
                            key={word}
                            className="entrance-tagline-word"
                            style={
                                { "--entrance-word-i": i } as CSSProperties
                            }
                        >
                            {word}
                        </span>
                    ))}
                </div>

                {/* Meta */}
                <div className="entrance-meta" aria-hidden="true">
                    {META_ITEMS.map((item, i) => (
                        <span
                            key={item}
                            className="entrance-meta-item"
                            style={
                                { "--entrance-meta-i": i } as CSSProperties
                            }
                        >
                            {item}
                        </span>
                    ))}
                </div>
            </div>

            {/* ── Progress bar ── */}
            <div className="entrance-progress" aria-hidden="true">
                <div className="entrance-progress-fill" />
            </div>

            {/* ── Split curtain exit ── */}
            <div className="entrance-curtain entrance-curtain--top" />
            <div className="entrance-curtain entrance-curtain--bottom" />
        </div>,
        document.body
    );
}
