import { Head, Link, router, usePage } from "@inertiajs/react";
import {
    ArrowLeft,
    BadgePercent,
    Banknote,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Coins,
    Edit3,
    Info,
    Layers3,
    Plus,
    Save,
    Sparkles,
    Tag,
    Trash2,
    Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import SlideOver from "@/Components/Admin/SlideOver";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { PageProps } from "@/types";

interface PriceRow {
    id?: number;
    user_category: string;
    label: string;
    price: number;
    duration_minutes: number;
    schedule_type?: ScheduleType | "regular";
    applicable_days?: string[] | null;
    starts_at?: string | null;
    ends_at?: string | null;
    starts_on?: string | null;
    ends_on?: string | null;
    notes?: string | null;
    sort_order?: number;
}

type PricingPageProps = PageProps<{
    facility: { id: number; name: string };
    prices: PriceRow[];
}>;

type ActiveTab = "warga_ub" | "umum";
type DurasiOption = "60" | "90" | "120";
type ScheduleType = "always" | "weekly" | "date_range";

interface RegulerState {
    durasi: DurasiOption;
    harga: string;
}

interface SpecialPriceItem {
    id: number;
    nama: string;
    harga: string;
    durasi: DurasiOption;
    schedule_type: ScheduleType;
    applicable_days: string[];
    starts_at: string;
    ends_at: string;
    starts_on: string;
    ends_on: string;
    notes: string;
}

interface SpecialFormState {
    nama: string;
    harga: string;
    durasi: DurasiOption;
    schedule_type: ScheduleType;
    applicable_days: string[];
    starts_at: string;
    ends_at: string;
    starts_on: string;
    ends_on: string;
    notes: string;
}

const SEGMENTS: Record<ActiveTab, {
    label: string;
    shortLabel: string;
    description: string;
    icon: typeof Users;
}> = {
    warga_ub: {
        label: "Warga UB",
        shortLabel: "UB",
        description: "Tarif khusus untuk sivitas dan warga UB.",
        icon: Users,
    },
    umum: {
        label: "Umum",
        shortLabel: "Umum",
        description: "Tarif publik untuk pengunjung umum.",
        icon: BadgePercent,
    },
};

const DURATIONS: { value: DurasiOption; label: string }[] = [
    { value: "60", label: "60 menit" },
    { value: "90", label: "90 menit" },
    { value: "120", label: "120 menit" },
];

const DAYS = [
    { value: "Monday", label: "Senin" },
    { value: "Tuesday", label: "Selasa" },
    { value: "Wednesday", label: "Rabu" },
    { value: "Thursday", label: "Kamis" },
    { value: "Friday", label: "Jumat" },
    { value: "Saturday", label: "Sabtu" },
    { value: "Sunday", label: "Minggu" },
] as const;

const SCHEDULE_OPTIONS: { value: ScheduleType; label: string; description: string }[] = [
    { value: "always", label: "Setiap waktu", description: "Selalu menggantikan harga reguler." },
    { value: "weekly", label: "Hari & jam", description: "Aktif pada hari dan jam tertentu." },
    { value: "date_range", label: "Tanggal khusus", description: "Aktif pada rentang tanggal tertentu." },
];

const NOTE_PRESETS = [
    "Berlaku pagi hari",
    "Berlaku sore hari",
    "Akhir pekan",
    "Hari kerja",
    "Event khusus",
];

const GLOBAL_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo { font-family: 'BDO Grotesk', sans-serif; }

    @keyframes priceFadeUp {
        from { opacity: 0; transform: translate3d(0, 24px, 0); }
        to { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes priceSheen {
        0% { background-position: -120% center; }
        100% { background-position: 220% center; }
    }
    @keyframes pricePulse {
        0%, 100% { box-shadow: 0 14px 28px -22px rgba(227,83,54,.9); }
        50% { box-shadow: 0 18px 36px -22px rgba(227,83,54,1), 0 0 24px rgba(227,83,54,.13); }
    }
    .price-enter { animation: priceFadeUp .62s cubic-bezier(.16,1,.3,1) both; }
    .price-title-shine {
        background: linear-gradient(110deg, #0f172a 0%, #0f172a 36%, #e35336 50%, #0f172a 64%, #0f172a 100%);
        background-size: 240% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: priceSheen 5s linear infinite;
    }
    .price-icon-live { animation: pricePulse 3.4s ease-in-out infinite; }
    .price-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(227,83,54,.34) transparent; }
    .price-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .price-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .price-scrollbar::-webkit-scrollbar-thumb { background: rgba(227,83,54,.34); border-radius: 999px; }
    @media (prefers-reduced-motion: reduce) {
        .price-enter, .price-title-shine, .price-icon-live { animation: none !important; opacity: 1 !important; transform: none !important; }
    }
`;

function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString("id-ID")}`;
}

function parseMoney(value: string): number {
    return Number(value || 0);
}

function emptySpecialForm(): SpecialFormState {
    return {
        nama: "",
        harga: "",
        durasi: "60",
        schedule_type: "weekly",
        applicable_days: [],
        starts_at: "06:00",
        ends_at: "15:00",
        starts_on: "",
        ends_on: "",
        notes: "",
    };
}

function describeRule(item: Pick<SpecialPriceItem, "schedule_type" | "applicable_days" | "starts_at" | "ends_at" | "starts_on" | "ends_on">): string {
    const time = item.starts_at && item.ends_at ? ` pukul ${item.starts_at}-${item.ends_at}` : "";

    if (item.schedule_type === "always") {
        return `Setiap waktu${time}`;
    }

    if (item.schedule_type === "weekly") {
        const days = item.applicable_days.length > 0
            ? item.applicable_days
                .map((day) => DAYS.find((option) => option.value === day)?.label ?? day)
                .join(", ")
            : "hari belum dipilih";

        return `${days}${time}`;
    }

    const start = item.starts_on || "tanggal mulai";
    const end = item.ends_on || "tanggal selesai";

    return `${start} sampai ${end}${time}`;
}

function isDuration(value: number | string | undefined): value is DurasiOption {
    return value === "60" || value === "90" || value === "120" || value === 60 || value === 90 || value === 120;
}

function toDuration(value: number | string | undefined): DurasiOption {
    const normalized = String(value ?? 60);
    return isDuration(normalized) ? normalized : "60";
}

function FieldLabel({ children }: { children: React.ReactNode }) {
    return (
        <label className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {children}
        </label>
    );
}

function IconTile({
    icon,
    className,
}: {
    icon: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "price-icon-live flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white",
                "shadow-[0_18px_32px_-24px_rgba(227,83,54,.95)]",
                className,
            )}
        >
            {icon}
        </div>
    );
}

function MoneyInput({
    value,
    onChange,
    placeholder = "0",
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-bdo text-sm font-bold text-[#B93D2A]">
                Rp
            </span>
            <input
                type="number"
                min="0"
                step="1000"
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 pl-11 font-bdo text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-[#E35336]/65 focus:ring-4 focus:ring-[#E35336]/10"
            />
        </div>
    );
}

function DurationSelect({
    value,
    onChange,
}: {
    value: DurasiOption;
    onChange: (value: DurasiOption) => void;
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value as DurasiOption)}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bdo text-sm font-semibold text-slate-900 outline-none transition-all focus:border-[#E35336]/65 focus:ring-4 focus:ring-[#E35336]/10"
        >
            {DURATIONS.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}

function SegmentButton({
    segment,
    active,
    regularPrice,
    specialCount,
    onClick,
}: {
    segment: ActiveTab;
    active: boolean;
    regularPrice: string;
    specialCount: number;
    onClick: () => void;
}) {
    const meta = SEGMENTS[segment];
    const Icon = meta.icon;

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "group relative overflow-hidden rounded-[24px] border p-4 text-left transition-all",
                active
                    ? "border-[#F8B5A8] bg-[linear-gradient(145deg,#FFFFFF_0%,#FFF7F5_100%)] shadow-[0_24px_44px_-36px_rgba(227,83,54,.85)]"
                    : "border-slate-200 bg-white hover:border-[#F8B5A8]/80 hover:bg-[#FFF7F5]/45",
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-2xl transition-all",
                            active
                                ? "bg-[linear-gradient(135deg,#F08C78_0%,#E35336_55%,#B93D2A_100%)] text-white"
                                : "bg-slate-100 text-slate-400 group-hover:bg-[#FFF7F5] group-hover:text-[#E35336]",
                        )}
                    >
                        <Icon size={17} />
                    </div>
                    <div>
                        <p className="font-clash text-sm font-semibold text-slate-950">{meta.label}</p>
                        <p className="mt-0.5 font-bdo text-[11px] font-medium text-slate-400">
                            {specialCount} harga khusus
                        </p>
                    </div>
                </div>
                {active && <CheckCircle2 size={18} className="text-[#E35336]" />}
            </div>

            <div className="mt-4 rounded-2xl border border-white bg-white/78 px-3 py-3 ring-1 ring-[#F8B5A8]/35">
                <p className="font-bdo text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Harga reguler
                </p>
                <p className="mt-1 font-clash text-lg font-semibold text-slate-950">
                    {regularPrice ? formatPrice(parseMoney(regularPrice)) : "Belum diisi"}
                </p>
            </div>
        </button>
    );
}

function SummaryStat({
    label,
    value,
    icon,
}: {
    label: string;
    value: string;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-[22px] border border-slate-200 bg-white/86 p-4">
            <div className="flex items-center justify-between gap-3">
                <p className="font-bdo text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {label}
                </p>
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF7F5] text-[#E35336]">
                    {icon}
                </span>
            </div>
            <p className="mt-3 truncate font-clash text-lg font-semibold text-slate-950">
                {value}
            </p>
        </div>
    );
}

export default function FacilityPricing() {
    const { facility, prices: initialPrices } = usePage<PricingPageProps>().props;
    const [activeTab, setActiveTab] = useState<ActiveTab>("warga_ub");
    const [saving, setSaving] = useState(false);
    const [validationMessage, setValidationMessage] = useState<string | null>(null);
    const [showSlideOver, setShowSlideOver] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [specialForm, setSpecialForm] = useState<SpecialFormState>(emptySpecialForm);

    const findReguler = (segment: ActiveTab) => {
        const segmentPrices = initialPrices
            .filter((price) => price.user_category === segment)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        return segmentPrices.find((price) => price.label === "Reguler")
            ?? segmentPrices.find((price) => (price.schedule_type ?? "regular") === "regular")
            ?? segmentPrices[0];
    };

    const [regulerState, setRegulerState] = useState<Record<ActiveTab, RegulerState>>({
        warga_ub: {
            durasi: toDuration(findReguler("warga_ub")?.duration_minutes),
            harga: findReguler("warga_ub")?.price !== undefined ? String(findReguler("warga_ub")?.price) : "",
        },
        umum: {
            durasi: toDuration(findReguler("umum")?.duration_minutes),
            harga: findReguler("umum")?.price !== undefined ? String(findReguler("umum")?.price) : "",
        },
    });

    const mapSpecial = (segment: ActiveTab): SpecialPriceItem[] =>
        initialPrices
            .filter((price) => {
                const regular = findReguler(segment);

                return price.user_category === segment
                    && price.label !== "Reguler"
                    && price.id !== regular?.id;
            })
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
            .map((price, index) => ({
                id: price.id ?? Date.now() + index,
                nama: price.label,
                harga: String(price.price),
                durasi: toDuration(price.duration_minutes),
                schedule_type: (price.schedule_type === "always" || price.schedule_type === "weekly" || price.schedule_type === "date_range")
                    ? price.schedule_type
                    : "always",
                applicable_days: price.applicable_days ?? [],
                starts_at: price.starts_at ?? "",
                ends_at: price.ends_at ?? "",
                starts_on: price.starts_on ?? "",
                ends_on: price.ends_on ?? "",
                notes: price.notes ?? "",
            }));

    const [specialItems, setSpecialItems] = useState<Record<ActiveTab, SpecialPriceItem[]>>({
        warga_ub: mapSpecial("warga_ub"),
        umum: mapSpecial("umum"),
    });

    const reguler = regulerState[activeTab];
    const activeSpecials = specialItems[activeTab];
    const activeMeta = SEGMENTS[activeTab];

    const allPrices = useMemo(() => {
        const regularValues = (Object.keys(regulerState) as ActiveTab[])
            .map((segment) => parseMoney(regulerState[segment].harga))
            .filter((value) => value > 0);
        const specialValues = (Object.keys(specialItems) as ActiveTab[])
            .flatMap((segment) => specialItems[segment].map((item) => parseMoney(item.harga)))
            .filter((value) => value > 0);

        return [...regularValues, ...specialValues];
    }, [regulerState, specialItems]);

    const lowestPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
    const averagePrice = allPrices.length > 0
        ? Math.round(allPrices.reduce((sum, price) => sum + price, 0) / allPrices.length)
        : 0;
    const totalSpecials = specialItems.warga_ub.length + specialItems.umum.length;
    const totalConfigured = allPrices.length;

    const setReguler = (updates: Partial<RegulerState>) => {
        setRegulerState((previous) => ({
            ...previous,
            [activeTab]: { ...previous[activeTab], ...updates },
        }));
        setValidationMessage(null);
    };

    const openCreateSpecial = () => {
        setEditingId(null);
        setSpecialForm({
            ...emptySpecialForm(),
            durasi: regulerState[activeTab].durasi,
        });
        setValidationMessage(null);
        setShowSlideOver(true);
    };

    const openEditSpecial = (item: SpecialPriceItem) => {
        setEditingId(item.id);
        setSpecialForm({
            nama: item.nama,
            harga: item.harga,
            durasi: regulerState[activeTab].durasi,
            schedule_type: item.schedule_type,
            applicable_days: item.applicable_days,
            starts_at: item.starts_at,
            ends_at: item.ends_at,
            starts_on: item.starts_on,
            ends_on: item.ends_on,
            notes: item.notes,
        });
        setValidationMessage(null);
        setShowSlideOver(true);
    };

    const closeSpecialForm = () => {
        setShowSlideOver(false);
        setEditingId(null);
        setSpecialForm(emptySpecialForm());
        setValidationMessage(null);
    };

    const saveSpecial = () => {
        const nama = specialForm.nama.trim();
        const harga = parseMoney(specialForm.harga);

        if (!nama) {
            setValidationMessage("Nama harga khusus wajib diisi.");
            return;
        }

        if (specialForm.harga === "" || Number.isNaN(harga) || harga < 0) {
            setValidationMessage("Harga khusus wajib diisi dengan angka yang valid.");
            return;
        }

        if (specialForm.schedule_type === "weekly" && specialForm.applicable_days.length === 0) {
            setValidationMessage("Pilih minimal satu hari untuk harga khusus ini.");
            return;
        }

        if (specialForm.schedule_type === "date_range" && (!specialForm.starts_on || !specialForm.ends_on)) {
            setValidationMessage("Tanggal mulai dan tanggal selesai wajib diisi.");
            return;
        }

        if (specialForm.starts_on && specialForm.ends_on && specialForm.ends_on < specialForm.starts_on) {
            setValidationMessage("Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
            return;
        }

        if ((specialForm.starts_at && !specialForm.ends_at) || (!specialForm.starts_at && specialForm.ends_at)) {
            setValidationMessage("Jam mulai dan jam selesai harus diisi lengkap.");
            return;
        }

        const regularDuration = regulerState[activeTab].durasi;
        const nextItem: SpecialPriceItem = {
            id: editingId ?? Date.now(),
            nama,
            harga: String(harga),
            durasi: regularDuration,
            schedule_type: specialForm.schedule_type,
            applicable_days: specialForm.schedule_type === "weekly" ? specialForm.applicable_days : [],
            starts_at: specialForm.starts_at,
            ends_at: specialForm.ends_at,
            starts_on: specialForm.schedule_type === "date_range" ? specialForm.starts_on : "",
            ends_on: specialForm.schedule_type === "date_range" ? specialForm.ends_on : "",
            notes: specialForm.notes.trim(),
        };

        setSpecialItems((previous) => ({
            ...previous,
            [activeTab]: editingId === null
                ? [...previous[activeTab], nextItem]
                : previous[activeTab].map((item) => (item.id === editingId ? nextItem : item)),
        }));
        setValidationMessage(null);
        closeSpecialForm();
    };

    const deleteSpecial = (id: number) => {
        if (!confirm("Hapus harga khusus ini?")) {
            return;
        }

        setSpecialItems((previous) => ({
            ...previous,
            [activeTab]: previous[activeTab].filter((item) => item.id !== id),
        }));
    };

    const buildPricesPayload = (): PriceRow[] => [
        {
            user_category: "warga_ub",
            label: "Reguler",
            price: parseMoney(regulerState.warga_ub.harga),
            duration_minutes: parseInt(regulerState.warga_ub.durasi),
            schedule_type: "regular",
            sort_order: 0,
        },
        {
            user_category: "umum",
            label: "Reguler",
            price: parseMoney(regulerState.umum.harga),
            duration_minutes: parseInt(regulerState.umum.durasi),
            schedule_type: "regular",
            sort_order: 1,
        },
        ...specialItems.warga_ub.map((item, index) => ({
            user_category: "warga_ub",
            label: item.nama,
            price: parseMoney(item.harga),
            duration_minutes: parseInt(regulerState.warga_ub.durasi),
            schedule_type: item.schedule_type,
            applicable_days: item.schedule_type === "weekly" ? item.applicable_days : null,
            starts_at: item.starts_at || null,
            ends_at: item.ends_at || null,
            starts_on: item.schedule_type === "date_range" ? item.starts_on || null : null,
            ends_on: item.schedule_type === "date_range" ? item.ends_on || null : null,
            notes: item.notes || null,
            sort_order: index + 10,
        })),
        ...specialItems.umum.map((item, index) => ({
            user_category: "umum",
            label: item.nama,
            price: parseMoney(item.harga),
            duration_minutes: parseInt(regulerState.umum.durasi),
            schedule_type: item.schedule_type,
            applicable_days: item.schedule_type === "weekly" ? item.applicable_days : null,
            starts_at: item.starts_at || null,
            ends_at: item.ends_at || null,
            starts_on: item.schedule_type === "date_range" ? item.starts_on || null : null,
            ends_on: item.schedule_type === "date_range" ? item.ends_on || null : null,
            notes: item.notes || null,
            sort_order: index + 10,
        })),
    ];

    const submitPrices = () => {
        const requiredSegments: ActiveTab[] = ["warga_ub", "umum"];
        const missingSegment = requiredSegments.find((segment) => regulerState[segment].harga === "");

        if (missingSegment) {
            setValidationMessage(`Harga reguler ${SEGMENTS[missingSegment].label} wajib diisi sebelum disimpan.`);
            return;
        }

        const invalidRegular = requiredSegments.find((segment) => {
            const value = parseMoney(regulerState[segment].harga);
            return Number.isNaN(value) || value < 0;
        });

        if (invalidRegular) {
            setValidationMessage(`Harga reguler ${SEGMENTS[invalidRegular].label} tidak valid.`);
            return;
        }

        setValidationMessage(null);
        setSaving(true);
        router.post(
            route("admin.facilities.pricing.sync", facility.id),
            { prices: buildPricesPayload() } as any,
            { onFinish: () => setSaving(false) },
        );
    };

    return (
        <AdminLayout
            header={
                <div className="price-enter flex flex-col gap-1 pt-4">
                    <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />
                    <span className="font-bdo text-[12px] font-bold tracking-wide text-[#E35336]">
                        Fasilitas - Pricing Studio
                    </span>
                    <h1 className="font-clash text-3xl font-bold uppercase tracking-tight xl:text-4xl">
                        <span className="price-title-shine">Pengaturan Harga</span>
                    </h1>
                </div>
            }
        >
            <Head title={`Pengaturan Harga - ${facility.name}`} />

            <div className="relative flex flex-col gap-5 overflow-x-hidden pt-4 pb-24 sm:gap-6 sm:pt-6">
                <section className="price-enter relative overflow-hidden rounded-[30px] border border-[#F8B5A8]/75 bg-[linear-gradient(145deg,#FFFFFF_0%,#FFF7F5_48%,#FFFFFF_100%)] shadow-[0_24px_58px_-48px_rgba(127,36,25,.62)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#F8B5A8_0%,#E35336_48%,#B93D2A_100%)]" />
                    <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[#E35336]/14 blur-3xl" />
                    <div className="relative z-10 grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
                        <div className="p-5 sm:p-6 xl:p-7">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-2xl">
                                    <div className="inline-flex items-center gap-2 rounded-2xl border border-[#F8B5A8]/70 bg-white/80 px-3 py-1.5 font-bdo text-[11px] font-bold text-[#B93D2A]">
                                        <Sparkles size={13} />
                                        Price control
                                    </div>
                                    <h2 className="mt-4 font-clash text-2xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-3xl">
                                        Atur tarif fasilitas dengan cepat, jelas, dan minim salah input.
                                    </h2>
                                    <p className="mt-2 max-w-xl font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                        Kelola harga reguler untuk Warga UB dan Umum, lalu tambahkan harga khusus sebagai opsi tarif tambahan bila diperlukan.
                                    </p>
                                </div>

                                <Link
                                    href={route("admin.facilities.index")}
                                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#F8B5A8]/70 bg-white px-4 py-2.5 font-clash text-sm font-semibold text-[#B93D2A] transition-all hover:bg-[#FFF7F5]"
                                >
                                    <ArrowLeft size={14} />
                                    Kembali
                                </Link>
                            </div>

                            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                {(Object.keys(SEGMENTS) as ActiveTab[]).map((segment) => (
                                    <SegmentButton
                                        key={segment}
                                        segment={segment}
                                        active={activeTab === segment}
                                        regularPrice={regulerState[segment].harga}
                                        specialCount={specialItems[segment].length}
                                        onClick={() => setActiveTab(segment)}
                                    />
                                ))}
                            </div>
                        </div>

                        <aside className="border-t border-[#F8B5A8]/55 bg-white/72 p-5 backdrop-blur xl:border-l xl:border-t-0 xl:p-6">
                            <div className="flex items-start gap-3">
                                <IconTile icon={<Coins size={19} />} />
                                <div className="min-w-0 flex-1">
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Fasilitas aktif
                                    </p>
                                    <p className="mt-1 truncate font-clash text-lg font-semibold text-slate-950">
                                        {facility.name}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 grid grid-cols-2 gap-3">
                                <SummaryStat
                                    label="Harga terendah"
                                    value={lowestPrice > 0 ? formatPrice(lowestPrice) : "Belum ada"}
                                    icon={<Banknote size={15} />}
                                />
                                <SummaryStat
                                    label="Rata-rata"
                                    value={averagePrice > 0 ? formatPrice(averagePrice) : "Belum ada"}
                                    icon={<Layers3 size={15} />}
                                />
                                <SummaryStat
                                    label="Total item"
                                    value={`${totalConfigured} harga`}
                                    icon={<Tag size={15} />}
                                />
                                <SummaryStat
                                    label="Khusus"
                                    value={`${totalSpecials} item`}
                                    icon={<CalendarDays size={15} />}
                                />
                            </div>
                        </aside>
                    </div>
                </section>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px] xl:gap-6">
                    <section className="price-enter rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_22px_50px_-44px_rgba(15,23,42,.42)] sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex items-start gap-3">
                                <IconTile icon={<Banknote size={18} />} className="h-11 w-11" />
                                <div>
                                    <p className="font-clash text-lg font-semibold text-slate-950">
                                        Harga Reguler {activeMeta.label}
                                    </p>
                                    <p className="mt-1 max-w-xl font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                        {activeMeta.description}
                                    </p>
                                </div>
                            </div>
                            <span className="inline-flex w-fit items-center rounded-full border border-[#F8B5A8]/70 bg-[#FFF7F5] px-3 py-1 font-bdo text-[11px] font-bold text-[#B93D2A]">
                                Segment {activeMeta.shortLabel}
                            </span>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <FieldLabel>Harga sewa</FieldLabel>
                                <MoneyInput
                                    value={reguler.harga}
                                    onChange={(harga) => setReguler({ harga })}
                                />
                            </div>
                            <div className="space-y-2">
                                <FieldLabel>Durasi per sesi</FieldLabel>
                                <DurationSelect
                                    value={reguler.durasi}
                                    onChange={(durasi) => setReguler({ durasi })}
                                />
                            </div>
                        </div>

                        <div className="mt-6 rounded-[24px] border border-[#F8B5A8]/55 bg-[linear-gradient(135deg,#FFF7F5_0%,#FFFFFF_82%)] p-4">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Preview harga
                                    </p>
                                    <p className="mt-1 font-clash text-3xl font-semibold text-slate-950">
                                        {reguler.harga ? formatPrice(parseMoney(reguler.harga)) : "Rp 0"}
                                    </p>
                                    <p className="mt-1 font-bdo text-xs font-medium text-slate-500">
                                        Berlaku untuk {activeMeta.label} per {reguler.durasi} menit.
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-[#F8B5A8]/50">
                                    <p className="font-bdo text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Estimasi / jam
                                    </p>
                                    <p className="mt-1 font-clash text-lg font-semibold text-[#B93D2A]">
                                        {reguler.harga
                                            ? formatPrice(Math.round((parseMoney(reguler.harga) / parseInt(reguler.durasi)) * 60))
                                            : "Rp 0"}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <aside className="price-enter rounded-[28px] border border-[#F8B5A8]/70 bg-[linear-gradient(145deg,#FFFFFF_0%,#FFF7F5_100%)] p-5 shadow-[0_22px_50px_-44px_rgba(127,36,25,.55)] sm:p-6">
                        <div className="flex items-start gap-3">
                            <IconTile icon={<Info size={18} />} className="h-11 w-11" />
                            <div>
                                <p className="font-clash text-base font-semibold text-slate-950">
                                    Alur aman
                                </p>
                                <p className="mt-1 font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                    Tidak ada harga contoh yang disimpan otomatis. Semua item di halaman ini berasal dari data admin atau input baru.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 space-y-3">
                            {[
                                "Isi harga reguler Warga UB dan Umum.",
                                "Tambahkan harga khusus bila ada variasi tarif.",
                                "Simpan setelah semua angka sudah benar.",
                            ].map((text) => (
                                <div key={text} className="flex items-center gap-3 rounded-2xl bg-white/78 px-3.5 py-3 ring-1 ring-[#F8B5A8]/35">
                                    <CheckCircle2 size={16} className="shrink-0 text-[#E35336]" />
                                    <p className="font-bdo text-xs font-semibold text-slate-600">{text}</p>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>

                <section className="price-enter rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_22px_50px_-44px_rgba(15,23,42,.42)] sm:p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex items-start gap-3">
                            <IconTile icon={<Clock3 size={18} />} className="h-11 w-11" />
                            <div>
                                <p className="font-clash text-lg font-semibold text-slate-950">
                                    Harga Khusus {activeMeta.label}
                                </p>
                                <p className="mt-1 max-w-2xl font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                    Gunakan untuk variasi tarif seperti pagi, sore, akhir pekan, event, atau aturan harga lain yang perlu tampil terpisah.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={openCreateSpecial}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 py-3 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95)] transition-all hover:-translate-y-0.5"
                        >
                            <Plus size={15} />
                            Tambah Harga
                        </button>
                    </div>

                    {activeSpecials.length === 0 ? (
                        <div className="mt-6 flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[#F8B5A8]/80 bg-[#FFF7F5]/55 px-5 py-12 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#E35336] ring-1 ring-[#F8B5A8]/60">
                                <Tag size={22} />
                            </div>
                            <p className="mt-4 font-clash text-base font-semibold text-slate-950">
                                Belum ada harga khusus
                            </p>
                            <p className="mt-1 max-w-md font-bdo text-sm font-medium text-slate-500">
                                Harga reguler tetap digunakan. Tambahkan harga khusus hanya jika memang ada variasi tarif.
                            </p>
                        </div>
                    ) : (
                        <div className="price-scrollbar mt-6 max-h-[520px] overflow-y-auto pr-1">
                            <div className="grid gap-3 lg:grid-cols-2">
                                {activeSpecials.map((item, index) => (
                                    <article
                                        key={item.id}
                                        className="group rounded-[24px] border border-slate-200 bg-[linear-gradient(145deg,#FFFFFF_0%,#F8FAFC_100%)] p-4 transition-all hover:border-[#F8B5A8] hover:bg-[#FFF7F5]/55"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-3">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FFF7F5] text-[#E35336] ring-1 ring-[#F8B5A8]/55">
                                                    <span className="font-clash text-xs font-semibold">
                                                        {String(index + 1).padStart(2, "0")}
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate font-clash text-sm font-semibold text-slate-950">
                                                        {item.nama}
                                                    </p>
                                                    <p className="mt-1 font-bdo text-xs font-semibold text-[#B93D2A]">
                                                        {formatPrice(parseMoney(item.harga))} / {regulerState[activeTab].durasi} menit
                                                    </p>
                                                    <p className="mt-1 font-bdo text-[11px] font-semibold text-slate-500">
                                                        {describeRule(item)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openEditSpecial(item)}
                                                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-white hover:text-[#B93D2A]"
                                                    aria-label="Edit harga khusus"
                                                >
                                                    <Edit3 size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => deleteSpecial(item.id)}
                                                    className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500"
                                                    aria-label="Hapus harga khusus"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {item.notes && (
                                            <div className="mt-4 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                                                <p className="font-bdo text-[11px] font-medium leading-relaxed text-slate-500">
                                                    {item.notes}
                                                </p>
                                            </div>
                                        )}
                                    </article>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                <div className="price-enter sticky bottom-4 z-30 flex flex-col gap-3 rounded-[24px] border border-[#F8B5A8]/70 bg-white/94 px-4 py-4 shadow-[0_24px_60px_-42px_rgba(127,36,25,.48)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="min-w-0">
                        <p className="font-clash text-sm font-semibold text-slate-950">
                            Simpan konfigurasi harga
                        </p>
                        <p className={cn("mt-0.5 font-bdo text-xs font-medium", validationMessage ? "text-rose-500" : "text-slate-400")}>
                            {validationMessage ?? "Perubahan akan mengganti daftar harga fasilitas ini setelah disimpan."}
                        </p>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                        <Link
                            href={route("admin.facilities.index")}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-clash text-sm font-semibold text-slate-600 transition-all hover:border-[#F8B5A8] hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                        >
                            <ArrowLeft size={14} />
                            Batal
                        </Link>
                        <button
                            type="button"
                            disabled={saving}
                            onClick={submitPrices}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-6 py-3 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                        >
                            <Save size={15} />
                            {saving ? "Menyimpan..." : "Simpan Harga"}
                        </button>
                    </div>
                </div>
            </div>

            <SlideOver
                isOpen={showSlideOver}
                onClose={closeSpecialForm}
                title={editingId === null ? "Tambah Harga Khusus" : "Edit Harga Khusus"}
                description={`Segmen aktif: ${activeMeta.label}`}
            >
                {showSlideOver && (
                    <div className="flex flex-col gap-5">
                        <div className="rounded-[24px] border border-[#F8B5A8]/70 bg-[#FFF7F5] p-4">
                            <div className="flex items-center gap-3">
                                <IconTile icon={<Tag size={17} />} className="h-10 w-10" />
                                <div>
                                    <p className="font-clash text-sm font-semibold text-slate-950">
                                        {activeMeta.label}
                                    </p>
                                    <p className="font-bdo text-xs font-medium text-slate-500">
                                        Harga ini akan masuk ke daftar tarif segmen tersebut.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <FieldLabel>Nama harga</FieldLabel>
                            <input
                                type="text"
                                value={specialForm.nama}
                                placeholder="Contoh: Tarif sore"
                                onChange={(event) => setSpecialForm((previous) => ({ ...previous, nama: event.target.value }))}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bdo text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-[#E35336]/65 focus:ring-4 focus:ring-[#E35336]/10"
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <FieldLabel>Harga sewa</FieldLabel>
                                <MoneyInput
                                    value={specialForm.harga}
                                    onChange={(harga) => setSpecialForm((previous) => ({ ...previous, harga }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <FieldLabel>Durasi slot</FieldLabel>
                                <div className="rounded-2xl border border-[#F8B5A8]/70 bg-[#FFF7F5] px-4 py-3.5">
                                    <p className="font-clash text-sm font-semibold text-slate-950">
                                        {reguler.durasi} menit
                                    </p>
                                    <p className="mt-0.5 font-bdo text-[11px] font-semibold text-[#B93D2A]">
                                        Mengikuti durasi reguler {activeMeta.label}.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <FieldLabel>Aturan berlaku</FieldLabel>
                            <div className="grid gap-2">
                                {SCHEDULE_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setSpecialForm((previous) => ({
                                            ...previous,
                                            schedule_type: option.value,
                                        }))}
                                        className={cn(
                                            "rounded-2xl border px-4 py-3 text-left transition-all",
                                            specialForm.schedule_type === option.value
                                                ? "border-[#F8B5A8] bg-[#FFF7F5] ring-2 ring-[#E35336]/10"
                                                : "border-slate-200 bg-white hover:border-[#F8B5A8]/70",
                                        )}
                                    >
                                        <p className="font-clash text-sm font-semibold text-slate-950">
                                            {option.label}
                                        </p>
                                        <p className="mt-0.5 font-bdo text-xs font-medium text-slate-500">
                                            {option.description}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {specialForm.schedule_type === "weekly" && (
                            <div className="space-y-3">
                                <FieldLabel>Hari berlaku</FieldLabel>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                    {DAYS.map((day) => {
                                        const active = specialForm.applicable_days.includes(day.value);

                                        return (
                                            <button
                                                key={day.value}
                                                type="button"
                                                onClick={() => setSpecialForm((previous) => ({
                                                    ...previous,
                                                    applicable_days: active
                                                        ? previous.applicable_days.filter((item) => item !== day.value)
                                                        : [...previous.applicable_days, day.value],
                                                }))}
                                                className={cn(
                                                    "rounded-2xl border px-3 py-2.5 font-bdo text-xs font-bold transition-all",
                                                    active
                                                        ? "border-[#F8B5A8] bg-[#FFF7F5] text-[#B93D2A]"
                                                        : "border-slate-200 bg-white text-slate-500 hover:border-[#F8B5A8]/70",
                                                )}
                                            >
                                                {day.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {specialForm.schedule_type === "date_range" && (
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <FieldLabel>Tanggal mulai</FieldLabel>
                                    <input
                                        type="date"
                                        value={specialForm.starts_on}
                                        onChange={(event) => setSpecialForm((previous) => ({ ...previous, starts_on: event.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bdo text-sm font-semibold text-slate-900 outline-none transition-all focus:border-[#E35336]/65 focus:ring-4 focus:ring-[#E35336]/10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <FieldLabel>Tanggal selesai</FieldLabel>
                                    <input
                                        type="date"
                                        min={specialForm.starts_on || undefined}
                                        value={specialForm.ends_on}
                                        onChange={(event) => setSpecialForm((previous) => ({ ...previous, ends_on: event.target.value }))}
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bdo text-sm font-semibold text-slate-900 outline-none transition-all focus:border-[#E35336]/65 focus:ring-4 focus:ring-[#E35336]/10"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <FieldLabel>Jam mulai</FieldLabel>
                                <input
                                    type="time"
                                    value={specialForm.starts_at}
                                    onChange={(event) => setSpecialForm((previous) => ({ ...previous, starts_at: event.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bdo text-sm font-semibold text-slate-900 outline-none transition-all focus:border-[#E35336]/65 focus:ring-4 focus:ring-[#E35336]/10"
                                />
                            </div>
                            <div className="space-y-2">
                                <FieldLabel>Jam selesai</FieldLabel>
                                <input
                                    type="time"
                                    value={specialForm.ends_at}
                                    onChange={(event) => setSpecialForm((previous) => ({ ...previous, ends_at: event.target.value }))}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bdo text-sm font-semibold text-slate-900 outline-none transition-all focus:border-[#E35336]/65 focus:ring-4 focus:ring-[#E35336]/10"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <FieldLabel>Catatan berlaku</FieldLabel>
                            <textarea
                                rows={4}
                                maxLength={500}
                                value={specialForm.notes}
                                placeholder="Contoh: Berlaku Senin-Jumat pukul 06:00-15:00"
                                onChange={(event) => setSpecialForm((previous) => ({ ...previous, notes: event.target.value }))}
                                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 font-bdo text-sm font-medium leading-relaxed text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-[#E35336]/65 focus:ring-4 focus:ring-[#E35336]/10"
                            />
                            <div className="flex flex-wrap gap-2">
                                {NOTE_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setSpecialForm((previous) => ({
                                            ...previous,
                                            notes: previous.notes ? `${previous.notes}, ${preset}` : preset,
                                        }))}
                                        className="rounded-full border border-[#F8B5A8]/70 bg-[#FFF7F5] px-3 py-1.5 font-bdo text-[11px] font-bold text-[#B93D2A] transition-all hover:bg-white"
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                            <p className="font-bdo text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Preview
                            </p>
                            <p className="mt-1 font-clash text-2xl font-semibold text-slate-950">
                                {specialForm.harga ? formatPrice(parseMoney(specialForm.harga)) : "Rp 0"}
                            </p>
                            <p className="mt-1 font-bdo text-xs font-medium text-slate-500">
                                {specialForm.nama || "Nama harga belum diisi"} / {reguler.durasi} menit
                            </p>
                            <p className="mt-2 font-bdo text-[11px] font-semibold text-[#B93D2A]">
                                {describeRule({
                                    schedule_type: specialForm.schedule_type,
                                    applicable_days: specialForm.applicable_days,
                                    starts_at: specialForm.starts_at,
                                    ends_at: specialForm.ends_at,
                                    starts_on: specialForm.starts_on,
                                    ends_on: specialForm.ends_on,
                                })}
                            </p>
                        </div>

                        {validationMessage && (
                            <p className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 font-bdo text-xs font-semibold text-rose-600">
                                {validationMessage}
                            </p>
                        )}

                        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
                            <button
                                type="button"
                                onClick={closeSpecialForm}
                                className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-clash text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={saveSpecial}
                                className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-5 py-3 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95)] transition-all hover:-translate-y-0.5"
                            >
                                {editingId === null ? "Tambah Harga" : "Simpan Edit"}
                            </button>
                        </div>
                    </div>
                )}
            </SlideOver>
        </AdminLayout>
    );
}
