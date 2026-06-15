import { Head, Link, router, useForm, usePage } from "@inertiajs/react";
import {
    ArrowLeft,
    Building2,
    ChevronDown,
    Database,
    Image,
    MapPin,
    Plus,
    Save,
    Settings2,
    SlidersHorizontal,
    Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    MultiDropzone,
    SingleDropzone,
    type ExistingMedia,
} from "@/Components/Admin/ImageDropzone";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type { FacilityCategory, FacilityItem, PageProps } from "@/types";
import type { FormEvent, ReactNode } from "react";

// ── Global styles ─────────────────────────────────────────────────────────────

const GLOBAL_STYLES = `
    .font-clash { font-family: 'Clash Display', sans-serif; }
    .font-bdo   { font-family: 'BDO Grotesk', sans-serif; }

    @keyframes fadeInUp {
        from { opacity: 0; transform: translate3d(0, 28px, 0); }
        to   { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes fadeInLeft {
        from { opacity: 0; transform: translate3d(-20px, 0, 0); }
        to   { opacity: 1; transform: translate3d(0, 0, 0); }
    }
    @keyframes scaleIn {
        from { opacity: 0; transform: scale(0.97); }
        to   { opacity: 1; transform: scale(1); }
    }
    @keyframes titleSheen {
        0% { background-position: -120% center; }
        100% { background-position: 220% center; }
    }

    .animate-fade-in-up   { animation: fadeInUp  0.65s cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; will-change:opacity,transform; }
    .animate-fade-in-left { animation: fadeInLeft 0.55s cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; will-change:opacity,transform; }
    .animate-scale-in     { animation: scaleIn    0.5s  cubic-bezier(0.16,1,0.3,1) forwards; opacity:0; }
    .facility-title-shine {
        background: linear-gradient(110deg, #0f172a 0%, #0f172a 36%, #e35336 50%, #0f172a 64%, #0f172a 100%);
        background-size: 240% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: titleSheen 5s linear infinite;
    }

    .delay-50  { animation-delay:  50ms; }
    .delay-100 { animation-delay: 100ms; }
    .delay-150 { animation-delay: 150ms; }
    .delay-200 { animation-delay: 200ms; }
    .delay-250 { animation-delay: 250ms; }
    .delay-300 { animation-delay: 300ms; }
    .delay-350 { animation-delay: 350ms; }
    .delay-400 { animation-delay: 400ms; }

    @keyframes shimmerSweep {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(200%); }
    }
    .shimmer-once { position: relative; overflow: hidden; }
    .shimmer-once::after {
        content: '';
        position: absolute; inset: 0;
        background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%);
        width: 60%;
        animation: shimmerSweep 1.1s ease-out 0.5s forwards;
        pointer-events: none;
        border-radius: inherit;
    }

    @keyframes iconGlow {
        0%, 100% { box-shadow: 0 16px 30px -22px rgba(227,83,54,0.95); }
        50%       { box-shadow: 0 20px 34px -22px rgba(227,83,54,1), 0 0 24px rgba(227,83,54,0.16); }
    }
    .icon-glow { animation: iconGlow 3.5s ease-in-out infinite; }

    .card-glint { position: relative; }
    .card-glint::before {
        content: '';
        position: absolute;
        top: 0; left: 20px; right: 20px; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,1), transparent);
        pointer-events: none;
    }

    @keyframes thumbGlow {
        0%, 100% { box-shadow: 0 2px 8px rgba(227,83,54,0.22), 0 0 0 0 rgba(227,83,54,0); }
        50%       { box-shadow: 0 4px 12px rgba(227,83,54,0.28), 0 0 10px 2px rgba(227,83,54,0.22); }
    }
    .thumb-glow { animation: thumbGlow 2.5s ease-in-out infinite; }

    @keyframes btnSheen {
        0%   { left: -80%; }
        100% { left: 120%; }
    }
    .btn-sheen { position: relative; overflow: hidden; }
    .btn-sheen::before {
        content: '';
        position: absolute;
        top: 0; bottom: 0; width: 50%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
        animation: btnSheen 3s ease-in-out 1s infinite;
    }

    .input-field {
        width: 100%;
        border-radius: 1rem;
        border: 1px solid rgb(226 232 240 / 0.9);
        background: linear-gradient(135deg, rgb(255 255 255 / 0.92), rgb(248 250 252 / 0.66));
        padding: 0.875rem 1rem;
        font-family: 'BDO Grotesk', sans-serif;
        font-size: 0.875rem;
        color: #0f172a;
        transition: border-color 0.18s, background 0.18s, box-shadow 0.18s, transform 0.18s;
        outline: none;
        box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.8);
    }
    .input-field::placeholder { color: rgb(148 163 184); }
    .input-field:focus {
        background: white;
        border-color: rgb(227 83 54 / 0.62);
        box-shadow: 0 0 0 4px rgb(227 83 54 / 0.1), inset 0 1px 0 rgb(255 255 255 / 0.9);
    }
    .input-field.mono { font-family: 'ui-monospace', 'SFMono-Regular', monospace; font-size: 0.8125rem; }

    .section-divider {
        height: 1px;
        background: linear-gradient(90deg, transparent, rgb(248 181 168 / 0.58), transparent);
        margin: 0.25rem 0;
    }

    .facility-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: rgba(227,83,54,.34) transparent;
    }
    .facility-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
    .facility-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .facility-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(227,83,54,.34);
        border-radius: 999px;
    }

    @media (prefers-reduced-motion: reduce) {
        .animate-fade-in-up,
        .animate-fade-in-left,
        .animate-scale-in,
        .facility-title-shine,
        .icon-glow,
        .thumb-glow,
        .btn-sheen::before {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
        }
    }
`;

// ── Metadata types ────────────────────────────────────────────────────────────

interface Period {
    label: string;
    harga: string;
}
interface DaftarHargaItem {
    label: string;
    harga: string;
}
interface DetailItem {
    key: string;
    value: string;
}
interface MetadataState {
    periods: Period[];
    daftarHarga: { left: DaftarHargaItem[]; right: DaftarHargaItem[] };
    additionalDetails: DetailItem[];
}

function emptyMeta(): MetadataState {
    return { periods: [], daftarHarga: { left: [], right: [] }, additionalDetails: [] };
}

function parseMeta(raw: Record<string, unknown> | null | undefined): MetadataState {
    if (!raw) return emptyMeta();
    const dh = raw.daftarHarga as { left?: DaftarHargaItem[]; right?: DaftarHargaItem[] } | undefined;
    return {
        periods:           (raw.periods as Period[]) ?? [],
        daftarHarga:       { left: dh?.left ?? [], right: dh?.right ?? [] },
        additionalDetails: (raw.additionalDetails as DetailItem[]) ?? [],
    };
}

function hasMetaContent(m: MetadataState): boolean {
    return (
        m.periods.length > 0 ||
        m.daftarHarga.left.length > 0 ||
        m.daftarHarga.right.length > 0 ||
        m.additionalDetails.length > 0
    );
}

// ── Form types ────────────────────────────────────────────────────────────────

type Props = PageProps<{
    categories: Pick<FacilityCategory, "id" | "name">[];
    facility: FacilityItem | null;
}>;

type FormData = {
    facility_category_id: number | "";
    name: string;
    slug: string;
    description: string;
    location: string;
    venue_type: string;
    capacity: number;
    active_slots: Record<string, string[]> | null;
    class_code: string;
    rating: number;
    display_metadata: string;
    is_active: boolean;
    sort_order: number;
    hero: File | null;
    gallery: File[];
    remove_hero: boolean;
    _method?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

const LOCATIONS = ["Veteran", "Dieng"];
const VENUE_TYPES = ["Arena Tertutup", "Arena Terbuka", "Kelas & Kebugaran"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type Weekday = (typeof WEEKDAYS)[number];
const WEEKDAY_ID: Record<Weekday, string> = {
    Monday: "Senin",
    Tuesday: "Selasa",
    Wednesday: "Rabu",
    Thursday: "Kamis",
    Friday: "Jumat",
    Saturday: "Sabtu",
    Sunday: "Minggu",
};

// ── CreatableSelect Component ─────────────────────────────────────────────────

function CreatableSelect({
    id,
    name,
    value,
    onChange,
    options,
    placeholder,
    error,
    ariaLabel,
}: {
    id: string;
    name: string;
    value: string;
    onChange: (val: string) => void;
    options: string[];
    placeholder: string;
    error?: string;
    ariaLabel: string;
}) {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState(value);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Sync input with external value changes (e.g. form reset)
    useEffect(() => { setInput(value); }, [value]);

    // Close when clicking outside wrapper
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (!wrapperRef.current?.contains(t)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const filtered = input
        ? options.filter((opt) => opt.toLowerCase().includes(input.toLowerCase()))
        : options;
    const isCustom = input.trim() !== "" && !options.includes(input.trim());

    const handleSelect = (val: string) => { onChange(val); setInput(val); setOpen(false); };
    const handleCustom = () => { if (input.trim()) { onChange(input.trim()); setOpen(false); } };

    const dropdown = open
        ? (
              <div
                  data-crselect-drop
                  className="facility-scrollbar absolute left-0 top-[calc(100%+4px)] z-[80] w-full overflow-hidden rounded-2xl border border-[#F8B5A8]/70 bg-white shadow-[0_24px_60px_-34px_rgba(127,36,25,0.35)]"
              >
                  <div className="max-h-56 overflow-y-auto py-1">
                  {filtered.map((opt) => (
                      <button
                          key={opt}
                          type="button"
                          onClick={() => handleSelect(opt)}
                          className="w-full px-3.5 py-2.5 text-left font-bdo text-sm font-medium text-slate-600 transition-colors hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                      >
                          {opt}
                      </button>
                  ))}
                  {isCustom && (
                      <div className={filtered.length > 0 ? "border-t border-[#F8B5A8]/50" : ""}>
                          <button
                              type="button"
                              onClick={handleCustom}
                              className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left font-bdo text-sm font-bold text-[#B93D2A] transition-colors hover:bg-[#FFF7F5]"
                          >
                              <Plus size={14} /> Tambahkan "{input.trim()}"
                          </button>
                      </div>
                  )}
                  {!filtered.length && !isCustom && (
                      <div className="px-3.5 py-3 font-bdo text-sm text-slate-400">Tidak ada opsi</div>
                  )}
                  </div>
              </div>
          )
        : null;

    return (
        <div ref={wrapperRef} className="relative">
            <div className="relative">
                <input
                    id={id}
                    name={name}
                    type="text"
                    value={input}
                    aria-label={ariaLabel}
                    onChange={(e) => {
                        setInput(e.target.value);
                        onChange(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleCustom(); }
                        if (e.key === "Escape") setOpen(false);
                    }}
                    placeholder={placeholder}
                    className="input-field w-full pr-10"
                />
                <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#B93D2A]/60"
                />
            </div>
            {dropdown}
            {error && <p className="mt-1.5 font-bdo text-[11px] text-rose-500">{error}</p>}
        </div>
    );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ShinyIcon({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={`icon-glow relative flex shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_16px_30px_-22px_rgba(227,83,54,.95)] ${className ?? ""}`}>
            {children}
            <span className="pointer-events-none absolute left-[7px] right-[7px] top-[4px] h-[5px] rounded-full bg-white/30 blur-[1px]" />
        </div>
    );
}

function SectionCard({
    icon,
    accentColor = "terracotta",
    title,
    subtitle,
    children,
    className = "",
    animDelay = "delay-100",
}: {
    icon: ReactNode;
    accentColor?: "amber" | "violet" | "sky" | "emerald" | "rose" | "terracotta";
    title: string;
    subtitle?: string;
    children: ReactNode;
    className?: string;
    animDelay?: string;
}) {
    const accentStyles: Record<string, { ring: string; glow: string }> = {
        terracotta: { ring: "border-[#F8B5A8]/70", glow: "bg-[#E35336]/12" },
        amber:      { ring: "border-[#F8B5A8]/70", glow: "bg-[#E35336]/12" },
        violet:     { ring: "border-[#F8B5A8]/70", glow: "bg-[#E35336]/12" },
        sky:        { ring: "border-sky-100", glow: "bg-sky-400/10" },
        emerald:    { ring: "border-emerald-100", glow: "bg-emerald-400/10" },
        rose:       { ring: "border-rose-100", glow: "bg-rose-400/10" },
    };
    const accent = accentStyles[accentColor] ?? accentStyles.terracotta;

    return (
        <div className={`animate-fade-in-up ${animDelay} card-glint shimmer-once relative overflow-hidden rounded-[28px] border ${accent.ring} bg-white/95 shadow-[0_24px_56px_-46px_rgba(127,36,25,0.55)] backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[#F08C78] hover:shadow-[0_30px_64px_-48px_rgba(227,83,54,0.48)] ${className}`}>
            <div className={`pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full ${accent.glow} blur-3xl`} />
            <div className="relative z-10 flex items-center gap-3 border-b border-[#F8B5A8]/35 bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF9F7_100%)] px-5 py-4 sm:px-6 sm:py-5">
                <ShinyIcon className="h-9 w-9">
                    {icon}
                </ShinyIcon>
                <div className="min-w-0">
                    <p className="font-clash text-sm font-semibold text-slate-800 leading-tight">{title}</p>
                    {subtitle && <p className="font-bdo text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
                </div>
            </div>
            <div className="relative z-10 p-4 sm:p-6">{children}</div>
        </div>
    );
}

function ToggleSwitch({
    enabled,
    onChange,
    label,
}: {
    enabled: boolean;
    onChange: (v: boolean) => void;
    label: string;
}) {
    return (
        <label
            className="relative inline-flex h-[28px] w-[52px] shrink-0 cursor-pointer items-center"
            title={label}
        >
            <span className="sr-only">{label}</span>
            <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => onChange(event.target.checked)}
                className="peer sr-only"
                aria-label={label}
            />
            <span   
                aria-hidden="true"
                className={`relative inline-flex h-[28px] w-[52px] rounded-full p-[3px] transition-all duration-300 peer-focus-visible:ring-2 peer-focus-visible:ring-[#E35336]/35 ${
                    enabled
                        ? "bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] shadow-[0_14px_24px_-18px_rgba(227,83,54,.9),inset_0_1px_0_rgba(255,255,255,0.3)]"
                        : "bg-slate-200 shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)]"
                }`}
            >
                <span className={`relative inline-block h-[22px] w-[22px] rounded-full bg-white transition-all duration-300 ${enabled ? "translate-x-6 shadow-[0_1px_4px_rgba(0,0,0,0.2)] thumb-glow" : "translate-x-0 shadow-[0_1px_3px_rgba(0,0,0,0.15)]"}`}>
                <span className="pointer-events-none absolute top-[3px] left-[3px] right-[3px] h-[5px] rounded-full bg-white/70 blur-[0.5px]" />
                </span>
            </span>
        </label>
    );
}

// ── MetadataBuilder ───────────────────────────────────────────────────────────

function SubSection({
    label,
    count,
    open,
    onToggle,
    children,
    hint,
}: {
    label: string;
    count: number;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
    hint?: string;
}) {
    return (
        <div className="overflow-hidden rounded-2xl border border-[#F8B5A8]/55 bg-white">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between bg-[linear-gradient(135deg,#FFFFFF_0%,#FFF7F5_100%)] px-4 py-3.5 text-left transition-colors hover:bg-[#FFF7F5]"
            >
                <div className="flex items-center gap-2.5">
                    <span className="font-clash text-xs font-semibold text-slate-800">{label}</span>
                    {count > 0 && (
                        <span className="rounded-full border border-[#F8B5A8]/70 bg-[#FFF7F5] px-2 py-0.5 font-bdo text-[10px] font-bold text-[#B93D2A]">
                            {count}
                        </span>
                    )}
                    {hint && (
                        <span className="font-bdo text-[10px] text-slate-400 hidden sm:inline">{hint}</span>
                    )}
                </div>
                <ChevronDown
                    size={14}
                    className={`text-[#B93D2A]/70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
            </button>
            {open && <div className="border-t border-[#F8B5A8]/45 p-4">{children}</div>}
        </div>
    );
}

function RowInput({
    fields,
    onDelete,
    children,
}: {
    fields: ReactNode;
    onDelete: () => void;
    children?: never;
}) {
    return (
        <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">{fields}</div>
            <button
                type="button"
                onClick={onDelete}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-500 transition-colors hover:bg-rose-100"
                aria-label="Hapus baris"
            >
                <Trash2 size={13} />
            </button>
        </div>
    );
}

function AddRowButton({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[#F8B5A8] bg-[#FFF7F5]/55 py-2.5 font-bdo text-xs font-bold text-[#B93D2A] transition-colors hover:bg-[#FFE4DE]"
        >
            <Plus size={12} />
            {label}
        </button>
    );
}

function MetadataBuilder({
    value,
    onChange,
}: {
    value: MetadataState;
    onChange: (next: MetadataState) => void;
}) {
    const [open, setOpen] = useState({ periods: true, daftarHarga: false, details: false });

    const setPeriods = (periods: Period[]) => onChange({ ...value, periods });
    const setDH      = (daftarHarga: MetadataState["daftarHarga"]) => onChange({ ...value, daftarHarga });
    const setDetails = (additionalDetails: DetailItem[]) => onChange({ ...value, additionalDetails });

    const fieldClass = "min-w-0 flex-1 rounded-xl border border-slate-200/80 bg-white px-3 py-2 font-bdo text-xs text-slate-800 placeholder:text-slate-300 focus:border-[#E35336]/60 focus:outline-none focus:ring-2 focus:ring-[#E35336]/10";

    return (
        <div className="flex flex-col gap-3">

            {/* ── Periode Waktu ── */}
            <SubSection
                label="Periode Waktu"
                count={value.periods.length}
                open={open.periods}
                onToggle={() => setOpen((s) => ({ ...s, periods: !s.periods }))}
                hint="(e.g. Pagi / Siang / Malam)"
            >
                <div className="flex flex-col gap-2">
                    {value.periods.length === 0 && (
                        <p className="rounded-2xl bg-slate-50 py-3 text-center font-bdo text-[11px] text-slate-400">Belum ada periode. Tambahkan di bawah.</p>
                    )}
                    {value.periods.map((p, i) => (
                        <RowInput
                            key={i}
                            fields={
                                <>
                                    <input
                                        type="text"
                                        aria-label={`Label periode ${i + 1}`}
                                        value={p.label}
                                        onChange={(e) => {
                                            const next = [...value.periods];
                                            next[i] = { ...p, label: e.target.value };
                                            setPeriods(next);
                                        }}
                                        placeholder="Label (e.g. Pagi)"
                                        className={fieldClass}
                                    />
                                    <input
                                        type="text"
                                        aria-label={`Harga periode ${i + 1}`}
                                        value={p.harga}
                                        onChange={(e) => {
                                            const next = [...value.periods];
                                            next[i] = { ...p, harga: e.target.value };
                                            setPeriods(next);
                                        }}
                                        placeholder="Harga (e.g. Rp 50.000/Jam)"
                                        className={fieldClass}
                                    />
                                </>
                            }
                            onDelete={() => setPeriods(value.periods.filter((_, j) => j !== i))}
                        />
                    ))}
                    <AddRowButton label="Tambah Periode" onClick={() => setPeriods([...value.periods, { label: "", harga: "" }])} />
                </div>
            </SubSection>

            {/* ── Daftar Harga (Kolom Kiri / Kanan) ── */}
            <SubSection
                label="Daftar Harga (Dual Column)"
                count={value.daftarHarga.left.length + value.daftarHarga.right.length}
                open={open.daftarHarga}
                onToggle={() => setOpen((s) => ({ ...s, daftarHarga: !s.daftarHarga }))}
                hint="(e.g. Yoga: warga_ub / umum)"
            >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Left column */}
                    <div>
                        <p className="font-clash text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                            Kolom Kiri
                        </p>
                        <div className="flex flex-col gap-2">
                            {value.daftarHarga.left.map((item, i) => (
                                <RowInput
                                    key={i}
                                    fields={
                                        <>
                                            <input
                                                type="text"
                                                aria-label={`Label harga kolom kiri ${i + 1}`}
                                                value={item.label}
                                                onChange={(e) => {
                                                    const next = [...value.daftarHarga.left];
                                                    next[i] = { ...item, label: e.target.value };
                                                    setDH({ ...value.daftarHarga, left: next });
                                                }}
                                                placeholder="Label"
                                                className={fieldClass}
                                            />
                                            <input
                                                type="text"
                                                aria-label={`Harga kolom kiri ${i + 1}`}
                                                value={item.harga}
                                                onChange={(e) => {
                                                    const next = [...value.daftarHarga.left];
                                                    next[i] = { ...item, harga: e.target.value };
                                                    setDH({ ...value.daftarHarga, left: next });
                                                }}
                                                placeholder="Harga"
                                                className={fieldClass}
                                            />
                                        </>
                                    }
                                    onDelete={() => setDH({ ...value.daftarHarga, left: value.daftarHarga.left.filter((_, j) => j !== i) })}
                                />
                            ))}
                            <AddRowButton label="+ Kiri" onClick={() => setDH({ ...value.daftarHarga, left: [...value.daftarHarga.left, { label: "", harga: "" }] })} />
                        </div>
                    </div>

                    {/* Right column */}
                    <div>
                        <p className="font-clash text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                            Kolom Kanan
                        </p>
                        <div className="flex flex-col gap-2">
                            {value.daftarHarga.right.map((item, i) => (
                                <RowInput
                                    key={i}
                                    fields={
                                        <>
                                            <input
                                                type="text"
                                                aria-label={`Label harga kolom kanan ${i + 1}`}
                                                value={item.label}
                                                onChange={(e) => {
                                                    const next = [...value.daftarHarga.right];
                                                    next[i] = { ...item, label: e.target.value };
                                                    setDH({ ...value.daftarHarga, right: next });
                                                }}
                                                placeholder="Label"
                                                className={fieldClass}
                                            />
                                            <input
                                                type="text"
                                                aria-label={`Harga kolom kanan ${i + 1}`}
                                                value={item.harga}
                                                onChange={(e) => {
                                                    const next = [...value.daftarHarga.right];
                                                    next[i] = { ...item, harga: e.target.value };
                                                    setDH({ ...value.daftarHarga, right: next });
                                                }}
                                                placeholder="Harga"
                                                className={fieldClass}
                                            />
                                        </>
                                    }
                                    onDelete={() => setDH({ ...value.daftarHarga, right: value.daftarHarga.right.filter((_, j) => j !== i) })}
                                />
                            ))}
                            <AddRowButton label="+ Kanan" onClick={() => setDH({ ...value.daftarHarga, right: [...value.daftarHarga.right, { label: "", harga: "" }] })} />
                        </div>
                    </div>
                </div>
            </SubSection>

            {/* ── Additional Details ── */}
            <SubSection
                label="Detail Tambahan"
                count={value.additionalDetails.length}
                open={open.details}
                onToggle={() => setOpen((s) => ({ ...s, details: !s.details }))}
                hint="(key-value pairs)"
            >
                <div className="flex flex-col gap-2">
                    {value.additionalDetails.length === 0 && (
                        <p className="rounded-2xl bg-slate-50 py-3 text-center font-bdo text-[11px] text-slate-400">Belum ada detail. Tambahkan di bawah.</p>
                    )}
                    {value.additionalDetails.map((d, i) => (
                        <RowInput
                            key={i}
                            fields={
                                <>
                                    <input
                                        type="text"
                                        aria-label={`Nama detail tambahan ${i + 1}`}
                                        value={d.key}
                                        onChange={(e) => {
                                            const next = [...value.additionalDetails];
                                            next[i] = { ...d, key: e.target.value };
                                            setDetails(next);
                                        }}
                                        placeholder="Key (e.g. Kapasitas)"
                                        className={fieldClass}
                                    />
                                    <input
                                        type="text"
                                        aria-label={`Isi detail tambahan ${i + 1}`}
                                        value={d.value}
                                        onChange={(e) => {
                                            const next = [...value.additionalDetails];
                                            next[i] = { ...d, value: e.target.value };
                                            setDetails(next);
                                        }}
                                        placeholder="Value (e.g. 20 orang)"
                                        className={fieldClass}
                                    />
                                </>
                            }
                            onDelete={() => setDetails(value.additionalDetails.filter((_, j) => j !== i))}
                        />
                    ))}
                    <AddRowButton label="Tambah Detail" onClick={() => setDetails([...value.additionalDetails, { key: "", value: "" }])} />
                </div>
            </SubSection>
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FacilityForm() {
    const { categories, facility } = usePage<Props>().props;
    const isEdit = facility !== null;

    const [metadata, setMetadata] = useState<MetadataState>(
        parseMeta(facility?.display_metadata)
    );

    const [useWeeklySchedule, setUseWeeklySchedule] = useState(facility?.active_slots != null);
    const [dayTexts, setDayTexts] = useState<Record<string, string>>(
        WEEKDAYS.reduce((acc, day) => ({
            ...acc,
            [day]: facility?.active_slots?.[day]?.join(", ") ?? "",
        }), {} as Record<string, string>)
    );

    const { data, setData, post, processing, errors } = useForm<FormData>({
        facility_category_id: facility?.category?.id ?? "",
        name:             facility?.name ?? "",
        slug:             facility?.slug ?? "",
        description:      facility?.description ?? "",
        location:         facility?.location ?? "",
        venue_type:       facility?.venue_type ?? "",
        capacity:         facility?.capacity ?? 1,
        active_slots:     facility?.active_slots ?? null,
        class_code:       facility?.class_code ?? "",
        rating:           facility?.rating ?? 5.0,
        display_metadata: facility?.display_metadata ? JSON.stringify(facility.display_metadata) : "",
        is_active:        facility?.is_active ?? true,
        sort_order:       facility?.sort_order ?? 0,
        hero:             null,
        gallery:          [],
        remove_hero:      false,

        ...(isEdit ? { _method: "PUT" } : {}),
    });

    // Sync name → slug (create mode only)
    useEffect(() => {
        if (!isEdit && data.name) {
            setData("slug", slugify(data.name));
        }
    }, [data.name, isEdit]);

    // Sync metadata state → form JSON string
    useEffect(() => {
        setData(
            "display_metadata",
            hasMetaContent(metadata) ? JSON.stringify(metadata) : "",
        );
    }, [metadata]);

    const submit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const url = isEdit
            ? route("admin.facilities.update", facility!.id)
            : route("admin.facilities.store");
        post(url, { forceFormData: true });
    };

    const existingHeroUrl   = facility?.hero?.url ?? null;
    const existingGallery: ExistingMedia[] = facility?.gallery ?? [];
    const selectedCategory = categories.find((category) => category.id === data.facility_category_id);
    const metadataCount =
        metadata.periods.length +
        metadata.daftarHarga.left.length +
        metadata.daftarHarga.right.length +
        metadata.additionalDetails.length;
    const scheduleLabel = useWeeklySchedule ? "Jadwal khusus" : "Jadwal otomatis";

    return (
        <AdminLayout
            header={
                <div className="animate-fade-in-up flex flex-col gap-1 pt-4">
                    <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />
                    <span className="font-bdo text-[12px] font-bold tracking-wide text-[#E35336]">
                        {isEdit ? "Edit Fasilitas" : "Fasilitas Baru"}
                    </span>
                    <h1 className="font-clash text-3xl font-bold uppercase tracking-tight xl:text-4xl">
                        <span className="facility-title-shine">
                            {isEdit ? facility!.name : "Buat Fasilitas"}
                        </span>
                    </h1>
                </div>
            }
        >
            <Head title={isEdit ? `Edit ${facility!.name}` : "Fasilitas Baru"} />

            <form
                onSubmit={submit}
                className="relative flex flex-col gap-5 overflow-x-hidden pt-4 pb-24 sm:gap-6 sm:pt-6"
                encType="multipart/form-data"
            >
                <section className="animate-fade-in-up relative overflow-hidden rounded-[28px] border border-[#F8B5A8]/70 bg-[linear-gradient(145deg,#FFFFFF_0%,#FFF7F5_46%,#FFFFFF_100%)] shadow-[0_22px_54px_-46px_rgba(127,36,25,0.5)]">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#F8B5A8_0%,#E35336_48%,#B93D2A_100%)]" />
                    <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-[#E35336]/14 blur-3xl" />
                    <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-[#F08C78]/10 blur-3xl xl:hidden" />
                    <div className="relative z-10 grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_420px]">
                        <div className="p-4 sm:p-5 lg:p-6">
                            <div className="flex flex-col gap-5">
                                <div className="max-w-2xl">
                                    <div className="inline-flex items-center gap-2 rounded-2xl border border-[#F8B5A8]/70 bg-white/78 px-3 py-1.5 font-bdo text-[11px] font-bold text-[#B93D2A] shadow-[0_16px_30px_-26px_rgba(227,83,54,.7)] xl:bg-[#FFF7F5] xl:shadow-none">
                                        <Settings2 size={13} />
                                        Editor fasilitas
                                    </div>
                                    <h2 className="mt-3 font-clash text-xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-2xl">
                                        Susun data yang akan dilihat pengguna publik.
                                    </h2>
                                    <p className="mt-2 max-w-xl font-bdo text-sm font-medium leading-relaxed text-slate-500">
                                        Ringkasan di bawah akan ikut berubah saat admin mengisi nama, kategori, jadwal, dan detail tampilan.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:max-w-3xl xl:max-w-4xl">
                                    {[
                                        { label: "Kategori", value: selectedCategory?.name ?? "Kosong" },
                                        { label: "Status", value: data.is_active ? "Aktif" : "Konsep" },
                                        { label: "Jadwal", value: scheduleLabel },
                                        { label: "Detail", value: `${metadataCount} item` },
                                    ].map((item) => (
                                        <div key={item.label} className="rounded-2xl border border-white/80 bg-white/82 px-3.5 py-3 shadow-[0_14px_28px_-24px_rgba(127,36,25,.55)] ring-1 ring-[#F8B5A8]/35 backdrop-blur-sm xl:border-slate-200 xl:bg-slate-50/70 xl:shadow-none xl:ring-0">
                                            <p className="font-bdo text-[9px] font-bold uppercase tracking-wider text-slate-400">{item.label}</p>
                                            <p className="mt-1 truncate font-bdo text-[11px] font-bold text-slate-800">{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-[#F8B5A8]/55 bg-white/70 p-4 backdrop-blur sm:p-5 lg:flex lg:items-center lg:border-l lg:border-t-0 xl:bg-[linear-gradient(135deg,#FFF7F5_0%,#FFFFFF_74%)]">
                            <div className="w-full rounded-[22px] border border-[#F8B5A8]/55 bg-white/86 p-3 shadow-[0_18px_38px_-32px_rgba(127,36,25,.55)] lg:p-4 xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none">
                            <div className="flex items-start gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_18px_30px_-22px_rgba(227,83,54,.95)]">
                                    <Building2 size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-clash text-sm font-semibold text-slate-950 line-clamp-1">
                                        {data.name || "Nama fasilitas belum diisi"}
                                    </p>
                                    <p className="mt-1 truncate font-bdo text-[11px] font-semibold text-slate-400">
                                        /{data.slug || "tautan-fasilitas"}
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        <span className="rounded-full border border-[#F8B5A8]/70 bg-white px-2.5 py-1 font-bdo text-[10px] font-bold text-[#B93D2A]">
                                            {selectedCategory?.name ?? "Kategori belum dipilih"}
                                        </span>
                                        <span
                                            className={cn(
                                                "rounded-full border px-2.5 py-1 font-bdo text-[10px] font-bold",
                                                data.is_active
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                    : "border-slate-200 bg-slate-100 text-slate-500",
                                            )}
                                        >
                                            {data.is_active ? "Tampil di situs" : "Disimpan sebagai konsep"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-3 xl:gap-6">

                    {/* ═══ LEFT — Main fields (spans 2 cols) ═══ */}
                    <SectionCard
                        icon={<Building2 size={15} />}
                        accentColor="terracotta"
                        title="Informasi Utama"
                        subtitle="Data dasar dan deskripsi fasilitas"
                        className="xl:col-span-2"
                        animDelay="delay-100"
                    >
                        <div className="flex flex-col gap-5">

                            {/* Category */}
                            <div>
                                <label htmlFor="facility_category_id" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                    Kategori
                                </label>
                                <select
                                    id="facility_category_id"
                                    name="facility_category_id"
                                    value={data.facility_category_id}
                                    onChange={(e) => setData("facility_category_id", Number(e.target.value))}
                                    className="input-field"
                                >
                                    <option value="">Pilih kategori...</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                {errors.facility_category_id && (
                                    <p className="mt-1.5 font-bdo text-[11px] text-rose-500">{errors.facility_category_id}</p>
                                )}
                            </div>

                            {/* Name */}
                            <div>
                                <label htmlFor="facility_name" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                    Nama Fasilitas
                                </label>
                                <input
                                    id="facility_name"
                                    name="name"
                                    type="text"
                                    value={data.name}
                                    onChange={(e) => setData("name", e.target.value)}
                                    placeholder="Lapangan Bulutangkis Hall A"
                                    className="input-field"
                                />
                                {errors.name && (
                                    <p className="mt-1.5 font-bdo text-[11px] text-rose-500">{errors.name}</p>
                                )}
                            </div>

                            {/* Slug */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label htmlFor="facility_slug" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                        Tautan Halaman
                                    </label>
                                    <span className="rounded-full border border-[#F8B5A8]/70 bg-[#FFF7F5] px-2.5 py-1 font-bdo text-[10px] font-bold text-[#B93D2A]">
                                        {isEdit ? "Bisa diubah manual" : "Dibuat otomatis dari nama"}
                                    </span>
                                </div>
                                <input
                                    id="facility_slug"
                                    name="slug"
                                    type="text"
                                    value={data.slug}
                                    onChange={(e) => setData("slug", e.target.value)}
                                    placeholder="lapangan-bulutangkis-hall-a"
                                    className="input-field mono"
                                />
                                {errors.slug && (
                                    <p className="mt-1.5 font-bdo text-[11px] text-rose-500">{errors.slug}</p>
                                )}
                            </div>

                            <div className="section-divider" />

                            {/* Description */}
                            <div>
                                <label htmlFor="facility_description" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                    Deskripsi
                                </label>
                                <textarea
                                    id="facility_description"
                                    name="description"
                                    value={data.description}
                                    onChange={(e) => setData("description", e.target.value)}
                                    rows={5}
                                    placeholder="Deskripsikan fasilitas ini..."
                                    className="input-field resize-none leading-relaxed"
                                />
                                {errors.description && (
                                    <p className="mt-1.5 font-bdo text-[11px] text-rose-500">{errors.description}</p>
                                )}
                            </div>
                        </div>
                    </SectionCard>

                    {/* ═══ RIGHT — Settings + Media ═══ */}
                    <div className="flex flex-col gap-5">

                        {/* Settings */}
                        <SectionCard
                            icon={<SlidersHorizontal size={15} />}
                            accentColor="terracotta"
                            title="Pengaturan"
                            subtitle="Status dan urutan tampil"
                            animDelay="delay-150"
                        >
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#F8B5A8]/55 bg-[#FFF7F5]/60 px-4 py-3.5 transition-all hover:bg-white">
                                    <div>
                                        <p className="font-clash text-sm font-semibold text-slate-800">
                                            Tampilkan di Situs
                                        </p>
                                        <p className="font-bdo text-[11px] text-slate-400 mt-0.5">
                                            {data.is_active ? "Fasilitas aktif & terlihat" : "Tersembunyi dari publik"}
                                        </p>
                                    </div>
                                    <ToggleSwitch
                                        enabled={data.is_active}
                                        onChange={(v) => setData("is_active", v)}
                                        label="Tampilkan fasilitas di situs"
                                    />
                                </div>

                                <div className="section-divider" />

                                <div>
                                    <label htmlFor="sort_order" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                        Urutan Tampil
                                    </label>
                                    <input
                                        id="sort_order"
                                        name="sort_order"
                                        type="number"
                                        min={0}
                                        value={data.sort_order}
                                        onChange={(e) => setData("sort_order", Number(e.target.value))}
                                        className="input-field mono"
                                    />
                                    <p className="mt-1.5 font-bdo text-[10px] font-medium text-slate-400">
                                        Angka lebih kecil tampil lebih dulu
                                    </p>
                                </div>

                                <div className="section-divider" />

                                <div>
                                    <label htmlFor="capacity" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                        Kapasitas Maksimal
                                    </label>
                                    <input
                                        id="capacity"
                                        name="capacity"
                                        type="number"
                                        min={1}
                                        max={9999}
                                        value={data.capacity}
                                        onChange={(e) => setData("capacity", parseInt(e.target.value) || 1)}
                                        className="input-field mono"
                                    />
                                    <p className="mt-1.5 font-bdo text-[10px] font-medium text-slate-400">
                                        1 = lapangan eksklusif. &gt;1 = kelas bersama (misal 35 untuk Yoga).
                                    </p>
                                    {errors.capacity && (
                                        <p className="mt-1.5 font-bdo text-[11px] text-rose-500">{errors.capacity}</p>
                                    )}
                                </div>

                                <div className="section-divider" />

                                {/* Weekly Schedule Toggle */}
                                <div>
                                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#F8B5A8]/55 bg-[#FFF7F5]/60 px-4 py-3.5 transition-all hover:bg-white">
                                        <div>
                                            <p className="font-clash text-sm font-semibold text-slate-800">
                                                Jadwal Berbasis Hari
                                            </p>
                                            <p className="font-bdo text-[11px] text-slate-400 mt-0.5">
                                                {useWeeklySchedule ? "Aktif - slot per hari" : "Nonaktif - 06:00-22:00 otomatis"}
                                            </p>
                                        </div>
                                        <ToggleSwitch
                                            enabled={useWeeklySchedule}
                                            label="Aktifkan jadwal berbasis hari"
                                            onChange={(v) => {
                                                setUseWeeklySchedule(v);
                                                setData("active_slots", v
                                                    ? WEEKDAYS.reduce((acc, day) => {
                                                        const parsed = dayTexts[day]
                                                            .split(",").map((s) => s.trim())
                                                            .filter((s) => /^\d{2}:\d{2}$/.test(s));
                                                        return { ...acc, [day]: parsed };
                                                    }, {} as Record<string, string[]>)
                                                    : null
                                                );
                                            }}
                                        />
                                    </div>

                                    {useWeeklySchedule && (
                                        <div className="facility-scrollbar mt-3 flex max-h-[340px] flex-col gap-2 overflow-y-auto pr-1">
                                            {WEEKDAYS.map((day) => (
                                                <div key={day} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:gap-3">
                                                    <span className="w-16 shrink-0 font-bdo text-[11px] font-bold text-slate-500">
                                                        {WEEKDAY_ID[day]}
                                                    </span>
                                                    <input
                                                        type="text"
                                                        aria-label={`Slot jadwal ${WEEKDAY_ID[day]}`}
                                                        value={dayTexts[day]}
                                                        onChange={(e) => {
                                                            const txt = e.target.value;
                                                            setDayTexts((p) => ({ ...p, [day]: txt }));
                                                            const parsed = txt
                                                                .split(",").map((s) => s.trim())
                                                                .filter((s) => /^\d{2}:\d{2}$/.test(s));
                                                            setData("active_slots", {
                                                                ...(data.active_slots ?? {}),
                                                                [day]: parsed,
                                                            });
                                                        }}
                                                        placeholder="misal: 16:00, 19:00"
                                                        className="input-field mono flex-1"
                                                    />
                                                </div>
                                            ))}
                                            <p className="mt-1 font-bdo text-[10px] text-slate-400">
                                                Kosongkan hari yang libur. Format: HH:MM dipisah koma.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </SectionCard>

                        {/* Media */}
                        <SectionCard
                            icon={<Image size={15} />}
                            accentColor="terracotta"
                            title="Media"
                            subtitle="Gambar utama dan galeri foto"
                            animDelay="delay-200"
                        >
                            <div className="flex flex-col gap-6">
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                    <p className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
                                        Gambar Utama
                                    </p>
                                    <SingleDropzone
                                        label="Gambar Utama"
                                        currentUrl={existingHeroUrl}
                                        onFileSelect={(file) => {
                                            setData("hero", file);
                                            setData("remove_hero", false);
                                        }}
                                        onRemoveExisting={() => {
                                            setData("hero", null);
                                            setData("remove_hero", true);
                                        }}
                                    />
                                </div>
                                <div className="section-divider" />
                                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                    <p className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
                                        Galeri
                                    </p>
                                    <MultiDropzone
                                        label="Galeri"
                                        existing={existingGallery}
                                        onFilesChange={(files) => setData("gallery", files)}
                                        onRemoveExisting={(id) => {
                                            if (!confirm("Hapus foto galeri ini? Tindakan ini tidak dapat dibatalkan.")) {
                                                return;
                                            }
                                            router.delete(
                                                route("admin.facilities.gallery.destroy", id),
                                                { preserveScroll: true },
                                            );
                                        }}
                                    />
                                </div>
                            </div>
                        </SectionCard>
                    </div>
                </div>

                {/* ═══ FULL-WIDTH ROW 2 — Display Info + Badge ═══ */}
                <SectionCard
                    icon={<MapPin size={15} />}
                    accentColor="terracotta"
                    title="Info Tampil & Badge"
                    subtitle="Lokasi, tipe venue, kode kelas, dan rating untuk komponen publik"
                    animDelay="delay-250"
                >
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">

                        {/* Location */}
                        <div>
                            <label htmlFor="facility_location" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                Lokasi
                            </label>
                            <CreatableSelect
                                id="facility_location"
                                name="location"
                                value={data.location}
                                onChange={(val) => setData("location", val)}
                                options={LOCATIONS}
                                placeholder="Pilih atau ketik lokasi..."
                                error={errors.location}
                                ariaLabel="Lokasi fasilitas"
                            />
                        </div>

                        {/* Venue Type */}
                        <div>
                            <label htmlFor="facility_venue_type" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                Tipe Venue
                            </label>
                            <CreatableSelect
                                id="facility_venue_type"
                                name="venue_type"
                                value={data.venue_type}
                                onChange={(val) => setData("venue_type", val)}
                                options={VENUE_TYPES}
                                placeholder="Pilih atau ketik tipe..."
                                error={errors.venue_type}
                                ariaLabel="Tipe venue fasilitas"
                            />
                        </div>

                        {/* Class Code */}
                        <div>
                            <label htmlFor="facility_class_code" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                Kode Kelas
                            </label>
                            <input
                                id="facility_class_code"
                                name="class_code"
                                type="text"
                                value={data.class_code}
                                onChange={(e) => setData("class_code", e.target.value)}
                                placeholder="/Class 003/"
                                className="input-field mono"
                            />
                            <p className="mt-1.5 font-bdo text-[10px] text-slate-400">
                                Opsional - untuk komponen kelas
                            </p>
                        </div>

                        {/* Rating */}
                        <div>
                            <label htmlFor="rating" className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                                Rating (0-5)
                            </label>
                            <input
                                id="rating"
                                name="rating"
                                type="number"
                                min={0}
                                max={5}
                                step={0.1}
                                value={data.rating}
                                onChange={(e) => setData("rating", Number(e.target.value))}
                                className="input-field mono"
                            />
                            <p className="mt-1.5 font-bdo text-[10px] text-slate-400">
                                Ditampilkan sebagai nilai rekomendasi fasilitas.
                            </p>
                        </div>
                    </div>
                </SectionCard>

                {/* ═══ FULL-WIDTH ROW 3 — Display Metadata Builder ═══ */}
                <SectionCard
                    icon={<Database size={15} />}
                    accentColor="terracotta"
                    title="Detail Tampilan Publik"
                    subtitle="Harga per periode, daftar harga, dan detail tambahan untuk UI publik"
                    animDelay="delay-300"
                >
                    <MetadataBuilder value={metadata} onChange={setMetadata} />

                    {hasMetaContent(metadata) && (
                        <details className="mt-4">
                            <summary className="cursor-pointer select-none font-bdo text-[10px] font-bold uppercase tracking-wider text-[#B93D2A] hover:text-[#E35336]">
                                Lihat rincian tersimpan
                            </summary>
                            <pre className="facility-scrollbar mt-2 overflow-x-auto rounded-2xl border border-[#F8B5A8]/55 bg-[#FFF7F5] p-3 font-mono text-[10px] text-slate-600">
                                {JSON.stringify(metadata, null, 2)}
                            </pre>
                        </details>
                    )}
                </SectionCard>

                {/* ── Action bar ── */}
                <div className="animate-fade-in-up delay-400 sticky bottom-4 z-30 flex flex-col-reverse items-stretch gap-3 rounded-[24px] border border-[#F8B5A8]/70 bg-white/92 px-4 py-4 shadow-[0_24px_60px_-42px_rgba(127,36,25,0.45)] backdrop-blur-xl sm:flex-row sm:items-center sm:px-5">
                    <Link
                        href={route("admin.facilities.index")}
                        className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-clash text-sm font-semibold text-slate-600 transition-all hover:border-[#F8B5A8] hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                    >
                        <ArrowLeft size={14} />
                        Batal
                    </Link>

                    <div className="hidden sm:block section-divider w-px h-8 mx-1" />

                    <p className="hidden flex-1 text-center font-bdo text-[11px] font-medium text-slate-400 sm:block sm:text-left">
                        {isEdit
                            ? "Perubahan akan langsung diterapkan setelah disimpan."
                            : "Fasilitas baru akan langsung tersedia untuk dikonfigurasi."
                        }
                    </p>

                    <button
                        type="submit"
                        disabled={processing}
                        className="btn-sheen relative flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-7 py-3 font-clash text-sm font-semibold text-white shadow-[0_18px_34px_-24px_rgba(227,83,54,.95),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_40px_-24px_rgba(227,83,54,1)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                    >
                        <span className="pointer-events-none absolute top-0 left-0 right-0 h-px rounded-t-xl bg-white/20" />
                        <Save size={14} />
                        {processing ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Fasilitas"}
                    </button>
                </div>
            </form>
        </AdminLayout>
    );
}
