import { Head, router, useForm, usePage } from "@inertiajs/react";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import axios from "axios";
import {
    AlertCircle,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Eye,
    Globe2,
    LayoutGrid,
    Layers3,
    List,
    LoaderCircle,
    LockKeyhole,
    Mail,
    Phone,
    Plus,
    TriangleAlert,
    UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import DataTable from "@/Components/Admin/DataTable";
import type { CursorPaginationState } from "@/Components/Admin/CursorPagination";
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
    category_id: number;
    category_name: string;
    category_slug: string;
    reservation_method: "auto" | "website" | "whatsapp" | "external" | "unknown";
    booking_capacity: number;
    has_shared_booking_capacity: boolean;
    units?: Array<{
        id: number;
        name: string;
        capacity_override: number | null;
        booking_capacity: number;
        has_shared_booking_capacity: boolean;
    }>;
}

interface BookingCategoryOption {
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    total_facilities: number;
    active_facilities: number;
    website_facilities: number;
}

type BookingCoverage = "website" | "all";

type Props = PageProps<{
    bookings: AdminBooking[];
    booking_list: AdminBooking[];
    booking_calendar: {
        date: string;
        is_capped: boolean;
        limit: number;
    };
    booking_pagination: {
        per_page: number;
        count: number;
        has_next: boolean;
        has_previous: boolean;
        next_cursor: string | null;
        previous_cursor: string | null;
    };
    booking_filters: {
        date: string;
        date_from: string | null;
        date_to: string | null;
        search: string | null;
        status: BookingStatus | null;
        category: string | null;
        coverage: BookingCoverage;
        per_page: number;
    };
    booking_stats: {
        pending: number;
        confirmed: number;
        completed: number;
        cancelled: number;
        total: number;
        date: string;
    };
    booking_categories: BookingCategoryOption[];
    can_manage_bookings: boolean;
    can_manage_booking_payments: boolean;
    facilities: FacilityOption[];
    manual_facilities: FacilityOption[];
}>;

// â”€â”€ Calendar constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SLOT_HEIGHT  = 58; // px per HOUR
const START_HOUR   = 6;
const END_HOUR     = 24;

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

function getPillTopFromTime(startTime: string, calendarStartHour: number): number {
    const { h, m } = parseTimeHM(startTime);
    return ((h - calendarStartHour) + m / 60) * SLOT_HEIGHT;
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

interface CalendarResource {
    key: string;
    facilityId: number;
    unitId: number | null;
    facilityName: string;
    unitName: string | null;
    bookingCapacity: number;
    hasSharedCapacity: boolean;
}

interface CalendarBookingBlock {
    key: string;
    bookings: AdminBooking[];
    startTime: string;
    endTime: string;
    shared: boolean;
}

interface PositionedBookingBlock {
    block: CalendarBookingBlock;
    lane: number;
    laneCount: number;
}

function calendarResourceKey(facilityId: number, unitId: number | null): string {
    return `${facilityId}:${unitId ?? "parent"}`;
}

function timeInMinutes(value: string): number {
    const { h, m } = parseTimeHM(value);
    return h * 60 + m;
}

function buildCalendarBookingBlocks(
    bookings: AdminBooking[],
    shared: boolean,
): CalendarBookingBlock[] {
    if (!shared) {
        return bookings.map((booking) => ({
            key: String(booking.id),
            bookings: [booking],
            startTime: booking.start_time,
            endTime: booking.end_time,
            shared: false,
        }));
    }

    const groups = new Map<string, AdminBooking[]>();
    bookings.forEach((booking) => {
        const key = `${booking.start_time}|${booking.end_time}`;
        groups.set(key, [...(groups.get(key) ?? []), booking]);
    });

    return Array.from(groups.entries()).map(([key, groupedBookings]) => ({
        key: `quota:${key}`,
        bookings: groupedBookings.sort((left, right) => left.id - right.id),
        startTime: groupedBookings[0].start_time,
        endTime: groupedBookings[0].end_time,
        shared: true,
    }));
}

function positionOverlappingBookingBlocks(
    blocks: CalendarBookingBlock[],
): PositionedBookingBlock[] {
    const sorted = [...blocks].sort((left, right) =>
        timeInMinutes(left.startTime) - timeInMinutes(right.startTime)
        || timeInMinutes(left.endTime) - timeInMinutes(right.endTime)
        || left.key.localeCompare(right.key),
    );
    const positioned: PositionedBookingBlock[] = [];
    let cluster: CalendarBookingBlock[] = [];
    let clusterEnd = -1;

    const flushCluster = () => {
        if (cluster.length === 0) return;

        const laneEnds: number[] = [];
        const staged = cluster.map((block) => {
            const start = timeInMinutes(block.startTime);
            const end = timeInMinutes(block.endTime);
            let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);

            if (lane === -1) {
                lane = laneEnds.length;
            }

            laneEnds[lane] = end;

            return { block, lane };
        });
        const laneCount = Math.max(1, laneEnds.length);

        staged.forEach(({ block, lane }) => {
            positioned.push({ block, lane, laneCount });
        });
        cluster = [];
        clusterEnd = -1;
    };

    sorted.forEach((block) => {
        const start = timeInMinutes(block.startTime);
        const end = timeInMinutes(block.endTime);

        if (cluster.length > 0 && start >= clusterEnd) {
            flushCluster();
        }

        cluster.push(block);
        clusterEnd = Math.max(clusterEnd, end);
    });
    flushCluster();

    return positioned;
}

function buildCalendarResources(
    facilities: FacilityOption[],
    bookings: AdminBooking[],
): CalendarResource[] {
    return facilities.flatMap((facility) => {
        const facilityBookings = bookings.filter(
            (booking) => booking.facility_id === facility.id,
        );
        const units = new Map<number, {
            name: string;
            bookingCapacity: number;
            hasSharedCapacity: boolean;
        }>();

        (facility.units ?? []).forEach((unit) => units.set(unit.id, {
            name: unit.name,
            bookingCapacity: unit.booking_capacity,
            hasSharedCapacity: unit.has_shared_booking_capacity,
        }));
        facilityBookings.forEach((booking) => {
            if (booking.facility_unit_id !== null) {
                const existing = units.get(booking.facility_unit_id);
                units.set(booking.facility_unit_id, {
                    name: booking.facility_unit_name ?? existing?.name ?? `Unit #${booking.facility_unit_id}`,
                    bookingCapacity: existing?.bookingCapacity ?? booking.inventory.capacity,
                    hasSharedCapacity: existing?.hasSharedCapacity ?? booking.inventory.mode === "shared",
                });
            }
        });

        if (units.size === 0) {
            return [{
                key: calendarResourceKey(facility.id, null),
                facilityId: facility.id,
                unitId: null,
                facilityName: facility.name,
                unitName: null,
                bookingCapacity: facility.booking_capacity,
                hasSharedCapacity: facility.has_shared_booking_capacity,
            }];
        }

        const resources: CalendarResource[] = [];
        if (facilityBookings.some((booking) => booking.facility_unit_id === null)) {
            resources.push({
                key: calendarResourceKey(facility.id, null),
                facilityId: facility.id,
                unitId: null,
                facilityName: facility.name,
                unitName: "Seluruh unit",
                bookingCapacity: facility.booking_capacity,
                hasSharedCapacity: facility.has_shared_booking_capacity,
            });
        }

        units.forEach((unit, unitId) => {
            resources.push({
                key: calendarResourceKey(facility.id, unitId),
                facilityId: facility.id,
                unitId,
                facilityName: facility.name,
                unitName: unit.name,
                bookingCapacity: unit.bookingCapacity,
                hasSharedCapacity: unit.hasSharedCapacity,
            });
        });

        return resources;
    });
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

const BOOKING_SOURCE_LABEL: Record<AdminBooking["booking_source"], string> = {
    website: "Website",
    legacy_website: "Website lama",
    admin: "Admin manual",
};

const BOOKING_ORDER_STATUS_LABEL: Record<NonNullable<AdminBooking["booking_order_status"]>, string> = {
    draft: "Draf",
    pending_payment: "Menunggu pembayaran",
    paid: "Lunas",
    cancelled: "Dibatalkan",
    expired: "Kedaluwarsa",
};

const RESERVATION_METHOD_LABEL: Record<FacilityOption["reservation_method"], string> = {
    auto: "Website (auto)",
    website: "Website",
    whatsapp: "WhatsApp",
    external: "Link eksternal",
    unknown: "Tidak diketahui",
};

function BookingSourceBadge({ source }: { source: AdminBooking["booking_source"] }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 font-bdo text-[10px] font-semibold",
                source === "website"
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : source === "legacy_website"
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-slate-50 text-slate-600",
            )}
        >
            <span
                className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    source === "website"
                        ? "bg-sky-500"
                        : source === "legacy_website"
                          ? "bg-indigo-500"
                          : "bg-slate-400",
                )}
            />
            {BOOKING_SOURCE_LABEL[source]}
        </span>
    );
}

// Pill color - semantic by booking origin + status
function getPillStyle(b: AdminBooking): string {
    let base: string;
    if (b.booking_source !== "admin") {
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
    if (!tx) {
        return (
            <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 font-bdo text-[10px] font-bold uppercase tracking-widest text-amber-700 ring-1 ring-amber-200">
                Belum tercatat
            </span>
        );
    }
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

function SharedCapacityIndicator({
    booking,
    compact = false,
}: {
    booking: AdminBooking;
    compact?: boolean;
}) {
    const inventory = booking.inventory;

    if (inventory.mode !== "shared") {
        return compact ? (
            <span className="font-bdo text-xs font-semibold text-slate-300" title="Jadwal eksklusif">
                —
            </span>
        ) : null;
    }

    const occupied = inventory.occupied ?? 0;
    const remaining = inventory.remaining ?? inventory.capacity;
    const released = !inventory.holds_inventory;
    const urgent = inventory.over_capacity || (!released && remaining === 0);
    const limited = !released && !urgent && inventory.status === "limited";

    return (
        <div
            className={cn(
                "min-w-[136px] rounded-[12px] border px-2.5 py-2",
                released
                    ? "border-slate-200 bg-slate-50 text-slate-500"
                    : urgent
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : limited
                        ? "border-[#F8B5A8] bg-[#FFF4F1] text-[#B93D2A]"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700",
                compact && "py-1.5",
            )}
            title={
                released
                    ? "Booking ini tidak lagi menahan kuota jadwal."
                    : `${occupied} dari ${inventory.capacity} tempat telah terisi; tersisa ${remaining}.`
            }
        >
            <div className="flex items-center justify-between gap-2 font-bdo text-[11px] font-bold">
                <span>
                    {released
                        ? "Kuota dilepas"
                        : `${occupied}/${inventory.capacity} terisi`}
                </span>
                {!released && <span>Sisa {remaining}</span>}
            </div>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-black/10" aria-hidden="true">
                <span
                    className={cn(
                        "block h-full rounded-full transition-[width] duration-500",
                        urgent
                            ? "bg-rose-500"
                            : limited
                              ? "bg-[#E35336]"
                              : released
                                ? "bg-slate-300"
                                : "bg-emerald-500",
                    )}
                    style={{ width: `${released ? 0 : (inventory.utilization_percent ?? 0)}%` }}
                />
            </span>
        </div>
    );
}

function SharedCapacityPanel({ booking }: { booking: AdminBooking }) {
    const inventory = booking.inventory;

    if (inventory.mode !== "shared") return null;

    const occupied = inventory.occupied ?? 0;
    const remaining = inventory.remaining ?? inventory.capacity;
    const released = !inventory.holds_inventory;

    return (
        <section
            className={cn(
                "overflow-hidden rounded-[18px] border p-4",
                inventory.over_capacity
                    ? "border-rose-200 bg-rose-50"
                    : "border-[#F8B5A8] bg-[linear-gradient(135deg,#FFF8F5_0%,#FFFFFF_72%)]",
            )}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F08C78] via-[#E35336] to-[#B93D2A] text-white shadow-[0_14px_28px_-18px_rgba(227,83,54,0.95)]">
                        {inventory.over_capacity ? <TriangleAlert size={17} /> : <UsersRound size={17} />}
                        <span className="pointer-events-none absolute left-[7px] right-[7px] top-[5px] h-[4px] rounded-full bg-white/35 blur-[1px]" />
                    </span>
                    <span className="min-w-0">
                        <span className="block font-bdo text-[10px] font-bold uppercase tracking-[0.12em] text-[#B93D2A]">
                            Kuota jadwal bersama
                        </span>
                        <strong className="mt-0.5 block font-clash text-base font-semibold text-slate-950">
                            {released
                                ? "Booking ini tidak lagi menahan kuota"
                                : `${remaining} tempat masih tersedia`}
                        </strong>
                    </span>
                </div>
                <span className="shrink-0 text-right">
                    <strong className="block font-clash text-2xl font-semibold leading-none text-slate-950">
                        {occupied}<small className="font-bdo text-sm text-slate-400">/{inventory.capacity}</small>
                    </strong>
                    <small className="mt-1 block font-bdo text-[10px] font-semibold text-slate-500">peserta terisi</small>
                </span>
            </div>

            <span className="mt-4 block h-2 overflow-hidden rounded-full bg-black/10" aria-label={`${inventory.utilization_percent ?? 0}% kuota terisi`}>
                <span
                    className={cn(
                        "block h-full rounded-full",
                        inventory.over_capacity ? "bg-rose-500" : "bg-[#E35336]",
                    )}
                    style={{ width: `${released ? 0 : (inventory.utilization_percent ?? 0)}%` }}
                />
            </span>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-bdo text-[11px] font-semibold text-slate-600">
                <span>{inventory.concurrent_bookings ?? 0} reservasi aktif pada waktu yang sama</span>
                <span>{released ? "Kuota telah dilepas" : `Sisa ${remaining} tempat`}</span>
            </div>
            {inventory.over_capacity && (
                <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-white/75 px-3 py-2.5 font-bdo text-xs font-semibold leading-relaxed text-rose-700">
                    <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                    Keterisian melebihi kapasitas saat ini. Periksa perubahan kapasitas atau data reservasi sebelum menerima peserta baru.
                </p>
            )}
        </section>
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
        customer_phone: "",
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
    const selectedFacilityUnit = facilityUnits.find(
        (unit) => String(unit.id) === String(data.facility_unit_id),
    );
    const selectedBookingCapacity = selectedFacilityUnit?.booking_capacity
        ?? selectedFacility?.booking_capacity
        ?? 1;
    const selectedHasSharedCapacity = selectedFacilityUnit?.has_shared_booking_capacity
        ?? selectedFacility?.has_shared_booking_capacity
        ?? false;
    const facilityGroups = useMemo(() => {
        const groups = new Map<string, FacilityOption[]>();

        facilities.forEach((facility) => {
            const label = facility.category_name || "Tanpa kategori";
            groups.set(label, [...(groups.get(label) ?? []), facility]);
        });

        return Array.from(groups.entries());
    }, [facilities]);

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
                <label htmlFor="booking_customer_phone" className={labelBase}>Nomor WhatsApp (opsional)</label>
                <input
                    id="booking_customer_phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={data.customer_phone}
                    onChange={(e) => setData("customer_phone", e.target.value)}
                    placeholder="Contoh: 0812 3456 7890"
                    className={inputBase}
                />
                {errors.customer_phone && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.customer_phone}</p>}
            </div>

            <div>
                <label htmlFor="booking_facility_id" className={labelBase}>Fasilitas</label>
                <select
                    id="booking_facility_id"
                    value={data.facility_id}
                    onChange={(e) => {
                        const nextFacilityId = e.target.value;
                        const nextFacility = facilities.find(
                            (facility) => String(facility.id) === nextFacilityId,
                        );

                        setData("facility_id", nextFacilityId);
                        setData("facility_unit_id", "");
                        setData(
                            "pax",
                            Math.min(
                                Math.max(1, data.pax),
                                nextFacility?.booking_capacity ?? 1,
                            ),
                        );
                    }}
                    className={inputBase}
                >
                    <option value="">Pilih fasilitas...</option>
                    {facilityGroups.map(([categoryName, categoryFacilities]) => (
                        <optgroup key={categoryName} label={categoryName}>
                            {categoryFacilities.map((facility) => (
                                <option key={facility.id} value={facility.id}>
                                    {facility.name} · {RESERVATION_METHOD_LABEL[facility.reservation_method]}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                {errors.facility_id && <p className="mt-1.5 text-[11px] font-bdo text-rose-500">{errors.facility_id}</p>}
                {selectedFacility && (
                    <p className="mt-1.5 font-bdo text-[11px] leading-relaxed text-slate-400">
                        {selectedFacility.category_name} · Jalur publik {RESERVATION_METHOD_LABEL[selectedFacility.reservation_method]}. Booking ini tetap dicatat sebagai input admin.
                    </p>
                )}
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
                                    onClick={() => {
                                        setData("facility_unit_id", String(unit.id));
                                        setData("pax", Math.min(Math.max(1, data.pax), unit.booking_capacity));
                                    }}
                                    className={cn(
                                        "rounded-[14px] border px-3.5 py-2.5 text-left transition-all",
                                        active
                                            ? "border-[#E35336] bg-[#FFF7F5] text-[#B93D2A] shadow-[0_14px_28px_-24px_rgba(227,83,54,.9)]"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-[#F8B5A8] hover:bg-[#FFF7F5]/60",
                                    )}
                                >
                                    <span className="block truncate font-clash text-sm font-semibold">{unit.name}</span>
                                    <span className="mt-1 block font-bdo text-[11px] font-semibold opacity-65">
                                        {active ? "Unit dipilih" : "Pilih unit ini"} · kuota {unit.booking_capacity}
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
                    max={selectedBookingCapacity}
                    value={data.pax}
                    onChange={(e) => setData("pax", parseInt(e.target.value) || 1)}
                    className={inputBase}
                />
                {selectedFacility && (
                    <p className="mt-1.5 font-bdo text-[11px] font-medium leading-relaxed text-slate-400">
                        {selectedHasSharedCapacity
                            ? `Maksimal ${selectedBookingCapacity} peserta untuk satu jadwal${selectedFacilityUnit ? ` di ${selectedFacilityUnit.name}` : ""}. Sistem memeriksa ulang sisa kuota saat disimpan.`
                            : "Jadwal ini bersifat eksklusif untuk satu reservasi."}
                    </p>
                )}
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
                    maxLength={500}
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
    canManageBookings,
    canManageBookingPayments,
    isRefreshing,
    loadError,
}: {
    booking: AdminBooking;
    onClose: () => void;
    canManageBookings: boolean;
    canManageBookingPayments: boolean;
    isRefreshing: boolean;
    loadError: string | null;
}) {
    const [actionError, setActionError] = useState<string | null>(null);
    const [actionProcessing, setActionProcessing] = useState(false);

    const visitOptions = {
        preserveScroll: true,
        onStart: () => {
            setActionError(null);
            setActionProcessing(true);
        },
        onError: (errors: Record<string, string>) => {
            setActionError(
                Object.values(errors).find((message) => Boolean(message))
                    ?? "Tindakan tidak dapat diproses. Muat ulang data dan coba kembali.",
            );
        },
        onFinish: () => setActionProcessing(false),
        onSuccess: onClose,
    };

    const handleUpdateStatus = (status: BookingStatus) => {
        if (!booking.state_version) {
            setActionError("Versi data booking belum tersedia. Tutup panel lalu buka kembali detailnya.");
            return;
        }

        router.patch(
            route("admin.bookings.update", booking.id),
            { status, state_version: booking.state_version },
            visitOptions,
        );
    };

    const handleCancel = () => {
        if (!confirm(`Batalkan booking #${booking.id}?`)) return;
        if (!booking.state_version) {
            setActionError("Versi data booking belum tersedia. Tutup panel lalu buka kembali detailnya.");
            return;
        }

        router.delete(route("admin.bookings.destroy", booking.id), {
            ...visitOptions,
            data: { state_version: booking.state_version },
        });
    };

    const handleSimulatePayment = () => {
        if (!booking.transaction) return;

        router.post(
            route("admin.transactions.simulate-pay", booking.transaction.id),
            {},
            visitOptions,
        );
    };

    const [copied, setCopied] = useState(false);
    const handleCopyInvoice = async () => {
        if (!booking.transaction?.checkout_url) return;

        try {
            await navigator.clipboard.writeText(booking.transaction.checkout_url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setActionError("Tautan tidak dapat disalin otomatis. Buka halaman melalui koneksi HTTPS lalu coba kembali.");
        }
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

            {isRefreshing && (
                <div className="flex items-center gap-2 rounded-[14px] border border-sky-100 bg-sky-50 px-3.5 py-3 font-bdo text-xs font-semibold text-sky-700" role="status">
                    <LoaderCircle size={15} className="animate-spin" />
                    Menyelaraskan detail terbaru dari server…
                </div>
            )}
            {loadError && (
                <div className="flex items-start gap-2 rounded-[14px] border border-amber-200 bg-amber-50 px-3.5 py-3 font-bdo text-xs font-semibold leading-relaxed text-amber-800" role="alert">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" />
                    {loadError}
                </div>
            )}

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
                    <div className="mt-2 flex flex-col gap-1.5">
                        {booking.customer_phone && (
                            <a
                                href={`tel:${booking.customer_phone}`}
                                className="inline-flex w-fit items-center gap-2 font-bdo text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-[#B93D2A]"
                            >
                                <Phone size={13} />
                                {booking.customer_phone}
                            </a>
                        )}
                        {booking.customer_email && (
                            <a
                                href={`mailto:${booking.customer_email}`}
                                className="inline-flex w-fit items-center gap-2 font-bdo text-sm font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 transition-colors hover:text-[#B93D2A]"
                            >
                                <Mail size={13} />
                                {booking.customer_email}
                            </a>
                        )}
                        {!booking.customer_phone && !booking.customer_email && !isRefreshing && (
                            <p className="font-bdo text-xs font-medium text-slate-400">Kontak belum tercatat.</p>
                        )}
                    </div>
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
                        <dd className="max-w-[65%] text-right font-semibold text-slate-900">{booking.facility_name}</dd>
                    </div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <dt className="text-slate-500">Kategori</dt>
                        <dd className="font-medium text-slate-900">{booking.facility_category_name}</dd>
                    </div>
                    {booking.facility_unit_name && (
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                            <dt className="text-slate-500">Unit</dt>
                            <dd className="font-medium text-slate-900">{booking.facility_unit_name}</dd>
                        </div>
                    )}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <dt className="text-slate-500">Sumber input</dt>
                        <dd><BookingSourceBadge source={booking.booking_source} /></dd>
                    </div>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <dt className="text-slate-500">Jalur fasilitas</dt>
                        <dd className="font-medium text-slate-900">
                            {RESERVATION_METHOD_LABEL[booking.reservation_method]}
                        </dd>
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
                    <div className="flex items-center justify-between border-t border-slate-200/50 pt-2">
                        <dt className="text-slate-500">Peserta</dt>
                        <dd className="font-medium text-slate-900">{booking.pax.toLocaleString("id-ID")} orang</dd>
                    </div>
                    {booking.notes && (
                        <div className="flex items-start justify-between gap-4 pt-2 mt-1 border-t border-slate-200/50">
                            <dt className="shrink-0 text-slate-500">Catatan</dt>
                            <dd className="text-right text-slate-700 italic">"{booking.notes}"</dd>
                        </div>
                    )}
                </dl>
            </section>

            <SharedCapacityPanel booking={booking} />

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
                    {booking.booking_order_id && (
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                            <dt className="text-slate-500">Referensi order</dt>
                            <dd className="font-semibold text-slate-900">
                                UBSC-{String(booking.booking_order_id).padStart(6, "0")}
                            </dd>
                        </div>
                    )}
                    {booking.booking_order_status && (
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                            <dt className="text-slate-500">Status order</dt>
                            <dd className="font-medium text-slate-800">
                                {BOOKING_ORDER_STATUS_LABEL[booking.booking_order_status]}
                            </dd>
                        </div>
                    )}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/50">
                        <dt className="text-slate-500">Nilai item</dt>
                        <dd className="font-clash text-lg font-semibold text-slate-900">
                            {formatPrice(booking.subtotal_price)}
                        </dd>
                    </div>
                    {booking.transaction && booking.transaction.amount !== booking.subtotal_price && (
                        <div className="flex items-center justify-between pt-1">
                            <dt className="text-slate-500">Total transaksi</dt>
                            <dd className="font-clash text-base font-semibold text-slate-900">
                                {formatPrice(booking.transaction.amount)}
                            </dd>
                        </div>
                    )}
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
                        {copied ? "Tersalin!" : "Salin tautan pembayaran"}
                    </button>
                )}
            </section>

            {/* Actions */}
            <div className="flex flex-col gap-3 pt-4 border-t border-slate-100 mt-2">
                {actionError && (
                    <div className="flex items-start gap-2 rounded-[14px] border border-rose-200 bg-rose-50 px-3.5 py-3 font-bdo text-xs font-semibold leading-relaxed text-rose-700" role="alert">
                        <AlertCircle size={15} className="mt-0.5 shrink-0" />
                        {actionError}
                    </div>
                )}
                {canManageBookingPayments && booking.operational_actions.can_simulate_payment && (
                    <button
                        type="button"
                        onClick={handleSimulatePayment}
                        disabled={actionProcessing || isRefreshing || Boolean(loadError)}
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3.5 text-sm font-clash font-medium text-white transition-all shadow-[inset_0_-8px_15px_-5px_rgba(16,185,129,0.4)] hover:bg-emerald-600 hover:scale-[0.98]"
                    >
                        Simulasi Bayar
                    </button>
                )}
                {canManageBookings && booking.operational_actions.can_confirm && (
                    <button
                        type="button"
                        onClick={() => handleUpdateStatus("confirmed")}
                        disabled={actionProcessing || isRefreshing || Boolean(loadError)}
                        className="flex items-center justify-center rounded-xl bg-[#12131c] py-3.5 text-sm font-clash font-medium text-white transition-all shadow-[inset_0_-8px_15px_-5px_rgba(249,115,22,0.4)] hover:bg-slate-900 hover:scale-[0.98]"
                    >
                        Konfirmasi Booking
                    </button>
                )}
                {canManageBookings && booking.operational_actions.can_complete && (
                    <button
                        type="button"
                        onClick={() => handleUpdateStatus("completed")}
                        disabled={actionProcessing || isRefreshing || Boolean(loadError)}
                        className="flex items-center justify-center rounded-xl bg-blue-500 py-3.5 text-sm font-clash font-medium text-white transition-all shadow-[inset_0_-8px_15px_-5px_rgba(59,130,246,0.4)] hover:bg-blue-600 hover:scale-[0.98]"
                    >
                        Tandai Selesai
                    </button>
                )}
                {canManageBookings && booking.operational_actions.can_cancel && (
                    <button
                        type="button"
                        onClick={handleCancel}
                        disabled={actionProcessing || isRefreshing || Boolean(loadError)}
                        className="flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 py-3.5 text-sm font-clash font-medium text-rose-600 transition-colors hover:bg-rose-100"
                    >
                        Batalkan Booking
                    </button>
                )}
                {!canManageBookings && !canManageBookingPayments && (
                    <div className="flex items-start gap-2 rounded-[14px] border border-slate-200 bg-slate-50 px-3.5 py-3 font-bdo text-xs font-semibold leading-relaxed text-slate-600">
                        <LockKeyhole size={15} className="mt-0.5 shrink-0" />
                        Akses Anda hanya untuk melihat data. Perubahan booking memerlukan izin pengelolaan reservasi.
                    </div>
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

function BookingCategorySwitcher({
    categories,
    selectedCategory,
    coverage,
    onCategoryChange,
    onCoverageChange,
}: {
    categories: BookingCategoryOption[];
    selectedCategory: string;
    coverage: BookingCoverage;
    onCategoryChange: (slug: string) => void;
    onCoverageChange: (coverage: BookingCoverage) => void;
}) {
    return (
        <section className="animate-fade-in-up delay-100 overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_18px_40px_-36px_rgba(15,23,42,.45)]">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-3.5 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#F08C78] via-[#E35336] to-[#B93D2A] text-white shadow-[0_14px_28px_-18px_rgba(227,83,54,0.95)] [&_svg]:text-white">
                        <Layers3 size={16} />
                        <span className="pointer-events-none absolute left-[7px] right-[7px] top-[5px] h-[4px] rounded-full bg-white/35 blur-[1px]" />
                    </span>
                    <div className="min-w-0">
                        <p className="font-clash text-sm font-semibold text-slate-950">Kategori reservasi</p>
                        <p className="mt-0.5 font-bdo text-[11px] leading-relaxed text-slate-500">
                            Kalender, statistik, dan riwayat dipisahkan pada sumber data yang sama.
                        </p>
                    </div>
                </div>

                <div className="flex w-full items-center rounded-[12px] border border-slate-200 bg-white p-1 lg:w-auto">
                    {(["website", "all"] as BookingCoverage[]).map((option) => {
                        const active = coverage === option;
                        return (
                            <button
                                key={option}
                                type="button"
                                onClick={() => onCoverageChange(option)}
                                aria-pressed={active}
                                className={cn(
                                    "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] px-3 py-2 font-bdo text-[11px] font-semibold transition-colors lg:flex-none",
                                    active
                                        ? "bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white"
                                        : "text-slate-500 hover:bg-white/70 hover:text-[#B93D2A]",
                                )}
                            >
                                {option === "website" ? <Globe2 size={13} /> : <LayoutGrid size={13} />}
                                {option === "website" ? "Reservasi website" : "Semua jalur"}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="custom-scrollbar flex snap-x gap-2 overflow-x-auto p-2.5" role="tablist" aria-label="Kategori fasilitas booking">
                {categories.map((category, index) => {
                    const active = selectedCategory === category.slug;
                    const visibleCount = coverage === "website"
                        ? category.website_facilities
                        : category.active_facilities;

                    return (
                        <button
                            key={category.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => onCategoryChange(category.slug)}
                            className={cn(
                                "group flex min-w-[230px] snap-start items-center justify-between gap-4 rounded-[14px] border px-4 py-3 text-left transition-all sm:min-w-[270px]",
                                active
                                    ? "border-[#E35336] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] text-white shadow-[0_18px_34px_-28px_rgba(185,61,42,.9)]"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-[#F8B5A8] hover:bg-[#FFF7F5]",
                            )}
                        >
                            <span className="min-w-0">
                                <span className={cn(
                                    "block font-bdo text-[10px] font-semibold",
                                    active ? "text-white/50" : "text-slate-400",
                                )}>
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className="mt-1 block truncate font-clash text-sm font-semibold">
                                    {category.name}
                                </span>
                            </span>
                            <span className={cn(
                                "shrink-0 rounded-[8px] px-2.5 py-1.5 font-bdo text-[10px] font-semibold",
                                active ? "bg-white/10 text-white" : "bg-slate-100 text-slate-500",
                            )}>
                                {visibleCount} fasilitas
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

// â”€â”€ Grid View (Visual Refined) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function QuotaBookingGroup({
    bookings,
    onSelect,
}: {
    bookings: AdminBooking[];
    onSelect: (booking: AdminBooking) => void;
}) {
    const first = bookings[0];

    if (!first) return null;

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-[18px] border border-slate-200 bg-slate-50/70 p-4">
                <span className="font-bdo text-[10px] font-bold uppercase tracking-[0.14em] text-[#B93D2A]">
                    Jadwal bersama
                </span>
                <h3 className="mt-1 font-clash text-xl font-semibold text-slate-950">
                    {first.facility_name}
                </h3>
                <p className="mt-1 font-bdo text-sm font-semibold text-slate-600">
                    {formatDateDisplay(first.booking_date)} · {first.start_time}–{first.end_time}
                </p>
            </section>

            <SharedCapacityPanel booking={first} />

            <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="font-clash text-base font-semibold text-slate-950">Daftar reservasi</h4>
                    <span className="rounded-[8px] bg-slate-100 px-2.5 py-1 font-bdo text-[10px] font-bold text-slate-500">
                        {bookings.length} data
                    </span>
                </div>
                <div className="flex flex-col gap-2">
                    {bookings.map((booking, index) => (
                        <button
                            key={booking.id}
                            type="button"
                            onClick={() => onSelect(booking)}
                            className="group grid grid-cols-[34px_minmax(0,1fr)] items-center gap-3 rounded-[14px] border border-slate-200 bg-white p-3 text-left transition hover:border-[#F8B5A8] hover:bg-[#FFF8F5] sm:grid-cols-[34px_minmax(0,1fr)_auto]"
                        >
                            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-slate-950 font-bdo text-[10px] font-bold text-white">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="min-w-0">
                                <strong className="block truncate font-clash text-sm font-semibold text-slate-950">
                                    {booking.customer_name}
                                </strong>
                                <span className="mt-1 flex flex-wrap items-center gap-2 font-bdo text-[10px] font-semibold text-slate-500">
                                    <span>{booking.pax} peserta</span>
                                    <span aria-hidden="true">·</span>
                                    <span>#{String(booking.id).padStart(5, "0")}</span>
                                    <BookingSourceBadge source={booking.booking_source} />
                                </span>
                            </span>
                            <span className="col-start-2 flex items-center justify-between gap-2 sm:col-start-auto sm:justify-start">
                                <StatusBadge status={booking.status} />
                                <Eye size={15} className="text-slate-400 transition group-hover:text-[#E35336]" />
                            </span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}

function GridView({
    bookings,
    facilities,
    dateStr,
    onDateChange,
    isCapped,
    resultLimit,
    onSelect,
    onSelectGroup,
}: {
    bookings: AdminBooking[];
    facilities: FacilityOption[];
    dateStr: string;
    onDateChange: (date: string) => void;
    isCapped: boolean;
    resultLimit: number;
    onSelect: (b: AdminBooking) => void;
    onSelectGroup: (bookings: AdminBooking[]) => void;
}) {
    const dayBookings = useMemo(
        () => bookings.filter((booking) => booking.status !== "cancelled"),
        [bookings],
    );
    const calendarStartHour = useMemo(
        () => Math.max(
            0,
            Math.min(
                START_HOUR,
                ...dayBookings.map((booking) => parseTimeHM(booking.start_time).h),
            ),
        ),
        [dayBookings],
    );
    const totalHours = END_HOUR - calendarStartHour;
    const calendarResources = useMemo(
        () => buildCalendarResources(facilities, dayBookings),
        [facilities, dayBookings],
    );
    const positionedByResource = useMemo(() => {
        const grouped = new Map<string, AdminBooking[]>();

        dayBookings.forEach((booking) => {
            const key = calendarResourceKey(
                booking.facility_id,
                booking.facility_unit_id,
            );
            grouped.set(key, [...(grouped.get(key) ?? []), booking]);
        });

        return new Map(
            calendarResources.map((resource) => {
                const resourceBookings = grouped.get(resource.key) ?? [];
                const blocks = buildCalendarBookingBlocks(
                    resourceBookings,
                    resource.hasSharedCapacity,
                );

                return [
                    resource.key,
                    positionOverlappingBookingBlocks(blocks),
                ];
            }),
        );
    }, [calendarResources, dayBookings]);
    const resourceWidths = useMemo(
        () => new Map(calendarResources.map((resource) => {
            const maximumLanes = Math.max(
                1,
                ...(positionedByResource.get(resource.key) ?? [])
                    .map((positioned) => positioned.laneCount),
            );

            return [resource.key, Math.max(138, maximumLanes * 88)];
        })),
        [calendarResources, positionedByResource],
    );
    const calendarWidth = 56 + calendarResources.reduce(
        (total, resource) => total + (resourceWidths.get(resource.key) ?? 138),
        0,
    );

    return (
        <div className="flex flex-col gap-4 animate-fade-in-up delay-200">
            {/* Date navigation & Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_-34px_rgba(15,23,42,.35)]">
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
                    <div className="flex items-center gap-1 rounded-[14px] border border-slate-100 bg-slate-50 p-1">
                        <button
                            type="button"
                            onClick={() => onDateChange(shiftDate(dateStr, -1))}
                            className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-slate-600 shadow-sm ring-1 ring-slate-100 transition-all hover:bg-slate-100 hover:text-[#B93D2A] hover:ring-[#F8B5A8]"
                            aria-label="Hari sebelumnya"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <label className="group relative flex h-9 min-w-[210px] cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-white px-3 text-center shadow-sm ring-1 ring-slate-100 transition-all hover:bg-slate-100 hover:ring-[#F8B5A8] focus-within:ring-[#E35336] max-sm:min-w-0 max-sm:flex-1">
                            <CalendarDays size={15} className="text-[#E35336] transition-transform group-hover:scale-110" />
                            <span className="truncate font-clash text-[13px] font-medium text-slate-900">
                                {formatDateDisplay(dateStr)}
                            </span>
                            <input
                                type="date"
                                value={dateStr}
                                onChange={(e) => {
                                    if (e.target.value) onDateChange(e.target.value);
                                }}
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                aria-label="Pilih tanggal"
                            />
                        </label>
                        <button
                            type="button"
                            onClick={() => onDateChange(shiftDate(dateStr, 1))}
                            className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-slate-600 shadow-sm ring-1 ring-slate-100 transition-all hover:bg-slate-100 hover:text-[#B93D2A] hover:ring-[#F8B5A8]"
                            aria-label="Hari berikutnya"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => onDateChange(todayStr())}
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

            {isCapped && (
                <div className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3 font-bdo text-xs font-semibold text-amber-800" role="status">
                    Kalender menampilkan {resultLimit.toLocaleString("id-ID")} reservasi pertama pada tanggal ini. Gunakan daftar dan pencarian untuk menemukan data lainnya.
                </div>
            )}

            {calendarResources.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-300 bg-white px-6 text-center shadow-[0_18px_42px_-38px_rgba(15,23,42,.4)]">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-slate-100 text-slate-500">
                        <CalendarDays size={18} />
                    </span>
                    <p className="mt-4 font-clash text-base font-semibold text-slate-900">Belum ada fasilitas pada cakupan ini</p>
                    <p className="mt-1 max-w-md font-bdo text-xs leading-relaxed text-slate-500">
                        Pilih kategori lain atau ubah cakupan ke Semua jalur untuk melihat fasilitas operasional lainnya.
                    </p>
                </div>
            ) : (
            /* Calendar Grid Container */
            <div
                className="custom-scrollbar overflow-auto rounded-[20px] border border-slate-200 bg-white shadow-[0_18px_42px_-38px_rgba(15,23,42,.4)]"
                style={{ maxHeight: "calc(100vh - 300px)" }}
            >
                <div
                    className="flex"
                    style={{ minWidth: `${calendarWidth}px` }}
                >
                    {/* Time column */}
                    <div className="w-14 shrink-0 border-r border-slate-200 bg-slate-50">
                        <div className="sticky top-0 z-30 h-12 border-b border-slate-200 bg-slate-50 backdrop-blur-md" />
                        {Array.from({ length: totalHours }, (_, i) => {
                            const h = calendarStartHour + i;
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

                    {/* Facility and unit columns */}
                    {calendarResources.map((resource) => {
                        const positionedBookings = positionedByResource.get(resource.key) ?? [];
                        const resourceWidth = resourceWidths.get(resource.key) ?? 138;
                        return (
                            <div
                                key={resource.key}
                                className="flex flex-1 flex-col"
                                style={{ minWidth: resourceWidth }}
                            >
                                <div className="sticky top-0 z-20 flex h-12 flex-col items-center justify-center border-b border-slate-200 bg-white/90 px-2 text-center shadow-[0_4px_10px_-10px_rgba(0,0,0,0.1)] backdrop-blur-md">
                                    <span className="font-clash text-xs font-medium text-slate-800">
                                        {resource.facilityName}
                                    </span>
                                    {resource.unitName && (
                                        <span className="mt-0.5 max-w-full truncate font-bdo text-[10px] font-semibold text-[#B93D2A]">
                                    {resource.unitName}
                                    {resource.hasSharedCapacity && (
                                        <> · {resource.bookingCapacity} kuota</>
                                    )}
                                </span>
                                    )}
                                    {!resource.unitName && resource.hasSharedCapacity && (
                                        <span className="mt-0.5 inline-flex items-center gap-1 font-bdo text-[10px] font-semibold text-[#B93D2A]">
                                            <UsersRound size={10} />
                                            {resource.bookingCapacity} kuota / jadwal
                                        </span>
                                    )}
                                </div>
                                <div className="relative flex-1 border-r border-slate-100 last:border-r-0">
                                    {Array.from({ length: totalHours }, (_, i) => (
                                        <div
                                            key={i}
                                            style={{ height: SLOT_HEIGHT }}
                                            className="relative border-b border-slate-200"
                                        >
                                            <div className="absolute bottom-1/2 left-0 right-0 border-b border-dashed border-slate-100" />
                                        </div>
                                    ))}
                                    <div className="h-8 bg-white" />
                                    {positionedBookings.map(({ block, lane, laneCount }) => {
                                        const booking = block.bookings[0];
                                        const grouped = block.bookings.length > 1;
                                        const shared = block.shared && booking.inventory.mode === "shared";
                                        const top = getPillTopFromTime(
                                            block.startTime,
                                            calendarStartHour,
                                        );
                                        const duration = getDurationMinutes(block.startTime, block.endTime);
                                        const height   = Math.max(22, getPillHeight(duration) - 4);
                                        const laneWidth = 100 / laneCount;
                                        const occupied = booking.inventory.occupied ?? 0;
                                        const remaining = booking.inventory.remaining ?? booking.inventory.capacity;

                                        return (
                                            <button
                                                key={block.key}
                                                type="button"
                                                onClick={() => grouped
                                                    ? onSelectGroup(block.bookings)
                                                    : onSelect(booking)}
                                                style={{
                                                    position: "absolute",
                                                    top: top + 2,
                                                    height,
                                                    left: `calc(${lane * laneWidth}% + 4px)`,
                                                    width: `calc(${laneWidth}% - 8px)`,
                                                    zIndex: 10,
                                                }}
                                                className={cn(
                                                    "group flex flex-col items-start overflow-hidden rounded-[10px] border border-l-4 px-2 py-1.5 text-left shadow-[0_12px_26px_-24px_rgba(15,23,42,.45)] transition-all hover:z-20 hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-24px_rgba(15,23,42,.35)]",
                                                    shared
                                                        ? "border-[#F8B5A8] border-l-[#E35336] bg-[#FFF4F1] text-[#8E2D20] hover:bg-[#FFE9E3]"
                                                        : getPillStyle(booking),
                                                )}
                                            >
                                                {shared ? (
                                                    <>
                                                        <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-[7px] bg-white/80 text-[#B93D2A] ring-1 ring-[#F8B5A8]">
                                                            <UsersRound size={11} />
                                                        </span>
                                                        <p className="w-full truncate pr-6 font-clash text-xs font-semibold leading-tight">
                                                            {occupied}/{booking.inventory.capacity} terisi
                                                        </p>
                                                        <p className="mt-1 w-full truncate font-bdo text-[9px] font-semibold opacity-75">
                                                            {block.bookings.length} reservasi · sisa {remaining}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span
                                                            className={cn(
                                                                "absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-white shadow-sm",
                                                                STATUS_DOT[booking.status],
                                                            )}
                                                        />
                                                        <p className="w-full truncate pr-3 font-clash text-xs font-medium leading-tight">
                                                            {booking.customer_name}
                                                        </p>
                                                        {height >= 68 && (
                                                            <p className="mt-1 font-bdo truncate text-[10px] font-semibold opacity-70">
                                                                {booking.start_time}-{booking.end_time}
                                                            </p>
                                                        )}
                                                    </>
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
            )}
        </div>
    );
}

// â”€â”€ List View (Visual Refined) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const listHelper = createColumnHelper<AdminBooking>();

function ListView({
    bookings,
    pagination,
    searchValue,
    statusValue,
    dateFrom,
    dateTo,
    onSearchChange,
    onStatusChange,
    onDateRangeChange,
    onClearDateRange,
    onSelect,
}: {
    bookings: AdminBooking[];
    pagination: CursorPaginationState;
    searchValue: string;
    statusValue: BookingStatus | "";
    dateFrom: string;
    dateTo: string;
    onSearchChange: (value: string) => void;
    onStatusChange: (value: BookingStatus | "") => void;
    onDateRangeChange: (field: "date_from" | "date_to", value: string) => void;
    onClearDateRange: () => void;
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
            cell: (info) => {
                const booking = info.row.original;
                return (
                    <div className="flex min-w-[150px] flex-col items-start gap-1.5">
                        <span className="font-bdo text-[10px] font-semibold text-slate-400">
                            {booking.facility_category_name}
                        </span>
                        <span className="inline-flex flex-col rounded-[10px] border border-[#F8B5A8] bg-[#FFF4F1] px-3 py-2 font-bdo text-[11px] font-bold text-[#B93D2A]">
                            {info.getValue()}
                            {booking.facility_unit_name && (
                                <span className="mt-0.5 text-[10px] text-[#8E2D20]/70">
                                    {booking.facility_unit_name}
                                </span>
                            )}
                        </span>
                    </div>
                );
            },
        }),
        listHelper.accessor("booking_source", {
            header: "Sumber",
            cell: (info) => <BookingSourceBadge source={info.getValue()} />,
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
        listHelper.display({
            id: "capacity",
            header: "Kuota jadwal",
            cell: ({ row }) => (
                <SharedCapacityIndicator booking={row.original} compact />
            ),
        }),
        listHelper.accessor("subtotal_price", {
            header: "Nilai item",
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
                searchPlaceholder="Cari ID, order, nama, kontak, atau fasilitas..."
                emptyMessage="Belum ada reservasi pada kategori dan cakupan ini."
                searchValue={searchValue}
                onSearchChange={onSearchChange}
                serverPagination={pagination}
                toolbar={
                    <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
                        <label className="flex h-10 items-center gap-2 rounded-[14px] bg-slate-50 px-3 text-slate-500 ring-1 ring-transparent transition focus-within:bg-white focus-within:ring-slate-200">
                            <CalendarDays size={14} className="shrink-0 text-[#E35336]" />
                            <span className="sr-only">Tanggal awal riwayat</span>
                            <input
                                type="date"
                                value={dateFrom}
                                max={dateTo || undefined}
                                onChange={(event) => onDateRangeChange("date_from", event.target.value)}
                                className="w-[116px] border-0 bg-transparent p-0 font-bdo text-[11px] font-semibold text-slate-600 outline-none focus:ring-0"
                                aria-label="Tanggal awal riwayat"
                            />
                        </label>
                        <span className="font-bdo text-[10px] font-semibold text-slate-400">hingga</span>
                        <label className="flex h-10 items-center rounded-[14px] bg-slate-50 px-3 text-slate-500 ring-1 ring-transparent transition focus-within:bg-white focus-within:ring-slate-200">
                            <span className="sr-only">Tanggal akhir riwayat</span>
                            <input
                                type="date"
                                value={dateTo}
                                min={dateFrom || undefined}
                                onChange={(event) => onDateRangeChange("date_to", event.target.value)}
                                className="w-[116px] border-0 bg-transparent p-0 font-bdo text-[11px] font-semibold text-slate-600 outline-none focus:ring-0"
                                aria-label="Tanggal akhir riwayat"
                            />
                        </label>
                        {(dateFrom || dateTo) && (
                            <button
                                type="button"
                                onClick={onClearDateRange}
                                className="h-10 rounded-[12px] px-2.5 font-bdo text-[10px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            >
                                Reset periode
                            </button>
                        )}
                        <select
                            value={statusValue}
                            onChange={(event) =>
                                onStatusChange(event.target.value as BookingStatus | "")
                            }
                            className="h-10 rounded-2xl border-0 bg-gray-50 px-3 pr-8 font-bdo text-xs font-semibold text-gray-600 focus:ring-1 focus:ring-gray-900"
                            aria-label="Filter status booking"
                        >
                            <option value="">Semua status</option>
                            <option value="pending">Pending</option>
                            <option value="confirmed">Konfirmasi</option>
                            <option value="completed">Selesai</option>
                            <option value="cancelled">Dibatalkan</option>
                        </select>
                    </div>
                }
            />
        </div>
    );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ViewMode = "grid" | "list";

export default function BookingsIndex() {
    const {
        bookings,
        booking_list: bookingList,
        booking_calendar: bookingCalendar,
        booking_pagination: bookingPagination,
        booking_filters: bookingFilters,
        booking_stats: bookingStats,
        booking_categories: bookingCategories,
        can_manage_bookings: canManageBookings,
        can_manage_booking_payments: canManageBookingPayments,
        facilities,
        manual_facilities: manualFacilities,
    } = usePage<Props>().props;

    const [viewMode, setViewMode]     = useState<ViewMode>("grid");
    const [selected, setSelected]     = useState<AdminBooking | null>(null);
    const [quotaGroup, setQuotaGroup] = useState<AdminBooking[] | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [dateStr, setDateStr] = useState(bookingFilters.date);
    const [searchValue, setSearchValue] = useState(bookingFilters.search ?? "");
    const [statusValue, setStatusValue] = useState<BookingStatus | "">(
        bookingFilters.status ?? "",
    );
    const [listDateFrom, setListDateFrom] = useState(bookingFilters.date_from ?? "");
    const [listDateTo, setListDateTo] = useState(bookingFilters.date_to ?? "");
    const [categoryValue, setCategoryValue] = useState(
        bookingFilters.category ?? "",
    );
    const [coverageValue, setCoverageValue] = useState<BookingCoverage>(
        bookingFilters.coverage,
    );
    const searchTimer = useRef<number | null>(null);
    const detailRequestId = useRef(0);
    const detailAbortController = useRef<AbortController | null>(null);

    const pendingCount = bookingStats.pending;
    const confirmedCount = bookingStats.confirmed;
    const cancelledCount = bookingStats.cancelled;
    const completedCount = bookingStats.completed;
    const statsPeriodLabel = bookingStats.date === todayStr()
        ? "hari ini"
        : "tanggal dipilih";

    const closeDetail = () => {
        detailRequestId.current += 1;
        detailAbortController.current?.abort();
        detailAbortController.current = null;
        setSelected(null);
        setDetailLoading(false);
        setDetailError(null);
    };

    const handleSelectBooking = async (booking: AdminBooking) => {
        const requestId = detailRequestId.current + 1;
        detailAbortController.current?.abort();
        const abortController = new AbortController();
        detailAbortController.current = abortController;
        detailRequestId.current = requestId;
        setQuotaGroup(null);
        setSelected(booking);
        setDetailLoading(true);
        setDetailError(null);

        try {
            const response = await axios.get<{ data: AdminBooking }>(
                route("admin.bookings.show", booking.id),
                {
                    headers: { Accept: "application/json" },
                    signal: abortController.signal,
                },
            );

            if (detailRequestId.current === requestId) {
                setSelected(response.data.data);
            }
        } catch {
            if (detailRequestId.current === requestId) {
                setDetailError(
                    "Detail terbaru tidak dapat dimuat. Data ringkas tetap ditampilkan, tetapi tindakan dinonaktifkan agar tidak memakai informasi yang kedaluwarsa.",
                );
            }
        } finally {
            if (detailRequestId.current === requestId) {
                setDetailLoading(false);
                detailAbortController.current = null;
            }
        }
    };

    const handleSelectQuotaGroup = (group: AdminBooking[]) => {
        closeDetail();
        setQuotaGroup(group);
    };

    const queryParams = (overrides: Record<string, string | number | null> = {}) => {
        const params: Record<string, string | number> = {
            date: dateStr,
            per_page: bookingPagination.per_page,
        };
        const search = searchValue.trim();
        const status = statusValue;

        if (search) params.search = search;
        if (status) params.status = status;
        if (listDateFrom) params.date_from = listDateFrom;
        if (listDateTo) params.date_to = listDateTo;
        if (categoryValue) params.category = categoryValue;
        params.coverage = coverageValue;

        Object.entries(overrides).forEach(([key, value]) => {
            if (value === null || value === "") {
                delete params[key];
            } else {
                params[key] = value;
            }
        });

        return params;
    };

    const reloadList = (overrides: Record<string, string | number | null> = {}) => {
        router.get(route("admin.bookings.index"), queryParams(overrides), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            only: ["booking_list", "booking_pagination", "booking_filters"],
        });
    };

    const handleDateChange = (nextDate: string) => {
        setDateStr(nextDate);
        router.get(
            route("admin.bookings.index"),
            queryParams({ date: nextDate, cursor: null }),
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                only: ["bookings", "booking_calendar", "booking_stats", "facilities"],
            },
        );
    };

    const handleSearchChange = (value: string) => {
        setSearchValue(value);

        if (searchTimer.current !== null) {
            window.clearTimeout(searchTimer.current);
        }

        searchTimer.current = window.setTimeout(() => {
            reloadList({ search: value.trim() || null, cursor: null });
        }, 300);
    };

    const handleStatusChange = (value: BookingStatus | "") => {
        setStatusValue(value);
        reloadList({ status: value || null, cursor: null });
    };

    const handleDateRangeChange = (
        field: "date_from" | "date_to",
        value: string,
    ) => {
        const overrides: Record<string, string | number | null> = {
            [field]: value || null,
            cursor: null,
        };

        if (field === "date_from") {
            setListDateFrom(value);
            if (value && listDateTo && value > listDateTo) {
                setListDateTo("");
                overrides.date_to = null;
            }
        } else {
            setListDateTo(value);
            if (value && listDateFrom && value < listDateFrom) {
                setListDateFrom("");
                overrides.date_from = null;
            }
        }

        reloadList(overrides);
    };

    const clearDateRange = () => {
        setListDateFrom("");
        setListDateTo("");
        reloadList({ date_from: null, date_to: null, cursor: null });
    };

    const reloadCategoryScope = (
        category: string,
        coverage: BookingCoverage,
    ) => {
        router.get(
            route("admin.bookings.index"),
            queryParams({ category, coverage, cursor: null }),
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                only: [
                    "bookings",
                    "booking_calendar",
                    "booking_list",
                    "booking_pagination",
                    "booking_filters",
                    "booking_stats",
                    "facilities",
                ],
            },
        );
    };

    const handleCategoryChange = (category: string) => {
        if (category === categoryValue) return;

        if (searchTimer.current !== null) {
            window.clearTimeout(searchTimer.current);
            searchTimer.current = null;
        }
        closeDetail();
        setQuotaGroup(null);
        setCategoryValue(category);
        reloadCategoryScope(category, coverageValue);
    };

    const handleCoverageChange = (coverage: BookingCoverage) => {
        if (coverage === coverageValue) return;

        if (searchTimer.current !== null) {
            window.clearTimeout(searchTimer.current);
            searchTimer.current = null;
        }
        closeDetail();
        setQuotaGroup(null);
        setCoverageValue(coverage);
        reloadCategoryScope(categoryValue, coverage);
    };

    useEffect(() => {
        setDateStr(bookingCalendar.date);
    }, [bookingCalendar.date]);

    useEffect(() => {
        setCategoryValue(bookingFilters.category ?? "");
        setCoverageValue(bookingFilters.coverage);
        setSearchValue(bookingFilters.search ?? "");
        setStatusValue(bookingFilters.status ?? "");
        setListDateFrom(bookingFilters.date_from ?? "");
        setListDateTo(bookingFilters.date_to ?? "");
    }, [bookingFilters]);

    useEffect(() => () => {
        if (searchTimer.current !== null) {
            window.clearTimeout(searchTimer.current);
        }
        detailAbortController.current?.abort();
    }, []);

    useEffect(() => {
        const interval = window.setInterval(() => {
            if (document.visibilityState === "visible") {
                router.reload({
                    only: [
                        "bookings",
                        "booking_calendar",
                        "booking_list",
                        "booking_pagination",
                        "booking_stats",
                        "booking_categories",
                        "facilities",
                    ],
                    headers: { "X-UBSC-Background-Poll": "1" },
                });
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
                <BookingCategorySwitcher
                    categories={bookingCategories}
                    selectedCategory={categoryValue}
                    coverage={coverageValue}
                    onCategoryChange={handleCategoryChange}
                    onCoverageChange={handleCoverageChange}
                />

                {/* â”€â”€ Toolbar Row â”€â”€ */}
                <div className="flex flex-col justify-between gap-3 rounded-[20px] border border-slate-200 bg-white p-2.5 shadow-[0_18px_40px_-36px_rgba(15,23,42,.45)] animate-fade-in-up delay-100 md:flex-row md:items-center">
                    
                    {/* Stats Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-[10px] border border-[#F8B5A8] bg-[#FFF4F1] px-3 py-1 shadow-sm">
                            <Clock3 size={13} className="text-[#E35336]" />
                            <span className="h-2 w-2 rounded-full bg-[#E35336] animate-pulse"></span>
                            <span className="font-bdo text-[10px] font-bold uppercase tracking-wider text-[#B93D2A]">{pendingCount} Pending {statsPeriodLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-[10px] border border-emerald-100 bg-emerald-50 px-3 py-1 shadow-sm">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="font-bdo text-[10px] font-bold uppercase tracking-wider text-emerald-600">{confirmedCount} Konfirmasi {statsPeriodLabel}</span>
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
                            {statsPeriodLabel}: {bookingStats.total}
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

                        {canManageBookings ? (
                            <button
                                type="button"
                                onClick={() => setShowCreate(true)}
                                className="flex items-center gap-2 rounded-[10px] bg-[linear-gradient(135deg,#F08C78_0%,#E35336_52%,#B93D2A_100%)] px-4 py-2.5 text-[13px] font-clash font-semibold text-white shadow-[0_18px_30px_-24px_rgba(227,83,54,.95)] transition-all hover:-translate-y-0.5 active:scale-100"
                            >
                                <Plus size={16} className="text-white" />
                                Tambah Booking
                            </button>
                        ) : (
                            <span className="inline-flex items-center gap-2 rounded-[10px] border border-slate-200 bg-slate-50 px-3 py-2 font-bdo text-[11px] font-semibold text-slate-500">
                                <LockKeyhole size={14} />
                                Mode baca
                            </span>
                        )}
                    </div>
                </div>

                {/* View content */}
                {viewMode === "grid" ? (
                    <GridView
                        bookings={bookings}
                        facilities={facilities}
                        dateStr={dateStr}
                        onDateChange={handleDateChange}
                        isCapped={bookingCalendar.is_capped}
                        resultLimit={bookingCalendar.limit}
                        onSelect={handleSelectBooking}
                        onSelectGroup={handleSelectQuotaGroup}
                    />
                ) : (
                    <ListView
                        bookings={bookingList}
                        pagination={{
                            perPage: bookingPagination.per_page,
                            count: bookingPagination.count,
                            hasNext: bookingPagination.has_next,
                            hasPrevious: bookingPagination.has_previous,
                            nextCursor: bookingPagination.next_cursor,
                            previousCursor: bookingPagination.previous_cursor,
                            onNavigate: (cursor) => reloadList({ cursor }),
                            onPerPageChange: (perPage) =>
                                reloadList({ per_page: perPage, cursor: null }),
                        }}
                        searchValue={searchValue}
                        statusValue={statusValue}
                        dateFrom={listDateFrom}
                        dateTo={listDateTo}
                        onSearchChange={handleSearchChange}
                        onStatusChange={handleStatusChange}
                        onDateRangeChange={handleDateRangeChange}
                        onClearDateRange={clearDateRange}
                        onSelect={handleSelectBooking}
                    />
                )}
            </div>

            <SlideOver
                isOpen={quotaGroup !== null}
                onClose={() => setQuotaGroup(null)}
                title={<span className="font-clash text-xl">Kuota Jadwal</span>}
                description={
                    <span className="font-bdo text-sm text-slate-500">
                        Ringkasan keterisian dan seluruh reservasi pada waktu yang sama.
                    </span>
                }
            >
                {quotaGroup && (
                    <QuotaBookingGroup
                        bookings={quotaGroup}
                        onSelect={handleSelectBooking}
                    />
                )}
            </SlideOver>

            {/* Detail SlideOver */}
            <SlideOver
                isOpen={selected !== null}
                onClose={closeDetail}
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
                        onClose={closeDetail}
                        canManageBookings={canManageBookings}
                        canManageBookingPayments={canManageBookingPayments}
                        isRefreshing={detailLoading}
                        loadError={detailError}
                    />
                )}
            </SlideOver>

            {/* Create SlideOver */}
            <SlideOver
                isOpen={showCreate && canManageBookings}
                onClose={() => setShowCreate(false)}
                title={<span className="font-clash text-xl font-bold">Tambah Booking</span>}
                description={<span className="font-bdo text-sm text-slate-500">Buat reservasi baru secara manual ke sistem.</span>}
            >
                {showCreate && canManageBookings && (
                    <CreateBookingForm
                        facilities={manualFacilities}
                        onClose={() => setShowCreate(false)}
                    />
                )}
            </SlideOver>
        </AdminLayout>
    );
}   
