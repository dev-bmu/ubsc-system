import type { PageProps } from "@/types";
import { router, usePage } from "@inertiajs/react";
import axios from "axios";
import { ArrowRight, RotateCcw, SearchX } from "lucide-react";
import {
    useCallback,
    useDeferredValue,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import { useAuthFlow } from "@/Components/Landing/AuthFlowProvider";
import PricingSectionHeadline from "@/Components/Pricing/PricingSectionHeadline";
import {
    scrollWindowToImmediate,
    scrollWindowToSmooth,
} from "@/lib/scrollCoordinator";
import {
    bookingCheckoutIntentScope,
    canonicalBookingCheckoutCart,
    clearBookingCheckoutIntent,
    getOrCreateBookingCheckoutIntent,
    readBookingCheckoutIntent,
} from "@/lib/bookingCheckoutIntent";
import BookingCursorPreview, {
    type BookingCursorPreviewHandle,
} from "./BookingCursorPreview";
import BookingDiscoveryBar, {
    type BookingFilterOption,
    type BookingTimePreset,
} from "./BookingDiscoveryBar";
import BookingListItem, {
    type BookingFacility,
    type BookingSlotFilter,
    type PublicSlotCartItem,
} from "./BookingListItem";
import type { BookingGalleryImage } from "./BookingFacilityGallery";
import useBookingAvailability from "./useBookingAvailability";
import useBookingCalendar, {
    bookingCalendarDateState,
    normalizeBookingCalendar,
    type BookingCalendarClosureReason,
} from "./useBookingCalendar";
import "./BookingSection.css";

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
    booking_gallery?: BookingGalleryImage[];
}

interface BookingSectionProps {
    facilities?: BackendFacility[];
    bookingToday?: string;
    bookingCalendar?: unknown;
}

interface ApiSlot {
    start_time: string;
    end_time: string;
    label: string;
    price: string;
    status: "available" | "booked";
    reason?: "elapsed" | "fully_booked" | null;
    remaining: number;
    facility_unit_id?: number | null;
}

interface DirectoryScrollAnchor {
    triggerId: string;
    viewportTop: number;
}

const BOOKING_CART_STORAGE_KEY = "ubsc.booking.cart";
const MAX_STORED_BOOKING_CART_ITEMS = 50;
const SLOT_CACHE_TTL_MS = 15_000;
const SLOT_REQUEST_TIMEOUT_MS = 8_000;
const BOOKING_SECTION_HEADLINE =
    "Temukan arena atau kelas yang tepat untuk setiap kebutuhan latihan dan waktu pilihan Anda.";
const BOOKING_SECTION_SUPPORT =
    "Lihat ketersediaan fasilitas dan pilih jadwal yang paling sesuai.";
const BOOKING_SPORT_METADATA_KEYS = [
    "booking_sport",
    "sport",
    "sport_name",
    "activity",
] as const;
const BOOKING_FACILITY_KIND_METADATA_KEYS = [
    "booking_category",
    "facility_kind",
    "venue_category",
] as const;
const BOOKING_FACILITY_KIND_ORDER = [
    "Tertutup",
    "Kelas",
    "Terbuka",
] as const;

const TIME_PRESET_RANGES: Record<
    Exclude<BookingTimePreset, "custom">,
    [number, number]
> = {
    all: [0, 24 * 60],
    morning: [6 * 60, 12 * 60],
    afternoon: [12 * 60, 16 * 60],
    evening: [16 * 60, 19 * 60],
    night: [19 * 60, 24 * 60],
};

const slotKeyFor = (
    facilityId: number,
    date: string,
    facilityUnitId?: number | null,
) => `${facilityId}:${facilityUnitId ?? "parent"}:${date}`;

const cartKeyFor = (
    item: Pick<
        PublicSlotCartItem,
        | "facility_id"
        | "facility_unit_id"
        | "booking_date"
        | "start_time"
        | "end_time"
    >,
) =>
    [
        item.facility_id,
        item.facility_unit_id ?? "parent",
        item.booking_date,
        item.start_time,
        item.end_time,
    ].join("|");

function isRecord(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function isPositiveSafeInteger(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value > 0
    );
}

function sanitizedCartText(
    value: unknown,
    maximumLength: number,
): string | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 && text.length <= maximumLength ? text : null;
}

function isValidBookingDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        year >= 2000 &&
        year <= 2100 &&
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function bookingTimeToSeconds(
    value: string,
    allowEndOfDay = false,
): number | null {
    if (allowEndOfDay && /^24:00(?::00)?$/.test(value)) {
        return 24 * 60 * 60;
    }

    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(
        value,
    );
    if (!match) return null;

    return (
        Number(match[1]) * 60 * 60 +
        Number(match[2]) * 60 +
        Number(match[3] ?? 0)
    );
}

function parseStoredBookingCartItem(
    value: unknown,
): PublicSlotCartItem | null {
    if (!isRecord(value) || !isPositiveSafeInteger(value.facility_id)) {
        return null;
    }

    const facilityUnitId =
        value.facility_unit_id === null
            ? null
            : isPositiveSafeInteger(value.facility_unit_id)
              ? value.facility_unit_id
              : undefined;
    if (facilityUnitId === undefined) return null;

    const facilityName = sanitizedCartText(value.facility_name, 160);
    const facilityUnitName =
        value.facility_unit_name === null
            ? null
            : sanitizedCartText(value.facility_unit_name, 160);
    const bookingDate = sanitizedCartText(value.booking_date, 10);
    const startTime = sanitizedCartText(value.start_time, 8);
    const endTime = sanitizedCartText(value.end_time, 8);
    const label = sanitizedCartText(value.label, 160);
    const price = sanitizedCartText(value.price, 80);
    const startSeconds = startTime
        ? bookingTimeToSeconds(startTime)
        : null;
    const endSeconds = endTime
        ? bookingTimeToSeconds(endTime, true)
        : null;

    if (
        !facilityName ||
        (value.facility_unit_name !== null && !facilityUnitName) ||
        !bookingDate ||
        !isValidBookingDate(bookingDate) ||
        !startTime ||
        !endTime ||
        startSeconds === null ||
        endSeconds === null ||
        endSeconds <= startSeconds ||
        !label ||
        !price ||
        typeof value.price_amount !== "number" ||
        !Number.isSafeInteger(value.price_amount) ||
        value.price_amount < 0
    ) {
        return null;
    }

    return {
        facility_id: value.facility_id,
        facility_unit_id: facilityUnitId,
        facility_name: facilityName,
        facility_unit_name: facilityUnitName,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        label,
        price,
        price_amount: value.price_amount,
    };
}

function readStoredBookingCart(): PublicSlotCartItem[] {
    if (typeof window === "undefined") return [];

    try {
        const serialized = window.sessionStorage.getItem(
            BOOKING_CART_STORAGE_KEY,
        );
        if (!serialized) return [];

        const parsed: unknown = JSON.parse(serialized);
        if (
            !Array.isArray(parsed) ||
            parsed.length > MAX_STORED_BOOKING_CART_ITEMS
        ) {
            window.sessionStorage.removeItem(BOOKING_CART_STORAGE_KEY);
            return [];
        }

        const seen = new Set<string>();
        const restored: PublicSlotCartItem[] = [];

        for (const value of parsed) {
            const item = parseStoredBookingCartItem(value);
            if (!item) continue;

            const key = cartKeyFor(item);
            if (seen.has(key)) continue;
            seen.add(key);
            restored.push(item);
        }

        if (restored.length !== parsed.length) {
            if (restored.length === 0) {
                window.sessionStorage.removeItem(BOOKING_CART_STORAGE_KEY);
            } else {
                window.sessionStorage.setItem(
                    BOOKING_CART_STORAGE_KEY,
                    JSON.stringify(restored),
                );
            }
        }

        return restored;
    } catch {
        try {
            window.sessionStorage.removeItem(BOOKING_CART_STORAGE_KEY);
        } catch {
            // Storage can be unavailable in restricted browsing contexts.
        }
        return [];
    }
}

function syncStoredBookingCart(items: PublicSlotCartItem[]): void {
    if (typeof window === "undefined") return;

    try {
        if (items.length === 0) {
            window.sessionStorage.removeItem(BOOKING_CART_STORAGE_KEY);
            return;
        }

        window.sessionStorage.setItem(
            BOOKING_CART_STORAGE_KEY,
            JSON.stringify(items),
        );
    } catch {
        // The live cart remains usable if session storage is unavailable.
    }
}

function viewportRelativeTop(element: HTMLElement): number {
    return (
        element.getBoundingClientRect().top -
        (window.visualViewport?.offsetTop ?? 0)
    );
}

function priceStringToAmount(price: string): number {
    const digits = price.replace(/[^\d]/g, "");
    return digits ? Number(digits) : 0;
}

function todayStr(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function timeToMinutes(value: string): number {
    const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
    return hours * 60 + minutes;
}

function matchingStartTimes(
    startTimes: string[],
    minimumMinutes: number,
    maximumMinutes: number,
    selectedStartTimes: string[],
): string[] {
    return startTimes.filter((startTime) => {
        const normalizedStartTime = startTime.slice(0, 5);
        const minutes = timeToMinutes(normalizedStartTime);

        return (
            minutes >= minimumMinutes &&
            minutes < maximumMinutes &&
            (selectedStartTimes.length === 0 ||
                selectedStartTimes.includes(normalizedStartTime))
        );
    });
}

function formatCompactBookingDate(value: string): string {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(year, month - 1, day));
}

function isApiSlot(value: unknown): value is ApiSlot {
    if (!value || typeof value !== "object") return false;

    const slot = value as Record<string, unknown>;
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
    return (
        typeof slot.start_time === "string" &&
        timePattern.test(slot.start_time) &&
        typeof slot.end_time === "string" &&
        (timePattern.test(slot.end_time) ||
            /^24:00(?::00)?$/.test(slot.end_time)) &&
        typeof slot.label === "string" &&
        typeof slot.price === "string" &&
        (slot.status === "available" || slot.status === "booked") &&
        (slot.reason === undefined ||
            slot.reason === null ||
            slot.reason === "elapsed" ||
            slot.reason === "fully_booked") &&
        typeof slot.remaining === "number" &&
        Number.isFinite(slot.remaining) &&
        slot.remaining >= 0 &&
        (slot.facility_unit_id === undefined ||
            slot.facility_unit_id === null ||
            (typeof slot.facility_unit_id === "number" &&
                Number.isInteger(slot.facility_unit_id) &&
                slot.facility_unit_id > 0))
    );
}

function normalizeSearch(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase("id-ID");
}

function metadataText(
    metadata: Record<string, unknown> | null | undefined,
    keys: readonly string[],
): string | null {
    if (!metadata) return null;

    for (const key of keys) {
        const value = metadata[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }

    return null;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sportLabelFor(facility: BackendFacility): string {
    const explicitLabel = metadataText(
        facility.display_metadata,
        BOOKING_SPORT_METADATA_KEYS,
    );
    if (explicitLabel) return explicitLabel;

    let inferredLabel = facility.name
        .trim()
        .replace(/^\/+/, "")
        .replace(/^(?:lapangan|arena|ruang|studio|kelas)\s+/i, "")
        .trim();
    const location = facility.location?.trim();

    if (location) {
        inferredLabel = inferredLabel
            .replace(new RegExp(`\\s+${escapeRegExp(location)}$`, "i"), "")
            .trim();
    }

    return inferredLabel || facility.name.trim();
}

function facilityKindLabelFor(facility: BackendFacility): string {
    const explicitLabel = metadataText(
        facility.display_metadata,
        BOOKING_FACILITY_KIND_METADATA_KEYS,
    );
    const classification = normalizeSearch(
        [
            explicitLabel,
            facility.category,
            facility.venue_type,
            facility.class_code,
        ]
            .filter(Boolean)
            .join(" "),
    );

    if (/\b(?:kelas|kebugaran|class|studio)\b/.test(classification)) {
        return "Kelas";
    }

    if (/\b(?:terbuka|outdoor|luar ruang)\b/.test(classification)) {
        return "Terbuka";
    }

    if (/\b(?:tertutup|indoor|lapangan|arena)\b/.test(classification)) {
        return "Tertutup";
    }

    return explicitLabel?.trim() || facility.category?.trim() || "Lainnya";
}

function buildFilterOptions(
    values: Array<string | null | undefined>,
    allLabel: string,
    preferredOrder: readonly string[] = [],
): BookingFilterOption[] {
    const groups = new Map<string, { label: string; count: number }>();
    const order = new Map(
        preferredOrder.map((label, index) => [normalizeSearch(label), index]),
    );

    values.forEach((value) => {
        const label = value?.trim();
        if (!label) return;

        const key = normalizeSearch(label);
        const existing = groups.get(key);
        groups.set(key, {
            label: existing?.label ?? label,
            count: (existing?.count ?? 0) + 1,
        });
    });

    const options = Array.from(groups.entries())
        .sort(([leftValue, left], [rightValue, right]) => {
            const leftOrder = order.get(leftValue);
            const rightOrder = order.get(rightValue);

            if (leftOrder !== undefined || rightOrder !== undefined) {
                return (
                    (leftOrder ?? Number.MAX_SAFE_INTEGER) -
                    (rightOrder ?? Number.MAX_SAFE_INTEGER)
                );
            }

            return left.label.localeCompare(right.label, "id", {
                sensitivity: "base",
            });
        })
        .map(([value, option]) => ({ value, ...option }));

    return [
        { value: "all", label: allLabel, count: values.length },
        ...options,
    ];
}

export default function BookingSection({
    facilities = [],
    bookingToday = todayStr(),
    bookingCalendar,
}: BookingSectionProps) {
    const page = usePage<PageProps>();
    const { auth } = page.props;
    const { openAuth } = useAuthFlow();
    const deepLinkFacilityKey = useMemo(
        () =>
            new URL(page.url, "http://localhost").searchParams
                .get("facility")
                ?.trim() ?? "",
        [page.url],
    );
    const initialCalendarMetadata = useMemo(
        () => normalizeBookingCalendar(bookingCalendar, bookingToday),
        [bookingCalendar, bookingToday],
    );
    const [openId, setOpenId] = useState<string>("");
    const [globalDate, setGlobalDate] = useState(
        () => initialCalendarMetadata.defaultDate || bookingToday,
    );
    const [slotCart, setSlotCart] = useState<PublicSlotCartItem[]>([]);
    const [cartHydrated, setCartHydrated] = useState(false);
    const [slots, setSlots] = useState<Record<string, ApiSlot[]>>({});
    const [loadingSlot, setLoadingSlot] = useState<Record<string, boolean>>({});
    const [slotError, setSlotError] = useState<Record<string, string | null>>({});
    const [selectedUnits, setSelectedUnits] = useState<
        Record<string, number | null>
    >({});
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [locationFilter, setLocationFilter] = useState("all");
    const [timePreset, setTimePreset] = useState<BookingTimePreset>("all");
    const [selectedStartTimes, setSelectedStartTimes] = useState<string[]>([]);
    const [availableOnly, setAvailableOnly] = useState(false);
    const deferredQuery = useDeferredValue(query);
    const slotCacheRef = useRef<
        Record<
            string,
            { slots: ApiSlot[]; error: string | null; fetchedAt: number }
        >
    >({});
    const slotRequestsRef = useRef<Map<string, AbortController>>(new Map());
    const activeSlotRequestKeyRef = useRef<string | null>(null);
    const cursorPreviewRef = useRef<BookingCursorPreviewHandle>(null);
    const directoryRef = useRef<HTMLDivElement>(null);
    const directoryScrollAnchorRef = useRef<DirectoryScrollAnchor | null>(null);
    const autoRecommendedDateRef = useRef<string | null>(null);
    const deepLinkScrollCompletedRef = useRef(false);
    const checkoutRequestInFlightRef = useRef(false);
    const observedCheckoutScopeRef = useRef<string | null>(null);
    const slotCartRef = useRef(slotCart);
    const authenticatedUserIdRef = useRef(auth.user?.id ?? null);

    slotCartRef.current = slotCart;
    authenticatedUserIdRef.current = auth.user?.id ?? null;

    useEffect(() => {
        setSlotCart(readStoredBookingCart());
        setCartHydrated(true);
    }, []);

    useEffect(() => {
        if (!cartHydrated) return;
        syncStoredBookingCart(slotCart);
    }, [cartHydrated, slotCart]);

    const checkoutCartIdentity = useMemo(
        () => canonicalBookingCheckoutCart(slotCart),
        [slotCart],
    );
    const checkoutIntentScope = useMemo(
        () =>
            cartHydrated && auth.user && slotCart.length > 0
                ? bookingCheckoutIntentScope(auth.user.id, slotCart)
                : null,
        [auth.user?.id, cartHydrated, checkoutCartIdentity, slotCart],
    );

    useEffect(() => {
        if (!cartHydrated) return;

        const previousScope = observedCheckoutScopeRef.current;
        if (previousScope && previousScope !== checkoutIntentScope) {
            const previousIntent = readBookingCheckoutIntent(previousScope);
            clearBookingCheckoutIntent(
                previousIntent ?? { scope: previousScope },
            );
        }

        observedCheckoutScopeRef.current = checkoutIntentScope;
    }, [cartHydrated, checkoutIntentScope]);

    const releaseDirectoryScrollAnchor = useCallback(() => {
        directoryScrollAnchorRef.current = null;
        directoryRef.current?.removeAttribute("data-scroll-stabilizing");
    }, []);

    const beginDirectoryScrollAnchor = useCallback(
        (trigger: HTMLButtonElement) => {
            if (typeof window === "undefined" || !trigger.isConnected) {
                return;
            }

            releaseDirectoryScrollAnchor();
            directoryScrollAnchorRef.current = {
                triggerId: trigger.id,
                viewportTop: viewportRelativeTop(trigger),
            };

            directoryRef.current?.setAttribute(
                "data-scroll-stabilizing",
                "true",
            );
        },
        [releaseDirectoryScrollAnchor],
    );

    useEffect(
        () => () => {
            releaseDirectoryScrollAnchor();
        },
        [releaseDirectoryScrollAnchor],
    );

    useLayoutEffect(() => {
        const anchor = directoryScrollAnchorRef.current;

        if (!anchor) {
            return;
        }

        const trigger = document.getElementById(anchor.triggerId);

        if (trigger instanceof HTMLElement && trigger.isConnected) {
            const delta = viewportRelativeTop(trigger) - anchor.viewportTop;

            if (Math.abs(delta) >= 0.5) {
                const root = document.documentElement;
                const maximumScroll = Math.max(
                    0,
                    root.scrollHeight - window.innerHeight,
                );

                scrollWindowToImmediate(
                    Math.min(
                        maximumScroll,
                        Math.max(0, window.scrollY + delta),
                    ),
                );
            }
        }

        releaseDirectoryScrollAnchor();
    }, [openId, releaseDirectoryScrollAnchor]);

    const {
        selectedEntry: selectedAvailabilityEntry,
        dateSummaries,
        venueToday,
        setVisibleDates,
        ensureDate: ensureAvailabilityDate,
        refreshSelected: refreshAvailability,
        calendarPayload,
    } = useBookingAvailability(globalDate, bookingToday, bookingCalendar);
    const { metadata: calendarMetadata } = useBookingCalendar(
        bookingCalendar,
        calendarPayload,
        venueToday,
    );
    const selectedCalendarState = useMemo(
        () => bookingCalendarDateState(calendarMetadata, globalDate),
        [calendarMetadata, globalDate],
    );
    const calendarClosureReason: BookingCalendarClosureReason =
        selectedCalendarState.reason;
    const calendarDateClosed =
        !selectedCalendarState.bookable &&
        calendarClosureReason !== "past";

    const facilityKindLabels = useMemo(
        () => facilities.map(facilityKindLabelFor),
        [facilities],
    );
    const locationLabels = useMemo(
        () =>
            facilities.map(
                (facility) =>
                    facility.location?.trim() || "Lokasi belum ditentukan",
            ),
        [facilities],
    );

    const categoryOptions = useMemo(
        () =>
            buildFilterOptions(
                facilityKindLabels,
                "Semua kategori",
                BOOKING_FACILITY_KIND_ORDER,
            ),
        [facilityKindLabels],
    );
    const locationOptions = useMemo(
        () => buildFilterOptions(locationLabels, "Semua lokasi"),
        [locationLabels],
    );

    useEffect(() => {
        if (globalDate < venueToday) {
            setGlobalDate(venueToday);
        }
    }, [globalDate, venueToday]);

    const bookingsData = useMemo<BookingFacility[]>(
        () =>
            facilities.map((facility, index) => {
                const facilityKey = String(facility.id);
                const units = facility.units ?? [];
                const storedUnitId = selectedUnits[facilityKey];
                const selectedUnitId =
                    typeof storedUnitId === "number" &&
                    units.some((unit) => unit.id === storedUnitId)
                    ? storedUnitId
                    : (units[0]?.id ?? null);
                const apiSlots =
                    slots[
                        slotKeyFor(facility.id, globalDate, selectedUnitId)
                    ] ?? [];
                const facilityAvailability =
                    selectedAvailabilityEntry?.data?.facilities.find(
                        (summary) => summary.facility_id === facility.id,
                    );
                const policyClosedReason = calendarDateClosed
                    ? calendarClosureReason
                    : null;
                const gallerySeen = new Set<string>();
                const gallery = (facility.booking_gallery ?? []).filter(
                    (image) => {
                        const key = image.id || image.src;

                        if (!image.src || gallerySeen.has(key)) {
                            return false;
                        }

                        gallerySeen.add(key);
                        return true;
                    },
                );
                const primaryImage =
                    facility.image ||
                    gallery[0]?.src ||
                    "/assets/images/comingsoon.avif";

                if (gallery.length === 0) {
                    gallery.push({
                        id: `fallback:${facility.id}`,
                        src: primaryImage,
                        alt: facility.name,
                        source: "fallback",
                        unit_id: null,
                        unit_name: null,
                    });
                }

                return {
                    id: String(facility.id),
                    facilityId: facility.id,
                    title: `/${facility.name}`,
                    code:
                        facility.class_code ??
                        `/Arena ${String(index + 1).padStart(3, "0")}/`,
                    image: primaryImage,
                    gallery,
                    badgeLocation:
                        facility.location?.trim() ||
                        "Lokasi belum ditentukan",
                    badgeType: facility.venue_type ?? facility.category,
                    sport: sportLabelFor(facility),
                    filterCategory: facilityKindLabelFor(facility),
                    category: facility.category,
                    units,
                    selectedUnitId,
                    availableSlots: apiSlots.map((slot) => ({
                        start_time: slot.start_time,
                        end_time: slot.end_time,
                        time: slot.label,
                        price: slot.price,
                        priceAmount: priceStringToAmount(slot.price),
                        status: slot.status,
                        reason: slot.reason ?? null,
                        remaining: slot.remaining,
                        facilityUnitId: slot.facility_unit_id ?? null,
                    })),
                    availability: {
                        state: policyClosedReason
                            ? "ready"
                            : (selectedAvailabilityEntry?.state ?? "loading"),
                        status: policyClosedReason
                            ? "closed"
                            : (facilityAvailability?.status ?? null),
                        reason:
                            policyClosedReason ??
                            facilityAvailability?.reason ??
                            selectedAvailabilityEntry?.data?.reason ??
                            selectedAvailabilityEntry?.error ??
                            null,
                        availableSlotCount:
                            facilityAvailability?.available_slot_count ?? 0,
                        totalSlotCount:
                            facilityAvailability?.total_slot_count ?? 0,
                        availableStartTimes:
                            facilityAvailability?.available_start_times ?? [],
                        nextAvailableAt:
                            facilityAvailability?.next_available_at ?? null,
                        units: facilityAvailability?.units ?? [],
                        stale:
                            selectedAvailabilityEntry?.state === "error" &&
                            (selectedAvailabilityEntry?.stale ?? false),
                    },
                };
            }),
        [
            facilities,
            calendarClosureReason,
            calendarDateClosed,
            globalDate,
            selectedAvailabilityEntry,
            selectedUnits,
            slots,
        ],
    );

    const visibleBookings = useMemo(() => {
        const normalizedQuery = normalizeSearch(deferredQuery);
        const [minimumMinutes, maximumMinutes] =
            timePreset === "custom"
                ? TIME_PRESET_RANGES.all
                : TIME_PRESET_RANGES[timePreset];
        const hasTimeFilter =
            timePreset !== "all" || selectedStartTimes.length > 0;

        return bookingsData.filter((item) => {
            const matchesCategory =
                categoryFilter === "all" ||
                normalizeSearch(item.filterCategory) === categoryFilter;
            const matchesLocation =
                locationFilter === "all" ||
                normalizeSearch(item.badgeLocation) === locationFilter;
            const searchCorpus = normalizeSearch(
                [
                    item.title,
                    item.sport,
                    item.filterCategory,
                    item.category,
                    item.badgeType,
                    item.badgeLocation,
                    ...item.units.map((unit) => unit.name),
                ].join(" "),
            );
            const matchesQuery =
                normalizedQuery.length === 0 ||
                searchCorpus.includes(normalizedQuery);
            const hasAvailabilityData = item.availability.status !== null;
            const selectedUnitAvailability =
                item.selectedUnitId === null
                    ? null
                    : item.availability.units.find(
                          (unit) =>
                              unit.facility_unit_id === item.selectedUnitId,
                      );
            const scopedAvailableStarts =
                selectedUnitAvailability?.available_start_times ??
                item.availability.availableStartTimes;
            const matchingAvailableStarts = matchingStartTimes(
                scopedAvailableStarts,
                minimumMinutes,
                maximumMinutes,
                selectedStartTimes,
            );
            const matchingAlternativeUnit =
                item.availability.units.length > 0 &&
                item.availability.units.some(
                    (unit) =>
                        unit.available_slot_count > 0 &&
                        matchingStartTimes(
                            unit.available_start_times,
                            minimumMinutes,
                            maximumMinutes,
                            selectedStartTimes,
                        ).length > 0,
                );
            const matchesTimeAvailability =
                !hasTimeFilter ||
                !hasAvailabilityData ||
                matchingAvailableStarts.length > 0 ||
                matchingAlternativeUnit;
            const matchesAvailableOnly =
                !availableOnly ||
                !hasAvailabilityData ||
                (hasTimeFilter
                    ? matchingAvailableStarts.length > 0 ||
                      matchingAlternativeUnit
                    : (selectedUnitAvailability?.available_slot_count ??
                          item.availability.availableSlotCount) > 0 ||
                      matchingAlternativeUnit);

            return (
                matchesCategory &&
                matchesLocation &&
                matchesQuery &&
                matchesTimeAvailability &&
                matchesAvailableOnly
            );
        });
    }, [
        availableOnly,
        bookingsData,
        categoryFilter,
        deferredQuery,
        locationFilter,
        selectedStartTimes,
        timePreset,
    ]);
    const visibleAvailableCount = useMemo(
        () =>
            visibleBookings.filter(
                (item) =>
                    item.availability.status === "available" ||
                    item.availability.status === "limited",
            ).length,
        [visibleBookings],
    );
    const cursorPreviewSources = useMemo(
        () => visibleBookings.map((item) => item.image),
        [visibleBookings],
    );

    useEffect(() => {
        const facilityKey = deepLinkFacilityKey;

        if (!facilityKey) return;

        const target = facilities.find(
            (facility) =>
                facility.slug === facilityKey ||
                String(facility.id) === facilityKey,
        );

        if (!target) return;

        setQuery("");
        setCategoryFilter("all");
        setLocationFilter("all");
        setTimePreset("all");
        setSelectedStartTimes([]);
        setAvailableOnly(false);
        setOpenId(String(target.id));
        deepLinkScrollCompletedRef.current = false;
    }, [deepLinkFacilityKey, facilities]);

    useEffect(() => {
        const facilityKey = deepLinkFacilityKey;

        if (!facilityKey || deepLinkScrollCompletedRef.current) return;

        const target = facilities.find(
            (facility) =>
                facility.slug === facilityKey ||
                String(facility.id) === facilityKey,
        );

        if (!target || openId !== String(target.id)) return;

        let firstFrame = 0;
        let secondFrame = 0;

        firstFrame = window.requestAnimationFrame(() => {
            secondFrame = window.requestAnimationFrame(() => {
                const trigger = document.getElementById(
                    `booking-arena-trigger-${target.id}`,
                );

                if (!(trigger instanceof HTMLElement)) return;

                const navbarOffset =
                    window.innerWidth < 768 ? 92 : 118;
                scrollWindowToSmooth(
                    Math.max(
                        0,
                        window.scrollY +
                            trigger.getBoundingClientRect().top -
                            navbarOffset,
                    ),
                    680,
                );
                deepLinkScrollCompletedRef.current = true;
                trigger.focus({ preventScroll: true });

                if (window.location.hash !== "#booking-content") {
                    const currentUrl = new URL(window.location.href);
                    currentUrl.hash = "booking-content";
                    window.history.replaceState(
                        window.history.state,
                        "",
                        currentUrl,
                    );
                }
            });
        });

        return () => {
            window.cancelAnimationFrame(firstFrame);
            window.cancelAnimationFrame(secondFrame);
        };
    }, [deepLinkFacilityKey, facilities, openId]);

    const slotFilter = useMemo<BookingSlotFilter>(() => {
        const [minimumMinutes, maximumMinutes] =
            timePreset === "custom"
                ? TIME_PRESET_RANGES.all
                : TIME_PRESET_RANGES[timePreset];

        return {
            minimumMinutes,
            maximumMinutes,
            startTimes: selectedStartTimes,
            availableOnly,
        };
    }, [availableOnly, selectedStartTimes, timePreset]);

    useEffect(() => {
        if (
            openId &&
            !visibleBookings.some((booking) => booking.id === openId)
        ) {
            setOpenId("");
        }
    }, [openId, visibleBookings]);

    useEffect(() => {
        if (
            categoryFilter !== "all" &&
            !categoryOptions.some(
                (option) => option.value === categoryFilter,
            )
        ) {
            setCategoryFilter("all");
        }
    }, [categoryFilter, categoryOptions]);

    useEffect(() => {
        if (
            locationFilter !== "all" &&
            !locationOptions.some(
                (option) => option.value === locationFilter,
            )
        ) {
            setLocationFilter("all");
        }
    }, [locationFilter, locationOptions]);

    useEffect(() => {
        const availability = selectedAvailabilityEntry?.data;
        const [minimumMinutes, maximumMinutes] =
            timePreset === "custom"
                ? TIME_PRESET_RANGES.all
                : TIME_PRESET_RANGES[timePreset];
        const hasTimeFilter =
            timePreset !== "all" || selectedStartTimes.length > 0;
        const recommendationKey = [
            availability?.date,
            selectedAvailabilityEntry?.fetchedAt ?? 0,
            timePreset,
            selectedStartTimes.join(","),
        ].join(":");

        if (
            calendarDateClosed ||
            !availability ||
            availability.closed ||
            autoRecommendedDateRef.current === recommendationKey
        ) {
            return;
        }
        autoRecommendedDateRef.current = recommendationKey;

        setSelectedUnits((current) => {
            let changed = false;
            const next = { ...current };

            availability.facilities.forEach((facilitySummary) => {
                if (facilitySummary.units.length === 0) return;

                const key = String(facilitySummary.facility_id);
                const currentUnitId =
                    current[key] ??
                    facilities
                        .find(
                            (facility) =>
                                facility.id === facilitySummary.facility_id,
                        )
                        ?.units?.[0]?.id ??
                    null;
                const currentUnit = facilitySummary.units.find(
                    (unit) => unit.facility_unit_id === currentUnitId,
                );
                const unitMatchesCurrentFilter = (
                    unit: (typeof facilitySummary.units)[number],
                ) =>
                    unit.available_slot_count > 0 &&
                    (!hasTimeFilter ||
                        matchingStartTimes(
                            unit.available_start_times,
                            minimumMinutes,
                            maximumMinutes,
                            selectedStartTimes,
                        ).length > 0);

                if (currentUnit && unitMatchesCurrentFilter(currentUnit)) {
                    return;
                }

                const recommendedUnit = facilitySummary.units.find(
                    unitMatchesCurrentFilter,
                );
                if (
                    recommendedUnit &&
                    recommendedUnit.facility_unit_id !== currentUnitId
                ) {
                    next[key] = recommendedUnit.facility_unit_id;
                    changed = true;
                }
            });

            return changed ? next : current;
        });
    }, [
        calendarDateClosed,
        facilities,
        selectedAvailabilityEntry?.data,
        selectedAvailabilityEntry?.fetchedAt,
        selectedStartTimes,
        timePreset,
    ]);

    const fetchSlots = useCallback(
        async (
            facilityId: number,
            date: string,
            facilityUnitId?: number | null,
            options: { force?: boolean; silent?: boolean } = {},
        ) => {
            const key = slotKeyFor(facilityId, date, facilityUnitId);
            const cached = slotCacheRef.current[key];

            if (
                !options.force &&
                cached &&
                Date.now() - cached.fetchedAt < SLOT_CACHE_TTL_MS
            ) {
                setSlots((current) => ({
                    ...current,
                    [key]: cached.slots,
                }));
                setSlotError((current) => ({
                    ...current,
                    [key]: cached.error,
                }));
                return;
            }

            const pendingRequest = slotRequestsRef.current.get(key);
            if (pendingRequest) {
                return;
            }

            const controller = new AbortController();
            slotRequestsRef.current.set(key, controller);
            if (!options.silent || !cached) {
                setLoadingSlot((current) => ({ ...current, [key]: true }));
            }
            setSlotError((current) => ({ ...current, [key]: null }));

            try {
                const response = await axios.get(route("booking.slots"), {
                    signal: controller.signal,
                    timeout: SLOT_REQUEST_TIMEOUT_MS,
                    params: {
                        facility_id: facilityId,
                        date,
                        ...(facilityUnitId !== null &&
                        facilityUnitId !== undefined
                            ? { facility_unit_id: facilityUnitId }
                            : {}),
                    },
                });

                let nextSlots: ApiSlot[] = [];
                let nextError: string | null = null;

                if (response.data.closed) {
                    nextError =
                        response.data.reason === "month_closed"
                            ? "Bulan ini belum dibuka untuk reservasi."
                            : "Fasilitas tutup pada tanggal ini.";
                } else if (response.data.requires_unit) {
                    nextError =
                        "Pilih unit fasilitas untuk melihat jadwal.";
                } else {
                    const responseSlots: unknown = response.data.slots;
                    if (
                        !Array.isArray(responseSlots) ||
                        !responseSlots.every(isApiSlot)
                    ) {
                        throw new Error("Invalid booking slot response");
                    }
                    nextSlots = responseSlots;
                }

                slotCacheRef.current[key] = {
                    slots: nextSlots,
                    error: nextError,
                    fetchedAt: Date.now(),
                };
                setSlots((current) => ({
                    ...current,
                    [key]: nextSlots,
                }));
                setSlotError((current) => ({
                    ...current,
                    [key]: nextError,
                }));
            } catch (error) {
                if (axios.isCancel(error) || controller.signal.aborted) return;

                const nextError = "Gagal memuat jadwal. Coba lagi.";
                setSlots((current) => ({ ...current, [key]: [] }));
                setSlotError((current) => ({
                    ...current,
                    [key]: nextError,
                }));
            } finally {
                if (slotRequestsRef.current.get(key) === controller) {
                    slotRequestsRef.current.delete(key);
                    setLoadingSlot((current) => ({
                        ...current,
                        [key]: false,
                    }));
                }
            }
        },
        [],
    );

    const cancelSlotRequest = useCallback((key: string | null) => {
        if (!key) return;

        const controller = slotRequestsRef.current.get(key);
        if (!controller) return;

        /*
         * Release the dedupe entry before aborting. A rapid A → B → A switch
         * can then start a fresh A request even before the old request's
         * rejection reaches its finally block.
         */
        slotRequestsRef.current.delete(key);
        controller.abort();

        setLoadingSlot((current) => {
            if (slotRequestsRef.current.has(key) || !current[key]) {
                return current;
            }

            return { ...current, [key]: false };
        });
    }, []);

    useEffect(
        () => () => {
            slotRequestsRef.current.forEach((controller) =>
                controller.abort(),
            );
            slotRequestsRef.current.clear();
        },
        [],
    );

    const activeBooking = bookingsData.find((item) => item.id === openId);
    const activeFacilityId = activeBooking?.facilityId;
    const activeUnitId = activeBooking?.selectedUnitId;
    const activeSlotKey = activeFacilityId
        ? slotKeyFor(activeFacilityId, globalDate, activeUnitId)
        : null;
    const requestableActiveSlotKey = calendarDateClosed ? null : activeSlotKey;
    const activeAvailabilityVersion =
        selectedAvailabilityEntry?.data?.date === globalDate
            ? (selectedAvailabilityEntry.fetchedAt ?? 0)
            : 0;

    useEffect(() => {
        const previousKey = activeSlotRequestKeyRef.current;

        if (previousKey && previousKey !== requestableActiveSlotKey) {
            cancelSlotRequest(previousKey);
        }

        activeSlotRequestKeyRef.current = requestableActiveSlotKey;
    }, [cancelSlotRequest, requestableActiveSlotKey]);

    useEffect(() => {
        if (!activeFacilityId || !requestableActiveSlotKey) return;

        void fetchSlots(activeFacilityId, globalDate, activeUnitId, {
            silent: true,
        });
    }, [
        activeFacilityId,
        activeAvailabilityVersion,
        activeUnitId,
        fetchSlots,
        globalDate,
        requestableActiveSlotKey,
    ]);

    useEffect(() => {
        const availability = selectedAvailabilityEntry?.data;
        if (
            !selectedAvailabilityEntry ||
            !availability ||
            availability.date !== globalDate ||
            selectedAvailabilityEntry.fetchedAt <= 0
        ) {
            return;
        }

        setSlotCart((current) => {
            const next = current.filter((cartItem) => {
                if (cartItem.booking_date !== availability.date) return true;

                const facilitySummary = availability.facilities.find(
                    (facility) =>
                        facility.facility_id === cartItem.facility_id,
                );
                if (!facilitySummary) return false;

                const scopedSummary =
                    cartItem.facility_unit_id === null
                        ? facilitySummary
                        : facilitySummary.units.find(
                              (unit) =>
                                  unit.facility_unit_id ===
                                  cartItem.facility_unit_id,
                          );

                if (
                    !scopedSummary ||
                    (scopedSummary.status !== "available" &&
                        scopedSummary.status !== "limited")
                ) {
                    return false;
                }

                return scopedSummary.available_start_times.includes(
                    cartItem.start_time.slice(0, 5),
                );
            });

            return next.length === current.length ? current : next;
        });
    }, [
        globalDate,
        selectedAvailabilityEntry?.data,
        selectedAvailabilityEntry?.fetchedAt,
    ]);

    const activeDetailedSlots = activeSlotKey
        ? slots[activeSlotKey]
        : undefined;
    const activeDetailedSlotError = activeSlotKey
        ? slotError[activeSlotKey]
        : null;
    const activeDetailedSlotLoading = activeSlotKey
        ? Boolean(loadingSlot[activeSlotKey])
        : false;

    useEffect(() => {
        if (
            !activeFacilityId ||
            !activeSlotKey ||
            !activeDetailedSlots ||
            activeDetailedSlotError ||
            activeDetailedSlotLoading
        ) {
            return;
        }

        setSlotCart((current) => {
            const next = current.filter((cartItem) => {
                const belongsToActiveDetail =
                    cartItem.facility_id === activeFacilityId &&
                    cartItem.booking_date === globalDate &&
                    (cartItem.facility_unit_id ?? null) ===
                        (activeUnitId ?? null);

                if (!belongsToActiveDetail) return true;

                return activeDetailedSlots.some(
                    (slot) =>
                        slot.start_time === cartItem.start_time &&
                        slot.end_time === cartItem.end_time &&
                        slot.status === "available" &&
                        slot.remaining > 0,
                );
            });

            return next.length === current.length ? current : next;
        });
    }, [
        activeDetailedSlotError,
        activeDetailedSlotLoading,
        activeDetailedSlots,
        activeFacilityId,
        activeSlotKey,
        activeUnitId,
        globalDate,
    ]);

    const handleToggle = (
        item: BookingFacility,
        trigger: HTMLButtonElement,
    ) => {
        cursorPreviewRef.current?.hide(true);
        beginDirectoryScrollAnchor(trigger);
        const isOpening = openId !== item.id;
        setOpenId(isOpening ? item.id : "");

        if (!isOpening) return;

        const facilityKey = String(item.facilityId);
        const nextUnitId = item.selectedUnitId ?? item.units[0]?.id ?? null;

        if (nextUnitId && selectedUnits[facilityKey] !== nextUnitId) {
            setSelectedUnits((current) => ({
                ...current,
                [facilityKey]: nextUnitId,
            }));
        }
    };

    const updateCursorPreview = (
        item: BookingFacility,
        event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
        if (openId === item.id) {
            cursorPreviewRef.current?.hide(true);
            return;
        }

        cursorPreviewRef.current?.show(
            {
                id: item.id,
                image: item.image,
                title: item.title,
                code: item.code,
            },
            {
                x: event.clientX,
                y: event.clientY,
                pointerType: event.pointerType,
            },
        );
    };

    const handleGlobalDateChange = (newDate: string) => {
        cursorPreviewRef.current?.hide(true);
        setGlobalDate(newDate);
        const nextCalendarState = bookingCalendarDateState(
            calendarMetadata,
            newDate,
        );
        if (nextCalendarState.bookable) {
            ensureAvailabilityDate(newDate);
        }
    };

    const handleUnitChange = (item: BookingFacility, unitId: number) => {
        const facilityKey = String(item.facilityId);
        setSelectedUnits((current) => ({
            ...current,
            [facilityKey]: unitId,
        }));
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

    const resetFilters = () => {
        setQuery("");
        setCategoryFilter("all");
        setLocationFilter("all");
        setTimePreset("all");
        setSelectedStartTimes([]);
        setAvailableOnly(false);
    };

    const handleCheckoutIntent = async () => {
        if (slotCart.length === 0) return;

        syncStoredBookingCart(slotCart);

        if (!auth.user) {
            const returnUrl = new URL(window.location.href);
            returnUrl.hash = "booking-content";
            const returnTo = `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`;
            openAuth({
                view: "login",
                returnTo,
            });
            return;
        }

        if (checkoutRequestInFlightRef.current) return;
        checkoutRequestInFlightRef.current = true;

        const submittedCart = slotCart;
        const submittedCartIdentity = canonicalBookingCheckoutCart(submittedCart);
        const submittedUser = auth.user;
        let requestStarted = false;

        try {
            const intent = await getOrCreateBookingCheckoutIntent(
                submittedUser.id,
                submittedCart,
            );

            const cartStillMatches =
                canonicalBookingCheckoutCart(slotCartRef.current) ===
                submittedCartIdentity;
            const userStillMatches =
                authenticatedUserIdRef.current === submittedUser.id;

            if (!cartStillMatches || !userStillMatches) {
                clearBookingCheckoutIntent(intent);
                return;
            }

            router.post(
                route("checkout.booking.store"),
                {
                    idempotency_key: intent.idempotencyKey,
                    items: submittedCart.map((item) => ({
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
                    customer_name: submittedUser.name,
                    whatsapp_number: submittedUser.phone_number ?? "",
                    identity_category:
                        submittedUser.identity_category === "warga_kampus"
                            ? "warga_ub"
                            : "umum",
                    identity_number: submittedUser.identity_number ?? "",
                },
                {
                    preserveScroll: true,
                    onSuccess: (page) => {
                        const checkoutUrl = new URL(
                            page.url,
                            window.location.origin,
                        );
                        const reachedBookingCheckout =
                            page.component ===
                                "Checkout/BookingCheckoutPage" &&
                            /^\/checkout\/booking\/[^/]+\/?$/.test(
                                checkoutUrl.pathname,
                            );

                        if (!reachedBookingCheckout) return;

                        clearBookingCheckoutIntent(intent);
                        observedCheckoutScopeRef.current = null;
                        syncStoredBookingCart([]);
                        setSlotCart([]);
                    },
                    onFinish: () => {
                        checkoutRequestInFlightRef.current = false;
                    },
                },
            );
            requestStarted = true;
        } finally {
            if (!requestStarted) {
                checkoutRequestInFlightRef.current = false;
            }
        }
    };

    return (
        <section
            className={`booking-section${slotCart.length > 0 ? " has-cart" : ""}`}
            id="booking-content"
        >
            <div className="booking-section__content-shell">
                <SectionDivider
                    number="01"
                    title="Reservasi Arena"
                    subtitle="06 bookingpage"
                    theme="light"
                    lineWeight="hairline"
                />

                <div
                    className="booking-fuel-intro"
                    aria-labelledby="booking-section-heading"
                >
                    <div className="booking-fuel-intro__aside">
                        <div className="booking-fuel-intro__kicker">
                            <span
                                className="section-label-diamond"
                                aria-hidden="true"
                            />
                            <ScrollTextReveal
                                delay={80}
                                className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
                            >
                                Pilih Fasilitas
                            </ScrollTextReveal>
                        </div>
                        <span className="booking-fuel-intro__edition">
                            RES—26&apos;
                        </span>
                        <ReservasiButton
                            label="Lihat Daftar Harga"
                            href="/pricing"
                        />
                    </div>

                    <div className="booking-fuel-intro__statement">
                        <PricingSectionHeadline
                            id="booking-section-heading"
                            className="booking-fuel-intro__headline"
                        >
                            {BOOKING_SECTION_HEADLINE}
                        </PricingSectionHeadline>

                        <p className="booking-fuel-intro__support">
                            {BOOKING_SECTION_SUPPORT}
                        </p>

                        <ol
                            className="booking-fuel-intro__steps"
                            aria-label="Langkah reservasi"
                        >
                            <li>
                                <span>01/</span>
                                <strong>Pilih arena</strong>
                            </li>
                            <li>
                                <span>02/</span>
                                <strong>Tentukan waktu</strong>
                            </li>
                            <li>
                                <span>03/</span>
                                <strong>Konfirmasi slot</strong>
                            </li>
                        </ol>
                    </div>
                </div>

                <div className="booking-discovery-shell">
                    <BookingDiscoveryBar
                        value={globalDate}
                        onDateChange={handleGlobalDateChange}
                        minDate={venueToday}
                        calendarMetadata={calendarMetadata}
                        dateSummaries={dateSummaries}
                        onVisibleDatesChange={setVisibleDates}
                        onRetryAvailability={refreshAvailability}
                        query={query}
                        onQueryChange={setQuery}
                        category={categoryFilter}
                        onCategoryChange={setCategoryFilter}
                        location={locationFilter}
                        onLocationChange={setLocationFilter}
                        timePreset={timePreset}
                        onTimePresetChange={setTimePreset}
                        selectedStartTimes={selectedStartTimes}
                        onSelectedStartTimesChange={setSelectedStartTimes}
                        availableOnly={availableOnly}
                        onAvailableOnlyChange={setAvailableOnly}
                        categories={categoryOptions}
                        locations={locationOptions}
                        resultCount={visibleBookings.length}
                        totalCount={bookingsData.length}
                        onReset={resetFilters}
                    />
                </div>

                <div className="booking-directory-header">
                    <span>
                        (Arena / {formatCompactBookingDate(globalDate)})
                    </span>
                    <span>
                        {String(visibleBookings.length).padStart(2, "0")} tampil
                        {selectedAvailabilityEntry?.data &&
                            ` · ${String(
                                visibleAvailableCount,
                            ).padStart(2, "0")} tersedia`}
                    </span>
                    <span>
                        {calendarDateClosed
                            ? "(Reservasi tutup)"
                            : selectedAvailabilityEntry?.state === "loading"
                            ? "(Memeriksa jadwal)"
                            : selectedAvailabilityEntry?.data?.closed
                              ? "(Reservasi tutup)"
                              : selectedAvailabilityEntry?.data
                                ? `(${selectedAvailabilityEntry.data.summary.available_slot_count} jadwal +)`
                                : "(Buka jadwal +)"}
                    </span>
                </div>

                <div
                    ref={directoryRef}
                    className="booking-directory"
                    aria-busy={
                        !selectedAvailabilityEntry ||
                        (selectedAvailabilityEntry.state === "loading" &&
                            !selectedAvailabilityEntry.data)
                    }
                    onPointerLeave={() =>
                        cursorPreviewRef.current?.hide(true)
                    }
                >
                    {visibleBookings.map((item) => {
                        const key = slotKeyFor(
                            item.facilityId,
                            globalDate,
                            item.selectedUnitId,
                        );
                        const selectedSlotCount = slotCart.filter(
                            (slot) =>
                                slot.facility_id === item.facilityId &&
                                slot.booking_date === globalDate,
                        ).length;
                        const selectedUnitSlotCount = slotCart.filter(
                            (slot) =>
                                slot.facility_id === item.facilityId &&
                                slot.booking_date === globalDate &&
                                slot.facility_unit_id ===
                                    item.selectedUnitId,
                        ).length;
                        const hasDetailedSlots =
                            Object.prototype.hasOwnProperty.call(slots, key);
                        const isDetailedSlotLoading =
                            !calendarDateClosed &&
                            (Boolean(loadingSlot[key]) ||
                                (openId === item.id &&
                                    !hasDetailedSlots &&
                                    !slotError[key]));

                        return (
                            <BookingListItem
                                key={item.facilityId}
                                item={item}
                                isOpen={openId === item.id}
                                onToggle={(trigger) =>
                                    handleToggle(item, trigger)
                                }
                                onPreviewPointerEnter={(event) =>
                                    updateCursorPreview(item, event)
                                }
                                onPreviewPointerMove={(event) =>
                                    updateCursorPreview(item, event)
                                }
                                onPreviewPointerLeave={() =>
                                    cursorPreviewRef.current?.hide()
                                }
                                onPreviewPointerDown={() =>
                                    cursorPreviewRef.current?.hide(true)
                                }
                                onUnitChange={(unitId) =>
                                    handleUnitChange(item, unitId)
                                }
                                selectedDate={globalDate}
                                selectedSlotKeys={selectedSlotKeys}
                                onToggleSlot={toggleSlotCart}
                                loadingSlots={isDetailedSlotLoading}
                                slotError={slotError[key] ?? null}
                                slotFilter={slotFilter}
                                selectedSlotCount={selectedSlotCount}
                                selectedUnitSlotCount={
                                    selectedUnitSlotCount
                                }
                                onRetrySlots={() =>
                                    calendarDateClosed
                                        ? undefined
                                        : void fetchSlots(
                                              item.facilityId,
                                              globalDate,
                                              item.selectedUnitId,
                                              { force: true },
                                          )
                                }
                            />
                        );
                    })}
                </div>

                {visibleBookings.length === 0 && (
                    <div className="booking-empty-state">
                        <SearchX aria-hidden="true" />
                        <div>
                            <h3>
                                {selectedAvailabilityEntry?.data &&
                                (availableOnly ||
                                    timePreset !== "all" ||
                                    selectedStartTimes.length > 0)
                                    ? "Tidak ada jadwal pada waktu ini."
                                    : "Tidak ada arena yang cocok."}
                            </h3>
                            <p>
                                {selectedAvailabilityEntry?.data &&
                                (availableOnly ||
                                    timePreset !== "all" ||
                                    selectedStartTimes.length > 0)
                                    ? "Pilih rentang waktu lain atau tampilkan seluruh arena."
                                    : "Ubah pencarian atau bersihkan filter aktif."}
                            </p>
                        </div>
                        <button type="button" onClick={resetFilters}>
                            <RotateCcw aria-hidden="true" />
                            Reset filter
                        </button>
                    </div>
                )}
            </div>

            <BookingCursorPreview
                ref={cursorPreviewRef}
                sources={cursorPreviewSources}
            />

            {slotCart.length > 0 && (
                <div
                    className="booking-cart-bar"
                    role="region"
                    aria-label="Keranjang reservasi"
                >
                    <div
                        className="booking-cart-bar__summary"
                        aria-live="polite"
                    >
                        <span>Keranjang / 03</span>
                        <strong>{slotCart.length} slot dipilih</strong>
                        <small>
                            {slotCart[0].facility_name} ·{" "}
                            {formatCompactBookingDate(
                                slotCart[0].booking_date,
                            )}{" "}
                            · {slotCart[0].label}
                        </small>
                    </div>
                    <div className="booking-cart-bar__total">
                        <span>Estimasi</span>
                        <strong>
                            Rp {cartSubtotal.toLocaleString("id-ID")}
                        </strong>
                    </div>
                    <div className="booking-cart-bar__actions">
                        <button
                            type="button"
                            className="booking-cart-bar__clear"
                            onClick={() => setSlotCart([])}
                        >
                            Kosongkan
                        </button>
                        <button
                            type="button"
                            className="booking-cart-bar__checkout"
                            onClick={handleCheckoutIntent}
                        >
                            <span>Mulai reservasi</span>
                            <ArrowRight aria-hidden="true" />
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
