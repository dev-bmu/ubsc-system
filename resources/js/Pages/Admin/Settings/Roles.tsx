import { Head, router, usePage } from "@inertiajs/react";
import {
    Activity,
    BadgeCheck,
    Check,
    ChevronRight,
    CircleAlert,
    Crown,
    LayoutDashboard,
    LockKeyhole,
    RotateCcw,
    Save,
    Search,
    Shield,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
    UsersRound,
    X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";

interface RoleData {
    id: number;
    name: string;
    permissions: string[];
    users_count: number;
    online_users_count: number;
}

interface PermissionItem {
    key: string;
    label: string;
}

interface PermissionGroup {
    id: string;
    letter: string;
    label: string;
    summary: string;
    icon: typeof Shield;
    items: PermissionItem[];
}

type Props = PageProps<{ roles: RoleData[] }>;
type SaveStatus = "idle" | "saving" | "saved" | "error";

const PERMISSION_GROUPS: PermissionGroup[] = [
    {
        id: "dashboard",
        letter: "A",
        label: "Beranda & Dasbor",
        summary: "Akses ringkasan operasional dan laporan.",
        icon: LayoutDashboard,
        items: [
            { key: "view-stats", label: "Melihat Statistik Dasbor" },
            { key: "view-reports", label: "Melihat Laporan Keuangan" },
        ],
    },
    {
        id: "booking",
        letter: "B",
        label: "Reservasi & Jadwal",
        summary: "Kontrol reservasi, kalender, dan batas booking.",
        icon: Activity,
        items: [
            { key: "view-bookings", label: "Melihat Daftar Reservasi" },
            { key: "manage-bookings", label: "Membuat, Mengubah & Membatalkan Reservasi" },
            { key: "manage-booking-limits", label: "Mengatur Batas & Jadwal Reservasi" },
        ],
    },
    {
        id: "facility",
        letter: "C",
        label: "Fasilitas & Lapangan",
        summary: "Kelola fasilitas, unit, harga, dan paket harga.",
        icon: SlidersHorizontal,
        items: [
            { key: "view-facilities", label: "Melihat Daftar Fasilitas" },
            { key: "manage-facilities", label: "Menambah, Mengubah & Menghapus Fasilitas" },
            { key: "manage-pricing", label: "Mengatur Harga & Diskon" },
        ],
    },
    {
        id: "cms",
        letter: "D",
        label: "Konten & CMS",
        summary: "Atur berita, promo, sponsor, reels, dan publikasi.",
        icon: Sparkles,
        items: [
            { key: "manage-cms", label: "Mengelola Berita, Promo, Reels & Sponsor" },
            { key: "publish-news", label: "Mempublikasikan Artikel Berita" },
        ],
    },
    {
        id: "member",
        letter: "E",
        label: "Member & Pelanggan",
        summary: "Akses member, pelanggan, dan payment link.",
        icon: UsersRound,
        items: [
            { key: "view-members", label: "Melihat Daftar Member & Pelanggan" },
            { key: "manage-members", label: "Mengelola Data Member" },
            { key: "manage-payment-links", label: "Membuat & Membatalkan Payment Link" },
        ],
    },
    {
        id: "identity",
        letter: "F",
        label: "Verifikasi UBSC",
        summary: "Validasi dokumen warga kampus sebelum akses khusus.",
        icon: BadgeCheck,
        items: [
            { key: "verify-identity", label: "Validasi Identitas Warga UB (Identity Queue)" },
        ],
    },
];

const ROLE_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo { font-family: 'BDO Grotesk', sans-serif; }

    @keyframes roleRise {
        from { opacity: 0; transform: translate3d(0, 22px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes roleShine {
        0% { background-position: -180% center; }
        100% { background-position: 220% center; }
    }
    @keyframes roleSweep {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(190%); }
    }
    @keyframes rolePulse {
        0%, 100% { opacity: .78; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.16); }
    }
    .role-enter { animation: roleRise .58s cubic-bezier(.16,1,.3,1) both; will-change: opacity, transform; }
    .role-title-shine {
        background: linear-gradient(115deg, #0f172a 34%, #cbd5e1 49%, #0f172a 64%);
        background-size: 220% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: roleShine 5s linear infinite;
    }
    .role-card-glint { position: relative; }
    .role-card-glint::before {
        content: "";
        position: absolute;
        top: 0;
        left: 18px;
        right: 18px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.96), transparent);
        pointer-events: none;
        z-index: 2;
    }
    .role-sheen { position: relative; overflow: hidden; }
    .role-sheen::after {
        content: "";
        position: absolute;
        inset-block: 0;
        width: 48%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.32), transparent);
        animation: roleSweep 1s ease-out .35s forwards;
        pointer-events: none;
    }
    .role-live-dot {
        display: inline-block;
        border-radius: 999px;
        animation: rolePulse 2.4s ease-in-out infinite;
        box-shadow: 0 0 0 1px rgba(255,255,255,.72), 0 0 13px currentColor;
    }
    .role-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.34) transparent;
    }
    .role-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .role-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .role-scrollbar::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(227,83,54,.32);
        border: 1px solid rgba(255,255,255,.85);
    }
    .role-touch-scroll {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-x: contain;
        touch-action: pan-x;
        scroll-snap-type: x proximity;
    }
    .role-delay-0 { animation-delay: 0ms; }
    .role-delay-1 { animation-delay: 60ms; }
    .role-delay-2 { animation-delay: 120ms; }
    .role-delay-3 { animation-delay: 180ms; }
    .role-delay-4 { animation-delay: 240ms; }
    .role-delay-5 { animation-delay: 300ms; }
    .role-grid-surface {
        background-image:
            radial-gradient(circle at 92% 8%, rgba(227,83,54,.16), transparent 28%),
            linear-gradient(90deg, rgba(227,83,54,.06) 1px, transparent 1px),
            linear-gradient(180deg, rgba(227,83,54,.045) 1px, transparent 1px),
            linear-gradient(135deg, #FFFFFF 0%, #FFF9F7 100%);
        background-size: auto, 22px 22px, 22px 22px, auto;
    }
    @media (prefers-reduced-motion: reduce) {
        .role-enter, .role-title-shine, .role-sheen::after, .role-live-dot {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
        }
    }
`;

const TOTAL_PERMISSIONS = PERMISSION_GROUPS.reduce((sum, group) => sum + group.items.length, 0);
const PROGRESS_WIDTH_CLASSES = [
    "w-0",
    "w-[5%]",
    "w-[10%]",
    "w-[15%]",
    "w-[20%]",
    "w-[25%]",
    "w-[30%]",
    "w-[35%]",
    "w-[40%]",
    "w-[45%]",
    "w-[50%]",
    "w-[55%]",
    "w-[60%]",
    "w-[65%]",
    "w-[70%]",
    "w-[75%]",
    "w-[80%]",
    "w-[85%]",
    "w-[90%]",
    "w-[95%]",
    "w-full",
];

const ROLE_META: Record<string, { icon: typeof Shield; tone: string; note: string }> = {
    Manager: {
        icon: Crown,
        tone: "from-[#F08C78] via-[#E35336] to-[#8F2E20]",
        note: "Koordinasi operasional utama",
    },
    Finance: {
        icon: ShieldCheck,
        tone: "from-emerald-500 to-emerald-700",
        note: "Kontrol laporan dan transaksi",
    },
    "Staff Central": {
        icon: Activity,
        tone: "from-sky-500 to-sky-700",
        note: "Operasional pusat dan data",
    },
    "Staff Front Office": {
        icon: UsersRound,
        tone: "from-amber-500 to-[#B93D2A]",
        note: "Pelayanan pelanggan harian",
    },
};

function buildLocalPerms(roles: RoleData[]): Record<number, Set<string>> {
    return Object.fromEntries(roles.map((role) => [role.id, new Set(role.permissions)])) as Record<number, Set<string>>;
}

function sortedPermissions(perms: Iterable<string>): string[] {
    return Array.from(perms).sort();
}

function samePermissions(a: Iterable<string>, b: Iterable<string>): boolean {
    return JSON.stringify(sortedPermissions(a)) === JSON.stringify(sortedPermissions(b));
}

function roleMeta(roleName?: string) {
    return ROLE_META[roleName ?? ""] ?? {
        icon: Shield,
        tone: "from-slate-600 to-slate-900",
        note: "Akses khusus sistem",
    };
}

function percent(value: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((value / total) * 100);
}

function progressWidthClass(value: number): string {
    const safeValue = Math.min(100, Math.max(0, value));
    return PROGRESS_WIDTH_CLASSES[Math.round(safeValue / 5)] ?? "w-0";
}

function ShinyIcon({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl",
                "bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white",
                "shadow-[0_18px_34px_-24px_rgba(227,83,54,.98),inset_0_1px_0_rgba(255,255,255,.22)]",
                className,
            )}
        >
            {children}
            <span className="pointer-events-none absolute left-2 right-2 top-1 h-1 rounded-full bg-white/35 blur-[1px]" />
        </div>
    );
}

function ToggleSwitch({
    enabled,
    readOnly,
    onToggle,
    label,
}: {
    enabled: boolean;
    readOnly?: boolean;
    onToggle: () => void;
    label: string;
}) {
    const switchClass = cn(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#E35336]/15",
        enabled
            ? "bg-[linear-gradient(135deg,#F08C78_0%,#E35336_58%,#B93D2A_100%)] shadow-[0_12px_22px_-17px_rgba(227,83,54,.95)]"
            : "bg-slate-200 shadow-inner hover:bg-slate-300",
        readOnly && "cursor-not-allowed opacity-70",
    );
    const knobClass = cn(
        "flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] shadow-sm transition",
        enabled ? "translate-x-5 text-[#B93D2A]" : "translate-x-0 text-slate-400",
    );

    if (enabled) {
        return (
            <button
                type="button"
                role="switch"
                aria-label={label}
                aria-checked="true"
                disabled={readOnly}
                onClick={onToggle}
                className={switchClass}
            >
                <span className={knobClass}>
                    <Check size={13} />
                </span>
            </button>
        );
    }

    return (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked="false"
            disabled={readOnly}
            onClick={onToggle}
            className={switchClass}
        >
            <span className={knobClass}>
                <X size={13} />
            </span>
        </button>
    );
}

function RoleHero({
    roles,
    activeRole,
    currentCount,
    isAdmin,
}: {
    roles: RoleData[];
    activeRole?: RoleData;
    currentCount: number;
    isAdmin: boolean;
}) {
    const online = roles.reduce((sum, role) => sum + role.online_users_count, 0);
    const users = roles.reduce((sum, role) => sum + role.users_count, 0);
    const currentPct = percent(currentCount, TOTAL_PERMISSIONS);

    return (
        <section className="role-enter role-card-glint role-sheen relative overflow-hidden rounded-[24px] border border-[#F8B5A8]/70 bg-[linear-gradient(135deg,#E35336_0%,#B93D2A_58%,#8F2E20_100%)] p-3.5 text-white shadow-[0_22px_44px_-34px_rgba(227,83,54,.95)]">
            <div className="pointer-events-none absolute -right-16 -top-24 h-60 w-60 rounded-full border border-white/18" />
            <div className="pointer-events-none absolute -bottom-28 left-12 h-48 w-48 rounded-full bg-[#F8B5A8]/18 blur-3xl" />

            <div className="relative z-10 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,.45fr)] xl:items-center">
                <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 font-bdo text-[9px] font-bold uppercase tracking-widest text-white/90 backdrop-blur">
                            <span className="role-live-dot h-1.5 w-1.5 bg-white text-white" />
                            Role access control
                        </span>
                        <HeroStat icon={<Shield size={13} />} label="Role" value={roles.length} />
                        <HeroStat icon={<UsersRound size={13} />} label="Akun" value={users} />
                        <HeroStat icon={<Activity size={13} />} label="Online" value={online} />
                    </div>
                    <h2 className="max-w-4xl font-clash text-2xl font-semibold leading-[1.03] tracking-tight sm:text-3xl xl:text-[2.35rem]">
                        Hak akses yang rapi, cepat dipahami, dan mudah dikendalikan.
                    </h2>
                    <p className="mt-2 max-w-3xl font-bdo text-xs font-semibold leading-5 text-white/74 sm:text-sm">
                        Pilih role, review grup izin, lalu simpan hanya saat perubahan sudah benar.
                    </p>
                </div>

                <div className="rounded-[20px] border border-white/18 bg-white/12 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.18)] backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="font-bdo text-[9px] font-bold uppercase tracking-[0.18em] text-white/58">
                                {isAdmin ? "Sedang diedit" : "Hak akses saya"}
                            </p>
                            <p className="mt-1 truncate font-clash text-xl font-semibold">{activeRole?.name ?? "Tidak ada role"}</p>
                            <p className="mt-0.5 truncate font-bdo text-[11px] font-semibold text-white/62">{roleMeta(activeRole?.name).note}</p>
                        </div>
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white font-clash text-sm font-semibold text-[#B93D2A]">
                            {currentPct}%
                        </div>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/16">
                        <div className={cn("h-full rounded-full bg-white transition-all", progressWidthClass(currentPct))} />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        {["Pilih role", "Review", "Simpan"].map((step, index) => (
                            <div key={step} className="rounded-[14px] border border-white/14 bg-white/10 px-2.5 py-2">
                                <p className="font-clash text-sm font-semibold">0{index + 1}</p>
                                <p className="mt-0.5 truncate font-bdo text-[9px] font-bold uppercase tracking-wide text-white/66">{step}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function HeroStat({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
    return (
        <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-white/78 backdrop-blur">
            {icon}
            <span>{label}</span>
            <span className="font-clash text-sm font-semibold text-white">{value}</span>
        </span>
    );
}

function RoleSelector({
    roles,
    activeRoleId,
    localPerms,
    dirtyRoleIds,
    onSelect,
}: {
    roles: RoleData[];
    activeRoleId: number;
    localPerms: Record<number, Set<string>>;
    dirtyRoleIds: Set<number>;
    onSelect: (id: number) => void;
}) {
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const scrollRoles = (direction: -1 | 1) => {
        scrollerRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });
    };

    return (
        <aside className="role-enter role-card-glint h-fit overflow-hidden rounded-[24px] border border-[#FFE0D8] bg-white shadow-[0_18px_42px_-38px_rgba(185,61,42,.58)]">
            <div className="role-grid-surface border-b border-[#FFE0D8] p-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                    <ShinyIcon className="h-9 w-9 rounded-[14px]">
                        <LockKeyhole size={15} />
                    </ShinyIcon>
                    <div className="min-w-0">
                        <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-[#B93D2A]/70">Pilih peran</p>
                        <h2 className="font-clash text-base font-semibold text-slate-950">Daftar Role</h2>
                    </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 xl:hidden">
                        <button
                            type="button"
                            onClick={() => scrollRoles(-1)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] border border-[#FFD5CD] bg-white text-[#B93D2A] shadow-sm"
                            aria-label="Scroll role ke kiri"
                        >
                            <ChevronRight size={14} className="rotate-180" />
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollRoles(1)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[12px] border border-[#FFD5CD] bg-white text-[#B93D2A] shadow-sm"
                            aria-label="Scroll role ke kanan"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>

            <div
                ref={scrollerRef}
                className="role-scrollbar role-touch-scroll flex max-w-full gap-2 overflow-x-auto scroll-smooth p-2.5 xl:max-h-[calc(100vh-220px)] xl:flex-col xl:overflow-x-hidden xl:overflow-y-auto"
            >
                <div className="w-[216px] shrink-0 rounded-[18px] border border-slate-200 bg-slate-50 p-2.5 xl:w-auto xl:min-w-0">
                    <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-[13px] bg-white text-slate-300 ring-1 ring-slate-200">
                            <Crown size={13} />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate font-clash text-[13px] font-semibold text-slate-400">Administrator</p>
                            <p className="font-bdo text-[10px] font-semibold text-slate-300">Akses penuh, terkunci</p>
                        </div>
                    </div>
                </div>

                {roles.map((role) => {
                    const active = role.id === activeRoleId;
                    const meta = roleMeta(role.name);
                    const Icon = meta.icon;
                    const count = localPerms[role.id]?.size ?? role.permissions.length;
                    const roleDirty = dirtyRoleIds.has(role.id);

                    return (
                        <button
                            key={role.id}
                            type="button"
                            onClick={() => onSelect(role.id)}
                            className={cn(
                                "w-[216px] shrink-0 rounded-[18px] border p-2.5 text-left transition xl:w-auto xl:min-w-0",
                                active
                                    ? "border-[#E35336] bg-[#FFF7F5] shadow-[0_18px_38px_-28px_rgba(227,83,54,.72)]"
                                    : "border-[#FFE0D8] bg-white hover:border-[#F8B5A8] hover:bg-[#FFF7F5]",
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <span className={cn("flex h-9 w-9 items-center justify-center rounded-[14px] bg-gradient-to-br text-white shadow-[0_14px_28px_-20px_rgba(15,23,42,.45)]", meta.tone)}>
                                    <Icon size={15} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="truncate font-clash text-[13px] font-semibold text-slate-950">{role.name}</p>
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            {roleDirty && (
                                                <span className="whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-bdo text-[9px] font-bold uppercase tracking-wide text-amber-700">
                                                    Belum simpan
                                                </span>
                                            )}
                                            {active && <ChevronRight size={15} className="text-[#B93D2A]" />}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 truncate font-bdo text-[10px] font-semibold text-slate-400">{meta.note}</p>
                                </div>
                            </div>
                            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                                <RoleMiniStat label="Izin" value={count} active={active} />
                                <RoleMiniStat label="Akun" value={role.users_count} active={active} />
                                <RoleMiniStat label="Online" value={role.online_users_count} active={active} />
                            </div>
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}

function RoleMiniStat({ label, value, active }: { label: string; value: number; active: boolean }) {
    return (
        <div className={cn("min-w-0 rounded-[13px] border px-2 py-1.5", active ? "border-[#FFD5CD] bg-white" : "border-slate-100 bg-slate-50")}>
            <p className="truncate font-clash text-sm font-semibold leading-none text-slate-950">{value}</p>
            <p className="mt-0.5 truncate font-bdo text-[8px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        </div>
    );
}

function CommandBar({
    role,
    count,
    dirty,
    saveStatus,
    isAdmin,
    query,
    setQuery,
    onEnableAll,
    onReset,
    onSave,
}: {
    role?: RoleData;
    count: number;
    dirty: boolean;
    saveStatus: SaveStatus;
    isAdmin: boolean;
    query: string;
    setQuery: (value: string) => void;
    onEnableAll: () => void;
    onReset: () => void;
    onSave: () => void;
}) {
    return (
        <section className="role-enter role-card-glint overflow-hidden rounded-[24px] border border-[#FFE0D8] bg-white shadow-[0_18px_42px_-38px_rgba(185,61,42,.48)]">
            <div className="role-grid-surface flex flex-col gap-3 border-b border-[#FFE0D8] p-3 2xl:grid 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
                <div className="grid min-w-0 grid-cols-[42px_minmax(0,1fr)] gap-3 sm:grid-cols-[46px_minmax(0,1fr)] sm:items-center">
                    <ShinyIcon className="h-10 w-10 rounded-[15px] sm:h-11 sm:w-11">
                        <ShieldCheck size={17} />
                    </ShinyIcon>
                    <div className="min-w-0">
                        <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-[#B93D2A]/70">
                            {isAdmin ? "Edit hak akses" : "Akses yang diberikan"}
                        </p>
                        <h2 className="font-clash text-xl font-semibold leading-tight text-slate-950 sm:text-2xl 2xl:truncate">{role?.name ?? "Tidak ada role"}</h2>
                        <p className="mt-0.5 max-w-2xl truncate font-bdo text-[11px] font-semibold text-slate-400">
                            Tekan status izin, review perubahan, lalu simpan.
                        </p>
                    </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 2xl:min-w-[570px] 2xl:grid-cols-[minmax(210px,1fr)_auto_auto_auto]">
                    <label className="flex h-10 min-w-0 items-center gap-2 rounded-[15px] border border-slate-200 bg-white/95 px-3 shadow-sm sm:col-span-3 2xl:col-span-1">
                        <Search size={14} className="shrink-0 text-slate-400" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Cari izin..."
                            className="min-w-0 flex-1 border-0 bg-transparent p-0 font-bdo text-[13px] font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                        />
                    </label>

                    {isAdmin && (
                        <>
                            <button
                                type="button"
                                onClick={onEnableAll}
                                className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-[15px] border border-[#FFD5CD] bg-[#FFF1EE] px-3 font-clash text-xs font-semibold text-[#B93D2A] transition hover:border-[#F8B5A8] hover:bg-[#FFE5DE] sm:px-4"
                            >
                                <Check size={14} />
                                Aktifkan
                            </button>
                            <button
                                type="button"
                                onClick={onReset}
                                disabled={!dirty || saveStatus === "saving"}
                                className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-[15px] border border-slate-200 bg-white px-3 font-clash text-xs font-semibold text-slate-600 transition hover:border-[#F8B5A8] hover:text-[#B93D2A] disabled:cursor-not-allowed disabled:opacity-45 sm:px-4"
                            >
                                <RotateCcw size={14} />
                                Reset
                            </button>
                            <button
                                type="button"
                                onClick={onSave}
                                disabled={!dirty || saveStatus === "saving"}
                                className={cn(
                                    "inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-[15px] px-3 font-clash text-xs font-semibold transition sm:px-5",
                                    dirty
                                        ? "bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95)] hover:-translate-y-0.5"
                                        : "cursor-not-allowed bg-slate-100 text-slate-400",
                                )}
                            >
                                <Save size={14} />
                                {saveStatus === "saving" ? "Menyimpan..." : saveStatus === "saved" ? "Tersimpan" : "Simpan"}
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid gap-2 p-3 md:grid-cols-3">
                <CommandStat label="Izin aktif" value={`${count}/${TOTAL_PERMISSIONS}`} tone="terracotta" />
                <CommandStat label="Status edit" value={dirty ? "Belum simpan" : "Sinkron"} tone={dirty ? "amber" : "emerald"} />
                <CommandStat label="Mode" value={isAdmin ? "Bisa edit" : "Read only"} tone="slate" />
            </div>
        </section>
    );
}

function CommandStat({ label, value, tone }: { label: string; value: string; tone: "terracotta" | "emerald" | "amber" | "slate" }) {
    const styles = {
        terracotta: "border-[#FFD5CD] bg-[#FFF7F5] text-[#B93D2A]",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
        slate: "border-slate-200 bg-slate-50 text-slate-600",
    }[tone];

    return (
        <div className={cn("rounded-[18px] border p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]", styles)}>
            <p className="font-bdo text-[9px] font-bold uppercase tracking-widest opacity-65">{label}</p>
            <p className="mt-0.5 font-clash text-lg font-semibold text-slate-950">{value}</p>
        </div>
    );
}

function PermissionGrid({
    perms,
    query,
    readOnly,
    onToggle,
    onSetGroup,
}: {
    perms: Set<string>;
    query: string;
    readOnly: boolean;
    onToggle: (key: string) => void;
    onSetGroup: (group: PermissionGroup, enabled: boolean) => void;
}) {
    const needle = query.trim().toLowerCase();
    const visibleGroups = PERMISSION_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
            if (!needle) return true;
            return `${group.label} ${group.summary} ${item.label} ${item.key}`.toLowerCase().includes(needle);
        }),
    })).filter((group) => group.items.length > 0);

    if (visibleGroups.length === 0) {
        return (
            <div className="role-enter rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                <CircleAlert className="mx-auto h-9 w-9 text-slate-300" />
                <p className="mt-3 font-clash text-base font-semibold text-slate-800">Izin tidak ditemukan</p>
                <p className="mt-1 font-bdo text-sm font-semibold text-slate-400">Coba kata kunci lain.</p>
            </div>
        );
    }

    return (
        <section className="grid gap-3 2xl:grid-cols-2">
            {visibleGroups.map((group, index) => (
                <PermissionGroupCard
                    key={group.id}
                    group={group}
                    perms={perms}
                    readOnly={readOnly}
                    onToggle={onToggle}
                    onSetGroup={onSetGroup}
                    index={index}
                />
            ))}
        </section>
    );
}

function PermissionGroupCard({
    group,
    perms,
    readOnly,
    onToggle,
    onSetGroup,
    index,
}: {
    group: PermissionGroup;
    perms: Set<string>;
    readOnly: boolean;
    onToggle: (key: string) => void;
    onSetGroup: (group: PermissionGroup, enabled: boolean) => void;
    index: number;
}) {
    const activeCount = group.items.filter((item) => perms.has(item.key)).length;
    const allOn = activeCount === group.items.length;
    const allOff = activeCount === 0;
    const Icon = group.icon;

    return (
        <article
            className={cn(
                "role-enter role-card-glint overflow-hidden rounded-[24px] border border-[#FFE0D8] bg-white shadow-[0_16px_38px_-36px_rgba(185,61,42,.48)]",
                `role-delay-${Math.min(index, 5)}`,
            )}
        >
            <div className="role-grid-surface border-b border-[#FFE0D8] p-3">
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border border-[#FFD5CD] bg-[#FFF1EE] text-[#B93D2A]">
                            <Icon size={16} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E35336] font-clash text-[9px] font-semibold text-white">
                                    {group.letter}
                                </span>
                                <h3 className="truncate font-clash text-base font-semibold text-slate-950">{group.label}</h3>
                            </div>
                            <p className="mt-0.5 font-bdo text-[11px] font-semibold leading-4 text-slate-500">{group.summary}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                "whitespace-nowrap rounded-full border px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide",
                                allOn
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : allOff
                                      ? "border-slate-200 bg-slate-50 text-slate-400"
                                      : "border-[#FFD5CD] bg-[#FFF1EE] text-[#B93D2A]",
                            )}
                        >
                            {activeCount}/{group.items.length} aktif
                        </span>
                        {!readOnly && (
                            <button
                                type="button"
                                onClick={() => onSetGroup(group, !allOn)}
                                className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-500 transition hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                            >
                                {allOn ? "Matikan" : "Semua"}
                            </button>
                        )}
                    </div>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white ring-1 ring-[#FFE0D8]">
                    <div
                        className={cn(
                            "h-full rounded-full bg-[linear-gradient(90deg,#E35336,#F08C78)] transition-all",
                            progressWidthClass(percent(activeCount, group.items.length)),
                        )}
                    />
                </div>
            </div>

            <div className="space-y-1.5 p-2">
                {group.items.map((item) => {
                    const active = perms.has(item.key);

                    return (
                        <div
                            key={item.key}
                            className={cn(
                                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition",
                                active
                                    ? "border-[#FFD5CD] bg-[#FFF9F7] shadow-[0_10px_24px_-22px_rgba(227,83,54,.42)]"
                                    : "border-slate-100 bg-white",
                            )}
                        >
                            <span className="flex min-w-0 items-start gap-3">
                                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", active ? "bg-[#E35336] shadow-[0_0_10px_rgba(227,83,54,.32)]" : "bg-slate-200")} />
                                <span>
                                    <span className={cn("block font-bdo text-[13px] font-semibold leading-5", active ? "text-slate-800" : "text-slate-400")}>{item.label}</span>
                                    <span className="mt-0.5 block font-bdo text-[10px] font-semibold text-slate-300">{item.key}</span>
                                </span>
                            </span>
                            <ToggleSwitch enabled={active} readOnly={readOnly} onToggle={() => onToggle(item.key)} label={item.label} />
                        </div>
                    );
                })}
            </div>
        </article>
    );
}

export default function RolesPage() {
    const { roles, auth } = usePage<Props>().props;
    const isAdmin = auth.user?.role === "Administrator";
    const [activeRoleId, setActiveRoleId] = useState<number>(() => roles[0]?.id ?? 0);
    const [localPerms, setLocalPerms] = useState<Record<number, Set<string>>>(() => buildLocalPerms(roles));
    const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
    const [query, setQuery] = useState("");

    const rolesFingerprint = useMemo(
        () => JSON.stringify(roles.map((role) => [role.id, sortedPermissions(role.permissions)])),
        [roles],
    );

    useEffect(() => {
        setLocalPerms(buildLocalPerms(roles));
        setSaveStatus("idle");
    }, [rolesFingerprint, roles]);

    useEffect(() => {
        if (roles.length > 0 && !roles.some((role) => role.id === activeRoleId)) {
            setActiveRoleId(roles[0].id);
        }
    }, [activeRoleId, roles]);

    const activeRole = roles.find((role) => role.id === activeRoleId) ?? roles[0];
    const ownRole = roles.find((role) => role.name === auth.user?.role) ?? roles[0];
    const currentPerms = isAdmin
        ? (activeRole ? localPerms[activeRole.id] ?? new Set<string>() : new Set<string>())
        : new Set<string>(ownRole?.permissions?.length ? ownRole.permissions : auth.user?.permissions ?? []);
    const sourceRole = isAdmin ? activeRole : ownRole;
    const dirty = Boolean(isAdmin && activeRole && !samePermissions(currentPerms, activeRole.permissions));
    const dirtyRoleIds = useMemo(
        () => new Set(roles.filter((role) => !samePermissions(localPerms[role.id] ?? [], role.permissions)).map((role) => role.id)),
        [localPerms, roles],
    );

    const togglePermission = (key: string) => {
        if (!isAdmin || !activeRole) return;
        setSaveStatus("idle");
        setLocalPerms((current) => {
            const next = new Set(current[activeRole.id] ?? []);
            next.has(key) ? next.delete(key) : next.add(key);

            return { ...current, [activeRole.id]: next };
        });
    };

    const setGroup = (group: PermissionGroup, enabled: boolean) => {
        if (!isAdmin || !activeRole) return;
        setSaveStatus("idle");
        setLocalPerms((current) => {
            const next = new Set(current[activeRole.id] ?? []);
            group.items.forEach((item) => {
                enabled ? next.add(item.key) : next.delete(item.key);
            });

            return { ...current, [activeRole.id]: next };
        });
    };

    const enableAll = () => {
        if (!isAdmin || !activeRole) return;
        setSaveStatus("idle");
        setLocalPerms((current) => ({
            ...current,
            [activeRole.id]: new Set(PERMISSION_GROUPS.flatMap((group) => group.items.map((item) => item.key))),
        }));
    };

    const resetRole = () => {
        if (!isAdmin || !activeRole) return;
        setSaveStatus("idle");
        setLocalPerms((current) => ({ ...current, [activeRole.id]: new Set(activeRole.permissions) }));
    };

    const save = () => {
        if (!isAdmin || !activeRole || !dirty) return;

        setSaveStatus("saving");
        router.put(
            route("admin.settings.roles.update", activeRole.id),
            { permissions: sortedPermissions(currentPerms) },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setSaveStatus("saved");
                    window.setTimeout(() => setSaveStatus("idle"), 2200);
                },
                onError: () => setSaveStatus("error"),
            },
        );
    };

    return (
        <AdminLayout
            header={
                <div className="flex flex-col gap-1 pt-3 role-enter">
                    <style dangerouslySetInnerHTML={{ __html: ROLE_STYLES }} />
                    <span className="font-bdo text-[10px] font-medium tracking-wide text-[#E35336]">
                        Pengaturan Sistem
                    </span>
                    <h1 className="font-clash text-2xl font-bold uppercase tracking-tight xl:text-3xl">
                        <span className="role-title-shine">Peran & Akses</span>
                    </h1>
                </div>
            }
        >
            <Head title="Role & Access" />

            <div className="flex flex-col gap-3.5 overflow-x-hidden pb-20 pt-4 text-[0.94rem]">
                <RoleHero roles={roles} activeRole={sourceRole} currentCount={currentPerms.size} isAdmin={isAdmin} />

                <div className={cn("grid gap-3.5", isAdmin && "xl:grid-cols-[300px_minmax(0,1fr)]")}>
                    {isAdmin && (
                        <RoleSelector
                            roles={roles}
                            activeRoleId={activeRoleId}
                            localPerms={localPerms}
                            dirtyRoleIds={dirtyRoleIds}
                            onSelect={(id) => {
                                setActiveRoleId(id);
                                setQuery("");
                                setSaveStatus("idle");
                            }}
                        />
                    )}

                    <main className="flex min-w-0 flex-col gap-3">
                        <CommandBar
                            role={sourceRole}
                            count={currentPerms.size}
                            dirty={dirty}
                            saveStatus={saveStatus}
                            isAdmin={isAdmin}
                            query={query}
                            setQuery={setQuery}
                            onEnableAll={enableAll}
                            onReset={resetRole}
                            onSave={save}
                        />

                        {saveStatus === "error" && (
                            <div className="role-enter flex items-start gap-3 rounded-[20px] border border-rose-200 bg-rose-50 p-3.5">
                                <CircleAlert size={18} className="mt-0.5 shrink-0 text-rose-600" />
                                <p className="font-bdo text-sm font-semibold leading-6 text-rose-700">
                                    Perubahan belum tersimpan. Periksa koneksi atau izin administrator, lalu coba lagi.
                                </p>
                            </div>
                        )}

                        <PermissionGrid
                            perms={currentPerms}
                            query={query}
                            readOnly={!isAdmin}
                            onToggle={togglePermission}
                            onSetGroup={setGroup}
                        />
                    </main>
                </div>
            </div>
        </AdminLayout>
    );
}
