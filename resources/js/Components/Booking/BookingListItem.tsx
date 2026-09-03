import { motion, useReducedMotion } from "framer-motion";
import { LoaderCircle, Minus, Plus, UsersRound } from "lucide-react";
import {
    useMemo,
    type PointerEventHandler,
    type SyntheticEvent,
} from "react";
import type { BookingAvailabilityLoadState } from "./BookingDiscoveryBar";
import type {
    BookingFacilityAvailabilityStatus,
    BookingUnitAvailability,
} from "./useBookingAvailability";
import BookingFacilityGallery, {
    type BookingGalleryImage,
} from "./BookingFacilityGallery";

interface TimeSlot {
    start_time: string;
    end_time: string;
    time: string;
    price: string;
    status: "available" | "selected" | "booked";
    reason?: "elapsed" | "fully_booked" | null;
    facilityUnitId?: number | null;
    priceAmount?: number;
    capacity: number;
    sharedCapacity: boolean;
    occupied: number;
    remaining: number;
}

interface FacilityUnitOption {
    id: number;
    name: string;
    image: string;
    capacity_override?: number | null;
    booking_capacity?: number;
    has_shared_booking_capacity?: boolean;
}

export interface BookingSlotFilter {
    minimumMinutes: number;
    maximumMinutes: number;
    startTimes: string[];
    availableOnly: boolean;
}

export interface BookingFacilityAvailabilityView {
    state: BookingAvailabilityLoadState;
    status: BookingFacilityAvailabilityStatus | null;
    reason: string | null;
    availableSlotCount: number;
    totalSlotCount: number;
    availableStartTimes: string[];
    nextAvailableAt: string | null;
    units: BookingUnitAvailability[];
    stale: boolean;
}

export interface BookingFacility {
    id: string;
    facilityId: number;
    title: string;
    code: string;
    image: string;
    gallery: BookingGalleryImage[];
    sport: string;
    filterCategory: string;
    category: string;
    bookingCapacity: number;
    hasSharedBookingCapacity: boolean;
    badgeLocation: string;
    badgeType: string;
    units: FacilityUnitOption[];
    selectedUnitId: number | null;
    availableSlots: TimeSlot[];
    availability: BookingFacilityAvailabilityView;
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
    onToggle: (trigger: HTMLButtonElement) => void;
    onUnitChange: (unitId: number) => void;
    selectedDate: string;
    selectedSlotKeys: string[];
    onToggleSlot: (slot: PublicSlotCartItem) => void;
    loadingSlots?: boolean;
    slotError?: string | null;
    slotFilter: BookingSlotFilter;
    selectedSlotCount: number;
    selectedUnitSlotCount: number;
    onRetrySlots: () => void;
    onPreviewPointerEnter?: PointerEventHandler<HTMLButtonElement>;
    onPreviewPointerMove?: PointerEventHandler<HTMLButtonElement>;
    onPreviewPointerLeave?: PointerEventHandler<HTMLButtonElement>;
    onPreviewPointerDown?: PointerEventHandler<HTMLButtonElement>;
}

const EASE = [0.76, 0, 0.24, 1] as const;
const FALLBACK_IMAGE = "/assets/images/comingsoon.avif";

function applyImageFallback(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;

    if (image.dataset.fallbackApplied === "true") {
        image.style.visibility = "hidden";
        return;
    }

    image.dataset.fallbackApplied = "true";
    image.src = FALLBACK_IMAGE;
}

function timeToMinutes(value: string): number {
    const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
    return hours * 60 + minutes;
}

function formatBookingDate(value: string): string {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
    }).format(new Date(year, month - 1, day));
}

function availabilityStateLabel(
    availability: BookingFacilityAvailabilityView,
    selectedCount: number,
): { primary: string; secondary: string | null } {
    if (selectedCount > 0) {
        return {
            primary: `${String(selectedCount).padStart(2, "0")} dipilih`,
            secondary:
                availability.availableSlotCount > 0
                    ? `${availability.availableSlotCount} jadwal tersedia`
                    : null,
        };
    }

    if (availability.state === "loading" && !availability.status) {
        return { primary: "Memeriksa jadwal", secondary: null };
    }

    if (availability.state === "error" && !availability.status) {
        return { primary: "Tidak dapat diperbarui", secondary: "Periksa lagi" };
    }

    switch (availability.status) {
        case "available":
        case "limited":
            return {
                primary: `${String(availability.availableSlotCount).padStart(2, "0")} jadwal tersedia`,
                secondary: availability.nextAvailableAt
                    ? `Mulai ${availability.nextAvailableAt.replace(":", ".")}`
                    : null,
            };
        case "full":
            if (availability.reason === "elapsed") {
                return {
                    primary: "Jadwal hari ini berakhir",
                    secondary: "Pilih tanggal berikutnya",
                };
            }
            return {
                primary:
                    availability.reason === "fully_booked"
                        ? "Semua jadwal dipesan"
                        : "Jadwal penuh",
                secondary: null,
            };
        case "closed":
            return { primary: "Tutup pada tanggal ini", secondary: null };
        case "no_schedule":
            return { primary: "Belum ada jadwal", secondary: null };
        default:
            break;
    }

    switch (availability.state) {
        case "loading":
        case "refreshing":
            return { primary: "Memeriksa jadwal", secondary: null };
        case "error":
            return { primary: "Tidak dapat diperbarui", secondary: "Periksa lagi" };
        default:
            return { primary: "Ketersediaan langsung", secondary: null };
    }
}

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
    slotFilter,
    selectedSlotCount,
    onRetry,
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
    slotFilter: BookingSlotFilter;
    selectedSlotCount: number;
    onRetry: () => void;
}) {
    const visibleSlots = useMemo(
        () =>
            slots.filter((slot) => {
                const startTime = slot.start_time.slice(0, 5);
                const startMinutes = timeToMinutes(startTime);
                const matchesRange =
                    startMinutes >= slotFilter.minimumMinutes &&
                    startMinutes < slotFilter.maximumMinutes;
                const matchesExact =
                    slotFilter.startTimes.length === 0 ||
                    slotFilter.startTimes.includes(startTime);
                const matchesAvailability =
                    !slotFilter.availableOnly || slot.status !== "booked";

                return matchesRange && matchesExact && matchesAvailability;
            }),
        [slotFilter, slots],
    );
    const visibleAvailableSlots = useMemo(
        () => visibleSlots.filter((slot) => slot.status !== "booked"),
        [visibleSlots],
    );
    const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
    const selectedUnitAvailability =
        selectedUnitId === null
            ? null
            : item.availability.units.find(
                  (unit) => unit.facility_unit_id === selectedUnitId,
              );
    const selectedAvailabilityReason =
        selectedUnitAvailability?.reason ?? item.availability.reason;
    return (
        <div className="booking-schedule" aria-busy={loading}>
            <header className="booking-schedule__header">
                <span>(Jadwal)</span>
                <span>
                    <strong>{formatBookingDate(selectedDate)}</strong>
                    <small>
                        {selectedUnit?.name ??
                            item.title.replace(/^\/+/, "")}
                    </small>
                </span>
                <span>
                    {loading ? (
                        <>Memeriksa jadwal</>
                    ) : (
                        <>
                            {String(visibleAvailableSlots.length).padStart(
                                2,
                                "0",
                            )}{" "}
                            tersedia /{" "}
                            {String(visibleSlots.length).padStart(2, "0")} total
                        </>
                    )}
                </span>
            </header>

            <div
                className="booking-schedule__journey"
                aria-label="Status langkah reservasi"
            >
                <span className={selectedUnitId ? "is-complete" : ""}>
                    <b>01</b>
                    <em>Unit</em>
                </span>
                <span
                    className={
                        visibleAvailableSlots.length > 0 ? "is-complete" : ""
                    }
                >
                    <b>02</b>
                    <em>Waktu</em>
                </span>
                <span className={selectedSlotCount > 0 ? "is-complete" : ""}>
                    <b>03</b>
                    <em>Keranjang</em>
                </span>
            </div>

            {item.hasSharedBookingCapacity && (
                <div className="booking-capacity-guide" role="note">
                    <span
                        className="booking-capacity-guide__icon"
                        aria-hidden="true"
                    >
                        <UsersRound />
                    </span>
                    <span>
                        <strong>{item.bookingCapacity} tempat per jadwal</strong>
                        <small>
                            Sisa kuota aktual tertera pada setiap pilihan waktu.
                        </small>
                    </span>
                </div>
            )}

            {units.length > 0 && (
                <section
                    className="booking-unit-selector"
                    aria-labelledby={`booking-unit-${item.id}`}
                >
                    <div className="booking-unit-selector__heading">
                        <span id={`booking-unit-${item.id}`}>(Pilih Unit)</span>
                        <span>{String(units.length).padStart(2, "0")}</span>
                    </div>

                    <div
                        className="booking-unit-selector__list"
                        role="radiogroup"
                        aria-label={`Pilih unit ${item.title.replace(/^\/+/, "")}`}
                    >
                        {units.map((unit, index) => {
                            const active = selectedUnitId === unit.id;
                            const unitAvailability =
                                item.availability.units.find(
                                    (summary) =>
                                        summary.facility_unit_id === unit.id,
                                );
                            const unitState = !unitAvailability
                                ? "Memeriksa"
                                : unitAvailability.status === "closed"
                                  ? "Tutup"
                                  : unitAvailability.status === "no_schedule"
                                    ? "Belum dijadwalkan"
                                    : unitAvailability.reason === "elapsed"
                                      ? "Waktu berlalu"
                                    : unitAvailability.available_slot_count > 0
                                      ? `${unitAvailability.available_slot_count} jadwal`
                                      : unitAvailability.reason ===
                                          "fully_booked"
                                        ? "Sudah dipesan"
                                        : "Penuh";
                            const unitQuota = unitAvailability?.shared_capacity
                                ? ` · kuota ${unitAvailability.capacity}`
                                : "";
                            return (
                                <button
                                    key={unit.id}
                                    type="button"
                                    onClick={() => onUnitChange(unit.id)}
                                    className={`booking-unit-option${active ? " is-active" : ""}`}
                                    role="radio"
                                    aria-checked={active}
                                >
                                    <span className="booking-unit-option__index">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <span className="booking-unit-option__image">
                                        <img
                                            src={
                                                unit.image ||
                                                FALLBACK_IMAGE
                                            }
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                            onError={applyImageFallback}
                                        />
                                    </span>
                                    <strong>{unit.name}</strong>
                                    <span className="booking-unit-option__state">
                                        {active ? `Terpilih · ${unitState}${unitQuota}` : `${unitState}${unitQuota}`}
                                    </span>
                                    <span
                                        className="booking-unit-option__mark"
                                        aria-hidden="true"
                                    >
                                        {active ? <Minus /> : <Plus />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            <section
                className="booking-slot-section"
                aria-labelledby={`booking-slot-${item.id}`}
            >
                <div className="booking-slot-section__heading">
                    <span id={`booking-slot-${item.id}`}>(Waktu Tersedia)</span>
                    <span>
                        {loading
                            ? "Memuat"
                            : `${String(visibleAvailableSlots.length).padStart(2, "0")} tersedia`}
                    </span>
                </div>

                {loading && (
                    <div className="booking-schedule-state" role="status">
                        <LoaderCircle
                            className="booking-schedule-state__spinner"
                            aria-hidden="true"
                        />
                        <span>Memuat jadwal...</span>
                    </div>
                )}

                {!loading && slotError && (
                    <div
                        className="booking-schedule-state booking-schedule-state--error"
                        role={
                            slotError === "Gagal memuat jadwal. Coba lagi."
                                ? "alert"
                                : "status"
                        }
                    >
                        <p>{slotError}</p>
                        {slotError === "Gagal memuat jadwal. Coba lagi." && (
                            <button type="button" onClick={onRetry}>
                                Muat ulang jadwal
                                <i aria-hidden="true" />
                            </button>
                        )}
                    </div>
                )}

                {!loading && !slotError && slots.length === 0 && (
                    <div className="booking-schedule-state" role="status">
                        <p>
                            {selectedAvailabilityReason === "elapsed"
                                ? "Seluruh waktu reservasi hari ini telah berlalu."
                                : selectedAvailabilityReason ===
                                    "fully_booked"
                                  ? "Seluruh jadwal untuk unit ini telah dipesan."
                                  : "Tidak ada jadwal tersedia untuk tanggal ini."}
                        </p>
                    </div>
                )}

                {!loading &&
                    !slotError &&
                    slots.length > 0 &&
                    visibleSlots.length === 0 && (
                        <div className="booking-schedule-state" role="status">
                            <p>
                                Tidak ada slot yang sesuai dengan filter waktu.
                            </p>
                        </div>
                    )}

                {!loading && !slotError && visibleSlots.length > 0 && (
                    <div className="booking-slot-grid">
                        {visibleSlots.map((slot, index) => {
                            const isBooked = slot.status === "booked";
                            const showsQuota =
                                slot.sharedCapacity &&
                                slot.capacity > 1 &&
                                slot.reason !== "elapsed";
                            const lowQuota =
                                !isBooked &&
                                showsQuota &&
                                slot.remaining <=
                                    Math.max(
                                        2,
                                        Math.ceil(slot.capacity * 0.2),
                                    );
                            const bookedStateLabel =
                                slot.reason === "elapsed"
                                    ? "Waktu berlalu"
                                    : "Penuh";
                            const slotKey = [
                                item.facilityId,
                                slot.facilityUnitId ?? "parent",
                                selectedDate,
                                slot.start_time,
                                slot.end_time,
                            ].join("|");
                            const isSelected =
                                !isBooked &&
                                selectedSlotKeys.includes(slotKey);

                            return (
                                <button
                                    key={slotKey}
                                    type="button"
                                    disabled={isBooked}
                                    aria-pressed={isSelected}
                                    aria-label={`${slot.time}, ${isBooked ? bookedStateLabel.toLocaleLowerCase("id-ID") : slot.price}${showsQuota ? `, sisa ${slot.remaining} dari ${slot.capacity} tempat` : ""}${isSelected ? ", dipilih" : ""}`}
                                    onClick={() => {
                                        if (isBooked) return;
                                        onToggleSlot({
                                            facility_id: item.facilityId,
                                            facility_unit_id:
                                                slot.facilityUnitId ??
                                                selectedUnitId ??
                                                null,
                                            facility_name: item.title.replace(
                                                /^\/+/,
                                                "",
                                            ),
                                            facility_unit_name:
                                                selectedUnit?.name ?? null,
                                            booking_date: selectedDate,
                                            start_time: slot.start_time,
                                            end_time: slot.end_time,
                                            label: slot.time,
                                            price: slot.price,
                                            price_amount:
                                                slot.priceAmount ?? 0,
                                        });
                                    }}
                                    className={`booking-slot${showsQuota ? " has-shared-capacity" : ""}${lowQuota ? " is-low-quota" : ""}${isBooked ? " is-booked" : ""}${isSelected ? " is-selected" : ""}`}
                                >
                                    <span
                                        className="booking-slot__index"
                                        aria-hidden="true"
                                    >
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <strong>{slot.time}</strong>
                                    {showsQuota && (
                                        <span className="booking-slot__quota">
                                            <i aria-hidden="true" />
                                            {isBooked
                                                ? `0 dari ${slot.capacity} tersisa`
                                                : `Sisa ${slot.remaining} dari ${slot.capacity}`}
                                        </span>
                                    )}
                                    <span className="booking-slot__price">
                                        {isBooked
                                            ? bookedStateLabel
                                            : slot.price}
                                    </span>
                                    <span
                                        className="booking-slot__mark"
                                        aria-hidden="true"
                                    >
                                        {isBooked
                                            ? "—"
                                            : isSelected
                                              ? "Dipilih"
                                              : "+"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>
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
    slotFilter,
    selectedSlotCount,
    selectedUnitSlotCount,
    onRetrySlots,
    onPreviewPointerEnter,
    onPreviewPointerMove,
    onPreviewPointerLeave,
    onPreviewPointerDown,
}: Props) {
    const reduceMotion = useReducedMotion();
    const triggerId = `booking-arena-trigger-${item.id}`;
    const panelId = `booking-arena-panel-${item.id}`;
    const availabilityLabel = availabilityStateLabel(
        item.availability,
        selectedSlotCount,
    );
    const availabilityClass = item.availability.status
        ? ` is-availability-${item.availability.status.replace("_", "-")}`
        : "";
    const loadingClass =
        item.availability.state === "loading" &&
        !item.availability.status
            ? " is-availability-loading"
            : "";
    const staleClass = item.availability.stale
        ? " is-availability-stale"
        : "";

    return (
        <article
            className={`booking-directory-item${isOpen ? " is-open" : ""}${availabilityClass}${loadingClass}${staleClass}`}
        >
            <button
                id={triggerId}
                type="button"
                onClick={(event) => onToggle(event.currentTarget)}
                onPointerEnter={onPreviewPointerEnter}
                onPointerMove={onPreviewPointerMove}
                onPointerLeave={onPreviewPointerLeave}
                onPointerDown={onPreviewPointerDown}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="booking-directory-item__trigger"
            >
                <span className="booking-directory-item__code">
                    {item.code.replace(/\//g, "")}
                </span>
                <strong className="booking-directory-item__title">
                    {item.title}
                </strong>
                <span className="booking-directory-item__meta">
                    <strong>{item.sport}</strong>
                    <small>{item.badgeLocation}</small>
                </span>
                <span className="booking-directory-item__status">
                    <strong>{availabilityLabel.primary}</strong>
                    {availabilityLabel.secondary && (
                        <small>{availabilityLabel.secondary}</small>
                    )}
                    {item.hasSharedBookingCapacity && (
                        <small className="booking-directory-item__quota">
                            <UsersRound aria-hidden="true" />
                            Kapasitas {item.bookingCapacity} peserta
                        </small>
                    )}
                </span>
                <span className="booking-directory-item__thumb">
                    <img
                        src={item.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={applyImageFallback}
                    />
                </span>
                <span
                    className="booking-directory-item__toggle"
                    aria-hidden="true"
                >
                    {isOpen ? <Minus /> : <Plus />}
                </span>
            </button>

            {isOpen && (
                <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                        duration: reduceMotion ? 0 : 0.28,
                        ease: EASE,
                    }}
                    className="booking-directory-item__body"
                >
                    <div className="booking-directory-item__workspace">
                        <figure className="booking-directory-item__visual">
                            <BookingFacilityGallery
                                facilityName={item.title.replace(/^\/+/, "")}
                                images={item.gallery}
                            />
                            <figcaption>
                                <span>{item.badgeLocation}</span>
                                <span>{item.badgeType}</span>
                            </figcaption>
                        </figure>

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
                            slotFilter={slotFilter}
                            selectedSlotCount={selectedUnitSlotCount}
                            onRetry={onRetrySlots}
                        />
                    </div>
                </motion.div>
            )}
        </article>
    );
}
