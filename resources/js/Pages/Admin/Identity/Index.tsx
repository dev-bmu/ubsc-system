import { Head, router, usePage } from "@inertiajs/react";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import {
    AlertTriangle,
    BadgeCheck,
    CheckCircle,
    Clock3,
    Eye,
    FileQuestion,
    ScanSearch,
    Search,
    ShieldCheck,
    Users,
    X,
    XCircle,
} from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import DataTable from "@/Components/Admin/DataTable";
import { IdentityStatusBadge } from "@/Components/Admin/StatusBadge";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type {
    IdentityCategory,
    IdentityStatus,
    IdentityUser,
    PageProps,
} from "@/types";

type Props = PageProps<{ users: IdentityUser[] }>;
type StatusFilter = "all" | IdentityStatus;

const helper = createColumnHelper<IdentityUser>();
const TERRACOTTA = "#E35336";
const ShinyTextBlack = ({
    text,
    speed = 3,
    className = "",
}: {
    text: string;
    speed?: number;
    className?: string;
}) => (
    <span
        className={`animate-shiny-black ${className}`}
        style={{ animationDuration: `${speed}s` }}
    >
        {text}
    </span>
);

const inputBase =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-[#F8B5A8] focus:ring-4 focus:ring-[#E35336]/10";
const labelBase =
    "font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400";

const GLOBAL_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo { font-family: 'BDO Grotesk', sans-serif; }

    @keyframes shinyBlackText {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
    }
    .animate-shiny-black {
        background: linear-gradient(120deg, #0f172a 35%, #cbd5e1 50%, #0f172a 65%);
        background-size: 200% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: shinyBlackText linear infinite;
    }
    @keyframes identityFadeInUp {
        from { opacity: 0; transform: translate3d(0, 24px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes identityScaleIn {
        from { opacity: 0; transform: scale(.96); }
        to { opacity: 1; transform: scale(1); }
    }
    @keyframes identityShimmerSweep {
        0% { transform: translateX(-110%); }
        100% { transform: translateX(210%); }
    }
    @keyframes identityIconGlow {
        0%, 100% { box-shadow: 0 14px 28px -18px rgba(227,83,54,.92); }
        50% { box-shadow: 0 18px 34px -18px rgba(227,83,54,1), 0 0 20px rgba(227,83,54,.18); }
    }
    @keyframes identityDotBreath {
        0%, 100% { opacity: .88; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.18); }
    }
    @keyframes identityDotHalo {
        0%, 100% { opacity: .18; transform: scale(.82); }
        50% { opacity: .45; transform: scale(1.5); }
    }
    @keyframes identityStatAura {
        0%, 100% { opacity: .38; transform: translate3d(0, 0, 0) scale(.96); }
        50% { opacity: .72; transform: translate3d(-6px, 7px, 0) scale(1.05); }
    }
    @keyframes identityStatLift {
        0%, 100% { transform: translate3d(0, 0, 0); }
        50% { transform: translate3d(0, -3px, 0); }
    }
    @keyframes identityStatSheen {
        0%, 78% { transform: translateX(-140%); opacity: 0; }
        84% { opacity: .55; }
        100% { transform: translateX(165%); opacity: 0; }
    }

    .identity-fade-in { animation: identityFadeInUp .65s cubic-bezier(.16,1,.3,1) forwards; opacity: 0; will-change: opacity, transform; }
    .identity-scale-in { animation: identityScaleIn .5s cubic-bezier(.16,1,.3,1) forwards; opacity: 0; }
    .identity-delay-80 { animation-delay: 80ms; }
    .identity-delay-140 { animation-delay: 140ms; }
    .identity-delay-200 { animation-delay: 200ms; }
    .identity-delay-260 { animation-delay: 260ms; }

    .identity-card-glint { position: relative; }
    .identity-card-glint::before {
        content: '';
        position: absolute;
        top: 0;
        left: 24px;
        right: 24px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.95), transparent);
        pointer-events: none;
        z-index: 1;
    }
    .identity-shimmer { position: relative; overflow: hidden; }
    .identity-shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        width: 58%;
        background: linear-gradient(105deg, transparent, rgba(255,255,255,.38), transparent);
        animation: identityShimmerSweep 1.1s ease-out .45s forwards;
        pointer-events: none;
        border-radius: inherit;
    }
    .identity-stat-card {
        animation:
            identityScaleIn .58s cubic-bezier(.16,1,.3,1) var(--stat-delay, 0ms) forwards,
            identityStatLift 7s ease-in-out calc(var(--stat-delay, 0ms) + 1100ms) infinite;
        opacity: 0;
        will-change: transform, opacity;
    }
    .identity-stat-card::after {
        content: '';
        position: absolute;
        inset: 0;
        width: 44%;
        border-radius: inherit;
        background: linear-gradient(105deg, transparent, rgba(255,255,255,.64), transparent);
        animation: identityStatSheen 6.4s ease-in-out calc(var(--stat-delay, 0ms) + 1600ms) infinite;
        pointer-events: none;
    }
    .identity-stat-aura {
        animation: identityStatAura 6.8s ease-in-out infinite;
        will-change: transform, opacity;
    }
    .identity-icon-glow { animation: identityIconGlow 3.5s ease-in-out infinite; }
    .identity-live-dot {
        position: relative;
        display: inline-block;
        flex-shrink: 0;
        border-radius: 999px;
        background: var(--dot-color, #E35336);
        box-shadow: 0 0 0 1px rgba(255,255,255,.75), 0 0 8px var(--dot-halo, rgba(227,83,54,.28));
        animation: identityDotBreath 2.8s ease-in-out infinite;
        will-change: transform, opacity;
        isolation: isolate;
    }
    .identity-live-dot::after {
        content: '';
        position: absolute;
        inset: -4px;
        z-index: -1;
        border-radius: inherit;
        background: var(--dot-halo, rgba(227,83,54,.22));
        animation: identityDotHalo 2.8s ease-in-out infinite;
        will-change: transform, opacity;
    }
    .identity-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.34) transparent;
    }
    .identity-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .identity-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .identity-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(227,83,54,.34);
        border: 1px solid rgba(255,255,255,.72);
        border-radius: 999px;
    }
    .identity-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(227,83,54,.58); }

`;

function ShinyIcon({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "identity-icon-glow relative flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F08C78] via-[#E35336] to-[#B93D2A] text-white shadow-[0_14px_28px_-18px_rgba(227,83,54,0.95)] [&_svg]:text-white",
                className,
            )}
        >
            {children}
            <span className="pointer-events-none absolute left-[7px] right-[7px] top-[5px] h-[4px] rounded-full bg-white/35 blur-[1px]" />
        </div>
    );
}

function LiveDot({
    color = TERRACOTTA,
    halo = "rgba(227,83,54,.26)",
    size = "sm",
}: {
    color?: string;
    halo?: string;
    size?: "xs" | "sm" | "md";
}) {
    const sizeClass =
        size === "md" ? "h-2.5 w-2.5" : size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2";

    return (
        <span
            className={cn("identity-live-dot", sizeClass)}
            style={{ "--dot-color": color, "--dot-halo": halo } as CSSProperties}
        />
    );
}

function initials(name: string) {
    return name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

function categoryLabel(category: IdentityCategory) {
    return category === "warga_kampus" ? "Warga UB" : "Umum";
}

function statusTone(status: IdentityStatus) {
    if (status === "verified") {
        return { color: "#10b981", halo: "rgba(16,185,129,.28)" };
    }
    if (status === "rejected") {
        return { color: "#f43f5e", halo: "rgba(244,63,94,.24)" };
    }
    if (status === "pending") {
        return { color: TERRACOTTA, halo: "rgba(227,83,54,.28)" };
    }
    return { color: "#94a3b8", halo: "rgba(148,163,184,.2)" };
}

function ProcessStep({
    index,
    title,
    detail,
}: {
    index: string;
    title: string;
    detail: string;
}) {
    return (
        <div className="rounded-2xl border border-white/14 bg-white/10 p-3 backdrop-blur-md">
            <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-[11px] font-bold text-[#B93D2A]">
                    {index}
                </span>
                <p className="font-clash text-sm font-semibold leading-tight text-white">{title}</p>
            </div>
            <p className="mt-2 font-bdo text-[11px] font-medium leading-relaxed text-white/68">
                {detail}
            </p>
        </div>
    );
}

interface StatCardProps {
    icon: ReactNode;
    label: string;
    value: number;
    total: number;
    tone: "terracotta" | "emerald" | "sky" | "rose";
    delay?: number;
}

const STAT_TONES: Record<
    StatCardProps["tone"],
    {
        card: string;
        dot: string;
        halo: string;
        label: string;
        iconBackground: string;
        glow: string;
        bar: string;
        surface: string;
    }
> = {
    terracotta: {
        card: "border-[#F8B5A8]/80 bg-[linear-gradient(135deg,#FFF7F5_0%,#FFFFFF_58%,#FFE4DE_100%)] text-[#B93D2A]",
        dot: TERRACOTTA,
        halo: "rgba(227,83,54,.28)",
        label: "text-[#B93D2A]",
        iconBackground: "linear-gradient(135deg, #F08C78 0%, #E35336 52%, #B93D2A 100%)",
        glow: "bg-[#E35336]/16",
        bar: "from-[#F08C78] via-[#E35336] to-[#B93D2A]",
        surface: "bg-[#FFF1EE] text-[#B93D2A] border-[#F8B5A8]/70",
    },
    emerald: {
        card: "border-emerald-100 bg-[linear-gradient(135deg,#ECFDF5_0%,#FFFFFF_62%,#D1FAE5_100%)] text-emerald-700",
        dot: "#10b981",
        halo: "rgba(16,185,129,.28)",
        label: "text-emerald-700",
        iconBackground: "linear-gradient(135deg, #6ee7b7 0%, #10b981 52%, #047857 100%)",
        glow: "bg-emerald-500/14",
        bar: "from-emerald-300 via-emerald-500 to-emerald-700",
        surface: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    sky: {
        card: "border-sky-100 bg-[linear-gradient(135deg,#F0F9FF_0%,#FFFFFF_62%,#E0F2FE_100%)] text-sky-700",
        dot: "#0ea5e9",
        halo: "rgba(14,165,233,.28)",
        label: "text-sky-700",
        iconBackground: "linear-gradient(135deg, #7dd3fc 0%, #0ea5e9 52%, #0369a1 100%)",
        glow: "bg-sky-500/14",
        bar: "from-sky-300 via-sky-500 to-sky-700",
        surface: "bg-sky-50 text-sky-700 border-sky-200",
    },
    rose: {
        card: "border-rose-100 bg-[linear-gradient(135deg,#FFF1F2_0%,#FFFFFF_62%,#FFE4E6_100%)] text-rose-700",
        dot: "#f43f5e",
        halo: "rgba(244,63,94,.24)",
        label: "text-rose-700",
        iconBackground: "linear-gradient(135deg, #FDA4AF 0%, #F43F5E 52%, #BE123C 100%)",
        glow: "bg-rose-500/14",
        bar: "from-rose-300 via-rose-500 to-rose-700",
        surface: "bg-rose-50 text-rose-700 border-rose-200",
    },
};

function StatCard({ icon, label, value, total, tone, delay = 0 }: StatCardProps) {
    const styles = STAT_TONES[tone];
    const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
    const meterWidth = `${percentage}%`;

    return (
        <div
            className={cn(
                "group identity-stat-card identity-card-glint relative min-h-[172px] overflow-hidden rounded-[26px] border p-5 shadow-[0_18px_38px_-32px_rgba(15,23,42,.28)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_46px_-34px_rgba(227,83,54,.28)]",
                styles.card,
            )}
            style={{ "--stat-delay": `${delay}ms` } as CSSProperties}
        >
            <div className={cn("identity-stat-aura pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full blur-2xl", styles.glow)} />
            <div className="pointer-events-none absolute bottom-0 left-0 h-20 w-full bg-gradient-to-t from-white/70 to-transparent" />

            <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {label}
                    </p>
                    <p className="mt-3 font-clash text-[2.65rem] font-semibold leading-none text-slate-950 tabular-nums">
                        {value}
                    </p>
                </div>
                <div
                    className="identity-icon-glow relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-[0_16px_28px_-22px_rgba(15,23,42,.38)] [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-white"
                    style={{ background: styles.iconBackground }}
                >
                    {icon}
                    <span className="pointer-events-none absolute left-2 right-2 top-1.5 h-1 rounded-full bg-white/35 blur-[1px]" />
                </div>
            </div>

            <div className="relative z-10 mt-6">
                <div className="flex items-center justify-between gap-3">
                    <span className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5", styles.surface)}>
                        <LiveDot size="xs" color={styles.dot} halo={styles.halo} />
                        <span className={cn("font-bdo text-[10px] font-bold uppercase tracking-wider", styles.label)}>
                            Live
                        </span>
                    </span>
                    <span className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {percentage}% antrean
                    </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/90 ring-1 ring-slate-200/60">
                    <div
                        className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", styles.bar)}
                        style={{ width: meterWidth }}
                    />
                </div>
            </div>
        </div>
    );
}

interface LightboxState {
    user: IdentityUser;
    category: IdentityCategory;
}

function InfoTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
            <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-slate-400">
                {label}
            </p>
            <p className="mt-1 line-clamp-2 font-bdo text-[12px] font-semibold capitalize text-slate-700">
                {value}
            </p>
        </div>
    );
}

function DocLightbox({
    state,
    onClose,
}: {
    state: LightboxState;
    onClose: () => void;
}) {
    const { user } = state;
    const [category, setCategory] = useState<IdentityCategory>(state.category);
    const [loading, setLoading] = useState(false);
    const [imgError, setImgError] = useState(false);

    const submit = (status: "verified" | "rejected") => {
        setLoading(true);
        router.patch(
            route("admin.identity.verify", user.id),
            { status, identity_category: category },
            {
                onSuccess: onClose,
                onFinish: () => setLoading(false),
            },
        );
    };

    return (
        <>
            <div
                className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-md"
                onClick={onClose}
                aria-hidden="true"
            />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
                <div className="identity-card-glint relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-[30px] border border-white/60 bg-white shadow-[0_30px_100px_rgba(15,23,42,.22)]">
                    <div className="relative flex items-start justify-between gap-4 border-b border-slate-100 bg-[linear-gradient(135deg,#FFF7F5_0%,#FFFFFF_58%,#F8FAFC_100%)] px-4 py-4 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                            <ShinyIcon className="h-11 w-11">
                                <ShieldCheck size={17} />
                            </ShinyIcon>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-clash text-lg font-semibold leading-tight text-slate-950">
                                        {user.name}
                                    </p>
                                    <IdentityStatusBadge status={user.identity_status} />
                                </div>
                                <p className="mt-1 truncate font-bdo text-[12px] font-medium text-slate-500">
                                    {user.email}
                                    {user.phone_number ? ` - ${user.phone_number}` : ""}
                                    {" - "}
                                    Diajukan {user.updated_at}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 transition-all hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                            aria-label="Tutup preview dokumen"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="identity-scrollbar flex min-h-[320px] items-center justify-center overflow-auto bg-[radial-gradient(circle_at_20%_10%,rgba(227,83,54,.16),transparent_28%),linear-gradient(135deg,#111827_0%,#1f2937_100%)] p-3 sm:p-6">
                            {user.document_url && !imgError ? (
                                <img
                                    src={user.document_url}
                                    alt={`Dokumen identitas ${user.name}`}
                                    className="max-h-[64dvh] w-full rounded-2xl object-contain"
                                    onError={() => setImgError(true)}
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-8 py-12 text-white/70">
                                    <FileQuestion size={42} className="opacity-70" />
                                    <p className="font-bdo text-sm">
                                        {imgError
                                            ? "Gagal memuat dokumen."
                                            : "Tidak ada dokumen diunggah."}
                                    </p>
                                </div>
                            )}
                        </div>

                        <aside className="identity-scrollbar flex min-h-0 flex-col gap-5 overflow-y-auto bg-slate-50/70 p-5">
                            <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                                <p className={labelBase}>Nomor Identitas</p>
                                <p className="mt-2 break-all font-mono text-sm font-semibold tracking-wide text-slate-950">
                                    {user.identity_number ?? "Belum diisi"}
                                </p>
                            </div>

                            <div>
                                <label className={cn(labelBase, "mb-2 block")}>
                                    Kategori verifikasi
                                </label>
                                <select
                                    value={category}
                                    onChange={(event) =>
                                        setCategory(event.target.value as IdentityCategory)
                                    }
                                    className={inputBase}
                                >
                                    <option value="warga_kampus">Warga UB</option>
                                    <option value="umum">Umum</option>
                                </select>
                                {category !== state.category && (
                                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#B93D2A]">
                                        <AlertTriangle size={12} />
                                        Kategori akan diubah dari {categoryLabel(state.category)}.
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <InfoTile
                                    label="Kategori"
                                    value={categoryLabel(user.identity_category)}
                                />
                                <InfoTile label="Status" value={user.identity_status} />
                                <InfoTile
                                    label="Dokumen"
                                    value={user.has_document ? "Ada" : "Kosong"}
                                />
                                <InfoTile label="Update" value={user.updated_at} />
                            </div>

                            {user.identity_status === "pending" ? (
                                <div className="mt-auto grid gap-2 pt-2">
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() => submit("verified")}
                                        className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 py-3 font-bdo text-sm font-semibold text-white shadow-[0_14px_30px_-20px_rgba(16,185,129,.8)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <CheckCircle size={16} />
                                        Verifikasi identitas
                                    </button>
                                    <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() => submit("rejected")}
                                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3 font-bdo text-sm font-semibold text-rose-600 transition-all hover:-translate-y-0.5 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <XCircle size={16} />
                                        Tolak pengajuan
                                    </button>
                                </div>
                            ) : (
                                <p className="mt-auto rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center font-bdo text-xs font-semibold text-slate-500">
                                    Identitas ini sudah diproses.
                                </p>
                            )}
                        </aside>
                    </div>
                </div>
            </div>
        </>
    );
}

function RowActions({
    user,
    onViewDoc,
}: {
    user: IdentityUser;
    onViewDoc: (user: IdentityUser) => void;
}) {
    const [loading, setLoading] = useState(false);
    const isPending = user.identity_status === "pending";

    const verify = (status: "verified" | "rejected") => {
        setLoading(true);
        router.patch(
            route("admin.identity.verify", user.id),
            { status },
            { onFinish: () => setLoading(false) },
        );
    };

    return (
        <div className="flex items-center gap-1.5">
            {user.has_document && (
                <button
                    type="button"
                    onClick={() => onViewDoc(user)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-all hover:border-[#F8B5A8] hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                    title="Lihat dokumen"
                    aria-label={`Lihat dokumen ${user.name}`}
                >
                    <Eye size={14} />
                </button>
            )}

            {isPending && (
                <>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => verify("verified")}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 transition-all hover:bg-emerald-100 disabled:opacity-50"
                        title="Verifikasi"
                        aria-label={`Verifikasi ${user.name}`}
                    >
                        <CheckCircle size={14} />
                    </button>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => verify("rejected")}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600 transition-all hover:bg-rose-100 disabled:opacity-50"
                        title="Tolak"
                        aria-label={`Tolak ${user.name}`}
                    >
                        <XCircle size={14} />
                    </button>
                </>
            )}

            {!user.has_document && !isPending && (
                <span className="font-bdo text-xs text-slate-300">-</span>
            )}
        </div>
    );
}

function FilterButton({
    active,
    children,
    onClick,
}: {
    active: boolean;
    children: ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-2xl border px-3.5 font-bdo text-[12px] font-bold capitalize transition-all whitespace-nowrap",
                active
                    ? "border-[#F8B5A8] bg-[#FFF7F5] text-[#B93D2A] shadow-[0_14px_26px_-24px_rgba(227,83,54,.7)]"
                    : "border-slate-200 bg-white text-slate-500 hover:border-[#F8B5A8] hover:text-[#B93D2A]",
            )}
        >
            {active && <LiveDot size="xs" />}
            {children}
        </button>
    );
}

function IdentityMobileCard({
    user,
    onViewDoc,
}: {
    user: IdentityUser;
    onViewDoc: (user: IdentityUser) => void;
}) {
    const tone = statusTone(user.identity_status);

    return (
        <article className="identity-card-glint rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_32px_-28px_rgba(15,23,42,.35)]">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F08C78] via-[#E35336] to-[#B93D2A] font-clash text-sm font-semibold text-white">
                        {initials(user.name)}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate font-clash text-[15px] font-semibold text-slate-950">
                            {user.name}
                        </p>
                        <p className="truncate font-bdo text-[11px] font-medium text-slate-500">
                            {user.email}
                        </p>
                    </div>
                </div>
                <LiveDot color={tone.color} halo={tone.halo} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
                <InfoTile label="Kategori" value={categoryLabel(user.identity_category)} />
                <InfoTile label="Diajukan" value={user.updated_at} />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <IdentityStatusBadge status={user.identity_status} />
                <RowActions user={user} onViewDoc={onViewDoc} />
            </div>
        </article>
    );
}

function EmptyReviewState({ query }: { query: string }) {
    return (
        <div className="relative overflow-hidden px-5 py-16 text-center">
            <div className="pointer-events-none absolute left-1/2 top-8 h-40 w-40 -translate-x-1/2 rounded-full bg-[#FFF1EE] blur-3xl" />
            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-[#F08C78] via-[#E35336] to-[#B93D2A] text-white shadow-[0_18px_34px_-22px_rgba(227,83,54,.9)]">
                <ShieldCheck size={24} />
                <span className="pointer-events-none absolute left-3 right-3 top-2 h-1 rounded-full bg-white/35 blur-[1px]" />
            </div>
            <h3 className="relative mt-5 font-clash text-xl font-semibold text-slate-950">
                {query ? "Tidak ada data yang cocok" : "Antrean Warga UB sedang bersih"}
            </h3>
            <p className="relative mx-auto mt-2 max-w-md font-bdo text-sm leading-relaxed text-slate-500">
                {query
                    ? "Coba pakai nama, email, atau nomor identitas lain agar hasil pencarian lebih akurat."
                    : "Saat ada pengajuan verifikasi Warga UB, data akan muncul di sini lengkap dengan dokumen dan tombol keputusan."}
            </p>
        </div>
    );
}

export default function IdentityIndex() {
    const { users } = usePage<Props>().props;
    const [lightbox, setLightbox] = useState<LightboxState | null>(null);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    const pending = users.filter((user) => user.identity_status === "pending").length;
    const verified = users.filter((user) => user.identity_status === "verified").length;
    const rejected = users.filter((user) => user.identity_status === "rejected").length;

    const filteredUsers = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return users.filter((user) => {
            const matchesStatus =
                statusFilter === "all" || user.identity_status === statusFilter;
            const searchable = [
                user.name,
                user.email,
                user.phone_number ?? "",
                user.identity_number ?? "",
                categoryLabel(user.identity_category),
                user.identity_status,
            ]
                .join(" ")
                .toLowerCase();

            return (
                matchesStatus &&
                (!normalizedQuery || searchable.includes(normalizedQuery))
            );
        });
    }, [query, statusFilter, users]);

    const openLightbox = (user: IdentityUser) => {
        setLightbox({ user, category: user.identity_category });
    };

    const columns = [
        helper.accessor("name", {
            header: "Nama",
            enableSorting: true,
            cell: (info) => {
                const user = info.row.original;
                return (
                    <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F08C78] via-[#E35336] to-[#B93D2A] font-clash text-xs font-semibold text-white">
                            {initials(user.name)}
                        </div>
                        <div className="min-w-0">
                            <p className="truncate font-clash text-sm font-semibold leading-snug text-slate-950">
                                {user.name}
                            </p>
                            <p className="truncate font-bdo text-[11px] font-medium text-slate-400">
                                {user.email}
                            </p>
                        </div>
                    </div>
                );
            },
        }),
        helper.accessor("identity_category", {
            header: "Akses",
            cell: (info) => (
                <span
                    className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 font-bdo text-[11px] font-semibold",
                        info.getValue() === "warga_kampus"
                            ? "bg-[#FFF7F5] text-[#B93D2A] ring-1 ring-inset ring-[#F8B5A8]"
                            : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
                    )}
                >
                    <LiveDot
                        size="xs"
                        color={info.getValue() === "warga_kampus" ? TERRACOTTA : "#94a3b8"}
                        halo={
                            info.getValue() === "warga_kampus"
                                ? "rgba(227,83,54,.28)"
                                : "rgba(148,163,184,.2)"
                        }
                    />
                    {categoryLabel(info.getValue())}
                </span>
            ),
        }),
        helper.accessor("identity_number", {
            header: "No. Identitas",
            cell: (info) => (
                <span className="font-mono text-xs text-slate-600 tabular-nums">
                    {info.getValue() ?? <span className="text-slate-300">-</span>}
                </span>
            ),
        }),
        helper.accessor("updated_at", {
            header: "Diajukan",
            enableSorting: true,
            cell: (info) => (
                <span className="font-bdo text-xs font-medium text-slate-500">
                    {info.getValue()}
                </span>
            ),
        }),
        helper.accessor("identity_status", {
            header: "Status",
            cell: (info) => <IdentityStatusBadge status={info.getValue()} />,
        }),
        helper.display({
            id: "actions",
            header: "Aksi",
            cell: ({ row }) => (
                <RowActions user={row.original} onViewDoc={openLightbox} />
            ),
        }),
    ] as ColumnDef<IdentityUser, unknown>[];

    return (
        <AdminLayout
            header={
                <div className="flex flex-col gap-1 pt-4 animate-fade-in-up">
                    <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />
                    <span className="font-bdo text-[11px] font-medium tracking-wide text-[#E35336]">
                        Admin - Warga UB Verification
                    </span>
                    <h1 className="font-clash text-3xl font-bold uppercase tracking-tight xl:text-4xl">
                        <ShinyTextBlack text="Identity Queue" speed={5} />
                    </h1>
                </div>
            }
        >
            <Head title="Identity Queue" />

            <div className="flex flex-col gap-5 pb-20 pt-6">
                <section
                    className="identity-fade-in identity-card-glint relative overflow-hidden rounded-[30px] border border-[#F8B5A8]/60 p-5 text-white shadow-[0_24px_48px_-34px_rgba(227,83,54,.95)] sm:p-6"
                    style={{
                        background:
                            "radial-gradient(circle at 90% 4%, rgba(255,255,255,.34), transparent 30%), radial-gradient(circle at 8% 95%, rgba(248,181,168,.28), transparent 34%), linear-gradient(135deg, #E35336 0%, #B93D2A 54%, #7F2419 100%)",
                    }}
                >
                    <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-white/16" />
                    <div className="pointer-events-none absolute right-10 top-16 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
                    <div className="pointer-events-none absolute -bottom-24 left-8 h-56 w-56 rounded-full bg-[#F8B5A8]/20 blur-3xl" />

                    <div className="relative z-10">
                        <div className="flex min-h-[280px] flex-col justify-between gap-8">
                            <div>
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-widest text-white/90 backdrop-blur">
                                    <LiveDot size="xs" color="#ffffff" halo="rgba(255,255,255,.3)" />
                                    Antrean khusus verifikasi Warga UB
                                </div>
                                <h2 className="mt-5 max-w-4xl font-clash text-[2rem] font-semibold leading-[0.98] tracking-tight sm:text-[3rem] xl:text-[3.4rem]">
                                    Review dokumen Warga UB dengan alur yang tegas dan cepat.
                                </h2>
                                <p className="mt-4 max-w-2xl font-bdo text-sm font-medium leading-relaxed text-white/78 sm:text-base">
                                    Fokus halaman ini hanya untuk pengajuan Warga UB. Admin bisa menilai dokumen, melihat nomor identitas, dan mengambil keputusan tanpa berpindah halaman.
                                </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-3">
                                <ProcessStep index="01" title="Buka Dokumen" detail="Preview dokumen langsung di modal besar." />
                                <ProcessStep index="02" title="Validasi Data" detail="Cek email, nomor identitas, dan status." />
                                <ProcessStep index="03" title="Putuskan" detail="Verifikasi atau tolak dari tabel maupun modal." />
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                        icon={<Clock3 size={16} />}
                        label="Menunggu Review"
                        value={pending}
                        total={users.length}
                        tone="terracotta"
                        delay={80}
                    />
                    <StatCard
                        icon={<Users size={16} />}
                        label="Total Pengajuan"
                        value={users.length}
                        total={users.length}
                        tone="sky"
                        delay={140}
                    />
                    <StatCard
                        icon={<BadgeCheck size={16} />}
                        label="Terverifikasi"
                        value={verified}
                        total={users.length}
                        tone="emerald"
                        delay={200}
                    />
                    <StatCard
                        icon={<XCircle className="text-white" strokeWidth={2.7} />}
                        label="Ditolak"
                        value={rejected}
                        total={users.length}
                        tone="rose"
                        delay={260}
                    />
                </section>

                <section className="identity-fade-in identity-delay-200 identity-card-glint rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,.45)] sm:p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <ShinyIcon className="h-10 w-10">
                                <ScanSearch size={15} />
                            </ShinyIcon>
                            <div className="min-w-0">
                                <p className="font-clash text-base font-semibold leading-tight text-slate-950">
                                    Control Desk
                                </p>
                                <p className="mt-0.5 font-bdo text-[12px] font-medium text-slate-500">
                                    {filteredUsers.length} dari {users.length} pengajuan tampil
                                </p>
                            </div>
                        </div>

                        <div className="relative min-w-0 flex-1 xl:max-w-lg">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="search"
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Cari nama, email, nomor identitas..."
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 font-bdo text-sm text-slate-800 outline-none transition focus:border-[#F8B5A8] focus:bg-white focus:ring-4 focus:ring-[#E35336]/10"
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="identity-scrollbar flex gap-2 overflow-x-auto pb-1">
                            {(["all", "pending", "verified", "rejected"] as StatusFilter[]).map(
                                (status) => (
                                    <FilterButton
                                        key={status}
                                        active={statusFilter === status}
                                        onClick={() => setStatusFilter(status)}
                                    >
                                        {status === "all" ? "Semua Status" : status}
                                    </FilterButton>
                                ),
                            )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-[#F8B5A8]/70 bg-[#FFF7F5] px-3.5 py-2">
                            <LiveDot size="xs" />
                            <span className="font-bdo text-[11px] font-bold uppercase tracking-wider text-[#B93D2A]">
                                Mode Warga UB
                            </span>
                        </div>
                    </div>
                </section>

                <section id="identity-review-table" className="identity-fade-in identity-delay-260 hidden scroll-mt-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_14px_34px_-30px_rgba(15,23,42,.45)] md:block">
                    {filteredUsers.length > 0 ? (
                        <DataTable
                            columns={columns}
                            data={filteredUsers}
                            emptyMessage="Belum ada pengajuan identitas yang cocok dengan filter."
                        />
                    ) : (
                        <EmptyReviewState query={query} />
                    )}
                </section>

                <section id="identity-review-table-mobile" className="scroll-mt-6 md:hidden">
                    {filteredUsers.length > 0 ? (
                        <div className="identity-scrollbar grid max-h-[72dvh] gap-3 overflow-y-auto pr-1">
                            {filteredUsers.map((user) => (
                                <IdentityMobileCard
                                    key={user.id}
                                    user={user}
                                    onViewDoc={openLightbox}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-[26px] border border-slate-200 bg-white">
                            <EmptyReviewState query={query} />
                        </div>
                    )}
                </section>
            </div>

            {lightbox && (
                <DocLightbox state={lightbox} onClose={() => setLightbox(null)} />
            )}
        </AdminLayout>
    );
}
