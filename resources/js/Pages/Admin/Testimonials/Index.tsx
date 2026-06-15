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
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Eye,
    EyeOff,
    Filter,
    ImageIcon,
    MessageSquare,
    Pencil,
    Plus,
    Quote,
    Search,
    Sparkles,
    Star,
    Trash2,
    UploadCloud,
    X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import SortableCard from "@/Components/Admin/SortableCard";
import { SingleDropzone } from "@/Components/Admin/ImageDropzone";
import SlideOver from "@/Components/Admin/SlideOver";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { PageProps, ReviewItem, TestimonialItem } from "@/types";

type Props = PageProps<{ testimonials: TestimonialItem[]; reviews: ReviewItem[] }>;
type ActiveTab = "testimonials" | "reviews";
type StatusFilter = "all" | "active" | "inactive";
type ReviewFilter = "all" | "approved" | "pending";

const REVIEW_PAGE_SIZE = 8;

type FormData = {
    author_name: string;
    author_role: string;
    quote: string;
    is_active: boolean;
    sort_order: number;
    image: File | null;
    logo: File | null;
    _method?: string;
};

const TESTIMONIAL_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo { font-family: 'BDO Grotesk', sans-serif; }

    @keyframes testimonialFadeUp {
        from { opacity: 0; transform: translate3d(0, 22px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes testimonialShine {
        0% { background-position: -190% center; }
        100% { background-position: 210% center; }
    }
    @keyframes testimonialSheen {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(175%); }
    }
    @keyframes testimonialDot {
        0%, 100% { opacity: .78; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.18); }
    }
    .testimonial-enter { animation: testimonialFadeUp .58s cubic-bezier(.16,1,.3,1) both; will-change: opacity, transform; }
    .testimonial-title-shine {
        background: linear-gradient(115deg, #0f172a 34%, #cbd5e1 49%, #0f172a 64%);
        background-size: 220% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: testimonialShine 5s linear infinite;
    }
    .testimonial-card-glint { position: relative; }
    .testimonial-card-glint::before {
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
    .testimonial-sheen { position: relative; overflow: hidden; }
    .testimonial-sheen::after {
        content: "";
        position: absolute;
        inset-block: 0;
        width: 55%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent);
        animation: testimonialSheen 1.05s ease-out .35s forwards;
        pointer-events: none;
    }
    .testimonial-live-dot {
        display: inline-block;
        border-radius: 999px;
        animation: testimonialDot 2.5s ease-in-out infinite;
        box-shadow: 0 0 0 1px rgba(255,255,255,.74), 0 0 13px currentColor;
    }
    .testimonial-input {
        border: 1px solid rgb(248 181 168 / .62);
        background: rgba(255,255,255,.86);
        color: #0f172a;
        outline: none;
        transition: border-color .16s ease, box-shadow .16s ease, background .16s ease;
    }
    .testimonial-input:focus {
        border-color: rgb(227 83 54 / .62);
        background: #fff;
        box-shadow: 0 0 0 4px rgb(227 83 54 / .10);
    }
    .testimonial-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.32) transparent;
    }
    .testimonial-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .testimonial-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .testimonial-scrollbar::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(227,83,54,.30);
        border: 1px solid rgba(255,255,255,.8);
    }
    .testimonial-touch-scroll {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        touch-action: pan-y;
    }
    @media (prefers-reduced-motion: reduce) {
        .testimonial-enter, .testimonial-title-shine, .testimonial-sheen::after, .testimonial-live-dot {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
        }
    }
`;

const inputBase =
    "testimonial-input h-11 w-full rounded-[16px] px-3.5 font-bdo text-[13px] font-semibold placeholder:text-slate-400";
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

function StarRow({ rating, size = 13 }: { rating: number; size?: number }) {
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((value) => (
                <Star
                    key={value}
                    size={size}
                    className={value <= rating ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}
                />
            ))}
        </div>
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

function TestimonialForm({ item, onClose }: { item: TestimonialItem | null; onClose: () => void }) {
    const isEdit = item !== null;
    const { data, setData, post, processing, errors } = useForm<FormData>({
        author_name: item?.author_name ?? "",
        author_role: item?.author_role ?? "",
        quote: item?.quote ?? "",
        is_active: item?.is_active ?? true,
        sort_order: item?.sort_order ?? 0,
        image: null,
        logo: null,
        ...(isEdit ? { _method: "PUT" } : {}),
    });

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const url = isEdit
            ? route("admin.testimonials.update", item!.id)
            : route("admin.testimonials.store");

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
                            {isEdit ? "Perbarui testimoni" : "Testimoni baru"}
                        </p>
                        <p className="mt-1 font-bdo text-xs font-medium leading-5 text-slate-500">
                            Lengkapi kutipan, foto, logo, dan status publikasi agar tampil rapi di halaman publik.
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <label htmlFor="testimonial_author_name" className={labelBase}>Nama Institusi / Tokoh</label>
                <input
                    id="testimonial_author_name"
                    type="text"
                    value={data.author_name}
                    onChange={(event) => setData("author_name", event.target.value)}
                    placeholder="Contoh: Malang Tennis Academy"
                    className={inputBase}
                />
                {errors.author_name && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.author_name}</p>}
            </div>

            <div>
                <label htmlFor="testimonial_author_role" className={labelBase}>Peran / Jabatan</label>
                <input
                    id="testimonial_author_role"
                    type="text"
                    value={data.author_role}
                    onChange={(event) => setData("author_role", event.target.value)}
                    placeholder="Contoh: Klub Futsal, Akademi Tenis"
                    className={inputBase}
                />
                {errors.author_role && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.author_role}</p>}
            </div>

            <div>
                <label htmlFor="testimonial_quote" className={labelBase}>Kutipan Testimoni</label>
                <textarea
                    id="testimonial_quote"
                    value={data.quote}
                    onChange={(event) => setData("quote", event.target.value)}
                    placeholder="Tuliskan kutipan testimoni..."
                    rows={5}
                    className={cn(inputBase, "h-auto resize-none py-3 leading-6")}
                />
                {errors.quote && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.quote}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
                <div>
                    <label htmlFor="testimonial_sort_order" className={labelBase}>Urutan Tampil</label>
                    <input
                        id="testimonial_sort_order"
                        type="number"
                        min={0}
                        value={data.sort_order}
                        onChange={(event) => setData("sort_order", Number(event.target.value))}
                        className={cn(inputBase, "font-mono")}
                    />
                </div>

                <label className="flex items-center justify-between gap-3 self-end rounded-2xl border border-[#F8B5A8]/60 bg-[#FFF7F5] px-4 py-3">
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
                        aria-label="Status aktif testimoni"
                    />
                </label>
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-white p-2.5">
                <SingleDropzone
                    label="Foto Institusi / Tokoh"
                    currentUrl={item?.image_url ?? null}
                    onFileSelect={(file) => setData("image", file)}
                />
                {errors.image && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.image}</p>}
            </div>

            <div className="rounded-[20px] border border-slate-200 bg-white p-2.5">
                <SingleDropzone
                    label="Logo Institusi"
                    currentUrl={item?.logo_url ?? null}
                    onFileSelect={(file) => setData("logo", file)}
                />
                {errors.logo && <p className="mt-1.5 font-bdo text-xs text-rose-500">{errors.logo}</p>}
            </div>

            <div className="grid gap-2 rounded-[22px] border border-slate-200 bg-slate-50/75 p-3 sm:grid-cols-3">
                {[
                    { label: "Mode", value: isEdit ? "Edit" : "Baru" },
                    { label: "Status", value: data.is_active ? "Aktif" : "Nonaktif" },
                    { label: "Urutan", value: data.sort_order || "Auto" },
                ].map((meta) => (
                    <div key={meta.label} className="rounded-2xl bg-white px-3 py-2 ring-1 ring-slate-200/70">
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
                    className="testimonial-sheen inline-flex h-11 items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_16px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <CheckCircle2 size={15} />
                    {processing ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah Testimoni"}
                </button>
            </div>
        </form>
    );
}

function TestimonialPreview({ item, className }: { item: TestimonialItem | null; className?: string }) {
    return (
        <div className={cn("testimonial-card-glint snap-start overflow-hidden rounded-[18px] border border-white/22 bg-white/95 p-2 shadow-[0_24px_50px_-36px_rgba(15,23,42,.55)] backdrop-blur", className)}>
            <div className="relative h-[164px] overflow-hidden rounded-[14px] bg-[linear-gradient(145deg,#FFF1EE_0%,#F8FAFC_100%)] ring-1 ring-[#FFE0D8] sm:h-[182px]">
                {item?.image_url ? (
                    <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-[#B93D2A]/45">
                        <ImageIcon size={34} />
                        <span className="font-bdo text-xs font-bold uppercase tracking-wide">Belum ada foto</span>
                    </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950/76 via-slate-950/22 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <StatusPill active={item?.is_active ?? false} />
                        {item?.logo_url && (
                            <span className="flex h-8 w-8 items-center justify-center rounded-[14px] border border-white/55 bg-white/90 p-1.5 shadow-sm backdrop-blur">
                                <img src={item.logo_url} alt="" className="h-full w-full object-contain" />
                            </span>
                        )}
                    </div>
                    <p className="line-clamp-1 font-clash text-lg font-semibold text-white">
                        {item?.author_name ?? "Preview testimoni"}
                    </p>
                    <p className="mt-0.5 line-clamp-1 font-bdo text-xs font-bold text-white/72">
                        {item?.author_role ?? "Testimoni aktif akan tampil di sini"}
                    </p>
                </div>
            </div>

            <div className="mt-2 rounded-[14px] border border-[#FFE0D8] bg-[#FFF7F5] p-3">
                <Quote className="h-4 w-4 text-[#E35336]" />
                <p className="mt-2 line-clamp-2 font-bdo text-xs font-semibold leading-5 text-slate-600">
                    {item?.quote ?? "Tambahkan testimoni untuk membangun bukti sosial yang kuat di halaman publik."}
                </p>
            </div>
        </div>
    );
}

function TestimonialThumb({ item }: { item: TestimonialItem }) {
    return (
        <span className="relative flex h-14 min-w-[92px] items-center justify-center overflow-hidden rounded-[11px] border border-white/30 bg-white/10 shadow-sm ring-1 ring-white/12">
            {item.image_url ? (
                <img src={item.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : item.logo_url ? (
                <img src={item.logo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
                <span className="px-2 text-center font-bdo text-[10px] font-bold leading-tight text-white/70">{item.author_name}</span>
            )}
            {(item.image_url || item.logo_url) && <span className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-slate-950/56 to-transparent" />}
        </span>
    );
}

function TestimonialPreviewRail({ items }: { items: TestimonialItem[] }) {
    const previewItems = items.length > 0 ? items : [null];

    return (
        <div className="min-w-0 rounded-[20px] border border-white/22 bg-white/14 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.16)] backdrop-blur">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div>
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-white/58">Live preview testimoni aktif</p>
                    <p className="mt-0.5 font-clash text-sm font-semibold text-white">Geser kanan kiri untuk melihat konten</p>
                </div>
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] border border-white/22 bg-white/14 text-white">
                    <ChevronRight size={15} />
                </span>
            </div>

            <div className="testimonial-scrollbar testimonial-touch-scroll flex snap-x gap-2.5 overflow-x-auto pb-1">
                {previewItems.map((item, index) => (
                    <TestimonialPreview
                        key={item?.id ?? `empty-${index}`}
                        item={item}
                        className="w-[286px] shrink-0 sm:w-[320px] xl:w-[336px]"
                    />
                ))}
            </div>
        </div>
    );
}

function PublicStrip({ activeItems, activeCount }: { activeItems: TestimonialItem[]; activeCount: number }) {
    return (
        <div className="rounded-[20px] border border-white/28 bg-white/16 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,.2)] backdrop-blur sm:rounded-[22px]">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-white/58">Tampil publik</p>
                    <p className="mt-1 font-clash text-[1rem] font-semibold leading-tight text-white sm:text-lg">
                        {activeCount > 0 ? `${activeCount} testimoni aktif` : "Belum ada testimoni aktif"}
                    </p>
                </div>
                <div className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/22 bg-white px-2.5 py-1.5 font-bdo text-[0px] font-bold text-[#B93D2A] sm:gap-2 sm:px-3 sm:py-2 sm:text-[11px]">
                    <Eye size={14} />
                    <span className="hidden sm:inline">Live preview</span>
                </div>
            </div>

            <div className="testimonial-scrollbar testimonial-touch-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
                {activeItems.length > 0 ? activeItems.slice(0, 8).map((item) => (
                    <TestimonialThumb key={item.id} item={item} />
                )) : (
                    <span className="flex h-12 min-w-[180px] items-center justify-center rounded-[15px] border border-dashed border-white/36 bg-white/12 px-4 font-bdo text-xs font-semibold text-white/62">
                        Aktifkan testimoni
                    </span>
                )}
            </div>
        </div>
    );
}

function HeroSection({
    items,
    reviews,
    onCreate,
}: {
    items: TestimonialItem[];
    reviews: ReviewItem[];
    onCreate: () => void;
}) {
    const activeItems = items.filter((item) => item.is_active);
    const approved = reviews.filter((review) => review.is_approved).length;
    const previewItems = activeItems.length > 0 ? activeItems : items;

    return (
        <section className="testimonial-enter testimonial-sheen relative overflow-hidden rounded-[26px] border border-[#F8B5A8]/70 bg-[linear-gradient(135deg,#E35336_0%,#B93D2A_55%,#7F2419_100%)] text-white shadow-[0_24px_64px_-50px_rgba(185,61,42,.92)] sm:rounded-[30px]">
            <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.075)_0,rgba(255,255,255,.075)_1px,transparent_1px,transparent_24px)]" />
            <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-white/16 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 left-12 h-64 w-64 rounded-full bg-[#F8B5A8]/24 blur-3xl" />

            <div className="relative z-10 grid gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(330px,.92fr)] xl:grid-cols-[minmax(0,1.13fr)_minmax(360px,.87fr)] xl:p-4">
                <div className="flex min-w-0 flex-col justify-between gap-3 sm:gap-4">
                    <div className="max-w-3xl">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/15 px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-wide text-white shadow-sm backdrop-blur">
                            <span className="testimonial-live-dot h-1.5 w-1.5 bg-white text-white" />
                            Trust content desk
                        </span>
                        <h2 className="mt-3 font-clash text-[1.9rem] font-bold uppercase leading-[.96] tracking-tight text-white sm:text-[2.65rem] lg:text-[2.95rem] xl:text-[3.55rem]">
                            Testimoni & Review
                        </h2>
                        <p className="mt-2 max-w-2xl font-bdo text-xs font-semibold leading-5 text-white/74 sm:text-sm sm:leading-6">
                            Kurasi bukti sosial, atur urutan testimoni, dan validasi review pengguna dalam ruang kerja yang padat namun mudah dipakai.
                        </p>
                    </div>

                    <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_176px] xl:grid-cols-[minmax(0,1fr)_190px]">
                        <PublicStrip activeItems={activeItems} activeCount={activeItems.length} />
                        <button
                            type="button"
                            onClick={onCreate}
                            className="group flex min-h-[78px] items-center gap-3 rounded-[20px] border border-white/18 bg-white p-3.5 text-[#B93D2A] shadow-[0_20px_42px_-30px_rgba(15,23,42,.48)] transition hover:-translate-y-1 md:min-h-[128px] md:flex-col md:items-stretch md:justify-between md:rounded-[22px]"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-[#FFD5CD] bg-[#FFF1EE] md:h-11 md:w-11">
                                <Plus size={18} />
                            </span>
                            <span className="min-w-0 text-left">
                                <span className="block font-clash text-base font-semibold text-slate-950">Tambah Testimoni</span>
                                <span className="mt-1 block font-bdo text-[11px] font-bold text-slate-500">
                                    Foto, logo, dan kutipan.
                                </span>
                            </span>
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: "Total", value: items.length },
                            { label: "Aktif", value: activeItems.length },
                            { label: "Review", value: approved },
                        ].map((item) => (
                            <div key={item.label} className="rounded-[16px] border border-white/18 bg-white/12 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,.16)] backdrop-blur">
                                <p className="font-clash text-lg font-bold leading-none text-white">{item.value}</p>
                                <p className="mt-1 truncate font-bdo text-[9px] font-bold uppercase tracking-wide text-white/60">{item.label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <TestimonialPreviewRail items={previewItems} />
            </div>
        </section>
    );
}

function TabSwitcher({
    activeTab,
    setActiveTab,
    testimonialCount,
    pendingCount,
}: {
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
    testimonialCount: number;
    pendingCount: number;
}) {
    const tabs = [
        { value: "testimonials" as const, label: "Testimoni", icon: Building2, count: testimonialCount },
        { value: "reviews" as const, label: "Review", icon: MessageSquare, count: pendingCount },
    ];

    return (
        <section className="testimonial-enter grid grid-cols-2 gap-1.5 rounded-[20px] border border-[#FFE0D8] bg-white p-1.5 shadow-sm">
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.value;
                return (
                    <button
                        key={tab.value}
                        type="button"
                        onClick={() => setActiveTab(tab.value)}
                        className={cn(
                            "flex h-10 items-center justify-center gap-2 rounded-[15px] px-3 font-clash text-[13px] font-semibold transition",
                            active
                                ? "bg-[#FFF1EE] text-[#B93D2A] ring-1 ring-[#FFD5CD]"
                                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                        )}
                    >
                        <Icon size={15} />
                        <span className="truncate">{tab.label}</span>
                        {tab.count > 0 && (
                            <span className={cn(
                                "rounded-full px-2 py-0.5 font-bdo text-[10px] font-bold",
                                active ? "bg-white text-[#B93D2A]" : "bg-slate-100 text-slate-500",
                            )}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </section>
    );
}

function TestimonialToolbar({
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
    return (
        <div className="flex flex-col gap-3 border-b border-[#FFE0D8] bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF8F5_100%)] p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
                <ShinyIcon className="h-10 w-10">
                    <Building2 size={17} />
                </ShinyIcon>
                <div>
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Testimonial Board</p>
                    <h2 className="font-clash text-base font-semibold leading-tight text-slate-950">Testimoni Institusi</h2>
                </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_178px] lg:min-w-[500px] xl:min-w-[540px]">
                <label className="testimonial-input flex h-10 min-w-0 items-center gap-2 rounded-[15px] px-3.5">
                    <Search size={15} className="shrink-0 text-slate-400" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Cari nama, peran, kutipan..."
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-bdo text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                    />
                </label>

                <label className="testimonial-input relative flex h-10 items-center gap-2 rounded-[15px] px-3">
                    <Filter size={14} className="shrink-0 text-slate-400" />
                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as StatusFilter)}
                        aria-label="Filter status testimoni"
                        className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 pr-7 font-bdo text-sm font-bold text-slate-700 outline-none focus:ring-0"
                    >
                        <option value="all">Semua status</option>
                        <option value="active">Aktif</option>
                        <option value="inactive">Nonaktif</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </label>
            </div>

            <span className="rounded-full border border-[#FFD5CD] bg-[#FFF7F5] px-3 py-1.5 font-bdo text-[11px] font-bold text-[#B93D2A] lg:hidden">
                {total} hasil
            </span>
        </div>
    );
}

function TestimonialCard({
    item,
    index,
    onEdit,
    onDelete,
    handle,
}: {
    item: TestimonialItem;
    index: number;
    onEdit: (item: TestimonialItem) => void;
    onDelete: (item: TestimonialItem) => void;
    handle: ReactNode;
}) {
    return (
        <article className="group testimonial-card-glint grid grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-[#FFE0D8] bg-[linear-gradient(180deg,#FFFFFF_0%,#FFF7F5_145%)] shadow-[0_12px_30px_-28px_rgba(185,61,42,.56)] transition hover:-translate-y-0.5 hover:border-[#F8B5A8] hover:shadow-[0_22px_48px_-38px_rgba(185,61,42,.68)] min-[430px]:grid-cols-[100px_minmax(0,1fr)] sm:flex sm:flex-col sm:rounded-[22px]">
            <div className="relative min-h-[122px] overflow-hidden bg-[#FFF1EE] min-[430px]:min-h-[136px] sm:m-2.5 sm:aspect-[16/9.8] sm:min-h-0 sm:rounded-[18px] sm:ring-1 sm:ring-[#FFE0D8]">
                {item.image_url ? (
                    <img src={item.image_url} alt="" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#FFF1EE,#F8B5A8)] text-[#B93D2A]/45">
                        <ImageIcon size={32} />
                    </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/64 to-transparent" />
                <div className="absolute left-2 top-2 z-20">{handle}</div>
                <span className="absolute right-2 top-2 rounded-full border border-white/45 bg-white/24 px-2 py-1 font-bdo text-[9px] font-bold text-white backdrop-blur">
                    #{index + 1}
                </span>
                {item.logo_url && (
                    <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-[14px] border border-white/55 bg-white/90 p-1.5 shadow-sm backdrop-blur">
                        <img src={item.logo_url} alt="" className="h-full w-full object-contain" />
                    </span>
                )}
            </div>

            <div className="flex min-w-0 flex-col justify-between gap-2 p-2.5 sm:gap-2.5 sm:px-3.5 sm:pb-3.5 sm:pt-1">
                <div className="min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-clash text-sm font-semibold leading-tight text-slate-950 min-[430px]:text-[15px] sm:text-base">
                            {item.author_name}
                        </p>
                        <StatusPill active={item.is_active} />
                    </div>
                    <p className="mt-1 truncate font-bdo text-[11px] font-bold text-[#B93D2A]">{item.author_role}</p>
                    <p className="mt-2 line-clamp-3 font-bdo text-xs font-semibold leading-5 text-slate-500">
                        {item.quote}
                    </p>
                </div>

                <div className="flex items-center justify-end gap-1.5 border-t border-[#FFE0D8] pt-2.5">
                    <ActionButton
                        onClick={() => onEdit(item)}
                        className="border-slate-200 bg-white text-slate-500 hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                        aria-label={`Edit ${item.author_name}`}
                    >
                        <Pencil size={14} />
                    </ActionButton>
                    <ActionButton
                        onClick={() => onDelete(item)}
                        className="border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100"
                        aria-label={`Hapus ${item.author_name}`}
                    >
                        <Trash2 size={14} />
                    </ActionButton>
                </div>
            </div>
        </article>
    );
}

function ReviewsToolbar({
    query,
    setQuery,
    filter,
    setFilter,
    total,
}: {
    query: string;
    setQuery: (value: string) => void;
    filter: ReviewFilter;
    setFilter: (value: ReviewFilter) => void;
    total: number;
}) {
    return (
        <div className="flex flex-col gap-3 border-b border-[#FFE0D8] bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF8F5_100%)] p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
                <ShinyIcon className="h-10 w-10">
                    <MessageSquare size={17} />
                </ShinyIcon>
                <div>
                    <p className="font-bdo text-[10px] font-bold uppercase tracking-widest text-slate-400">Review Queue</p>
                    <h2 className="font-clash text-base font-semibold leading-tight text-slate-950">Review Pengguna</h2>
                </div>
            </div>

            <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_178px] lg:min-w-[500px] xl:min-w-[540px]">
                <label className="testimonial-input flex h-10 min-w-0 items-center gap-2 rounded-[15px] px-3.5">
                    <Search size={15} className="shrink-0 text-slate-400" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Cari reviewer atau isi review..."
                        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-bdo text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:ring-0"
                    />
                </label>

                <label className="testimonial-input relative flex h-10 items-center gap-2 rounded-[15px] px-3">
                    <Filter size={14} className="shrink-0 text-slate-400" />
                    <select
                        value={filter}
                        onChange={(event) => setFilter(event.target.value as ReviewFilter)}
                        aria-label="Filter status review"
                        className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 pr-7 font-bdo text-sm font-bold text-slate-700 outline-none focus:ring-0"
                    >
                        <option value="all">Semua review</option>
                        <option value="approved">Disetujui</option>
                        <option value="pending">Pending</option>
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </label>
            </div>

            <span className="rounded-full border border-[#FFD5CD] bg-[#FFF7F5] px-3 py-1.5 font-bdo text-[11px] font-bold text-[#B93D2A] lg:hidden">
                {total} hasil
            </span>
        </div>
    );
}

function ReviewCard({
    review,
    onToggle,
    onDelete,
}: {
    review: ReviewItem;
    onToggle: (review: ReviewItem) => void;
    onDelete: (review: ReviewItem) => void;
}) {
    return (
        <article
            className={cn(
                "rounded-[20px] border bg-white p-3.5 shadow-[0_12px_30px_-28px_rgba(185,61,42,.42)] transition hover:border-[#F8B5A8]",
                review.is_approved ? "border-[#FFE0D8]" : "border-amber-200 bg-amber-50/45",
            )}
        >
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-[#FFF1EE] font-clash text-sm font-bold text-[#B93D2A] ring-1 ring-[#FFD5CD]">
                    {review.reviewer_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate font-clash text-sm font-semibold text-slate-950">{review.reviewer_name}</p>
                        <StarRow rating={review.rating} />
                    </div>
                    <p className="mt-1 font-bdo text-[11px] font-semibold text-slate-400">{review.created_at}</p>
                </div>
                <span
                    className={cn(
                        "shrink-0 rounded-full border px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-wide",
                        review.is_approved
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700",
                    )}
                >
                    {review.is_approved ? "Disetujui" : "Pending"}
                </span>
            </div>
            <p className="mt-3 line-clamp-3 font-bdo text-[13px] font-semibold leading-5 text-slate-600">{review.text}</p>
            <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#FFE0D8] pt-3">
                <button
                    type="button"
                    onClick={() => onToggle(review)}
                    className={cn(
                        "inline-flex h-9 items-center justify-center gap-2 rounded-[14px] px-3.5 font-clash text-xs font-semibold transition",
                        review.is_approved
                            ? "border border-slate-200 bg-white text-slate-500 hover:bg-slate-100"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
                    )}
                >
                    {review.is_approved ? <X size={14} /> : <Check size={14} />}
                    {review.is_approved ? "Batalkan" : "Setujui"}
                </button>
                <ActionButton
                    onClick={() => onDelete(review)}
                    className="border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100"
                    aria-label={`Hapus review ${review.reviewer_name}`}
                >
                    <Trash2 size={15} />
                </ActionButton>
            </div>
        </article>
    );
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
    return (
        <div className="rounded-[24px] border border-dashed border-[#F8B5A8] bg-[#FFF7F5] p-8 text-center">
            <ShinyIcon className="mx-auto h-12 w-12">{icon}</ShinyIcon>
            <p className="mt-4 font-clash text-lg font-semibold text-slate-950">{title}</p>
            <p className="mx-auto mt-1 max-w-sm font-bdo text-sm text-slate-500">{text}</p>
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export default function TestimonialsIndex() {
    const { testimonials: initialTestimonials, reviews } = usePage<Props>().props;

    const [items, setItems] = useState<TestimonialItem[]>(initialTestimonials);
    const [activeTab, setActiveTab] = useState<ActiveTab>("testimonials");
    const [slideOver, setSlideOver] = useState<{ open: boolean; item: TestimonialItem | null }>({
        open: false,
        item: null,
    });
    const [testimonialQuery, setTestimonialQuery] = useState("");
    const [testimonialStatus, setTestimonialStatus] = useState<StatusFilter>("all");
    const [reviewQuery, setReviewQuery] = useState("");
    const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
    const [reviewPage, setReviewPage] = useState(1);

    useEffect(() => setItems(initialTestimonials), [initialTestimonials]);

    const openNew = () => setSlideOver({ open: true, item: null });
    const openEdit = (item: TestimonialItem) => setSlideOver({ open: true, item });
    const close = () => setSlideOver({ open: false, item: null });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    );

    const filteredTestimonials = useMemo(() => {
        const normalized = testimonialQuery.trim().toLowerCase();

        return items.filter((item) => {
            const matchesStatus =
                testimonialStatus === "all" || (testimonialStatus === "active" ? item.is_active : !item.is_active);
            const matchesQuery = normalized.length === 0 || [
                item.author_name,
                item.author_role,
                item.quote,
            ].join(" ").toLowerCase().includes(normalized);

            return matchesStatus && matchesQuery;
        });
    }, [items, testimonialQuery, testimonialStatus]);

    const filteredReviews = useMemo(() => {
        const normalized = reviewQuery.trim().toLowerCase();

        return reviews.filter((review) => {
            const matchesFilter =
                reviewFilter === "all" || (reviewFilter === "approved" ? review.is_approved : !review.is_approved);
            const matchesQuery = normalized.length === 0 || [
                review.reviewer_name,
                review.text,
                String(review.rating),
            ].join(" ").toLowerCase().includes(normalized);

            return matchesFilter && matchesQuery;
        });
    }, [reviews, reviewFilter, reviewQuery]);

    useEffect(() => {
        setReviewPage(1);
    }, [reviewFilter, reviewQuery]);

    const reviewPageCount = Math.max(1, Math.ceil(filteredReviews.length / REVIEW_PAGE_SIZE));
    const safeReviewPage = Math.min(reviewPage, reviewPageCount);
    const reviewStart = (safeReviewPage - 1) * REVIEW_PAGE_SIZE;
    const reviewEnd = Math.min(reviewStart + REVIEW_PAGE_SIZE, filteredReviews.length);
    const paginatedReviews = filteredReviews.slice(reviewStart, reviewEnd);

    const activeCount = items.filter((item) => item.is_active).length;
    const pendingCount = reviews.filter((review) => !review.is_approved).length;
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = items.findIndex((item) => item.id.toString() === active.id);
        const newIndex = items.findIndex((item) => item.id.toString() === over.id);
        if (oldIndex < 0 || newIndex < 0) return;

        const reordered = arrayMove(items, oldIndex, newIndex);
        setItems(reordered);
        router.post(
            route("admin.testimonials.reorder"),
            { ids: reordered.map((item) => item.id) },
            { preserveScroll: true },
        );
    };

    const handleDelete = (item: TestimonialItem) => {
        if (!confirm(`Hapus testimoni dari "${item.author_name}"?`)) return;
        router.delete(route("admin.testimonials.destroy", item.id), { preserveScroll: true });
    };

    const handleToggleApprove = (review: ReviewItem) => {
        router.post(
            route("admin.reviews.toggle-approve", review.id),
            {},
            { preserveScroll: true },
        );
    };

    const handleDeleteReview = (review: ReviewItem) => {
        if (!confirm(`Hapus review dari "${review.reviewer_name}"?`)) return;
        router.delete(route("admin.reviews.destroy", review.id), { preserveScroll: true });
    };

    return (
        <AdminLayout
            header={
                <div className="flex flex-col gap-1 pt-3 testimonial-enter">
                    <style dangerouslySetInnerHTML={{ __html: TESTIMONIAL_STYLES }} />
                    <span className="font-bdo text-[11px] font-medium tracking-wide text-[#E35336]">
                        Manajemen Konten
                    </span>
                    <h1 className="font-clash text-2xl font-bold uppercase tracking-tight xl:text-3xl">
                        <span className="testimonial-title-shine">Testimonials</span>
                    </h1>
                </div>
            }
        >
            <Head title="Testimoni & Review" />

            <div className="flex flex-col gap-4 overflow-x-hidden pb-16 pt-4">
                <HeroSection
                    items={items}
                    reviews={reviews}
                    onCreate={openNew}
                />

                <TabSwitcher
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    testimonialCount={items.length}
                    pendingCount={pendingCount}
                />

                {activeTab === "testimonials" && (
                    <section className="testimonial-enter testimonial-card-glint overflow-hidden rounded-[24px] border border-[#FFE0D8] bg-white shadow-[0_18px_42px_-38px_rgba(185,61,42,.48)]">
                        <TestimonialToolbar
                            query={testimonialQuery}
                            setQuery={setTestimonialQuery}
                            status={testimonialStatus}
                            setStatus={setTestimonialStatus}
                            total={filteredTestimonials.length}
                        />

                        <div className="border-b border-[#FFE0D8] bg-[#FFF7F5]/70 p-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-bdo text-[10px] font-bold text-emerald-700">
                                    {activeCount} aktif
                                </span>
                                <span className="rounded-full border border-[#FFD5CD] bg-white px-3 py-1.5 font-bdo text-[10px] font-bold text-[#B93D2A]">
                                    {items.length} total
                                </span>
                                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-bdo text-[10px] font-bold text-slate-500">
                                    Seret handle untuk urutan
                                </span>
                                <button
                                    type="button"
                                    onClick={openNew}
                                    className="ml-auto inline-flex h-9 items-center justify-center gap-2 rounded-[15px] bg-[#E35336] px-3.5 font-clash text-xs font-semibold text-white shadow-[0_14px_26px_-20px_rgba(227,83,54,.85)] transition hover:bg-[#B93D2A]"
                                >
                                    <Plus size={14} />
                                    Tambah
                                </button>
                            </div>
                        </div>

                        <div className="testimonial-scrollbar testimonial-touch-scroll max-h-[70vh] overflow-y-auto p-2.5 sm:p-3 lg:max-h-[590px]">
                            {filteredTestimonials.length === 0 ? (
                                <EmptyState
                                    icon={<Building2 size={20} />}
                                    title={items.length === 0 ? "Belum ada testimoni" : "Testimoni tidak ditemukan"}
                                    text={items.length === 0 ? "Tambahkan testimoni pertama untuk mengisi area bukti sosial publik." : "Coba ubah kata kunci atau filter status."}
                                    action={
                                        <button
                                            type="button"
                                            onClick={openNew}
                                            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#E35336] px-5 font-clash text-sm font-semibold text-white shadow-[0_14px_26px_-20px_rgba(227,83,54,.85)] transition hover:bg-[#B93D2A]"
                                        >
                                            <Plus size={14} />
                                            Tambah Testimoni
                                        </button>
                                    }
                                />
                            ) : (
                                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                    <SortableContext items={filteredTestimonials.map((item) => item.id.toString())} strategy={rectSortingStrategy}>
                                        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                            {filteredTestimonials.map((item, index) => (
                                                <SortableCard key={item.id} id={item.id.toString()}>
                                                    {(handle) => (
                                                        <TestimonialCard
                                                            item={item}
                                                            index={index}
                                                            onEdit={openEdit}
                                                            onDelete={handleDelete}
                                                            handle={handle}
                                                        />
                                                    )}
                                                </SortableCard>
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>
                    </section>
                )}

                {activeTab === "reviews" && (
                    <section className="testimonial-enter testimonial-card-glint overflow-hidden rounded-[24px] border border-[#FFE0D8] bg-white shadow-[0_18px_42px_-38px_rgba(185,61,42,.48)]">
                        <ReviewsToolbar
                            query={reviewQuery}
                            setQuery={setReviewQuery}
                            filter={reviewFilter}
                            setFilter={setReviewFilter}
                            total={filteredReviews.length}
                        />

                        <div className="grid gap-2.5 border-b border-[#FFE0D8] bg-[#FFF7F5]/70 p-2.5 sm:grid-cols-3">
                            <div className="rounded-[18px] border border-[#FFD5CD] bg-white px-3.5 py-2.5">
                                <p className="font-bdo text-[10px] font-bold uppercase tracking-wide text-slate-400">Total</p>
                                <p className="mt-1 font-clash text-lg font-bold text-slate-950">{reviews.length} review</p>
                            </div>
                            <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
                                <p className="font-bdo text-[10px] font-bold uppercase tracking-wide text-emerald-600/70">Disetujui</p>
                                <p className="mt-1 font-clash text-lg font-bold text-emerald-800">{reviews.filter((review) => review.is_approved).length}</p>
                            </div>
                            <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-3.5 py-2.5">
                                <p className="font-bdo text-[10px] font-bold uppercase tracking-wide text-amber-600/70">Pending</p>
                                <p className="mt-1 font-clash text-lg font-bold text-amber-800">{pendingCount}</p>
                            </div>
                        </div>

                        <div className="testimonial-scrollbar max-h-[590px] overflow-y-auto p-2.5 sm:p-3">
                            {filteredReviews.length === 0 ? (
                                <EmptyState
                                    icon={<MessageSquare size={20} />}
                                    title={reviews.length === 0 ? "Belum ada review" : "Review tidak ditemukan"}
                                    text={reviews.length === 0 ? "Review pengguna akan muncul di sini setelah mereka mengirim ulasan." : "Coba ubah kata kunci atau filter review."}
                                />
                            ) : (
                                <div className="grid gap-2.5 lg:grid-cols-2">
                                    {paginatedReviews.map((review) => (
                                        <ReviewCard
                                            key={review.id}
                                            review={review}
                                            onToggle={handleToggleApprove}
                                            onDelete={handleDeleteReview}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {filteredReviews.length > 0 && (
                            <div className="flex flex-col gap-2.5 border-t border-[#FFE0D8] bg-[#FFF7F5]/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                                <p className="font-bdo text-xs font-semibold text-slate-500">
                                    Menampilkan {reviewStart + 1}-{reviewEnd} dari {filteredReviews.length} review
                                </p>
                                <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 sm:flex">
                                    <ActionButton
                                        disabled={safeReviewPage <= 1}
                                        onClick={() => setReviewPage((page) => Math.max(1, page - 1))}
                                        className="border-slate-200 bg-white text-slate-500 hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                                        aria-label="Halaman sebelumnya"
                                    >
                                        <ChevronLeft size={16} />
                                    </ActionButton>
                                    <div className="flex h-9 min-w-[96px] items-center justify-center rounded-[14px] border border-slate-200 bg-white px-3 font-bdo text-xs font-bold text-slate-600">
                                        {safeReviewPage} / {reviewPageCount}
                                    </div>
                                    <ActionButton
                                        disabled={safeReviewPage >= reviewPageCount}
                                        onClick={() => setReviewPage((page) => Math.min(reviewPageCount, page + 1))}
                                        className="border-slate-200 bg-white text-slate-500 hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                                        aria-label="Halaman berikutnya"
                                    >
                                        <ChevronRight size={16} />
                                    </ActionButton>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                <section className="testimonial-enter grid gap-2.5 rounded-[22px] border border-[#FFE0D8] bg-[#FFF7F5]/70 p-2.5 sm:grid-cols-3">
                    {[
                        { icon: <Sparkles size={15} />, label: "Kutipan singkat", text: "Pilih testimoni yang kuat dan cepat dibaca pengunjung." },
                        { icon: <EyeOff size={15} />, label: "Status aman", text: "Nonaktifkan konten tanpa menghapus arsipnya." },
                        { icon: <Star size={15} />, label: "Review valid", text: "Setujui review sebelum muncul sebagai bukti sosial." },
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
                title={<span className="font-clash text-xl font-bold">{slideOver.item ? "Edit Testimoni" : "Tambah Testimoni"}</span>}
                description={
                    <span className="font-bdo text-sm text-slate-500">
                        {slideOver.item ? "Perbarui detail testimoni institusi." : "Tambahkan testimoni baru untuk halaman publik."}
                    </span>
                }
            >
                {slideOver.open && (
                    <TestimonialForm
                        key={slideOver.item?.id ?? "new"}
                        item={slideOver.item}
                        onClose={close}
                    />
                )}
            </SlideOver>
        </AdminLayout>
    );
}
