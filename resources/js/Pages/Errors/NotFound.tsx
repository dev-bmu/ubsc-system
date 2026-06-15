import { Head, Link } from "@inertiajs/react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Footer from "@/Components/Landing/Footer";
import Navbar from "@/Components/Landing/Navbar";

const NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)' opacity='.45'/%3E%3C/svg%3E")`;

const C = {
    bg: "#050711",
    bgSoft: "#08101d",
    paper: "#f8fbff",
    muted: "rgba(248,251,255,0.62)",
    faint: "rgba(248,251,255,0.34)",
    hairline: "rgba(248,251,255,0.11)",
    red: "#FF0000",
    redDark: "#790A0A",
    redGlow: "rgba(255,0,0,0.32)",
    blue: "#15678D",
    blueDark: "#173859",
    blueGlow: "rgba(21,103,141,0.28)",
} as const;

/*
 * STATS – desktop: absolutely placed on the image panel corners.
 * Positions adjusted so they never clash with navbar (top) or button (bottom).
 *   • top: "11%" → "21%"  (clears ~110px navbar at any viewport ≥ 520px)
 *   • bottom: "13%" → "24%" (clears 68px button + padding comfortably)
 */
const STATS = [
    {
        id: "status",
        label: "STATUS",
        value: "404",
        desc: "Page not found",
        pos: { top: "21%", left: "6%" },
        align: "left" as const,
    },
    {
        id: "area",
        label: "AREA",
        value: "UB",
        desc: "Sport Center",
        pos: { top: "21%", right: "6%" },
        align: "right" as const,
    },
    {
        id: "signal",
        label: "SIGNAL",
        value: "0%",
        desc: "No active route",
        pos: { bottom: "24%", left: "6%" },
        align: "left" as const,
    },
    {
        id: "action",
        label: "ACTION",
        value: "01",
        desc: "Back to home",
        pos: { bottom: "24%", right: "6%" },
        align: "right" as const,
    },
];

export default function NotFound() {
    const rm = useReducedMotion();

    const a = (delay = 0) => ({
        initial: { opacity: 0, y: rm ? 0 : 30 },
        animate: { opacity: 1, y: 0 },
        transition: {
            duration: rm ? 0 : 1.15,
            delay: rm ? 0 : delay,
            ease: [0.16, 1, 0.3, 1] as const,
        },
    });

    return (
        <>
            <Head>
                <title>404 | UB Sport Center</title>
                <meta
                    name="description"
                    content="Halaman 404 UB Sport Center."
                />
                <meta name="robots" content="noindex" />
                <link
                    rel="preload"
                    as="image"
                    href="/assets/images/ub-sport-center-gym-footer.avif"
                />
            </Head>

            <style>{`
                /* ── Typography ─────────────────────────────────────────────── */

                .nf-num {
                    font-family: 'Archivo', 'Arial Black', sans-serif;
                    font-weight: 900;
                    font-size: clamp(8rem, 22vw, 20rem);
                    line-height: 0.82;
                    letter-spacing: -0.045em;
                    color: ${C.paper};
                    text-shadow:
                        0 0 54px ${C.redGlow},
                        0 0 130px ${C.blueGlow},
                        0 28px 90px rgba(0,0,0,0.9);
                }

                .nf-kicker {
                    font-family: 'Clash Display', 'Arial Black', sans-serif;
                    font-size: clamp(0.92rem, 1.25vw, 1.16rem);
                    font-weight: 500;
                    line-height: 1.5;
                    color: ${C.muted};
                    max-width: 26rem;
                }

                /* stat value */
                .nf-sv {
                    font-family: 'Clash Display', 'Arial Black', sans-serif;
                    font-weight: 700;
                    font-size: clamp(1.55rem, 2.8vw, 2.4rem);
                    line-height: 0.88;
                    letter-spacing: -0.025em;
                    color: ${C.paper};
                }

                /* stat label */
                .nf-sl {
                    font-family: 'BDO Grotesk', monospace;
                    font-size: 8.5px;
                    letter-spacing: 0.26em;
                    text-transform: uppercase;
                    color: ${C.faint};
                    display: block;
                    margin-bottom: 4px;
                }

                /* stat description */
                .nf-sd {
                    font-family: 'BDO Grotesk', monospace;
                    font-size: 10.5px;
                    letter-spacing: 0.04em;
                    color: ${C.muted};
                    margin-top: 5px;
                    line-height: 1.45;
                    display: block;
                }

                /* ── CTA button ─────────────────────────────────────────────── */

                .nf-cta {
                    display: inline-flex;
                    align-items: center;
                    gap: 14px;
                    min-height: 68px;
                    padding: 15px 18px 15px 26px;
                    background: linear-gradient(135deg, ${C.red} 0%, ${C.redDark} 100%);
                    color: ${C.paper};
                    font-family: 'Archivo', sans-serif;
                    font-weight: 700;
                    font-size: 12.5px;
                    letter-spacing: 0.11em;
                    text-transform: uppercase;
                    text-decoration: none;
                    box-shadow:
                        0 20px 64px ${C.redGlow},
                        inset 0 1px 0 rgba(255,255,255,0.28);
                    transition:
                        background 0.32s ease,
                        box-shadow 0.32s ease,
                        transform 0.32s ease;
                    outline: none;
                    cursor: pointer;
                }

                .nf-cta:hover {
                    background: linear-gradient(135deg, ${C.red} 0%, ${C.blue} 100%);
                    box-shadow:
                        0 28px 88px rgba(255,0,0,0.42),
                        0 18px 72px rgba(21,103,141,0.26),
                        inset 0 1px 0 rgba(255,255,255,0.34);
                    transform: translateY(-2px);
                }

                .nf-cta:focus-visible {
                    outline: 2px solid ${C.paper};
                    outline-offset: 3px;
                }

                .nf-cta-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 38px;
                    height: 38px;
                    border: 1px solid rgba(248,251,255,0.38);
                    flex-shrink: 0;
                    transition: transform 0.32s ease, border-color 0.32s ease;
                }

                .nf-cta:hover .nf-cta-icon {
                    border-color: rgba(248,251,255,0.7);
                    transform: translate(3px, -3px);
                }

                /* ── Decorative ─────────────────────────────────────────────── */

                .nf-ring-spin {
                    transform-origin: 200px 200px;
                    animation: nfSpin 100s linear infinite;
                }

                @keyframes nfSpin {
                    to { transform: rotate(360deg); }
                }

                .nf-scan {
                    position: absolute;
                    inset: 0 0 auto 0;
                    height: 1px;
                    background: linear-gradient(
                        90deg,
                        transparent 0%,
                        ${C.red} 20%,
                        ${C.blue} 50%,
                        ${C.redDark} 78%,
                        transparent 100%
                    );
                    animation: nfScanMove 6s ease-in-out infinite;
                    pointer-events: none;
                    opacity: 0;
                }

                @keyframes nfScanMove {
                    0%   { top: 3%;  opacity: 0;    }
                    8%   {           opacity: 0.58; }
                    92%  {           opacity: 0.58; }
                    100% { top: 97%; opacity: 0;    }
                }

                /* ── Layout ─────────────────────────────────────────────────── */

                .nf-root {
                    background: ${C.bg};
                }

                .nf-hero {
                    position: sticky;
                    top: 0;
                    height: 100svh;
                    min-height: 680px;
                    overflow: hidden;
                    background: ${C.bg};
                    z-index: 1;
                }

                .nf-footer-reveal {
                    position: relative;
                    z-index: 10;
                }

                /*
                 * Desktop fade: left panel (text) → right panel (image).
                 * On mobile the fade becomes a vertical vignette so the
                 * full-screen background keeps all its red/blue richness.
                 */
                .nf-fade-h {
                    background: linear-gradient(
                        90deg,
                        rgba(5,7,17,1)    0%,
                        rgba(5,7,17,0.72) 18%,
                        rgba(5,7,17,0.16) 48%,
                        transparent       100%
                    );
                }

                /* ── Mobile overrides ───────────────────────────────────────── */

                @media (max-width: 1023px) {

                    .nf-num {
                        font-size: clamp(5.8rem, 26vw, 8rem);
                    }

                    .nf-hero {
                        min-height: 100svh;
                    }

                    /* Full-width button on mobile */
                    .nf-cta {
                        width: 100%;
                        justify-content: space-between;
                    }

                    /* Replace horizontal fade with gentle vertical vignette
                       so the image colour (red / blue duotone) shows fully */
                    .nf-fade-h {
                        background: linear-gradient(
                            180deg,
                            rgba(5,7,17,0.50) 0%,
                            rgba(5,7,17,0.08) 40%,
                            rgba(5,7,17,0.50) 100%
                        );
                    }

                    /* Mobile inline stats: 2 × 2 grid */
                    .nf-stats-m .nf-sv {
                        font-size: clamp(1.1rem, 4.5vw, 1.5rem);
                    }
                }

                @media (prefers-reduced-motion: reduce) {
                    .nf-ring-spin,
                    .nf-scan {
                        animation: none;
                    }
                }
            `}</style>

            <Navbar activeSection="404" />

            <div className="nf-root">
                <main
                    className="nf-hero"
                    role="main"
                    aria-label="Halaman 404 UB Sport Center"
                >

                    {/* ═══════════════════════════════════════════════════════════
                        BACKGROUND IMAGE PANEL
                        Desktop: right 50% · Mobile: full width
                    ═══════════════════════════════════════════════════════════ */}
                    <div
                        className="absolute inset-y-0 right-0 w-full lg:w-1/2"
                        aria-hidden="true"
                    >
                        <img
                            src="/assets/images/ub-sport-center-gym-footer.avif"
                            alt=""
                            draggable={false}
                            className="pointer-events-none h-full w-full select-none object-cover object-center"
                            style={{
                                filter: "saturate(0.64) contrast(1.18) brightness(0.58)",
                            }}
                        />

                        {/* Red / blue duotone — visible on ALL screen sizes */}
                        <div
                            className="absolute inset-0"
                            style={{
                                background:
                                    "linear-gradient(148deg, rgba(255,0,0,0.52) 0%, rgba(121,10,10,0.28) 34%, rgba(21,103,141,0.42) 66%, rgba(23,56,89,0.68) 100%)",
                            }}
                        />

                        {/* Directional fade: horizontal on desktop, vertical on mobile */}
                        <div className="nf-fade-h absolute inset-0" />

                        {/* Top + bottom vignette */}
                        <div
                            className="absolute inset-0"
                            style={{
                                background:
                                    "linear-gradient(180deg, rgba(5,7,17,0.64) 0%, transparent 26%, transparent 62%, rgba(5,7,17,0.88) 100%)",
                            }}
                        />

                        {/* Film-grain noise */}
                        <div
                            className="absolute inset-0 mix-blend-screen"
                            style={{
                                backgroundImage: NOISE,
                                backgroundSize: "160px",
                                opacity: 0.16,
                            }}
                        />

                        <div className="nf-scan" />

                        {/* ── Desktop corner stats ─────────────────────────────
                            Positions moved down/up to clear navbar and button:
                              top 11% → 21%   (clears navbar)
                              bottom 13% → 24%  (clears button)
                        ─────────────────────────────────────────────────────── */}
                        {STATS.map((s, i) => (
                            <motion.div
                                key={s.id}
                                {...a(0.48 + i * 0.09)}
                                className="absolute hidden lg:flex lg:flex-col"
                                style={{
                                    ...s.pos,
                                    alignItems:
                                        s.align === "right" ? "flex-end" : "flex-start",
                                    textAlign: s.align,
                                }}
                            >
                                <span className="nf-sl">{s.label}</span>
                                <span className="nf-sv">{s.value}</span>
                                <span className="nf-sd">{s.desc}</span>
                            </motion.div>
                        ))}
                    </div>

                    {/* ═══════════════════════════════════════════════════════════
                        CONTENT SECTION
                        justify-between on ALL breakpoints pins three children to:
                          TOP    → "Page status" label
                          MIDDLE → kicker + 404
                          BOTTOM → [mobile: stats grid] + button
                    ═══════════════════════════════════════════════════════════ */}
                    <section
                        className="relative z-10 flex h-full flex-col justify-between px-7 pb-10 pt-32 sm:px-10 sm:pb-14 lg:w-[52%] lg:px-16 lg:pb-16 lg:pt-36"
                    >

                        {/* Decorative SVG orbit ring — absolute, not in flex flow */}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute select-none"
                            style={{
                                width: "min(80vw, 600px)",
                                height: "min(80vw, 600px)",
                                left: "50%",
                                top: "50%",
                                transform: "translate(-46%, -52%)",
                            }}
                        >
                            <svg
                                viewBox="0 0 400 400"
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-full w-full"
                                overflow="visible"
                            >
                                <defs>
                                    <path
                                        id="nf-text-ring"
                                        d="M200,200 m-185,0 a185,185 0 1,1 370,0 a185,185 0 1,1 -370,0"
                                    />
                                </defs>
                                <circle cx="200" cy="200" r="197" fill="none"
                                    stroke="rgba(21,103,141,0.24)" strokeWidth="0.65" />
                                <circle cx="200" cy="200" r="158" fill="none"
                                    stroke="rgba(255,0,0,0.14)" strokeWidth="0.5"
                                    strokeDasharray="3 10" />
                                <g className="nf-ring-spin">
                                    <text fontFamily="'BDO Grotesk', monospace"
                                        fontSize="10" letterSpacing="12.5"
                                        fill="rgba(248,251,255,0.18)">
                                        <textPath href="#nf-text-ring">
                                            UB SPORT CENTER / PAGE STATUS / ERROR 404 / UB SPORT CENTER / PAGE STATUS / ERROR 404 /&nbsp;
                                        </textPath>
                                    </text>
                                </g>
                                {[0, 90, 180, 270].map((deg) => {
                                    const rad = (deg * Math.PI) / 180;
                                    return (
                                        <line key={deg}
                                            x1={200 + 190 * Math.cos(rad)}
                                            y1={200 + 190 * Math.sin(rad)}
                                            x2={200 + 205 * Math.cos(rad)}
                                            y2={200 + 205 * Math.sin(rad)}
                                            stroke="rgba(21,103,141,0.24)"
                                            strokeWidth="1"
                                        />
                                    );
                                })}
                            </svg>
                        </div>

                        {/* ── TOP ── Page status breadcrumb */}
                        <motion.div {...a(0)}>
                            <p
                                className="inline-flex items-center gap-3 font-bdo text-[9px] uppercase tracking-[0.3em]"
                                style={{ color: C.faint }}
                            >
                                <span
                                    className="inline-block h-px w-7"
                                    style={{
                                        background: "linear-gradient(90deg, #FF0000 0%, #15678D 100%)",
                                    }}
                                />
                                Page status
                            </p>
                        </motion.div>

                        {/* ── MIDDLE ── Kicker + giant 404 */}
                        <div className="relative">
                            <motion.p className="nf-kicker mb-4 sm:mb-5" {...a(0.15)}>
                                Link yang kamu buka belum tersedia atau sudah dipindahkan.
                            </motion.p>

                            <motion.h1
                                className="nf-num"
                                aria-label="Error 404"
                                {...a(0.24)}
                            >
                                404
                            </motion.h1>
                        </div>

                        {/* ── BOTTOM ── Stats grid (mobile) + button ─────────────
                            Mobile: all four stats shown as a clean 2 × 2 grid
                                    directly above the full-width CTA button.
                            Desktop: stats are the absolute corner elements above;
                                     this grid is hidden.
                        ─────────────────────────────────────────────────────── */}
                        <motion.div {...a(0.35)} className="flex flex-col gap-5">

                            {/* 2 × 2 stats grid — mobile only */}
                            <div
                                className="nf-stats-m grid grid-cols-2 gap-x-6 gap-y-5 border-t pt-5 lg:hidden"
                                style={{ borderColor: C.hairline }}
                            >
                                {STATS.map((s) => (
                                    <div
                                        key={`${s.id}-m`}
                                        className="flex flex-col"
                                        style={{
                                            alignItems:
                                                s.align === "right"
                                                    ? "flex-end"
                                                    : "flex-start",
                                        }}
                                    >
                                        <span className="nf-sl">{s.label}</span>
                                        <span className="nf-sv">{s.value}</span>
                                        <span className="nf-sd">{s.desc}</span>
                                    </div>
                                ))}
                            </div>

                            {/* CTA button */}
                            <Link
                                href="/"
                                preserveScroll={false}
                                className="nf-cta"
                                aria-label="Kembali ke halaman beranda UB Sport Center"
                            >
                                <span>Kembali ke Beranda</span>
                                <span className="nf-cta-icon" aria-hidden="true">
                                    <ArrowUpRight className="h-4 w-4" />
                                </span>
                            </Link>
                        </motion.div>
                    </section>
                </main>

                <div className="nf-footer-reveal">
                    <Footer />
                </div>
            </div>
        </>
    );
}   