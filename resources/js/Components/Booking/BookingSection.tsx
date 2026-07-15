import axios from "axios";
import { useMemo, useState } from "react";
import { router, usePage } from "@inertiajs/react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import type { PageProps } from "@/types";
import BookingListItem, { type BookingFacility, type PublicSlotCartItem } from "./BookingListItem";

interface FacilityPrice {
    id: number;
    user_category: string;
    label: string;
    price: number;
    notes?: string | null;
}

interface FacilityUnit {
    id: number;
    name: string;
    image: string;
}

interface BackendFacility {
    id: number;
    name: string;
    slug: string;
    image: string;
    category: string;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    rating?: number | null;
    display_metadata?: Record<string, unknown> | null;
    prices?: FacilityPrice[];
    units?: FacilityUnit[];
}

interface BookingSectionProps {
    facilities?: BackendFacility[];
}

interface ApiSlot {
    start_time: string;
    end_time: string;
    label: string;
    price: string;
    status: "available" | "booked";
    remaining: number;
    facility_unit_id?: number | null;
}

const BOOKING_CART_STORAGE_KEY = "ubsc.booking.cart";

const slotKeyFor = (facilityId: number, facilityUnitId?: number | null) =>
    `${facilityId}:${facilityUnitId ?? "parent"}`;

const cartKeyFor = (item: Pick<PublicSlotCartItem, "facility_id" | "facility_unit_id" | "booking_date" | "start_time" | "end_time">) =>
    [
        item.facility_id,
        item.facility_unit_id ?? "parent",
        item.booking_date,
        item.start_time,
        item.end_time,
    ].join("|");

function priceStringToAmount(price: string): number {
    const digits = price.replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
}

function todayStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
];

const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const calendarDayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const monthShortNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
];

function dateToStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseLocalDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function sameDay(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function sameMonth(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function firstDateOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthLabel(date: Date): string {
    return `${monthShortNames[date.getMonth()]} ${date.getFullYear()}`;
}

function getCalendarCells(monthDate: Date): Date[] {
    const first = firstDateOfMonth(monthDate);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - mondayOffset);

    return Array.from({ length: 35 }, (_, i) => {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        return date;
    });
}

function CalendarMonthGrid({
    monthDate,
    selectedDate,
    today,
    onSelect,
}: {
    monthDate: Date;
    selectedDate: Date;
    today: Date;
    onSelect: (date: Date) => void;
}) {
    const cells = useMemo(() => getCalendarCells(monthDate), [monthDate]);

    return (
        <div className="w-[21rem] shrink-0">
            <h3 className="mb-5 text-center font-bdo text-[1.05rem] font-semibold text-[#25292E]">
                {monthLabel(monthDate)}
            </h3>
            <div className="grid grid-cols-7 gap-y-4">
                {calendarDayNames.map((day) => (
                    <div
                        key={day}
                        className="text-center font-bdo text-[0.78rem] font-medium text-[#9DA3A9]"
                    >
                        {day}
                    </div>
                ))}

                {cells.map((date) => {
                    const inMonth = sameMonth(date, monthDate);
                    const disabled = !inMonth || date < today;
                    const selected = sameDay(date, selectedDate);
                    const weekend = date.getDay() === 0 || date.getDay() === 6;
                    const colorClass = disabled
                        ? "text-[#D2D5D8]"
                        : weekend
                          ? "text-[#FF2A23]"
                          : "text-[#2C3034]";

                    return (
                        <button
                            key={dateToStr(date)}
                            type="button"
                            disabled={disabled}
                            onClick={() => onSelect(date)}
                            aria-label={`Pilih ${dateToStr(date)}`}
                            className={`mx-auto flex size-10 items-center justify-center rounded-full font-bdo text-[0.95rem] font-medium transition ${
                                selected
                                    ? "bg-[#B60B31] text-white shadow-[0_8px_18px_rgba(182,11,49,0.22)]"
                                    : `${colorClass} hover:bg-black/5 disabled:cursor-not-allowed disabled:hover:bg-transparent`
                            }`}
                        >
                            {String(date.getDate()).padStart(2, "0")}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function GlobalHorizontalDatePicker({
    value,
    onChange,
}: {
    value: string;
    onChange: (date: string) => void;
}) {
    const [visibleStart, setVisibleStart] = useState<Date>(() => {
        const selected = parseLocalDate(value);
        selected.setHours(0, 0, 0, 0);
        return selected;
    });
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [calendarStartMonth, setCalendarStartMonth] = useState<Date>(() =>
        firstDateOfMonth(parseLocalDate(value)),
    );

    const days = useMemo(() => {
        const base = new Date(visibleStart);
        base.setHours(0, 0, 0, 0);

        return Array.from({ length: 9 }, (_, i) => {
            const date = new Date(base);
            date.setDate(base.getDate() + i);
            return date;
        });
    }, [visibleStart]);

    const selectedDate = useMemo(() => parseLocalDate(value), [value]);
    const currentMonthLabel = `${monthNames[visibleStart.getMonth()]} ${visibleStart.getFullYear()}`;
    const today = useMemo(() => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        return date;
    }, []);
    const canShiftBackward = visibleStart > today;

    const shiftDays = (amount: number) => {
        setVisibleStart((current) => {
            const next = new Date(current);
            next.setDate(current.getDate() + amount);
            return next < today ? today : next;
        });
    };

    const shiftCalendarMonths = (amount: number) => {
        setCalendarStartMonth((current) => {
            const next = new Date(current);
            next.setMonth(current.getMonth() + amount);
            return next < firstDateOfMonth(today) ? firstDateOfMonth(today) : next;
        });
    };

    const handleCalendarDateSelect = (date: Date) => {
        const next = new Date(date);
        next.setHours(0, 0, 0, 0);
        setVisibleStart(next);
        onChange(dateToStr(next));
        setCalendarOpen(false);
    };

    return (
        <div className="mb-14 flex flex-col items-end xl:pr-[clamp(9rem,12vw,15rem)]">
            <div className="flex w-full max-w-[44rem] items-center justify-between gap-4">
                <div className="relative inline-flex">
                    <button
                        type="button"
                        onClick={() => {
                            setCalendarStartMonth(firstDateOfMonth(selectedDate));
                            setCalendarOpen((open) => !open);
                        }}
                        className="inline-flex h-8 items-center gap-2 rounded-xl bg-white px-4 pr-9 font-bdo text-xs font-medium text-black shadow-sm ring-1 ring-black/5 transition hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#0B4A72]"
                        aria-expanded={calendarOpen}
                        aria-label="Pilih tanggal reservasi"
                    >
                        {currentMonthLabel}
                    </button>
                    <svg
                        className="pointer-events-none absolute right-4 top-1/2 h-3 w-3 -translate-y-1/2 text-black"
                        viewBox="0 0 12 8"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M1 1.5L6 6.5L11 1.5"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>

                    {calendarOpen && (
                        <div className="absolute left-0 top-11 z-30 w-[48.5rem] rounded-[1.35rem] bg-white px-7 py-7 shadow-[0_22px_70px_rgba(0,0,0,0.14)] ring-1 ring-black/5">
                            <button
                                type="button"
                                onClick={() => shiftCalendarMonths(-2)}
                                disabled={calendarStartMonth <= firstDateOfMonth(today)}
                                className="absolute left-7 top-7 flex size-7 items-center justify-center rounded-full text-[#25292E] transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30"
                                aria-label="Dua bulan sebelumnya"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 12 20" fill="none">
                                    <path d="M10 2L2 10L10 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                onClick={() => shiftCalendarMonths(2)}
                                className="absolute right-7 top-7 flex size-7 items-center justify-center rounded-full text-[#25292E] transition hover:bg-black/5"
                                aria-label="Dua bulan berikutnya"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 12 20" fill="none">
                                    <path d="M2 2L10 10L2 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>

                            <div className="flex justify-between gap-14">
                                <CalendarMonthGrid
                                    monthDate={calendarStartMonth}
                                    selectedDate={selectedDate}
                                    today={today}
                                    onSelect={handleCalendarDateSelect}
                                />
                                <CalendarMonthGrid
                                    monthDate={new Date(
                                        calendarStartMonth.getFullYear(),
                                        calendarStartMonth.getMonth() + 1,
                                        1,
                                    )}
                                    selectedDate={selectedDate}
                                    today={today}
                                    onSelect={handleCalendarDateSelect}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => shiftDays(-9)}
                        disabled={!canShiftBackward}
                        className="flex size-8 items-center justify-center rounded-full bg-white text-black/45 shadow-sm ring-1 ring-black/5 transition hover:text-black disabled:cursor-not-allowed disabled:opacity-45"
                        aria-label="Tanggal sebelumnya"
                    >
                        <svg className="h-3 w-3" viewBox="0 0 12 20" fill="none">
                            <path d="M10 2L2 10L10 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <button
                        type="button"
                        onClick={() => shiftDays(9)}
                        className="flex size-8 items-center justify-center rounded-full bg-white text-black/45 shadow-sm ring-1 ring-black/5 transition hover:text-black"
                        aria-label="Tanggal berikutnya"
                    >
                        <svg className="h-3 w-3" viewBox="0 0 12 20" fill="none">
                            <path d="M2 2L10 10L2 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="scrollbar-none mt-3 flex w-full max-w-[44rem] items-center gap-3 overflow-x-auto pb-1 pt-1">
                {days.map((date) => {
                    const dateStr = dateToStr(date);
                    const active = value === dateStr;
                    return (
                        <button
                            key={dateStr}
                            type="button"
                            onClick={() => handleCalendarDateSelect(date)}
                            className={`flex h-[78px] w-[64px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl font-bdo transition-all ${
                                active
                                    ? "bg-[#0B4A72] text-white shadow-[0_8px_20px_rgba(11,74,114,0.18)]"
                                    : "bg-[#F7F7F7] text-black hover:bg-white"
                            }`}
                        >
                            <span className={`text-xs font-normal ${active ? "text-white/80" : "text-black/35"}`}>
                                {dayNames[date.getDay()]}
                            </span>
                            <span className="text-sm font-medium">
                                {String(date.getDate()).padStart(2, "0")}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function BookingSection({ facilities = [] }: BookingSectionProps) {
    const { auth } = usePage<PageProps>().props;
    const [openId, setOpenId] = useState<string>("");
    const [globalDate, setGlobalDate] = useState<string>(todayStr());
    const [slotCart, setSlotCart] = useState<PublicSlotCartItem[]>([]);
    const [slots, setSlots] = useState<Record<string, ApiSlot[]>>({});
    const [loadingSlot, setLoadingSlot] = useState<Record<string, boolean>>({});
    const [slotError, setSlotError] = useState<Record<string, string | null>>(
        {},
    );
    const [selectedUnits, setSelectedUnits] = useState<Record<string, number | null>>({});

    const fetchSlots = async (
        facilityId: number,
        date: string,
        facilityUnitId?: number | null,
    ) => {
        const key = slotKeyFor(facilityId, facilityUnitId);
        setLoadingSlot((p) => ({ ...p, [key]: true }));
        setSlotError((p) => ({ ...p, [key]: null }));
        try {
            const res = await axios.get(route("booking.slots"), {
                params: {
                    facility_id: facilityId,
                    date,
                    ...(facilityUnitId ? { facility_unit_id: facilityUnitId } : {}),
                },
            });
            if (res.data.closed) {
                setSlotError((p) => ({
                    ...p,
                    [key]:
                        res.data.reason === "month_closed"
                            ? "Bulan ini belum dibuka untuk reservasi."
                            : "Fasilitas tutup pada tanggal ini.",
                }));
                setSlots((p) => ({ ...p, [key]: [] }));
            } else if (res.data.requires_unit) {
                setSlotError((p) => ({
                    ...p,
                    [key]: "Pilih unit fasilitas untuk melihat jadwal.",
                }));
                setSlots((p) => ({ ...p, [key]: [] }));
            } else {
                setSlots((p) => ({ ...p, [key]: res.data.slots }));
            }
        } catch {
            setSlotError((p) => ({
                ...p,
                [key]: "Gagal memuat jadwal. Coba lagi.",
            }));
        } finally {
            setLoadingSlot((p) => ({ ...p, [key]: false }));
        }
    };

    const handleToggle = (item: BookingFacility) => {
        const isOpening = openId !== item.id;
        setOpenId(isOpening ? item.id : "");
        if (isOpening) {
            const key = String(item.facilityId);
            const nextUnitId =
                item.selectedUnitId ?? item.units[0]?.id ?? null;

            if (nextUnitId && selectedUnits[key] !== nextUnitId) {
                setSelectedUnits((p) => ({ ...p, [key]: nextUnitId }));
            }

            fetchSlots(item.facilityId, globalDate, nextUnitId);
        }
    };

    const handleGlobalDateChange = (newDateStr: string) => {
        setGlobalDate(newDateStr);
        if (openId) {
            const activeItem = bookingsData.find((b) => b.id === openId);
            if (activeItem) {
                fetchSlots(
                    activeItem.facilityId,
                    newDateStr,
                    activeItem.selectedUnitId,
                );
            }
        }
    };

    const handleUnitChange = (item: BookingFacility, unitId: number) => {
        const key = String(item.facilityId);
        setSelectedUnits((p) => ({ ...p, [key]: unitId }));
        fetchSlots(item.facilityId, globalDate, unitId);
    };

    const selectedSlotKeys = useMemo(
        () => slotCart.map((item) => cartKeyFor(item)),
        [slotCart],
    );

    const cartSubtotal = useMemo(
        () => slotCart.reduce((total, item) => total + item.price_amount, 0),
        [slotCart],
    );

    const toggleSlotCart = (slot: PublicSlotCartItem) => {
        const key = cartKeyFor(slot);
        setSlotCart((current) =>
            current.some((item) => cartKeyFor(item) === key)
                ? current.filter((item) => cartKeyFor(item) !== key)
                : [...current, slot],
        );
    };

    const handleCheckoutIntent = () => {
        if (slotCart.length === 0) return;

        window.sessionStorage.setItem(
            BOOKING_CART_STORAGE_KEY,
            JSON.stringify(slotCart),
        );

        if (!auth.user) {
            const redirectTo = `${window.location.pathname}${window.location.search}#booking-content`;
            window.sessionStorage.setItem("ubsc.booking.redirect", redirectTo);
            window.location.href = `${route("login")}?redirect=${encodeURIComponent(redirectTo)}`;
            return;
        }

        router.post(route("checkout.booking.store"), {
            items: slotCart.map((item) => ({
                facility_id: item.facility_id,
                facility_unit_id: item.facility_unit_id,
                facility_name: item.facility_name,
                facility_unit_name: item.facility_unit_name,
                booking_date: item.booking_date,
                start_time: item.start_time,
                end_time: item.end_time,
                label: item.label,
                price: item.price,
                price_amount: item.price_amount,
            })),
            customer_name: auth.user.name,
            whatsapp_number: auth.user.phone_number ?? "",
            identity_category: auth.user.identity_category === "warga_kampus" ? "warga_ub" : "umum",
            identity_number: auth.user.identity_number ?? "",
        }, {
            preserveScroll: true,
        });
    };

    const bookingsData: BookingFacility[] = facilities.map((f, idx) => {
        const key = String(f.id);
        const units = f.units ?? [];
        const selectedUnitId = selectedUnits[key] ?? units[0]?.id ?? null;
        const apiSlots = slots[slotKeyFor(f.id, selectedUnitId)] ?? [];
        return {
            id: String(idx + 1).padStart(2, "0"),
            facilityId: f.id,
            title: `/${f.name}`,
            code: f.class_code ?? `/Arena ${String(idx + 1).padStart(3, "0")}/`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location ?? "Veteran",
            badgeType: f.venue_type ?? f.category,
            units,
            selectedUnitId,
            availableSlots: apiSlots.map((s) => ({
                start_time: s.start_time,
                end_time: s.end_time,
                time: s.label,
                price: s.price,
                priceAmount: priceStringToAmount(s.price),
                status: s.status,
                facilityUnitId: s.facility_unit_id ?? null,
            })),
        };
    });

    return (
        <section className="bg-white overflow-x-clip" id="booking-content">
            <div className="mx-auto max-w px-6 pt-8 sm:px-10 sm:pt-12 lg:px-16 xl:px-24 xl:pt-10">
                <SectionDivider
                    number="01"
                    title="Reservasi Disini"
                    subtitle="01 bookingpage"
                    theme="light"
                />
            </div>
            <div className="mx-auto max-w px-6 sm:px-10 lg:px-16 xl:px-24">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start mt-16 mb-16">
                    <div className="lg:col-span-3">
                        <div className="flex items-center gap-3">
                            <div className="size-[17px] rounded-[5px] bg-accent-red flex-shrink-0" />
                            <span className="font-bdo font-normal text-[clamp(1rem,1.25vw,24px)] text-black">
                                Reservasi Lewat Website
                            </span>
                        </div>
                    </div>
                    <div className="lg:col-span-9">
                        <h2 className="font-bdo font-medium text-[clamp(2rem,2.7vw,52px)] leading-[1.1] tracking-[-0.021em] text-black">
                            Booking fasilitas olahraga terbaik kami kapan saja,
                            langsung dari website.{" "}
                            <span style={{ color: "#ABABAB" }}>
                                Pilih jadwal, pilih fasilitas,
                            </span>{" "}
                            selesai dalam hitungan menit.
                        </h2>
                    </div>
                </div>

                <GlobalHorizontalDatePicker
                    value={globalDate}
                    onChange={handleGlobalDateChange}
                />

                <div className="flex flex-col w-full border-t border-gray-200">
                    {bookingsData.map((item) => {
                        const slotKey = slotKeyFor(item.facilityId, item.selectedUnitId);
                        return (
                            <BookingListItem
                                key={item.id}
                                item={item}
                                isOpen={openId === item.id}
                                onToggle={() => handleToggle(item)}
                                onUnitChange={(unitId) =>
                                    handleUnitChange(item, unitId)
                                }
                                selectedDate={globalDate}
                                selectedSlotKeys={selectedSlotKeys}
                                onToggleSlot={toggleSlotCart}
                                loadingSlots={loadingSlot[slotKey] ?? false}
                                slotError={slotError[slotKey] ?? null}
                            />
                        );
                    })}
                </div>
            </div>
            {slotCart.length > 0 && (
                <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-[58rem] rounded-[1.35rem] border border-black/10 bg-black px-4 py-3 text-white shadow-[0_24px_70px_rgba(0,0,0,0.28)] sm:bottom-6 sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="font-bdo text-xs font-medium uppercase tracking-[0.14em] text-white/50">
                                Keranjang Reservasi
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-bdo">
                                <span className="text-lg font-semibold">
                                    {slotCart.length} slot dipilih
                                </span>
                                <span className="text-sm text-white/55">
                                    Estimasi Rp {cartSubtotal.toLocaleString("id-ID")}
                                </span>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setSlotCart([])}
                                className="h-11 rounded-full border border-white/15 px-4 font-bdo text-sm font-medium text-white/70 transition hover:border-white/30 hover:text-white"
                            >
                                Kosongkan
                            </button>
                            <button
                                type="button"
                                onClick={handleCheckoutIntent}
                                className="h-11 rounded-full bg-white px-5 font-bdo text-sm font-semibold text-black transition hover:bg-white/90"
                            >
                                Mulai Reservasi
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
