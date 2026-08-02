import { Head, router, useForm, usePage } from "@inertiajs/react";
import {
    Activity,
    ArrowRight,
    BadgeCheck,
    CheckCircle2,
    Crown,
    Gem,
    Layers3,
    Pencil,
    Plus,
    ReceiptText,
    Sparkles,
    Timer,
    Trash2,
    Users,
    X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import SlideOver from "@/Components/Admin/SlideOver";
import { SingleDropzone } from "@/Components/Admin/ImageDropzone";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { MembershipPlanItem, MembershipPlanTier, PageProps } from "@/types";

type Props = PageProps<{ plans: MembershipPlanItem[] }>;

type PlanFormData = {
    name: string;
    description: string;
    tier: MembershipPlanTier;
    savings_label: string;
    cta_label: string;
    card_image: File | null;
    remove_card_image: boolean;
    price: string;
    compare_at_price: string;
    duration_months: number;
    features: string[];
    is_active: boolean;
    is_primary: boolean;
    sort_order: string;
    _method?: "PATCH";
};

const MEMBERSHIP_TIER_OPTIONS: Array<{
    value: MembershipPlanTier;
    label: string;
    order: string;
    description: string;
    swatch: string;
    active: string;
    badge: string;
}> = [
    {
        value: "hemat",
        label: "Hemat",
        order: "01",
        description: "Monokrom tenang untuk paket paling terjangkau.",
        swatch: "bg-[linear-gradient(145deg,#d9dde0_0%,#7b858d_52%,#343a40_100%)]",
        active: "border-slate-500 bg-slate-50 shadow-[0_14px_28px_-24px_rgba(15,23,42,.75)]",
        badge: "border-slate-300 bg-slate-100 text-slate-700",
    },
    {
        value: "favorit",
        label: "Favorit",
        order: "02",
        description: "Biru original untuk pilihan utama pengguna.",
        swatch: "bg-[linear-gradient(145deg,#42a5f5_0%,#1e6fd9_52%,#1530a8_100%)]",
        active: "border-sky-500 bg-sky-50 shadow-[0_14px_28px_-24px_rgba(14,93,132,.9)]",
        badge: "border-sky-200 bg-sky-50 text-sky-700",
    },
    {
        value: "performa",
        label: "Performa",
        order: "03",
        description: "Merah bertenaga untuk program berintensitas tinggi.",
        swatch: "bg-[linear-gradient(145deg,#ff2a20_0%,#d50b03_52%,#720500_100%)]",
        active: "border-red-600 bg-red-50 shadow-[0_14px_28px_-24px_rgba(177,12,8,.9)]",
        badge: "border-red-200 bg-red-50 text-red-700",
    },
    {
        value: "eksklusif",
        label: "Eksklusif",
        order: "04",
        description: "Oranye hangat untuk pengalaman paling premium.",
        swatch: "bg-[linear-gradient(145deg,#ffc15a_0%,#ed7c13_52%,#8b3b08_100%)]",
        active: "border-orange-500 bg-orange-50 shadow-[0_14px_28px_-24px_rgba(194,65,12,.9)]",
        badge: "border-orange-200 bg-orange-50 text-orange-700",
    },
];

function membershipTierOption(tier: MembershipPlanTier) {
    return MEMBERSHIP_TIER_OPTIONS.find((option) => option.value === tier) ?? MEMBERSHIP_TIER_OPTIONS[0];
}

const PAGE_STYLES = `
    @keyframes planFadeUp {
        from { opacity: 0; transform: translate3d(0, 22px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes planShine {
        0% { background-position: -170% center; }
        100% { background-position: 220% center; }
    }
    @keyframes planPulseDot {
        0%, 100% { opacity: .78; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.16); }
    }
    @keyframes planSoftFloat {
        0%, 100% { transform: translate3d(0, 0, 0); opacity: .7; }
        50% { transform: translate3d(0, -8px, 0); opacity: .95; }
    }
    .plan-enter {
        animation: planFadeUp .58s cubic-bezier(.16,1,.3,1) both;
        will-change: transform, opacity;
    }
    .plan-title-shine {
        background: linear-gradient(115deg, #0f172a 34%, #cbd5e1 49%, #0f172a 64%);
        background-size: 220% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: planShine 4.2s linear infinite;
    }
    .plan-live-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #E35336;
        box-shadow: 0 0 0 1px rgba(255,255,255,.8), 0 0 14px rgba(227,83,54,.34);
        animation: planPulseDot 2.8s ease-in-out infinite;
    }
    .plan-orbit {
        animation: planSoftFloat 6s ease-in-out infinite;
    }
    .plan-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.34) transparent;
    }
    .plan-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .plan-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .plan-scrollbar::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(227,83,54,.34);
    }
    @media (prefers-reduced-motion: reduce) {
        .plan-enter,
        .plan-title-shine,
        .plan-live-dot,
        .plan-orbit {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
        }
    }
`;

const inputBase =
    "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 font-bdo text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#F8B5A8] focus:ring-4 focus:ring-[#E35336]/10";

const labelBase =
    "mb-2 block font-bdo text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500";

function formatIDR(amount: number): string {
    return `Rp ${amount.toLocaleString("id-ID")}`;
}

function durationLabel(months: number): string {
    if (months === 12) return "1 Tahun";
    if (months === 1) return "1 Bulan";
    return `${months} Bulan`;
}

function durationLead(months: number): string {
    if (months === 12) return "Membership tahunan untuk";
    if (months === 1) return "Membership bulanan untuk";
    return `Membership ${months} bulan untuk`;
}

function monthlyEstimate(plan: MembershipPlanItem): number {
    return Math.round(plan.price / Math.max(plan.duration_months, 1));
}

function discountPercentage(price: number, compareAtPrice?: number | null): number | null {
    const originalPrice = Number(compareAtPrice);

    if (!Number.isFinite(originalPrice) || originalPrice <= price) {
        return null;
    }

    return Math.round(((originalPrice - price) / originalPrice) * 100);
}

function IconTile({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                "relative flex shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)]",
                className,
            )}
        >
            {children}
            <span className="pointer-events-none absolute left-2 right-2 top-1.5 h-1 rounded-full bg-white/35 blur-[1px]" />
        </span>
    );
}

function MetricChip({
    icon,
    label,
    value,
    tone = "terracotta",
}: {
    icon: ReactNode;
    label: string;
    value: string | number;
    tone?: "terracotta" | "emerald" | "slate";
}) {
    const toneClass = {
        terracotta: "border-[#F8B5A8] bg-[#FFF7F5] text-[#B93D2A]",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        slate: "border-slate-200 bg-white text-slate-500",
    }[tone];

    return (
        <div className={cn("flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2", toneClass)}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 ring-1 ring-white/80">
                {icon}
            </span>
            <span className="min-w-0">
                <span className="block font-bdo text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
                    {label}
                </span>
                <span className="block truncate font-clash text-sm font-semibold">{value}</span>
            </span>
        </div>
    );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => onChange(!enabled)}
            className={cn(
                "relative inline-flex h-7 w-12 shrink-0 rounded-full p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E35336]/40 focus-visible:ring-offset-2",
                enabled ? "bg-[#E35336]" : "bg-slate-200",
            )}
        >
            <span
                className={cn(
                    "h-5 w-5 rounded-full bg-white shadow-sm transition",
                    enabled ? "translate-x-5" : "translate-x-0",
                )}
            />
        </button>
    );
}

function PlanForm({ item, onClose }: { item: MembershipPlanItem | null; onClose: () => void }) {
    const isEdit = item !== null;
    const [featureInput, setFeatureInput] = useState("");
    const { data, setData, post, processing, errors } = useForm<PlanFormData>({
        name: item?.name ?? "",
        description: item?.description ?? "",
        tier: item?.tier ?? (item?.is_primary ? "favorit" : "hemat"),
        savings_label: item?.savings_label ?? "",
        cta_label: item?.cta_label ?? "",
        card_image: null,
        remove_card_image: false,
        price: item ? String(item.price) : "",
        compare_at_price: item?.compare_at_price ? String(item.compare_at_price) : "",
        duration_months: item?.duration_months ?? 1,
        features: item?.features ?? [],
        is_active: item?.is_active ?? true,
        is_primary: item?.is_primary ?? false,
        sort_order: item ? String(item.sort_order) : "0",
        ...(isEdit ? { _method: "PATCH" as const } : {}),
    });

    const addFeature = () => {
        const next = featureInput.trim();
        if (!next) return;
        if (data.features.some((feature) => feature.toLowerCase() === next.toLowerCase())) {
            setFeatureInput("");
            return;
        }

        setData("features", [...data.features, next]);
        setFeatureInput("");
    };

    const removeFeature = (index: number) => {
        setData("features", data.features.filter((_, itemIndex) => itemIndex !== index));
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (isEdit) {
            post(route("admin.memberships.plans.update", item.id), {
                onSuccess: onClose,
                preserveScroll: true,
                forceFormData: true,
            });
            return;
        }

        post(route("admin.memberships.plans.store"), {
            onSuccess: onClose,
            preserveScroll: true,
            forceFormData: true,
        });
    };

    const previewPrice = Number(data.price) || 0;
    const previewCompareAtPrice = Number(data.compare_at_price) || 0;
    const previewDiscount = discountPercentage(previewPrice, previewCompareAtPrice);
    const previewTier = membershipTierOption(data.tier);

    return (
        <form onSubmit={submit} className="flex flex-col gap-5">
            <section className="overflow-hidden rounded-[26px] border border-[#F8B5A8]/70 bg-[#FFF7F5]">
                <div className="relative p-4">
                    <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-[#E35336]/15 blur-2xl" />
                    <div className="relative z-10 flex items-center gap-3">
                        <IconTile className="h-11 w-11">
                            <Crown size={17} />
                        </IconTile>
                        <div className="min-w-0">
                            <p className="font-bdo text-[11px] font-semibold text-slate-500">
                                {durationLead(data.duration_months)}
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="font-clash text-base font-semibold text-slate-950">
                                    {data.name || "Paket membership"}
                                </p>
                                <span className={cn("rounded-full border px-2 py-0.5 font-bdo text-[10px] font-bold", previewTier.badge)}>
                                    {previewTier.label}
                                </span>
                            </div>
                            {previewDiscount && (
                                <p className="font-bdo text-[11px] font-medium text-slate-400">
                                    <span className="line-through decoration-[#E35336] decoration-[1.5px]">
                                        {formatIDR(previewCompareAtPrice)}
                                    </span>
                                    <span className="ml-2 text-emerald-600">Hemat {previewDiscount}%</span>
                                </p>
                            )}
                            <p className="mt-0.5 font-bdo text-xs font-semibold text-[#B93D2A]">
                                {previewPrice > 0 ? formatIDR(previewPrice) : "Nominal belum diisi"} / {durationLabel(data.duration_months)}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <div>
                <label htmlFor="plan_name" className={labelBase}>Judul utama card</label>
                <input
                    id="plan_name"
                    type="text"
                    value={data.name}
                    onChange={(event) => setData("name", event.target.value)}
                    placeholder="Contoh: Gym Basic"
                    className={inputBase}
                    required
                />
                {errors.name && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.name}</p>}
            </div>

            <div>
                <label htmlFor="plan_description" className={labelBase}>Deskripsi singkat</label>
                <textarea
                    id="plan_description"
                    rows={3}
                    value={data.description}
                    onChange={(event) => setData("description", event.target.value)}
                    placeholder="Tulis penjelasan singkat yang mudah dipahami pengguna."
                    className={cn(inputBase, "h-auto resize-none py-3 leading-relaxed")}
                />
                <p className="mt-1.5 font-bdo text-[11px] font-medium leading-relaxed text-slate-400">
                    Konten custom ini tetap utuh saat durasi paket diubah.
                </p>
                {errors.description && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.description}</p>}
            </div>

            <section className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#F8B5A8]/70 bg-[#FFF7F5] text-[#E35336]">
                        <Sparkles size={16} />
                    </span>
                    <div>
                        <p className="font-clash text-base font-semibold leading-tight text-slate-950">
                            Tampilan card publik
                        </p>
                        <p className="mt-1 font-bdo text-xs font-medium leading-relaxed text-slate-500">
                            Pilih identitas visual paket. Tingkatan hanya mengubah background besar, badge, dan warna judul kedua; gambar landscape tetap memakai konten yang diunggah.
                        </p>
                    </div>
                </div>

                <fieldset className="mt-4">
                    <legend className={labelBase}>Tingkatan pricing gym</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tingkatan pricing gym">
                        {MEMBERSHIP_TIER_OPTIONS.map((option) => {
                            const selected = data.tier === option.value;

                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    onClick={() => setData("tier", option.value)}
                                    className={cn(
                                        "group flex min-h-[82px] items-start gap-3 rounded-[20px] border p-3 text-left outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-[#E35336]/35 focus-visible:ring-offset-2",
                                        selected
                                            ? option.active
                                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70",
                                    )}
                                >
                                    <span className={cn("relative mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-[13px] shadow-inner", option.swatch)}>
                                        <span className="absolute inset-x-1.5 top-1 h-px bg-white/55" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center justify-between gap-3">
                                            <span className="font-clash text-sm font-semibold text-slate-950">{option.label}</span>
                                            <span className="font-bdo text-[10px] font-bold text-slate-400">{option.order}/</span>
                                        </span>
                                        <span className="mt-1 block font-bdo text-[11px] font-medium leading-[1.35] text-slate-500">
                                            {option.description}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {errors.tier && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.tier}</p>}
                </fieldset>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <label htmlFor="plan_savings_label" className={labelBase}>Label promo alternatif</label>
                        <input
                            id="plan_savings_label"
                            type="text"
                            value={data.savings_label}
                            onChange={(event) => setData("savings_label", event.target.value)}
                            placeholder="Contoh: Hemat 20%"
                            className={inputBase}
                        />
                        <p className="mt-1.5 font-bdo text-[11px] font-medium leading-relaxed text-slate-400">
                            Dipakai hanya jika harga normal tidak diisi.
                        </p>
                        {errors.savings_label && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.savings_label}</p>}
                    </div>
                    <div>
                        <label htmlFor="plan_cta_label" className={labelBase}>Label CTA</label>
                        <input
                            id="plan_cta_label"
                            type="text"
                            value={data.cta_label}
                            onChange={(event) => setData("cta_label", event.target.value)}
                            placeholder="Contoh: Membership"
                            className={inputBase}
                        />
                        {errors.cta_label && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.cta_label}</p>}
                    </div>
                </div>

                <div className="mt-4 rounded-[20px] border border-slate-200 bg-slate-50/70 p-2.5">
                    <SingleDropzone
                        label={isEdit ? "Gambar landscape" : "Gambar landscape (wajib)"}
                        currentUrl={item?.card_image_url ?? null}
                        allowRemove={false}
                        onFileSelect={(file) => {
                            setData("card_image", file);
                            if (file) setData("remove_card_image", false);
                        }}
                        onRemoveExisting={() => {
                            setData("card_image", null);
                            setData("remove_card_image", true);
                        }}
                    />
                    <p className="mt-2 font-bdo text-[11px] font-medium leading-relaxed text-slate-400">
                        Unggah JPG, PNG, WebP, atau AVIF landscape, minimal 960 x 240 px dan maksimal 5 MB. Gambar lama otomatis diganti setelah upload berhasil.
                    </p>
                    {errors.card_image && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.card_image}</p>}
                </div>
            </section>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="plan_compare_at_price" className={labelBase}>Harga normal</label>
                    <input
                        id="plan_compare_at_price"
                        type="number"
                        min="0"
                        step="1000"
                        value={data.compare_at_price}
                        onChange={(event) => setData("compare_at_price", event.target.value)}
                        placeholder="187500"
                        className={inputBase}
                    />
                    <p className="mt-1.5 font-bdo text-[11px] font-medium leading-relaxed text-slate-400">
                        Opsional. Harus lebih tinggi dari harga membership.
                    </p>
                    {errors.compare_at_price && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.compare_at_price}</p>}
                </div>
                <div>
                    <label htmlFor="plan_price" className={labelBase}>Harga membership</label>
                    <input
                        id="plan_price"
                        type="number"
                        min="0"
                        step="1000"
                        value={data.price}
                        onChange={(event) => setData("price", event.target.value)}
                        placeholder="150000"
                        className={inputBase}
                        required
                    />
                    {errors.price && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.price}</p>}
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="plan_duration" className={labelBase}>Durasi</label>
                    <select
                        id="plan_duration"
                        value={data.duration_months}
                        onChange={(event) => setData("duration_months", Number(event.target.value))}
                        className={inputBase}
                    >
                        <option value={1}>Bulanan · 1 bulan</option>
                        <option value={3}>Triwulan · 3 bulan</option>
                        <option value={6}>Semester · 6 bulan</option>
                        <option value={12}>Tahunan · 12 bulan</option>
                    </select>
                    <div className="mt-2 flex items-start gap-2 rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2.5">
                        <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#E35336]" />
                        <p className="font-bdo text-[11px] font-medium leading-relaxed text-slate-500">
                            Pembuka card otomatis menjadi <span className="font-semibold text-slate-800">“{durationLead(data.duration_months)}”</span>. Judul dan deskripsi custom tidak akan ditimpa.
                        </p>
                    </div>
                    {errors.duration_months && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.duration_months}</p>}
                </div>
            </div>

            <section className="rounded-[24px] border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#F8B5A8]/70 bg-[#FFF7F5] text-[#E35336]">
                            <Sparkles size={16} />
                        </span>
                        <div className="min-w-0">
                            <p className="font-clash text-base font-semibold leading-tight text-slate-950">Fitur paket</p>
                            <p className="mt-1 font-bdo text-xs font-medium leading-relaxed text-slate-500">
                                Tambahkan benefit utama yang akan dilihat calon member.
                            </p>
                        </div>
                    </div>
                    <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 font-bdo text-[11px] font-bold text-slate-500">
                        {data.features.length} item
                    </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input
                        type="text"
                        value={featureInput}
                        onChange={(event) => setFeatureInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                addFeature();
                            }
                        }}
                        placeholder="Contoh: Akses gym setiap hari"
                        className={inputBase}
                        aria-label="Tambah fitur paket"
                    />
                    <button
                        type="button"
                        onClick={addFeature}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#F8B5A8]/70 bg-[#FFF7F5] px-4 font-bdo text-xs font-bold text-[#B93D2A] transition hover:bg-white"
                    >
                        <Plus size={14} />
                        Tambah
                    </button>
                </div>

                {data.features.length > 0 ? (
                    <div className="mt-3 flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1 plan-scrollbar">
                        {data.features.map((feature, index) => (
                            <span
                                key={`${feature}-${index}`}
                                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1.5 font-bdo text-xs font-bold text-slate-600"
                            >
                                <CheckCircle2 size={12} className="text-emerald-500" />
                                {feature}
                                <button
                                    type="button"
                                    onClick={() => removeFeature(index)}
                                    className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-rose-500"
                                    aria-label={`Hapus fitur ${feature}`}
                                >
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 font-bdo text-xs font-medium text-slate-400">
                        Belum ada fitur. Paket tetap bisa disimpan, tetapi benefit akan terlihat lebih jelas jika diisi.
                    </p>
                )}
                {errors.features && <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">{errors.features}</p>}
            </section>

            <section className="flex items-center justify-between gap-4 rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                    <p className="font-clash text-sm font-semibold text-slate-950">Tampilkan paket</p>
                    <p className="mt-0.5 font-bdo text-xs font-medium text-slate-400">
                        {data.is_active ? "Paket tersedia untuk dibeli." : "Paket disembunyikan sementara."}
                    </p>
                </div>
                <ToggleSwitch enabled={data.is_active} onChange={(value) => setData("is_active", value)} />
            </section>

            <section className="flex items-center justify-between gap-4 rounded-[24px] border border-[#B9D9EA] bg-[#F2FAFE] px-4 py-3">
                <div>
                    <p className="font-clash text-sm font-semibold text-slate-950">Jadikan paket utama</p>
                    <p className="mt-0.5 font-bdo text-xs font-medium text-slate-500">
                        Menandai paket rekomendasi/default. Urutan publik tetap Hemat, Favorit, Performa, lalu Eksklusif.
                    </p>
                </div>
                <ToggleSwitch enabled={data.is_primary} onChange={(value) => setData("is_primary", value)} />
            </section>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-2xl bg-slate-100 px-5 py-3 font-clash text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                >
                    Batal
                </button>
                <button
                    type="submit"
                    disabled={processing}
                    className="inline-flex flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 py-3 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                    {processing ? "Menyimpan..." : isEdit ? "Simpan perubahan" : "Buat paket"}
                    <ArrowRight size={15} />
                </button>
            </div>
        </form>
    );
}

function PlanCard({
    plan,
    index,
    onEdit,
    onDelete,
}: {
    plan: MembershipPlanItem;
    index: number;
    onEdit: (plan: MembershipPlanItem) => void;
    onDelete: (plan: MembershipPlanItem) => void;
}) {
    const discountPercent = discountPercentage(plan.price, plan.compare_at_price);
    const topFeatures = plan.features.slice(0, 4);
    const tierOption = membershipTierOption(plan.tier);

    return (
        <article
            className={cn(
                "plan-enter group relative flex min-h-[360px] flex-col overflow-hidden rounded-[30px] border bg-white transition duration-300",
                "border-slate-200 shadow-[0_22px_54px_-48px_rgba(15,23,42,.55)] hover:-translate-y-1 hover:border-[#F8B5A8] hover:shadow-[0_28px_64px_-46px_rgba(227,83,54,.38)]",
                !plan.is_active && "opacity-75",
            )}
            style={{ animationDelay: `${Math.min(index * 70, 420)}ms` }}
        >
            <div className="absolute inset-x-0 top-0 h-1.5 bg-[linear-gradient(90deg,#F8B5A8_0%,#E35336_52%,#B93D2A_100%)]" />
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#E35336]/10 blur-3xl transition group-hover:bg-[#E35336]/16" />
            <div className="pointer-events-none absolute -left-16 bottom-12 h-32 w-32 rounded-full bg-emerald-400/10 blur-3xl" />

            <div className="relative z-10 flex flex-1 flex-col p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                        <IconTile className="h-12 w-12">
                            {plan.duration_months >= 12 ? <Crown size={18} /> : plan.duration_months >= 6 ? <Gem size={18} /> : <BadgeCheck size={18} />}
                        </IconTile>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="truncate font-clash text-xl font-bold leading-tight text-slate-950">
                                    {plan.name}
                                </h2>
                                <span
                                    className={cn(
                                        "rounded-full border px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-[0.14em]",
                                        plan.is_active
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                            : "border-slate-200 bg-slate-50 text-slate-400",
                                    )}
                                >
                                    {plan.is_active ? "Aktif" : "Nonaktif"}
                                </span>
                                <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-bdo text-[10px] font-bold", tierOption.badge)}>
                                    <span className={cn("h-2 w-2 rounded-full", tierOption.swatch)} aria-hidden="true" />
                                    {tierOption.label}
                                </span>
                                {plan.is_primary && (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700">
                                        <Crown size={11} />
                                        Utama
                                    </span>
                                )}
                            </div>
                            <p className="mt-1 line-clamp-2 font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                {plan.description || "Belum ada deskripsi singkat untuk paket ini."}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 rounded-[26px] border border-[#F8B5A8]/70 bg-[#FFF7F5] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-[#B93D2A]/70">
                                Harga paket
                            </p>
                            {discountPercent && plan.compare_at_price && (
                                <p className="mt-1 font-bdo text-xs font-medium text-slate-400">
                                    <span className="line-through decoration-[#E35336] decoration-[1.5px]">
                                        {formatIDR(plan.compare_at_price)}
                                    </span>
                                    <span className="ml-2 font-semibold text-emerald-600">
                                        Hemat {discountPercent}%
                                    </span>
                                </p>
                            )}
                            <p className="mt-1 font-clash text-3xl font-bold leading-none text-slate-950">
                                {formatIDR(plan.price)}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-bdo text-xs font-bold text-[#B93D2A] ring-1 ring-[#F8B5A8]/70">
                                <Timer size={13} />
                                {durationLabel(plan.duration_months)}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-bdo text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                                <ReceiptText size={13} />
                                {formatIDR(monthlyEstimate(plan))}/bln
                            </span>
                        </div>
                    </div>
                    {discountPercent && (
                        <p className="mt-3 rounded-2xl bg-white/70 px-3 py-2 font-bdo text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
                            Diskon dihitung otomatis dari harga normal dan harga membership.
                        </p>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Anggota aktif</p>
                        <p className="mt-1 font-clash text-xl font-bold text-slate-950">{plan.active_members_count}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Tingkatan</p>
                        <p className="mt-1 font-clash text-xl font-bold text-slate-950">
                            {tierOption.label}
                        </p>
                    </div>
                </div>

                <div className="mt-5 flex-1">
                    <div className="flex items-center justify-between gap-3">
                        <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Benefit</p>
                        <span className="font-bdo text-[11px] font-bold text-slate-400">{plan.features.length} fitur</span>
                    </div>
                    {topFeatures.length > 0 ? (
                        <ul className="mt-3 grid gap-2">
                            {topFeatures.map((feature, featureIndex) => (
                                <li key={`${feature}-${featureIndex}`} className="flex items-start gap-2 font-bdo text-sm font-semibold leading-relaxed text-slate-700">
                                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#E35336]" />
                                    <span className="line-clamp-2">{feature}</span>
                                </li>
                            ))}
                            {plan.features.length > topFeatures.length && (
                                <li className="font-bdo text-xs font-bold text-[#B93D2A]">
                                    +{plan.features.length - topFeatures.length} fitur lainnya
                                </li>
                            )}
                        </ul>
                    ) : (
                        <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 font-bdo text-sm font-medium text-slate-400">
                            Benefit belum diisi.
                        </p>
                    )}
                </div>
            </div>

            <div className="relative z-10 grid grid-cols-[1fr_1fr_auto] gap-2 border-t border-slate-100 bg-slate-50/70 p-3">
                <button
                    type="button"
                    onClick={() => onEdit(plan)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white font-bdo text-xs font-bold text-slate-600 ring-1 ring-slate-200 transition hover:text-[#B93D2A] hover:ring-[#F8B5A8]"
                >
                    <Pencil size={14} />
                    Edit
                </button>
                <button
                    type="button"
                    onClick={() => onEdit(plan)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#F8B5A8]/70 bg-[#FFF7F5] font-bdo text-xs font-bold text-[#B93D2A] transition hover:bg-white"
                >
                    <Sparkles size={14} />
                    Detail
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(plan)}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-rose-500 ring-1 ring-rose-100 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Hapus paket ${plan.name}`}
                >
                    <Trash2 size={15} />
                </button>
            </div>
        </article>
    );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
    return (
        <section className="plan-enter relative overflow-hidden rounded-[32px] border border-[#F8B5A8]/70 bg-white p-8 text-center sm:p-12">
            <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[#E35336]/10 blur-3xl" />
            <div className="pointer-events-none absolute -left-16 bottom-0 h-44 w-44 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative z-10 mx-auto flex max-w-md flex-col items-center">
                <IconTile className="h-16 w-16 rounded-[24px]">
                    <Layers3 size={24} />
                </IconTile>
                <h2 className="mt-5 font-clash text-2xl font-bold text-slate-950">Belum ada paket membership</h2>
                <p className="mt-2 font-bdo text-sm font-medium leading-relaxed text-slate-500">
                    Buat paket pertama agar pengguna bisa memilih membership dengan informasi harga, durasi, dan benefit yang jelas.
                </p>
                <button
                    type="button"
                    onClick={onCreate}
                    className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5"
                >
                    <Plus size={17} />
                    Tambah Paket Pertama
                </button>
            </div>
        </section>
    );
}

export default function MembershipPlansIndex() {
    const { plans, flash, errors } = usePage<Props>().props;
    const [slideOver, setSlideOver] = useState<{ open: boolean; item: MembershipPlanItem | null }>({
        open: false,
        item: null,
    });

    const summary = useMemo(() => {
        const active = plans.filter((plan) => plan.is_active);
        const members = plans.reduce((total, plan) => total + plan.active_members_count, 0);
        const cheapest = plans.length > 0 ? Math.min(...plans.map((plan) => plan.price)) : 0;

        return {
            total: plans.length,
            active: active.length,
            members,
            cheapest,
        };
    }, [plans]);

    const openCreate = () => setSlideOver({ open: true, item: null });
    const openEdit = (item: MembershipPlanItem) => setSlideOver({ open: true, item });
    const closeSlideOver = () => setSlideOver({ open: false, item: null });

    const deletePlan = (plan: MembershipPlanItem) => {
        if (!window.confirm(`Hapus paket "${plan.name}"?`)) return;
        router.delete(route("admin.memberships.plans.destroy", plan.id), { preserveScroll: true });
    };

    return (
        <AdminLayout
            header={
                <div className="plan-enter flex flex-col gap-1 pt-4">
                    <style dangerouslySetInnerHTML={{ __html: PAGE_STYLES }} />
                    <span className="font-bdo text-[11px] font-medium tracking-wide text-[#E35336]">
                        Manajemen Keanggotaan
                    </span>
                    <h1 className="font-clash text-3xl font-bold uppercase tracking-tight xl:text-4xl">
                        <span className="plan-title-shine">Paket Membership</span>
                    </h1>
                </div>
            }
        >
            <Head title="Paket Membership" />

            <div className="flex flex-col gap-4 overflow-x-hidden pb-20 pt-4">
                {flash?.success && (
                    <section className="plan-enter flex items-center gap-3 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 ring-1 ring-emerald-100">
                            <CheckCircle2 size={17} />
                        </span>
                        <p className="font-bdo text-sm font-semibold text-emerald-700">{flash.success}</p>
                    </section>
                )}

                {errors?.plan && (
                    <section className="plan-enter flex items-center gap-3 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-rose-600 ring-1 ring-rose-100">
                            <X size={17} />
                        </span>
                        <p className="font-bdo text-sm font-semibold text-rose-700">{errors.plan}</p>
                    </section>
                )}

                <section className="plan-enter relative overflow-hidden rounded-[32px] border border-[#F8B5A8]/70 bg-white">
                    <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#E35336]/10 blur-3xl plan-orbit" />
                    <div className="pointer-events-none absolute -left-20 bottom-0 h-52 w-52 rounded-full bg-emerald-400/10 blur-3xl" />
                    <div className="relative z-10 flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-end xl:justify-between">
                        <div className="max-w-2xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-[#F8B5A8] bg-[#FFF7F5] px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-[0.18em] text-[#B93D2A]">
                                <span className="plan-live-dot" />
                                Paket publik
                            </div>
                            <h2 className="mt-4 font-clash text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                                Susun paket gym yang jelas, rapi, dan mudah dibandingkan pengguna.
                            </h2>
                            <p className="mt-2 font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                Paket ditampilkan berurutan dari Hemat, Favorit, Performa, hingga Eksklusif; paket utama tetap dapat dipilih secara terpisah.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={openCreate}
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5"
                        >
                            <Plus size={17} />
                            Tambah Paket
                        </button>
                    </div>
                </section>

                <section className="plan-enter grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricChip icon={<Layers3 size={15} />} label="Total Paket" value={summary.total} />
                    <MetricChip icon={<Activity size={15} />} label="Paket Aktif" value={summary.active} tone="emerald" />
                    <MetricChip icon={<Users size={15} />} label="Member Aktif" value={summary.members} tone="slate" />
                    <MetricChip icon={<ReceiptText size={15} />} label="Harga Mulai" value={summary.cheapest > 0 ? formatIDR(summary.cheapest) : "-"} />
                </section>

                {plans.length === 0 ? (
                    <EmptyState onCreate={openCreate} />
                ) : (
                    <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                        {plans.map((plan, index) => (
                            <PlanCard
                                key={plan.id}
                                plan={plan}
                                index={index}
                                onEdit={openEdit}
                                onDelete={deletePlan}
                            />
                        ))}
                    </section>
                )}
            </div>

            <SlideOver
                isOpen={slideOver.open}
                onClose={closeSlideOver}
                title={
                    <span className="font-clash text-xl font-bold">
                        {slideOver.item ? "Edit Paket" : "Tambah Paket"}
                    </span>
                }
                description={
                    slideOver.item ? (
                        <span className="font-bdo text-sm font-semibold text-[#B93D2A]">
                            {slideOver.item.name}
                        </span>
                    ) : (
                        <span className="font-bdo text-sm text-slate-500">
                            Buat paket baru yang siap tampil di website.
                        </span>
                    )
                }
            >
                {slideOver.open && (
                    <PlanForm
                        key={slideOver.item?.id ?? "new"}
                        item={slideOver.item}
                        onClose={closeSlideOver}
                    />
                )}
            </SlideOver>
        </AdminLayout>
    );
}
