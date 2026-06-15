// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Sidebar.tsx  —  REPLACE THIS FILE ENTIRELY
//  Lokasi: resources/js/Components/Admin/Sidebar.tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Link, usePage } from "@inertiajs/react";
import {
    Award,
    BadgeCheck,
    BarChart3,
    CalendarCheck2,
    CalendarRange,
    ChevronDown,
    Dumbbell,
    Film,
    HelpCircle,
    ImagePlus,
    LayoutDashboard,
    LogOut,
    MessageSquare,
    Newspaper,
    Package,
    PanelLeftClose,
    PanelLeftOpen,
    ShieldCheck,
    UserCog,
    Users2,
    X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STYLES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SIDEBAR_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo   { font-family: 'BDO Grotesk', sans-serif; }

    /* ── Sidebar entrance: slide in from left ── */
    @keyframes sbSlideIn {
        from { opacity: 0; transform: translateX(-100%); }
        to   { opacity: 1; transform: translateX(0); }
    }
    /* ── Nav items stagger up ── */
    @keyframes sbFadeUp {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    /* ── Fade in (text/labels) ── */
    @keyframes sbFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
    }
    /* ── Submenu children slide right ── */
    @keyframes sbSlideRight {
        from { opacity: 0; transform: translateX(-8px); }
        to   { opacity: 1; transform: translateX(0); }
    }
    /* ── Tooltip pop ── */
    @keyframes sbTooltipIn {
        from { opacity: 0; transform: translateX(-6px) scale(0.94); }
        to   { opacity: 1; transform: translateX(0)   scale(1); }
    }
    /* ── Active caustic shimmer ── */
    @keyframes sbCaustics {
        0%   { background-position: 0%   50%; opacity: 0.10; }
        50%  { background-position: 100% 50%; opacity: 0.22; }
        100% { background-position: 0%   50%; opacity: 0.10; }
    }
    /* ── One-shot shimmer sweep on sidebar load ── */
    @keyframes sbShimmer {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(280%);  }
    }
    /* ── Logo terracotta breathe ── */
    @keyframes sbLogoBreathe {
        0%,100% { box-shadow: 0 0 0  0   rgba(227,83,54,0.0); }
        50%      { box-shadow: 0 0 22px 5px rgba(227,83,54,0.18); }
    }
    /* ── Terracotta glow pulse on active dot (collapsed) ── */
    @keyframes sbTerracottaPulse {
        0%,100% { box-shadow: 0 0 0 0   rgba(20,184,166,0.62); }
        50%      { box-shadow: 0 0 9px 2px rgba(20,184,166,0.34); }
    }
    /* ── Active item inner terracotta accent bar ── */
    @keyframes sbAccentBar {
        from { transform: scaleY(0); opacity: 0; }
        to   { transform: scaleY(1); opacity: 1; }
    }

    /* Applied classes */
    .sb-slide-in     { animation: sbSlideIn   0.45s cubic-bezier(0.16,1,0.3,1) both; }
    .sb-fade-up      { animation: sbFadeUp    0.5s  cubic-bezier(0.16,1,0.3,1) both; opacity: 0; }
    .sb-fade-in      { animation: sbFadeIn    0.3s  ease both; }
    .sb-slide-right  { animation: sbSlideRight 0.28s cubic-bezier(0.16,1,0.3,1) both; opacity: 0; }

    /* Caustic terracotta overlay on active item */
    .sb-caustics {
        background: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.22) 0%, transparent 50%),
                    radial-gradient(circle at 80% 70%, rgba(255,255,255,0.14) 0%, transparent 55%);
        background-size: 160% 160%;
        animation: sbCaustics 7s ease-in-out infinite;
        mix-blend-mode: overlay;
    }

    /* One-shot shimmer on sidebar panel */
    .sb-panel-shimmer { overflow: hidden; }
    .sb-panel-shimmer::after {
        content: '';
        position: absolute; inset: 0;
        background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.32) 50%, transparent 100%);
        width: 55%;
        animation: sbShimmer 1.4s ease-out 0.3s forwards;
        pointer-events: none;
    }

    /* Logo breathe */
    .sb-logo-breathe { animation: sbLogoBreathe 4s ease-in-out infinite; }

    /* Active dot in collapsed mode */
    .sb-active-dot { animation: sbTerracottaPulse 2.5s ease-in-out infinite; }

    /* Top glint line on active item */
    .sb-active-glint::after {
        content: '';
        position: absolute;
        top: 0; left: 10px; right: 10px; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.92), transparent);
    }

    /* ── Submenu animation ── */
    @keyframes sbSubmenuOpen {
        from { opacity: 0; max-height: 0;    transform: translateY(-4px); }
        to   { opacity: 1; max-height: 240px; transform: translateY(0);   }
    }
    .sb-submenu-open {
        animation: sbSubmenuOpen 0.3s cubic-bezier(0.16,1,0.3,1) forwards;
        overflow: hidden;
    }
    .sb-submenu-close {
        max-height: 0; overflow: hidden; opacity: 0;
        transition: max-height 0.22s ease, opacity 0.18s ease;
    }

    /* ── Tooltip ── */
    .sb-tooltip { animation: sbTooltipIn 0.2s cubic-bezier(0.16,1,0.3,1) both; pointer-events: none; }

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       SCROLL BUG FIX
       overscroll-behavior: contain prevents the
       wheel/touch scroll from leaking to the page
       when the nav reaches its top or bottom edge.
       touch-action: pan-y ensures trackpad & touch
       scroll is handled by this element only.
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    .sb-scroll {
        overflow-y: auto;
        overflow-x: hidden;
        overscroll-behavior: contain;   /* ← KEY FIX */
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
    }
    .sb-scroll::-webkit-scrollbar { width: 3px; }
    .sb-scroll::-webkit-scrollbar-track { background: transparent; }
    .sb-scroll::-webkit-scrollbar-thumb { background: #FFD5CD; border-radius: 4px; }
    .sb-scroll::-webkit-scrollbar-thumb:hover { background: #EA684F; }

    /* ── Stagger delays (nav items) ── */
    .sb-d1  { animation-delay:  40ms; } .sb-d2  { animation-delay:  75ms; }
    .sb-d3  { animation-delay: 110ms; } .sb-d4  { animation-delay: 145ms; }
    .sb-d5  { animation-delay: 180ms; } .sb-d6  { animation-delay: 215ms; }
    .sb-d7  { animation-delay: 250ms; } .sb-d8  { animation-delay: 285ms; }
    .sb-d9  { animation-delay: 320ms; } .sb-d10 { animation-delay: 355ms; }
    .sb-d11 { animation-delay: 390ms; } .sb-d12 { animation-delay: 425ms; }
    .sb-d13 { animation-delay: 460ms; } .sb-d14 { animation-delay: 495ms; }
    .sb-d15 { animation-delay: 530ms; } .sb-d16 { animation-delay: 565ms; }
    .sb-d17 { animation-delay: 600ms; } .sb-d18 { animation-delay: 635ms; }

    /* ── Badge "Preview" pill ── */
    .sb-badge-preview {
        font-family: 'BDO Grotesk', sans-serif;
        font-size: 8.5px; font-weight: 800;
        letter-spacing: 0.08em; text-transform: uppercase;
        padding: 2px 6px; border-radius: 6px;
        background: #FFF1EE; color: #B93D2A;
        border: 1px solid rgba(248,181,168,0.6);
    }
    .sb-badge-preview-active {
        background: rgba(255,247,245,0.95);
        color: #B93D2A;
        border: 1px solid rgba(248,181,168,0.8);
    }
`;

const SIDEBAR_SCROLL_KEY = "ubsc_admin_sidebar_scroll_top";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ROUTE HELPERS — TIDAK DIUBAH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isCurrent(name: string): boolean {
    if (typeof window === "undefined") return false;
    try {
        return route().current(name) ?? false;
    } catch {
        return false;
    }
}
function safeRoute(name: string): string | undefined {
    try {
        return route(name);
    } catch {
        return undefined;
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface SidebarProps {
    mobileOpen: boolean;
    onClose: () => void;
}

interface AccessGuard {
    permissions?: string[];
    requireAllPermissions?: boolean;
    roles?: string[];
}

interface NavChild extends AccessGuard {
    icon: React.ElementType;
    label: string;
    href?: string;
    active: boolean;
    badge?: string;
    disabled?: boolean;
    disabledReason?: string;
}
interface NavItem extends NavChild {
    method?: string;
    as?: string;
    children?: NavChild[];
}
interface NavGroup {
    label: string;
    items: NavItem[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TOOLTIP (collapsed mode)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Tooltip({ label, visible }: { label: string; visible: boolean }) {
    if (!visible) return null;
    return (
        <div className="sb-tooltip absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[9999] whitespace-nowrap">
            <div className="relative flex items-center">
                {/* Arrow */}
                <div
                    className="absolute -left-1 top-1/2 -translate-y-1/2 w-0 h-0
                    border-t-[5px] border-b-[5px] border-r-[6px]
                    border-t-transparent border-b-transparent border-r-white"
                />
                {/* Bubble */}
                <div
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2
                    shadow-[0_8px_24px_rgba(0,0,0,0.1),0_2px_6px_rgba(0,0,0,0.06)]"
                >
                    <p className="font-clash text-[13px] font-semibold text-slate-800">
                        {label}
                    </p>
                </div>
            </div>
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SINGLE NAV LINK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function NavLink({
    item,
    collapsed,
    depth = 0,
    animClass = "",
}: {
    item: NavItem | NavChild;
    collapsed: boolean;
    depth?: number;
    animClass?: string;
}) {
    const [hovered, setHovered] = useState(false);
    const [subOpen, setSubOpen] = useState(
        () => "children" in item && !!item.children?.some((c) => c.active),
    );

    const isLogout = item.label.toLowerCase().includes("log out");
    const hasChildren = "children" in item && !!item.children?.length;
    const Icon = item.icon;
    const disabled = item.disabled ?? false;

    // ── Wrapper classes ──────────────────────────────────────

    const wrapperCls = cn(
        "group relative flex items-center gap-3 rounded-xl",
        "transition-all duration-200 outline-none w-full text-left",
        "overflow-hidden select-none",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        collapsed
            ? "px-0 py-0 justify-center"
            : depth > 0
              ? "px-3 py-2"
              : "px-3 py-2.5",
        // ── TERRACOTTA active system — matches #12131c + terracotta shadow from pages ──
        disabled
            ? "border border-slate-200/80 bg-slate-50/75 text-slate-400 opacity-55 grayscale"
            : item.active
            ? [
                  "border border-[#F8B5A8]/75",
                  "bg-[radial-gradient(circle_at_13%_12%,rgba(255,255,255,.96),transparent_30%),radial-gradient(circle_at_86%_80%,rgba(153,246,228,.52),transparent_34%),linear-gradient(135deg,#FFFFFF_0%,#FFF7F5_54%,#ECFDF5_100%)]",
                  "text-slate-950",
                  "shadow-[0_16px_30px_-24px_rgba(20,184,166,.75),0_12px_30px_-28px_rgba(227,83,54,.8),inset_0_1px_0_rgba(255,255,255,.96)]",
                  "sb-active-glint",
              ].join(" ")
            : isLogout
              ? "border border-transparent hover:bg-rose-50 hover:border-rose-100"
              : depth > 0
                ? "hover:bg-[#FFF1EE]/60 hover:border hover:border-[#FFD5CD]/50"
                : "border border-transparent hover:bg-[#FFF1EE]/40 hover:border-[#FFD5CD]/40",
        !collapsed && animClass,
    );

    // ── Icon classes ─────────────────────────────────────────

    const iconCls = cn(
        "shrink-0 transition-all duration-200",
        collapsed ? "mx-auto" : "",
        disabled
            ? "text-slate-300"
            : item.active
            ? "text-[#0F766E] drop-shadow-[0_0_10px_rgba(45,212,191,0.36)] scale-105"
            : isLogout
              ? "text-slate-400 group-hover:text-rose-500 group-hover:scale-105"
              : depth > 0
                ? "text-slate-400 group-hover:text-[#E35336] group-hover:scale-105"
                : "text-slate-400 group-hover:text-[#E35336] group-hover:scale-105",
    );

    // ── Label classes ────────────────────────────────────────

    const labelCls = cn(
        "flex-1 font-clash leading-tight whitespace-nowrap transition-colors",
        depth > 0 ? "text-[12.5px] font-medium" : "text-[13.5px] font-semibold",
        disabled
            ? "text-slate-400"
            : item.active
            ? "text-slate-950"
            : isLogout
              ? "text-slate-600 group-hover:text-rose-600 font-medium"
              : depth > 0
                ? "text-slate-600 group-hover:text-slate-900"
                : "text-slate-700 group-hover:text-slate-900",
    );

    // ── Badge ────────────────────────────────────────────────

    const badgeEl = item.badge ? (
        <span
            className={
                item.active ? "sb-badge-preview-active" : "sb-badge-preview"
            }
        >
            {item.badge}
        </span>
    ) : null;

    // ── Inner content ────────────────────────────────────────

    const lockedBadge = disabled && !collapsed ? (
        <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-bdo text-[8px] font-bold uppercase tracking-wider text-slate-400">
            Locked
        </span>
    ) : null;

    const tooltipLabel = disabled
        ? `${item.label} - ${item.disabledReason ?? "akses belum diberikan"}`
        : item.label;

    const inner = (
        <>
            {/* Caustic shimmer on active */}
            {item.active && (
                <div className="pointer-events-none absolute inset-0 rounded-xl sb-caustics opacity-100" />
            )}

            {/* Terracotta left accent bar on active (expanded) */}
            {item.active && !collapsed && (
                <div
                    className="absolute left-0 top-[20%] bottom-[20%] w-[3px] rounded-full bg-gradient-to-b from-[#EA684F] to-[#B93D2A]
                    shadow-[0_0_6px_rgba(227,83,54,0.7)]"
                />
            )}

            {/* Icon container */}
            <div
                className={cn(
                    "relative flex items-center justify-center transition-all duration-200 shrink-0",
                    collapsed
                        ? cn(
                              "h-10 w-10 rounded-xl",
                              item.active
                                  ? "border border-[#99F6E4]/70 bg-[linear-gradient(135deg,#ECFDF5,#FFFFFF_52%,#FFF7F5)] shadow-[0_10px_22px_-16px_rgba(20,184,166,.75),inset_0_1px_0_rgba(255,255,255,.95)]"
                                  : isLogout
                                    ? "hover:bg-rose-50"
                                    : "hover:bg-[#FFF1EE]",
                          )
                        : "h-[26px] w-[26px] rounded-lg",
                )}
            >
                <Icon size={collapsed ? 18 : 15} className={iconCls} />

                {/* Active indicator dot (collapsed only) */}
                {collapsed && item.active && (
                    <span
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full
                        bg-[#14B8A6] sb-active-dot"
                    />
                )}
            </div>

            {/* Label + badge + chevron (expanded only) */}
            {!collapsed && (
                <>
                    <span className={labelCls}>{item.label}</span>
                    {badgeEl}
                    {lockedBadge}
                    {hasChildren && (
                        <ChevronDown
                            size={12}
                            className={cn(
                                "shrink-0 text-slate-400 transition-transform duration-200",
                                subOpen && "rotate-180 text-[#E35336]",
                            )}
                        />
                    )}
                </>
            )}

            {/* Tooltip (collapsed mode hover) */}
            {collapsed && <Tooltip label={tooltipLabel} visible={hovered} />}
        </>
    );

    // ── Render logic ─────────────────────────────────────────

    const handleParentClick = (e: React.MouseEvent) => {
        if (hasChildren && !collapsed) {
            e.preventDefault();
            setSubOpen((v) => !v);
        }
    };

    const isLogoutPost = "method" in item && item.method === "post";

    const wrapped = (() => {
        if (disabled || !item.href) {
            return (
                <button
                    type="button"
                    disabled
                    title={item.disabledReason ?? "Akses belum diberikan oleh Administrator"}
                    className={wrapperCls}
                >
                    {inner}
                </button>
            );
        }
        if (isLogoutPost) {
            return (
                <Link
                    href={item.href}
                    method="post"
                    as="button"
                    type="button"
                    className={wrapperCls}
                >
                    {inner}
                </Link>
            );
        }
        if (hasChildren && !collapsed) {
            return (
                <button
                    type="button"
                    onClick={handleParentClick}
                    className={wrapperCls}
                >
                    {inner}
                </button>
            );
        }
        return (
            <Link href={item.href} className={wrapperCls}>
                {inner}
            </Link>
        );
    })();

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={cn("relative", collapsed && "flex justify-center")}
            data-sidebar-active={item.active ? "true" : undefined}
        >
            {wrapped}

            {/* Submenu */}
            {hasChildren && !collapsed && (
                <div
                    className={cn(
                        "mt-0.5 ml-5 pl-3 flex flex-col gap-0.5 border-l-2 border-[#FFD5CD]",
                        subOpen ? "sb-submenu-open" : "sb-submenu-close",
                    )}
                >
                    {subOpen &&
                        "children" in item &&
                        item.children?.map((child, ci) => (
                            <NavLink
                                key={child.label}
                                item={child}
                                collapsed={false}
                                depth={1}
                                animClass={`sb-slide-right sb-d${ci + 1}`}
                            />
                        ))}
                </div>
            )}
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  NAV GROUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function NavGroup({
    group,
    collapsed,
    startDelay,
}: {
    group: NavGroup;
    collapsed: boolean;
    startDelay: number;
}) {
    return (
        <div className="mb-4">
            {/* Label (expanded) */}
            {!collapsed && (
                <div className="flex items-center gap-2 px-3 mb-1.5">
                    <span className="font-bdo text-[9px] font-bold uppercase tracking-[0.22em] text-slate-400">
                        {group.label}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
                </div>
            )}
            {/* Collapsed: separator dot */}
            {collapsed && (
                <div className="flex justify-center my-2">
                    <span className="h-1 w-1 rounded-full bg-[#F8B5A8]" />
                </div>
            )}

            <div
                className={cn(
                    "flex flex-col",
                    collapsed ? "items-center gap-1.5 px-0" : "gap-0.5",
                )}
            >
                {group.items.map((item, i) => (
                    <NavLink
                        key={item.label}
                        item={item}
                        collapsed={collapsed}
                        animClass={`sb-fade-up sb-d${startDelay + i + 1}`}
                    />
                ))}
            </div>
        </div>
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SIDEBAR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
    const { auth } = usePage<PageProps>().props;
    const navScrollRef = useRef<HTMLElement | null>(null);
    const userRole = auth.user?.role ?? null;
    const permissionSet = new Set(auth.user?.permissions ?? []);
    const isAdministrator = userRole === "Administrator";

    const can = (permissions: string[] = [], requireAll = false): boolean => {
        if (isAdministrator || permissions.length === 0) return true;

        return requireAll
            ? permissions.every((permission) => permissionSet.has(permission))
            : permissions.some((permission) => permissionSet.has(permission));
    };

    const hasRole = (roles: string[] = []): boolean => {
        if (isAdministrator || roles.length === 0) return true;

        return Boolean(userRole && roles.includes(userRole));
    };

    const guardedItem = <T extends NavItem | NavChild>(
        item: T & {
            permissions?: string[];
            requireAllPermissions?: boolean;
            roles?: string[];
        },
    ): T => {
        const children =
            "children" in item && item.children
                ? item.children.map((child) => guardedItem(child))
                : undefined;
        const allowed =
            can(item.permissions, item.requireAllPermissions) &&
            hasRole(item.roles);

        return {
            ...item,
            disabled: item.disabled || !allowed,
            disabledReason:
                !allowed && !item.disabledReason
                    ? "Akses belum diberikan oleh Administrator"
                    : item.disabledReason,
            ...(children ? { children } : {}),
        } as T;
    };

    // Persist collapse state in localStorage
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return localStorage.getItem("sb_collapsed") === "1";
    });

    const toggleCollapsed = () =>
        setCollapsed((v) => {
            const next = !v;
            localStorage.setItem("sb_collapsed", next ? "1" : "0");
            return next;
        });

    const [isDesktop, setIsDesktop] = useState(true);
    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth >= 1280);
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const effectiveCollapsed = collapsed && isDesktop;

    useEffect(() => {
        const nav = navScrollRef.current;
        if (!nav || typeof window === "undefined") return;

        const savedValue = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
        const savedTop = Number(savedValue);
        const hasSavedTop = savedValue !== null && Number.isFinite(savedTop);

        const restore = () => {
            if (hasSavedTop) {
                nav.scrollTop = savedTop;
                return;
            }

            nav.querySelector<HTMLElement>('[data-sidebar-active="true"]')
                ?.scrollIntoView({ block: "center", inline: "nearest" });
        };

        const frame = window.requestAnimationFrame(() => {
            window.requestAnimationFrame(restore);
        });

        return () => window.cancelAnimationFrame(frame);
    }, [effectiveCollapsed, mobileOpen]);

    const rememberSidebarScroll = () => {
        const nav = navScrollRef.current;
        if (!nav || typeof window === "undefined") return;
        sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(nav.scrollTop));
    };

    // ── Active states — IDENTICAL to original ────────────────
    const dashboardActive = isCurrent("admin.dashboard");
    const identityActive = isCurrent("admin.identity.*");
    const facilitiesActive = isCurrent("admin.facilities.*");
    const bookingsActive = isCurrent("admin.bookings.*");
    const newsActive = isCurrent("admin.news.*");
    const promoActive = isCurrent("admin.promo.*");
    const sponsorsActive = isCurrent("admin.sponsors.*");
    const reelsActive = isCurrent("admin.reels.*");
    const testimonialsActive = isCurrent("admin.testimonials.*");
    const membershipsActive =
        isCurrent("admin.memberships.index") ||
        isCurrent("admin.memberships.store");
    const plansActive = isCurrent("admin.memberships.plans.*");
    const financeActive = isCurrent("admin.finance.*");
    const schedulesActive = isCurrent("admin.settings.schedules");
    const rolesActive = isCurrent("admin.settings.roles");
    const usersActive = isCurrent("admin.settings.users*");

    // ── Nav structure — routes IDENTICAL to original ──────────
    const navGroups: NavGroup[] = [
        {
            label: "Main",
            items: [
                {
                    icon: LayoutDashboard,
                    label: "Dashboard",
                    href: safeRoute("admin.dashboard"),
                    active: dashboardActive,
                },
                {
                    icon: BadgeCheck,
                    label: "Identity Queue",
                    href: safeRoute("admin.identity.index"),
                    active: identityActive,
                    permissions: ["verify-identity"],
                },
                {
                    icon: Dumbbell,
                    label: "Facilities",
                    href: safeRoute("admin.facilities.index"),
                    active: facilitiesActive,
                    permissions: ["view-facilities", "manage-facilities", "manage-pricing"],
                },
                {
                    icon: CalendarCheck2,
                    label: "Bookings",
                    href: safeRoute("admin.bookings.index"),
                    active: bookingsActive,
                    permissions: ["view-bookings", "manage-bookings", "manage-payment-links"],
                },
                {
                    icon: Users2,
                    label: "Memberships",
                    href: safeRoute("admin.memberships.index"),
                    active: membershipsActive || plansActive,
                    permissions: ["view-members", "manage-members", "manage-bookings", "manage-payment-links"],
                    children: [
                        {
                            icon: Users2,
                            label: "Anggota",
                            href: safeRoute("admin.memberships.index"),
                            active: membershipsActive,
                            permissions: ["view-members", "manage-members", "manage-bookings", "manage-payment-links"],
                        },
                        {
                            icon: Package,
                            label: "Paket",
                            href: safeRoute("admin.memberships.plans.index"),
                            active: plansActive,
                            permissions: ["manage-members"],
                        },
                    ],
                },
                {
                    icon: BarChart3,
                    label: "Finance",
                    href: safeRoute("admin.finance.index"),
                    active: financeActive,
                    permissions: ["view-reports"],
                },
            ],
        },
        {
            label: "Content",
            items: [
                {
                    icon: Newspaper,
                    label: "News",
                    href: safeRoute("admin.news.index"),
                    active: newsActive,
                    permissions: ["manage-cms"],
                },
                {
                    icon: ImagePlus,
                    label: "Promo",
                    href: safeRoute("admin.promo.index"),
                    active: promoActive,
                    permissions: ["manage-cms"],
                },
                {
                    icon: Award,
                    label: "Sponsors",
                    href: safeRoute("admin.sponsors.index"),
                    active: sponsorsActive,
                    permissions: ["manage-cms"],
                },
                {
                    icon: Film,
                    label: "Reels",
                    href: safeRoute("admin.reels.index"),
                    active: reelsActive,
                    permissions: ["manage-cms"],
                },
                {
                    icon: MessageSquare,
                    label: "Testimonials",
                    href: safeRoute("admin.testimonials.index"),
                    active: testimonialsActive,
                    permissions: ["manage-cms"],
                },
            ],
        },
        {
            label: "Settings",
            items: [
                {
                    icon: CalendarRange,
                    label: "Schedule Control",
                    href: safeRoute("admin.settings.schedules"),
                    active: schedulesActive,
                    permissions: ["manage-booking-limits"],
                },
                {
                    icon: ShieldCheck,
                    label: "Role & Access",
                    href: safeRoute("admin.settings.roles"),
                    active: rolesActive,
                },
                {
                    icon: UserCog,
                    label: "Internal Users",
                    href: safeRoute("admin.settings.users"),
                    active: usersActive,
                },
            ],
        },
        {
            label: "Other",
            items: [
                {
                    icon: HelpCircle,
                    label: "Help",
                    disabled: true,
                    active: false,
                },
            ],
        },
    ];

    const visibleNavGroups = navGroups.map((group) => ({
        ...group,
        items: group.items.map((item) => guardedItem(item)),
    }));

    const logoutItem: NavItem = {
        icon: LogOut,
        label: "Log out",
        href: safeRoute("ubsc-staff.logout"),
        method: "post",
        as: "button",
        active: false,
    };

    let delayCounter = 0;

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: SIDEBAR_STYLES }} />

            {/* ── Mobile backdrop ── */}
            <div
                onClick={onClose}
                aria-hidden="true"
                className={cn(
                    "fixed inset-0 z-[50] bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 xl:hidden",
                    mobileOpen
                        ? "opacity-100"
                        : "pointer-events-none opacity-0",
                )}
            />

            {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                SIDEBAR PANEL
            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-[60] flex flex-col h-full shrink-0",
                    "w-[268px] max-w-[85vw]",
                    mobileOpen ? "translate-x-0" : "-translate-x-full",
                    "xl:relative xl:translate-x-0 xl:z-0",
                    effectiveCollapsed ? "xl:w-[68px]" : "xl:w-[268px]",
                    "bg-white border-r border-slate-200/80 shadow-2xl xl:shadow-[4px_0_32px_rgba(0,0,0,0.05)]",
                    "transition-[transform,width] duration-300 ease-in-out sb-panel-shimmer",
                )}
                aria-label="Admin sidebar"
            >
                {/* ── Top accent line — terracotta gradient matching pages ── */}
                <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#E35336] via-[#EA684F] to-[#F08C78] opacity-80 z-10" />

                {/* ── Subtle inner left warm glow strip ── */}
                <div className="absolute top-0 left-0 bottom-0 w-[1px] bg-gradient-to-b from-[#F08C78]/60 via-transparent to-transparent pointer-events-none" />

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    HEADER
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <div
                    className={cn(
                        "flex h-[68px] shrink-0 items-center border-b border-slate-100",
                        "transition-all duration-300 relative",
                        effectiveCollapsed
                            ? "justify-center px-0 gap-0"
                            : "justify-between px-5",
                    )}
                >
                    <Link
                        href="/"
                        className="flex items-center gap-3 group outline-none min-w-0"
                    >
                        {/* Logo */}
                        <div className="relative shrink-0">
                            <div
                                className="absolute inset-0 rounded-full bg-[#EA684F]/15 blur-xl scale-75
                                group-hover:scale-125 transition-transform duration-500 sb-logo-breathe"
                            />
                            <img
                                src="/UBSC PRO.png"
                                alt="UBSC"
                                className={cn(
                                    "relative z-10 w-auto drop-shadow-sm group-hover:scale-105 transition-all duration-300",
                                    effectiveCollapsed ? "h-9 xl:h-3" : "h-9",
                                )}
                            />
                        </div>
                    </Link>

                    {/* Mobile close button (hidden in collapsed) */}
                    {!effectiveCollapsed && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl p-1.5 text-slate-400 hover:bg-[#FFF1EE] hover:text-[#B93D2A]
                                xl:hidden transition-colors"
                            aria-label="Close sidebar"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    NAV — scroll isolation applied here
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                {/* Minimize control - separate from logo section */}
                <div
                    className={cn(
                        "hidden shrink-0 border-b border-slate-100 bg-white/95 xl:flex",
                        effectiveCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                    )}
                >
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        title={effectiveCollapsed ? "Expand sidebar" : "Minimize sidebar"}
                        aria-label={effectiveCollapsed ? "Expand sidebar" : "Minimize sidebar"}
                        className={cn(
                            "group flex w-full items-center gap-2.5 rounded-xl py-2",
                            "border border-transparent font-bdo text-[10.5px] font-bold uppercase tracking-wider text-slate-400",
                            "transition-all duration-200 hover:border-[#FFD5CD] hover:bg-[#FFF1EE] hover:text-[#B93D2A]",
                            effectiveCollapsed ? "justify-center px-0" : "px-3",
                        )}
                    >
                        {effectiveCollapsed ? (
                            <PanelLeftOpen
                                size={15}
                                className="text-slate-400 transition-colors group-hover:text-[#E35336]"
                            />
                        ) : (
                            <>
                                <PanelLeftClose
                                    size={15}
                                    className="shrink-0 text-slate-400 transition-colors group-hover:text-[#E35336]"
                                />
                                <span className="sb-fade-in">Minimize</span>
                            </>
                        )}
                    </button>
                </div>

                <nav
                    ref={navScrollRef}
                    onScroll={rememberSidebarScroll}
                    className={cn(
                        // sb-scroll carries overscroll-behavior: contain (CSS above)
                        "flex-1 sb-scroll transition-all duration-300",
                        effectiveCollapsed ? "px-2 py-5" : "px-3 py-5",
                    )}
                    data-lenis-prevent="true"
                >
                    {visibleNavGroups.map((group) => {
                        const groupStart = delayCounter;
                        delayCounter += group.items.length;
                        return (
                            <NavGroup
                                key={group.label}
                                group={group}
                                collapsed={effectiveCollapsed}
                                startDelay={groupStart}
                            />
                        );
                    })}
                </nav>

                {/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                    FOOTER — logout
                ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
                <div
                    className={cn(
                        "shrink-0 border-t border-slate-100 bg-gradient-to-b from-white to-slate-50/80",
                        effectiveCollapsed ? "px-2 py-3" : "px-3 py-3",
                    )}
                >
                    {/* Logout */}
                    <NavLink item={logoutItem} collapsed={effectiveCollapsed} />

                </div>
            </aside>
        </>
    );
}
