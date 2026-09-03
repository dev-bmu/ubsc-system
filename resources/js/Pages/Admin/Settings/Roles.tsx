import { Head, router, usePage } from "@inertiajs/react";
import {
    Activity,
    BadgeCheck,
    Check,
    ChevronRight,
    CircleAlert,
    Crown,
    Images,
    HeartPulse,
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
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";
import "./Roles.css";

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
        label: "Konten & CMS",
        summary: "Atur berita, promo, sponsor, reels, dan publikasi.",
        icon: Sparkles,
        items: [
            { key: "manage-cms", label: "Mengelola Berita, Promo, Reels & Sponsor" },
            { key: "publish-news", label: "Mempublikasikan Artikel Berita" },
        ],
    },
    {
        id: "gallery",
        label: "Gallery",
        summary: "Kelola media, kurasi section, jadwal, dan publikasi Gallery.",
        icon: Images,
        items: [
            { key: "view-facility-gallery", label: "Melihat Gallery" },
            { key: "manage-facility-gallery", label: "Mengunggah & Mengubah Media Gallery" },
            { key: "publish-facility-gallery", label: "Meninjau, Menjadwalkan & Mempublikasikan" },
            { key: "delete-facility-gallery", label: "Menghapus Media Gallery Permanen" },
        ],
    },
    {
        id: "member",
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
        label: "Verifikasi UBSC",
        summary: "Validasi dokumen warga kampus sebelum akses khusus.",
        icon: BadgeCheck,
        items: [
            { key: "verify-identity", label: "Validasi Identitas Warga UB (Identity Queue)" },
        ],
    },
    {
        id: "operations",
        label: "System & Operations",
        summary: "Akses cockpit health, performance, integritas, keamanan, dan SLO.",
        icon: HeartPulse,
        items: [
            { key: "view-system-operations", label: "Melihat System Monitoring" },
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
    @media (prefers-reduced-motion: reduce) {
        .role-enter, .role-title-shine, .role-live-dot {
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
        tone: "from-[#FFAA92] via-[#E35336] to-[#9A3022]",
        note: "Kontrol laporan dan transaksi",
    },
    "Staff Central": {
        icon: Activity,
        tone: "from-[#F3947F] via-[#D84A30] to-[#85271C]",
        note: "Operasional pusat dan data",
    },
    "Staff Front Office": {
        icon: UsersRound,
        tone: "from-[#FFC0AE] via-[#E96B4F] to-[#A93625]",
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
        tone: "from-[#F08C78] via-[#E35336] to-[#8F2E20]",
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
    return (
        <button
            type="button"
            role="switch"
            aria-label={label}
            aria-checked={enabled}
            disabled={readOnly}
            onClick={onToggle}
            className={cn("access-switch", enabled && "is-on", readOnly && "is-readonly")}
        >
            <span className="access-switch__track" aria-hidden="true">
                <span className="access-switch__knob" />
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

    const meta = roleMeta(activeRole?.name);
    const ActiveIcon = meta.icon;

    return (
        <section className="access-hero role-enter">
            <div className="access-hero__mesh" aria-hidden="true" />
            <div className="access-hero__topline">
                <span className="access-hero__signal">
                    <i className="role-live-dot" aria-hidden="true" />
                    Access governance
                </span>
                <span className="access-hero__code">SEC / 01</span>
            </div>

            <div className="access-hero__body">
                <div className="access-hero__copy">
                    <span className="access-hero__eyebrow">Peran, izin, dan tanggung jawab</span>
                    <h2>
                        <span>Akses yang tegas.</span>
                        <span>Operasional tetap tenang.</span>
                    </h2>
                    <p>
                        Setiap role melihat hal yang memang dibutuhkan—jelas untuk operator,
                        mudah diaudit, dan aman saat tim terus bertumbuh.
                    </p>
                </div>

                <div className="access-hero__focus">
                    <div className="access-hero__focus-head">
                        <span className={cn("access-hero__focus-icon bg-gradient-to-br", meta.tone)}>
                            <ActiveIcon size={19} />
                        </span>
                        <div>
                            <small>{isAdmin ? "Sedang dikurasi" : "Hak akses Anda"}</small>
                            <strong>{activeRole?.name ?? "Tidak ada role"}</strong>
                        </div>
                        <span className="access-hero__percent">{currentPct}%</span>
                    </div>
                    <p>{meta.note}</p>
                    <div className="access-hero__progress" aria-label={`${currentPct}% izin aktif`}>
                        <span className={progressWidthClass(currentPct)} />
                    </div>
                </div>
            </div>

            <div className="access-hero__metrics">
                <div><span>Role terkelola</span><strong>{roles.length}</strong></div>
                <div><span>Akun internal</span><strong>{users}</strong></div>
                <div><span>Sedang aktif</span><strong>{online}</strong></div>
                <div><span>Izin tersedia</span><strong>{TOTAL_PERMISSIONS}</strong></div>
            </div>
        </section>
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
        <aside className="access-role-rail role-enter">
            <div className="access-role-rail__head">
                <div>
                    <span>Role internal</span>
                    <h2>Pilih ruang kerja</h2>
                </div>
                <div className="access-role-rail__arrows">
                    <button type="button" onClick={() => scrollRoles(-1)} aria-label="Scroll role ke kiri">
                        <ChevronRight size={14} className="rotate-180" />
                    </button>
                    <button type="button" onClick={() => scrollRoles(1)} aria-label="Scroll role ke kanan">
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            <div ref={scrollerRef} className="access-role-list role-scrollbar role-touch-scroll">
                <div className="access-role-option is-locked">
                    <span className="access-role-option__icon"><Crown size={14} /></span>
                    <span className="access-role-option__copy">
                        <strong>Administrator</strong>
                        <small>Akses penuh · terkunci</small>
                    </span>
                    <LockKeyhole size={13} className="access-role-option__arrow" />
                </div>

                {roles.map((role) => {
                    const active = role.id === activeRoleId;
                    const meta = roleMeta(role.name);
                    const Icon = meta.icon;
                    const count = localPerms[role.id]?.size ?? role.permissions.length;
                    const roleDirty = dirtyRoleIds.has(role.id);
                    const accessPct = percent(count, TOTAL_PERMISSIONS);

                    return (
                        <button
                            key={role.id}
                            type="button"
                            onClick={() => onSelect(role.id)}
                            className={cn("access-role-option", active && "is-active", roleDirty && "is-dirty")}
                        >
                            <span className={cn("access-role-option__icon bg-gradient-to-br", meta.tone)}>
                                <Icon size={14} />
                            </span>
                            <span className="access-role-option__copy">
                                <span className="access-role-option__title">
                                    <strong>{role.name}</strong>
                                    {roleDirty && <i>Belum disimpan</i>}
                                </span>
                                <small>{role.users_count} akun · {role.online_users_count} online</small>
                                <span className="access-role-option__progress" aria-hidden="true">
                                    <i className={progressWidthClass(accessPct)} />
                                </span>
                            </span>
                            <span className="access-role-option__count">
                                <strong>{count}</strong>
                                <small>izin</small>
                            </span>
                        </button>
                    );
                })}
            </div>

            <p className="access-role-rail__note">
                Perubahan disimpan terpisah untuk setiap role.
            </p>
        </aside>
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
    const currentPct = percent(count, TOTAL_PERMISSIONS);

    return (
        <section className="access-command role-enter">
            <div className="access-command__identity">
                <span className="access-command__shield"><ShieldCheck size={18} /></span>
                <div className="access-command__copy">
                    <span>{isAdmin ? "Kurasi hak akses" : "Akses yang diberikan"}</span>
                    <h2>{role?.name ?? "Tidak ada role"}</h2>
                    <p>{isAdmin ? "Aktifkan hanya izin yang diperlukan oleh pekerjaan role ini." : "Daftar ini hanya dapat dilihat."}</p>
                </div>
                <div className="access-command__score">
                    <strong>{count}<small>/{TOTAL_PERMISSIONS}</small></strong>
                    <span>izin aktif</span>
                </div>
            </div>

            <div className="access-command__progress" aria-label={`${currentPct}% izin aktif`}>
                <span className={progressWidthClass(currentPct)} />
            </div>

            <div className="access-command__toolbar">
                <label className="access-command__search">
                    <Search size={15} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari izin atau area kerja..." />
                </label>

                <div className="access-command__state">
                    <i className={dirty ? "is-dirty" : "is-synced"} aria-hidden="true" />
                    <span>{dirty ? "Ada perubahan" : saveStatus === "saved" ? "Tersimpan" : "Semua sinkron"}</span>
                </div>

                {isAdmin && (
                    <div className="access-command__actions">
                        <button type="button" onClick={onEnableAll} className="is-secondary">
                            <Check size={14} /> Semua izin
                        </button>
                        <button type="button" onClick={onReset} disabled={!dirty || saveStatus === "saving"} className="is-ghost">
                            <RotateCcw size={14} /> Reset
                        </button>
                        <button type="button" onClick={onSave} disabled={!dirty || saveStatus === "saving"} className="is-primary">
                            <Save size={14} />
                            {saveStatus === "saving" ? "Menyimpan..." : saveStatus === "saved" ? "Tersimpan" : "Simpan perubahan"}
                        </button>
                    </div>
                )}
            </div>
        </section>
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
            <section className="access-ledger-empty role-enter">
                <span><CircleAlert size={20} /></span>
                <div>
                    <h2>Izin tidak ditemukan</h2>
                    <p>Coba nama fitur, area kerja, atau kode izin yang lain.</p>
                </div>
            </section>
        );
    }

    return (
        <section className="access-ledger role-enter">
            <header className="access-ledger__head">
                <div>
                    <span>Matriks kewenangan</span>
                    <h2>Izin berdasarkan area kerja</h2>
                    <p>Setiap baris menjelaskan satu tindakan yang dapat dilakukan oleh role terpilih.</p>
                </div>
                <strong>{String(visibleGroups.length).padStart(2, "0")} area</strong>
            </header>

            <div className="access-ledger__body">
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
            </div>

            <footer className="access-ledger__foot">
                <span><ShieldCheck size={14} /> Prinsip akses minimum</span>
                <p>Berikan izin secukupnya agar pekerjaan tetap lancar tanpa membuka area yang tidak diperlukan.</p>
            </footer>
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
    const activePct = percent(activeCount, group.items.length);
    const Icon = group.icon;

    return (
        <article
            className={cn(
                "access-group role-enter",
                allOn && "is-complete",
                allOff && "is-empty",
                !allOn && !allOff && "is-partial",
                `role-delay-${Math.min(index, 5)}`,
            )}
        >
            <header className="access-group__head">
                <span className="access-group__icon"><Icon size={17} /></span>

                <div className="access-group__copy">
                    <span>Area {String(index + 1).padStart(2, "0")}</span>
                    <h3>{group.label}</h3>
                    <p>{group.summary}</p>
                </div>

                <div className="access-group__control">
                    <span className={cn("access-group__status", allOn && "is-complete", allOff && "is-empty")}>
                        <strong>{activeCount}</strong> dari {group.items.length} aktif
                    </span>
                    {!readOnly && (
                        <button type="button" onClick={() => onSetGroup(group, !allOn)} className="access-group__bulk">
                            {allOn ? "Nonaktifkan area" : "Aktifkan area"}
                        </button>
                    )}
                </div>
            </header>

            <div className="access-group__progress" aria-label={`${activePct}% izin area aktif`}>
                <span className={progressWidthClass(activePct)} />
            </div>

            <div className="access-group__permissions">
                {group.items.map((item, itemIndex) => {
                    const active = perms.has(item.key);

                    return (
                        <div key={item.key} className={cn("access-permission", active && "is-active")}>
                            <span className="access-permission__index">{String(itemIndex + 1).padStart(2, "0")}</span>
                            <span className="access-permission__signal" aria-hidden="true" />
                            <span className="access-permission__copy">
                                <strong>{item.label}</strong>
                                <small>{item.key}</small>
                            </span>
                            <span className="access-permission__state">{active ? "Diizinkan" : "Dibatasi"}</span>
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

            <div className="access-page flex flex-col overflow-x-hidden pb-20 pt-4 text-[0.94rem]">
                <RoleHero roles={roles} activeRole={sourceRole} currentCount={currentPerms.size} isAdmin={isAdmin} />

                <div className={cn("access-workspace", isAdmin && "is-admin")}>
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

                    <main className="access-main">
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
                            <div className="access-error role-enter">
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
