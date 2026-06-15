"use client";

import { useState, useEffect, useRef } from "react";
import {
    ArrowRight,
    LogOut,
    User as UserIcon,
    ChevronDown,
    Settings,
    CreditCard,
    MessageCircle,
    Dumbbell,
} from "lucide-react";
import square from "../../../assets/hero/square.png";
import InfoBanner from "@/Components/Landing/InfoBanner";
import AuthModal from "@/Components/Landing/AuthModal";
import ProfileModal from "@/Components/UserDashboard/ProfileModal";
import PaymentHistoryModal from "@/Components/UserDashboard/PaymentHistoryModal";
import GymMembershipModal from "@/Components/UserDashboard/GymMembershipModal";
import { usePage } from "@inertiajs/react";
import { Link } from "@inertiajs/react";
import type { PageProps } from "@/types";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

/* ====================================================================
   TYPES
==================================================================== */
type UserModal = "profile" | "history" | "membership";

interface NavItem {
    label: string;
    number: string;
    href: string;
}

interface RGB {
    r: number;
    g: number;
    b: number;
}

interface NavbarProps {
    activeSection?: string;
    showInfoBanner?: boolean;
}

/* ====================================================================
   CONSTANTS
==================================================================== */
const NAV_ITEMS: NavItem[] = [
    { label: "Home", number: "01", href: "/" },
    { label: "About", number: "02", href: "/about" },
    { label: "News", number: "03", href: "/news" },
    { label: "Facilities", number: "04", href: "/facilities" },
    { label: "Pricing", number: "05", href: "/pricing" },
    { label: "Booking", number: "06", href: "/booking" },
];

/** Base dark neutral — rich deep-navy for premium feel */
const NEUTRAL_DARK: RGB = { r: 5, g: 7, b: 18 };

/**
 * Per-frame interpolation factor.
 * ~95% of the way in ~830ms — smooth but responsive.
 */
const LERP_SPEED = 0.062;

/* ====================================================================
   PURE COLOR UTILITIES
==================================================================== */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const lerpRGB = (from: RGB, to: RGB, t: number): RGB => ({
    r: lerp(from.r, to.r, t),
    g: lerp(from.g, to.g, t),
    b: lerp(from.b, to.b, t),
});

/** Perceived brightness using BT.601 luma coefficients */
const rgbBrightness = ({ r, g, b }: RGB): number =>
    r * 0.299 + g * 0.587 + b * 0.114;

/**
 * Normalise extracted color toward NEUTRAL_DARK.
 * Bright source images pull harder toward the neutral to stay elegant.
 */
const normalizeColor = (c: RGB): RGB => {
    const br = rgbBrightness(c) / 255;
    const avg = (c.r + c.g + c.b) / 3;
    const chromaSoften = 0.14;
    const softened: RGB = {
        r: lerp(c.r, avg, chromaSoften),
        g: lerp(c.g, avg, chromaSoften),
        b: lerp(c.b, avg, chromaSoften),
    };
    const mix = 0.3 + br * 0.5;
    return {
        r: Math.round(lerp(softened.r, NEUTRAL_DARK.r, mix)),
        g: Math.round(lerp(softened.g, NEUTRAL_DARK.g, mix)),
        b: Math.round(lerp(softened.b, NEUTRAL_DARK.b, mix)),
    };
};

/**
 * Extract dominant colour from an <img> element via Canvas.
 */
function sampleDominantColor(img: HTMLImageElement): RGB {
    try {
        const THUMB = 64;
        const canvas = document.createElement("canvas");
        canvas.width = THUMB;
        canvas.height = THUMB;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return { ...NEUTRAL_DARK };

        ctx.drawImage(img, 0, 0, THUMB, THUMB);
        const { data } = ctx.getImageData(0, 0, THUMB, THUMB);

        let r = 0,
            g = 0,
            b = 0,
            n = 0;
        const STEP = 3;
        for (let i = 0; i < data.length; i += 4 * STEP) {
            if (data[i + 3] < 120) continue;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n++;
        }
        if (!n) return { ...NEUTRAL_DARK };
        return {
            r: Math.round(r / n),
            g: Math.round(g / n),
            b: Math.round(b / n),
        };
    } catch {
        return { ...NEUTRAL_DARK };
    }
}

/* ====================================================================
   KINETIC NAV LINK
==================================================================== */
interface KineticNavLinkProps {
    item: NavItem;
    isActive: boolean;
}

function KineticNavLink({ item, isActive }: KineticNavLinkProps) {
    const activeCol = "rgba(255,255,255,0.95)";
    const idleCol = "rgba(255,255,255,0.65)";
    const supCol = "rgba(255,255,255,0.35)";

    return (
        <a
            href={item.href}
            className={`kinetic-nav-link ${isActive ? "kinetic-nav-active" : ""} font-clash text-[clamp(0.75rem,1vw,16px)] tracking-wide`}
            style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: "1px",
                color: isActive ? activeCol : idleCol,
                textDecoration: "none",
                outline: "none",
                userSelect: "none",
                transition: "color 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                letterSpacing: "0.02em",
            }}
        >
            <span
                style={{
                    display: "inline-block",
                    overflow: "hidden",
                    position: "relative",
                    lineHeight: 1.15,
                }}
            >
                <span
                    className="knav-primary"
                    style={{ display: "block", willChange: "transform" }}
                >
                    {item.label}
                </span>
                <span
                    className="knav-clone"
                    aria-hidden="true"
                    style={{
                        display: "block",
                        position: "absolute",
                        inset: 0,
                        transform: "translateY(-110%)",
                        willChange: "transform",
                        color: isActive ? activeCol : "rgba(255,255,255,0.85)",
                    }}
                >
                    {item.label}
                </span>
            </span>
            <sup
                style={{
                    display: "inline-block",
                    overflow: "hidden",
                    position: "relative",
                    fontSize: "10px",
                    lineHeight: 1,
                    verticalAlign: "super",
                    color: supCol,
                    marginLeft: "1px",
                }}
            >
                <span
                    className="knav-num-primary"
                    style={{ display: "block", willChange: "transform" }}
                >
                    {item.number}
                </span>
                <span
                    className="knav-num-clone"
                    aria-hidden="true"
                    style={{
                        display: "block",
                        position: "absolute",
                        inset: 0,
                        transform: "translateY(110%)",
                    }}
                >
                    {item.number}
                </span>
            </sup>
        </a>
    );
}

/* ====================================================================
   MAIN COMPONENT
==================================================================== */
export default function Navbar({
    activeSection = "Home",
    showInfoBanner = true,
}: NavbarProps) {
    /* ── Auth state ── */
    const { auth } = usePage<PageProps>().props;
    const user = auth?.user ?? null;
    const isLoggedIn = !!user;

    /* ── UI state ── */
    const [mobileOpen, setMobileOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    /* ── Modal state (from Navbar__1_.tsx) ── */
    const [authOpen, setAuthOpen] = useState(false);
    const [authInitialTab, setAuthInitialTab] = useState<"login" | "register">(
        "login",
    );
    const [activeUserModal, setActiveUserModal] = useState<UserModal | null>(
        null,
    );
    const [avatarFailed, setAvatarFailed] = useState(false);

    /* ── Navbar & Background Scroll Behavior ── */
    const [navHidden, setNavHidden] = useState(false);
    const [showBg, setShowBg] = useState(false);
    const lastScrollY = useRef(0);
    const lastScrollUp = useRef(false);
    const ticking = useRef(false);
    const bgOpacity = useRef(0);

    useEffect(() => {
        const update = () => {
            const y = window.scrollY;
            const scrollingUp = y < lastScrollY.current;
            const isAtTop = y < 50;

            if (y !== lastScrollY.current) {
                lastScrollUp.current = scrollingUp;
            }

            const targetOpacity = y > 50 ? 1 : 0;
            if (targetOpacity !== bgOpacity.current) {
                bgOpacity.current = targetOpacity;
                const overlay = document.getElementById("ubsc-nav-bg-overlay");
                if (overlay) {
                    overlay.style.opacity = targetOpacity.toString();
                }
            }

            if (isAtTop) {
                setNavHidden(false);
            } else if (scrollingUp && lastScrollUp.current) {
                setNavHidden(false);
            } else if (!scrollingUp) {
                setNavHidden(true);
            }

            lastScrollY.current = y;
            ticking.current = false;
        };

        const onScroll = () => {
            if (!ticking.current) {
                window.requestAnimationFrame(update);
                ticking.current = true;
            }
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    /* ── Lock body scroll when mobile menu open ── */
    useEffect(() => {
        document.body.style.overflow = mobileOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [mobileOpen]);

    /* ── Click-outside closes desktop dropdown ── */
    useEffect(() => {
        if (!dropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            )
                setDropdownOpen(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [dropdownOpen]);

    /* ── Auto-open auth modal from URL ?auth=login|register ── */
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const authParam = params.get("auth");
        if (authParam === "login" || authParam === "register") {
            setAuthInitialTab(authParam);
            setAuthOpen(true);
            window.history.replaceState(null, "", window.location.pathname);
        }
    }, []);

    /* ==============================================================
       ADAPTIVE COLOR ENGINE
    ============================================================== */
    const [_displayColor, setDisplayColor] = useState<RGB>({ ...NEUTRAL_DARK });
    const currentColorRef = useRef<RGB>({ ...NEUTRAL_DARK });
    const targetColorRef = useRef<RGB>({ ...NEUTRAL_DARK });
    const isAnimating = useRef(false);
    const rafHandle = useRef<number>(0);

    /* ── Inject premium CSS once ── */
    useEffect(() => {
        const STYLE_ID = "ubsc-kinetic-nav-styles";
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `
            /* ════════════════════════════════════════════════════
               KINETIC NAV — dual-layer hover slide
            ════════════════════════════════════════════════════ */
            .kinetic-nav-link:hover .knav-primary     { transform: translateY(112%); }
            .kinetic-nav-link:hover .knav-clone        { transform: translateY(0%) !important; }
            .kinetic-nav-link:hover .knav-num-primary  { transform: translateY(-112%); }
            .kinetic-nav-link:hover .knav-num-clone    { transform: translateY(0%) !important; }
            .knav-primary, .knav-clone                 { transition: transform 0.44s cubic-bezier(0.16,1,0.28,1); }
            .knav-num-primary, .knav-num-clone         { transition: transform 0.38s cubic-bezier(0.20,1,0.32,1); }

            /* ── Active: ethereal glow pulse — no harsh borders ── */
            .kinetic-nav-active {
                animation: ubsc-active-pulse 4s ease-in-out infinite;
            }
            @keyframes ubsc-active-pulse {
                0%,100% {
                    color: rgba(255,255,255,0.95);
                    text-shadow: none;
                    opacity: 1;
                }
                50% {
                    color: rgba(255,255,255,1);
                    text-shadow:
                        0 0 20px rgba(200,215,255,0.60),
                        0 0 40px rgba(180,200,255,0.35),
                        0 0 60px rgba(160,190,255,0.15);
                    opacity: 1;
                }
            }
            .kinetic-nav-link:hover {
                color: rgba(255,255,255,0.95) !important;
            }

            /* ════════════════════════════════════════════════════
               LOGO WRAP — premium glow with fixed blur
            ════════════════════════════════════════════════════ */
            @keyframes ubsc-logo-glow {
                0%   { filter: drop-shadow(0 0  2px rgba(100,170,255,0.20)); }
                25%  { filter: drop-shadow(0 0  8px rgba(180,200,255,0.50)); }
                50%  { filter: drop-shadow(0 0  6px rgba(255,255,255,0.40)); }
                75%  { filter: drop-shadow(0 0  8px rgba(180,210,255,0.50)); }
                100% { filter: drop-shadow(0 0  2px rgba(100,170,255,0.20)); }
            }
            .ubsc-logo-wrap {
                position: relative;
                display: inline-flex;
                overflow: visible;
                border-radius: 6px;
                animation: ubsc-logo-glow 4s ease-in-out infinite;
                cursor: pointer;
            }
            .ubsc-logo-wrap:hover {
                animation-play-state: paused;
                filter: drop-shadow(0 0 14px rgba(255,255,255,0.60)) !important;
                transform: scale(1.05);
                transition: filter 0.3s ease, transform 0.3s ease;
            }
            .ubsc-logo { display: block; image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; }

            /* ════════════════════════════════════════════════════
               CTA CARD WRAP — clean premium button
            ════════════════════════════════════════════════════ */
            .ubsc-cta-wrap {
                position: relative;
                border-radius: 12px;
                overflow: visible;
                transition: transform 0.3s ease, box-shadow 0.3s ease;
            }
            .ubsc-cta-wrap::before {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.25);
                background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%);
                pointer-events: none;
            }
            .ubsc-cta-wrap::after {
                content: '';
                position: absolute;
                inset: -2px;
                border-radius: 14px;
                box-shadow: 0 0 20px rgba(255,255,255,0.08);
                pointer-events: none;
            }
            .ubsc-cta-wrap:hover {
                transform: translateY(-2px) scale(1.02);
                box-shadow:
                    0 8px 32px rgba(255,255,255,0.15),
                    0 16px 48px rgba(0,0,0,0.20) !important;
            }
            .ubsc-cta-wrap:hover::before {
                border-color: rgba(255,255,255,0.40);
            }

            /* ════════════════════════════════════════════════════
               PREMIUM SEAMLESS NAVBAR
            ════════════════════════════════════════════════════ */
            .ubsc-navbar-premium {
                isolation: isolate;
                transform: translateZ(0);
            }
            .ubsc-navbar-premium::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                height: 80px;
                background: linear-gradient(to bottom, rgba(0,0,0,0.00) 0%, rgba(0,0,0,0.00) 100%);
                pointer-events: none;
                z-index: -1;
            }

            /* ════════════════════════════════════════════════════
               AUTH SECTION ISOLATION
            ════════════════════════════════════════════════════ */
            .ubsc-auth-section {
                isolation: isolate;
                position: relative;
                z-index: 101;
                transform: translateZ(0);
            }

            /* Dropdown portal */
            .ubsc-dropdown-portal {
                position: fixed;
                z-index: 99999 !important;
                isolation: isolate;
            }

            /* ════════════════════════════════════════════════════
               CTA BUTTON INNER
            ════════════════════════════════════════════════════ */
            .ubsc-cta-btn {
                position: relative;
                overflow: hidden;
                width: 100%;
                border-radius: 8px;
            }

            /* ════════════════════════════════════════════════════
               AVATAR — deep-navy gradient
            ════════════════════════════════════════════════════ */
            .ubsc-avatar-bg {
                background: linear-gradient(135deg,#0c1222 0%,#1b2a4a 50%,#08101e 100%);
            }

            /* ════════════════════════════════════════════════════
               NAVBAR PREMIUM GRAIN — subtle surface texture
            ════════════════════════════════════════════════════ */
            .ubsc-nav-grain::before {
                content: '';
                position: absolute;
                inset: 0;
                opacity: 0.028;
                pointer-events: none;
                z-index: 1;
                background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.90' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
                background-size: 256px 256px;
            }

            /* ════════════════════════════════════════════════════
               LIQUID GLASS NAVBAR SURFACE — iOS 26 "kaca cair"
               Real refraction: an SVG displacement map bends the
               content behind the bar like a glass lens, topped with
               a beveled edge catch-light and a soft specular drift.
               Layered structure:
                 .ubsc-lg-effect  → blurred + displaced backdrop
                 .ubsc-lg-tint    → adaptive tint for text legibility
                 .ubsc-lg-shine   → beveled rim / specular highlights
            ════════════════════════════════════════════════════ */
            .ubsc-liquid-glass {
                position: absolute;
                inset: 0;
                overflow: hidden;
                isolation: isolate;
                box-shadow:
                    0 8px 30px rgba(0, 0, 0, 0.22),
                    0 1px 0 rgba(255, 255, 255, 0.10);
            }
            /* Refraction layer — blurred backdrop warped by the lens */
            .ubsc-lg-effect {
                position: absolute;
                inset: 0;
                z-index: 0;
                backdrop-filter: blur(2px) saturate(180%) brightness(1.05);
                -webkit-backdrop-filter: blur(2px) saturate(180%) brightness(1.05);
                filter: url(#ubsc-glass-distortion);
                -webkit-filter: url(#ubsc-glass-distortion);
            }
            /* Adaptive tint — keeps white nav text readable over any scene */
            .ubsc-lg-tint {
                position: absolute;
                inset: 0;
                z-index: 1;
                background:
                    linear-gradient(
                        180deg,
                        rgba(255, 255, 255, 0.10) 0%,
                        rgba(255, 255, 255, 0.02) 30%,
                        rgba(255, 255, 255, 0.00) 60%
                    ),
                    linear-gradient(
                        to bottom,
                        rgba(8, 12, 28, 0.40) 0%,
                        rgba(8, 12, 28, 0.22) 55%,
                        rgba(8, 12, 28, 0.06) 86%,
                        rgba(8, 12, 28, 0.00) 100%
                    );
            }
            /* Beveled rim + specular highlights — the iOS glass edge */
            .ubsc-lg-shine {
                position: absolute;
                inset: 0;
                z-index: 2;
                pointer-events: none;
                box-shadow:
                    inset 0 1px 0 rgba(255, 255, 255, 0.60),
                    inset 1px 0 0 rgba(255, 255, 255, 0.28),
                    inset -1px 0 0 rgba(255, 255, 255, 0.20),
                    inset 0 10px 22px rgba(255, 255, 255, 0.06),
                    inset 0 -1px 0 rgba(255, 255, 255, 0.14),
                    inset 0 -16px 28px rgba(8, 12, 28, 0.20);
            }
            /* Soft specular glint drifting across the lens */
            .ubsc-lg-shine::after {
                content: '';
                position: absolute;
                top: 0;
                bottom: 0;
                left: -40%;
                width: 45%;
                pointer-events: none;
                mix-blend-mode: screen;
                background: linear-gradient(
                    105deg,
                    transparent 0%,
                    rgba(255,255,255,0.05) 40%,
                    rgba(255,255,255,0.22) 50%,
                    rgba(255,255,255,0.05) 60%,
                    transparent 100%
                );
                filter: blur(6px);
                transform: translateX(0) skewX(-12deg);
                animation: ubsc-glass-sweep 9s cubic-bezier(0.45,0,0.2,1) infinite;
                will-change: transform, opacity;
            }
            @keyframes ubsc-glass-sweep {
                0%   { transform: translateX(0)    skewX(-12deg); opacity: 0; }
                14%  { opacity: 0.85; }
                45%  { opacity: 0.35; }
                70%  { transform: translateX(360%) skewX(-12deg); opacity: 0; }
                100% { transform: translateX(360%) skewX(-12deg); opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
                .ubsc-lg-shine::after {
                    animation: none;
                }
            }
        `;
        document.head.appendChild(style);
    }, []);

    useEffect(
        () => () => {
            cancelAnimationFrame(rafHandle.current);
        },
        [],
    );

    /* ── Intersection Observer + RAF colour system ── */
    useEffect(() => {
        const startLerp = () => {
            if (isAnimating.current) return;
            isAnimating.current = true;

            const tick = () => {
                const cur = currentColorRef.current;
                const tgt = targetColorRef.current;
                const dr = Math.abs(tgt.r - cur.r);
                const dg = Math.abs(tgt.g - cur.g);
                const db = Math.abs(tgt.b - cur.b);

                if (dr + dg + db < 0.15) {
                    currentColorRef.current = { ...tgt };
                    setDisplayColor({ r: tgt.r, g: tgt.g, b: tgt.b });
                    isAnimating.current = false;
                    return;
                }

                const dist = Math.sqrt(dr * dr + dg * dg + db * db);
                const adaptiveT =
                    LERP_SPEED * (0.65 + 0.35 * Math.min(dist / 90, 1));
                const next = lerpRGB(cur, tgt, adaptiveT);
                currentColorRef.current = next;
                setDisplayColor({ r: next.r, g: next.g, b: next.b });
                rafHandle.current = requestAnimationFrame(tick);
            };

            rafHandle.current = requestAnimationFrame(tick);
        };

        const resolveSection = (section: HTMLElement) => {
            const img = section.querySelector<HTMLImageElement>("img");
            if (img) {
                const apply = () => {
                    const raw = sampleDominantColor(img);
                    targetColorRef.current = normalizeColor(raw);
                    startLerp();
                };
                if (img.complete && img.naturalWidth > 0) apply();
                else img.addEventListener("load", apply, { once: true });
            } else {
                targetColorRef.current = { ...NEUTRAL_DARK };
                startLerp();
            }
        };

        const observer = new IntersectionObserver(
            (entries) => {
                const best = entries
                    .filter((e) => e.isIntersecting)
                    .sort(
                        (a, b) => b.intersectionRatio - a.intersectionRatio,
                    )[0];
                if (best) resolveSection(best.target as HTMLElement);
            },
            { threshold: [0.35, 0.6], rootMargin: "-5% 0px -5% 0px" },
        );

        const sections =
            document.querySelectorAll<HTMLElement>("[data-section]");
        sections.forEach((s) => observer.observe(s));
        if (sections.length === 0) {
            document
                .querySelectorAll<HTMLElement>("main > *")
                .forEach((el) => observer.observe(el));
        }
        return () => observer.disconnect();
    }, []);

    /* ==============================================================
       DERIVED DISPLAY VALUES
    ============================================================== */
    const firstName = user?.name?.split(" ")[0] ?? "User";
    const initials = user
        ? user.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()
        : "";
    const userAvatar = user?.avatar_url ?? user?.avatar ?? null;

    useEffect(() => {
        setAvatarFailed(false);
    }, [userAvatar]);

    /* ==============================================================
       RENDER
    ============================================================== */
    return (
        <>
            {showInfoBanner && <InfoBanner />}

            {/* SVG lens used by the liquid-glass refraction (.ubsc-lg-effect) */}
            <svg
                aria-hidden="true"
                width="0"
                height="0"
                style={{ position: "absolute", width: 0, height: 0 }}
            >
                <defs>
                    <filter
                        id="ubsc-glass-distortion"
                        x="-20%"
                        y="-20%"
                        width="140%"
                        height="140%"
                        filterUnits="objectBoundingBox"
                    >
                        <feTurbulence
                            type="fractalNoise"
                            baseFrequency="0.010 0.014"
                            numOctaves={2}
                            seed={42}
                            result="noise"
                        />
                        <feGaussianBlur
                            in="noise"
                            stdDeviation="2.4"
                            result="blurred"
                        />
                        <feDisplacementMap
                            in="SourceGraphic"
                            in2="blurred"
                            scale={58}
                            xChannelSelector="R"
                            yChannelSelector="G"
                        />
                    </filter>
                </defs>
            </svg>

            {/* Wrapper: background + navbar move as ONE unit */}
            <div
                id="ubsc-nav-wrapper"
                className={cn(
                    "ubsc-nav-grain",
                    "fixed left-0 right-0 flex flex-col",
                    navHidden ? "-translate-y-full" : "translate-y-0",
                )}
                style={{
                    top: showInfoBanner ? 27 : 14,
                    height: "100px",
                    zIndex: 50,
                    transition:
                        "transform 0.45s cubic-bezier(0.65, 0, 0.35, 1)",
                }}
            >
                {/* Background overlay — stays inside wrapper, moves with navbar */}
                <div
                    id="ubsc-nav-bg-overlay"
                    className="ubsc-liquid-glass absolute inset-0 pointer-events-none"
                    style={{
                        opacity: showBg ? 1 : 0,
                        transition:
                            "opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                >
                    <div className="ubsc-lg-effect" />
                    <div className="ubsc-lg-tint" />
                    <div className="ubsc-lg-shine" />
                </div>

                {/* Navbar content */}
                <nav
                    className="relative flex items-center justify-between px-8 py-6 lg:px-12 z-[1]"
                    style={{ position: "relative", height: "100px", zIndex: 1 }}
                >
                    {/* ── Logo ── */}
                    <div className="flex items-center gap-2">
                        <a href="/" className="ubsc-logo-wrap">
                            <img
                                src="/UBSC.svg"
                                alt="UB Sport Center Logo"
                                className="ubsc-logo h-8 w-auto md:h-12"
                                style={{ position: "relative", zIndex: 2 }}
                            />
                        </a>
                    </div>

                    {/* ── Desktop navigation links ── */}
                    <ul
                        className="hidden items-center gap-6 min-[1100px]:flex xl:gap-12"
                        style={{ position: "relative", zIndex: 2 }}
                    >
                        {NAV_ITEMS.map((item) => (
                            <li key={item.number}>
                                <KineticNavLink
                                    item={item}
                                    isActive={item.label === activeSection}
                                />
                            </li>
                        ))}
                    </ul>

                    {/* ── Auth CTA ── */}
                    <div
                        className="ubsc-auth-section relative"
                        style={{ zIndex: 101 }}
                    >
                        {isLoggedIn ? (
                            <div
                                className="relative hidden min-[1100px]:block"
                                ref={dropdownRef}
                            >
                                <div className="ubsc-cta-wrap scale-90 xl:scale-100 origin-right">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setDropdownOpen((v) => !v)
                                        }
                                        className="ubsc-cta-btn group flex items-stretch overflow-hidden rounded-lg bg-white cursor-pointer"
                                    >
                                        {/* Avatar */}
                                        <div className="mt-1 mb-1 ml-1 w-14 flex-shrink-0 self-stretch overflow-hidden rounded-md">
                                            {userAvatar && !avatarFailed ? (
                                                <img
                                                    src={userAvatar}
                                                    alt={firstName}
                                                    className="h-full w-full object-cover"
                                                    referrerPolicy="no-referrer"
                                                    onError={() => setAvatarFailed(true)}
                                                />
                                            ) : (
                                                <div className="ubsc-avatar-bg h-full w-full flex items-center justify-center">
                                                    <span className="font-clash text-xl font-bold text-white/90 select-none">
                                                        {initials}
                                                    </span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Name / Email / Role */}
                                        <div className="flex flex-col justify-center px-3 py-2 text-left min-w-0">
                                            <div className="flex items-baseline gap-0.5">
                                                <span className="font-clash text-[10px] font-normal text-slate-400/80">
                                                    Good day,{" "}
                                                </span>
                                                <span className="font-clash text-sm font-semibold leading-tight text-slate-700 truncate max-w-[80px]">
                                                    {firstName}
                                                </span>
                                            </div>
                                            <p className="font-clash text-[10px] font-medium text-slate-500 truncate max-w-[96px] mt-0.5">
                                                {user?.email}
                                            </p>
                                            <p className="font-clash text-[10px] font-medium text-slate-400/70 truncate max-w-[80px] -mt-0.5">
                                                {user?.role ?? "Member"}
                                            </p>
                                        </div>

                                        {/* Chevron */}
                                        <div className="flex items-center pr-3">
                                            <ChevronDown
                                                size={20}
                                                className={cn(
                                                    "text-slate-400 transition-all duration-300 ease-out",
                                                    dropdownOpen &&
                                                        "rotate-180 text-slate-600",
                                                )}
                                            />
                                        </div>
                                    </button>
                                </div>

                                {/* ── Premium Dropdown ── */}
                                <AnimatePresence>
                                    {dropdownOpen && (
                                        <motion.div
                                            initial={{
                                                opacity: 0,
                                                y: -6,
                                                scale: 0.97,
                                            }}
                                            animate={{
                                                opacity: 1,
                                                y: 0,
                                                scale: 1,
                                            }}
                                            exit={{
                                                opacity: 0,
                                                y: -6,
                                                scale: 0.97,
                                            }}
                                            transition={{
                                                duration: 0.22,
                                                ease: [0.16, 1, 0.3, 1],
                                            }}
                                            className="absolute right-0 top-full mt-3 overflow-hidden"
                                            style={{
                                                width: "220px",
                                                background:
                                                    "linear-gradient(180deg, rgba(15, 17, 35, 0.98) 0%, rgba(10, 12, 25, 0.99) 100%)",
                                                backdropFilter:
                                                    "blur(32px) saturate(180%)",
                                                WebkitBackdropFilter:
                                                    "blur(32px) saturate(180%)",
                                                borderRadius: "12px",
                                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                                boxShadow: `
                                                0 0 0 1px rgba(255, 255, 255, 0.04) inset,
                                                0 8px 32px rgba(0, 0, 0, 0.6),
                                                0 16px 64px rgba(0, 0, 0, 0.4)
                                            `,
                                            }}
                                        >
                                            {/* Top gradient accent */}
                                            <div
                                                className="h-px w-full"
                                                style={{
                                                    background:
                                                        "linear-gradient(90deg, transparent 0%, rgba(139, 92, 246, 0.5) 50%, transparent 100%)",
                                                }}
                                            />

                                            {/* User Info Header */}
                                            <div className="px-4 pt-4 pb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative w-11 h-11 flex-shrink-0">
                                                        <div
                                                            className="absolute inset-0 rounded-lg"
                                                            style={{
                                                                background:
                                                                    "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
                                                            }}
                                                        />
                                                        {userAvatar && !avatarFailed ? (
                                                            <img
                                                                src={userAvatar}
                                                                alt={firstName}
                                                                className="relative z-10 w-full h-full rounded-lg object-cover"
                                                                referrerPolicy="no-referrer"
                                                                onError={() => setAvatarFailed(true)}
                                                            />
                                                        ) : (
                                                            <div className="relative z-10 w-full h-full rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
                                                                <span className="font-clash text-base font-bold text-white">
                                                                    {initials}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-clash text-sm font-bold text-white truncate">
                                                            {user?.name}
                                                        </p>
                                                        <p className="font-clash text-[11px] text-white/50 truncate mt-0.5">
                                                            {user?.email}
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Role badge */}
                                                <div className="mt-3">
                                                    <span
                                                        className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-clash font-semibold"
                                                        style={{
                                                            background:
                                                                "linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.15))",
                                                            color: "#a78bfa",
                                                            border: "1px solid rgba(139, 92, 246, 0.3)",
                                                        }}
                                                    >
                                                        {user?.role ?? "Member"}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Divider */}
                                            <div className="mx-4 h-px bg-white/5" />

                                            {/* Action Menu */}
                                            <div className="px-2 py-2 flex flex-col gap-0.5">
                                                <motion.button
                                                    type="button"
                                                    whileHover={{
                                                        x: 3,
                                                        backgroundColor:
                                                            "rgba(255, 255, 255, 0.05)",
                                                    }}
                                                    transition={{
                                                        duration: 0.15,
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDropdownOpen(false);
                                                        setActiveUserModal(
                                                            "profile",
                                                        );
                                                    }}
                                                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 w-full text-left cursor-pointer transition-all duration-150"
                                                >
                                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 border border-indigo-500/20 group-hover:border-indigo-500/40 transition-all">
                                                        <UserIcon
                                                            size={15}
                                                            className="text-indigo-400"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-clash text-sm font-medium text-white/90">
                                                            My Profile
                                                        </p>
                                                    </div>
                                                    <svg
                                                        className="w-4 h-4 text-white/30 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all duration-150"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
                                                </motion.button>

                                                <motion.button
                                                    type="button"
                                                    whileHover={{
                                                        x: 3,
                                                        backgroundColor:
                                                            "rgba(255, 255, 255, 0.05)",
                                                    }}
                                                    transition={{
                                                        duration: 0.15,
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDropdownOpen(false);
                                                        setActiveUserModal(
                                                            "history",
                                                        );
                                                    }}
                                                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 w-full text-left cursor-pointer transition-all duration-150"
                                                >
                                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-500/20 group-hover:border-emerald-500/40 transition-all">
                                                        <CreditCard
                                                            size={15}
                                                            className="text-emerald-400"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-clash text-sm font-medium text-white/90">
                                                            Payment History
                                                        </p>
                                                    </div>
                                                    <svg
                                                        className="w-4 h-4 text-white/30 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all duration-150"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
                                                </motion.button>

                                                <motion.button
                                                    type="button"
                                                    whileHover={{
                                                        x: 3,
                                                        backgroundColor:
                                                            "rgba(255, 255, 255, 0.05)",
                                                    }}
                                                    transition={{
                                                        duration: 0.15,
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDropdownOpen(false);
                                                        setActiveUserModal(
                                                            "membership",
                                                        );
                                                    }}
                                                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 w-full text-left cursor-pointer transition-all duration-150"
                                                >
                                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0 border border-amber-500/20 group-hover:border-amber-500/40 transition-all">
                                                        <Dumbbell
                                                            size={15}
                                                            className="text-amber-400"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-clash text-sm font-medium text-white/90">
                                                            Gym Membership
                                                        </p>
                                                    </div>
                                                    <svg
                                                        className="w-4 h-4 text-white/30 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all duration-150"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
                                                </motion.button>

                                                <motion.button
                                                    type="button"
                                                    whileHover={{
                                                        x: 3,
                                                        backgroundColor:
                                                            "rgba(255, 255, 255, 0.05)",
                                                    }}
                                                    transition={{
                                                        duration: 0.15,
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDropdownOpen(false);
                                                        window.open(
                                                            "https://wa.me/6285280809080",
                                                            "_blank",
                                                        );
                                                    }}
                                                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 w-full text-left cursor-pointer transition-all duration-150"
                                                >
                                                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-green-500/20 group-hover:border-green-500/40 transition-all">
                                                        <MessageCircle
                                                            size={15}
                                                            className="text-green-400"
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-clash text-sm font-medium text-white/90">
                                                            Contact Us
                                                        </p>
                                                    </div>
                                                    <svg
                                                        className="w-4 h-4 text-white/30 group-hover:text-white/50 group-hover:translate-x-0.5 transition-all duration-150"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d="M9 5l7 7-7 7"
                                                        />
                                                    </svg>
                                                </motion.button>
                                            </div>

                                            {/* Divider */}
                                            <div className="mx-4 h-px bg-white/5" />

                                            {/* Logout Button */}
                                            <div className="px-2 py-2 mb-1">
                                                <Link
                                                    href={route("logout")}
                                                    method="post"
                                                    as="button"
                                                    onClick={() =>
                                                        setDropdownOpen(false)
                                                    }
                                                    className="group flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 w-full cursor-pointer transition-all duration-150 hover:scale-[1.02]"
                                                    style={{
                                                        background:
                                                            "rgba(239, 68, 68, 0.08)",
                                                        border: "1px solid rgba(239, 68, 68, 0.2)",
                                                    }}
                                                >
                                                    <LogOut
                                                        size={14}
                                                        className="text-red-400"
                                                    />
                                                    <span className="font-clash text-sm font-medium text-red-400">
                                                        Sign Out
                                                    </span>
                                                </Link>
                                            </div>

                                            {/* Bottom gradient accent */}
                                            <div
                                                className="h-1 rounded-b-xl"
                                                style={{
                                                    background:
                                                        "linear-gradient(90deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
                                                }}
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ) : (
                            /*
                             * ── LOGGED OUT: "Lets Get Started" card ──
                             */
                            <div className="ubsc-cta-wrap hidden min-[1100px]:flex scale-90 xl:scale-100 origin-right">
                                <button
                                    type="button"
                                    onClick={() => setAuthOpen(true)}
                                    className="ubsc-cta-btn group flex items-stretch overflow-hidden rounded-lg bg-white cursor-pointer"
                                >
                                    <div className="mt-1 mb-1 ml-1 w-14 flex-shrink-0 self-stretch overflow-hidden rounded-md">
                                        <img
                                            src={square}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                    <div className="flex flex-col justify-center px-3 py-2 text-left">
                                        <p className="font-clash text-sm font-semibold leading-tight text-navy-900">
                                            Lets Get Started
                                        </p>
                                        <p className="font-clash text-[12px] font-medium text-navy-900/80">
                                            Register Now
                                        </p>
                                        <p className="font-clash text-[10px] -mt-0.5 text-navy-900/40">
                                            Guest
                                        </p>
                                    </div>
                                    <div className="flex items-center pr-3">
                                        <ArrowRight
                                            size={22}
                                            className="text-navy-900 transition-transform group-hover:translate-x-0.5"
                                        />
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Hamburger (mobile) ── */}
                    <button
                        type="button"
                        onClick={() => setMobileOpen((v) => !v)}
                        className="flex flex-col items-end justify-center gap-[6px] p-1 min-[1100px]:hidden"
                        aria-label={mobileOpen ? "Close menu" : "Open menu"}
                        style={{ position: "relative", zIndex: 2 }}
                    >
                        <span
                            className={cn(
                                "block h-[2px] w-7 bg-white/90 rounded-sm transition-all duration-300",
                                mobileOpen && "w-6 translate-y-[4px] rotate-45",
                            )}
                            style={{
                                boxShadow: "0 0 4px rgba(255,255,255,0.4)",
                            }}
                        />
                        <span
                            className={cn(
                                "block h-[2px] w-5 bg-white/90 rounded-sm transition-all duration-300",
                                mobileOpen &&
                                    "w-6 -translate-y-[4px] -rotate-45",
                            )}
                            style={{
                                boxShadow: "0 0 4px rgba(255,255,255,0.4)",
                            }}
                        />
                    </button>
                </nav>
            </div>

            {/* ── Mobile overlay backdrop ── */}
            <div
                onClick={() => setMobileOpen(false)}
                className={cn(
                    "fixed inset-0 z-30 min-[1100px]:hidden transition-opacity duration-300",
                    mobileOpen
                        ? "pointer-events-auto opacity-100"
                        : "pointer-events-none opacity-0",
                )}
                style={{
                    background: "rgba(0,0,0,0.65)",
                    backdropFilter: "blur(4px)",
                }}
            />

            {/* ── Mobile slide-down menu ── */}
            <div
                className={cn(
                    "fixed left-0 right-0 z-40 min-[1100px]:hidden transition-transform duration-500 ease-out",
                    mobileOpen ? "translate-y-0" : "-translate-y-full",
                )}
                style={{
                    top: showInfoBanner ? 32 : 14,
                    background: "rgba(8,9,20,0.97)",
                    backdropFilter: "blur(24px) saturate(130%)",
                    WebkitBackdropFilter: "blur(24px) saturate(130%)",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    boxShadow: "0 16px 64px rgba(0,0,0,0.55)",
                }}
            >
                <div className="h-[80px] md:h-[104px]" />
                <div className="h-px w-full bg-white/10" />

                <ul className="flex flex-col px-8 pt-0">
                    {NAV_ITEMS.map((item, index) => (
                        <li key={item.number}>
                            <a
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={cn(
                                    "font-clash flex items-baseline justify-between py-5 text-xl transition-colors",
                                    item.label === activeSection
                                        ? "text-white"
                                        : "text-white/45 hover:text-white/75",
                                )}
                            >
                                <span
                                    style={{
                                        textShadow: "0 1px 8px rgba(0,0,0,0.9)",
                                    }}
                                >
                                    {item.label}
                                </span>
                                <sup className="text-[10px] text-white/30">
                                    {item.number}
                                </sup>
                            </a>
                            {index < NAV_ITEMS.length - 1 && (
                                <div className="h-px w-full bg-white/8" />
                            )}
                        </li>
                    ))}
                </ul>

                <div className="mx-8 mt-0 h-px bg-white/10" />

                <div className="px-[clamp(1.25rem,4vw,2rem)] py-[clamp(0.75rem,3vw,1.5rem)]">
                    {isLoggedIn ? (
                        <div className="flex flex-col gap-2">
                            {/* Mobile: profile card */}
                            <button
                                type="button"
                                onClick={() => {
                                    setMobileOpen(false);
                                    setActiveUserModal("profile");
                                }}
                                className="group flex items-stretch overflow-hidden rounded-xl bg-white w-full"
                            >
                                <div className="m-1.5 h-[clamp(3rem,10vw,5rem)] w-[clamp(3rem,10vw,5rem)] flex-shrink-0 overflow-hidden rounded-lg">
                                    {userAvatar && !avatarFailed ? (
                                        <img
                                            src={userAvatar}
                                            alt={firstName}
                                            className="h-full w-full object-cover"
                                            referrerPolicy="no-referrer"
                                            onError={() => setAvatarFailed(true)}
                                        />
                                    ) : (
                                        <div className="ubsc-avatar-bg h-full w-full flex items-center justify-center">
                                            <span className="font-clash text-2xl font-bold text-white/90 select-none">
                                                {initials}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex flex-col justify-center px-[clamp(0.5rem,2vw,0.875rem)] py-2 text-left flex-1 min-w-0">
                                    <p className="font-clash text-[clamp(0.75rem,3.5vw,1rem)] font-semibold leading-tight text-navy-900">
                                        {firstName}
                                    </p>
                                    <p className="font-clash text-[clamp(0.625rem,2.8vw,0.875rem)] font-medium mt-0.5 text-navy-900/80">
                                        {user?.role ?? "Member"}
                                    </p>
                                    <p className="font-clash text-[clamp(0.55rem,2.4vw,0.75rem)] -mt-0.5 text-navy-900/40 truncate">
                                        {user?.email}
                                    </p>
                                </div>
                                <div className="flex items-center pr-[clamp(0.5rem,2vw,0.875rem)]">
                                    <ArrowRight className="h-[clamp(1rem,4vw,1.25rem)] w-[clamp(1rem,4vw,1.25rem)] text-navy-900 transition-transform group-hover:translate-x-0.5" />
                                </div>
                            </button>
                            <Link
                                href={route("logout")}
                                method="post"
                                as="button"
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/6 px-4 py-3 text-sm font-clash font-semibold text-red-400 transition-colors hover:bg-red-500/15"
                            >
                                <LogOut size={15} />
                                Logout
                            </Link>
                        </div>
                    ) : (
                        /* Mobile: guest card */
                        <button
                            type="button"
                            onClick={() => {
                                setMobileOpen(false);
                                setAuthOpen(true);
                            }}
                            className="group flex items-stretch overflow-hidden rounded-xl bg-white w-full"
                        >
                            <div className="m-1.5 w-[clamp(3rem,10vw,5rem)] aspect-square flex-shrink-0 overflow-hidden rounded-lg">
                                <img
                                    src={square}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            </div>
                            <div className="flex flex-col justify-center px-[clamp(0.5rem,2vw,0.875rem)] py-2 text-left">
                                <p className="font-clash text-[clamp(0.75rem,3.5vw,1rem)] font-semibold leading-tight text-navy-900">
                                    Lets Get Started
                                </p>
                                <p className="font-clash text-[clamp(0.625rem,2.8vw,0.875rem)] mt-0.5 text-navy-900/80">
                                    Register Now
                                </p>
                                <p className="font-clash text-[clamp(0.55rem,2.4vw,0.75rem)] -mt-0.5 text-navy-900/40">
                                    Guest
                                </p>
                            </div>
                            <div className="ml-auto flex items-center pr-[clamp(0.5rem,2vw,0.875rem)]">
                                <ArrowRight className="h-[clamp(1rem,4vw,1.25rem)] w-[clamp(1rem,4vw,1.25rem)] text-navy-900 transition-transform group-hover:translate-x-0.5" />
                            </div>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Auth Modal (guest only) ── */}
            {!isLoggedIn && (
                <AuthModal
                    open={authOpen}
                    initialTab={authInitialTab}
                    onClose={() => setAuthOpen(false)}
                />
            )}

            {/* ── User Dashboard Modals (authenticated only) ── */}
            {activeUserModal === "profile" && (
                <ProfileModal onClose={() => setActiveUserModal(null)} />
            )}
            {activeUserModal === "history" && (
                <PaymentHistoryModal onClose={() => setActiveUserModal(null)} />
            )}
            {activeUserModal === "membership" && (
                <GymMembershipModal onClose={() => setActiveUserModal(null)} />
            )}
        </>
    );
}
