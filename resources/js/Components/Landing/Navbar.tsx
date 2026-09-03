"use client";

import {
    lazy,
    Suspense,
    useState,
    useEffect,
    useRef,
    type CSSProperties,
} from "react";
import {
    Dumbbell,
    LogOut,
    ChevronDown,
    MessagesSquare,
    ReceiptText,
    ScanFace,
} from "lucide-react";
import square from "../../../assets/hero/square.png";
import InfoBanner from "@/Components/Landing/InfoBanner";
import { useAuthFlow } from "@/Components/Landing/AuthFlowProvider";
import { Link, router, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import { cn } from "@/lib/utils";
import "./Navbar.css";
import {
    NAV_MASK_DATA,
    NAVBAR_CRISP_LOGO_MASK,
} from "./navMaskData";

const loadProfileModal = () =>
    import("@/Components/UserDashboard/ProfileModal");
const loadPaymentHistoryModal = () =>
    import("@/Components/UserDashboard/PaymentHistoryModal");
const loadGymMembershipModal = () =>
    import("@/Components/UserDashboard/GymMembershipModal");
const loadContactUsModal = () =>
    import("@/Components/UserDashboard/ContactUsModal");

const ProfileModal = lazy(loadProfileModal);
const PaymentHistoryModal = lazy(loadPaymentHistoryModal);
const GymMembershipModal = lazy(loadGymMembershipModal);
const ContactUsModal = lazy(loadContactUsModal);

/* ====================================================================
   TYPES
==================================================================== */
type UserModal = "profile" | "history" | "membership" | "contact";

interface NavItem {
    label: string;
    number: string;
    href: string;
}

interface NavbarProps {
    activeSection?: string;
    showInfoBanner?: boolean;
    surface?: "media" | "light";
    deferLoopAnimations?: boolean;
}

const ProfileCtaArrow = () => (
    <svg
        className="ubsc-profile-cta-arrow"
        viewBox="0 0 72 72"
        fill="none"
        aria-hidden="true"
    >
        <path d="M24 36H53" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M42 22L56 36L42 50" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M29 32.8C32.6 34.9 36 35.8 40 36" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

type MemberStatus = 'none' | 'gym_only' | 'booked_only' | 'gym_and_booked';
const MEMBER_STATUS_CONFIG: Record<MemberStatus, { label: string; tone: string }> = {
    none:           { label: 'Pengunjung',                    tone: '116,126,137' },
    gym_only:       { label: 'Member Gym',                    tone: '20,174,121' },
    booked_only:    { label: 'Reservasi Aktif',               tone: '34,145,226' },
    gym_and_booked: { label: 'Member Gym · Reservasi Aktif',  tone: '224,145,31' },
};

const getMemberStatusConfig = (user: { role?: string | null; member_status?: MemberStatus } | null) => {
    if (user?.role) return { label: user.role, tone: '255,0,0' };
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

const NAVBAR_LOGO_SRC = "/assets/brand/ubsc-logo-640.webp";
const LOGOUT_QUERY_KEYS = [
    "auth",
    "return_to",
    "password_reset",
    "reset_success",
    "account",
] as const;

function currentPublicLogoutPath(): string {
    if (typeof window === "undefined") return "/";

    const url = new URL(window.location.href);

    /*
     * Checkout pages contain private order data and require an authenticated
     * session. After logout, return to their closest public continuation
     * instead of bouncing the guest through the login middleware.
     */
    if (
        url.pathname === "/checkout/booking" ||
        url.pathname.startsWith("/checkout/booking/")
    ) {
        return "/booking";
    }

    if (
        url.pathname === "/checkout/membership" ||
        url.pathname.startsWith("/checkout/membership/")
    ) {
        return "/pricing";
    }

    LOGOUT_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));

    return `${url.pathname}${url.search}${url.hash}`;
}

const ACCOUNT_NAVIGATION_ACTIONS = [
    {
        key: "profile",
        label: "Profil Saya",
        hint: "Identitas, preferensi, dan keamanan akun",
        icon: ScanFace,
        accent: "21,103,141",
    },
    {
        key: "history",
        label: "Riwayat Pembayaran",
        hint: "Transaksi, bukti pembayaran, dan invoice",
        icon: ReceiptText,
        accent: "255,0,0",
    },
    {
        key: "membership",
        label: "Membership",
        hint: "Paket aktif, manfaat, dan masa berlaku",
        icon: Dumbbell,
        accent: "21,103,141",
    },
    {
        key: "contact",
        label: "Pusat Bantuan",
        hint: "Bantuan reservasi dan akses akun",
        icon: MessagesSquare,
        accent: "255,0,0",
    },
] as const satisfies ReadonlyArray<{
    key: UserModal;
    label: string;
    hint: string;
    icon: typeof ScanFace;
    accent: string;
}>;

/* ====================================================================
   KINETIC NAV LINK
==================================================================== */
interface KineticNavLinkProps {
    item: NavItem;
    isActive: boolean;
    presentationOnly?: boolean;
    motionActive?: boolean;
    onMotionChange?: (active: boolean) => void;
}

function KineticNavLink({
    item,
    isActive,
    presentationOnly = false,
    motionActive = false,
    onMotionChange,
}: KineticNavLinkProps) {
    const labelMaskStyle = {
        ["--ubsc-nav-mask" as string]:
            NAV_MASK_DATA[item.label.toLowerCase()],
    } as CSSProperties;
    const numberMaskStyle = {
        ["--ubsc-nav-mask" as string]:
            NAV_MASK_DATA[item.number],
    } as CSSProperties;

    return (
        <Link
            href={item.href}
            prefetch={presentationOnly ? false : "hover"}
            cacheFor="30s"
            className={`kinetic-nav-link ${isActive ? "kinetic-nav-active" : ""} ${motionActive ? "kinetic-nav-motion-active" : ""} font-clash text-[clamp(0.75rem,1vw,16px)] tracking-wide`}
            aria-hidden={presentationOnly || undefined}
            tabIndex={presentationOnly ? -1 : undefined}
            /*
             * Inertia's hover-prefetch owns onMouseEnter/onMouseLeave on the
             * rendered anchor. Pointer events keep the visual interaction
             * independent, so prefetching cannot replace the hover motion.
             */
            onPointerEnter={
                presentationOnly ? undefined : () => onMotionChange?.(true)
            }
            onPointerLeave={
                presentationOnly ? undefined : () => onMotionChange?.(false)
            }
            onFocus={
                presentationOnly ? undefined : () => onMotionChange?.(true)
            }
            onBlur={
                presentationOnly ? undefined : () => onMotionChange?.(false)
            }
            style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: "1px",
                color: "inherit",
                textDecoration: "none",
                outline: "none",
                userSelect: "none",
                letterSpacing: "0.02em",
                pointerEvents: presentationOnly ? "none" : undefined,
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
                    style={{
                        display: "block",
                        willChange: "transform",
                        ...labelMaskStyle,
                    }}
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
                        color: "inherit",
                        ...labelMaskStyle,
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
                    color: "inherit",
                    marginLeft: "1px",
                }}
            >
                <span
                    className="knav-num-primary"
                    style={{
                        display: "block",
                        willChange: "transform",
                        ...numberMaskStyle,
                    }}
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
                        ...numberMaskStyle,
                    }}
                >
                    {item.number}
                </span>
            </sup>
        </Link>
    );
}

interface PixelNavSilhouetteProps {
    activeSection: string;
    hoveredNavNumber: string | null;
    mobileOpen: boolean;
}

function PixelNavSilhouette({
    activeSection,
    hoveredNavNumber,
    mobileOpen,
}: PixelNavSilhouetteProps) {
    return (
        <>
            <div className="flex items-center gap-2">
                <span
                    className="ubsc-pixel-logo-mask block h-12 w-24"
                    style={{
                        ["--ubsc-crisp-logo-mask" as string]:
                            NAVBAR_CRISP_LOGO_MASK,
                    }}
                />
            </div>

            <ul
                className="hidden items-center gap-6 min-[1100px]:flex xl:gap-12"
                style={{ position: "relative", zIndex: 2 }}
            >
                {NAV_ITEMS.map((item) => (
                    <li key={item.number}>
                        <KineticNavLink
                            item={item}
                            isActive={item.label === activeSection}
                            presentationOnly
                            motionActive={hoveredNavNumber === item.number}
                        />
                    </li>
                ))}
            </ul>

            <div className="relative">
                <div className="hidden origin-right scale-90 min-[1100px]:block xl:scale-100">
                    <div className="ubsc-pixel-card-surface" />
                </div>
            </div>

            <div
                className="flex flex-col items-end justify-center gap-[6px] p-1 min-[1100px]:hidden"
                aria-hidden="true"
            >
                <span
                    className={cn(
                        "ubsc-pixel-hamburger-line block h-[2px] w-7 rounded-sm transition-all duration-300",
                        mobileOpen && "w-6 translate-y-[4px] rotate-45",
                    )}
                />
                <span
                    className={cn(
                        "ubsc-pixel-hamburger-line block h-[2px] w-5 rounded-sm transition-all duration-300",
                        mobileOpen &&
                            "w-6 -translate-y-[4px] -rotate-45",
                    )}
                />
            </div>
        </>
    );
}

interface PixelCardInkProps {
    activeSection: string;
    dropdownOpen: boolean;
    firstName: string;
    guestCtaArrowActive: boolean;
    isLoggedIn: boolean;
    memberLabel: string;
    userEmail?: string | null;
}

function PixelCardInk({
    activeSection,
    dropdownOpen,
    firstName,
    guestCtaArrowActive,
    isLoggedIn,
    memberLabel,
    userEmail,
}: PixelCardInkProps) {
    return (
        <>
            <span
                className="block h-12 w-24"
                style={{ visibility: "hidden" }}
            />

            <ul
                className="hidden items-center gap-6 min-[1100px]:flex xl:gap-12"
                style={{ visibility: "hidden" }}
            >
                {NAV_ITEMS.map((item) => (
                    <li key={item.number}>
                        <KineticNavLink
                            item={item}
                            isActive={item.label === activeSection}
                            presentationOnly
                        />
                    </li>
                ))}
            </ul>

            <div className="relative">
                <div className="hidden origin-right scale-90 min-[1100px]:block xl:scale-100">
                    <div className="ubsc-pixel-card-ink">
                        <span className="ubsc-pixel-card-media-slot" />

                        {isLoggedIn ? (
                            <div className="ubsc-pixel-card-member-copy flex min-w-0 flex-col justify-center px-3 py-2 text-left">
                                <p className="ubsc-pixel-card-title max-w-[116px] truncate whitespace-nowrap font-clash text-sm font-semibold leading-tight">
                                    Good day, {firstName}
                                </p>
                                <p className="ubsc-guest-card__register ubsc-pixel-card-register max-w-[96px] truncate font-clash text-[12px] font-medium">
                                    {userEmail}
                                </p>
                                <p className="ubsc-pixel-card-guest -mt-0.5 flex max-w-[100px] items-center gap-1 truncate font-clash text-[10px]">
                                    <span
                                        className="ubsc-pixel-status-gem"
                                        aria-hidden="true"
                                    />
                                    {memberLabel}
                                </p>
                            </div>
                        ) : (
                            <div className="ubsc-pixel-card-guest-copy flex flex-col justify-center px-3 py-2 text-left">
                                <p className="ubsc-pixel-card-title whitespace-nowrap font-clash text-sm font-semibold leading-tight">
                                    Lets Get Started
                                </p>
                                <p className="ubsc-guest-card__register ubsc-pixel-card-register font-clash text-[12px] font-semibold">
                                    Register Now
                                </p>
                                <p className="ubsc-pixel-card-guest -mt-0.5 font-clash text-[10px]">
                                    Guest
                                </p>
                            </div>
                        )}

                        <div className="ml-auto flex items-center pr-3">
                            {isLoggedIn ? (
                                <ChevronDown
                                    size={20}
                                    className={cn(
                                        "transition-transform duration-300 ease-out",
                                        dropdownOpen && "rotate-180",
                                    )}
                                />
                            ) : (
                                <span
                                    className={cn(
                                        "ubsc-pixel-card-arrow",
                                        guestCtaArrowActive &&
                                            "ubsc-pixel-card-arrow--active",
                                    )}
                                    aria-hidden="true"
                                >
                                    <ProfileCtaArrow />
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <span
                className="block h-9 w-9 min-[1100px]:hidden"
                style={{ visibility: "hidden" }}
            />
        </>
    );
}

/* ====================================================================
   MAIN COMPONENT
==================================================================== */
export default function Navbar({
    activeSection = "Home",
    showInfoBanner = true,
    deferLoopAnimations = false,
}: NavbarProps) {
    /* ── Auth state ── */
    const { auth } = usePage<PageProps>().props;
    const user = auth?.user ?? null;
    const isLoggedIn = !!user;
    const { openAuth } = useAuthFlow();

    /* ── UI state ── */
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobileAcctOpen, setMobileAcctOpen] = useState(false);
    const [pressedMobileHref, setPressedMobileHref] = useState<string | null>(null);
    const [hoveredNavNumber, setHoveredNavNumber] = useState<string | null>(
        null,
    );
    const [guestCtaArrowActive, setGuestCtaArrowActive] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [logoutProcessing, setLogoutProcessing] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const mobileAccountDetailRef = useRef<HTMLDivElement>(null);
    const mobileTouchYRef = useRef(0);

    /* ── Modal state (from Navbar__1_.tsx) ── */
    const [activeUserModal, setActiveUserModal] = useState<UserModal | null>(
        null,
    );
    const [avatarFailed, setAvatarFailed] = useState(false);
    const [isIPhoneGlassRuntime, setIsIPhoneGlassRuntime] = useState(false);

    /*
     * Keep account tooling out of the public navigation critical path. Once a
     * signed-in visitor deliberately opens the account surface we warm the
     * four modal chunks, so the eventual click still feels immediate.
     */
    useEffect(() => {
        if (!isLoggedIn || (!dropdownOpen && !mobileAcctOpen)) return;

        void Promise.all([
            loadProfileModal(),
            loadPaymentHistoryModal(),
            loadGymMembershipModal(),
            loadContactUsModal(),
        ]).catch(() => {
            // React.lazy retains its normal retry/error-boundary behaviour.
        });
    }, [dropdownOpen, isLoggedIn, mobileAcctOpen]);

    const logoutFromCurrentPage = () => {
        if (logoutProcessing) return;

        setDropdownOpen(false);
        setMobileAcctOpen(false);
        setMobileOpen(false);
        setActiveUserModal(null);
        setLogoutProcessing(true);

        router.post(
            route("logout"),
            { return_to: currentPublicLogoutPath() },
            {
                preserveScroll: true,
                onFinish: () => setLogoutProcessing(false),
            },
        );
    };

    /* ── Navbar & Background Scroll Behavior ── */
    const [navHidden, setNavHidden] = useState(false);
    const [showBg, setShowBg] = useState(false);
    const lastScrollY = useRef(0);
    const directionAnchorY = useRef(0);
    const scrollDirection = useRef<-1 | 0 | 1>(0);
    const navHiddenRef = useRef(false);
    const ticking = useRef<number | null>(null);
    const bgOpacity = useRef(0);

    useEffect(() => {
        const readScrollY = () => {
            return Math.max(
                0,
                window.scrollY || document.documentElement.scrollTop || 0,
            );
        };

        const commitNavHidden = (hidden: boolean) => {
            if (hidden === navHiddenRef.current) return;
            navHiddenRef.current = hidden;
            setNavHidden(hidden);
        };

        const commitBackground = (visible: boolean) => {
            const nextOpacity = visible ? 1 : 0;
            if (nextOpacity === bgOpacity.current) return;
            bgOpacity.current = nextOpacity;
            setShowBg(visible);
        };

        const initialY = readScrollY();
        lastScrollY.current = initialY;
        directionAnchorY.current = initialY;
        commitBackground(initialY > 56);

        const update = () => {
            ticking.current = null;

            const y = readScrollY();
            const delta = y - lastScrollY.current;

            // Separate enter/exit thresholds prevent the glass surface from
            // repeatedly mounting near the top during Safari elastic scroll.
            commitBackground(
                bgOpacity.current === 1 ? y >= 32 : y > 56,
            );

            if (y <= 50) {
                scrollDirection.current = 0;
                directionAnchorY.current = y;
                commitNavHidden(false);
            } else if (Math.abs(delta) >= 0.75) {
                const nextDirection: -1 | 1 = delta > 0 ? 1 : -1;

                if (nextDirection !== scrollDirection.current) {
                    scrollDirection.current = nextDirection;
                    directionAnchorY.current = lastScrollY.current;
                }

                const directionalTravel = Math.abs(
                    y - directionAnchorY.current,
                );
                const threshold = nextDirection > 0 ? 12 : 8;

                if (directionalTravel >= threshold) {
                    commitNavHidden(nextDirection > 0);
                    directionAnchorY.current = y;
                }
            }

            lastScrollY.current = y;
        };

        const onScroll = () => {
            if (ticking.current !== null) return;
            ticking.current = window.requestAnimationFrame(update);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", onScroll);
            if (ticking.current !== null) {
                window.cancelAnimationFrame(ticking.current);
                ticking.current = null;
            }
        };
    }, []);

    /* ── iOS-safe document lock for the mobile navigation ── */
    useEffect(() => {
        if (!mobileOpen) {
            setMobileAcctOpen(false);
            setPressedMobileHref(null);
            return;
        }

        const root = document.documentElement;
        const body = document.body;
        const lockedProperties = {
            root: ["overflow", "overscroll-behavior", "touch-action"],
            body: ["overflow", "overscroll-behavior", "touch-action"],
        } as const;

        const snapshot = (element: HTMLElement, properties: readonly string[]) =>
            properties.map((property) => ({
                property,
                value: element.style.getPropertyValue(property),
                priority: element.style.getPropertyPriority(property),
            }));
        const rootSnapshot = snapshot(root, lockedProperties.root);
        const bodySnapshot = snapshot(body, lockedProperties.body);
        const restore = (
            element: HTMLElement,
            entries: ReturnType<typeof snapshot>,
        ) => {
            entries.forEach(({ property, value, priority }) => {
                if (value) element.style.setProperty(property, value, priority);
                else element.style.removeProperty(property);
            });
        };

        root.style.setProperty("overflow", "hidden", "important");
        root.style.setProperty("overscroll-behavior", "none", "important");
        root.style.setProperty("touch-action", "none", "important");
        body.style.setProperty("overflow", "hidden", "important");
        body.style.setProperty("overscroll-behavior", "none", "important");
        body.style.setProperty("touch-action", "none", "important");

        return () => {
            restore(root, rootSnapshot);
            restore(body, bodySnapshot);
        };
    }, [mobileOpen]);

    /* The account detail is the only touch-scrollable surface in the drawer. */
    useEffect(() => {
        if (!mobileOpen) return;

        const touchAction = mobileAcctOpen ? "pan-y" : "none";
        document.documentElement.style.setProperty("touch-action", touchAction, "important");
        document.body.style.setProperty("touch-action", touchAction, "important");

        const onTouchStart = (event: TouchEvent) => {
            mobileTouchYRef.current = event.touches[0]?.clientY ?? 0;
        };
        const onTouchMove = (event: TouchEvent) => {
            const region = mobileAccountDetailRef.current;
            const target = event.target as Node | null;
            if (!mobileAcctOpen || !region || !target || !region.contains(target)) {
                event.preventDefault();
                return;
            }

            const nextY = event.touches[0]?.clientY ?? mobileTouchYRef.current;
            const deltaY = nextY - mobileTouchYRef.current;
            mobileTouchYRef.current = nextY;
            const atTop = region.scrollTop <= 0;
            const atBottom = Math.ceil(region.scrollTop + region.clientHeight) >= region.scrollHeight;
            const cannotScroll = region.scrollHeight <= region.clientHeight;

            if (cannotScroll || (atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
                event.preventDefault();
            }
        };

        document.addEventListener("touchstart", onTouchStart, { passive: true });
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        return () => {
            document.removeEventListener("touchstart", onTouchStart);
            document.removeEventListener("touchmove", onTouchMove);
        };
    }, [mobileOpen, mobileAcctOpen]);

    /* Avoid leaving the document locked if a rotation/resize crosses desktop. */
    useEffect(() => {
        const closeMobileNavigationAtDesktop = () => {
            if (window.innerWidth >= 1100) {
                setMobileAcctOpen(false);
                setMobileOpen(false);
            }
        };
        window.addEventListener("resize", closeMobileNavigationAtDesktop, { passive: true });
        return () => window.removeEventListener("resize", closeMobileNavigationAtDesktop);
    }, []);

    /* ── Click-outside closes desktop dropdown ── */
    useEffect(() => {
        if (!dropdownOpen) return;
        const handlePointerDown = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node)
            )
                setDropdownOpen(false);
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setDropdownOpen(false);
        };
        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [dropdownOpen]);


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

    /*
     * Scope the neutral WebKit optics and monochrome adaptive-logo fallback
     * to real iPhones; desktop and Android retain their original renderer.
     */
    useEffect(() => {
        const root = document.documentElement;
        const userAgent = navigator.userAgent;
        const isIPhoneWebKit =
            !/Android/i.test(userAgent) &&
            /\biPhone\b/i.test(userAgent) &&
            /AppleWebKit/i.test(userAgent) &&
            navigator.maxTouchPoints > 0;

        setIsIPhoneGlassRuntime(isIPhoneWebKit);

        if (isIPhoneWebKit) {
            root.dataset.ubscGlassRuntime = "iphone";
        } else {
            delete root.dataset.ubscGlassRuntime;
        }

        return () => {
            if (root.dataset.ubscGlassRuntime === "iphone") {
                delete root.dataset.ubscGlassRuntime;
            }
        };
    }, []);

    const showNavSurface = showBg && !mobileOpen;
    const navLayerClassName =
        "fixed left-0 right-0 flex items-center justify-between px-8 py-6 lg:px-12";
    const navTransform = navHidden
        ? "translate3d(0, -128px, 0)"
        : "translate3d(0, 0, 0)";
    const navLayerStyle: CSSProperties = {
        top: 27,
        height: "100px",
        transform: navTransform,
        transition: "transform 0.45s cubic-bezier(0.65, 0, 0.35, 1)",
        willChange: "transform",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
    };

    /* ==============================================================
       RENDER
    ============================================================== */
    return (
        <>
            {showInfoBanner && (
                <InfoBanner deferLoopAnimations={deferLoopAnimations} />
            )}

            {/* Original desktop glass refraction. */}
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

            {/* Original glass layer. */}
            <div
                id="ubsc-nav-wrapper"
                className={cn(
                    "fixed left-0 right-0 flex flex-col",
                    showNavSurface && "ubsc-nav-grain",
                )}
                style={{
                    ...navLayerStyle,
                    zIndex: 49,
                }}
            >
                {/* Background overlay — stays inside wrapper, moves with navbar */}
                <div
                    id="ubsc-nav-bg-overlay"
                    className="ubsc-liquid-glass pointer-events-none absolute inset-0"
                    aria-hidden="true"
                    style={{
                        opacity: showNavSurface ? 1 : 0,
                        visibility: showNavSurface ? "visible" : "hidden",
                        transition: showNavSurface
                            ? "opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s"
                            : "opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s linear 0.45s",
                    }}
                >
                    <div className="ubsc-lg-effect" />
                    {isIPhoneGlassRuntime && (
                        <>
                            <i className="ubsc-lg-refract ubsc-lg-refract--1" />
                            <i className="ubsc-lg-refract ubsc-lg-refract--2" />
                            <i className="ubsc-lg-refract ubsc-lg-refract--3" />
                            <i className="ubsc-lg-refract ubsc-lg-refract--4" />
                            <i className="ubsc-lg-refract ubsc-lg-refract--5" />
                            <i className="ubsc-lg-refract ubsc-lg-refract--6" />
                            <i className="ubsc-lg-refract ubsc-lg-refract--7" />
                        </>
                    )}
                    <div className="ubsc-lg-tint" />
                    <div className="ubsc-lg-shine" />
                </div>
            </div>

            {/* One masked backdrop pass: solid monochrome, smooth native edges. */}
            <div
                aria-hidden="true"
                className={cn("ubsc-adaptive-pixel-layer", navLayerClassName)}
                style={{
                    ...navLayerStyle,
                    zIndex: 50,
                }}
            >
                <PixelNavSilhouette
                    activeSection={activeSection}
                    hoveredNavNumber={hoveredNavNumber}
                    mobileOpen={mobileOpen}
                />
            </div>

            {/* Blue maps only the logo's black-on-light pixels to the brand tone. */}
            <div
                aria-hidden="true"
                className={cn("ubsc-brand-pixel-layer", navLayerClassName)}
                style={{
                    ...navLayerStyle,
                    zIndex: 51,
                    mixBlendMode: "screen",
                }}
            >
                <div className="flex items-center gap-2">
                    <img
                        src={NAVBAR_LOGO_SRC}
                        alt=""
                        className="ubsc-logo block h-12 w-24 object-contain"
                        width={640}
                        height={320}
                        decoding="sync"
                    />
                </div>
            </div>

            {/* White difference ink stays legible over each binary CTA surface pixel. */}
            <div
                aria-hidden="true"
                className={cn("ubsc-card-ink-layer", navLayerClassName)}
                style={{
                    ...navLayerStyle,
                    zIndex: 52,
                    color: "#ffffff",
                    mixBlendMode: "difference",
                }}
            >
                <PixelCardInk
                    activeSection={activeSection}
                    dropdownOpen={dropdownOpen}
                    firstName={firstName}
                    guestCtaArrowActive={guestCtaArrowActive}
                    isLoggedIn={isLoggedIn}
                    memberLabel={getMemberStatusConfig(user).label}
                    userEmail={user?.email}
                />
            </div>

            {/* Interaction and media are painted last, without any blend effect. */}
            <nav
                className={cn("ubsc-nav-interaction", navLayerClassName)}
                style={{
                    ...navLayerStyle,
                    zIndex: 53,
                }}
            >
                    {/* ── Logo ── */}
                    <div className="flex items-center gap-2">
                        <Link
                            href="/"
                            prefetch="hover"
                            cacheFor="30s"
                            className="ubsc-logo-wrap"
                        >
                            <img
                                src={NAVBAR_LOGO_SRC}
                                alt="UB Sport Center Logo"
                                className="ubsc-logo h-12 w-24 object-contain"
                                width={640}
                                height={320}
                                decoding="sync"
                                style={{
                                    position: "relative",
                                    zIndex: 2,
                                }}
                                {...{ fetchpriority: "high" }}
                            />
                        </Link>
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
                                    onMotionChange={(active) =>
                                        setHoveredNavNumber(
                                            active ? item.number : null,
                                        )
                                    }
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
                                        aria-expanded={dropdownOpen}
                                        aria-haspopup="menu"
                                        aria-controls="desktop-account-menu"
                                        className="ubsc-cta-btn group flex cursor-pointer items-stretch overflow-hidden bg-white"
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
                                        <div className="ubsc-nav-card-copy flex flex-col justify-center px-3 py-2 text-left min-w-0">
                                            <p className="max-w-[116px] truncate whitespace-nowrap font-clash text-sm font-semibold leading-tight text-navy-900/80">
                                                Good day, {firstName}
                                            </p>
                                            <p className="ubsc-guest-card__register max-w-[96px] truncate font-clash text-[12px] font-medium text-navy-900/80">
                                                {user?.email}
                                            </p>
                                            <p className="-mt-0.5 flex max-w-[100px] items-center gap-1 truncate font-clash text-[10px] text-navy-900/40">
                                                <span
                                                    className="ubsc-account-status-gem"
                                                    style={{ ["--status-gem" as string]: getMemberStatusConfig(user).tone }}
                                                    aria-hidden="true"
                                                />
                                                {getMemberStatusConfig(user).label}
                                            </p>
                                        </div>

                                        {/* Chevron */}
                                        <div className="flex items-center pr-3">
                                            <ChevronDown
                                                size={20}
                                                className={cn(
                                                    "ubsc-nav-card-icon text-slate-400 transition-all duration-300 ease-out",
                                                    dropdownOpen &&
                                                        "rotate-180 text-slate-600",
                                                )}
                                            />
                                        </div>
                                    </button>
                                </div>

                                {/* Personal account navigation */}
                                {dropdownOpen && (
                                    <section id="desktop-account-menu" className="ubsc-signal-account" aria-label="Navigasi akun">
                                        <div className="ubsc-signal-account__stage ubsc-signal-account__stage--membership">
                                            <div className="ubsc-signal-account__topline">
                                                <div className="ubsc-signal-account__channel">
                                                    <span className="ubsc-signal-account__channel-name">
                                                        Selamat datang, {firstName}
                                                    </span>
                                                    <span className="ubsc-signal-account__channel-state">
                                                        <i className="ubsc-account-status-gem" aria-hidden="true" />
                                                        Akun aman · tersinkron
                                                    </span>
                                                </div>
                                                <span className="ubsc-signal-account__timer">04 akses</span>
                                            </div>
                                            <div className="ubsc-signal-account__spectrum" aria-hidden="true">
                                                <span className="ubsc-signal-account__wave ubsc-signal-account__wave--back" />
                                                <span className="ubsc-signal-account__wave ubsc-signal-account__wave--front" />
                                            </div>
                                        </div>

                                        <div className="ubsc-signal-account__sheet">
                                            <header className="ubsc-signal-account__profile">
                                                <div className="ubsc-signal-account__avatar">
                                                    {userAvatar && !avatarFailed ? (
                                                        <img
                                                            src={userAvatar}
                                                            alt={firstName}
                                                            referrerPolicy="no-referrer"
                                                            onError={() => setAvatarFailed(true)}
                                                        />
                                                    ) : (
                                                        <span className="ubsc-signal-account__avatar-fallback">{initials}</span>
                                                    )}
                                                </div>
                                                <div className="ubsc-signal-account__identity">
                                                    <p className="ubsc-signal-account__name">{user?.name}</p>
                                                    <p className="ubsc-signal-account__email">{user?.email}</p>
                                                </div>
                                                <div className="ubsc-signal-account__status">
                                                    <span className="ubsc-signal-account__status-line" style={{ ["--status-tone" as string]: getMemberStatusConfig(user).tone }}>
                                                        <i
                                                            className="ubsc-account-status-gem"
                                                            style={{ ["--status-gem" as string]: getMemberStatusConfig(user).tone }}
                                                            aria-hidden="true"
                                                        />
                                                        {getMemberStatusConfig(user).label}
                                                    </span>
                                                    <span className="ubsc-signal-account__status-sub">Akun terverifikasi</span>
                                                </div>
                                            </header>

                                            <div className="ubsc-signal-account__stream">
                                                {ACCOUNT_NAVIGATION_ACTIONS.map((row, index) => (
                                                    <button
                                                        key={row.key}
                                                        type="button"
                                                        className="ubsc-signal-account__row"
                                                        style={{ ["--row-accent" as string]: row.accent }}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setDropdownOpen(false);
                                                            setActiveUserModal(row.key);
                                                        }}
                                                    >
                                                        <span className="ubsc-signal-account__icon">
                                                            <row.icon size={16} strokeWidth={1.65} />
                                                        </span>
                                                        <span className="ubsc-signal-account__copy">
                                                            <span className="ubsc-signal-account__label">{row.label}</span>
                                                            <span className="ubsc-signal-account__hint">{row.hint}</span>
                                                        </span>
                                                        <span className="ubsc-signal-account__index">{String(index + 1).padStart(2, "0")}</span>
                                                        <span className="ubsc-signal-account__arrow">
                                                            <ProfileCtaArrow />
                                                        </span>
                                                    </button>
                                                ))}

                                                <button
                                                    type="button"
                                                    onClick={logoutFromCurrentPage}
                                                    disabled={logoutProcessing}
                                                    aria-busy={logoutProcessing}
                                                    className="ubsc-signal-account__exit"
                                                >
                                                    <span className="ubsc-signal-account__exit-label">Keluar Akun</span>
                                                    <span className="ubsc-signal-account__exit-line" />
                                                    <span className="ubsc-signal-account__exit-orb">
                                                        <LogOut size={14} strokeWidth={1.7} />
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    </section>
                                )}

                            </div>
                        ) : (
                            /*
                             * ── LOGGED OUT: "Lets Get Started" card ──
                             */
                            <div className="ubsc-cta-wrap ubsc-cta-wrap--no-zoom hidden min-[1100px]:flex scale-90 xl:scale-100 origin-right">
                                <button
                                    type="button"
                                    onClick={() =>
                                        openAuth({ view: "login" })
                                    }
                                    onMouseEnter={() =>
                                        setGuestCtaArrowActive(true)
                                    }
                                    onMouseLeave={() =>
                                        setGuestCtaArrowActive(false)
                                    }
                                    onFocus={() =>
                                        setGuestCtaArrowActive(true)
                                    }
                                    onBlur={() =>
                                        setGuestCtaArrowActive(false)
                                    }
                                    className="ubsc-cta-btn ubsc-guest-card group flex cursor-pointer items-stretch overflow-hidden bg-white"
                                >
                                    <div className="mt-1 mb-1 ml-1 w-14 flex-shrink-0 self-stretch overflow-hidden rounded-md">
                                        <img
                                            src={square}
                                            alt=""
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                    <div className="ubsc-nav-card-copy flex flex-col justify-center px-3 py-2 text-left">
                                        <p className="font-clash text-sm font-semibold leading-tight text-navy-900/80">
                                            Lets Get Started
                                        </p>
                                        <p className="ubsc-guest-card__register font-clash text-[12px] font-semibold text-navy-900/[0.54]">
                                            Register Now
                                        </p>
                                        <p className="-mt-0.5 font-clash text-[10px] text-navy-900/40">
                                            Guest
                                        </p>
                                    </div>
                                    <div className="flex items-center pr-3">
                                        <span className="ubsc-nav-card-icon ubsc-guest-card__arrow" aria-hidden="true">
                                            <ProfileCtaArrow />
                                        </span>
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
                        aria-expanded={mobileOpen}
                        aria-controls="ubsc-mobile-navigation-drawer"
                        style={{ position: "relative", zIndex: 2 }}
                    >
                        <span
                            className={cn(
                                "ubsc-nav-hamburger-line block h-[2px] w-7 rounded-sm transition-all duration-300",
                                mobileOpen && "w-6 translate-y-[4px] rotate-45",
                            )}
                        />
                        <span
                            className={cn(
                                "ubsc-nav-hamburger-line block h-[2px] w-5 rounded-sm transition-all duration-300",
                                mobileOpen &&
                                    "w-6 -translate-y-[4px] -rotate-45",
                            )}
                        />
                    </button>
            </nav>

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
                    background: "rgba(3,6,12,0.24)",
                    backdropFilter: "blur(2px) saturate(112%)",
                    WebkitBackdropFilter: "blur(2px) saturate(112%)",
                }}
            />

            {/* ── Mobile slide-down menu ── */}
            <div
                id="ubsc-mobile-navigation-drawer"
                data-account-open={mobileAcctOpen}
                className={cn(
                    "ubsc-mobile-menu account-modal-scroll fixed top-8 left-0 right-0 z-40 min-[1100px]:hidden transition-transform duration-500 ease-out",
                    mobileOpen ? "translate-y-0" : "-translate-y-full",
                )}
                style={{
                    background:
                        "linear-gradient(180deg, rgba(8,9,20,.965) 0%, rgba(8,9,20,.90) 54%, rgba(8,9,20,.58) 78%, rgba(8,9,20,.24) 100%)",
                    backdropFilter: "blur(18px) saturate(124%)",
                    WebkitBackdropFilter: "blur(18px) saturate(124%)",
                    borderBottom: "1px solid rgba(255,255,255,0.07)",
                    boxShadow: "0 16px 64px rgba(0,0,0,0.55)",
                }}
            >
                <div className="h-[80px] md:h-[104px]" />
                <div className="h-px w-full bg-white/10" />

                <ul className="ubsc-mobile-menu__page-list flex flex-col px-8 pt-0">
                    {NAV_ITEMS.map((item, index) => (
                        <li key={item.number}>
                            <Link
                                href={item.href}
                                prefetch={["hover", "click"]}
                                cacheFor="30s"
                                onPointerDown={() => {
                                    setPressedMobileHref(item.href);
                                }}
                                onPointerCancel={() => {
                                    setPressedMobileHref(null);
                                }}
                                onPointerLeave={(event) => {
                                    if (event.pointerType === "mouse") {
                                        setPressedMobileHref(null);
                                    }
                                }}
                                onClick={(event) => {
                                    if (
                                        event.button !== 0 ||
                                        event.metaKey ||
                                        event.ctrlKey ||
                                        event.shiftKey ||
                                        event.altKey
                                    ) {
                                        return;
                                    }
                                    setPressedMobileHref(item.href);
                                    setMobileOpen(false);
                                }}
                                className={cn(
                                    "ubsc-mobile-menu__page-link font-clash flex items-baseline justify-between py-5 text-xl transition-colors",
                                    item.label === activeSection
                                        ? "text-white"
                                        : "text-white/45 hover:text-white/75",
                                    pressedMobileHref === item.href && "is-pressed",
                                )}
                            >
                                <span className="ubsc-mobile-menu__page-label">
                                    <span
                                        className="ubsc-mobile-menu__page-primary"
                                        style={{ textShadow: "0 1px 8px rgba(0,0,0,.9)" }}
                                    >
                                        {item.label}
                                    </span>
                                    <span
                                        className="ubsc-mobile-menu__page-clone"
                                        aria-hidden="true"
                                        style={{ textShadow: "0 1px 8px rgba(0,0,0,.9)" }}
                                    >
                                        {item.label}
                                    </span>
                                </span>
                                <sup className="ubsc-mobile-menu__page-number text-white/30">
                                    <span className="ubsc-mobile-menu__number-primary">
                                        {item.number}
                                    </span>
                                    <span className="ubsc-mobile-menu__number-clone" aria-hidden="true">
                                        {item.number}
                                    </span>
                                </sup>
                            </Link>
                            {index < NAV_ITEMS.length - 1 && (
                                <div className="h-px w-full bg-white/8" />
                            )}
                        </li>
                    ))}
                </ul>

                <div className="ubsc-mobile-menu__page-divider mx-8 mt-0 h-px bg-white/10" />

                <div className="ubsc-mobile-account-slot px-[clamp(1.25rem,4vw,2rem)] py-[clamp(0.75rem,3vw,1.5rem)]">
                    {isLoggedIn && (
                        <section
                            className="ubsc-signal-account ubsc-signal-account--mobile"
                            data-expanded={mobileAcctOpen}
                            aria-label="Navigasi akun seluler"
                        >
                            <div className="ubsc-signal-account__stage">
                                <button
                                    type="button"
                                    className="ubsc-signal-account__mobile-profile-trigger group"
                                    onClick={() => setMobileAcctOpen((value) => !value)}
                                    aria-expanded={mobileAcctOpen}
                                    aria-label={mobileAcctOpen ? "Close account menu" : "Open account menu"}
                                >
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
                                            <div className="ubsc-avatar-bg flex h-full w-full items-center justify-center">
                                                <span className="font-clash select-none text-xl font-bold text-white/90">
                                                    {initials}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2 text-left">
                                        <p className="max-w-[180px] truncate whitespace-nowrap font-clash text-[clamp(0.75rem,3.5vw,1rem)] font-semibold leading-tight text-navy-900/80">
                                            Good day, {firstName}
                                        </p>
                                        <p className="ubsc-guest-card__register mt-0.5 max-w-[180px] truncate font-clash text-[clamp(0.625rem,2.8vw,0.875rem)] text-navy-900/80">
                                            {user?.email}
                                        </p>
                                        <p className="-mt-0.5 flex max-w-[180px] items-center gap-1 truncate font-clash text-[clamp(0.55rem,2.4vw,0.75rem)] text-navy-900/40">
                                            <span
                                                className="ubsc-account-status-gem"
                                                style={{ ["--status-gem" as string]: getMemberStatusConfig(user).tone }}
                                                aria-hidden="true"
                                            />
                                            {getMemberStatusConfig(user).label}
                                        </p>
                                    </div>

                                    <div className="flex items-center pr-3">
                                        <ChevronDown
                                            size={20}
                                            className={cn(
                                                "text-slate-400 transition-all duration-300 ease-out",
                                                mobileAcctOpen && "rotate-180 text-slate-600",
                                            )}
                                        />
                                    </div>
                                </button>
                            </div>

                            <div className="kl-collapse" data-open={mobileAcctOpen}>
                                <div className="kl-collapse-inner">
                                    <div
                                        ref={mobileAccountDetailRef}
                                        className="ubsc-mobile-account-detail"
                                        role="region"
                                        aria-label="Pilihan dan informasi akun"
                                        tabIndex={mobileAcctOpen ? 0 : -1}
                                    >
                                      <div className="ubsc-signal-account__sheet">
                                        <header className="ubsc-signal-account__profile">
                                            <div className="ubsc-signal-account__avatar">
                                                {userAvatar && !avatarFailed ? (
                                                    <img
                                                        src={userAvatar}
                                                        alt={firstName}
                                                        referrerPolicy="no-referrer"
                                                        onError={() => setAvatarFailed(true)}
                                                    />
                                                ) : (
                                                    <span className="ubsc-signal-account__avatar-fallback">{initials}</span>
                                                )}
                                            </div>
                                            <div className="ubsc-signal-account__identity">
                                                <p className="ubsc-signal-account__name">{user?.name}</p>
                                                <p className="ubsc-signal-account__email">{user?.email}</p>
                                            </div>
                                            <div className="ubsc-signal-account__status">
                                                <span className="ubsc-signal-account__status-line" style={{ ["--status-tone" as string]: getMemberStatusConfig(user).tone }}>
                                                    <i
                                                        className="ubsc-account-status-gem"
                                                        style={{ ["--status-gem" as string]: getMemberStatusConfig(user).tone }}
                                                        aria-hidden="true"
                                                    />
                                                    {getMemberStatusConfig(user).label}
                                                </span>
                                                <span className="ubsc-signal-account__status-sub">Akun terverifikasi</span>
                                            </div>
                                        </header>

                                        <div className="ubsc-signal-account__stream">
                                            {ACCOUNT_NAVIGATION_ACTIONS.map((row, index) => (
                                                <button
                                                    key={row.key}
                                                    type="button"
                                                    className="ubsc-signal-account__row"
                                                    style={{ ["--row-accent" as string]: row.accent }}
                                                    onClick={() => {
                                                        setMobileAcctOpen(false);
                                                        setMobileOpen(false);
                                                        setActiveUserModal(row.key);
                                                    }}
                                                >
                                                    <span className="ubsc-signal-account__icon">
                                                        <row.icon size={16} strokeWidth={1.65} />
                                                    </span>
                                                    <span className="ubsc-signal-account__copy">
                                                        <span className="ubsc-signal-account__label">{row.label}</span>
                                                        <span className="ubsc-signal-account__hint">{row.hint}</span>
                                                    </span>
                                                        <span className="ubsc-signal-account__index">{String(index + 1).padStart(2, "0")}</span>
                                                        <span className="ubsc-signal-account__arrow">
                                                        <ProfileCtaArrow />
                                                    </span>
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={logoutFromCurrentPage}
                                                disabled={logoutProcessing}
                                                aria-busy={logoutProcessing}
                                                className="ubsc-signal-account__exit"
                                            >
                                                <span className="ubsc-signal-account__exit-label">Keluar Akun</span>
                                                <span className="ubsc-signal-account__exit-line" />
                                                <span className="ubsc-signal-account__exit-orb">
                                                    <LogOut size={14} strokeWidth={1.7} />
                                                </span>
                                            </button>
                                        </div>
                                      </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                    {!isLoggedIn && (
                        /* Mobile: guest card */
                        <button
                            type="button"
                            onClick={() => {
                                setMobileOpen(false);
                                openAuth({ view: "login" });
                            }}
                            className="ubsc-mobile-guest-card ubsc-guest-card group flex w-full items-stretch overflow-hidden bg-white"
                        >
                            <div className="m-1.5 w-[clamp(3rem,10vw,5rem)] aspect-square flex-shrink-0 overflow-hidden rounded-lg">
                                <img
                                    src={square}
                                    alt=""
                                    className="h-full w-full object-cover"
                                />
                            </div>
                            <div className="flex flex-col justify-center px-[clamp(0.5rem,2vw,0.875rem)] py-2 text-left">
                                <p className="font-clash text-[clamp(0.75rem,3.5vw,1rem)] font-semibold leading-tight text-navy-900/80">
                                    Lets Get Started
                                </p>
                                <p className="ubsc-guest-card__register mt-0.5 font-clash text-[clamp(0.625rem,2.8vw,0.875rem)] font-semibold text-navy-900/[0.54]">
                                    Register Now
                                </p>
                                <p className="-mt-0.5 font-clash text-[clamp(0.55rem,2.4vw,0.75rem)] text-navy-900/40">
                                    Guest
                                </p>
                            </div>
                            <div className="ml-auto flex items-center pr-[clamp(0.5rem,2vw,0.875rem)]">
                                <span className="ubsc-guest-card__arrow" aria-hidden="true">
                                    <ProfileCtaArrow />
                                </span>
                            </div>
                        </button>
                    )}
                </div>

                {!mobileAcctOpen && (
                    <button
                        type="button"
                        className="ubsc-mobile-menu__dismiss-zone"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Tutup menu navigasi"
                        tabIndex={mobileOpen ? 0 : -1}
                    />
                )}
            </div>

            {/* ── User Dashboard Modals (authenticated only) ── */}
            <Suspense fallback={null}>
                {activeUserModal === "profile" && (
                    <ProfileModal onClose={() => setActiveUserModal(null)} />
                )}
                {activeUserModal === "history" && (
                    <PaymentHistoryModal onClose={() => setActiveUserModal(null)} />
                )}
                {activeUserModal === "membership" && (
                    <GymMembershipModal onClose={() => setActiveUserModal(null)} />
                )}
                {activeUserModal === "contact" && (
                    <ContactUsModal onClose={() => setActiveUserModal(null)} />
                )}
            </Suspense>
        </>
    );
}
