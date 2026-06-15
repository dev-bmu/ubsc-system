import { useEffect, useRef, useState } from "react";
import TopBg from "@/../assets/hero/Top.png";
import RightBg from "@/../assets/images/bg-heroabout.avif";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";

// ─────────────────────────────────────────────
// AboutHero — Cinematic entrance experience
//
// All animations are 100% CSS-driven via class
// toggles (zero JS loops). GPU-accelerated with
// translate3d + will-change. Total entrance
// sequence: ~2.2s with 7 orchestrated phases.
//
// Phase 1 (0ms):     Prep will-change hints
// Phase 2 (80ms):    Background panels reveal
//                    with subtle scale breathe
// Phase 3 (300ms):   Light sweep diagonal
// Phase 4 (480ms):   Star icon spin-drop
// Phase 5 (600ms):   Title clip-path wipe
// Phase 6 (800ms):   Description lines stagger
// Phase 7 (1100ms):  Bottom bar slide-up
//
// Total: ~2.2s | GPU layers: 8 | No reflows.
// ─────────────────────────────────────────────

export default function AboutHero() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const [phase, setPhase] = useState<"idle" | "prep" | "enter" | "settled">(
        "idle",
    );

    useEffect(() => {
        // Phase 1: prep (will-change hints)
        const t1 = setTimeout(() => setPhase("prep"), 30);
        // Phase 2+: enter (trigger all CSS animations)
        const t2 = setTimeout(() => setPhase("enter"), 80);
        // Cleanup will-change after animations complete
        const t3 = setTimeout(() => setPhase("settled"), 2800);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, []);

    const cls = `ah-hero ah-hero--${phase}`;

    return (
        <section
            ref={sectionRef}
            id="about-hero"
            className={`${cls} relative h-[100svh] w-full overflow-hidden bg-black text-white`}
        >
            {/* ── TOP PANEL (blue gradient / aerial photo) ─── */}
            <div className="ah-panel ah-panel--top pointer-events-none absolute inset-x-0 top-0 h-[48%] overflow-hidden bg-[#103755] sm:h-[52%] lg:h-[56%] xl:h-[59.5%]">
                <img
                    src={TopBg}
                    alt=""
                    aria-hidden
                    className="ah-panel-img absolute inset-0 h-full w-full object-cover object-top"
                />
                {/* Subtle vignette overlay on top panel */}
                <div
                    aria-hidden
                    className="ah-vignette absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(ellipse at 50% 30%, transparent 40%, rgba(0,0,0,0.18) 100%)",
                    }}
                />
            </div>

            {/* ── BOTTOM PANEL (gym photo + overlays) ──────── */}
            <div className="ah-panel ah-panel--bottom pointer-events-none absolute inset-x-0 bottom-0 top-[48%] bg-black sm:top-[52%] lg:top-[56%] xl:top-[59.5%]">
                <img
                    src={RightBg}
                    alt=""
                    aria-hidden
                    className="ah-panel-img absolute inset-0 h-full w-full object-cover object-center opacity-70 md:opacity-80 xl:left-[29.2%] xl:w-[70.8%] xl:opacity-100"
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.92)_0%,rgba(0,0,0,.72)_44%,rgba(0,0,0,.22)_100%)] xl:left-[29.2%] xl:bg-[linear-gradient(90deg,rgba(0,0,0,.24)_0%,rgba(0,0,0,.04)_44%,rgba(0,0,0,.08)_100%)]" />
                <div className="absolute inset-y-0 left-0 hidden w-[29.2%] bg-black xl:block" />
            </div>

            {/* ── LIGHT SWEEP (diagonal shimmer) ──────────── */}
            <div aria-hidden className="ah-sweep absolute inset-0 z-[2]" />

            {/* ── HORIZONTAL DIVIDER LINE at split ─────────── */}
            <div
                aria-hidden
                className="ah-split-line absolute inset-x-0 z-[3]"
                style={{ top: "48%" }}
            />

            {/* ── CONTENT AREA ────────────────────────────── */}
            <div className="absolute inset-x-0 bottom-[104px] top-[48%] z-10 grid content-center gap-5 px-5 py-5 sm:bottom-[96px] sm:top-[52%] sm:grid-cols-[0.82fr_1.18fr] sm:items-center sm:gap-8 sm:px-10 md:px-14 lg:top-[56%] lg:px-16 xl:bottom-[100px] xl:top-[59.5%] xl:grid-cols-[29.2%_70.8%] xl:gap-0 xl:px-0 xl:py-0">
                {/* Left column — star + title */}
                <div className="flex min-w-0 flex-col justify-center xl:h-full xl:px-[clamp(3rem,3.2vw,4rem)]">
                    <img
                        src="/assets/hero/star.png"
                        alt=""
                        aria-hidden
                        className="ah-star mb-3 h-9 w-9 object-contain opacity-95 sm:mb-4 sm:h-12 sm:w-12 xl:mb-5 xl:h-[72px] xl:w-[72px]"
                    />
                    <h1 className="ah-title overflow-hidden font-bdo text-[clamp(1.8rem,8vw,2.55rem)] font-medium leading-[1.04] tracking-[-0.017em] sm:text-[clamp(2rem,4.5vw,3rem)] xl:text-[clamp(2.35rem,2.7vw,3.25rem)]">
                        <span className="ah-title-inner block">
                            Tentang Kami
                        </span>
                    </h1>
                </div>

                {/* Right column — description */}
                <div className="flex min-w-0 items-center sm:justify-end xl:h-full xl:px-[clamp(3rem,3.2vw,4rem)]">
                    <p className="ah-desc max-w-[520px] font-bdo text-[clamp(0.8rem,3.4vw,1rem)] font-light leading-[1.34] text-white/80 sm:text-[clamp(0.9rem,2.2vw,1.25rem)] xl:text-[clamp(1.05rem,1.45vw,1.75rem)]">
                        <span className="xl:hidden">
                            Mengenal UB Sport Center pusat olahraga{" "}
                            <span className="font-medium text-white">
                                terpadu yang berkembang bersama fasilitas,
                                layanan, dan komunitas aktif.
                            </span>
                        </span>
                        <span className="hidden xl:block">
                            <span className="block whitespace-nowrap">
                                Mengenal UB Sport Center pusat olahraga
                            </span>
                            <span className="block whitespace-nowrap font-medium text-white">
                                terpadu yang berkembang bersama
                            </span>
                            <span className="block whitespace-nowrap font-medium text-white">
                                fasilitas, layanan, dan komunitas aktif.
                            </span>
                        </span>
                    </p>
                </div>
            </div>

            {/* ── BOTTOM BAR ──────────────────────────────── */}
            <div className="ah-bottom absolute inset-x-0 bottom-0 z-20">
                <HeroBottomBar
                    variant="transparent"
                    sectionNumber="02/"
                    sectionLabel="aboutpage"
                    description="UB Sport Center - Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama."
                    targetId="about-history"
                    showVideo={false}
                    insetLine
                />
            </div>
        </section>
    );
}
