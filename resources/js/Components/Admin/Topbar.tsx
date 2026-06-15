import { Link, router, usePage } from "@inertiajs/react";
import axios from "axios";
import {
    AlertCircle,
    ArrowRight,
    BadgeCheck,
    BarChart3,
    Bell,
    CalendarCheck2,
    CalendarRange,
    Check,
    ChevronDown,
    CircleHelp,
    Clock3,
    Command,
    Dumbbell,
    FileText,
    Film,
    ImagePlus,
    LayoutDashboard,
    LifeBuoy,
    LogOut,
    Menu,
    MessageSquare,
    Newspaper,
    Package,
    RefreshCw,
    Search,
    Settings,
    ShieldCheck,
    Sparkles,
    UserCog,
    UserRound,
    Users2,
    X,
    type LucideIcon,
} from "lucide-react";
import {
    KeyboardEvent,
    MouseEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { PageProps } from "@/types";
import { cn } from "@/lib/utils";
import ProfileModal, { type AdminProfileTab } from "./ProfileModal";

interface TopbarProps {
    onMobileMenuClick: () => void;
}

type SearchKind = "page" | "action" | "report" | "setting";
type NotificationTone = "info" | "success" | "warning" | "critical";
type NotificationTab = "all" | "unread" | "important";

interface SearchItem {
    id: string;
    title: string;
    description: string;
    routeName?: string;
    href?: string;
    group: string;
    kind: SearchKind;
    keywords: string[];
    icon: LucideIcon;
}

interface NotificationItem {
    id: string;
    title: string;
    description: string;
    time: string;
    read: boolean;
    important?: boolean;
    tone: NotificationTone;
    source?: string;
    href?: string;
    actionLabel?: string;
}

interface AdminNotificationsPayload {
    items: NotificationItem[];
    unread_count: number;
    important_count: number;
    generated_at: string;
}

const RECENT_SEARCH_KEY = "ubsc_admin_recent_searches";

function safeRoute(name: string, params?: Record<string, unknown>): string | undefined {
    try {
        return params ? route(name, params) : route(name);
    } catch {
        return undefined;
    }
}

function isCurrent(pattern: string): boolean {
    try {
        return route().current(pattern) ?? false;
    } catch {
        return false;
    }
}

const pageRegistry: SearchItem[] = [
    {
        id: "dashboard",
        title: "Dashboard",
        description: "Ringkasan performa, okupansi, pendapatan, dan aktivitas terbaru.",
        routeName: "admin.dashboard",
        group: "Main",
        kind: "page",
        keywords: ["home", "overview", "analytics", "ringkasan"],
        icon: LayoutDashboard,
    },
    {
        id: "identity",
        title: "Identity Queue",
        description: "Verifikasi identitas member dan dokumen pengguna.",
        routeName: "admin.identity.index",
        group: "Operations",
        kind: "page",
        keywords: ["identity", "verify", "approval", "dokumen", "user"],
        icon: BadgeCheck,
    },
    {
        id: "facilities",
        title: "Facilities",
        description: "Kelola fasilitas, status aktif, media, dan metadata publik.",
        routeName: "admin.facilities.index",
        group: "Operations",
        kind: "page",
        keywords: ["fasilitas", "venue", "lapangan", "gym", "pricing"],
        icon: Dumbbell,
    },
    {
        id: "facility-create",
        title: "Tambah Facility",
        description: "Buat fasilitas baru untuk katalog dan sistem reservasi.",
        routeName: "admin.facilities.create",
        group: "Quick Actions",
        kind: "action",
        keywords: ["create", "new", "fasilitas", "tambah"],
        icon: Dumbbell,
    },
    {
        id: "bookings",
        title: "Bookings",
        description: "Pantau reservasi, jadwal pelanggan, dan status booking.",
        routeName: "admin.bookings.index",
        group: "Operations",
        kind: "page",
        keywords: ["booking", "reservasi", "schedule", "pelanggan"],
        icon: CalendarCheck2,
    },
    {
        id: "memberships",
        title: "Memberships",
        description: "Kelola anggota aktif, masa berlaku, dan status membership.",
        routeName: "admin.memberships.index",
        group: "Customers",
        kind: "page",
        keywords: ["member", "membership", "anggota", "customer"],
        icon: Users2,
    },
    {
        id: "membership-plans",
        title: "Paket Membership",
        description: "Atur paket, harga, durasi, benefit, dan urutan tampil.",
        routeName: "admin.memberships.plans.index",
        group: "Customers",
        kind: "setting",
        keywords: ["plan", "paket", "membership", "pricing"],
        icon: Package,
    },
    {
        id: "finance",
        title: "Finance Overview",
        description: "Analisis transaksi, pendapatan, export, dan laporan finansial.",
        routeName: "admin.finance.index",
        group: "Finance",
        kind: "report",
        keywords: ["finance", "laporan", "revenue", "transaction", "payment"],
        icon: BarChart3,
    },
    {
        id: "news",
        title: "News",
        description: "Kelola artikel, kategori berita, dan banner informasi.",
        routeName: "admin.news.index",
        group: "Content",
        kind: "page",
        keywords: ["artikel", "berita", "news", "banner", "content"],
        icon: Newspaper,
    },
    {
        id: "news-create",
        title: "Tulis Artikel Baru",
        description: "Buka editor untuk membuat artikel publik baru.",
        routeName: "admin.news.create",
        group: "Quick Actions",
        kind: "action",
        keywords: ["write", "create", "news", "artikel", "blog"],
        icon: FileText,
    },
    {
        id: "promo",
        title: "Carousel Promo",
        description: "Kelola slide promo, urutan tampil, dan status publik.",
        routeName: "admin.promo.index",
        group: "Content",
        kind: "page",
        keywords: ["promo", "carousel", "banner", "slide"],
        icon: ImagePlus,
    },
    {
        id: "sponsors",
        title: "Sponsors",
        description: "Atur logo sponsor dan urutan tampil di halaman publik.",
        routeName: "admin.sponsors.index",
        group: "Content",
        kind: "page",
        keywords: ["sponsor", "logo", "partner"],
        icon: Sparkles,
    },
    {
        id: "reels",
        title: "Video Reels",
        description: "Kelola video pendek, thumbnail, dan status publikasi.",
        routeName: "admin.reels.index",
        group: "Content",
        kind: "page",
        keywords: ["video", "reel", "thumbnail", "media"],
        icon: Film,
    },
    {
        id: "testimonials",
        title: "Testimonials & Reviews",
        description: "Moderasi review publik dan kurasi testimoni.",
        routeName: "admin.testimonials.index",
        group: "Content",
        kind: "page",
        keywords: ["review", "testimonial", "ulasan", "rating"],
        icon: MessageSquare,
    },
    {
        id: "schedule-control",
        title: "Schedule Control",
        description: "Kontrol jadwal buka, tanggal tutup, dan slot operasional.",
        routeName: "admin.settings.schedules",
        group: "Settings",
        kind: "setting",
        keywords: ["schedule", "jadwal", "closed dates", "calendar"],
        icon: CalendarRange,
    },
    {
        id: "roles",
        title: "Role & Access",
        description: "Kelola role, permission, dan akses staf internal.",
        routeName: "admin.settings.roles",
        group: "Settings",
        kind: "setting",
        keywords: ["role", "permission", "access", "security"],
        icon: ShieldCheck,
    },
    {
        id: "users",
        title: "Internal Users",
        description: "Kelola akun staf, role, dan akses dashboard admin.",
        routeName: "admin.settings.users",
        group: "Settings",
        kind: "setting",
        keywords: ["staff", "admin", "user", "internal"],
        icon: UserCog,
    },
];

const pageTitleMap = [
    { pattern: "admin.dashboard", title: "Dashboard", section: "Command Center" },
    { pattern: "admin.identity.*", title: "Identity Queue", section: "Operations" },
    { pattern: "admin.facilities.pricing", title: "Facility Pricing", section: "Operations" },
    { pattern: "admin.facilities.*", title: "Facilities", section: "Operations" },
    { pattern: "admin.bookings.*", title: "Bookings", section: "Operations" },
    { pattern: "admin.memberships.plans.*", title: "Membership Plans", section: "Customers" },
    { pattern: "admin.memberships.*", title: "Memberships", section: "Customers" },
    { pattern: "admin.finance.*", title: "Finance Overview", section: "Finance" },
    { pattern: "admin.news.*", title: "News", section: "Content" },
    { pattern: "admin.promo.*", title: "Carousel Promo", section: "Content" },
    { pattern: "admin.sponsors.*", title: "Sponsors", section: "Content" },
    { pattern: "admin.reels.*", title: "Video Reels", section: "Content" },
    { pattern: "admin.testimonials.*", title: "Testimonials", section: "Content" },
    { pattern: "admin.settings.schedules", title: "Schedule Control", section: "Settings" },
    { pattern: "admin.settings.roles", title: "Role & Access", section: "Settings" },
    { pattern: "admin.settings.users", title: "Internal Users", section: "Settings" },
];

function getInitials(name?: string | null): string {
    return (name ?? "Guest")
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function resolveHref(item: SearchItem): string | undefined {
    return item.href ?? (item.routeName ? safeRoute(item.routeName) : undefined);
}

function getStoredRecentSearches(): SearchItem[] {
    if (typeof window === "undefined") return [];

    try {
        const storedIds = JSON.parse(
            window.localStorage.getItem(RECENT_SEARCH_KEY) ?? "[]",
        ) as string[];

        return storedIds
            .map((id) => pageRegistry.find((item) => item.id === id))
            .filter((item): item is SearchItem => Boolean(item && resolveHref(item)));
    } catch {
        return [];
    }
}

function getKindLabel(kind: SearchKind): string {
    if (kind === "action") return "Action";
    if (kind === "report") return "Report";
    if (kind === "setting") return "Setting";
    return "Page";
}

function notificationToneClasses(tone: NotificationTone): string {
    if (tone === "success") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    if (tone === "warning") return "bg-amber-50 text-amber-700 ring-amber-100";
    if (tone === "critical") return "bg-rose-50 text-rose-700 ring-rose-100";
    return "bg-sky-50 text-sky-700 ring-sky-100";
}

function buildInitialNotifications(
    flash?: PageProps["flash"],
    announcements?: string[],
): NotificationItem[] {
    const items: NotificationItem[] = [];

    if (flash?.success) {
        items.push({
            id: `success-${flash.success}`,
            title: "Action completed",
            description: flash.success,
            time: "Just now",
            read: false,
            tone: "success",
        });
    }

    if (flash?.error) {
        items.push({
            id: `error-${flash.error}`,
            title: "Attention required",
            description: flash.error,
            time: "Just now",
            read: false,
            important: true,
            tone: "critical",
        });
    }

    (announcements ?? []).forEach((announcement, index) => {
        items.push({
            id: `announcement-${index}-${announcement}`,
            title: "System announcement",
            description: announcement,
            time: "Today",
            read: false,
            important: index === 0,
            tone: index === 0 ? "warning" : "info",
        });
    });

    return items;
}

function getNotificationPayloadItems(
    payload?: AdminNotificationsPayload,
    flash?: PageProps["flash"],
    announcements?: string[],
): NotificationItem[] {
    return payload?.items ?? buildInitialNotifications(flash, announcements);
}

function SearchResultRow({
    item,
    active,
    onSelect,
}: {
    item: SearchItem;
    active: boolean;
    onSelect: (item: SearchItem) => void;
}) {
    const Icon = item.icon;

    return (
        <button
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
                "group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all duration-200",
                active
                    ? "border-orange-200 bg-orange-50/80 shadow-[0_12px_32px_rgba(249,115,22,0.12)]"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50",
            )}
        >
            <span
                className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-colors",
                    active
                        ? "bg-white text-orange-600 ring-orange-100"
                        : "bg-slate-100 text-slate-500 ring-slate-200 group-hover:bg-white group-hover:text-orange-600",
                )}
            >
                <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                    <span className="truncate font-clash text-sm font-semibold text-slate-900">
                        {item.title}
                    </span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        {getKindLabel(item.kind)}
                    </span>
                </span>
                <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                    {item.description}
                </span>
            </span>
            <ArrowRight
                size={16}
                className={cn(
                    "shrink-0 transition-all",
                    active
                        ? "translate-x-0 text-orange-500"
                        : "-translate-x-1 text-slate-300 group-hover:translate-x-0 group-hover:text-orange-500",
                )}
            />
        </button>
    );
}

export default function Topbar({ onMobileMenuClick }: TopbarProps) {
    const page = usePage<PageProps>();
    const { auth, flash, announcements, admin_notifications } = page.props;
    const user = auth.user;
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeResult, setActiveResult] = useState(0);
    const [recentSearches, setRecentSearches] = useState<SearchItem[]>([]);
    const [notificationOpen, setNotificationOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const [profileModalOpen, setProfileModalOpen] = useState(false);
    const [profileModalTab, setProfileModalTab] = useState<AdminProfileTab>("profile");
    const [notificationTab, setNotificationTab] = useState<NotificationTab>("all");
    const [notificationBusy, setNotificationBusy] = useState<"refresh" | "read" | "clear" | null>(null);
    const [notificationError, setNotificationError] = useState<string | null>(null);
    const [notificationSyncedAt, setNotificationSyncedAt] = useState<string | null>(
        admin_notifications?.generated_at ?? null,
    );
    const [notifications, setNotifications] = useState<NotificationItem[]>(() =>
        getNotificationPayloadItems(admin_notifications, flash, announcements),
    );

    const topbarRef = useRef<HTMLElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const initials = getInitials(user?.name);
    const role = user?.role ?? "Staff";
    const avatarUrl = user?.avatar_url ?? (user?.avatar ? `/storage/${user.avatar}` : null);

    const currentPage = useMemo(
        () =>
            pageTitleMap.find((item) => isCurrent(item.pattern)) ?? {
                title: "Admin Console",
                section: "UBSC Staff",
            },
        [page.url],
    );

    const searchableItems = useMemo(
        () => pageRegistry.filter((item) => Boolean(resolveHref(item))),
        [],
    );

    const quickActions = useMemo(
        () =>
            searchableItems.filter((item) =>
                ["facility-create", "news-create", "bookings", "finance"].includes(item.id),
            ),
        [searchableItems],
    );

    const searchResults = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return searchableItems.slice(0, 8);

        return searchableItems
            .map((item) => {
                const haystack = [
                    item.title,
                    item.description,
                    item.group,
                    item.kind,
                    ...item.keywords,
                ]
                    .join(" ")
                    .toLowerCase();

                const titleHit = item.title.toLowerCase().includes(normalized) ? 3 : 0;
                const keywordHit = item.keywords.some((keyword) =>
                    keyword.toLowerCase().includes(normalized),
                )
                    ? 2
                    : 0;
                const generalHit = haystack.includes(normalized) ? 1 : 0;

                return { item, score: titleHit + keywordHit + generalHit };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
            .map(({ item }) => item)
            .slice(0, 10);
    }, [query, searchableItems]);

    const visibleNotifications = useMemo(() => {
        if (notificationTab === "unread") {
            return notifications.filter((notification) => !notification.read);
        }

        if (notificationTab === "important") {
            return notifications.filter((notification) => notification.important);
        }

        return notifications;
    }, [notificationTab, notifications]);

    const unreadCount = notifications.filter((notification) => !notification.read).length;
    const importantCount = notifications.filter((notification) => notification.important).length;

    useEffect(() => {
        setRecentSearches(getStoredRecentSearches());
    }, []);

    useEffect(() => {
        if (!searchOpen) return;

        const id = window.setTimeout(() => {
            searchInputRef.current?.focus();
        }, 40);

        return () => window.clearTimeout(id);
    }, [searchOpen]);

    useEffect(() => {
        setActiveResult(0);
    }, [query, searchOpen]);

    useEffect(() => {
        setNotifications(getNotificationPayloadItems(admin_notifications, flash, announcements));
        setNotificationSyncedAt(admin_notifications?.generated_at ?? null);
        setNotificationError(null);
    }, [admin_notifications?.generated_at, flash?.success, flash?.error, announcements]);

    useEffect(() => {
        const onPointerDown = (event: PointerEvent) => {
            if (!topbarRef.current?.contains(event.target as Node)) {
                setNotificationOpen(false);
                setProfileOpen(false);
            }
        };

        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const isTypingTarget =
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.tagName === "SELECT" ||
                target?.isContentEditable;

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                openSearch();
                return;
            }

            if (!isTypingTarget && event.key === "/") {
                event.preventDefault();
                openSearch();
                return;
            }

            if (event.key === "Escape") {
                setSearchOpen(false);
                setNotificationOpen(false);
                setProfileOpen(false);
            }
        };

        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("keydown", onKeyDown);

        return () => {
            window.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, []);

    const openSearch = () => {
        setSearchOpen(true);
        setNotificationOpen(false);
        setProfileOpen(false);
    };

    const closeSearch = () => {
        setSearchOpen(false);
        setQuery("");
    };

    const selectSearchItem = (item: SearchItem) => {
        const href = resolveHref(item);
        if (!href) return;

        const nextRecentIds = [
            item.id,
            ...recentSearches.map((recent) => recent.id).filter((id) => id !== item.id),
        ].slice(0, 5);

        window.localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(nextRecentIds));
        setRecentSearches(
            nextRecentIds
                .map((id) => pageRegistry.find((registryItem) => registryItem.id === id))
                .filter((registryItem): registryItem is SearchItem => Boolean(registryItem)),
        );
        closeSearch();
        router.visit(href);
    };

    const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveResult((value) => Math.min(value + 1, Math.max(searchResults.length - 1, 0)));
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveResult((value) => Math.max(value - 1, 0));
        }

        if (event.key === "Enter" && searchResults[activeResult]) {
            event.preventDefault();
            selectSearchItem(searchResults[activeResult]);
        }
    };

    const applyNotificationPayload = (payload: AdminNotificationsPayload) => {
        setNotifications(payload.items);
        setNotificationSyncedAt(payload.generated_at);
        setNotificationError(null);
    };

    const refreshNotifications = async () => {
        const href = safeRoute("admin.notifications.index");
        if (!href) return;

        setNotificationBusy("refresh");

        try {
            const response = await axios.get<AdminNotificationsPayload>(href);
            applyNotificationPayload(response.data);
        } catch {
            setNotificationError("Notification center gagal disinkronkan.");
        } finally {
            setNotificationBusy(null);
        }
    };

    const persistReadNotifications = async (ids?: string[]) => {
        const href = safeRoute("admin.notifications.read");
        if (!href) return;

        const response = await axios.post<AdminNotificationsPayload>(href, ids ? { ids } : {});
        applyNotificationPayload(response.data);
    };

    const persistClearReadNotifications = async (ids?: string[]) => {
        const href = safeRoute("admin.notifications.clear-read");
        if (!href) return;

        const response = await axios.post<AdminNotificationsPayload>(href, ids ? { ids } : {});
        applyNotificationPayload(response.data);
    };

    const markAllRead = async () => {
        const snapshot = notifications;

        setNotificationBusy("read");
        setNotifications((items) => items.map((item) => ({ ...item, read: true })));

        try {
            await persistReadNotifications();
        } catch {
            setNotifications(snapshot);
            setNotificationError("Status dibaca belum tersimpan. Coba lagi.");
        } finally {
            setNotificationBusy(null);
        }
    };

    const clearRead = async () => {
        const snapshot = notifications;
        const readIds = notifications.filter((notification) => notification.read).map((notification) => notification.id);

        setNotificationBusy("clear");
        setNotifications((items) => items.filter((item) => !item.read));

        try {
            await persistClearReadNotifications(readIds);
        } catch {
            setNotifications(snapshot);
            setNotificationError("Notifikasi dibaca belum bisa dibersihkan.");
        } finally {
            setNotificationBusy(null);
        }
    };

    const openNotification = async (notification: NotificationItem) => {
        const snapshot = notifications;

        setNotifications((items) =>
            items.map((item) =>
                item.id === notification.id ? { ...item, read: true } : item,
            ),
        );

        try {
            await persistReadNotifications([notification.id]);
        } catch {
            setNotifications(snapshot);
            setNotificationError("Status notifikasi belum tersimpan.");
        }

        if (notification.href) {
            setNotificationOpen(false);
            router.visit(notification.href);
        }
    };

    const toggleNotifications = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setNotificationOpen((value) => {
            const next = !value;
            if (next) void refreshNotifications();

            return next;
        });
        setProfileOpen(false);
        setSearchOpen(false);
    };

    const toggleProfile = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setProfileOpen((value) => !value);
        setNotificationOpen(false);
        setSearchOpen(false);
    };

    const openProfileModal = (tab: AdminProfileTab) => {
        setProfileModalTab(tab);
        setProfileModalOpen(true);
        setProfileOpen(false);
        setNotificationOpen(false);
        setSearchOpen(false);
    };

    return (
        <header
            ref={topbarRef}
            className="sticky top-0 z-30 border-b border-white/70 bg-[#F8F9FA]/82 px-3 py-3 backdrop-blur-2xl supports-[backdrop-filter]:bg-[#F8F9FA]/72 sm:px-4 xl:px-8"
        >
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

            <div className="relative flex min-h-14 items-center gap-3">
                <button
                    type="button"
                    onClick={onMobileMenuClick}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-600 xl:hidden"
                    aria-label="Open sidebar"
                >
                    <Menu size={20} />
                </button>

                <div className="hidden min-w-0 flex-1 items-center gap-4 lg:flex">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            <span>Admin</span>
                            <span className="h-1 w-1 rounded-full bg-orange-400" />
                            <span className="truncate">{currentPage.section}</span>
                        </div>
                        <h1 className="mt-0.5 truncate font-clash text-xl font-semibold text-slate-950">
                            {currentPage.title}
                        </h1>
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        Online
                    </div>
                </div>

                <button
                    type="button"
                    onClick={openSearch}
                    className="group hidden h-12 min-w-[320px] flex-1 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-4 text-left shadow-[0_14px_40px_rgba(15,23,42,0.06)] ring-1 ring-white/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_18px_50px_rgba(15,23,42,0.09)] md:flex lg:max-w-[440px] lg:flex-none"
                    aria-label="Open global search"
                >
                    <Search
                        size={18}
                        className="shrink-0 text-slate-400 transition-colors group-hover:text-orange-500"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-500">
                        Search menu, booking, finance, content...
                    </span>
                    <span className="hidden items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] font-bold text-slate-500 sm:flex">
                        Ctrl K
                    </span>
                </button>

                <div className="ml-auto flex items-center gap-2 sm:gap-3">
                    <button
                        type="button"
                        onClick={openSearch}
                        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-200 hover:text-orange-600 md:hidden"
                        aria-label="Open global search"
                    >
                        <Search size={18} />
                    </button>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={toggleNotifications}
                            className={cn(
                                "relative flex h-11 w-11 items-center justify-center rounded-2xl border bg-white text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:text-orange-600",
                                notificationOpen
                                    ? "border-orange-200 ring-4 ring-orange-100/70"
                                    : "border-slate-200/80 hover:border-orange-200",
                            )}
                            aria-label="Open notification center"
                            aria-expanded={notificationOpen}
                        >
                            <Bell size={18} />
                            {unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-lg">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </button>

                        {notificationOpen && (
                            <div className="absolute right-0 top-14 z-50 w-[min(92vw,390px)] overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.18)] ring-1 ring-white/80 backdrop-blur-2xl">
                                <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-orange-50/60 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-clash text-base font-semibold text-slate-950">
                                                Notification Center
                                            </p>
                                            <p className="mt-1 text-xs font-medium text-slate-500">
                                                {notificationBusy === "refresh"
                                                    ? "Syncing latest admin signals..."
                                                    : unreadCount > 0
                                                      ? `${unreadCount} unread operational update${unreadCount > 1 ? "s" : ""}`
                                                      : "Everything is up to date"}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={refreshNotifications}
                                                disabled={notificationBusy === "refresh"}
                                                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-orange-200 hover:text-orange-600 disabled:cursor-wait disabled:opacity-60"
                                                aria-label="Refresh notifications"
                                            >
                                                <RefreshCw
                                                    size={15}
                                                    className={cn(
                                                        notificationBusy === "refresh" && "animate-spin",
                                                    )}
                                                />
                                            </button>
                                            <div className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                                                {importantCount} Important
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1">
                                        {(["all", "unread", "important"] as NotificationTab[]).map(
                                            (tab) => (
                                                <button
                                                    key={tab}
                                                    type="button"
                                                    onClick={() => setNotificationTab(tab)}
                                                    className={cn(
                                                        "rounded-xl px-3 py-2 text-xs font-bold capitalize transition-all",
                                                        notificationTab === tab
                                                            ? "bg-white text-slate-950 shadow-sm"
                                                            : "text-slate-500 hover:text-slate-800",
                                                    )}
                                                >
                                                    {tab}
                                                </button>
                                            ),
                                        )}
                                    </div>

                                    {notificationSyncedAt && (
                                        <p className="mt-3 text-[11px] font-semibold text-slate-400">
                                            Synced with backend
                                        </p>
                                    )}
                                </div>

                                <div className="max-h-[360px] overflow-y-auto p-2" data-lenis-prevent="true">
                                    {notificationError && (
                                        <div className="mb-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                                            {notificationError}
                                        </div>
                                    )}

                                    {visibleNotifications.length > 0 ? (
                                        <div className="space-y-1">
                                            {visibleNotifications.map((notification) => (
                                                <button
                                                    type="button"
                                                    key={notification.id}
                                                    onClick={() => void openNotification(notification)}
                                                    className="group flex w-full gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-slate-50"
                                                >
                                                    <span
                                                        className={cn(
                                                            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
                                                            notificationToneClasses(notification.tone),
                                                        )}
                                                    >
                                                        {notification.important ? (
                                                            <AlertCircle size={17} />
                                                        ) : (
                                                            <Bell size={16} />
                                                        )}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center gap-2">
                                                            {!notification.read && (
                                                                <span className="h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                                                            )}
                                                            <span className="truncate font-clash text-sm font-semibold text-slate-900">
                                                                {notification.title}
                                                            </span>
                                                        </span>
                                                        <span className="mt-1 block text-xs font-medium leading-5 text-slate-500">
                                                            {notification.description}
                                                        </span>
                                                        <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400">
                                                            <span className="inline-flex items-center gap-1.5">
                                                                <Clock3 size={12} />
                                                                {notification.time}
                                                            </span>
                                                            {notification.source && (
                                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                                    {notification.source}
                                                                </span>
                                                            )}
                                                            {notification.actionLabel && (
                                                                <span className="ml-auto text-[11px] font-bold text-orange-600 opacity-0 transition-opacity group-hover:opacity-100">
                                                                    {notification.actionLabel}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-6 py-10 text-center">
                                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                                <Bell size={20} />
                                            </div>
                                            <p className="mt-4 font-clash text-sm font-semibold text-slate-900">
                                                No notifications
                                            </p>
                                            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                                                Backend signals are clear. New booking, finance, identity, and content updates will appear here.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                                    <button
                                        type="button"
                                        onClick={() => void markAllRead()}
                                        disabled={!notifications.length || notificationBusy !== null}
                                        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-white hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <Check size={14} />
                                        {notificationBusy === "read" ? "Saving..." : "Mark read"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void clearRead()}
                                        disabled={
                                            !notifications.some((notification) => notification.read) ||
                                            notificationBusy !== null
                                        }
                                        className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 transition-colors hover:bg-white hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {notificationBusy === "clear" ? "Clearing..." : "Clear read"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="relative">
                        <button
                            type="button"
                            onClick={toggleProfile}
                            className={cn(
                                "group flex h-11 items-center gap-3 rounded-2xl border bg-white py-1.5 pl-1.5 pr-2 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5",
                                profileOpen
                                    ? "border-orange-200 ring-4 ring-orange-100/70"
                                    : "border-slate-200/80 hover:border-orange-200",
                            )}
                            aria-label="Open profile menu"
                            aria-expanded={profileOpen}
                        >
                            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-slate-950 via-navy-900 to-orange-700 font-clash text-[11px] font-semibold text-white shadow-inner">
                                {avatarUrl ? (
                                    <img
                                        src={avatarUrl}
                                        alt={user?.name ?? "Admin avatar"}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    initials
                                )}
                                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                            </span>
                            <span className="hidden min-w-0 text-left md:block">
                                <span className="block max-w-36 truncate font-clash text-sm font-semibold text-slate-950">
                                    {user?.name ?? "Guest"}
                                </span>
                                <span className="block max-w-36 truncate text-[11px] font-semibold text-slate-500">
                                    {role}
                                </span>
                            </span>
                            <ChevronDown
                                size={16}
                                className={cn(
                                    "hidden text-slate-400 transition-transform sm:block",
                                    profileOpen && "rotate-180",
                                )}
                            />
                        </button>

                        {profileOpen && (
                            <div className="absolute right-0 top-14 z-50 w-[min(92vw,340px)] overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.18)] ring-1 ring-white/80 backdrop-blur-2xl">
                                <div className="bg-gradient-to-br from-slate-950 via-navy-900 to-orange-800 p-4 text-white">
                                    <div className="flex items-center gap-3">
                                        <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/10 font-clash text-sm font-semibold ring-1 ring-white/20">
                                            {avatarUrl ? (
                                                <img
                                                    src={avatarUrl}
                                                    alt={user?.name ?? "Admin avatar"}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                initials
                                            )}
                                            <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-slate-950 bg-emerald-400" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate font-clash text-base font-semibold">
                                                {user?.name ?? "Guest"}
                                            </p>
                                            <p className="truncate text-xs font-medium text-white/70">
                                                {user?.email ?? "No email available"}
                                            </p>
                                            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-white/15">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                                                Active {role}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-2">
                                    <button
                                        type="button"
                                        onClick={() => openProfileModal("profile")}
                                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                                    >
                                        <UserRound size={17} className="text-slate-400" />
                                        Profile
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => openProfileModal("security")}
                                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                                    >
                                        <Settings size={17} className="text-slate-400" />
                                        Account settings
                                    </button>

                                    {safeRoute("admin.settings.roles") && (
                                        <Link
                                            href={safeRoute("admin.settings.roles") ?? "#"}
                                            className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                                        >
                                            <ShieldCheck size={17} className="text-slate-400" />
                                            Role & access
                                        </Link>
                                    )}

                                    <button
                                        type="button"
                                        disabled
                                        className="flex w-full cursor-not-allowed items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold text-slate-400"
                                    >
                                        <LifeBuoy size={17} />
                                        Help & support
                                    </button>
                                </div>

                                <div className="border-t border-slate-100 bg-slate-50/70 p-2">
                                    <Link
                                        href={safeRoute("ubsc-staff.logout") ?? "#"}
                                        method="post"
                                        as="button"
                                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-white px-4 py-3 text-sm font-bold text-rose-600 transition-all hover:border-rose-200 hover:bg-rose-50"
                                    >
                                        <LogOut size={17} />
                                        Log out
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {searchOpen && (
                <div
                    className="fixed inset-0 z-[70] bg-slate-950/35 px-3 py-6 backdrop-blur-sm sm:px-6"
                    onClick={closeSearch}
                >
                    <div
                        className="mx-auto flex max-h-[min(760px,92dvh)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)] ring-1 ring-slate-950/5"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Global admin search"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-white to-orange-50/70 p-4">
                            <div className="flex items-center gap-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_34px_rgba(15,23,42,0.25)]">
                                    <Command size={19} />
                                </span>
                                <div className="relative min-w-0 flex-1">
                                    <Search
                                        size={18}
                                        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-slate-400"
                                    />
                                    <input
                                        ref={searchInputRef}
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        onKeyDown={onSearchKeyDown}
                                        type="search"
                                        placeholder="Search admin pages, reports, bookings, membership..."
                                        className="w-full border-0 bg-transparent py-3 pl-8 pr-4 font-clash text-lg font-semibold text-slate-950 placeholder:text-slate-400 focus:ring-0"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={closeSearch}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                                    aria-label="Close search"
                                >
                                    <X size={19} />
                                </button>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                <span className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
                                    Enter to open
                                </span>
                                <span className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
                                    Up / Down to navigate
                                </span>
                                <span className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200">
                                    Esc to close
                                </span>
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4" data-lenis-prevent="true">
                            {!query.trim() && recentSearches.length > 0 && (
                                <div className="mb-5">
                                    <div className="mb-2 flex items-center justify-between px-1">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                            Recent search
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                window.localStorage.removeItem(RECENT_SEARCH_KEY);
                                                setRecentSearches([]);
                                            }}
                                            className="text-xs font-bold text-slate-400 transition-colors hover:text-rose-500"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {recentSearches.map((item) => (
                                            <SearchResultRow
                                                key={item.id}
                                                item={item}
                                                active={false}
                                                onSelect={selectSearchItem}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!query.trim() && (
                                <div className="mb-5">
                                    <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                        Quick actions
                                    </p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {quickActions.map((item) => (
                                            <SearchResultRow
                                                key={item.id}
                                                item={item}
                                                active={false}
                                                onSelect={selectSearchItem}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                                    {query.trim() ? "Search results" : "All admin destinations"}
                                </p>
                                {searchResults.length > 0 ? (
                                    <div className="space-y-2">
                                        {searchResults.map((item, index) => (
                                            <SearchResultRow
                                                key={item.id}
                                                item={item}
                                                active={activeResult === index}
                                                onSelect={selectSearchItem}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-slate-400 shadow-sm">
                                            <CircleHelp size={21} />
                                        </div>
                                        <p className="mt-4 font-clash text-sm font-semibold text-slate-900">
                                            No matching result
                                        </p>
                                        <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                                            Try keywords like booking, finance, member, facility, news, or role.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {profileModalOpen && (
                <ProfileModal
                    initialTab={profileModalTab}
                    onClose={() => setProfileModalOpen(false)}
                />
            )}
        </header>
    );
}
