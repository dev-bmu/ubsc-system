import { Head, Link, router, useForm, usePage } from "@inertiajs/react";
import {
    ArrowLeft,
    Banknote,
    CheckCircle2,
    Clock3,
    ImageIcon,
    Layers3,
    Pencil,
    Plus,
    Trash2,
    UploadCloud,
    X,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import AdminLayout from "@/Layouts/AdminLayout";
import { SingleDropzone } from "@/Components/Admin/ImageDropzone";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";

interface FacilitySummary {
    id: number;
    name: string;
    slug: string;
    category?: string | null;
    image?: string | null;
}

interface FacilityUnitItem {
    id: number;
    facility_id: number;
    name: string;
    is_active: boolean;
    use_custom_schedule: boolean;
    active_slots: Record<string, string[]> | null;
    use_custom_pricing: boolean;
    prices: UnitPriceRow[];
    image_url: string | null;
    created_at?: string | null;
}

type UnitsPageProps = PageProps<{
    facility: FacilitySummary;
    units: FacilityUnitItem[];
}>;

type UnitFormData = {
    name: string;
    is_active: boolean;
    use_custom_schedule: boolean;
    active_slots: Record<string, string[]> | null;
    use_custom_pricing: boolean;
    prices: UnitPriceRow[];
    unit_image: File | null;
    remove_unit_image: boolean;
    _method?: "PUT";
};

type UserCategory = "warga_ub" | "umum";

interface UnitPriceRow {
    id?: number;
    user_category: UserCategory;
    label: string;
    price: number | string;
    duration_minutes: number;
    schedule_type: "regular" | "always" | "weekly" | "date_range";
    applicable_days?: string[] | null;
    starts_at?: string | null;
    ends_at?: string | null;
    starts_on?: string | null;
    ends_on?: string | null;
    notes?: string | null;
    sort_order?: number;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type Weekday = (typeof WEEKDAYS)[number];

const WEEKDAY_LABEL: Record<Weekday, string> = {
    Monday: "Senin",
    Tuesday: "Selasa",
    Wednesday: "Rabu",
    Thursday: "Kamis",
    Friday: "Jumat",
    Saturday: "Sabtu",
    Sunday: "Minggu",
};

const PRICE_SEGMENTS: Array<{ value: UserCategory; label: string; helper: string }> = [
    { value: "umum", label: "Umum", helper: "Harga pengunjung umum" },
    { value: "warga_ub", label: "Warga UB", helper: "Harga sivitas/warga UB" },
];

const emptyDayTexts = (): Record<Weekday, string> =>
    WEEKDAYS.reduce((acc, day) => ({ ...acc, [day]: "" }), {} as Record<Weekday, string>);

const toDayTexts = (slots: Record<string, string[]> | null | undefined): Record<Weekday, string> =>
    WEEKDAYS.reduce((acc, day) => ({
        ...acc,
        [day]: slots?.[day]?.join(", ") ?? "",
    }), {} as Record<Weekday, string>);

const parseSlotText = (text: string): string[] =>
    text
        .split(",")
        .map((value) => value.trim())
        .filter((value) => /^\d{2}:\d{2}$/.test(value));

const toActiveSlots = (texts: Record<Weekday, string>): Record<string, string[]> =>
    WEEKDAYS.reduce((acc, day) => ({
        ...acc,
        [day]: parseSlotText(texts[day]),
    }), {} as Record<string, string[]>);

const defaultUnitPrices = (): UnitPriceRow[] => [
    {
        user_category: "umum",
        label: "Reguler",
        price: 0,
        duration_minutes: 60,
        schedule_type: "regular",
        sort_order: 0,
    },
    {
        user_category: "warga_ub",
        label: "Reguler",
        price: 0,
        duration_minutes: 60,
        schedule_type: "regular",
        sort_order: 1,
    },
];

const pageStyles = `
    @keyframes unitFadeUp {
        from { opacity: 0; transform: translate3d(0, 24px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes unitShine {
        0% { background-position: -180% center; }
        100% { background-position: 220% center; }
    }
    @keyframes unitPulse {
        0%, 100% { opacity: .75; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.16); }
    }
    .unit-fade-up {
        animation: unitFadeUp .58s cubic-bezier(.16,1,.3,1) both;
        will-change: transform, opacity;
    }
    .unit-shiny {
        background: linear-gradient(115deg, #0f172a 34%, #cbd5e1 49%, #0f172a 64%);
        background-size: 220% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: unitShine 5s linear infinite;
    }
    .unit-live-dot {
        position: relative;
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #E35336;
        box-shadow: 0 0 0 1px rgba(255,255,255,.75), 0 0 13px rgba(227,83,54,.28);
        animation: unitPulse 2.8s ease-in-out infinite;
    }
    .unit-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.32) transparent;
    }
    .unit-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .unit-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .unit-scrollbar::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(227,83,54,.32);
    }
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
                "relative flex shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)]",
                className,
            )}
        >
            {children}
            <span className="pointer-events-none absolute left-2 right-2 top-1.5 h-1 rounded-full bg-white/35 blur-[1px]" />
        </div>
    );
}

function MetricCard({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone: "terracotta" | "emerald" | "slate";
}) {
    const palette = {
        terracotta: "border-[#F8B5A8] bg-[#FFF7F5] text-[#B93D2A]",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        slate: "border-slate-200 bg-slate-50 text-slate-700",
    }[tone];

    return (
        <div className={cn("rounded-[24px] border px-4 py-3", palette)}>
            <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
                {label}
            </p>
            <p className="mt-1 font-clash text-3xl font-bold leading-none">
                {value}
            </p>
        </div>
    );
}

function UnitCard({
    unit,
    onEdit,
    onDelete,
}: {
    unit: FacilityUnitItem;
    onEdit: (unit: FacilityUnitItem) => void;
    onDelete: (unit: FacilityUnitItem) => void;
}) {
    return (
        <article className="group overflow-hidden rounded-[28px] border border-slate-200 bg-white transition duration-300 hover:-translate-y-1 hover:border-[#F8B5A8] hover:shadow-[0_22px_42px_-34px_rgba(227,83,54,.55)]">
            <div className="relative aspect-[16/10] overflow-hidden bg-[#FFF7F5]">
                {unit.image_url ? (
                    <img
                        src={unit.image_url}
                        alt={unit.name}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_70%_20%,rgba(227,83,54,.12),transparent_30%),linear-gradient(135deg,#FFFFFF_0%,#FFF7F5_100%)] text-[#B93D2A]">
                        <ShinyIcon className="h-12 w-12">
                            <ImageIcon size={20} />
                        </ShinyIcon>
                        <p className="font-bdo text-xs font-semibold text-slate-500">
                            Foto unit belum tersedia
                        </p>
                    </div>
                )}

                <div className="absolute left-3 top-3 rounded-2xl bg-white/92 px-3 py-1.5 font-bdo text-[11px] font-bold text-slate-700 shadow-[0_12px_24px_-20px_rgba(15,23,42,.45)] backdrop-blur">
                    #{unit.id}
                </div>

                <div
                    className={cn(
                        "absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-bdo text-[11px] font-bold backdrop-blur",
                        unit.is_active
                            ? "border-emerald-200 bg-white/92 text-emerald-700"
                            : "border-slate-200 bg-white/92 text-slate-500",
                    )}
                >
                    <span className={cn("h-2 w-2 rounded-full", unit.is_active ? "bg-emerald-400" : "bg-slate-300")} />
                    {unit.is_active ? "Aktif" : "Nonaktif"}
                </div>
            </div>

            <div className="space-y-4 p-4">
                <div>
                    <h2 className="font-clash text-lg font-semibold leading-tight text-slate-950">
                        {unit.name}
                    </h2>
                    <p className="mt-1 font-bdo text-xs font-medium text-slate-400">
                        Unit fisik untuk pilihan reservasi.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bdo text-[10px] font-bold",
                        unit.use_custom_schedule
                            ? "bg-[#FFF7F5] text-[#B93D2A] ring-1 ring-[#F8B5A8]/70"
                            : "bg-slate-50 text-slate-500 ring-1 ring-slate-200",
                    )}>
                        <Clock3 size={11} />
                        {unit.use_custom_schedule ? "Jam custom" : "Jam default"}
                    </span>
                    <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bdo text-[10px] font-bold",
                        unit.use_custom_pricing
                            ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                            : "bg-slate-50 text-slate-500 ring-1 ring-slate-200",
                    )}>
                        <Banknote size={11} />
                        {unit.use_custom_pricing ? "Harga custom" : "Harga default"}
                    </span>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                        type="button"
                        onClick={() => onEdit(unit)}
                        className="flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-50 font-bdo text-xs font-bold text-slate-600 transition hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                    >
                        <Pencil size={14} />
                        Edit Unit
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(unit)}
                        className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 transition hover:bg-rose-100"
                        aria-label={`Hapus ${unit.name}`}
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>
        </article>
    );
}

export default function FacilityUnits() {
    const { facility, units } = usePage<UnitsPageProps>().props;
    const [formOpen, setFormOpen] = useState(false);
    const [editingUnit, setEditingUnit] = useState<FacilityUnitItem | null>(null);
    const [dayTexts, setDayTexts] = useState<Record<Weekday, string>>(emptyDayTexts);

    const activeCount = useMemo(
        () => units.filter((unit) => unit.is_active).length,
        [units],
    );
    const inactiveCount = units.length - activeCount;

    const {
        data,
        setData,
        post,
        processing,
        errors,
        reset,
        clearErrors,
        transform,
    } = useForm<UnitFormData>({
        name: "",
        is_active: true,
        use_custom_schedule: false,
        active_slots: null,
        use_custom_pricing: false,
        prices: defaultUnitPrices(),
        unit_image: null,
        remove_unit_image: false,
    });

    const closeForm = () => {
        setFormOpen(false);
        setEditingUnit(null);
        setDayTexts(emptyDayTexts());
        reset();
        clearErrors();
    };

    const openCreate = () => {
        setEditingUnit(null);
        clearErrors();
        setData({
            name: "",
            is_active: true,
            use_custom_schedule: false,
            active_slots: null,
            use_custom_pricing: false,
            prices: defaultUnitPrices(),
            unit_image: null,
            remove_unit_image: false,
        });
        setDayTexts(emptyDayTexts());
        setFormOpen(true);
    };

    const openEdit = (unit: FacilityUnitItem) => {
        setEditingUnit(unit);
        clearErrors();
        setDayTexts(toDayTexts(unit.active_slots));
        setData({
            name: unit.name,
            is_active: unit.is_active,
            use_custom_schedule: unit.use_custom_schedule,
            active_slots: unit.active_slots,
            use_custom_pricing: unit.use_custom_pricing,
            prices: unit.prices.length > 0 ? unit.prices : defaultUnitPrices(),
            unit_image: null,
            remove_unit_image: false,
            _method: "PUT",
        });
        setFormOpen(true);
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        transform((payload) => ({
            ...payload,
            active_slots: payload.use_custom_schedule ? toActiveSlots(dayTexts) : null,
            prices: payload.use_custom_pricing ? payload.prices : [],
        }));

        if (editingUnit) {
            post(route("admin.facility-units.update", editingUnit.id), {
                forceFormData: true,
                preserveScroll: true,
                onSuccess: closeForm,
            });
            return;
        }

        post(route("admin.facilities.units.store", facility.id), {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: closeForm,
        });
    };

    const deleteUnit = (unit: FacilityUnitItem) => {
        if (!confirm(`Hapus unit "${unit.name}"?`)) {
            return;
        }

        router.delete(route("admin.facility-units.destroy", unit.id), {
            preserveScroll: true,
        });
    };

    const setScheduleText = (day: Weekday, value: string) => {
        const next = { ...dayTexts, [day]: value };
        setDayTexts(next);
        setData("active_slots", toActiveSlots(next));
    };

    const setPriceRow = (
        segment: UserCategory,
        field: "price" | "duration_minutes",
        value: string | number,
    ) => {
        const currentRows = data.prices.length > 0 ? data.prices : defaultUnitPrices();
        const nextRows = currentRows.map((row) => {
            if (row.user_category !== segment || row.label !== "Reguler") {
                return row;
            }

            return {
                ...row,
                [field]: field === "duration_minutes" ? Number(value) : value,
            };
        });

        setData("prices", nextRows);
    };

    const regularPriceFor = (segment: UserCategory): UnitPriceRow =>
        (data.prices.length > 0 ? data.prices : defaultUnitPrices())
            .find((row) => row.user_category === segment && row.label === "Reguler")
            ?? defaultUnitPrices().find((row) => row.user_category === segment)!;

    return (
        <AdminLayout
            header={
                <div className="flex flex-col gap-1 pt-4 unit-fade-up">
                    <style dangerouslySetInnerHTML={{ __html: pageStyles }} />
                    <span className="font-bdo text-[11px] font-medium tracking-wide text-[#E35336]">
                        Inventory Fasilitas
                    </span>
                    <h1 className="font-clash text-3xl font-bold uppercase tracking-tight xl:text-4xl">
                        <span className="unit-shiny">Kelola Unit</span>
                    </h1>
                </div>
            }
        >
            <Head title={`Unit ${facility.name}`} />

            <div className="flex flex-col gap-5 pb-20 pt-4">
                <section className="unit-fade-up overflow-hidden rounded-[32px] border border-[#F8B5A8]/70 bg-white">
                    <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="relative overflow-hidden p-5 sm:p-7">
                            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#E35336]/10 blur-3xl" />
                            <div className="relative z-10">
                                <Link
                                    href={route("admin.facilities.index")}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 font-bdo text-[12px] font-bold text-slate-600 transition hover:border-[#F8B5A8] hover:text-[#B93D2A]"
                                >
                                    <ArrowLeft size={14} />
                                    Kembali ke fasilitas
                                </Link>

                                <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                                    <div className="max-w-2xl">
                                        <div className="inline-flex items-center gap-2 rounded-full border border-[#F8B5A8] bg-[#FFF7F5] px-3 py-1.5 font-bdo text-[10px] font-bold uppercase tracking-[0.18em] text-[#B93D2A]">
                                            <span className="unit-live-dot" />
                                            Unit yang tampil hanya di alur booking
                                        </div>
                                        <h2 className="mt-4 font-clash text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
                                            {facility.name}
                                        </h2>
                                        <p className="mt-2 max-w-xl font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                            Buat unit fisik seperti Lapangan 1, Lapangan 2, atau ruang khusus. Halaman publik tetap menampilkan fasilitas utama, sedangkan unit dipilih saat reservasi.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={openCreate}
                                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5"
                                    >
                                        <Plus size={16} />
                                        Tambah Unit
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-[#F8B5A8]/60 bg-[#FFF7F5]/70 p-5 sm:p-7 xl:border-l xl:border-t-0">
                            <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] bg-white">
                                {facility.image ? (
                                    <img
                                        src={facility.image}
                                        alt={facility.name}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center text-[#B93D2A]">
                                        <Layers3 size={38} />
                                    </div>
                                )}
                                <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-white/92 p-4 shadow-[0_18px_34px_-26px_rgba(15,23,42,.45)] backdrop-blur">
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                        Parent Facility
                                    </p>
                                    <p className="mt-1 truncate font-clash text-base font-semibold text-slate-950">
                                        {facility.category ?? "Tanpa kategori"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <MetricCard label="Total Unit" value={units.length} tone="terracotta" />
                    <MetricCard label="Aktif Booking" value={activeCount} tone="emerald" />
                    <MetricCard label="Nonaktif" value={inactiveCount} tone="slate" />
                </section>

                <section className="unit-fade-up rounded-[32px] border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <ShinyIcon className="h-11 w-11">
                                <Layers3 size={18} />
                            </ShinyIcon>
                            <div>
                                <p className="font-clash text-base font-semibold text-slate-950">
                                    Daftar Unit
                                </p>
                                <p className="font-bdo text-xs font-medium text-slate-400">
                                    Unit aktif akan tersedia untuk dipilih saat booking.
                                </p>
                            </div>
                        </div>
                    </div>

                    {units.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[#F8B5A8] bg-[#FFF7F5]/60 px-5 py-14 text-center">
                            <ShinyIcon className="h-16 w-16">
                                <UploadCloud size={26} />
                            </ShinyIcon>
                            <h2 className="mt-5 font-clash text-xl font-semibold text-slate-950">
                                Belum ada unit untuk fasilitas ini
                            </h2>
                            <p className="mt-2 max-w-md font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                Tambahkan unit pertama agar user bisa memilih lapangan atau ruang tertentu saat reservasi.
                            </p>
                            <button
                                type="button"
                                onClick={openCreate}
                                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 font-bdo text-sm font-bold text-[#B93D2A] ring-1 ring-[#F8B5A8] transition hover:bg-[#FFF7F5]"
                            >
                                <Plus size={15} />
                                Tambah Unit Pertama
                            </button>
                        </div>
                    ) : (
                        <div className="unit-scrollbar grid max-h-[760px] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                            {units.map((unit) => (
                                <UnitCard
                                    key={unit.id}
                                    unit={unit}
                                    onEdit={openEdit}
                                    onDelete={deleteUnit}
                                />
                            ))}
                        </div>
                    )}
                </section>

                {formOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
                        <div className="w-full max-w-5xl overflow-hidden rounded-[32px] border border-[#F8B5A8]/70 bg-white shadow-[0_30px_80px_-44px_rgba(15,23,42,.55)]">
                            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <ShinyIcon className="h-10 w-10">
                                        {editingUnit ? <Pencil size={16} /> : <Plus size={16} />}
                                    </ShinyIcon>
                                    <div>
                                        <p className="font-clash text-base font-semibold text-slate-950">
                                            {editingUnit ? "Edit Unit" : "Tambah Unit"}
                                        </p>
                                        <p className="font-bdo text-xs font-medium text-slate-400">
                                            {facility.name}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeForm}
                                    className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-50 text-slate-500 transition hover:bg-slate-100"
                                    aria-label="Tutup form unit"
                                >
                                    <X size={17} />
                                </button>
                            </div>

                            <form onSubmit={submit} className="unit-scrollbar max-h-[calc(100vh-140px)] overflow-y-auto p-5">
                                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                                    <div className="space-y-4">
                                        <div>
                                            <label
                                                htmlFor="unit-name"
                                                className="mb-2 block font-bdo text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"
                                            >
                                                Nama Unit
                                            </label>
                                            <input
                                                id="unit-name"
                                                type="text"
                                                value={data.name}
                                                onChange={(event) => setData("name", event.target.value)}
                                                placeholder="Contoh: Lapangan Tenis 1"
                                                className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-bdo text-sm font-semibold text-slate-800 outline-none transition focus:border-[#F8B5A8] focus:ring-4 focus:ring-[#E35336]/10"
                                                autoFocus
                                            />
                                            {errors.name && (
                                                <p className="mt-1.5 font-bdo text-xs font-medium text-rose-500">
                                                    {errors.name}
                                                </p>
                                            )}
                                        </div>

                                        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                            <span>
                                                <span className="block font-clash text-sm font-semibold text-slate-900">
                                                    Tersedia untuk booking
                                                </span>
                                                <span className="mt-0.5 block font-bdo text-xs font-medium text-slate-400">
                                                    Matikan jika unit sedang perawatan atau belum siap.
                                                </span>
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={data.is_active}
                                                onChange={(event) => setData("is_active", event.target.checked)}
                                                className="h-5 w-5 rounded border-slate-300 text-[#E35336] focus:ring-[#E35336]/25"
                                            />
                                        </label>

                                        <div className="rounded-2xl border border-[#F8B5A8]/70 bg-[#FFF7F5] px-4 py-3">
                                            <div className="flex items-start gap-3">
                                                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#E35336]" />
                                                <p className="font-bdo text-xs font-medium leading-relaxed text-[#8E2D20]">
                                                    Unit aktif hanya muncul di halaman booking. Daftar fasilitas publik tetap menampilkan fasilitas utama.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-start gap-3">
                                                    <ShinyIcon className="h-10 w-10 rounded-2xl">
                                                        <Clock3 size={16} />
                                                    </ShinyIcon>
                                                    <div>
                                                        <p className="font-clash text-sm font-semibold text-slate-950">
                                                            Jam buka unit
                                                        </p>
                                                        <p className="mt-0.5 font-bdo text-xs font-medium text-slate-400">
                                                            Ikuti jadwal fasilitas utama atau tentukan slot khusus unit ini.
                                                        </p>
                                                    </div>
                                                </div>
                                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#F8B5A8]/70 bg-[#FFF7F5] px-3 py-2 font-bdo text-xs font-bold text-[#B93D2A]">
                                                    <input
                                                        type="checkbox"
                                                        checked={data.use_custom_schedule}
                                                        onChange={(event) => {
                                                            const enabled = event.target.checked;
                                                            setData("use_custom_schedule", enabled);
                                                            setData("active_slots", enabled ? toActiveSlots(dayTexts) : null);
                                                        }}
                                                        className="h-4 w-4 rounded border-[#F8B5A8] text-[#E35336] focus:ring-[#E35336]/25"
                                                    />
                                                    Custom jam
                                                </label>
                                            </div>

                                            {data.use_custom_schedule ? (
                                                <div className="unit-scrollbar mt-4 grid max-h-[320px] gap-2 overflow-y-auto pr-1">
                                                    {WEEKDAYS.map((day) => (
                                                        <div key={day} className="grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[86px_1fr] sm:items-center">
                                                            <label htmlFor={`unit-slot-${day}`} className="font-bdo text-[11px] font-bold text-slate-500">
                                                                {WEEKDAY_LABEL[day]}
                                                            </label>
                                                            <input
                                                                id={`unit-slot-${day}`}
                                                                type="text"
                                                                value={dayTexts[day]}
                                                                onChange={(event) => setScheduleText(day, event.target.value)}
                                                                placeholder="misal: 06:00, 07:00, 18:00"
                                                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bdo text-xs font-semibold text-slate-700 outline-none transition focus:border-[#F8B5A8] focus:ring-4 focus:ring-[#E35336]/10"
                                                            />
                                                        </div>
                                                    ))}
                                                    <p className="font-bdo text-[11px] font-medium text-slate-400">
                                                        Kosongkan hari yang tidak dibuka. Format jam: HH:MM, pisahkan dengan koma.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                                    <p className="font-bdo text-xs font-semibold text-slate-500">
                                                        Unit ini mengikuti jadwal buka fasilitas utama.
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-start gap-3">
                                                    <ShinyIcon className="h-10 w-10 rounded-2xl">
                                                        <Banknote size={16} />
                                                    </ShinyIcon>
                                                    <div>
                                                        <p className="font-clash text-sm font-semibold text-slate-950">
                                                            Harga unit
                                                        </p>
                                                        <p className="mt-0.5 font-bdo text-xs font-medium text-slate-400">
                                                            Pakai harga fasilitas utama atau buat harga reguler khusus unit.
                                                        </p>
                                                    </div>
                                                </div>
                                                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 font-bdo text-xs font-bold text-emerald-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={data.use_custom_pricing}
                                                        onChange={(event) => {
                                                            const enabled = event.target.checked;
                                                            setData("use_custom_pricing", enabled);
                                                            if (enabled && data.prices.length === 0) {
                                                                setData("prices", defaultUnitPrices());
                                                            }
                                                        }}
                                                        className="h-4 w-4 rounded border-emerald-200 text-emerald-500 focus:ring-emerald-500/25"
                                                    />
                                                    Custom harga
                                                </label>
                                            </div>

                                            {data.use_custom_pricing ? (
                                                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                                                    {PRICE_SEGMENTS.map((segment) => {
                                                        const row = regularPriceFor(segment.value);

                                                        return (
                                                            <div key={segment.value} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                                <p className="font-clash text-sm font-semibold text-slate-950">
                                                                    {segment.label}
                                                                </p>
                                                                <p className="mt-0.5 font-bdo text-[11px] font-medium text-slate-400">
                                                                    {segment.helper}
                                                                </p>
                                                                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
                                                                    <div className="relative">
                                                                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-bdo text-xs font-bold text-[#B93D2A]">
                                                                            Rp
                                                                        </span>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            step="1000"
                                                                            value={row.price}
                                                                            onChange={(event) => setPriceRow(segment.value, "price", event.target.value)}
                                                                            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 font-bdo text-xs font-semibold text-slate-700 outline-none transition focus:border-[#F8B5A8] focus:ring-4 focus:ring-[#E35336]/10"
                                                                            aria-label={`Harga ${segment.label}`}
                                                                        />
                                                                    </div>
                                                                    <select
                                                                        value={row.duration_minutes}
                                                                        onChange={(event) => setPriceRow(segment.value, "duration_minutes", Number(event.target.value))}
                                                                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bdo text-xs font-semibold text-slate-700 outline-none transition focus:border-[#F8B5A8] focus:ring-4 focus:ring-[#E35336]/10"
                                                                        aria-label={`Durasi ${segment.label}`}
                                                                    >
                                                                        <option value={60}>60 menit</option>
                                                                        <option value={90}>90 menit</option>
                                                                        <option value={120}>120 menit</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    <p className="lg:col-span-2 font-bdo text-[11px] font-medium text-slate-400">
                                                        Harga ini dipakai untuk slot reguler unit. Jika custom harga dimatikan, sistem otomatis kembali memakai harga fasilitas utama.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                                    <p className="font-bdo text-xs font-semibold text-slate-500">
                                                        Unit ini mengikuti harga fasilitas utama.
                                                    </p>
                                                </div>
                                            )}
                                            {errors.prices && (
                                                <p className="mt-2 font-bdo text-xs font-medium text-rose-500">
                                                    {errors.prices}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <SingleDropzone
                                        label="Foto Unit"
                                        currentUrl={editingUnit?.image_url ?? null}
                                        onFileSelect={(file) => setData("unit_image", file)}
                                        onRemoveExisting={() => setData("remove_unit_image", true)}
                                    />
                                </div>

                                {errors.unit_image && (
                                    <p className="mt-3 font-bdo text-xs font-medium text-rose-500">
                                        {errors.unit_image}
                                    </p>
                                )}

                                <div className="mt-5 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={closeForm}
                                        className="h-11 rounded-2xl bg-slate-100 px-5 font-bdo text-sm font-bold text-slate-600 transition hover:bg-slate-200"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={processing || !data.name.trim()}
                                        className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 font-clash text-sm font-semibold text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                                    >
                                        {processing ? "Menyimpan..." : editingUnit ? "Simpan Unit" : "Buat Unit"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
}
