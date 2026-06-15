import { useEffect, useRef } from "react";

function lerp(a: number, b: number, n: number) {
    return (1 - n) * a + n * b;
}

interface Props {
    size?: number; // px
    followSpeed?: number; // 0-1 easing
}

export default function FluidGlassCursor({
    size = 180,
    followSpeed = 0.12,
}: Props) {
    const elRef = useRef<HTMLDivElement | null>(null);
    const ringRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const target = useRef({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        scale: 1,
    });
    const current = useRef({
        x: target.current.x,
        y: target.current.y,
        scale: 1,
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        const prefersReduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (prefersReduced) return; // don't animate

        const onMove = (e: PointerEvent) => {
            target.current.x = e.clientX;
            target.current.y = e.clientY;
            // subtle scale based on movement speed
            target.current.scale = 1.05;
            if (elRef.current) elRef.current.style.opacity = "1";
        };

        const onLeave = () => {
            if (elRef.current) elRef.current.style.opacity = "0";
        };

        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerleave", onLeave);
        window.addEventListener(
            "pointerdown",
            () => (target.current.scale = 0.9),
        );
        window.addEventListener(
            "pointerup",
            () => (target.current.scale = 1.05),
        );

        const tick = () => {
            current.current.x = lerp(
                current.current.x,
                target.current.x,
                followSpeed,
            );
            current.current.y = lerp(
                current.current.y,
                target.current.y,
                followSpeed,
            );
            current.current.scale = lerp(
                current.current.scale,
                target.current.scale,
                followSpeed,
            );

            const x = current.current.x;
            const y = current.current.y;
            const s = current.current.scale;

            if (elRef.current) {
                elRef.current.style.transform = `translate3d(${x - size / 2}px, ${y - size / 2}px, 0) scale(${s})`;
            }
            if (ringRef.current) {
                // ring lags and is slightly larger for a trailing halo
                ringRef.current.style.transform = `translate3d(${x - size / 1.6}px, ${y - size / 1.6}px, 0) scale(${Math.max(1, s)})`;
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);

        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerleave", onLeave);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [followSpeed, size]);

    return (
        // pointer-events-none so it never blocks clicks; hidden on small screens via parent
        <div aria-hidden className="pointer-events-none">
            <div
                ref={ringRef}
                style={{
                    position: "fixed",
                    left: 0,
                    top: 0,
                    width: size * 1.5,
                    height: size * 1.5,
                    borderRadius: "9999px",
                    transform: `translate3d(-50%, -50%, 0)`,
                    transition: "width 220ms ease, height 220ms ease",
                    mixBlendMode: "overlay",
                    opacity: 0.45,
                    zIndex: 40,
                    pointerEvents: "none",
                    // subtle gradient halo
                    background:
                        "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 40%, transparent 60%)",
                }}
            />

            <div
                ref={elRef}
                style={{
                    position: "fixed",
                    left: 0,
                    top: 0,
                    width: size,
                    height: size,
                    borderRadius: "9999px",
                    transform: `translate3d(-50%, -50%, 0)`,
                    transition: "opacity 200ms linear",
                    opacity: 0,
                    zIndex: 50,
                    pointerEvents: "none",
                    // glass look
                    backdropFilter: "blur(10px) saturate(130%)",
                    WebkitBackdropFilter: "blur(10px) saturate(130%)",
                    background:
                        "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
                    boxShadow:
                        "0 8px 30px rgba(2,6,23,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    mixBlendMode: "normal",
                }}
            />
        </div>
    );
}
