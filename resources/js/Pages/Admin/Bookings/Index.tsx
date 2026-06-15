import { Head, router, useForm, usePage } from "@inertiajs/react";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Eye,
    LayoutGrid,
    List,
    Plus,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import DataTable from "@/Components/Admin/DataTable";
import SlideOver from "@/Components/Admin/SlideOver";
import AdminLayout from "@/Layouts/AdminLayout";
import { cn } from "@/lib/utils";
import type {
    AdminBooking,
    BookingStatus,
    BookingTransaction,
    PageProps,
    PaymentStatus,
} from "@/types";

// â”€â”€ Page props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface FacilityOption {
    id: number;
    name: string;
    units?: Array<{ id: number; name: string }>;
}

type Props = PageProps<{
    bookings: AdminBooking[];
    facilities: FacilityOption[];
}>;

// â”€â”€ Calendar constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SLOT_HEIGHT  = 58; // px per HOUR
const START_HOUR   = 6;
const END_HOUR     = 24;
const TOTAL_HOURS  = END_HOUR - START_HOUR;

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function padTwo(n: number): string {
    return String(n).padStart(2, "0");
}

function parseTimeHM(timeStr: string): { h: number; m: number } {
    const parts = timeStr.split(":").map(Number);
    return { h: parts[0] ?? 0, m: parts[1] ?? 0 };
}

function getDurationMinutes(startTime: string, endTime: string): number {
    const { h: sh, m: sm } = parseTimeHM(startTime);
    const { h: eh, m: em } = parseTimeHM(endTime);
    return (eh * 60 + em) - (sh * 60 + sm);
}

function getPillTopFromTime(startTime: string): number {
    const { h, m } = parseTimeHM(startTime);
    return ((h - START_HOUR) + m / 60) * SLOT_HEIGHT;
}

function getPillHeight(durationMinutes: number): number {
    return (durationMinutes / 60) * SLOT_HEIGHT;
}

function formatPrice(amount: number): string {
    return `Rp ${amount.toLocaleString("id-ID")}`;
}

function formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h} jam`;
    if (h === 0) return `${m} menit`;
    return `${h} jam ${m} menit`;
}

function formatDateDisplay(dateStr: string): string {
    const [y, mo, d] = dateStr.split("-").map(Number);
    return new Date(y, (mo ?? 1) - 1, d).toLocaleDateString("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}

function shiftDate(dateStr: string, delta: number): string {
    const [y, mo, d] = dateStr.split("-").map(Number);
    const result = new Date(y, (mo ?? 1) - 1, (d ?? 1) + delta);
    return `${result.getFullYear()}-${padTwo(result.getMonth() + 1)}-${padTwo(result.getDate())}`;
}

function todayStr(): string {
    const now = new Date();
    return `${now.getFullYear()}-${padTwo(now.getMonth() + 1)}-${padTwo(now.getDate())}`;
}

// â”€â”€ Status maps (Visual Refined) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_STYLE: Record<BookingStatus, string> = {
    pending:   "bg-[#FFF4F1] text-[#B93D2A] border border-[#F8B5A8]",
    confirmed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    completed: "bg-blue-50 text-blue-700 border border-blue-200",
    cancelled: "bg-slate-50 text-slate-500 border border-slate-200",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
    pending:   "Pending",
    confirmed: "Konfirmasi",
    completed: "Selesai",
    cancelled: "Dibatalkan",
};

const STATUS_DOT: Record<BookingStatus, string> = {
    pending:   "bg-[#E35336] shadow-[0_0_8px_rgba(227,83,54,0.55)]",
    confirmed: "bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.8)]",
    completed: "bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]",
    cancelled: "bg-slate-300",
};

const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
    UNPAID:  "bg-[#FFF4F1] text-[#B93D2A] border border-[#F8B5A8]",
    PAID:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
    EXPIRED: "bg-rose-50 text-rose-600 border border-rose-200",
    FAILED:  "bg-red-50 text-red-600 border border-red-200",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
    UNPAID:  "Belum Bayar",
    PAID:    "Lunas",
    EXPIRED: "Expired",
    FAILED:  "Gagal",
};

// Pill color - semantic by booking origin + status
function getPillStyle(b: AdminBooking): string {
    let base: string;
    if (b.user_id !== null) {
        base = b.user_category === "warga_ub"
            ? "bg-sky-50 text-sky-800 border-sky-200 border-l-sky-500 hover:bg-sky-100"
            : "bg-emerald-50 text-emerald-800 border-emerald-200 border-l-emerald-500 hover:bg-emerald-100";
    } else if (b.is_free) {
        base = "bg-slate-50 text-slate-700 border-slate-200 border-l-slate-400 hover:bg-slate-100";
    } else {
        base = "bg-[#FFF4F1] text-[#8E2D20] border-[#F8B5A8] border-l-[#E35336] hover:bg-[#FFE9E3]";
    }
    const pending = b.status === "pending" ? "border-dashed opacity-85" : "";
    return `${base} ${pending}`.trim();
}

// â”€â”€ Badges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatusBadge({ status }: { status: BookingStatus }) {
    return (
        <span
            className={cn(
                "inline-flex rounded-md px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-widest",
                STATUS_STYLE[status],
            )}
        >
            {STATUS_LABEL[status]}
        </span>
    );
}

function PaymentBadge({ tx }: { tx: BookingTransaction | null }) {
    if (!tx) return null;
    return (
        <span
            className={cn(
                "inline-flex rounded-md px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-widest",
                PAYMENT_STATUS_STYLE[tx.payment_status],
            )}
        >
            {PAYMENT_STATUS_LABEL[tx.payment_status]}
        </span>
    );
}

// â”€â”€ Base Forms Styling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const inputBase =
    "w-full rounded-[14px] border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-[13px] font-bdo font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:bg-white focus:border-[#E35336] focus:ring-4 focus:ring-[#E35336]/10";
const labelBase =
    "font-bdo text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 mb-1.5 block";

// â”€â”€ Create Booking Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function CreateBookingForm({
    facilities,
    onClose,
}: {
    facilities: FacilityOption[];
    onClose: () => void;
}) {
    const { data, setData, post, processing, errors } = useForm({
        customer_name: "",
        facility_id:   "",
        facility_unit_id: "",
        booking_date:  todayStr(),
        start_time:    "08:00",
        end_time:      "10:00",
        pax:           1,
        is_free:       false,
        notes:         "",
    });

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        post(route("admin.bookings.store"), { onSuccess: onClose, preserveScroll: true });
    };

    const selectedFacility = facilities.find((facility) => String(facility.id) === String(data.facility_id));
    const facilityUnits = selectedFacility?.units ?? [];

    return (
        <form onSubmit={submit} className="flex flex-col gap-4 animate-fade-in-up">
            <section className="rounded-[20px] border border-[#F8B5A8]/70 bg-[linear-gradient(135deg,#FFF7F5_0%,#FFFFFF_72%)] p-3.5">
                <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_16px_30px_-22px_rgba(227,83,54,.9)]">
                        <Plus size={18} />
                    </div>
                    <div>
                        <p className="font-clash text-base font-semibold text-slate-950">Booking manual</p>
                        <p className="mt-1 font-bdo text-sm font-medium leading-relaxed text-slate-500">
                            Isi data inti, pilih unit jika tersedia, lalu simpan dengan validasi jadwal yang sama.
                        </p>
                    </div>
                </div>
            </section>
            <div>
                <label htmlFor="booking_customer_name" className={labelBase}>Nama Pelanggan</label>
                <input
                    id="booking_customer_name"
                    type="text"
                    value={data.customer_name}
                    onChange={(e) => setData("customer_name", e.target.value)}
                    placeholder="Nama lengkap pelanggan..."
                    className={inputBase}
                    required
                />
                {errors.customer_name && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.customer_name}</p>}
            </div>

            <div>
                <label htmlFor="booking_facility_id" className={labelBase}>Fasilitas</label>
                <select
                    id="booking_facility_id"
                    value={data.facility_id}
                    onChange={(e) => {
                        setData("facility_id", e.target.value);
                        setData("facility_unit_id", "");
                    }}
                    className={inputBase}
                >
                    <option value="">Pilih fasilitas...</option>
                    {facilities.map((f) => (
                        <option key={f.id} value={f.id}>
                            {f.name}
                        </option>
                    ))}
                </select>
                {errors.facility_id && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.facility_id}</p>}
            </div>

            {facilityUnits.length > 0 && (
                <div>
                    <p className={labelBase}>Unit fasilitas</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {facilityUnits.map((unit) => {
                            const active = String(data.facility_unit_id) === String(unit.id);
                            return (
                                <button
                                    key={unit.id}
                                    type="button"
                                    onClick={() => setData("facility_unit_id", String(unit.id))}
                                    className={cn(
                                        "rounded-[14px] border px-3.5 py-2.5 text-left transition-all",
                                        active
                                            ? "border-[#E35336] bg-[#FFF7F5] text-[#B93D2A] shadow-[0_14px_28px_-24px_rgba(227,83,54,.9)]"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-[#F8B5A8] hover:bg-[#FFF7F5]/60",
                                    )}
                                >
                                    <span className="block truncate font-clash text-sm font-semibold">{unit.name}</span>
                                    <span className="mt-1 block font-bdo text-[11px] font-semibold opacity-65">
                                        {active ? "Unit dipilih" : "Pilih unit ini"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    {errors.facility_unit_id && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.facility_unit_id}</p>}
                </div>
            )}

            <div>
                <label htmlFor="booking_date" className={labelBase}>Tanggal</label>
                <input
                    id="booking_date"
                    type="date"
                    value={data.booking_date}
                    min={todayStr()}
                    onChange={(e) => setData("booking_date", e.target.value)}
                    className={inputBase}
                />
                {errors.booking_date && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.booking_date}</p>}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <label htmlFor="booking_start_time" className={labelBase}>Jam Mulai</label>
                    <input
                        id="booking_start_time"
                        type="time"
                        value={data.start_time}
                        step="1800"
                        onChange={(e) => setData("start_time", e.target.value)}
                        className={inputBase}
                    />
                    {errors.start_time && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.start_time}</p>}
                </div>
                <div>
                    <label htmlFor="booking_end_time" className={labelBase}>Jam Selesai</label>
                    <input
                        id="booking_end_time"
                        type="time"
                        value={data.end_time}
                        step="1800"
                        onChange={(e) => setData("end_time", e.target.value)}
                        className={inputBase}
                    />
                    {errors.end_time && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.end_time}</p>}
                </div>
            </div>

            <div>
                <label htmlFor="booking_pax" className={labelBase}>Jumlah Peserta</label>
                <input
                    id="booking_pax"
                    type="number"
                    min={1}
                    value={data.pax}
                    onChange={(e) => setData("pax", parseInt(e.target.value) || 1)}
                    className={inputBase}
                />
                {errors.pax && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.pax}</p>}
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-[14px] border border-slate-200 bg-slate-50 px-3.5 py-3 transition-all hover:border-[#F8B5A8] hover:bg-white">
                <input
                    type="checkbox"
                    checked={data.is_free}
                    onChange={(e) => setData("is_free", e.target.checked)}
                    className="h-5 w-5 rounded border-slate-300 text-[#E35336] focus:ring-[#E35336]/25"
                />
                <div>
                    <p className="font-clash text-sm font-semibold text-slate-800">Booking Gratis / Tamu Spesial (Rp 0)</p>
                    <p className="font-bdo text-[11px] text-slate-400 mt-0.5">Lewati pembayaran, status langsung Confirmed & PAID</p>
                </div>
            </label>

            <div>
                <label htmlFor="booking_notes" className={labelBase}>Catatan (opsional)</label>
                <textarea
                    id="booking_notes"
                    value={data.notes}
                    onChange={(e) => setData("notes", e.target.value)}
                    rows={3}
                    placeholder="Informasi tambahan..."
                    className={cn(inputBase, "resize-none")}
                />
            </div>

            <div className="flex flex-col-reverse gap-2.5 border-t border-slate-100 pt-3.5 sm:flex-row sm:items-center">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-[14px] bg-slate-100 px-4 py-2.5 text-[13px] font-clash font-semibold text-slate-600 transition-colors hover:bg-slate-200"
                >
                    Batal
                </button>
                <button
                    type="submit"
                    disabled={processing}
                    className="flex flex-[2] items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] py-2.5 text-[13px] font-clash font-semibold text-white shadow-[0_18px_30px_-24px_rgba(227,83,54,.95)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                    {processing ? "Menyimpan..." : "Buat Booking"}
                </button>
            </div>
        </form>
    );
}

// â”€â”€ Booking Detail Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function BookingDetail({
    booking,
    onClose,
}: {
    booking: AdminBooking;
    onClose: () => void;
}) {
    const handleUpdateStatus = (status: BookingStatus) => {
        router.patch(
            route("admin.bookings.update", booking.id),
            { status },
            { onSuccess: onClose },
        );
    };

    const handleCancel = () => {
        if (!confirm(`Batalkan booking #${booking.id}?`)) return;
        router.delete(route("admin.bookings.destroy", booking.id), {
            onSuccess: onClose,
        });
    };

    const [copied, setCopied] = useState(false);
    const handleCopyInvoice = () => {
        if (!booking.transaction?.checkout_url) return;
        navigator.clipboard.writeText(booking.transaction.checkout_url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const duration = getDurationMinutes(booking.start_time, booking.end_time);

    return (
        <div className="flex flex-col gap-4 animate-fade-in-up">
            {/* ID + Booking Status */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bdo text-xs font-bold uppercase tracking-widest text-slate-400">
                    ID: #{String(booking.id).padStart(5, "0")}
                </span>
                <StatusBadge status={booking.status} />
            </div>

            {/* Customer Card */}
            <section className="rounded-[18px] bg-slate-50/50 border border-slate-100 p-4 hover:border-[#F8B5A8]/60 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                    <div className="bg-[#12131c] p-2 rounded-lg shadow-sm">
                        <Eye className="w-4 h-4 text-[#E35336]" />
                    </div>
                    <p className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Customer
                    </p>
                </div>
                <div className="pl-1">
                    <p className="font-clash text-lg font-medium text-slate-900">{booking.customer_name}</p>
                    {booking.customer_phone && (
                        <p className="mt-0.5 font-bdo text-sm text-slate-500">{booking.customer_phone}</p>
                    )}
                    <span
                        className={cn(
                            "mt-3 inline-flex rounded-md px-2.5 py-1 text-[10px] font-bdo font-bold tracking-widest uppercase",
                            booking.user_category === "warga_ub"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : "bg-slate-100 text-slate-600 border border-slate-200",
                        )}
                    >
                        {booking.user_category === "warga_ub" ? "Warga UB" : "Umum"}
                    </span>
                </div>
            </section>

            {/* Booking Details Card */}
            <section className="rounded-[18px] bg-slate-50/50 border border-slate-100 p-4 hover:border-[#F8B5A8]/60 transition-colors">
                <div className="flex items-center gap-3 mb-4">
                    <div className="bg-[#FFF4F1] p-2 rounded-lg shadow-sm">
                        <LayoutGrid className="w-4 h-4 text-[#E35336]" />
                    </div>
                    <p className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Detail Reservasi
                    </p>
                </div>
                <dl className="flex flex-col gap-3 font-bdo text-sm pl-1">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <dt className="text-slate-500">Fasilitas</dt>
                        <dd className="font-semibold text-slate-900">{booking.facility_name}</dd>
                    </div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <dt className="text-slate-500">Tanggal</dt>
                        <dd className="font-medium text-slate-900">
                            {formatDateDisplay(booking.booking_date)}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <dt className="text-slate-500">Waktu</dt>
                        <dd className="font-medium text-slate-900">
                            {booking.start_time} - {booking.end_time}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt className="text-slate-500">Durasi</dt>
                        <dd className="font-medium text-slate-900">{formatDuration(duration)}</dd>
                    </div>
                    {booking.notes && (
                        <div className="flex items-start justify-between gap-4 pt-2 mt-1 border-t border-slate-200/50">
                            <dt className="shrink-0 text-slate-500">Catatan</dt>
                            <dd className="text-right text-slate-700 italic">"{booking.notes}"</dd>
                        </div>
                    )}
                </dl>
            </section>

            {/* Payment Card */}
            <section className="rounded-[18px] bg-slate-50/50 border border-slate-100 p-4 hover:border-[#F8B5A8]/60 transition-colors">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-lg shadow-sm">
                            <List className="w-4 h-4 text-emerald-600" />
                        </div>
                        <p className="font-bdo text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Pembayaran
                        </p>
                    </div>
                    <PaymentBadge tx={booking.transaction} />
                </div>
                <dl className="flex flex-col gap-2 font-bdo text-sm pl-1">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <dt className="text-slate-500">Subtotal</dt>
                        <dd className="font-clash text-lg font-semibold text-slate-900">
                            {formatPrice(booking.subtotal_price)}
                        </dd>
                    </div>
                    {booking.transaction?.paid_at && (
                        <div className="flex items-center justify-between pt-1">
                            <dt className="text-slate-500">Waktu Bayar</dt>
                            <dd className="text-slate-700 font-medium">{booking.transaction.paid_at}</dd>
                        </div>
                    )}
                </dl>
                {booking.transaction?.checkout_url && (
                    <button
                        type="button"
                        onClick={handleCopyInvoice}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 font-bdo text-xs font-bold text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                        </svg>
                        {copied ? "Tersalin!" : "Salin Link Invoice"}
                    </button>
                )}
            </section>

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-100 mt-2">
                {booking.transaction?.payment_status === "UNPAID" && (
                    <button
                        type="button"
                        onClick={() =>
                            router.post(
                                route("admin.transactions.simulate-pay", booking.transaction!.id),
                                {},
                                { onSuccess: onClose },
                            )
                        }
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-clash font-medium text-white transition-all shadow-[inset_0_-8px_15px_-5px_rgba(16,185,129,0.4)] hover:bg-emerald-600 hover:scale-[0.98]"
                    >
                        Simulasi Bayar
                    </button>
                )}
                {booking.status === "pending" && (
                    <button
                        type="button"
                        onClick={() => handleUpdateStatus("confirmed")}
                        className="flex items-center justify-center rounded-xl bg-[#12131c] py-3.5 text-sm font-clash font-medium text-white transition-all shadow-[inset_0_-8px_15px_-5px_rgba(249,115,22,0.4)] hover:bg-slate-900 hover:scale-[0.98]"
                    >
                        Konfirmasi Booking
                    </button>
                )}
                {booking.status === "confirmed" && (
                    <button
                        type="button"
                        onClick={() => handleUpdateStatus("completed")}
                        className="flex items-center justify-center rounded-xl bg-blue-500 py-3.5 text-sm font-clash font-medium text-white transition-all shadow-[inset_0_-8px_15px_-5px_rgba(59,130,246,0.4)] hover:bg-blue-600 hover:scale-[0.98]"
                    >
                        Tandai Selesai
                    </button>
                )}
                {booking.status !== "cancelled" && booking.status !== "completed" && (
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 py-3.5 text-sm font-clash font-medium text-rose-600 transition-colors hover:bg-rose-100"
                    >
                        Batalkan Booking
                    </button>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl py-3 text-sm font-bdo font-medium text-slate-500 transition-colors hover:bg-slate-100"
                >
                    Tutup Panel
                </button>
            </div>
        </div>
    );
}

// â”€â”€ Grid View (Visual Refined) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function GridView({
    bookings,
    facilities,
    onSelect,
}: {
    bookings: AdminBooking[];
    facilities: FacilityOption[];
    onSelect: (b: AdminBooking) => void;
}) {
    const [dateStr, setDateStr] = useState(todayStr());
    const datePickerRef = useRef<HTMLInputElement>(null);

    const dayBookings = bookings.filter(
        (b) => b.booking_date === dateStr && b.status !== "cancelled",
    );

    return (
        <div className="flex flex-col gap-4 animate-fade-in-up delay-200">
            {/* Date navigation & Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_-34px_rgba(15,23,42,.35)]">
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                    <div className="flex items-center gap-1 rounded-[14px] border border-slate-100 bg-slate-50 p-1">
                        <button
                            type="button"
                            onClick={() => setDateStr((d) => shiftDate(d, -1))}
                            className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-slate-600 shadow-sm ring-1 ring-slate-100 transition-all hover:bg-slate-100 hover:text-[#B93D2A] hover:ring-[#F8B5A8]"
                            aria-label="Hari sebelumnya"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            type="button"
                            className="group flex h-9 min-w-[210px] items-center justify-center gap-2 rounded-[10px] bg-white px-3 text-center shadow-sm ring-1 ring-slate-100 transition-all hover:bg-slate-100 hover:ring-[#F8B5A8] max-sm:min-w-0 max-sm:flex-1"
                            onClick={() => (datePickerRef.current as any)?.showPicker?.()}
                        >
                            <CalendarDays size={15} className="text-[#E35336] transition-transform group-hover:scale-110" />
                            <span className="truncate font-clash text-[13px] font-medium text-slate-900">
                                {formatDateDisplay(dateStr)}
                            </span>
                        </button>
                        <input
                            ref={datePickerRef}
                            type="date"
                            value={dateStr}
                            onChange={(e) => {
                                if (e.target.value) setDateStr(e.target.value);
                            }}
                            className="sr-only"
                            aria-label="Pilih tanggal"
                        />
                        <button
                            type="button"
                            onClick={() => setDateStr((d) => shiftDate(d, 1))}
                            className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-slate-600 shadow-sm ring-1 ring-slate-100 transition-all hover:bg-slate-100 hover:text-[#B93D2A] hover:ring-[#F8B5A8]"
                            aria-label="Hari berikutnya"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setDateStr(todayStr())}
                        className="rounded-[10px] border border-slate-200 bg-white px-3.5 py-2 font-bdo text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:border-[#F8B5A8] hover:bg-[#FFF7F5] hover:text-[#B93D2A]"
                    >
                        Hari ini
                    </button>
                </div>

                {/* Legend */}
                <div className="ml-auto flex w-full items-center gap-1.5 rounded-[14px] border border-slate-100 bg-slate-50 p-1 sm:w-auto">
                    <span className="hidden px-2 font-bdo text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400 md:inline">
                        Tipe
                    </span>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {[
                            { label: "Warga UB", color: "bg-sky-500" },
                            { label: "Umum", color: "bg-emerald-500" },
                            { label: "Admin (berbayar)", color: "bg-[#E35336]" },
                            { label: "Admin (gratis)", color: "bg-slate-400" },
                        ].map((item) => (
                            <span key={item.label} className="inline-flex items-center gap-1.5 rounded-[10px] bg-white px-2.5 py-1.5 font-bdo text-[10px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-100 hover:text-slate-800">
                                <span className={cn("h-2 w-2 rounded-full", item.color)} />
                                {item.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Calendar Grid Container */}
            <div
                className="custom-scrollbar overflow-auto rounded-[20px] border border-slate-200 bg-white shadow-[0_18px_42px_-38px_rgba(15,23,42,.4)]"
                style={{ maxHeight: "calc(100vh - 300px)" }}
            >
                <div
                    className="flex"
                    style={{ minWidth: `${56 + facilities.length * 138}px` }}
                >
                    {/* Time column */}
                    <div className="w-14 shrink-0 border-r border-slate-200 bg-slate-50">
                        <div className="sticky top-0 z-30 h-12 border-b border-slate-200 bg-slate-50 backdrop-blur-md" />
                        {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                            const h = START_HOUR + i;
                            return (
                                <div
                                    key={h}
                                    style={{ height: SLOT_HEIGHT }}
                                    className="relative flex items-start justify-end border-b border-slate-200 pr-2.5 pt-1.5"
                                >
                                    <span className="font-bdo text-[10px] font-bold text-slate-400">
                                        {padTwo(h)}:00
                                    </span>
                                    <div className="absolute bottom-1/2 left-0 right-0 border-b border-dashed border-slate-100" />
                                </div>
                            );
                        })}
                        <div className="relative flex h-8 items-start justify-end bg-slate-50 pr-2.5 pt-1.5">
                            <span className="font-bdo text-[10px] font-bold text-[#B93D2A]">
                                24:00
                            </span>
                        </div>
                    </div>

                    {/* Facility columns */}
                    {facilities.map((facility) => {
                        const facilityBookings = dayBookings.filter(
                            (b) => b.facility_id === facility.id,
                        );
                        return (
                            <div
                                key={facility.id}
                                className="flex flex-1 flex-col"
                                style={{ minWidth: 138 }}
                            >
                                <div className="sticky top-0 z-20 flex h-12 items-center justify-center border-b border-slate-200 bg-white/90 px-2 shadow-[0_4px_10px_-10px_rgba(0,0,0,0.1)] backdrop-blur-md">
                                    <span className="text-center font-clash text-xs font-medium text-slate-800">
                                        {facility.name}
                                    </span>
                                </div>
                                <div className="relative flex-1 border-r border-slate-100 last:border-r-0">
                                    {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                                        <div
                                            key={i}
                                            style={{ height: SLOT_HEIGHT }}
                                            className="relative border-b border-slate-200"
                                        >
                                            <div className="absolute bottom-1/2 left-0 right-0 border-b border-dashed border-slate-100" />
                                        </div>
                                    ))}
                                    <div className="h-8 bg-white" />
                                    {facilityBookings.map((booking) => {
                                        const top      = getPillTopFromTime(booking.start_time);
                                        const duration = getDurationMinutes(booking.start_time, booking.end_time);
                                        const height   = getPillHeight(duration);

                                        return (
                                            <button
                                                key={booking.id}
                                                type="button"
                                                onClick={() => onSelect(booking)}
                                                style={{
                                                    position: "absolute",
                                                    top: top + 2,
                                                    height: height - 4,
                                                    left: 4,
                                                    right: 4,
                                                    zIndex: 10,
                                                }}
                                                className={cn(
                                                    "group flex flex-col items-start overflow-hidden rounded-[10px] border border-l-4 px-2 py-1.5 text-left shadow-[0_12px_26px_-24px_rgba(15,23,42,.45)] transition-all hover:z-20 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-24px_rgba(15,23,42,.35)]",
                                                    getPillStyle(booking),
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white shadow-sm",
                                                        STATUS_DOT[booking.status],
                                                    )}
                                                />
                                                <p className="w-full truncate pr-3 font-clash text-xs font-medium leading-tight">
                                                    {booking.customer_name}
                                                </p>
                                                {height >= 72 && (
                                                    <p className="mt-1 font-bdo truncate text-[10px] font-semibold opacity-70">
                                                        {booking.start_time}-{booking.end_time}
                                                    </p>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// â”€â”€ List View (Visual Refined) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const listHelper = createColumnHelper<AdminBooking>();

function ListView({
    bookings,
    onSelect,
}: {
    bookings: AdminBooking[];
    onSelect: (b: AdminBooking) => void;
}) {
    const columns = [
        listHelper.accessor("id", {
            header: "Booking ID",
            cell: (info) => (
                <span className="font-bdo text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                    #{String(info.getValue()).padStart(5, "0")}
                </span>
            ),
        }),
        listHelper.accessor("customer_name", {
            header: "Customer",
            enableSorting: true,
            cell: (info) => {
                const b = info.row.original;
                return (
                    <div className="flex flex-col">
                        <p className="font-clash text-sm font-medium text-slate-900">{b.customer_name}</p>
                        <p className="font-bdo text-[11px] font-medium text-slate-400">
                            {b.customer_phone ?? "-"}
                        </p>
                    </div>
                );
            },
        }),
        listHelper.accessor("facility_name", {
            header: "Fasilitas",
            enableSorting: true,
            cell: (info) => (
                <span className="inline-flex flex-col rounded-xl bg-[#FFF4F1] border border-[#F8B5A8] px-3 py-2 font-bdo text-[11px] font-bold text-[#B93D2A]">
                    {info.getValue()}
                    {info.row.original.facility_unit_name && (
                        <span className="mt-0.5 text-[10px] text-[#8E2D20]/70">
                            {info.row.original.facility_unit_name}
                        </span>
                    )}
                </span>
            ),
        }),
        listHelper.display({
            id: "datetime",
            header: "Tanggal & Waktu",
            cell: ({ row }) => {
                const b = row.original;
                const duration = getDurationMinutes(b.start_time, b.end_time);
                return (
                    <div className="flex flex-col">
                        <p className="font-bdo text-[13px] font-bold text-slate-700">{b.booking_date}</p>
                        <p className="font-bdo text-[11px] font-medium text-slate-500">
                            {b.start_time}-{b.end_time} · {formatDuration(duration)}
                        </p>
                    </div>
                );
            },
        }),
        listHelper.accessor("subtotal_price", {
            header: "Total",
            enableSorting: true,
            cell: (info) => (
                <span className="font-clash text-[15px] font-medium text-slate-900">
                    {formatPrice(info.getValue())}
                </span>
            ),
        }),
        listHelper.accessor("status", {
            header: "Booking",
            cell: (info) => <StatusBadge status={info.getValue()} />,
        }),
        listHelper.display({
            id: "payment",
            header: "Bayar",
            cell: ({ row }) => <PaymentBadge tx={row.original.transaction} />,
        }),
        listHelper.display({
            id: "actions",
            header: "",
            cell: ({ row }) => (
                <button
                    type="button"
                    onClick={() => onSelect(row.original)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 border border-slate-200 transition-all hover:bg-[#E35336] hover:border-[#E35336] hover:text-white hover:shadow-md"
                    title="Lihat detail"
                >
                    <Eye size={16} />
                </button>
            ),
        }),
    ];

    return (
        <div className="animate-fade-in-up delay-200 bg-white rounded-[24px] p-2 shadow-[0_18px_42px_-38px_rgba(15,23,42,.4)] border border-slate-200 overflow-hidden">
            <DataTable
                columns={columns as ColumnDef<AdminBooking, unknown>[]}
                data={bookings}
                searchColumn="customer_name"
                searchPlaceholder="Cari nama pelanggan..."
                emptyMessage="Belum ada booking."
            />
        </div>
    );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ViewMode = "grid" | "list";

export default function BookingsIndex() {
    const { bookings, facilities } = usePage<Props>().props;

    const [viewMode, setViewMode]     = useState<ViewMode>("grid");
    const [selected, setSelected]     = useState<AdminBooking | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const todayBookings = useMemo(
        () => bookings.filter((b) => b.booking_date === todayStr()),
        [bookings],
    );

    const pendingCount   = todayBookings.filter((b) => b.status === "pending").length;
    const confirmedCount = todayBookings.filter((b) => b.status === "confirmed").length;
    const cancelledCount = todayBookings.filter((b) => b.status === "cancelled").length;
    const completedCount = todayBookings.filter((b) => b.status === "completed").length;

    useEffect(() => {
        const interval = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                router.reload({ only: ["bookings"] });
            }
        }, 45000);

        return () => window.clearInterval(interval);
    }, []);

    return (
        <AdminLayout
            header={
                <div className="flex flex-col gap-0.5 pt-3 animate-fade-in-up">
                    {/* Menginjeksi animasi dan font agar selaras dengan Dashboard */}
                    <style dangerouslySetInnerHTML={{__html: `
                        .font-clash { font-family: 'Clash Display', sans-serif; }
                        .font-bdo { font-family: 'BDO Grotesk', sans-serif; }
                        
                        @keyframes fadeInUp {
                            from { opacity: 0; transform: translate3d(0, 30px, 0); }
                            to { opacity: 1; transform: translate3d(0, 0, 0); }
                        }
                        @keyframes bookingTitleShine {
                            0%   { background-position: -200% center; }
                            100% { background-position:  200% center; }
                        }
                        .booking-title-shine {
                            background: linear-gradient(120deg, #0f172a 35%, #cbd5e1 50%, #0f172a 65%);
                            background-size: 200% auto;
                            color: transparent;
                            -webkit-background-clip: text;
                            background-clip: text;
                            animation: bookingTitleShine 3s linear infinite;
                        }
                        .animate-fade-in-up { 
                            animation: fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; 
                            opacity: 0;
                            will-change: opacity, transform;
                        }
                        .delay-100 { animation-delay: 100ms; }
                        .delay-200 { animation-delay: 200ms; }
                        
                        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                        .custom-scrollbar {
                            scrollbar-width: thin;
                            scrollbar-color: rgba(227,83,54,.32) transparent;
                        }
                        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(227,83,54,.32); border-radius: 999px; }
                    `}} />

                    <span className="font-bdo text-[10px] font-medium tracking-wide text-[#E35336]">
                        Manajemen Reservasi
                    </span>
                    <h1 className="font-clash text-2xl font-bold uppercase tracking-tight xl:text-3xl">
                        <span className="booking-title-shine">Pemesanan</span>
                    </h1>
                </div>
            }
        >
            <Head title="Bookings" />

            <div className="flex flex-col gap-4 overflow-x-hidden pb-16 pt-3">
                {/* â”€â”€ Toolbar Row â”€â”€ */}
                <div className="flex flex-col justify-between gap-3 rounded-[20px] border border-slate-200 bg-white p-2.5 shadow-[0_18px_40px_-36px_rgba(15,23,42,.45)] animate-fade-in-up delay-100 md:flex-row md:items-center">
                    
                    {/* Stats Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-[10px] border border-[#F8B5A8] bg-[#FFF4F1] px-3 py-1 shadow-sm">
                            <Clock3 size={13} className="text-[#E35336]" />
                            <span className="h-2 w-2 rounded-full bg-[#E35336] animate-pulse"></span>
                            <span className="font-bdo text-[10px] font-bold uppercase tracking-wider text-[#B93D2A]">{pendingCount} Pending hari ini</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-[10px] border border-emerald-100 bg-emerald-50 px-3 py-1 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="font-bdo text-[10px] font-bold uppercase tracking-wider text-emerald-600">{confirmedCount} Konfirmasi hari ini</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-[10px] border border-blue-100 bg-blue-50 px-3 py-1 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                            <span className="font-bdo text-[10px] font-bold uppercase tracking-wider text-blue-600">{completedCount} Selesai</span>
                        </div>
                        {cancelledCount > 0 && (
                            <div className="flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-slate-100 px-3 py-1 shadow-sm">
                                <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                                <span className="font-bdo text-[10px] font-bold uppercase tracking-wider text-slate-600">{cancelledCount} Dibatalkan</span>
                            </div>
                        )}
                        <span className="ml-1 rounded-[10px] border border-slate-200 bg-white px-2.5 py-1 font-bdo text-[10px] font-bold text-slate-400">
                            HARI INI: {todayBookings.length}
                        </span>
                    </div>

                    <div className="flex w-full items-center justify-between gap-2.5 md:w-auto md:justify-end">
                        {/* View toggle */}
                        <div className="flex items-center rounded-[14px] border border-slate-200 bg-white p-1 shadow-sm">
                            <button
                                type="button"
                                onClick={() => setViewMode("grid")}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-clash font-medium transition-all",
                                    viewMode === "grid"
                                        ? "bg-[#FFF4F1] text-[#B93D2A] shadow-inner"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
                                )}
                            >
                                <LayoutGrid size={15} className={viewMode === "grid" ? "text-[#E35336]" : ""} />
                                Grid
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode("list")}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-clash font-medium transition-all",
                                    viewMode === "list"
                                        ? "bg-[#FFF4F1] text-[#B93D2A] shadow-inner"
                                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
                                )}
                            >
                                <List size={15} className={viewMode === "list" ? "text-[#E35336]" : ""} />
                                List
                            </button>
                        </div>

                        {/* Add booking */}
                        <button
                            type="button"
                            onClick={() => setShowCreate(true)}
                            className="flex items-center gap-2 rounded-[10px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-4 py-2.5 text-[13px] font-clash font-semibold text-white shadow-[0_18px_30px_-24px_rgba(227,83,54,.95)] transition-all hover:-translate-y-0.5 active:scale-100"
                        >
                            <Plus size={16} className="text-white" />
                            Tambah Booking
                        </button>
                    </div>
                </div>

                {/* View content */}
                {viewMode === "grid" ? (
                    <GridView
                        bookings={bookings}
                        facilities={facilities}
                        onSelect={setSelected}
                    />
                ) : (
                    <ListView bookings={bookings} onSelect={setSelected} />
                )}
            </div>

            {/* Detail SlideOver */}
            <SlideOver
                isOpen={selected !== null}
                onClose={() => setSelected(null)}
                title={<span className="font-clash text-xl">Detail Booking</span>}
                description={
                    selected && (
                        <span className="font-bdo text-sm text-[#B93D2A] font-medium">
                            {selected.facility_name} · {selected.start_time}-{selected.end_time}
                        </span>
                    )
                }
            >
                {selected && (
                    <BookingDetail
                        key={selected.id}
                        booking={selected}
                        onClose={() => setSelected(null)}
                    />
                )}
            </SlideOver>

            {/* Create SlideOver */}
            <SlideOver
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                title={<span className="font-clash text-xl font-bold">Tambah Booking</span>}
                description={<span className="font-bdo text-sm text-slate-500">Buat reservasi baru secara manual ke sistem.</span>}
            >
                {showCreate && (
                    <CreateBookingForm
                        facilities={facilities}
                        onClose={() => setShowCreate(false)}
                    />
                )}
            </SlideOver>
        </AdminLayout>
    );
}   
