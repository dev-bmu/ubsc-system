import { motion, AnimatePresence } from "framer-motion";
import FacilityBadge from "@/Components/Landing/FacilityBadge";
import ReservasiButton from "@/Components/Landing/ReservasiButton";

interface TimeSlot {
    start_time: string;
    end_time: string;
    time: string;
    price: string;
    status: "available" | "selected" | "booked";
    facilityUnitId?: number | null;
    priceAmount?: number;
}

interface FacilityUnitOption {
    id: number;
    name: string;
    image: string;
}

export interface BookingFacility {
    id: string;
    facilityId: number;
    title: string;
    code: string;
    image: string;
    badgeLocation: string;
    badgeType: string;
    units: FacilityUnitOption[];
    selectedUnitId: number | null;
    availableSlots: TimeSlot[];
}

export interface PublicSlotCartItem {
    facility_id: number;
    facility_unit_id: number | null;
    facility_name: string;
    facility_unit_name: string | null;
    booking_date: string;
    start_time: string;
    end_time: string;
    label: string;
    price: string;
    price_amount: number;
}

interface Props {
    item: BookingFacility;
    isOpen: boolean;
    onToggle: () => void;
    onUnitChange: (unitId: number) => void;
    selectedDate: string;
    selectedSlotKeys: string[];
    onToggleSlot: (slot: PublicSlotCartItem) => void;
    loadingSlots?: boolean;
    slotError?: string | null;
}

const EASE = [0.76, 0, 0.24, 1] as const;

const ChevronDown = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
    </svg>
);

const XIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
    </svg>
);

function CalendarUI({
    item,
    selectedDate,
    slots,
    units,
    selectedUnitId,
    onUnitChange,
    selectedSlotKeys,
    onToggleSlot,
    loading,
    slotError,
}: {
    item: BookingFacility;
    selectedDate: string;
    slots: TimeSlot[];
    units: FacilityUnitOption[];
    selectedUnitId: number | null;
    onUnitChange: (unitId: number) => void;
    selectedSlotKeys: string[];
    onToggleSlot: (slot: PublicSlotCartItem) => void;
    loading?: boolean;
    slotError?: string | null;
}) {
    return (
        <div className="rounded-2xl border border-gray-200 p-6 xl:p-8">
            {units.length > 0 && (
                <div className="mb-6 rounded-2xl border border-[#F8B5A8]/70 bg-[#FFF7F5]/70 p-3 sm:p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <p className="font-bdo text-sm font-semibold text-slate-800">
                                Pilih Unit
                            </p>
                            <p className="font-bdo text-xs text-slate-500">
                                Jadwal dihitung per lapangan/ruang yang dipilih.
                            </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 font-bdo text-[11px] font-bold text-[#B93D2A] ring-1 ring-[#F8B5A8]/70">
                            {units.length} unit
                        </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {units.map((unit) => {
                            const active = selectedUnitId === unit.id;
                            return (
                                <button
                                    key={unit.id}
                                    type="button"
                                    onClick={() => onUnitChange(unit.id)}
                                    className={`group flex items-center gap-3 rounded-2xl border p-2 text-left transition-all ${
                                        active
                                            ? "border-[#E35336] bg-white shadow-[0_18px_30px_-24px_rgba(227,83,54,.8)]"
                                            : "border-white bg-white/70 hover:border-[#F8B5A8] hover:bg-white"
                                    }`}
                                    aria-pressed={active}
                                >
                                    <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                        <img
                                            src={unit.image || "/assets/images/comingsoon.avif"}
                                            alt={unit.name}
                                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                        />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate font-bdo text-sm font-semibold text-slate-800">
                                            {unit.name}
                                        </span>
                                        <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-bdo text-[10px] font-bold ${
                                            active
                                                ? "bg-[#FFF7F5] text-[#B93D2A]"
                                                : "bg-slate-50 text-slate-400"
                                        }`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-[#E35336]" : "bg-slate-300"}`} />
                                            {active ? "Dipilih" : "Pilih"}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Loading state */}
            {loading && (
                <div className="flex items-center justify-center py-12 text-gray-400">
                    <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="font-bdo text-sm">Memuat jadwal…</span>
                </div>
            )}

            {/* Error state */}
            {!loading && slotError && (
                <div className="flex items-center justify-center py-10">
                    <p className="font-bdo text-sm text-rose-500 text-center">{slotError}</p>
                </div>
            )}

            {/* Empty state */}
            {!loading && !slotError && slots.length === 0 && (
                <div className="flex items-center justify-center py-10">
                    <p className="font-bdo text-sm text-gray-400 text-center">Tidak ada jadwal tersedia untuk tanggal ini.</p>
                </div>
            )}

            {/* Slot grid */}
            {!loading && !slotError && slots.length > 0 && (
                <>
                    <p className="font-bdo font-medium text-base text-gray-600 mb-4">
                        Waktu Yang Tersedia
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                        {slots.map((slot, i) => {
                            const isBooked = slot.status === "booked";
                            const slotKey = [
                                item.facilityId,
                                slot.facilityUnitId ?? "parent",
                                selectedDate,
                                slot.start_time,
                                slot.end_time,
                            ].join("|");
                            const isSelected = selectedSlotKeys.includes(slotKey);
                            const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
                            return (
                                <button
                                    key={i}
                                    type="button"
                                    disabled={isBooked}
                                    onClick={() => {
                                        if (isBooked) return;
                                        onToggleSlot({
                                            facility_id: item.facilityId,
                                            facility_unit_id: slot.facilityUnitId ?? selectedUnitId ?? null,
                                            facility_name: item.title.replace(/^\/+/, ""),
                                            facility_unit_name: selectedUnit?.name ?? null,
                                            booking_date: selectedDate,
                                            start_time: slot.start_time,
                                            end_time: slot.end_time,
                                            label: slot.time,
                                            price: slot.price,
                                            price_amount: slot.priceAmount ?? 0,
                                        });
                                    }}
                                    className={`relative flex flex-col items-center py-4 px-2 rounded-xl text-sm transition-colors ${
                                        isBooked
                                            ? "bg-rose-50 text-rose-300 pointer-events-none opacity-40 cursor-not-allowed"
                                            : isSelected
                                            ? "border border-[#0B4A72] bg-[#0B4A72] text-white shadow-[0_16px_28px_-22px_rgba(11,74,114,.85)]"
                                            : "border border-transparent bg-gray-50 text-gray-400 hover:border-[#0B4A72]/25 hover:bg-white hover:text-gray-700"
                                    }`}
                                >
                                    {isBooked && (
                                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                                            Penuh
                                        </span>
                                    )}
                                    {isSelected && (
                                        <span className="absolute -top-2 right-2 rounded-full bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#0B4A72]">
                                            Dipilih
                                        </span>
                                    )}
                                    <span className="font-bdo font-medium text-xs xl:text-sm">
                                        {slot.time}
                                    </span>
                                    {!isBooked && (
                                        <span className="font-bdo font-light text-xs opacity-70 mt-1">
                                            {slot.price}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

export default function BookingListItem({
    item,
    isOpen,
    onToggle,
    onUnitChange,
    selectedDate,
    selectedSlotKeys,
    onToggleSlot,
    loadingSlots,
    slotError,
}: Props) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] xl:grid-cols-[320px_1fr] gap-6 xl:gap-8 py-6 border-b border-gray-200 w-full items-start">

            <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden">
                <img
                    src={item.image}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                />
                {!isOpen && (
                    <div className="absolute bottom-3 left-3">
                        <FacilityBadge
                            location={item.badgeLocation}
                            category={item.badgeType}
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-col w-full min-w-0">

                <div
                    onClick={onToggle}
                    role="button"
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between cursor-pointer pb-2 gap-4"
                >
                    <span className="flex-grow font-bdo font-light text-[clamp(1.25rem,1.67vw,32px)] text-black leading-tight">
                        {item.title}
                    </span>
                    <span className="hidden sm:block font-bdo font-medium text-sm text-gray-400 whitespace-nowrap">
                        {item.code}
                    </span>
                    <div
                        className={`flex-shrink-0 flex size-10 xl:size-11 items-center justify-center rounded-full transition-colors ${
                            isOpen ? "bg-accent-red text-white" : "bg-black text-white"
                        }`}
                    >
                        {isOpen ? <XIcon /> : <ChevronDown />}
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {isOpen && (
                        <motion.div
                            key="body"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.45, ease: EASE }}
                            className="overflow-hidden"
                        >
                            <div className="mt-6">
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                                    <ReservasiButton label="Mulai Reservasi" href="#" />
                                    <FacilityBadge
                                        location={item.badgeLocation}
                                        category={item.badgeType}
                                    />
                                </div>

                                <CalendarUI
                                    item={item}
                                    selectedDate={selectedDate}
                                    slots={item.availableSlots}
                                    units={item.units}
                                    selectedUnitId={item.selectedUnitId}
                                    onUnitChange={onUnitChange}
                                    selectedSlotKeys={selectedSlotKeys}
                                    onToggleSlot={onToggleSlot}
                                    loading={loadingSlots}
                                    slotError={slotError}
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
