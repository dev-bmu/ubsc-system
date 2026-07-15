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
import { Guilloche, Microtext, FoilText } from "@/Components/UserDashboard/PassKit";
import { usePage } from "@inertiajs/react";
import { Link } from "@inertiajs/react";
import type { PageProps } from "@/types";
import { cn } from "@/lib/utils";

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
    surface?: "media" | "light";
}

type MemberStatus = 'none' | 'gym_only' | 'booked_only' | 'gym_and_booked';

const MEMBER_STATUS_CONFIG: Record<MemberStatus, { label: string; dotColor: string }> = {
    none:           { label: 'Visitor',              dotColor: 'bg-slate-400' },
    gym_only:       { label: 'Gym Member',           dotColor: 'bg-emerald-500' },
    booked_only:    { label: 'Booked',               dotColor: 'bg-sky-500' },
    gym_and_booked: { label: 'Gym Member · Booked',  dotColor: 'bg-amber-500' },
};

const getMemberStatusConfig = (user: { role?: string | null; member_status?: MemberStatus } | null) => {
    if (user?.role) return { label: user.role, dotColor: 'bg-accent-red' };
    return MEMBER_STATUS_CONFIG[user?.member_status ?? 'none'];
};

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
    ink?: boolean;
}

function KineticNavLink({ item, isActive, ink = false }: KineticNavLinkProps) {
    const activeCol = ink ? "rgba(18,18,18,0.96)" : "rgba(255,255,255,0.95)";
    const idleCol = ink ? "rgba(18,18,18,0.58)" : "rgba(255,255,255,0.65)";
    const hoverCol = ink ? "rgba(18,18,18,0.9)" : "rgba(255,255,255,0.85)";
    const supCol = ink ? "rgba(18,18,18,0.34)" : "rgba(255,255,255,0.35)";

    return (
        <a
            href={item.href}
            className={`kinetic-nav-link ${ink ? "kinetic-nav-ink" : ""} ${isActive ? "kinetic-nav-active" : ""} font-clash text-[clamp(0.75rem,1vw,16px)] tracking-wide`}
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
                        color: isActive ? activeCol : hoverCol,
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
    surface = "media",
}: NavbarProps) {
    /* ── Auth state ── */
    const { auth } = usePage<PageProps>().props;
    const user = auth?.user ?? null;
    const isLoggedIn = !!user;

    /* ── UI state ── */
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileAcctOpen, setMobileAcctOpen] = useState(false);
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
                setShowBg(targetOpacity === 1);
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

        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    /* ── Lock body scroll when mobile menu open ── */
    useEffect(() => {
        document.body.style.overflow = mobileOpen ? "hidden" : "";
        if (!mobileOpen) setMobileAcctOpen(false);
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
            .kinetic-nav-ink.kinetic-nav-active {
                animation: none;
            }
            .kinetic-nav-ink:hover {
                color: rgba(18,18,18,0.96) !important;
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
            .ubsc-logo-wrap-ink {
                animation: none;
                filter: none;
            }
            .ubsc-logo-wrap-ink:hover {
                filter: drop-shadow(0 4px 10px rgba(0,0,0,0.14)) !important;
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

    const useInkNavigation = surface === "light" && !showBg && !mobileOpen;

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
                    top: 27,
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
                        <a
                            href="/"
                            className={cn(
                                "ubsc-logo-wrap",
                                useInkNavigation && "ubsc-logo-wrap-ink",
                            )}
                        >
                            <img
                                src="/UBSC.svg"
                                alt="UB Sport Center Logo"
                                className="ubsc-logo h-8 w-auto md:h-12"
                                style={{
                                    position: "relative",
                                    zIndex: 2,
                                    filter: useInkNavigation
                                        ? "brightness(0) saturate(100%)"
                                        : "none",
                                    transition: "filter 240ms ease",
                                }}
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
                                    ink={useInkNavigation}
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
                                            <p className="font-clash text-[10px] font-medium text-slate-400/70 truncate max-w-[100px] -mt-0.5 flex items-center gap-1">
                                                <span className={cn('inline-block h-1.5 w-1.5 rounded-full flex-shrink-0', getMemberStatusConfig(user).dotColor)} />
                                                {getMemberStatusConfig(user).label}
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

                                {/* ── Premium Dropdown (Cinematic 3D Unfold) ── */}
                                {dropdownOpen && (
                                    <div
                                        className="kl-dropdown kl-glass-border absolute right-0 top-full mt-3 w-[308px] overflow-hidden rounded-[22px]"
                                        style={{
                                            background: "rgba(250, 249, 247, 0.92)",
                                            backdropFilter: "blur(24px) saturate(180%)",
                                            WebkitBackdropFilter: "blur(24px) saturate(180%)",
                                            boxShadow:
                                                "0 32px 80px -20px rgba(7,21,48,0.5), 0 16px 32px -12px rgba(7,21,48,0.22), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.5)",
                                        }}
                                    >
                                        {/* ── Holographic User Header ── */}
                                        <div className="pass-foil-host relative isolate overflow-hidden bg-gradient-to-br from-navy-800 via-navy-900 to-navy-950 px-5 pb-5 pt-4">
                                            <Guilloche />
                                            <div className="kl-dd-header-shimmer" aria-hidden="true" />
                                            <div
                                                className="kl-sheen-bar"
                                                aria-hidden="true"
                                            />
                                            {/* Top edge light */}
                                            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

                                            <Microtext
                                                className="relative -mx-5 mb-3 text-white/30"
                                                text="UB Sport Center · Member Pass"
                                            />
                                            <div className="relative flex items-center gap-3.5">
                                                <div className="kl-ring-host relative h-14 w-14 flex-shrink-0">
                                                    <span
                                                        className="kl-ring"
                                                        aria-hidden="true"
                                                    />
                                                    <div className="absolute inset-[3px] overflow-hidden rounded-full">
                                                        {userAvatar &&
                                                        !avatarFailed ? (
                                                            <img
                                                                src={userAvatar}
                                                                alt={firstName}
                                                                className="h-full w-full object-cover"
                                                                referrerPolicy="no-referrer"
                                                                onError={() =>
                                                                    setAvatarFailed(
                                                                        true,
                                                                    )
                                                                }
                                                            />
                                                        ) : (
                                                            <div className="ubsc-avatar-bg flex h-full w-full items-center justify-center">
                                                                <span className="font-clash text-lg font-bold text-white">
                                                                    {initials}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <FoilText className="block truncate font-clash text-[15px] font-bold">
                                                        {user?.name}
                                                    </FoilText>
                                                    <p className="mt-0.5 truncate font-bdo text-[11px] text-white/50">
                                                        {user?.email}
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Status badge with breathing glow */}
                                            <div className="relative mt-3.5">
                                                <span className="kl-status-badge inline-flex items-center gap-1.5 rounded-full bg-white/[0.12] px-3 py-1.5 font-bdo text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                                                    <span
                                                        className={cn('h-2 w-2 rounded-full', getMemberStatusConfig(user).dotColor)}
                                                        style={{
                                                            animation:
                                                                "kl-dot-pulse 3s ease-in-out infinite",
                                                        }}
                                                    />
                                                    {getMemberStatusConfig(user).label}
                                                </span>
                                            </div>
                                        </div>

                                        {/* ── Action Menu with Staggered Entrance ── */}
                                        <div className="flex flex-col gap-0.5 px-2.5 py-2.5">
                                            {[
                                                {
                                                    key: "profile" as const,
                                                    label: "My Profile",
                                                    hint: "Data diri & keamanan",
                                                    icon: UserIcon,
                                                    onClick: () =>
                                                        setActiveUserModal(
                                                            "profile",
                                                        ),
                                                },
                                                {
                                                    key: "history" as const,
                                                    label: "Payment History",
                                                    hint: "Riwayat transaksi",
                                                    icon: CreditCard,
                                                    onClick: () =>
                                                        setActiveUserModal(
                                                            "history",
                                                        ),
                                                },
                                                {
                                                    key: "membership" as const,
                                                    label: "Gym Membership",
                                                    hint: "Status keanggotaan",
                                                    icon: Dumbbell,
                                                    onClick: () =>
                                                        setActiveUserModal(
                                                            "membership",
                                                        ),
                                                },
                                                {
                                                    key: "contact" as const,
                                                    label: "Contact Us",
                                                    hint: "Hubungi via WhatsApp",
                                                    icon: MessageCircle,
                                                    onClick: () =>
                                                        window.open(
                                                            "https://wa.me/6285280809080",
                                                            "_blank",
                                                        ),
                                                },
                                            ].map((row, i) => (
                                                <button
                                                    key={row.key}
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDropdownOpen(false);
                                                        row.onClick();
                                                    }}
                                                    className="kl-dd-row kl-dd-item relative flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-3 py-3 text-left"
                                                    style={{ ["--i" as string]: i }}
                                                >
                                                    <div className="kl-dd-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-navy-900/[0.05] ring-1 ring-navy-900/[0.06] transition-all duration-250">
                                                        <row.icon
                                                            size={17}
                                                            className="text-navy-900/65"
                                                        />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <span className="block font-clash text-[13.5px] font-semibold text-navy-900">
                                                            {row.label}
                                                        </span>
                                                        <span className="block mt-0.5 font-bdo text-[10.5px] text-navy-900/40">
                                                            {row.hint}
                                                        </span>
                                                    </div>
                                                    <svg
                                                        className="kl-dd-arrow h-4 w-4 text-navy-900/25"
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
                                                </button>
                                            ))}
                                        </div>

                                        {/* Divider */}
                                        <div className="mx-5 h-px bg-gradient-to-r from-navy-900/[0.08] via-navy-900/[0.04] to-transparent" />

                                        {/* Logout Button */}
                                        <div className="px-2.5 py-2.5">
                                            <Link
                                                href={route("logout")}
                                                method="post"
                                                as="button"
                                                onClick={() =>
                                                    setDropdownOpen(false)
                                                }
                                                className="kl-dd-logout kl-dd-item flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-accent-red/15 bg-accent-red/[0.04] px-3 py-3 transition-all active:scale-[0.99]"
                                                style={{ ["--i" as string]: 5 }}
                                            >
                                                <LogOut
                                                    size={15}
                                                    className="text-accent-red"
                                                />
                                                <span className="font-clash text-[13px] font-semibold text-accent-red">
                                                    Sign Out
                                                </span>
                                            </Link>
                                        </div>
                                    </div>
                                )}
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
                                "block h-[2px] w-7 rounded-sm transition-all duration-300",
                                useInkNavigation ? "bg-black/80" : "bg-white/90",
                                mobileOpen && "w-6 translate-y-[4px] rotate-45",
                            )}
                            style={{
                                boxShadow: useInkNavigation
                                    ? "none"
                                    : "0 0 4px rgba(255,255,255,0.4)",
                            }}
                        />
                        <span
                            className={cn(
                                "block h-[2px] w-5 rounded-sm transition-all duration-300",
                                useInkNavigation ? "bg-black/80" : "bg-white/90",
                                mobileOpen &&
                                    "w-6 -translate-y-[4px] -rotate-45",
                            )}
                            style={{
                                boxShadow: useInkNavigation
                                    ? "none"
                                    : "0 0 4px rgba(255,255,255,0.4)",
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
                    "account-modal-scroll fixed top-8 left-0 right-0 z-40 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain min-[1100px]:hidden transition-transform duration-500 ease-out",
                    mobileOpen ? "translate-y-0" : "-translate-y-full",
                )}
                style={{
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
                            {/* Mobile: profile trigger (tap to reveal) */}
                            <button
                                type="button"
                                onClick={() => setMobileAcctOpen((v) => !v)}
                                className="flex items-center gap-3 rounded-2xl bg-white p-2.5 text-left transition-shadow active:shadow-inner"
                            >
                                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl">
                                    {userAvatar && !avatarFailed ? (
                                        <img
                                            src={userAvatar}
                                            alt={firstName}
                                            className="h-full w-full object-cover"
                                            referrerPolicy="no-referrer"
                                            onError={() => setAvatarFailed(true)}
                                        />
                                    ) : (
                                        <div className="ubsc-avatar-bg flex h-full w-full items-center justify-center">
                                            <span className="font-clash text-2xl font-bold text-white/90 select-none">
                                                {initials}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-clash text-[15px] font-semibold leading-tight text-navy-900">
                                        {user?.name}
                                    </p>
                                    <p className="mt-0.5 truncate font-bdo text-[12px] text-navy-900/45">
                                        {user?.email}
                                    </p>
                                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-navy-900/[0.06] px-2 py-0.5 font-bdo text-[10px] font-semibold text-navy-900/70">
                                        <span className={cn('h-1.5 w-1.5 rounded-full', getMemberStatusConfig(user).dotColor)} />
                                        {getMemberStatusConfig(user).label}
                                    </span>
                                </div>
                                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-navy-900/[0.06]">
                                    <ChevronDown
                                        size={18}
                                        className={cn(
                                            "text-navy-900/60 transition-transform duration-300",
                                            mobileAcctOpen && "rotate-180",
                                        )}
                                    />
                                </div>
                            </button>

                            {/* Mobile: collapsible account menu (grid-rows CSS) */}
                            <div
                                className="kl-collapse"
                                data-open={mobileAcctOpen}
                            >
                                <div className="kl-collapse-inner">
                                    <div className="flex flex-col gap-2 pt-1">
                                            {/* Account actions */}
                                            <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                                                {[
                                                    {
                                                        key: "profile" as const,
                                                        label: "My Profile",
                                                        hint: "Data diri & keamanan",
                                                        icon: UserIcon,
                                                        onClick: () =>
                                                            setActiveUserModal(
                                                                "profile",
                                                            ),
                                                    },
                                                    {
                                                        key: "history" as const,
                                                        label: "Payment History",
                                                        hint: "Riwayat transaksi",
                                                        icon: CreditCard,
                                                        onClick: () =>
                                                            setActiveUserModal(
                                                                "history",
                                                            ),
                                                    },
                                                    {
                                                        key: "membership" as const,
                                                        label: "Gym Membership",
                                                        hint: "Status keanggotaan",
                                                        icon: Dumbbell,
                                                        onClick: () =>
                                                            setActiveUserModal(
                                                                "membership",
                                                            ),
                                                    },
                                                    {
                                                        key: "contact" as const,
                                                        label: "Contact Us",
                                                        hint: "Hubungi via WhatsApp",
                                                        icon: MessageCircle,
                                                        onClick: () =>
                                                            window.open(
                                                                "https://wa.me/6285280809080",
                                                                "_blank",
                                                            ),
                                                    },
                                                ].map((row, i) => (
                                                    <button
                                                        key={row.key}
                                                        type="button"
                                                        onClick={() => {
                                                            setMobileOpen(false);
                                                            row.onClick();
                                                        }}
                                                        className={cn(
                                                            "flex w-full items-center gap-3.5 px-3 py-3.5 text-left transition-colors active:bg-white/[0.07]",
                                                            i > 0 &&
                                                                "border-t border-white/[0.06]",
                                                        )}
                                                    >
                                                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/[0.07]">
                                                            <row.icon
                                                                size={18}
                                                                className="text-white/85"
                                                            />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-clash text-[15px] font-semibold leading-tight text-white">
                                                                {row.label}
                                                            </p>
                                                            <p className="mt-0.5 font-bdo text-[11px] text-white/40">
                                                                {row.hint}
                                                            </p>
                                                        </div>
                                                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-white/25 transition-transform active:translate-x-0.5" />
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Logout */}
                                            <Link
                                                href={route("logout")}
                                                method="post"
                                                as="button"
                                                onClick={() =>
                                                    setMobileOpen(false)
                                                }
                                                className="flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3.5 font-clash text-[14px] font-semibold text-red-400 transition-colors hover:bg-red-500/[0.12] active:bg-red-500/15"
                                            >
                                                <LogOut size={16} />
                                                Logout
                                            </Link>
                                        </div>
                                    </div>
                                </div>
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
