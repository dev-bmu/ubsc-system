import { Head, router, useForm, usePage } from "@inertiajs/react";
import {
    DndContext,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    rectSortingStrategy,
} from "@dnd-kit/sortable";
import {
    Building2,
    ChevronLeft,
    ChevronRight,
    Eye,
    Filter,
    ImageIcon,
    Layers3,
    Pencil,
    Plus,
    Save,
    Search,
    Sparkles,
    Trash2,
    UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import SortableCard from "@/Components/Admin/SortableCard";
import { SingleDropzone } from "@/Components/Admin/ImageDropzone";
import SlideOver from "@/Components/Admin/SlideOver";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { PageProps, SponsorItem } from "@/types";

type Props = PageProps<{ items: SponsorItem[] }>;

type FormData = {
    name: string;
    is_active: boolean;
    sort_order: number;
    logo: File | null;
    _method?: string;
};

type StatusFilter = "all" | "active" | "inactive";

const SPONSOR_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo { font-family: 'BDO Grotesk', sans-serif; }

    @keyframes sponsorFadeInUp {
        from { opacity: 0; transform: translate3d(0, 24px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes sponsorTitleSheen {
        0% { background-position: -120% center; }
        100% { background-position: 220% center; }
    }
    @keyframes sponsorIconGlow {
        0%, 100% { box-shadow: 0 18px 34px -24px rgba(227,83,54,.95), inset 0 1px 0 rgba(255,255,255,.2); }
        50% { box-shadow: 0 24px 40px -24px rgba(227,83,54,1), 0 0 24px rgba(227,83,54,.14), inset 0 1px 0 rgba(255,255,255,.2); }
    }
    @keyframes sponsorSheen {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(160%); }
    }
    @keyframes sponsorBtnSheen {
        0% { left: -80%; }
        100% { left: 120%; }
    }
    @keyframes sponsorFloat {
        0%, 100% { transform: translate3d(0, 0, 0); }
        50% { transform: translate3d(0, -5px, 0); }
    }

    .sponsor-enter {
        animation: sponsorFadeInUp .62s cubic-bezier(.16,1,.3,1) forwards;
        opacity: 0;
    }
    .sponsor-title-shine {
        background: linear-gradient(110deg, #0f172a 0%, #0f172a 34%, #ffffff 47%, #cbd5e1 54%, #0f172a 68%, #0f172a 100%);
        background-size: 240% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: sponsorTitleSheen 5s linear infinite;
    }
    .sponsor-icon-glow { animation: sponsorIconGlow 3.5s ease-in-out infinite; }
    .sponsor-float { animation: sponsorFloat 3.8s ease-in-out infinite; }
    .sponsor-card-glint { position: relative; }
    .sponsor-card-glint::before {
        content: "";
        position: absolute;
        top: 0;
        left: 22px;
        right: 22px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.96), transparent);
        pointer-events: none;
        z-index: 2;
    }
    .sponsor-sheen { position: relative; overflow: hidden; }
    .sponsor-sheen::after {
        content: "";
        position: absolute;
        inset-block: 0;
        width: 50%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.34), transparent);
        animation: sponsorSheen 1.1s ease-out .45s forwards;
        pointer-events: none;
    }
    .sponsor-btn-sheen { position: relative; overflow: hidden; }
    .sponsor-btn-sheen::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        width: 50%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent);
        animation: sponsorBtnSheen 3s ease-in-out 1s infinite;
    }
    .sponsor-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.34) transparent;
    }
    .sponsor-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
    .sponsor-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .sponsor-scrollbar::-webkit-scrollbar-thumb {
        border: 2px solid rgba(255,255,255,.9);
        border-radius: 999px;
        background: rgba(227,83,54,.34);
    }
    .sponsor-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(185,61,42,.52); }
    .sponsor-touch-scroll {
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-y;
    }
    .delay-100 { animation-delay: 100ms; }
    .delay-200 { animation-delay: 200ms; }
    .delay-300 { animation-delay: 300ms; }

    @media (prefers-reduced-motion: reduce) {
        .sponsor-enter,
        .sponsor-title-shine,
        .sponsor-icon-glow,
        .sponsor-float,
        .sponsor-sheen::after,
        .sponsor-btn-sheen::before {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
        }
    }
`;

const inputBase =
    "h-11 w-full rounded-[16px] border border-[#F8B5A8]/60 bg-white/88 px-3.5 font-bdo text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,.82)] outline-none transition focus:border-[#E35336]/70 focus:bg-white focus:ring-4 focus:ring-[#E35336]/10 placeholder:text-slate-400";
const labelBase =
    "mb-1.5 block font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500";

function ShinyIcon({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn(
                "sponsor-icon-glow relative flex shrink-0 items-center justify-center rounded-[15px]",
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

function SponsorForm({ item, onClose }: { item: SponsorItem | null; onClose: () => void }) {
    const isEdit = item !== null;
    const { data, setData, post, processing, errors } = useForm<FormData>({
        name: item?.name ?? "",
        is_active: item?.is_active ?? true,
        sort_order: item?.sort_order ?? 0,
        logo: null,
        ...(isEdit ? { _method: "PUT" } : {}),
    });

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const url = isEdit
            ? route("admin.sponsors.update", item!.id)
            : route("admin.sponsors.store");

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
                            {isEdit ? "Perbarui logo sponsor" : "Sponsor baru"}
                        </p>
                        <p className="mt-1 font-bdo text-xs font-medium leading-5 text-slate-500">
                            Gunakan logo beresolusi jelas, transparan bila memungkinkan, dan mudah terbaca di marquee publik.
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <label htmlFor="sponsor_name" className={labelBase}>Nama Sponsor</label>
                <input
                    id="sponsor_name"
                    type="text"
                    value={data.name}
                    onChange={(event) => setData("name", event.target.value)}
                    placeholder="Contoh: Bank Mandiri"
                    className={inputBase}
                />
                {errors.name && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.name}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_136px]">
                <div>
                    <label htmlFor="sponsor_sort_order" className={labelBase}>Urutan</label>
                    <input
                        id="sponsor_sort_order"
                        type="number"
                        min={0}
                        value={data.sort_order}
                        onChange={(event) => setData("sort_order", Number(event.target.value))}
                        className={cn(inputBase, "font-mono")}
                    />
                </div>

                <label className="flex h-11 items-center justify-between gap-3 self-end rounded-[16px] border border-[#F8B5A8]/60 bg-[#FFF7F5] px-3.5">
                    <span>
                        <span className="block font-clash text-sm font-semibold text-slate-900">Aktif</span>
                        <span className="block font-bdo text-[11px] font-medium text-slate-400">
                            {data.is_active ? "Tampil publik" : "Disembunyikan"}
                        </span>
                    </span>
                    <input
                        type="checkbox"
                        checked={data.is_active}
                        onChange={(event) => setData("is_active", event.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 text-[#E35336] focus:ring-[#E35336]"
                        aria-label="Status aktif sponsor"
                    />
                </label>
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-white p-2.5">
                <SingleDropzone
                    label="Logo Sponsor"
                    currentUrl={item?.logo_url ?? null}
                    onFileSelect={(file) => setData("logo", file)}
                />
                {errors.logo && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.logo}</p>}
            </div>

            <div className="grid gap-2 rounded-[18px] border border-slate-200 bg-slate-50/75 p-2.5 sm:grid-cols-3">
                {[
                    { label: "Mode", value: isEdit ? "Edit" : "Baru" },
                    { label: "Status", value: data.is_active ? "Aktif" : "Nonaktif" },
                    { label: "Urutan", value: data.sort_order || "Auto" },
                ].map((meta) => (
                    <div key={meta.label} className="rounded-[15px] bg-white px-3 py-2 ring-1 ring-slate-200/70">
                        <p className="font-bdo text-[9px] font-bold uppercase tracking-wider text-slate-400">{meta.label}</p>
                        <p className="mt-1 truncate font-bdo text-[11px] font-bold text-slate-700">{meta.value}</p>
                    </div>
                ))}
            </div>

            <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center">
                <button
                    type="button"
                    onClick={onClose}
                    className="h-11 rounded-[16px] border border-slate-200 bg-white px-5 font-clash text-sm font-semibold text-slate-600 transition hover:border-[#F8B5A8] hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                >
                    Batal
                </button>
                <button
                    type="submit"
                    disabled={processing}
                    className="sponsor-btn-sheen relative flex h-11 flex-1 items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-6 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95),inset_0_1px_0_rgba(255,255,255,.2)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                    <Save size={14} />
                    {processing ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah Sponsor"}
                </button>
            </div>
        </form>
    );
}

function SponsorCard({
    item,
    index,
    onEdit,
    onDelete,
    handle,
}: {
    item: SponsorItem;
    index: number;
    onEdit: (item: SponsorItem) => void;
    onDelete: (item: SponsorItem) => void;
    handle: ReactNode;
}) {
    return (
        <div className="group sponsor-card-glint relative grid h-full grid-cols-[104px_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-[#FFD5CD]/75 bg-white shadow-[0_16px_38px_-32px_rgba(127,36,25,.48)] transition hover:border-[#F8B5A8] sm:flex sm:flex-col sm:rounded-[22px] sm:hover:-translate-y-0.5 sm:hover:shadow-[0_24px_52px_-38px_rgba(127,36,25,.62)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#FFF7F5] to-transparent" />
            <div className="relative flex min-h-[122px] w-full items-center justify-center overflow-hidden rounded-r-[22px] bg-[linear-gradient(135deg,#FFF7F5_0%,#FFFFFF_52%,#F8FAFC_100%)] p-3 ring-1 ring-[#FFD5CD]/45 sm:aspect-[4/3] sm:min-h-0 sm:rounded-b-[24px] sm:rounded-r-none sm:p-4">
                <div className="absolute left-2 top-2 z-10 sm:left-3 sm:top-3">{handle}</div>
                <span className="absolute bottom-2 left-2 z-10 rounded-full bg-slate-950/55 px-2 py-0.5 font-bdo text-[9px] font-bold text-white backdrop-blur sm:bottom-auto sm:left-auto sm:right-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[10px]">
                    #{index + 1}
                </span>

                {item.logo_url ? (
                    <img
                        src={item.logo_url}
                        alt={item.name}
                        className="max-h-full max-w-full object-contain transition duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-1.5 px-2 text-center text-[#E35336]/38">
                        <ImageIcon size={28} />
                        <span className="font-bdo text-[9px] font-bold uppercase tracking-wide sm:text-[11px]">Belum ada logo</span>
                    </div>
                )}
            </div>

            <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-3.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0">
                        <p className="line-clamp-2 font-clash text-sm font-semibold leading-tight text-slate-950 sm:text-[15px]">
                            {item.name}
                        </p>
                        <p className="mt-1 font-bdo text-[11px] font-semibold text-slate-400">
                            Sort order {item.sort_order || index + 1}
                        </p>
                    </div>
                    <StatusPill active={item.is_active} />
                </div>

                <div className="mt-auto grid grid-cols-[minmax(0,1fr)_36px] gap-2 sm:grid-cols-[minmax(0,1fr)_38px]">
                    <button
                        type="button"
                        onClick={() => onEdit(item)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-[15px] border border-slate-200 bg-slate-50 font-bdo text-xs font-bold text-slate-600 transition hover:border-[#F8B5A8] hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                    >
                        <Pencil size={13} />
                        Edit
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(item)}
                        className="inline-flex h-9 items-center justify-center rounded-[15px] border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100"
                        aria-label={`Hapus ${item.name}`}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

function SponsorHero({
    items,
    active,
    onCreate,
}: {
    items: SponsorItem[];
    active: number;
    onCreate: () => void;
}) {
    const activeItems = items.filter((item) => item.is_active);
    const [currentIndex, setCurrentIndex] = useState(0);
    const currentSponsor = activeItems[currentIndex] ?? activeItems[0] ?? null;

    useEffect(() => {
        if (activeItems.length === 0) {
            setCurrentIndex(0);
            return;
        }

        setCurrentIndex((index) => Math.min(index, activeItems.length - 1));
    }, [activeItems.length]);

    const goToPrevious = () => {
        if (activeItems.length <= 1) return;
        setCurrentIndex((index) => (index - 1 + activeItems.length) % activeItems.length);
    };

    const goToNext = () => {
        if (activeItems.length <= 1) return;
        setCurrentIndex((index) => (index + 1) % activeItems.length);
    };

    return (
        <>
        <section className="sponsor-enter sponsor-sheen relative overflow-hidden rounded-[24px] border border-[#F8B5A8]/70 bg-[linear-gradient(135deg,#E35336_0%,#B93D2A_58%,#7F2419_100%)] text-white shadow-[0_24px_58px_-48px_rgba(127,36,25,.68)] sm:hidden">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.08)_0,rgba(255,255,255,.08)_1px,transparent_1px,transparent_18px)]" />
            <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full border border-white/28" />

            <div className="relative z-10 p-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <span className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/14 px-3 py-1.5 font-bdo text-[10px] font-bold text-white">
                            <Sparkles size={12} />
                            Sponsor desk
                        </span>
                        <h2 className="mt-3 font-clash text-[1.34rem] font-semibold leading-tight text-white">
                            Susun logo partner agar tampil rapi, kredibel, dan mudah dipercaya pengunjung.
                        </h2>
                        <p className="mt-1 max-w-[280px] font-bdo text-xs font-medium leading-5 text-white/74">
                            Kelola logo sponsor, urutan tampil, dan status publikasi dalam satu ruang kerja yang visual. Logo aktif akan masuk ke marquee publik sesuai prioritas.
                        </p>
                    </div>
                    <span className="shrink-0 rounded-2xl border border-white/20 bg-white/14 px-3 py-2 text-center backdrop-blur">
                        <span className="block font-clash text-lg font-bold leading-none text-white">{active}</span>
                        <span className="mt-1 block font-bdo text-[9px] font-bold uppercase tracking-wide text-white/72">Live</span>
                    </span>
                </div>

                <div className="mt-3 overflow-hidden rounded-[22px] border border-white/22 bg-white shadow-[0_18px_36px_-28px_rgba(127,36,25,.5)]">
                    <div className="relative min-h-[174px] overflow-hidden bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF7F5_58%,#F8FAFC_100%)]">
                        {currentSponsor?.logo_url ? (
                            <div className="flex min-h-[174px] items-center justify-center px-12 py-8">
                                <img src={currentSponsor.logo_url} alt={currentSponsor.name} className="max-h-20 max-w-full object-contain" />
                            </div>
                        ) : currentSponsor ? (
                            <div className="flex min-h-[174px] flex-col items-center justify-center gap-2 px-10 text-center">
                                <ImageIcon size={28} className="text-[#E35336]/55" />
                                <p className="font-clash text-sm font-semibold text-slate-950">Logo belum diunggah</p>
                            </div>
                        ) : (
                            <div className="flex min-h-[174px] flex-col items-center justify-center gap-2 px-10 text-center">
                                <ImageIcon size={28} className="text-[#E35336]/55" />
                                <p className="font-clash text-sm font-semibold text-slate-950">Belum ada sponsor aktif</p>
                                <p className="font-bdo text-xs font-medium text-slate-500">Aktifkan sponsor untuk preview.</p>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={goToPrevious}
                            disabled={activeItems.length <= 1}
                            className="absolute left-2 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/70 bg-white/90 text-[#B93D2A] shadow-sm disabled:opacity-35"
                            aria-label="Sponsor sebelumnya"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={goToNext}
                            disabled={activeItems.length <= 1}
                            className="absolute right-2 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/70 bg-white/90 text-[#B93D2A] shadow-sm disabled:opacity-35"
                            aria-label="Sponsor berikutnya"
                        >
                            <ChevronRight size={16} />
                        </button>

                        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent px-3 pb-3 pt-12">
                            <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-white/75">
                                Logo {activeItems.length > 0 ? currentIndex + 1 : 0} dari {activeItems.length}
                            </p>
                            <p className="mt-0.5 truncate font-clash text-base font-semibold text-white">
                                {currentSponsor?.name ?? "Brand Wall"}
                            </p>
                        </div>
                    </div>

                    <div className="sponsor-scrollbar flex gap-2 overflow-x-auto bg-white px-3 py-2.5">
                        {activeItems.length > 0 ? activeItems.slice(0, 8).map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setCurrentIndex(index)}
                                className={cn(
                                    "flex h-10 min-w-[68px] items-center justify-center rounded-2xl border bg-white px-2 transition",
                                    currentSponsor?.id === item.id ? "border-[#E35336] ring-2 ring-[#E35336]/10" : "border-slate-200",
                                )}
                            >
                                {item.logo_url ? (
                                    <img src={item.logo_url} alt={item.name} className="max-h-full max-w-full object-contain" />
                                ) : (
                                    <span className="truncate font-bdo text-[10px] font-bold text-slate-400">{item.name}</span>
                                )}
                            </button>
                        )) : (
                            <span className="font-bdo text-xs font-semibold text-slate-400">Belum ada logo aktif.</span>
                        )}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onCreate}
                    className="sponsor-btn-sheen mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-4 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95)]"
                >
                    <Plus size={15} />
                    Tambah Sponsor
                </button>
            </div>
        </section>

        <section className="sponsor-enter sponsor-sheen relative hidden overflow-hidden rounded-[26px] border border-[#F8B5A8]/70 bg-[linear-gradient(135deg,#E35336_0%,#B93D2A_58%,#7F2419_100%)] text-white shadow-[0_28px_68px_-54px_rgba(127,36,25,.72)] sm:block">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.085)_0,rgba(255,255,255,.085)_1px,transparent_1px,transparent_22px)]" />
            <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border border-white/28" />
            <div className="pointer-events-none absolute -left-24 -bottom-32 h-72 w-72 rounded-full bg-[#FFD5CD]/18 blur-3xl" />

            <div className="relative z-10 grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(340px,410px)]">
                <div className="p-4 sm:p-5 lg:p-5">
                    <div className="max-w-3xl">
                        <span className="inline-flex items-center gap-2 rounded-2xl border border-white/22 bg-white/14 px-3 py-1.5 font-bdo text-[10px] font-bold text-white shadow-[0_16px_30px_-26px_rgba(15,23,42,.32)] backdrop-blur">
                            <Sparkles size={13} />
                            Sponsor control desk
                        </span>
                        <h2 className="mt-3 max-w-4xl font-clash text-[1.72rem] font-semibold leading-[1.03] text-white sm:text-[2.35rem] lg:text-[2.75rem]">
                            Susun logo partner agar tampil rapi, kredibel, dan mudah dipercaya pengunjung.
                        </h2>
                        <p className="mt-2 max-w-2xl font-bdo text-xs font-medium leading-5 text-white/74 sm:text-sm sm:leading-6">
                            Kelola logo sponsor, urutan tampil, dan status publikasi dalam satu ruang kerja yang visual. Logo aktif akan masuk ke marquee publik sesuai prioritas.
                        </p>
                    </div>

                    <div className="mt-4 grid gap-3 sm:mt-5 md:grid-cols-[minmax(0,1fr)_minmax(196px,.38fr)]">
                        <div className="rounded-[20px] border border-white/18 bg-white/14 p-3 shadow-sm backdrop-blur sm:p-3.5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-white/60">Marquee publik</p>
                                    <p className="mt-1 font-clash text-base font-semibold text-white sm:text-xl">
                                        {active > 0 ? `${active} sponsor sedang tampil` : "Belum ada sponsor aktif"}
                                    </p>
                                </div>
                                <div className="inline-flex w-fit items-center gap-2 rounded-2xl border border-white/22 bg-white px-3 py-1.5 font-bdo text-[10px] font-bold text-[#B93D2A] sm:py-2 sm:text-[11px]">
                                    <Eye size={14} />
                                    Live preview
                                </div>
                            </div>
                            <div className="sponsor-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1 sm:mt-4">
                                {activeItems.length > 0 ? activeItems.slice(0, 8).map((item) => (
                                    <span key={item.id} className="flex h-12 min-w-[82px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:h-14 sm:min-w-[96px]">
                                        {item.logo_url ? (
                                            <img src={item.logo_url} alt={item.name} className="max-h-full max-w-full object-contain" />
                                        ) : (
                                            <span className="truncate font-bdo text-[11px] font-bold text-slate-400">{item.name}</span>
                                        )}
                                    </span>
                                )) : (
                                    <span className="flex h-12 w-full items-center justify-center rounded-2xl border border-dashed border-[#F8B5A8] bg-[#FFF7F5] px-3 text-center font-bdo text-xs font-semibold text-[#B93D2A] sm:h-14 sm:text-sm">
                                        Tambahkan sponsor aktif untuk melihat preview.
                                    </span>
                                )}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onCreate}
                            className="sponsor-btn-sheen flex min-h-[112px] flex-col justify-between rounded-[20px] border border-white/22 bg-white p-3.5 text-left text-[#B93D2A] shadow-[0_18px_34px_-24px_rgba(15,23,42,.35)] transition hover:-translate-y-1 sm:min-h-[138px]"
                        >
                            <span className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-[#FFF1EE] ring-1 ring-[#FFD5CD]">
                                <Plus size={18} />
                            </span>
                            <span>
                                <span className="block font-clash text-base font-semibold text-slate-950 sm:text-lg">Tambah Sponsor</span>
                                <span className="mt-1 block font-bdo text-xs font-semibold text-slate-500">Upload logo, aktifkan, lalu posisikan urutannya.</span>
                            </span>
                        </button>
                    </div>
                </div>

                <div className="border-t border-white/16 bg-white/10 p-3.5 backdrop-blur sm:p-4 xl:border-l xl:border-t-0">
                    <div className="sponsor-card-glint flex h-full min-h-[250px] flex-col overflow-hidden rounded-[22px] border border-white/70 bg-white p-3.5 text-slate-950 shadow-[0_26px_58px_-42px_rgba(15,23,42,.45)] sm:min-h-[318px] xl:min-h-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <ShinyIcon className="h-10 w-10 sm:h-11 sm:w-11">
                                    <Sparkles size={17} />
                                </ShinyIcon>
                                <div>
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-[#B93D2A]">Brand Wall</p>
                                    <h3 className="font-clash text-base font-semibold text-slate-950 sm:text-lg">Tampilan Logo</h3>
                                </div>
                            </div>
                            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bdo text-[9px] font-bold uppercase text-emerald-700 sm:px-3 sm:py-1.5 sm:text-[10px]">
                                {active} live
                            </span>
                        </div>

                        <div className="relative mt-3 flex-1 overflow-hidden rounded-[20px] bg-[#FFF7F4] ring-1 ring-[#FFE0D8] sm:mt-4 sm:rounded-[24px]">
                            {currentSponsor ? (
                                <div className="group h-full min-h-[160px] w-full text-left sm:min-h-[240px] xl:min-h-0">
                                    {currentSponsor.logo_url ? (
                                        <div className="flex h-full min-h-[160px] items-center justify-center bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF7F5_58%,#F8FAFC_100%)] p-6 sm:min-h-[240px] sm:p-8 xl:min-h-0">
                                            <img
                                                src={currentSponsor.logo_url}
                                                alt={currentSponsor.name}
                                                className="max-h-20 max-w-full object-contain transition duration-700 group-hover:scale-105 sm:max-h-32"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-5 text-center sm:min-h-[240px] sm:gap-3 sm:px-6 xl:min-h-0">
                                            <span className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-[#FFD5CD] bg-white text-[#E35336] shadow-sm sm:h-14 sm:w-14 sm:rounded-[22px]">
                                                <ImageIcon size={22} />
                                            </span>
                                            <span className="font-clash text-sm font-semibold text-slate-950 sm:text-base">Logo belum diunggah</span>
                                            <span className="max-w-xs font-bdo text-xs font-medium leading-5 text-slate-500 sm:text-sm">Tambahkan logo agar brand wall terlihat penuh.</span>
                                        </div>
                                    )}
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-slate-950/70 via-slate-950/24 to-transparent p-3 pt-12 sm:p-4 sm:pt-16">
                                        <div className="flex items-end justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-bdo text-[9px] font-bold uppercase tracking-widest text-white/75 sm:text-[10px]">
                                                    Sponsor {activeItems.length > 0 ? currentIndex + 1 : 0} dari {activeItems.length}
                                                </p>
                                                <p className="mt-0.5 line-clamp-1 font-clash text-base font-semibold text-white sm:mt-1 sm:text-lg">
                                                    {currentSponsor.name}
                                                </p>
                                            </div>
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/40 bg-white/20 text-white backdrop-blur sm:h-10 sm:w-10">
                                                <Eye size={15} />
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex h-full min-h-[170px] flex-col items-center justify-center gap-2 px-5 text-center sm:min-h-[240px] sm:gap-3 sm:px-6">
                                    <ImageIcon size={30} className="text-[#E35336]/55" />
                                    <p className="font-clash text-sm font-semibold text-slate-950 sm:text-base">Belum ada logo aktif</p>
                                    <p className="max-w-xs font-bdo text-xs font-medium leading-5 text-slate-500 sm:text-sm">Aktifkan sponsor untuk membangun carousel Brand Wall.</p>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={goToPrevious}
                                disabled={activeItems.length <= 1}
                                className="absolute left-2 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/60 bg-white/90 text-[#B93D2A] shadow-sm backdrop-blur transition hover:bg-[#FFF1EE] disabled:cursor-not-allowed disabled:opacity-35 sm:left-3 sm:h-10 sm:w-10"
                                aria-label="Sponsor sebelumnya"
                            >
                                <ChevronLeft size={17} />
                            </button>
                            <button
                                type="button"
                                onClick={goToNext}
                                disabled={activeItems.length <= 1}
                                className="absolute right-2 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/60 bg-white/90 text-[#B93D2A] shadow-sm backdrop-blur transition hover:bg-[#FFF1EE] disabled:cursor-not-allowed disabled:opacity-35 sm:right-3 sm:h-10 sm:w-10"
                                aria-label="Sponsor berikutnya"
                            >
                                <ChevronRight size={17} />
                            </button>
                        </div>

                        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:mt-3">
                            <div className="flex min-w-0 items-center justify-center rounded-2xl border border-[#FFD5CD] bg-[#FFF1EE] px-3 py-2 font-bdo text-[11px] font-bold text-[#B93D2A]">
                                {activeItems.length > 0 ? `Logo ${currentIndex + 1} dari ${activeItems.length}` : "Belum ada logo"}
                            </div>
                            <button
                                type="button"
                                onClick={onCreate}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[#E35336] px-4 font-clash text-xs font-semibold text-white transition hover:bg-[#B93D2A]"
                            >
                                <Plus size={13} />
                                Tambah
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </section>
        </>
    );
}

function SponsorsIndex() {
    const { items: initialItems } = usePage<Props>().props;
    const [items, setItems] = useState<SponsorItem[]>(initialItems);
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [slideOver, setSlideOver] = useState<{ open: boolean; item: SponsorItem | null }>({
        open: false,
        item: null,
    });

    useEffect(() => {
        setItems(initialItems);
    }, [initialItems]);

    const openNew = () => setSlideOver({ open: true, item: null });
    const openEdit = (item: SponsorItem) => setSlideOver({ open: true, item });
    const close = () => setSlideOver({ open: false, item: null });

    const handleDelete = (item: SponsorItem) => {
        if (!confirm(`Hapus "${item.name}"?`)) return;
        router.delete(route("admin.sponsors.destroy", item.id), { preserveScroll: true });
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = items.findIndex((item) => item.id.toString() === active.id);
        const newIndex = items.findIndex((item) => item.id.toString() === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reordered = arrayMove(items, oldIndex, newIndex);
        setItems(reordered);
        router.post(
            route("admin.sponsors.reorder"),
            { ids: reordered.map((item) => item.id) },
            { preserveScroll: true },
        );
    };

    const stats = useMemo(() => {
        const active = items.filter((item) => item.is_active).length;
        const inactive = items.length - active;
        const withLogo = items.filter((item) => Boolean(item.logo_url)).length;

        return { active, inactive, withLogo };
    }, [items]);

    const filteredItems = useMemo(() => {
        const needle = query.trim().toLowerCase();

        return items.filter((item) => {
            const matchesQuery = !needle || item.name.toLowerCase().includes(needle);
            const matchesStatus =
                statusFilter === "all"
                || (statusFilter === "active" && item.is_active)
                || (statusFilter === "inactive" && !item.is_active);

            return matchesQuery && matchesStatus;
        });
    }, [items, query, statusFilter]);

    return (
        <AdminLayout
            header={
                <div className="flex flex-col gap-1 pt-3 sponsor-enter">
                    <style dangerouslySetInnerHTML={{ __html: SPONSOR_STYLES }} />
                    <span className="font-bdo text-[11px] font-medium tracking-wide text-[#E35336]">
                        Manajemen Konten
                    </span>
                    <h1 className="font-clash text-2xl font-bold uppercase tracking-tight xl:text-3xl">
                        <span className="sponsor-title-shine">Logo Sponsor</span>
                    </h1>
                </div>
            }
        >
            <Head title="Logo Sponsor" />

            <div className="flex flex-col gap-4 overflow-x-hidden pb-16 pt-4">
                <SponsorHero
                    items={items}
                    active={stats.active}
                    onCreate={openNew}
                />

                <section className="sponsor-enter delay-100 sponsor-card-glint relative overflow-hidden rounded-[22px] border border-[#FFE0D8] bg-white p-3.5 shadow-[0_22px_52px_-44px_rgba(127,36,25,.5)] sm:p-4">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#FFF7F5] to-transparent" />
                    <div className="relative z-10 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex items-center gap-3">
                            <ShinyIcon className="h-10 w-10">
                                <Layers3 size={17} />
                            </ShinyIcon>
                            <div>
                                <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Workspace</p>
                                <h2 className="font-clash text-base font-semibold leading-tight text-slate-950">Kurasi Sponsor</h2>
                                <p className="mt-0.5 font-bdo text-[11px] font-medium text-slate-400 sm:text-xs">Cari, filter, tambah, lalu seret kartu sesuai prioritas tampil.</p>
                            </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_148px_auto] xl:min-w-[660px]">
                            <label className="flex h-10 min-w-0 items-center gap-2 rounded-[16px] border border-[#F8B5A8]/60 bg-[#FFF7F5] px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.8)] sm:h-11">
                                <Search size={15} className="shrink-0 text-[#B93D2A]" />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Cari nama sponsor..."
                                    className="min-w-0 flex-1 border-0 bg-transparent p-0 font-bdo text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                                />
                            </label>

                            <label className="flex h-10 items-center gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3 shadow-[inset_0_1px_0_rgba(255,255,255,.72)] sm:h-11">
                                <span className="sr-only">Filter status sponsor</span>
                                <Filter size={14} className="shrink-0 text-slate-400" />
                                <select
                                    aria-label="Filter status sponsor"
                                    title="Filter status sponsor"
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                                    className="min-w-0 border-0 bg-transparent p-0 font-bdo text-sm font-bold text-slate-600 outline-none focus:ring-0"
                                >
                                    <option value="all">Semua</option>
                                    <option value="active">Aktif</option>
                                    <option value="inactive">Nonaktif</option>
                                </select>
                            </label>

                            <button
                                type="button"
                                onClick={openNew}
                                className="sponsor-btn-sheen inline-flex h-10 items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 sm:h-11"
                            >
                                <Plus size={15} />
                                Sponsor
                            </button>
                        </div>
                    </div>

                    <div className="relative z-10 mt-4 hidden gap-2 sm:grid sm:grid-cols-3">
                        {[
                            { icon: <Layers3 size={14} />, label: "Seret kartu", note: "Atur prioritas tampil" },
                            { icon: <Pencil size={14} />, label: "Edit cepat", note: "Form tetap di halaman" },
                            { icon: <Eye size={14} />, label: "Status publik", note: "Aktif atau sembunyi" },
                        ].map((item) => (
                            <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/75 px-3 py-2">
                                <div className="flex items-center gap-2 font-bdo text-[11px] font-bold text-slate-700">
                                    {item.icon}
                                    {item.label}
                                </div>
                                <p className="mt-0.5 font-bdo text-[10px] font-medium text-slate-400">{item.note}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="sponsor-scrollbar sponsor-enter delay-200 flex gap-2 overflow-x-auto rounded-[20px] border border-[#FFE0D8] bg-[#FFF7F5]/70 p-2 shadow-[0_16px_34px_-30px_rgba(127,36,25,.4)] sm:grid sm:grid-cols-4 sm:overflow-visible">
                    {[
                        { label: "Total Sponsor", value: items.length, tone: "border-[#FFD5CD] bg-[#FFF7F5] text-[#B93D2A]" },
                        { label: "Aktif", value: stats.active, tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
                        { label: "Logo Siap", value: stats.withLogo, tone: "border-sky-200 bg-sky-50 text-sky-700" },
                        { label: "Nonaktif", value: stats.inactive, tone: "border-slate-200 bg-white text-slate-600" },
                    ].map((item) => (
                        <div key={item.label} className={cn("flex min-h-[54px] min-w-[150px] items-center justify-between gap-3 rounded-[16px] border px-3 py-2 shadow-sm sm:min-w-0", item.tone)}>
                            <span className="min-w-0">
                                <span className="block truncate font-bdo text-[9px] font-bold uppercase tracking-wide opacity-70 sm:text-[10px]">{item.label}</span>
                                <span className="mt-1 block font-bdo text-[10px] font-semibold text-slate-400 sm:text-[11px]">
                                    {item.label === "Aktif" ? "Live marquee" : item.label === "Logo Siap" ? "Sudah upload" : item.label === "Nonaktif" ? "Disembunyikan" : "Semua partner"}
                                </span>
                            </span>
                            <span className="shrink-0 font-clash text-lg font-bold text-slate-950 sm:text-xl">{item.value}</span>
                        </div>
                    ))}
                </section>

                {filteredItems.length === 0 ? (
                    <section className="sponsor-enter delay-200 flex flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-[#FFD5CD] bg-[#FFF7F5] px-6 py-16 text-center">
                        <ShinyIcon className="h-14 w-14">
                            <Building2 size={22} />
                        </ShinyIcon>
                        <div>
                            <p className="font-clash text-lg font-semibold text-slate-950">
                                {items.length === 0 ? "Belum ada sponsor" : "Sponsor tidak ditemukan"}
                            </p>
                            <p className="mt-1 font-bdo text-sm text-slate-500">
                                {items.length === 0 ? "Tambahkan logo sponsor pertama untuk mengisi marquee publik." : "Coba ubah kata kunci atau filter status."}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={openNew}
                            className="sponsor-btn-sheen inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#E35336] px-5 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5"
                        >
                            <Plus size={15} />
                            Tambah Sponsor
                        </button>
                    </section>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={filteredItems.map((item) => item.id.toString())} strategy={rectSortingStrategy}>
                            <section className="sponsor-scrollbar sponsor-touch-scroll sponsor-enter delay-300 grid max-h-[58vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:max-h-[640px] sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:max-h-[calc(100vh-330px)] 2xl:grid-cols-4">
                                {filteredItems.map((item) => (
                                    <SortableCard key={item.id} id={item.id.toString()}>
                                        {(handle) => (
                                            <SponsorCard
                                                item={item}
                                                index={items.findIndex((source) => source.id === item.id)}
                                                onEdit={openEdit}
                                                onDelete={handleDelete}
                                                handle={handle}
                                            />
                                        )}
                                    </SortableCard>
                                ))}
                            </section>
                        </SortableContext>
                    </DndContext>
                )}

                <section className="sponsor-enter delay-300 flex flex-wrap items-center gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className="font-bdo text-[11px] font-semibold text-slate-500">Aktif tampil di marquee publik</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        </span>
                        <span className="font-bdo text-[11px] font-semibold text-slate-500">Nonaktif disembunyikan sementara</span>
                    </div>
                </section>
            </div>

            <SlideOver
                isOpen={slideOver.open}
                onClose={close}
                title={<span className="font-clash text-xl font-bold">{slideOver.item ? "Edit Sponsor" : "Tambah Sponsor"}</span>}
                description={
                    <span className="font-bdo text-sm text-slate-500">
                        {slideOver.item ? "Perbarui detail dan logo sponsor." : "Tambahkan sponsor baru ke marquee publik."}
                    </span>
                }
            >
                {slideOver.open && (
                    <SponsorForm key={slideOver.item?.id ?? "new"} item={slideOver.item} onClose={close} />
                )}
            </SlideOver>
        </AdminLayout>
    );
}

export default SponsorsIndex;
