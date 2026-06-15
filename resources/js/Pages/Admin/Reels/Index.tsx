import { Head, router, useForm, usePage } from "@inertiajs/react";
import {
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Eye,
    EyeOff,
    Film,
    Filter,
    MonitorPlay,
    Pencil,
    Play,
    Plus,
    Search,
    Sparkles,
    Trash2,
    UploadCloud,
    Video,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SingleDropzone, VideoDropzone } from "@/Components/Admin/ImageDropzone";
import SlideOver from "@/Components/Admin/SlideOver";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { AdminReelItem, PageProps } from "@/types";

type Props = PageProps<{ items: AdminReelItem[] }>;
type StatusFilter = "all" | "active" | "inactive";
const PAGE_SIZE = 8;

type FormData = {
    title: string;
    is_active: boolean;
    thumbnail: File | null;
    video: File | null;
    _method?: string;
};

const REEL_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo { font-family: 'BDO Grotesk', sans-serif; }

    @keyframes reelFadeUp {
        from { opacity: 0; transform: translate3d(0, 22px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes reelShine {
        0% { background-position: -190% center; }
        100% { background-position: 210% center; }
    }
    @keyframes reelSheen {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(175%); }
    }
    @keyframes reelDot {
        0%, 100% { opacity: .78; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.18); }
    }
    .reel-enter { animation: reelFadeUp .58s cubic-bezier(.16,1,.3,1) both; will-change: opacity, transform; }
    .reel-title-shine {
        background: linear-gradient(115deg, #0f172a 34%, #cbd5e1 49%, #0f172a 64%);
        background-size: 220% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: reelShine 5s linear infinite;
    }
    .reel-soft-shine {
        background: linear-gradient(115deg, rgba(255,255,255,.42), #ffffff 50%, rgba(255,255,255,.42));
        background-size: 220% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: reelShine 4s linear infinite;
    }
    .reel-card-glint { position: relative; }
    .reel-card-glint::before {
        content: "";
        position: absolute;
        top: 0;
        left: 20px;
        right: 20px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent);
        pointer-events: none;
        z-index: 2;
    }
    .reel-sheen { position: relative; overflow: hidden; }
    .reel-sheen::after {
        content: "";
        position: absolute;
        inset-block: 0;
        width: 55%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent);
        animation: reelSheen 1.05s ease-out .35s forwards;
        pointer-events: none;
    }
    .reel-live-dot {
        display: inline-block;
        border-radius: 999px;
        animation: reelDot 2.5s ease-in-out infinite;
        box-shadow: 0 0 0 1px rgba(255,255,255,.74), 0 0 13px currentColor;
    }
    .reel-input {
        border: 1px solid rgb(248 181 168 / .62);
        background: rgba(255,255,255,.86);
        color: #0f172a;
        outline: none;
        transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
    }
    .reel-input:focus {
        border-color: rgb(227 83 54 / .62);
        background: #fff;
        box-shadow: 0 0 0 4px rgb(227 83 54 / .10);
    }
    .reel-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.32) transparent;
    }
    .reel-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .reel-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .reel-scrollbar::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(227,83,54,.30);
        border: 1px solid rgba(255,255,255,.8);
    }
    .reel-touch-scroll {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: pan-y;
    }
    @media (prefers-reduced-motion: reduce) {
        .reel-enter, .reel-title-shine, .reel-soft-shine, .reel-sheen::after, .reel-live-dot {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
        }
    }
`;

const inputBase =
    "reel-input h-11 w-full rounded-[16px] px-3.5 font-bdo text-[13px] font-semibold placeholder:text-slate-400";
const labelBase =
    "mb-1.5 block font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500";

function ShinyIcon({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                "relative flex shrink-0 items-center justify-center rounded-[15px]",
                "bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white",
                "shadow-[0_18px_34px_-24px_rgba(227,83,54,.95),inset_0_1px_0_rgba(255,255,255,.2)]",
                className,
            )}
        >
            {children}
            <span className="pointer-events-none absolute left-2 right-2 top-1 h-1 rounded-full bg-white/30 blur-[1px]" />
        </div>
    );
}

function StatusPill({ active }: { active: boolean }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide",
                active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500",
            )}
        >
            <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-300")} />
            {active ? "Aktif" : "Nonaktif"}
        </span>
    );
}

function ActionButton({
    children,
    className,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button
            type="button"
            className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-[14px] border text-sm",
                "transition hover:-translate-y-0.5 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50",
                className,
            )}
            {...props}
        >
            {children}
        </button>
    );
}

function PreviewThumb({ item }: { item: AdminReelItem }) {
    return (
        <span className="flex h-11 min-w-[74px] items-center justify-center overflow-hidden rounded-[15px] border border-slate-200 bg-white px-2 py-2 shadow-sm sm:h-12 sm:min-w-[84px]">
            {item.thumbnail_url ? (
                <img src={item.thumbnail_url} alt="" className="h-full w-full rounded-xl object-contain" />
            ) : (
                <span className="flex h-full w-full items-center justify-center rounded-xl bg-[#FFF1EE] text-[#B93D2A]">
                    <Film size={18} />
                </span>
            )}
        </span>
    );
}

function ReelPublicStrip({
    items,
    active,
}: {
    items: AdminReelItem[];
    active: number;
}) {
    return (
        <div className="rounded-[20px] border border-white/28 bg-white/16 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.2)] backdrop-blur sm:rounded-[22px]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-white/58">Preview publik</p>
                    <p className="mt-1 font-clash text-[1rem] font-semibold leading-tight text-white sm:text-lg">
                        {active > 0 ? `${active} reel sedang tampil` : "Belum ada reel aktif"}
                    </p>
                </div>
                <div className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/22 bg-white px-2.5 py-1.5 font-bdo text-[0px] font-bold text-[#B93D2A] sm:gap-2 sm:px-3 sm:py-2 sm:text-[11px]">
                    <Eye size={14} />
                    <span className="hidden sm:inline">Live preview</span>
                </div>
            </div>

            <div className="reel-scrollbar reel-touch-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
                {items.length > 0 ? items.slice(0, 8).map((item) => (
                    <PreviewThumb key={item.id} item={item} />
                )) : (
                    <span className="flex h-12 min-w-[168px] items-center justify-center rounded-[15px] border border-dashed border-white/36 bg-white/12 px-4 font-bdo text-xs font-semibold text-white/62">
                        Belum ada video aktif
                    </span>
                )}
            </div>
        </div>
    );
}

function ReelForm({ item, onClose }: { item: AdminReelItem | null; onClose: () => void }) {
    const isEdit = item !== null;
    const { data, setData, post, processing, errors } = useForm<FormData>({
        title: item?.title ?? "",
        is_active: item?.is_active ?? true,
        thumbnail: null,
        video: null,
        ...(isEdit ? { _method: "PUT" } : {}),
    });

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const url = isEdit
            ? route("admin.reels.update", item!.id)
            : route("admin.reels.store");

        post(url, { forceFormData: true, preserveScroll: true, onSuccess: onClose });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-[20px] border border-[#F8B5A8]/65 bg-[linear-gradient(145deg,#FFFFFF_0%,#FFF7F5_100%)] p-3.5">
                <div className="flex items-start gap-3">
                    <ShinyIcon className="h-10 w-10">
                        <UploadCloud size={17} />
                    </ShinyIcon>
                    <div className="min-w-0">
                        <p className="font-clash text-base font-semibold text-slate-950">
                            {isEdit ? "Perbarui video reel" : "Video reel baru"}
                        </p>
                        <p className="mt-1 font-bdo text-xs font-medium leading-5 text-slate-500">
                            Upload thumbnail yang kuat dan video MP4/WebM agar konten publik siap diputar.
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <label htmlFor="reel_title" className={labelBase}>Judul Reel</label>
                <input
                    id="reel_title"
                    type="text"
                    value={data.title}
                    onChange={(event) => setData("title", event.target.value)}
                    placeholder="Contoh: Highlight Turnamen Basket"
                    className={inputBase}
                />
                {errors.title && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.title}</p>}
            </div>

            <label className="flex items-center justify-between gap-3 rounded-[18px] border border-[#F8B5A8]/60 bg-[#FFF7F5] px-3.5 py-3">
                <span>
                    <span className="block font-clash text-sm font-semibold text-slate-900">Tampilkan Publik</span>
                    <span className="block font-bdo text-[11px] font-medium text-slate-400">
                        {data.is_active ? "Reel masuk ke tampilan publik" : "Reel disimpan sebagai arsip"}
                    </span>
                </span>
                <input
                    type="checkbox"
                    checked={data.is_active}
                    onChange={(event) => setData("is_active", event.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-[#E35336] focus:ring-[#E35336]"
                    aria-label="Status aktif reel"
                />
            </label>

            <div className="rounded-[20px] border border-slate-200 bg-white p-2.5">
                <SingleDropzone
                    label="Thumbnail"
                    currentUrl={item?.thumbnail_url ?? null}
                    onFileSelect={(file) => setData("thumbnail", file)}
                />
                {errors.thumbnail && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.thumbnail}</p>}
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-white p-2.5">
                <VideoDropzone
                    label="File Video"
                    currentUrl={item?.video_url ?? null}
                    onFileSelect={(file) => setData("video", file)}
                />
                {errors.video && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.video}</p>}
            </div>

            <div className="grid gap-2 rounded-[18px] border border-slate-200 bg-slate-50/75 p-2.5 sm:grid-cols-3">
                {[
                    { label: "Mode", value: isEdit ? "Edit" : "Baru" },
                    { label: "Status", value: data.is_active ? "Aktif" : "Nonaktif" },
                    { label: "Video", value: data.video ? "Baru" : item?.video_url ? "Tersedia" : "Kosong" },
                ].map((meta) => (
                    <div key={meta.label} className="rounded-[15px] bg-white px-3 py-2 ring-1 ring-slate-200/70">
                        <p className="font-bdo text-[9px] font-bold uppercase tracking-wider text-slate-400">{meta.label}</p>
                        <p className="mt-0.5 truncate font-clash text-sm font-semibold text-slate-900">{meta.value}</p>
                    </div>
                ))}
            </div>

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-11 items-center justify-center rounded-[16px] border border-slate-200 bg-white px-5 font-clash text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                    Batal
                </button>
                <button
                    type="submit"
                    disabled={processing}
                    className="reel-sheen inline-flex h-11 items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_16px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <CheckCircle2 size={15} />
                    {processing ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah Reel"}
                </button>
            </div>
        </form>
    );
}

function ReelPreview({
    item,
    current,
    total,
    onPrevious,
    onNext,
}: {
    item: AdminReelItem | null;
    current: number;
    total: number;
    onPrevious: () => void;
    onNext: () => void;
}) {
    return (
        <div className="reel-card-glint relative overflow-hidden rounded-[22px] border border-white/18 bg-white/95 p-2 text-slate-950 shadow-[0_24px_50px_-36px_rgba(15,23,42,.55)] backdrop-blur sm:rounded-[26px] sm:p-2.5">
            <div className="relative h-[clamp(184px,52vw,244px)] overflow-hidden rounded-[18px] bg-[linear-gradient(145deg,#0f172a_0%,#1e293b_100%)] sm:h-[266px] sm:rounded-[20px] lg:h-[282px] xl:h-[300px]">
                {item?.thumbnail_url && (
                    <img
                        src={item.thumbnail_url}
                        alt=""
                        className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-45 blur-2xl"
                    />
                )}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.08),transparent_58%),linear-gradient(180deg,rgba(15,23,42,.12),rgba(15,23,42,.36))]" />
                {item?.video_url ? (
                    <video
                        src={item.video_url}
                        poster={item.thumbnail_url ?? undefined}
                        controls
                        playsInline
                        preload="metadata"
                        className="relative z-10 h-full w-full object-contain"
                    />
                ) : item?.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="relative z-10 h-full w-full object-contain" />
                ) : (
                    <div className="relative z-10 flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#FFF7F5,#F8B5A8)] text-[#B93D2A]/45">
                        <Film size={58} />
                    </div>
                )}

                <button
                    type="button"
                    onClick={onPrevious}
                    disabled={total <= 1}
                    className="absolute left-2 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[14px] bg-white/92 text-[#B93D2A] shadow-lg transition hover:-translate-y-[calc(50%+2px)] disabled:cursor-not-allowed disabled:opacity-40 sm:left-3 sm:h-9 sm:w-9"
                    aria-label="Reel sebelumnya"
                >
                    <ChevronLeft size={17} />
                </button>
                <button
                    type="button"
                    onClick={onNext}
                    disabled={total <= 1}
                    className="absolute right-2 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[14px] bg-white/92 text-[#B93D2A] shadow-lg transition hover:-translate-y-[calc(50%+2px)] disabled:cursor-not-allowed disabled:opacity-40 sm:right-3 sm:h-9 sm:w-9"
                    aria-label="Reel berikutnya"
                >
                    <ChevronRight size={17} />
                </button>
            </div>

            <div className="mt-2 rounded-[18px] border border-[#FFE0D8] bg-[#FFF7F5] p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <StatusPill active={item?.is_active ?? false} />
                    <span className="rounded-full border border-[#FFD5CD] bg-white px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide text-[#B93D2A]">
                        {total > 0 ? `Reel ${current + 1} dari ${total}` : "Belum ada reel"}
                    </span>
                </div>
                <h2 className="mt-2 line-clamp-1 font-clash text-base font-semibold leading-tight text-slate-950">
                    {item?.title ?? "Preview reel akan tampil di sini"}
                </h2>
                <p className="mt-1 line-clamp-1 font-bdo text-xs font-semibold text-slate-500">
                    {item?.video_url ? "Video siap dipreview" : "Tambahkan video untuk preview penuh"}
                </p>
            </div>
        </div>
    );
}

function ReelHero({
    items,
    previewItem,
    previewIndex,
    previewTotal,
    onPrevious,
    onNext,
    onCreate,
}: {
    items: AdminReelItem[];
    previewItem: AdminReelItem | null;
    previewIndex: number;
    previewTotal: number;
    onPrevious: () => void;
    onNext: () => void;
    onCreate: () => void;
}) {
    const active = items.filter((item) => item.is_active).length;

    return (
        <section className="reel-enter reel-sheen relative overflow-hidden rounded-[26px] border border-[#F8B5A8]/70 bg-[linear-gradient(135deg,#E35336_0%,#B93D2A_55%,#7F2419_100%)] text-white shadow-[0_24px_64px_-50px_rgba(185,61,42,.92)] sm:rounded-[30px]">
            <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.075)_0,rgba(255,255,255,.075)_1px,transparent_1px,transparent_24px)]" />
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-white/16 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 left-12 h-64 w-64 rounded-full bg-[#F8B5A8]/24 blur-3xl" />

            <div className="relative z-10 grid gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(330px,.92fr)] xl:grid-cols-[minmax(0,1.13fr)_minmax(360px,.87fr)] xl:p-5">
                <div className="flex min-w-0 flex-col justify-between gap-3 sm:gap-4">
                    <div className="max-w-3xl">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur">
                            <span className="reel-live-dot h-1.5 w-1.5 bg-white text-white" />
                            Video reels desk
                        </span>
                        <h2 className="mt-3 font-clash text-[1.9rem] font-bold uppercase leading-[.96] tracking-tight text-white sm:text-[2.65rem] lg:text-[2.95rem] xl:text-[3.55rem]">
                            Reel Content
                        </h2>
                        <p className="mt-2 max-w-2xl font-bdo text-xs font-semibold leading-5 text-white/74 sm:text-sm sm:leading-6">
                            Kelola video pendek, status publikasi, thumbnail, dan arsip konten dalam satu layar yang cepat dipindai.
                        </p>
                    </div>

                    <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_176px] xl:grid-cols-[minmax(0,1fr)_190px]">
                        <ReelPublicStrip
                            items={items.filter((item) => item.is_active)}
                            active={active}
                        />
                        <button
                            type="button"
                            onClick={onCreate}
                            className="group flex min-h-[78px] items-center gap-3 rounded-[20px] border border-white/18 bg-white p-3.5 text-[#B93D2A] shadow-[0_20px_42px_-30px_rgba(15,23,42,.48)] transition hover:-translate-y-1 md:min-h-[128px] md:flex-col md:items-stretch md:justify-between md:rounded-[22px]"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-[#FFD5CD] bg-[#FFF1EE] md:h-11 md:w-11">
                                <Plus size={18} />
                            </span>
                            <span className="min-w-0 text-left">
                                <span className="block font-clash text-base font-semibold text-slate-950">Tambah Reel</span>
                                <span className="mt-1 block font-bdo text-[11px] font-bold text-slate-500">
                                    Upload video dan thumbnail.
                                </span>
                            </span>
                        </button>
                    </div>
                </div>

                <ReelPreview
                    item={previewItem}
                    current={previewIndex}
                    total={previewTotal}
                    onPrevious={onPrevious}
                    onNext={onNext}
                />
            </div>
        </section>
    );
}

function ReelToolbar({
    query,
    setQuery,
    status,
    setStatus,
    total,
}: {
    query: string;
    setQuery: (value: string) => void;
    status: StatusFilter;
    setStatus: (value: StatusFilter) => void;
    total: number;
}) {
    const statuses: Array<{ value: StatusFilter; label: string }> = [
        { value: "all", label: "Semua" },
        { value: "active", label: "Aktif" },
        { value: "inactive", label: "Nonaktif" },
    ];

    return (
        <div className="flex flex-col gap-3 border-b border-[#FFE0D8] bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF8F5_100%)] p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
                <ShinyIcon className="h-10 w-10">
                    <MonitorPlay size={17} />
                </ShinyIcon>
                <div>
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Reel Library
                    </p>
                    <h2 className="font-clash text-base font-semibold leading-tight text-slate-950">
                        Daftar Video
                    </h2>
                </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_158px] lg:min-w-[480px] xl:min-w-[520px]">
                <label className="reel-input flex h-10 min-w-0 items-center gap-2 rounded-[15px] px-3.5">
                    <Search size={15} className="shrink-0 text-slate-400" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Cari judul reel..."
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-bdo text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                    />
                </label>

                <label className="reel-input flex h-10 items-center gap-2 rounded-[15px] px-3">
                    <Filter size={14} className="shrink-0 text-slate-400" />
                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as StatusFilter)}
                        aria-label="Filter status reel"
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-bdo text-sm font-bold text-slate-700 outline-none focus:ring-0"
                    >
                        {statuses.map((item) => (
                            <option key={item.value} value={item.value}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <span className="rounded-full border border-[#FFD5CD] bg-[#FFF7F5] px-3 py-1.5 font-bdo text-[11px] font-bold text-[#B93D2A] lg:hidden">
                {total} hasil
            </span>
        </div>
    );
}

function ReelCard({
    item,
    index,
    onEdit,
    onDelete,
}: {
    item: AdminReelItem;
    index: number;
    onEdit: (item: AdminReelItem) => void;
    onDelete: (item: AdminReelItem) => void;
}) {
    return (
        <article className="group reel-card-glint grid grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-[#FFE0D8] bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF7F5_145%)] shadow-[0_12px_30px_-28px_rgba(185,61,42,.56)] transition hover:-translate-y-0.5 hover:border-[#F8B5A8] hover:shadow-[0_22px_48px_-38px_rgba(185,61,42,.68)] min-[430px]:grid-cols-[100px_minmax(0,1fr)] sm:flex sm:flex-col sm:rounded-[22px]">
            <div className="relative min-h-[122px] overflow-hidden bg-[#FFF1EE] min-[430px]:min-h-[136px] sm:m-2.5 sm:aspect-[16/9.8] sm:min-h-0 sm:rounded-[18px] sm:ring-1 sm:ring-[#FFE0D8]">
                {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="h-full w-full object-contain transition duration-700 group-hover:scale-[1.03]" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#FFF1EE,#F8B5A8)] text-[#B93D2A]/45">
                        <Film size={34} />
                    </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/62 to-transparent" />
                <div className="absolute left-2 top-2">
                    <StatusPill active={item.is_active} />
                </div>
                <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full border border-white/40 bg-white/22 px-2.5 py-1 font-bdo text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur">
                    <Play size={10} className={cn(item.video_url ? "fill-white" : "")} />
                    {item.video_url ? "Video" : "No video"}
                </div>
            </div>

            <div className="flex min-w-0 flex-col justify-between gap-2 p-2.5 sm:gap-2.5 sm:px-3.5 sm:pb-3.5 sm:pt-1">
                <div className="min-w-0">
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-wide text-[#B93D2A]">
                        Reel #{String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-1 line-clamp-2 font-clash text-sm font-semibold leading-tight text-slate-950 min-[430px]:text-[15px] sm:text-base">
                        {item.title}
                    </h3>
                    <div className="mt-2 hidden grid-cols-2 gap-2 min-[430px]:grid sm:mt-3">
                        <div className="rounded-[15px] border border-slate-200 bg-white px-3 py-2">
                            <p className="font-bdo text-[9px] font-bold uppercase tracking-wide text-slate-400">Thumbnail</p>
                            <p className="mt-0.5 truncate font-clash text-xs font-semibold text-slate-800">
                                {item.thumbnail_url ? "Siap" : "Kosong"}
                            </p>
                        </div>
                        <div className="rounded-[15px] border border-slate-200 bg-white px-3 py-2">
                            <p className="font-bdo text-[9px] font-bold uppercase tracking-wide text-slate-400">Publik</p>
                            <p className="mt-0.5 truncate font-clash text-xs font-semibold text-slate-800">
                                {item.is_active ? "Tampil" : "Hidden"}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-1.5 border-t border-[#FFE0D8] pt-2.5">
                    <ActionButton
                        onClick={() => onEdit(item)}
                        className="border-slate-200 bg-white text-slate-500 hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                        aria-label={`Edit ${item.title}`}
                    >
                        <Pencil size={14} />
                    </ActionButton>
                    <ActionButton
                        onClick={() => onDelete(item)}
                        className="border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100"
                        aria-label={`Hapus ${item.title}`}
                    >
                        <Trash2 size={14} />
                    </ActionButton>
                </div>
            </div>
        </article>
    );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
    return (
        <div className="rounded-[20px] border border-dashed border-[#F8B5A8] bg-[#FFF7F5] p-6 text-center">
            <ShinyIcon className="mx-auto h-10 w-10">
                <Film size={20} />
            </ShinyIcon>
            <p className="mt-3 font-clash text-base font-semibold text-slate-950">Belum ada reel yang cocok</p>
            <p className="mx-auto mt-1 max-w-sm font-bdo text-sm text-slate-500">
                Ubah filter atau tambahkan video reel baru untuk mulai mengisi halaman publik.
            </p>
            <button
                type="button"
                onClick={onCreate}
                className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[15px] bg-[#E35336] px-4 font-clash text-sm font-semibold text-white shadow-[0_14px_26px_-20px_rgba(227,83,54,.85)] transition hover:bg-[#B93D2A]"
            >
                <Plus size={14} />
                Tambah Reel
            </button>
        </div>
    );
}

export default function ReelsIndex() {
    const { items } = usePage<Props>().props;
    const [slideOver, setSlideOver] = useState<{ open: boolean; item: AdminReelItem | null }>({
        open: false,
        item: null,
    });
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [previewIndex, setPreviewIndex] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);

    const openNew = () => setSlideOver({ open: true, item: null });
    const openEdit = (item: AdminReelItem) => setSlideOver({ open: true, item });
    const close = () => setSlideOver({ open: false, item: null });

    const previewItems = useMemo(() => {
        const activeItems = items.filter((item) => item.is_active);
        return activeItems.length > 0 ? activeItems : items;
    }, [items]);

    useEffect(() => {
        setPreviewIndex((current) => Math.min(current, Math.max(previewItems.length - 1, 0)));
    }, [previewItems.length]);

    const filteredItems = useMemo(() => {
        const normalized = query.trim().toLowerCase();

        return items.filter((item) => {
            const matchesStatus =
                status === "all" || (status === "active" ? item.is_active : !item.is_active);
            const matchesQuery = normalized.length === 0 || item.title.toLowerCase().includes(normalized);

            return matchesStatus && matchesQuery;
        });
    }, [items, query, status]);

    useEffect(() => {
        setCurrentPage(1);
    }, [query, status]);

    const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, pageCount);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const pageEnd = Math.min(pageStart + PAGE_SIZE, filteredItems.length);
    const paginatedItems = filteredItems.slice(pageStart, pageEnd);

    const handleDelete = (item: AdminReelItem) => {
        if (!confirm(`Hapus reel "${item.title}"?`)) return;
        router.delete(route("admin.reels.destroy", item.id), { preserveScroll: true });
    };

    const goPrevious = () => {
        setPreviewIndex((current) => {
            if (previewItems.length <= 1) return current;
            return current === 0 ? previewItems.length - 1 : current - 1;
        });
    };

    const goNext = () => {
        setPreviewIndex((current) => {
            if (previewItems.length <= 1) return current;
            return current === previewItems.length - 1 ? 0 : current + 1;
        });
    };

    const active = items.filter((item) => item.is_active).length;
    const withVideo = items.filter((item) => item.video_url).length;

    return (
        <AdminLayout
            header={
                <div className="flex flex-col gap-1 pt-3 reel-enter">
                    <style dangerouslySetInnerHTML={{ __html: REEL_STYLES }} />
                    <span className="font-bdo text-[11px] font-medium tracking-wide text-[#E35336]">
                        Manajemen Konten
                    </span>
                    <h1 className="font-clash text-2xl font-bold uppercase tracking-tight xl:text-3xl">
                        <span className="reel-title-shine">Video Reels</span>
                    </h1>
                </div>
            }
        >
            <Head title="Video Reels" />

            <div className="flex flex-col gap-4 overflow-x-hidden pb-16 pt-4">
                <ReelHero
                    items={items}
                    previewItem={previewItems[previewIndex] ?? null}
                    previewIndex={previewIndex}
                    previewTotal={previewItems.length}
                    onPrevious={goPrevious}
                    onNext={goNext}
                    onCreate={openNew}
                />

                <section className="reel-enter reel-card-glint overflow-hidden rounded-[24px] border border-[#FFE0D8] bg-white shadow-[0_18px_42px_-38px_rgba(185,61,42,.48)]">
                    <ReelToolbar
                        query={query}
                        setQuery={setQuery}
                        status={status}
                        setStatus={setStatus}
                        total={filteredItems.length}
                    />

                    <div className="grid gap-2.5 border-b border-[#FFE0D8] bg-[#FFF7F5]/70 p-2.5 sm:grid-cols-3">
                        <div className="rounded-[18px] border border-[#FFD5CD] bg-white px-3.5 py-2.5">
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-400">Total</p>
                            <p className="mt-1 font-clash text-lg font-bold text-slate-950">{items.length} reel</p>
                        </div>
                        <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-wide text-emerald-600/70">Aktif</p>
                            <p className="mt-1 font-clash text-lg font-bold text-emerald-800">{active} tampil</p>
                        </div>
                        <div className="rounded-[18px] border border-sky-200 bg-sky-50 px-3.5 py-2.5">
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-wide text-sky-600/70">Video</p>
                            <p className="mt-1 font-clash text-lg font-bold text-sky-800">{withVideo} siap</p>
                        </div>
                    </div>

                    <div className="reel-scrollbar max-h-[590px] overflow-y-auto p-2.5 sm:p-3">
                        {filteredItems.length === 0 ? (
                            <EmptyState onCreate={openNew} />
                        ) : (
                            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {paginatedItems.map((item, index) => (
                                    <ReelCard
                                        key={item.id}
                                        item={item}
                                        index={pageStart + index}
                                        onEdit={openEdit}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {filteredItems.length > 0 && (
                        <div className="flex flex-col gap-2.5 border-t border-[#FFE0D8] bg-[#FFF7F5]/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-bdo text-xs font-semibold text-slate-500">
                                Menampilkan {pageStart + 1}-{pageEnd} dari {filteredItems.length} reel
                            </p>
                            <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 sm:flex">
                                <ActionButton
                                    disabled={safePage <= 1}
                                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                    className="border-slate-200 bg-white text-slate-500 hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                                    aria-label="Halaman sebelumnya"
                                >
                                    <ChevronLeft size={16} />
                                </ActionButton>
                                <div className="flex h-9 min-w-[96px] items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 font-bdo text-xs font-bold text-slate-600">
                                    {safePage} / {pageCount}
                                </div>
                                <ActionButton
                                    disabled={safePage >= pageCount}
                                    onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                                    className="border-slate-200 bg-white text-slate-500 hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                                    aria-label="Halaman berikutnya"
                                >
                                    <ChevronRight size={16} />
                                </ActionButton>
                            </div>
                        </div>
                    )}
                </section>

                <section className="reel-enter grid gap-2.5 rounded-[22px] border border-[#FFE0D8] bg-[#FFF7F5]/70 p-2.5 sm:grid-cols-3">
                    {[
                        { icon: <Sparkles size={15} />, label: "Thumbnail terang", text: "Pilih frame yang jelas agar kartu publik langsung terbaca." },
                        { icon: <Video size={15} />, label: "Format ringan", text: "Gunakan MP4 atau WebM agar pemutaran lebih stabil." },
                        { icon: <EyeOff size={15} />, label: "Nonaktif aman", text: "Simpan konten lama tanpa menghapus arsipnya." },
                    ].map((item) => (
                        <div key={item.label} className="rounded-[18px] border border-white bg-white/85 p-3">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 items-center justify-center rounded-[14px] bg-[#FFF1EE] text-[#B93D2A] ring-1 ring-[#FFD5CD]">
                                    {item.icon}
                                </span>
                                <p className="font-clash text-sm font-semibold text-slate-950">{item.label}</p>
                            </div>
                            <p className="mt-2 font-bdo text-xs font-medium leading-5 text-slate-500">{item.text}</p>
                        </div>
                    ))}
                </section>
            </div>

            <SlideOver
                isOpen={slideOver.open}
                onClose={close}
                title={<span className="font-clash text-xl font-bold">{slideOver.item ? "Edit Reel" : "Tambah Reel"}</span>}
                description={
                    <span className="font-bdo text-sm text-slate-500">
                        {slideOver.item ? "Perbarui konten video pendek." : "Upload video pendek baru untuk publik."}
                    </span>
                }
            >
                {slideOver.open && (
                    <ReelForm
                        key={slideOver.item?.id ?? "new"}
                        item={slideOver.item}
                        onClose={close}
                    />
                )}
            </SlideOver>
        </AdminLayout>
    );
}
