import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import FacilityBadge from "@/Components/Landing/FacilityBadge";

const MARQUEE_ITEMS = Array(40).fill(null);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ClassItem {
    id: string;
    name: string;
    code: string;
    image: string;
    badgeLocation: string;
    badgeCategory: string;
    comingSoon?: boolean;
}

// ─────────────────────────────────────────────
// Dummy data
// ─────────────────────────────────────────────

const DUMMY_CLASSES: ClassItem[] = [
    {
        id: "01",
        name: "Yoga",
        code: "001",
        image: "/assets/images/fasilitas-yoga-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeCategory: "Kebugaran",
    },
    {
        id: "02",
        name: "Zumba",
        code: "002",
        image: "/assets/images/fasilitas-zumba-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeCategory: "Kebugaran",
    },
    {
        id: "03",
        name: "Aerobik",
        code: "003",
        image: "/assets/images/fasilitas-aerobik-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeCategory: "Kebugaran",
    },
    {
        id: "04",
        name: "BMU Karate",
        code: "004",
        image: "/assets/images/fasilitas-beladiri-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeCategory: "Kebugaran",
    },
    {
        id: "05",
        name: "Zona Akurasi",
        code: "005",
        image: "/assets/images/fasilitas-zona-akurasi-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeCategory: "Kebugaran",
    },
    {
        id: "06",
        name: "Pilates",
        code: "006",
        image: "/assets/images/comingsoon.avif",
        badgeLocation: "Veteran",
        badgeCategory: "Kebugaran",
    },
];

// ─────────────────────────────────────────────
// Scroll-linked dot indicator (single dot)
//
// VIDEO ANALYSIS: One dot on the right side of
// the viewport. Its vertical position interpolates
// from ~30% to ~70% based on which section is
// active. The dot color adapts: dark on light
// backgrounds, light on dark backgrounds.
// The dot has a subtle ring/outline.
// ─────────────────────────────────────────────

function ScrollDotIndicator({
    total,
    progress,
}: {
    total: number;
    progress: number;
}) {
    // progress: 0 = first section centered, 1 = last section centered
    const topPercent = 30 + progress * 40; // 30% → 70%

    return (
        <div
            aria-hidden="true"
            className="fcs-dot-indicator"
            style={{
                position: "fixed",
                right: "28px",
                top: `${topPercent}%`,
                transform: "translateY(-50%)",
                zIndex: 60,
                pointerEvents: "none",
                transition: "top 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
        >
            <span
                style={{
                    display: "block",
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(140, 140, 140, 0.6)",
                    border: "1.5px solid rgba(255, 255, 255, 0.35)",
                    transition: "background-color 0.4s ease, border-color 0.4s ease",
                }}
            />
        </div>
    );
}

// ─────────────────────────────────────────────
// Single fullscreen scroll section with PARALLAX
//
// VIDEO ANALYSIS (precise mechanics):
//
// 1. LAYOUT: Each section is 100vh, position relative,
//    overflow hidden. Sections stack vertically in
//    normal document flow.
//
// 2. BACKGROUND PARALLAX:
//    Background image is 130% height, offset to -15% top.
//    As section scrolls through viewport, background
//    translateY shifts at ~40% scroll speed → parallax.
//    The object in the image appears to move slower than
//    the scroll → depth illusion.
//
// 3. CARD DESIGN (from video):
//    - White background, no border-radius or very slight
//    - Horizontal layout: [Name] [Thumbnail] [Category]
//    - Name: uppercase, bold, ~14px tracking wide
//    - Thumbnail: square-ish, ~120x100px
//    - Category: normal weight, ~14px
//    - Card positioned at ~58% from top of section
//    - Card width: ~540px max
//    - Card has subtle shadow
//
// 4. CARD ANIMATION (scroll-linked):
//    Card opacity and translateY are driven by scroll.
//    When section center is in viewport → full opacity,
//    translateY(0). As section scrolls away → fade out
//    + slight translateY. This is BIDIRECTIONAL.
//
// 5. SECTION TRANSITION:
//    Hard horizontal cut. Next section simply covers
//    previous as it scrolls up. No crossfade.
//    z-index increases per section to ensure stacking.
// ─────────────────────────────────────────────

function ClassScrollSection({
    data,
    index,
    total,
}: {
    data: ClassItem;
    index: number;
    total: number;
}) {
    const sectionRef = useRef<HTMLDivElement>(null);
    const bgRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const el = sectionRef.current;
        const bg = bgRef.current;
        const card = cardRef.current;
        const thumb = thumbRef.current;
        if (!el || !bg || !card || !thumb) return;

        let ticking = false;

        const handleScroll = () => {
            if (ticking) return;
            ticking = true;

            requestAnimationFrame(() => {
                const rect = el.getBoundingClientRect();
                const vh = window.innerHeight;

                // ── Parallax ──
                // scrollProgress: 0 when section top is at viewport bottom
                //                 0.5 when section is centered
                //                 1 when section top is at viewport top (leaving)
                const scrollProgress = 1 - (rect.top + rect.height) / (vh + rect.height);
                const clampedProgress = Math.max(0, Math.min(1, scrollProgress));

                // Background moves at 40% speed → parallax offset
                const parallaxY = (0.5 - clampedProgress) * 25;
                const thumbParallaxY = (clampedProgress - 0.5) * 34;
                bg.style.transform = `translate3d(0, ${parallaxY}%, 0)`;
                thumb.style.transform = `translate3d(0, ${thumbParallaxY}%, 0) scale(1.24)`;

                // ── Card scroll-linked animation ──
                // Card is fully visible when section center is in viewport center
                // sectionCenter relative to viewport: 0 = top, vh = bottom
                const sectionCenter = rect.top + rect.height / 2;
                const viewportCenter = vh / 2;
                const distFromCenter = Math.abs(sectionCenter - viewportCenter);
                const maxDist = vh * 0.7;

                // Normalize: 0 = far away, 1 = perfectly centered
                const visibility = Math.max(0, 1 - distFromCenter / maxDist);
                // Apply easing for smoother feel
                const easedVis = visibility * visibility * (3 - 2 * visibility); // smoothstep

                const cardTranslateY = (1 - easedVis) * 30; // 0px when centered, 30px when far
                // Direction: if section is below center, card comes from below
                const direction = sectionCenter > viewportCenter ? 1 : -1;

                card.style.opacity = "1";
                card.style.transform = `translate3d(-50%, ${direction * cardTranslateY}px, 0)`;

                ticking = false;
            });
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll(); // initial call

        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <div
            ref={sectionRef}
            id={`class-section-${data.id}`}
            style={{
                position: "relative",
                height: "100vh",
                width: "100%",
                overflow: "hidden",
                // Higher index sections stack on top (hard cut)
                zIndex: index + 1,
            }}
        >
            {/* ── Parallax background ───────────────────── */}
            <div
                ref={bgRef}
                style={{
                    position: "absolute",
                    top: "-15%",
                    left: 0,
                    right: 0,
                    height: "130%",
                    willChange: "transform",
                }}
            >
                <img
                    src={data.image}
                    alt={data.name}
                    loading={index === 0 ? "eager" : "lazy"}
                    style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: "center",
                        display: "block",
                    }}
                />
            </div>

            {/* ── Subtle dark overlay for readability ──── */}
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    inset: 0,
                    background:
                        "linear-gradient(180deg, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.12) 100%)",
                    zIndex: 1,
                }}
            />

            {/* ── White card (scroll-linked opacity + translateY) ─ */}
            <div
                ref={cardRef}
                className="absolute left-1/2 top-[34%] z-10 w-[min(232px,calc(100vw-64px))] opacity-100 will-change-transform md:top-[40%] md:w-[min(800px,calc(100vw-72px))] xl:top-[41%] xl:w-[min(760px,calc(100vw-48px))]"
                style={{ opacity: 1, transform: "translate3d(-50%, 0, 0)" }}
            >
                <div
                    className="grid overflow-hidden rounded-[5px] bg-white shadow-[0_14px_38px_rgba(0,0,0,0.08)] md:min-h-[190px] md:grid-cols-[1fr_1.05fr_1fr] xl:min-h-[150px] xl:grid-cols-[34.5%_31%_34.5%]"
                >
                    {/* Left — class name */}
                    <div
                        className="flex min-w-0 items-center justify-center px-4 py-[19px] md:justify-start md:px-7 md:py-0 xl:px-5"
                    >
                        <span
                            className="block max-w-full truncate font-bdo text-[26px] font-medium leading-none tracking-[-0.055em] text-black md:text-[clamp(1.55rem,2.8vw,2.25rem)] xl:text-[clamp(1.45rem,1.55vw,1.875rem)]"
                        >
                            /{data.name}.
                        </span>
                    </div>

                    {/* Center — thumbnail */}
                    <div
                        className="relative h-[178px] overflow-hidden md:h-auto"
                    >
                        <img
                            ref={thumbRef}
                            src={data.image}
                            alt={data.name}
                            className="absolute inset-0 h-full w-full object-cover object-center grayscale will-change-transform"
                        />
                        <div
                            className="absolute bottom-[73px] left-1/2 max-w-[calc(100%-10px)] -translate-x-1/2 md:bottom-[42px] xl:bottom-[50px] [&>div]:rounded-[5px] [&>div]:border-[3px] [&_svg]:h-[13px] [&_svg]:w-[13px] [&_span]:text-[14px] md:[&_span]:text-[13px]"
                        >
                            <FacilityBadge
                                location={data.badgeLocation}
                                category="Indoor Facility"
                            />
                        </div>
                    </div>

                    {/* Right — location & category */}
                    <div
                        className="flex min-w-0 items-center justify-center px-4 py-[17px] text-center md:justify-end md:px-7 md:py-0 md:text-right xl:px-6"
                    >
                        <span
                            className="block max-w-full truncate font-bdo text-[21px] font-normal leading-none tracking-[-0.04em] text-black/35 md:text-[clamp(1.35rem,2.35vw,1.85rem)] xl:text-[clamp(1.375rem,1.45vw,1.75rem)]"
                        >
                            /Kelas {data.code}/
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// Main exported component
// ─────────────────────────────────────────────

interface FacilityClassSectionProps {
    sectionNumber?: string;
    sectionTitle?: string;
    sectionSubtitle?: string;
    classes?: ClassItem[];
    isLandingPage?: boolean;
}

export default function FacilityClassSection({
    classes,
    isLandingPage = false,
}: FacilityClassSectionProps = {}) {
    const activeClasses =
        classes && classes.length > 0 ? classes : DUMMY_CLASSES;

    const renderedClasses = isLandingPage
        ? activeClasses.slice(0, 4)
        : activeClasses;
    const remainingClassCount = activeClasses.length;

    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <section className="overflow-x-clip bg-[#242424]" id="facility-classes">
            {/* ── Section header ──────────────────────── */}
            {/* ── 3-column intro row ──────────────────── */}
            {/* ── Fullscreen scroll sections ────────────── */}
            <div className="relative overflow-hidden border-b border-white/10 bg-black py-[14px] md:py-[18px]">
                <motion.div
                    className="flex items-center"
                    animate={{ x: ["0%", "-50%"] }}
                    transition={{ repeat: Infinity, ease: "linear", duration: 30 }}
                >
                    {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((_, i) => (
                        <span
                            key={i}
                            className="shrink-0 pr-12 font-clash text-[12px] font-semibold uppercase tracking-widest text-white lg:text-[16px]"
                        >
                            UBSC
                        </span>
                    ))}
                </motion.div>
            </div>

            <div className="mx-auto grid min-h-[134px] max-w-[1920px] grid-cols-[1fr_auto] items-center gap-x-6 gap-y-4 px-[clamp(1.75rem,4.5vw,5.5rem)] py-9 text-white md:min-h-[154px] md:grid-cols-3 md:py-12">
                <div className="flex items-center gap-5">
                    <span className="section-label-diamond" />
                    <span className="font-bdo text-[clamp(1.35rem,1.35vw,1.75rem)] font-medium tracking-[-0.035em]">
                        Kelas Kebugaran
                    </span>
                </div>

                <span className="hidden justify-self-center font-bdo text-[clamp(1rem,1vw,1.25rem)] font-light tracking-[-0.02em] text-white/72 md:block">
                    (Fasilitas)
                </span>

                <a
                    href="/facilities"
                    className="group flex items-center justify-self-end font-bdo text-[clamp(1.05rem,1vw,1.35rem)] tracking-[-0.025em] text-white/86"
                >
                    <span className="underline decoration-white/70 underline-offset-4">
                        <span className="font-light">{remainingClassCount}</span>{" "}
                        <span className="font-normal">Lainnya</span>
                    </span>
                    <span className="ml-2 text-[1.2em] leading-none transition-transform duration-300 group-hover:translate-x-1">
                        ›
                    </span>
                </a>

            </div>

            <div ref={containerRef} style={{ position: "relative" }}>
                {renderedClasses.map((item, i) => (
                    <ClassScrollSection
                        key={item.id}
                        data={item}
                        index={i}
                        total={renderedClasses.length}
                    />
                ))}
            </div>
        </section>
    );
}
