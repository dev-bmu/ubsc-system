import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import SectionDivider from "@/Components/Landing/SectionDivider";
import FacilityBadge from "@/Components/Landing/FacilityBadge";
import { isOutdoorFacility } from "@/lib/facilityClassification";
import { ArrowRight as AccentArrowRight, Clock3 } from "lucide-react";
import {
    type CSSProperties,
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

interface PricingPeriod {
    label: string;
    wargaPrice: string;
    umumPrice: string;
}

interface FacilityPricing {
    id: string;
    name: string;
    classCode: string;
    periods: PricingPeriod[];
    additionalDetails: string[];
    timeSlot: string;
    badgeLocation: string;
    badgeType: string;
    image: string;
}

interface FacilityDisplayMetadata {
    periods?: unknown[];
    additionalDetails?: unknown[];
    pricingPresentation?: {
        indoorPeriods?: unknown[];
    };
}

type ActiveSlots = Record<string, string[]>;

interface BackendPrice {
    id?: number | string;
    user_category?: string | null;
    label?: string | null;
    price?: number | string | null;
    duration_minutes?: number | null;
    schedule_type?: string | null;
    applicable_days?: string[] | null;
    starts_at?: string | null;
    ends_at?: string | null;
    starts_on?: string | null;
    ends_on?: string | null;
    notes?: string | null;
    sort_order?: number | null;
}

interface BackendUnit {
    use_custom_schedule?: boolean | null;
    active_slots?: ActiveSlots | null;
    use_custom_pricing?: boolean | null;
    prices?: BackendPrice[];
}

interface BackendFacility {
    id: number;
    name: string;
    slug: string;
    image: string;
    category: string;
    location?: string | null;
    venue_type?: string | null;
    active_slots?: ActiveSlots | null;
    class_code?: string | null;
    rating?: number | null;
    display_metadata?: Record<string, unknown> | null;
    prices?: BackendPrice[];
    units?: BackendUnit[];
}

interface Props {
    facilities?: BackendFacility[];
}

interface ParsedPrice {
    amount: string;
    unit: string;
}

interface ParsedDetail extends ParsedPrice {
    label: string;
}

interface ParsedScheduleWindow {
    startPercent: number;
    endPercent: number;
    primaryWidth: number;
    secondaryWidth: number;
}

interface PanelDragState {
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    axis: "pending" | "horizontal" | "vertical";
}

interface SelectorViewportState {
    canScrollLeft: boolean;
    canScrollRight: boolean;
    thumbStart: number;
    thumbSize: number;
}

type PanelTransitionPhase = "enter" | "exit";
type PanelTransitionDirection = "next" | "previous";

const SECTION_CONTAINER_CLASS =
    "mx-auto w-full px-[clamp(1.5rem,2.7vw,5.5rem)]";
const SECTION_DIVIDER_WRAP_CLASS =
    "mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)] pb-10 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14";
const PRICING_FACILITIES_LABEL = "Jadwal & Tarif Arena Dalam";
const PRICING_FACILITIES_HEADING_LINES = [
    "Atur Jadwal Latihanmu",
    "Mulai Ritme Terbaikmu",
] as const;
const PRICING_FACILITIES_DESCRIPTION =
    "Temukan jadwal dan tarif secara transparan, lalu pilih waktu terbaik untuk berlatih, bertanding, dan menjaga ritme Anda.";

function PricingHeaderFolio() {
    return (
        <div
            className="pfl-header-folio"
            aria-label="Pilih arena dan waktumu"
        >
            <span className="pfl-header-folio__mark">Pilih/</span>
            <span className="pfl-header-folio__copy">
                <span className="pfl-header-folio__eyebrow">Arena</span>
                <span className="pfl-header-folio__label">dan waktumu</span>
            </span>
        </div>
    );
}

function PricingFacilitiesHeadline() {
    const accessibleHeading = PRICING_FACILITIES_HEADING_LINES.join(" ");

    return (
        <h2
            aria-label={accessibleHeading}
            className="home-section-heading pfl-intro__headline section-two-headline-weight font-bdo font-medium text-black"
        >
            {PRICING_FACILITIES_HEADING_LINES.map((line, index) => (
                <span key={line} className="pfl-intro__headline-line">
                    <ScrollTextReveal
                        delay={100 + index * 95}
                        className="pfl-intro__headline-reveal"
                    >
                        {line}
                    </ScrollTextReveal>
                </span>
            ))}
        </h2>
    );
}

const preloadedFacilityImages = new Set<string>();
const facilityImagePreloadTasks = new Map<string, Promise<void>>();

type IdleSchedulerWindow = Window & {
    requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
};

const preloadFacilityImage = (source: string) => {
    if (!source || typeof Image === "undefined") {
        return Promise.resolve();
    }

    if (preloadedFacilityImages.has(source)) {
        return Promise.resolve();
    }

    const pendingTask = facilityImagePreloadTasks.get(source);
    if (pendingTask) return pendingTask;

    const task = new Promise<void>((resolve) => {
        const image = new Image();
        image.decoding = "async";
        image.fetchPriority = "low";

        const finish = () => {
            preloadedFacilityImages.add(source);
            facilityImagePreloadTasks.delete(source);
            image.onload = null;
            image.onerror = null;
            resolve();
        };

        image.onload = () => {
            if (typeof image.decode !== "function") {
                finish();
                return;
            }

            image.decode().catch(() => undefined).finally(finish);
        };
        image.onerror = finish;
        image.src = source;
    });

    facilityImagePreloadTasks.set(source, task);
    return task;
};

const DAY_LABELS: Record<string, string> = {
    monday: "Sen",
    tuesday: "Sel",
    wednesday: "Rab",
    thursday: "Kam",
    friday: "Jum",
    saturday: "Sab",
    sunday: "Min",
};

const normalizeClassCode = (classCode: string) =>
    classCode.replace(/^\/+|\/+$/g, "");

const displayClassCode = (classCode: string) => {
    return normalizeClassCode(classCode);
};

const normalizeWhitespace = (value: string) =>
    value.replace(/\s+/g, " ").trim();

const cleanUnknownText = (value: unknown) =>
    typeof value === "string" || typeof value === "number"
        ? String(value).trim()
        : "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const normalizedAudience = (value: string | null | undefined) =>
    (value ?? "").trim().toLocaleLowerCase("id-ID");

const isCampusAudience = (value: string | null | undefined) =>
    /warga|kampus|mahasiswa|dosen|pegawai|staff|ub/.test(
        normalizedAudience(value),
    );

const isPublicAudience = (value: string | null | undefined) =>
    /umum|public|general|guest|tamu/.test(normalizedAudience(value));

const numericAmount = (value: number | string | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const normalized = cleanUnknownText(value).replace(/[^\d]/g, "");
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const compactAmount = (value: number | string | null | undefined) => {
    const amount = numericAmount(value);
    if (amount === null) return "Hubungi kami";
    if (amount === 0) return "Gratis";
    if (amount % 1000 === 0) return `${amount / 1000}K`;
    return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    })
        .format(amount)
        .replace(/\s/g, "");
};

const durationUnit = (duration: number | null | undefined) => {
    if (!duration || duration <= 0 || duration === 60) return "Jam";
    if (duration % 60 === 0) return `${duration / 60} Jam`;
    return `${duration} Menit`;
};

const priceCardValue = (
    price: BackendPrice | undefined,
    audience: "Warga UB" | "Umum",
) =>
    price
        ? `${audience} ${compactAmount(price.price)}/ ${durationUnit(price.duration_minutes)}`
        : `${audience} Hubungi kami`;

const normalizedPriceLabel = (value: string | null | undefined) => {
    const label = cleanUnknownText(value).toLocaleLowerCase("id-ID");
    return /^(regular|reguler)$/.test(label) ? "reguler" : label;
};

const scheduleKey = (price: BackendPrice) =>
    JSON.stringify({
        label: normalizedPriceLabel(price.label),
        scheduleType: cleanUnknownText(price.schedule_type) || "regular",
        days: [...(price.applicable_days ?? [])].sort(),
        startsAt: cleanUnknownText(price.starts_at),
        endsAt: cleanUnknownText(price.ends_at),
        startsOn: cleanUnknownText(price.starts_on),
        endsOn: cleanUnknownText(price.ends_on),
    });

const displaySchedule = (price: BackendPrice, operatingHours: string) => {
    const scheduleType =
        cleanUnknownText(price.schedule_type).toLocaleLowerCase("id-ID") ||
        "regular";
    const days = (price.applicable_days ?? [])
        .map(
            (day) =>
                DAY_LABELS[day.toLocaleLowerCase("id-ID")] ?? day.slice(0, 3),
        )
        .filter(Boolean)
        .join(", ");
    const startsAt = cleanUnknownText(price.starts_at).slice(0, 5).replace(":", ".");
    const endsAt = cleanUnknownText(price.ends_at).slice(0, 5).replace(":", ".");
    const time = startsAt && endsAt ? `${startsAt} - ${endsAt}` : "";
    const dateRange =
        cleanUnknownText(price.starts_on) && cleanUnknownText(price.ends_on)
            ? `${cleanUnknownText(price.starts_on)} - ${cleanUnknownText(price.ends_on)}`
            : "";

    if (scheduleType === "regular") return operatingHours;
    return [days, time, dateRange].filter(Boolean).join(" · ");
};

const periodsFromPrices = (
    prices: BackendPrice[] | undefined,
    operatingHours: string,
): PricingPeriod[] => {
    if (!Array.isArray(prices) || prices.length === 0) return [];

    const groups = new Map<
        string,
        { first: BackendPrice; prices: BackendPrice[]; order: number }
    >();

    [...prices]
        .sort(
            (left, right) =>
                (left.sort_order ?? Number.MAX_SAFE_INTEGER) -
                (right.sort_order ?? Number.MAX_SAFE_INTEGER),
        )
        .forEach((price, index) => {
            const key = scheduleKey(price);
            const current = groups.get(key);
            if (current) {
                current.prices.push(price);
            } else {
                groups.set(key, { first: price, prices: [price], order: index });
            }
        });

    return Array.from(groups.values())
        .sort((left, right) => left.order - right.order)
        .map(({ first, prices: groupedPrices }) => {
            const sourceName = cleanUnknownText(first.label);
            const name =
                /^(regular|reguler)$/i.test(sourceName)
                    ? "Reguler"
                    : sourceName || "Tarif";
            const schedule = displaySchedule(first, operatingHours);
            const campus = groupedPrices.find((price) =>
                isCampusAudience(price.user_category),
            );
            const publicPrice = groupedPrices.find((price) =>
                isPublicAudience(price.user_category),
            );

            return {
                label: schedule ? `${name}/ ${schedule}` : name,
                wargaPrice: priceCardValue(campus, "Warga UB"),
                umumPrice: priceCardValue(publicPrice, "Umum"),
            };
        });
};

const legacyPeriods = (value: unknown[] | undefined): PricingPeriod[] => {
    if (!Array.isArray(value)) return [];

    return value.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const label = cleanUnknownText(entry.label);
        const sharedPrice = cleanUnknownText(entry.harga);
        const wargaPrice = cleanUnknownText(entry.wargaPrice) || sharedPrice;
        const umumPrice = cleanUnknownText(entry.umumPrice) || sharedPrice;
        if (!label || (!wargaPrice && !umumPrice)) return [];

        return [{
            label,
            wargaPrice: wargaPrice || "Warga UB Hubungi kami",
            umumPrice: umumPrice || "Umum Hubungi kami",
        }];
    });
};

const presentationPeriods = (
    value: unknown[] | undefined,
): PricingPeriod[] => {
    if (!Array.isArray(value)) return [];

    return value.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const label = cleanUnknownText(entry.label);
        const wargaPrice = cleanUnknownText(entry.wargaPrice);
        const umumPrice = cleanUnknownText(entry.umumPrice);
        if (!label || (!wargaPrice && !umumPrice)) return [];

        return [{
            label,
            wargaPrice: wargaPrice || "Warga UB Hubungi kami",
            umumPrice: umumPrice || "Umum Hubungi kami",
        }];
    });
};

const publicDetails = (value: unknown[] | undefined): string[] => {
    if (!Array.isArray(value)) return [];

    return value.flatMap((entry) => {
        if (typeof entry === "string" || typeof entry === "number") {
            const text = cleanUnknownText(entry);
            return text ? [text] : [];
        }
        if (!isRecord(entry)) return [];
        const key = cleanUnknownText(entry.key ?? entry.label ?? entry.name);
        const detail = cleanUnknownText(
            entry.value ?? entry.harga ?? entry.price ?? entry.note,
        );
        const combined = [key, detail].filter(Boolean).join(" ");
        return combined ? [combined] : [];
    });
};

const parseBackendTime = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
};

const formatScheduleTime = (minutes: number) => {
    const boundedMinutes = Math.max(0, Math.min(24 * 60, minutes));
    const hours = Math.floor(boundedMinutes / 60);
    const remainder = boundedMinutes % 60;

    return `${String(hours).padStart(2, "0")}.${String(remainder).padStart(2, "0")}`;
};

const resolveSlotDuration = (
    prices: BackendPrice[] | undefined,
    fallback = 60,
) => {
    const availablePrices = prices ?? [];
    const selectedPrice =
        availablePrices.find(
            (price) =>
                price.user_category === "umum" &&
                normalizeWhitespace(price.label ?? "").toLocaleLowerCase("id-ID") ===
                    "reguler",
        ) ??
        availablePrices.find((price) => price.user_category === "umum") ??
        availablePrices[0];
    const duration = Number(selectedPrice?.duration_minutes);

    return Number.isFinite(duration) && duration > 0 ? duration : fallback;
};

const scheduleWindow = (
    activeSlots: ActiveSlots | null | undefined,
    durationMinutes: number,
) => {
    // This mirrors PublicBookingController's automatic 06.00-22.00 schedule.
    if (activeSlots == null) {
        return { start: 6 * 60, end: 22 * 60 };
    }

    const starts = Object.values(activeSlots)
        .flat()
        .map(parseBackendTime)
        .filter((value): value is number => value !== null);

    if (starts.length === 0) return null;

    return {
        start: Math.min(...starts),
        end: Math.max(...starts) + durationMinutes,
    };
};

const resolveOperatingHours = (facility: BackendFacility) => {
    const facilityDuration = resolveSlotDuration(facility.prices);
    const units = facility.units ?? [];
    const windows =
        units.length > 0
            ? units
                  .map((unit) => {
                      const usesCustomPricing =
                          unit.use_custom_pricing && (unit.prices?.length ?? 0) > 0;
                      const duration = usesCustomPricing
                          ? resolveSlotDuration(unit.prices, facilityDuration)
                          : facilityDuration;
                      const slots = unit.use_custom_schedule
                          ? (unit.active_slots ?? {})
                          : facility.active_slots;

                      return scheduleWindow(slots, duration);
                  })
                  .filter(
                      (
                          window,
                      ): window is { start: number; end: number } =>
                          window !== null,
                  )
            : [scheduleWindow(facility.active_slots, facilityDuration)].filter(
                  (
                      window,
                  ): window is { start: number; end: number } => window !== null,
              );

    if (windows.length === 0) return "Jadwal belum tersedia";

    const openingTime = Math.min(...windows.map((window) => window.start));
    const closingTime = Math.max(...windows.map((window) => window.end));

    return `${formatScheduleTime(openingTime)} - ${formatScheduleTime(closingTime)}`;
};

const parseTimeSlotRange = (value: string) => {
    const normalized = normalizeWhitespace(value);
    const match = normalized.match(
        /(\d{1,2}[.:]\d{2})\s*(?:-|\u2013|\u2014)\s*(\d{1,2}[.:]\d{2})/,
    );

    if (!match) {
        return { start: normalized, end: null };
    }

    return {
        start: match[1].replace(":", "."),
        end: match[2].replace(":", "."),
    };
};

const parsePeriodLabel = (raw: string) => {
    const normalized = normalizeWhitespace(raw);
    const [label, ...scheduleParts] = normalized.split("/");

    return {
        label: label.trim(),
        schedule: scheduleParts.join("/").trim(),
    };
};

const parseScheduleWindow = (
    schedule: string,
): ParsedScheduleWindow | null => {
    const match = schedule.match(
        /(\d{1,2})[.:](\d{2})\s*(?:-|\u2013)\s*(\d{1,2})[.:](\d{2})/,
    );

    if (!match) return null;

    const startMinutes =
        Math.min(Number(match[1]), 23) * 60 +
        Math.min(Number(match[2]), 59);
    const endMinutes =
        Math.min(Number(match[3]), 23) * 60 +
        Math.min(Number(match[4]), 59);
    const wrapsMidnight = endMinutes <= startMinutes;
    const startPercent = (startMinutes / 1440) * 100;

    return {
        startPercent,
        endPercent:
            wrapsMidnight && endMinutes === 0
                ? 100
                : (endMinutes / 1440) * 100,
        primaryWidth: wrapsMidnight
            ? 100 - startPercent
            : ((endMinutes - startMinutes) / 1440) * 100,
        secondaryWidth: wrapsMidnight ? (endMinutes / 1440) * 100 : 0,
    };
};

const parsePrice = (raw: string): ParsedPrice => {
    const match = normalizeWhitespace(raw).match(
        /(\d+(?:[.,]\d+)?K)\s*\/?\s*(.*)$/i,
    );

    if (!match) {
        return { amount: raw, unit: "" };
    }

    return {
        amount: match[1],
        unit: match[2] ? `/ ${match[2]}` : "",
    };
};

const parseDetail = (raw: string): ParsedDetail => {
    const normalized = normalizeWhitespace(raw);
    const match = normalized.match(
        /^(.*?)(\d+(?:[.,]\d+)?K)\s*\/?\s*(.*)$/i,
    );

    if (!match) {
        return { label: normalized, amount: "", unit: "" };
    }

    return {
        label: match[1].trim(),
        amount: match[2],
        unit: match[3] ? `/ ${match[3]}` : "",
    };
};

const PANEL_LOWERCASE_WORDS = new Set([
    "atau",
    "dan",
    "dari",
    "di",
    "ke",
    "untuk",
]);

const PANEL_ACRONYMS: Record<string, string> = {
    ub: "UB",
    ubsc: "UBSC",
};

const formatPanelLabel = (value: string) => {
    const normalized = normalizeWhitespace(value);

    if (!normalized || normalized !== normalized.toLocaleUpperCase("id-ID")) {
        return normalized;
    }

    return normalized
        .toLocaleLowerCase("id-ID")
        .split(" ")
        .map((word, index) => {
            if (PANEL_ACRONYMS[word]) return PANEL_ACRONYMS[word];
            if (index > 0 && PANEL_LOWERCASE_WORDS.has(word)) return word;

            return word.replace(/(^|[-/])([a-z])/g, (_, prefix, letter) =>
                `${prefix}${letter.toLocaleUpperCase("id-ID")}`,
            );
        })
        .join(" ");
};

function FacilityPrimarySlot({ value }: { value: string }) {
    const timeRange = parseTimeSlotRange(value);
    const accessibleLabel = timeRange.end
        ? `Jam operasional ${timeRange.start} sampai ${timeRange.end} WIB`
        : timeRange.start;

    return (
        <span
            className="pfl-stage__slot"
            aria-label={accessibleLabel}
        >
            <span className="pfl-stage__slot-icon" aria-hidden="true">
                <span className="pfl-stage__slot-dial">
                    <Clock3 />
                    <span className="pfl-stage__slot-hand" />
                    <span className="pfl-stage__slot-pin" />
                </span>
            </span>
            <span className="pfl-stage__slot-body">
                <span className="pfl-stage__slot-header">
                    <span>Jam operasional</span>
                    <small>WIB</small>
                </span>

                {timeRange.end ? (
                    <span className="pfl-stage__slot-window">
                        <span className="pfl-stage__slot-moment">
                            <strong>{timeRange.start}</strong>
                            <small>Buka</small>
                        </span>
                        <span
                            className="pfl-stage__slot-direction"
                            aria-hidden="true"
                        >
                            <AccentArrowRight />
                        </span>
                        <span className="pfl-stage__slot-moment pfl-stage__slot-moment--end">
                            <strong>{timeRange.end}</strong>
                            <small>Tutup</small>
                        </span>
                    </span>
                ) : (
                    <strong className="pfl-stage__slot-fallback">
                        {timeRange.start}
                    </strong>
                )}
            </span>
        </span>
    );
}

const ArrowLeft = () => (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
        <path
            d="m12.5 4.5-5.5 5.5 5.5 5.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const ArrowRight = () => (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
        <path
            d="m7.5 4.5 5.5 5.5-5.5 5.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

function PricingBookingLink({ className = "" }: { className?: string }) {
    return (
        <a
            href="/booking"
            className={`pfl-stage__booking ${className}`.trim()}
        >
            <span className="pfl-stage__booking-fill" aria-hidden="true" />
            <span className="pfl-stage__booking-content">
                <span>Booking Arena Dalam</span>
                <span className="pfl-stage__booking-arrow" aria-hidden="true">
                    <AccentArrowRight />
                </span>
            </span>
        </a>
    );
}

const getMetadata = (facility: BackendFacility) =>
    (facility.display_metadata ?? {}) as FacilityDisplayMetadata;

export default function PricingFacilityList({ facilities = [] }: Props) {
    const facilitiesData = useMemo<FacilityPricing[]>(
        () =>
            facilities
                .filter(
                    (facility) =>
                        facility.category === "Lapangan & Arena" &&
                        !isOutdoorFacility(facility),
                )
                .map((facility, index) => {
                    const metadata = getMetadata(facility);
                    const timeSlot = resolveOperatingHours(facility);
                    const structuredPeriods = periodsFromPrices(
                        facility.prices,
                        timeSlot,
                    );
                    const publicPeriods = presentationPeriods(
                        metadata.pricingPresentation?.indoorPeriods,
                    );

                    return {
                        id: String(index + 1).padStart(2, "0"),
                        name: facility.name,
                        classCode:
                            facility.class_code ||
                            `/Class ${String(index + 1).padStart(3, "0")}/`,
                        periods:
                            publicPeriods.length > 0
                                ? publicPeriods
                                : structuredPeriods.length > 0
                                  ? structuredPeriods
                                : legacyPeriods(metadata.periods),
                        additionalDetails: publicDetails(
                            metadata.additionalDetails,
                        ),
                        timeSlot,
                        badgeLocation: facility.location ?? "Veteran",
                        badgeType: "Arena Dalam",
                        image:
                            facility.image ||
                            "/assets/images/comingsoon.avif",
                    };
                }),
        [facilities],
    );

    const [activeIndex, setActiveIndex] = useState(0);
    const [displayedIndex, setDisplayedIndex] = useState(0);
    const [panelTransition, setPanelTransition] =
        useState<PanelTransitionPhase>("enter");
    const [panelDirection, setPanelDirection] =
        useState<PanelTransitionDirection>("next");
    const selectorTrackRef = useRef<HTMLDivElement | null>(null);
    const sectionRef = useRef<HTMLElement | null>(null);
    const selectorRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const selectorScrollFrameRef = useRef(0);
    const selectorViewportFrameRef = useRef(0);
    const panelDragRef = useRef<PanelDragState | null>(null);
    const pendingIndexRef = useRef(0);
    const panelTransitionTimerRef = useRef<number | null>(null);
    const [selectorViewport, setSelectorViewport] =
        useState<SelectorViewportState>({
            canScrollLeft: false,
            canScrollRight: false,
            thumbStart: 0,
            thumbSize: 100,
        });
    const [sectionMediaPrepared, setSectionMediaPrepared] = useState(false);
    const activeFacility = facilitiesData[displayedIndex];
    const totalFacilities = facilitiesData.length;

    useEffect(() => {
        const section = sectionRef.current;
        const initialImage = facilitiesData[0]?.image;

        if (!section || !initialImage) {
            setSectionMediaPrepared(true);
            return;
        }

        if (preloadedFacilityImages.has(initialImage)) {
            setSectionMediaPrepared(true);
            return;
        }

        setSectionMediaPrepared(false);

        const scheduler = window as IdleSchedulerWindow;
        let cancelled = false;
        let idleHandle: number | null = null;
        let timeoutHandle: number | null = null;

        const prepareImage = () => {
            void preloadFacilityImage(initialImage).then(() => {
                if (!cancelled) setSectionMediaPrepared(true);
            });
        };

        const schedulePreparation = (isImmediatelyNear: boolean) => {
            if (isImmediatelyNear) {
                prepareImage();
                return;
            }

            if (scheduler.requestIdleCallback) {
                idleHandle = scheduler.requestIdleCallback(prepareImage, {
                    timeout: 900,
                });
                return;
            }

            timeoutHandle = window.setTimeout(prepareImage, 90);
        };

        if (typeof IntersectionObserver === "undefined") {
            schedulePreparation(true);
            return () => {
                cancelled = true;
            };
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                observer.disconnect();
                schedulePreparation(
                    entry.boundingClientRect.top <=
                        window.innerHeight * 1.15,
                );
            },
            {
                rootMargin: "145% 0px 145% 0px",
                threshold: 0,
            },
        );

        observer.observe(section);

        return () => {
            cancelled = true;
            observer.disconnect();

            if (idleHandle !== null) {
                scheduler.cancelIdleCallback?.(idleHandle);
            }
            if (timeoutHandle !== null) {
                window.clearTimeout(timeoutHandle);
            }
        };
    }, [facilitiesData]);

    useEffect(() => {
        if (!sectionMediaPrepared || totalFacilities < 2) return;

        const scheduler = window as IdleSchedulerWindow;
        const neighbourSources = [
            facilitiesData[(displayedIndex + 1) % totalFacilities]?.image,
            facilitiesData[
                (displayedIndex - 1 + totalFacilities) % totalFacilities
            ]?.image,
        ].filter(
            (source): source is string =>
                Boolean(source) && !preloadedFacilityImages.has(source),
        );
        const queue = Array.from(new Set(neighbourSources));

        if (queue.length === 0) return;

        let cancelled = false;
        let idleHandle: number | null = null;
        let timeoutHandle: number | null = null;

        const scheduleNext = () => {
            if (cancelled || queue.length === 0) return;

            const loadNext = () => {
                const source = queue.shift();
                if (!source || cancelled) return;

                void preloadFacilityImage(source).finally(scheduleNext);
            };

            if (scheduler.requestIdleCallback) {
                idleHandle = scheduler.requestIdleCallback(loadNext, {
                    timeout: 1400,
                });
            } else {
                timeoutHandle = window.setTimeout(loadNext, 160);
            }
        };

        scheduleNext();

        return () => {
            cancelled = true;

            if (idleHandle !== null) {
                scheduler.cancelIdleCallback?.(idleHandle);
            }
            if (timeoutHandle !== null) {
                window.clearTimeout(timeoutHandle);
            }
        };
    }, [displayedIndex, facilitiesData, sectionMediaPrepared, totalFacilities]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        const targets = Array.from(
            section.querySelectorAll<HTMLElement>("[data-pfl-reveal]"),
        );
        const revealTarget = (target: HTMLElement) => {
            target.dataset.pflRevealed = "true";
        };
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion || typeof IntersectionObserver === "undefined") {
            targets.forEach(revealTarget);
            return;
        }

        const pendingTargets = new Set(
            targets.filter(
                (target) => target.dataset.pflRevealed !== "true",
            ),
        );
        let scrollFrame = 0;
        let fallbackAttached = false;
        let observer: IntersectionObserver | null = null;

        function detachScrollFallback() {
            if (!fallbackAttached) return;

            window.removeEventListener("scroll", schedulePassedCheck);
            window.removeEventListener("resize", schedulePassedCheck);
            fallbackAttached = false;
        }

        function completeReveal(target: HTMLElement) {
            revealTarget(target);
            pendingTargets.delete(target);
            observer?.unobserve(target);

            if (pendingTargets.size === 0) {
                detachScrollFallback();
            }
        }

        function revealPassedTargets() {
            scrollFrame = 0;

            pendingTargets.forEach((target) => {
                if (target.getBoundingClientRect().bottom <= 0) {
                    completeReveal(target);
                }
            });
        }

        function schedulePassedCheck() {
            if (scrollFrame !== 0 || pendingTargets.size === 0) return;
            scrollFrame = window.requestAnimationFrame(revealPassedTargets);
        }

        observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) {
                        if (entry.boundingClientRect.bottom <= 0) {
                            completeReveal(entry.target as HTMLElement);
                        }
                        return;
                    }

                    completeReveal(entry.target as HTMLElement);
                });
            },
            {
                rootMargin: "0px 0px -8% 0px",
                threshold: 0.08,
            },
        );

        targets.forEach((target) => {
            if (target.dataset.pflRevealed === "true") return;

            if (target.getBoundingClientRect().bottom <= 0) {
                completeReveal(target);
                return;
            }

            observer?.observe(target);
        });

        if (pendingTargets.size > 0) {
            fallbackAttached = true;
            window.addEventListener("scroll", schedulePassedCheck, {
                passive: true,
            });
            window.addEventListener("resize", schedulePassedCheck, {
                passive: true,
            });
            schedulePassedCheck();
        }

        return () => {
            observer?.disconnect();
            window.cancelAnimationFrame(scrollFrame);
            detachScrollFallback();
        };
    }, [displayedIndex, totalFacilities]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        if (typeof IntersectionObserver === "undefined") {
            section.dataset.pflInView = "true";
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                section.dataset.pflInView = String(
                    Boolean(entry?.isIntersecting),
                );
            },
            {
                rootMargin: "16% 0px 16% 0px",
                threshold: 0,
            },
        );

        observer.observe(section);
        return () => observer.disconnect();
    }, []);

    const updateSelectorViewport = useCallback(() => {
        const track = selectorTrackRef.current;
        if (!track) return;

        const maximumScroll = Math.max(
            0,
            track.scrollWidth - track.clientWidth,
        );
        const hasOverflow = maximumScroll > 1;
        const thumbSize = hasOverflow
            ? Math.max(18, (track.clientWidth / track.scrollWidth) * 100)
            : 100;
        const thumbStart = hasOverflow
            ? (track.scrollLeft / maximumScroll) * (100 - thumbSize)
            : 0;
        const nextViewport = {
            canScrollLeft: hasOverflow && track.scrollLeft > 2,
            canScrollRight:
                hasOverflow && track.scrollLeft < maximumScroll - 2,
            thumbStart: Math.max(0, Math.min(100 - thumbSize, thumbStart)),
            thumbSize,
        };

        setSelectorViewport((currentViewport) => {
            const unchanged =
                currentViewport.canScrollLeft ===
                    nextViewport.canScrollLeft &&
                currentViewport.canScrollRight ===
                    nextViewport.canScrollRight &&
                Math.abs(
                    currentViewport.thumbStart - nextViewport.thumbStart,
                ) < 0.08 &&
                Math.abs(currentViewport.thumbSize - nextViewport.thumbSize) <
                    0.08;

            return unchanged ? currentViewport : nextViewport;
        });
    }, []);

    useEffect(() => {
        if (
            activeIndex < totalFacilities &&
            displayedIndex < totalFacilities
        ) {
            return;
        }

        pendingIndexRef.current = 0;
        setActiveIndex(0);
        setDisplayedIndex(0);
    }, [activeIndex, displayedIndex, totalFacilities]);

    useEffect(
        () => () => {
            window.cancelAnimationFrame(selectorScrollFrameRef.current);
            window.cancelAnimationFrame(selectorViewportFrameRef.current);
            if (panelTransitionTimerRef.current !== null) {
                window.clearTimeout(panelTransitionTimerRef.current);
            }
        },
        [],
    );

    useEffect(() => {
        const track = selectorTrackRef.current;
        if (!track) return;

        const scheduleViewportUpdate = () => {
            window.cancelAnimationFrame(selectorViewportFrameRef.current);
            selectorViewportFrameRef.current = window.requestAnimationFrame(
                updateSelectorViewport,
            );
        };
        const stopProgrammaticScroll = () => {
            window.cancelAnimationFrame(selectorScrollFrameRef.current);
        };
        const resizeObserver =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(scheduleViewportUpdate);

        scheduleViewportUpdate();
        resizeObserver?.observe(track);
        track.addEventListener("scroll", scheduleViewportUpdate, {
            passive: true,
        });
        track.addEventListener("pointerdown", stopProgrammaticScroll, {
            passive: true,
        });
        track.addEventListener("wheel", stopProgrammaticScroll, {
            passive: true,
        });
        window.addEventListener("resize", scheduleViewportUpdate, {
            passive: true,
        });

        return () => {
            resizeObserver?.disconnect();
            window.cancelAnimationFrame(selectorViewportFrameRef.current);
            track.removeEventListener("scroll", scheduleViewportUpdate);
            track.removeEventListener("pointerdown", stopProgrammaticScroll);
            track.removeEventListener("wheel", stopProgrammaticScroll);
            window.removeEventListener("resize", scheduleViewportUpdate);
        };
    }, [totalFacilities, updateSelectorViewport]);

    useEffect(() => {
        const track = selectorTrackRef.current;
        const activeButton = selectorRefs.current[activeIndex];

        if (!track || !activeButton || totalFacilities === 0) return;

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        let frame = 0;

        const alignActiveButton = (animate: boolean) => {
            if (!window.matchMedia("(max-width: 1099px)").matches) return;

            const maximumScroll = Math.max(
                0,
                track.scrollWidth - track.clientWidth,
            );
            const startScroll = track.scrollLeft;
            const visibleEnd = startScroll + track.clientWidth;
            const availableInset = Math.max(
                0,
                (track.clientWidth - activeButton.offsetWidth) / 2,
            );
            const edgeInset = Math.min(
                18,
                track.clientWidth * 0.045,
                availableInset,
            );
            const buttonStart = activeButton.offsetLeft;
            const buttonEnd = buttonStart + activeButton.offsetWidth;
            let targetScroll = startScroll;

            if (buttonStart < startScroll + edgeInset) {
                targetScroll = buttonStart - edgeInset;
            } else if (buttonEnd > visibleEnd - edgeInset) {
                targetScroll =
                    buttonEnd - track.clientWidth + edgeInset;
            }

            targetScroll = Math.min(
                maximumScroll,
                Math.max(0, targetScroll),
            );
            const distance = targetScroll - startScroll;

            window.cancelAnimationFrame(selectorScrollFrameRef.current);

            if (!animate || Math.abs(distance) < 1) {
                track.scrollLeft = targetScroll;
                updateSelectorViewport();
                return;
            }

            const duration = Math.min(
                320,
                Math.max(180, 140 + Math.abs(distance) * 0.55),
            );
            let startedAt: number | null = null;

            const animateScroll = (timestamp: number) => {
                if (startedAt === null) startedAt = timestamp;

                const progress = Math.min(1, (timestamp - startedAt) / duration);
                const eased = 1 - Math.pow(1 - progress, 4);

                track.scrollLeft = startScroll + distance * eased;

                if (progress < 1) {
                    selectorScrollFrameRef.current =
                        window.requestAnimationFrame(animateScroll);
                } else {
                    updateSelectorViewport();
                }
            };

            selectorScrollFrameRef.current =
                window.requestAnimationFrame(animateScroll);
        };

        frame = window.requestAnimationFrame(() =>
            alignActiveButton(!reducedMotion),
        );

        const realignWithoutMotion = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() =>
                alignActiveButton(false),
            );
        };

        window.addEventListener("resize", realignWithoutMotion, {
            passive: true,
        });

        return () => {
            window.cancelAnimationFrame(frame);
            window.cancelAnimationFrame(selectorScrollFrameRef.current);
            window.removeEventListener("resize", realignWithoutMotion);
        };
    }, [activeIndex, totalFacilities, updateSelectorViewport]);

    const selectFacility = (index: number, moveFocus = false) => {
        if (totalFacilities === 0) return;

        const nextIndex = Math.min(
            totalFacilities - 1,
            Math.max(0, index),
        );
        const forwardDistance =
            (nextIndex - displayedIndex + totalFacilities) % totalFacilities;
        const backwardDistance =
            (displayedIndex - nextIndex + totalFacilities) % totalFacilities;

        pendingIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        setPanelDirection(
            forwardDistance <= backwardDistance ? "next" : "previous",
        );

        if (moveFocus) {
            window.requestAnimationFrame(() => {
                selectorRefs.current[nextIndex]?.focus({ preventScroll: true });
            });
        }

        if (
            nextIndex === displayedIndex &&
            panelTransitionTimerRef.current === null
        ) {
            return;
        }

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion) {
            if (panelTransitionTimerRef.current !== null) {
                window.clearTimeout(panelTransitionTimerRef.current);
                panelTransitionTimerRef.current = null;
            }
            setDisplayedIndex(nextIndex);
            setPanelTransition("enter");
            return;
        }

        if (panelTransitionTimerRef.current !== null) return;

        setPanelTransition("exit");
        panelTransitionTimerRef.current = window.setTimeout(() => {
            setDisplayedIndex(pendingIndexRef.current);
            setPanelTransition("enter");
            panelTransitionTimerRef.current = null;
        }, 130);
    };

    const handleSelectorKeyDown = (
        event: KeyboardEvent<HTMLButtonElement>,
        index: number,
    ) => {
        if (totalFacilities === 0) return;

        const nextIndex = (index + 1) % totalFacilities;
        const previousIndex =
            (index - 1 + totalFacilities) % totalFacilities;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowDown":
                event.preventDefault();
                selectFacility(nextIndex, true);
                break;
            case "ArrowLeft":
            case "ArrowUp":
                event.preventDefault();
                selectFacility(previousIndex, true);
                break;
            case "Home":
                event.preventDefault();
                selectFacility(0, true);
                break;
            case "End":
                event.preventDefault();
                selectFacility(totalFacilities - 1, true);
                break;
        }
    };

    const previousFacilityIndex =
        totalFacilities > 0
            ? (activeIndex - 1 + totalFacilities) % totalFacilities
            : 0;
    const nextFacilityIndex =
        totalFacilities > 0 ? (activeIndex + 1) % totalFacilities : 0;

    const resetPanelDrag = (stage: HTMLDivElement) => {
        stage.dataset.dragging = "false";
        stage.style.setProperty("--pfl-drag-x", "0px");
        panelDragRef.current = null;
    };

    const handlePanelPointerDown = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;

        const target = event.target as HTMLElement;
        if (target.closest("a, button, input, select, textarea")) return;

        panelDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            currentX: event.clientX,
            axis: "pending",
        };

        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePanelPointerMove = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        const drag = panelDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const deltaX = event.clientX - drag.startX;
        const deltaY = event.clientY - drag.startY;

        if (drag.axis === "pending") {
            if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) return;
            drag.axis =
                Math.abs(deltaX) > Math.abs(deltaY)
                    ? "horizontal"
                    : "vertical";
        }

        if (drag.axis !== "horizontal") return;

        event.preventDefault();
        drag.currentX = event.clientX;
        event.currentTarget.dataset.dragging = "true";

        const maximumTravel = Math.min(
            event.currentTarget.clientWidth * 0.12,
            120,
        );
        const resistedTravel = Math.max(
            -maximumTravel,
            Math.min(maximumTravel, deltaX * 0.46),
        );

        event.currentTarget.style.setProperty(
            "--pfl-drag-x",
            `${resistedTravel}px`,
        );
    };

    const finishPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = panelDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;

        const stage = event.currentTarget;
        const deltaX = drag.currentX - drag.startX;
        const triggerDistance = Math.min(
            Math.max(stage.clientWidth * 0.08, 48),
            96,
        );
        const shouldNavigate =
            drag.axis === "horizontal" &&
            Math.abs(deltaX) >= triggerDistance;

        resetPanelDrag(stage);

        if (stage.hasPointerCapture(event.pointerId)) {
            stage.releasePointerCapture(event.pointerId);
        }

        if (shouldNavigate) {
            selectFacility(
                deltaX < 0 ? nextFacilityIndex : previousFacilityIndex,
            );
        }
    };

    const cancelPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = panelDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        resetPanelDrag(event.currentTarget);
    };

    return (
        <section
            ref={sectionRef}
            className="overflow-x-clip bg-[#FAFAFA]"
            id="pricing-facilities"
            data-pricing-loop-region="true"
            data-pfl-motion="ready"
            data-pfl-in-view="false"
            data-pfl-media-prepared={sectionMediaPrepared}
        >
            <div
                className={SECTION_DIVIDER_WRAP_CLASS}
                data-pfl-reveal="divider"
            >
                <SectionDivider
                    number="02"
                    title="Arena Dalam"
                    subtitle="05 pricingpage"
                    theme="light"
                />
            </div>

            <div className={SECTION_CONTAINER_CLASS}>
                <div className="pfl-intro">
                    <div className="pfl-intro__label" data-pfl-reveal="intro">
                        <div className="flex items-center gap-4">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black">
                                {PRICING_FACILITIES_LABEL}
                            </ScrollTextReveal>
                        </div>
                    </div>

                    <PricingFacilitiesHeadline />

                    <div className="pfl-intro__description">
                        <ScrollTextReveal
                            as="p"
                            split="words"
                            delay={180}
                            stagger={10}
                        >
                            {PRICING_FACILITIES_DESCRIPTION}
                        </ScrollTextReveal>
                    </div>

                    <div className="pfl-intro__actions">
                        <div data-pfl-reveal="intro">
                            <ReservasiButton
                                label="Mulai Reservasi"
                                href="/booking"
                            />
                        </div>
                        <div data-pfl-reveal="intro">
                            <PricingHeaderFolio />
                        </div>
                    </div>
                </div>

                {activeFacility ? (
                    <div className="pfl-directory" data-pfl-reveal="directory">
                        <aside
                            className="pfl-directory__rail"
                            data-active-number={activeFacility.id}
                            data-pfl-reveal="rail"
                        >
                            <div className="pfl-rail__header">
                                <span className="pfl-rail__header-label">
                                    Daftar Arena
                                </span>
                                <span
                                    className="pfl-rail__counter"
                                    role="status"
                                    aria-live="polite"
                                    aria-atomic="true"
                                    aria-label={`Arena ${activeIndex + 1} dari ${totalFacilities}`}
                                >
                                    <span
                                        key={`rail-counter-${activeIndex}`}
                                        className="pfl-rail__counter-current"
                                        aria-hidden="true"
                                    >
                                        {String(activeIndex + 1).padStart(
                                            2,
                                            "0",
                                        )}
                                    </span>
                                    <span
                                        className="pfl-rail__counter-context"
                                        aria-hidden="true"
                                    >
                                        <span className="pfl-rail__counter-label">
                                            Terpilih
                                        </span>
                                        <span className="pfl-rail__counter-total">
                                            dari{" "}
                                            <span>
                                                {String(
                                                    totalFacilities,
                                                ).padStart(2, "0")}
                                            </span>
                                        </span>
                                    </span>
                                </span>
                            </div>

                            <div
                                className="pfl-rail__position"
                                role="progressbar"
                                aria-label={`Posisi arena ${activeIndex + 1} dari ${totalFacilities}`}
                                aria-valuemin={1}
                                aria-valuemax={totalFacilities}
                                aria-valuenow={activeIndex + 1}
                                style={
                                    {
                                        "--pfl-position-count":
                                            totalFacilities,
                                    } as CSSProperties
                                }
                            >
                                {facilitiesData.map((facility, index) => (
                                    <span
                                        key={`rail-position-${facility.id}`}
                                        className="pfl-rail__position-step"
                                        data-state={
                                            index === activeIndex
                                                ? "active"
                                                : index < activeIndex
                                                  ? "complete"
                                                  : "pending"
                                        }
                                        aria-hidden="true"
                                    />
                                ))}
                            </div>

                            <div
                                className="pfl-selector-shell"
                                data-can-scroll-left={
                                    selectorViewport.canScrollLeft
                                }
                                data-can-scroll-right={
                                    selectorViewport.canScrollRight
                                }
                                style={
                                    {
                                        "--pfl-selector-thumb-start": `${selectorViewport.thumbStart}%`,
                                        "--pfl-selector-thumb-size": `${selectorViewport.thumbSize}%`,
                                    } as CSSProperties
                                }
                            >
                                <span
                                    className="pfl-selector-edge pfl-selector-edge--left"
                                    aria-hidden="true"
                                />
                                <span
                                    className="pfl-selector-edge pfl-selector-edge--right"
                                    aria-hidden="true"
                                />
                                <div
                                    ref={selectorTrackRef}
                                    className="pfl-selector"
                                    role="tablist"
                                    aria-label="Pilih arena untuk melihat jadwal dan tarif"
                                    data-lenis-prevent-touch=""
                                >
                                    {facilitiesData.map((facility, index) => {
                                        const isActive = activeIndex === index;
                                        const tabId = `pricing-facility-tab-${facility.id}`;

                                        return (
                                            <button
                                                key={facility.id}
                                                id={tabId}
                                                type="button"
                                                role="tab"
                                                aria-selected={isActive}
                                                aria-controls="pricing-facility-panel"
                                                tabIndex={isActive ? 0 : -1}
                                                data-active={isActive}
                                                className="pfl-selector__item"
                                                ref={(node) => {
                                                    selectorRefs.current[
                                                        index
                                                    ] = node;
                                                }}
                                                style={
                                                    {
                                                        "--pfl-order": index,
                                                    } as CSSProperties
                                                }
                                                onClick={() =>
                                                    selectFacility(index)
                                                }
                                                onKeyDown={(event) =>
                                                    handleSelectorKeyDown(
                                                        event,
                                                        index,
                                                    )
                                                }
                                            >
                                                <span className="pfl-selector__number">
                                                    {facility.id}
                                                </span>
                                                <span className="pfl-selector__name">
                                                    {formatPanelLabel(
                                                        facility.name,
                                                    )}
                                                </span>
                                                <span
                                                    aria-hidden="true"
                                                    className="pfl-selector__state"
                                                >
                                                    <i />
                                                    <i />
                                                    <i />
                                                    <i />
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <span
                                    className="pfl-selector-scrollmap"
                                    aria-hidden="true"
                                >
                                    <i />
                                </span>
                            </div>

                            <div className="pfl-rail__mobile-actions">
                                <PricingBookingLink className="pfl-stage__booking--mobile" />
                                <div
                                    className="pfl-rail__mobile-switcher"
                                    role="group"
                                    aria-label="Navigasi arena"
                                >
                                    <button
                                        type="button"
                                        aria-label={`Arena sebelumnya: ${facilitiesData[previousFacilityIndex].name}`}
                                        title="Arena sebelumnya"
                                        onClick={() =>
                                            selectFacility(
                                                previousFacilityIndex,
                                                true,
                                            )
                                        }
                                    >
                                        <ArrowLeft aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Arena berikutnya: ${facilitiesData[nextFacilityIndex].name}`}
                                        title="Arena berikutnya"
                                        onClick={() =>
                                            selectFacility(
                                                nextFacilityIndex,
                                                true,
                                            )
                                        }
                                    >
                                        <ArrowRight aria-hidden="true" />
                                    </button>
                                </div>
                            </div>

                            <div className="pfl-rail__footer" aria-hidden="true">
                                <span className="pfl-rail__footer-label">
                                    UB Sport Center / Daftar tarif
                                </span>
                                <span className="pfl-rail__progress">
                                    <span
                                        style={{
                                            width: `${
                                                ((activeIndex + 1) /
                                                    totalFacilities) *
                                                100
                                            }%`,
                                        }}
                                    />
                                </span>
                            </div>
                        </aside>

                        <div
                            key={activeFacility.id}
                            id="pricing-facility-panel"
                            role="tabpanel"
                            aria-labelledby={`pricing-facility-tab-${activeFacility.id}`}
                            aria-live="polite"
                            className="pfl-stage"
                            data-dragging="false"
                            data-transition={panelTransition}
                            data-direction={panelDirection}
                            aria-busy={panelTransition === "exit"}
                            onPointerDown={handlePanelPointerDown}
                            onPointerMove={handlePanelPointerMove}
                            onPointerUp={finishPanelDrag}
                            onPointerCancel={cancelPanelDrag}
                            onLostPointerCapture={cancelPanelDrag}
                        >
                            <div className="pfl-stage__content">
                                <header
                                    className="pfl-stage__header"
                                    data-pfl-reveal="header"
                                >
                                    <div className="pfl-stage__badge pfl-stage__badge--mobile">
                                        <FacilityBadge
                                            location={formatPanelLabel(
                                                activeFacility.badgeLocation,
                                            )}
                                            category={formatPanelLabel(
                                                activeFacility.badgeType,
                                            )}
                                            variant="blue"
                                        />
                                    </div>

                                    <div className="pfl-stage__eyebrow pfl-stage__eyebrow--desktop">
                                        <span className="pfl-status-dot" />
                                        Arena {activeFacility.id}
                                        <span aria-hidden="true">/</span>
                                        {displayClassCode(
                                            activeFacility.classCode,
                                        )}
                                    </div>

                                    <h3 className="pfl-stage__title">
                                        <ScrollTextReveal
                                            split="lines"
                                            delay={110}
                                            stagger={95}
                                            className="pfl-stage__title-reveal"
                                        >
                                            {`/${formatPanelLabel(activeFacility.name)}`}
                                        </ScrollTextReveal>
                                    </h3>

                                    <div className="pfl-stage__meta">
                                        <FacilityPrimarySlot
                                            value={activeFacility.timeSlot}
                                        />
                                    </div>
                                </header>

                                <section
                                    className="pfl-rates"
                                    aria-labelledby="pricing-rates-title"
                                    data-pfl-reveal="rates"
                                >
                                    <div className="pfl-block-heading">
                                        <h4 id="pricing-rates-title">
                                            Tarif per jam
                                        </h4>
                                        <span>Warga UB / Umum</span>
                                    </div>

                                    {activeFacility.periods.length > 0 ? (
                                        <div className="pfl-rate-grid">
                                            {activeFacility.periods.map(
                                            (period, index) => {
                                                const periodLabel =
                                                    parsePeriodLabel(
                                                        period.label,
                                                    );
                                                const wargaPrice = parsePrice(
                                                    period.wargaPrice,
                                                );
                                                const umumPrice = parsePrice(
                                                    period.umumPrice,
                                                );
                                                const scheduleWindow =
                                                    parseScheduleWindow(
                                                        periodLabel.schedule,
                                                    );

                                                return (
                                                    <article
                                                        key={`${period.label}-${index}`}
                                                        className="pfl-rate"
                                                        data-has-window={Boolean(
                                                            scheduleWindow,
                                                        )}
                                                        data-wraps-window={Boolean(
                                                            scheduleWindow?.secondaryWidth,
                                                        )}
                                                        style={
                                                            {
                                                                "--pfl-order":
                                                                    index,
                                                                "--pfl-time-start": `${scheduleWindow?.startPercent ?? 0}%`,
                                                                "--pfl-time-end": `${scheduleWindow?.endPercent ?? 0}%`,
                                                                "--pfl-time-width": `${scheduleWindow?.primaryWidth ?? 0}%`,
                                                                "--pfl-time-wrap": `${scheduleWindow?.secondaryWidth ?? 0}%`,
                                                            } as CSSProperties
                                                        }
                                                    >
                                                        <div className="pfl-rate__heading">
                                                            <span>
                                                                {periodLabel.label}
                                                            </span>
                                                            <strong>
                                                                {
                                                                    periodLabel.schedule
                                                                }
                                                            </strong>
                                                            <div
                                                                className="pfl-rate__timeline"
                                                                aria-hidden="true"
                                                            >
                                                                <span className="pfl-rate__timeline-track">
                                                                    <i className="pfl-rate__timeline-primary" />
                                                                    <i className="pfl-rate__timeline-secondary" />
                                                                    <i className="pfl-rate__timeline-marker pfl-rate__timeline-marker--start" />
                                                                    <i className="pfl-rate__timeline-marker pfl-rate__timeline-marker--end" />
                                                                </span>
                                                                <span className="pfl-rate__timeline-labels">
                                                                    <small>00</small>
                                                                    <small>12</small>
                                                                    <small>24</small>
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="pfl-rate__row">
                                                            <span>Warga UB</span>
                                                            <strong>
                                                                {
                                                                    wargaPrice.amount
                                                                }
                                                            </strong>
                                                            <small>
                                                                {wargaPrice.unit}
                                                            </small>
                                                        </div>

                                                        <div className="pfl-rate__row">
                                                            <span>Umum</span>
                                                            <strong>
                                                                {
                                                                    umumPrice.amount
                                                                }
                                                            </strong>
                                                            <small>
                                                                {umumPrice.unit}
                                                            </small>
                                                        </div>
                                                    </article>
                                                );
                                            },
                                            )}
                                        </div>
                                    ) : (
                                        <p
                                            className="rounded-[5px] bg-white/7 px-4 py-4 font-bdo text-sm text-white/65"
                                            role="status"
                                        >
                                            Tarif fasilitas sedang disiapkan.
                                        </p>
                                    )}
                                </section>

                                {activeFacility.additionalDetails.length > 0 && (
                                    <section
                                        className="pfl-addons"
                                        aria-labelledby="pricing-addons-title"
                                        data-pfl-reveal="addons"
                                    >
                                        <div className="pfl-block-heading">
                                            <h4 id="pricing-addons-title">
                                                Layanan tambahan
                                            </h4>
                                            <span>Opsional</span>
                                        </div>

                                        <div className="pfl-addon-grid">
                                            {activeFacility.additionalDetails.map(
                                                (detail, index) => {
                                                    const parsed =
                                                        parseDetail(detail);

                                                    return (
                                                        <div
                                                            key={`${detail}-${index}`}
                                                            className="pfl-addon"
                                                            style={
                                                                {
                                                                    "--pfl-order":
                                                                        index,
                                                                } as CSSProperties
                                                            }
                                                        >
                                                            <span>
                                                                {parsed.label}
                                                            </span>
                                                            <strong>
                                                                {parsed.amount}
                                                            </strong>
                                                            <small>
                                                                {parsed.unit}
                                                            </small>
                                                        </div>
                                                    );
                                                },
                                            )}
                                        </div>
                                    </section>
                                )}

                                <footer
                                    className="pfl-stage__footer"
                                    data-pfl-reveal="footer"
                                >
                                    <div className="pfl-stage__badge pfl-stage__badge--desktop">
                                        <FacilityBadge
                                            location={formatPanelLabel(
                                                activeFacility.badgeLocation,
                                            )}
                                            category={formatPanelLabel(
                                                activeFacility.badgeType,
                                            )}
                                            variant="blue"
                                        />
                                    </div>
                                    <div className="pfl-stage__eyebrow pfl-stage__eyebrow--mobile">
                                        <span className="pfl-status-dot" />
                                        Arena {activeFacility.id}
                                        <span aria-hidden="true">/</span>
                                        {displayClassCode(
                                            activeFacility.classCode,
                                        )}
                                    </div>
                                    <div className="pfl-stage__actions">
                                        <div
                                            className="pfl-stage__switcher"
                                            role="group"
                                            aria-label="Navigasi arena"
                                        >
                                            <button
                                                type="button"
                                                aria-label={`Arena sebelumnya: ${facilitiesData[previousFacilityIndex].name}`}
                                                title="Arena sebelumnya"
                                                onClick={() =>
                                                    selectFacility(
                                                        previousFacilityIndex,
                                                        true,
                                                    )
                                                }
                                            >
                                                <ArrowLeft aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`Arena berikutnya: ${facilitiesData[nextFacilityIndex].name}`}
                                                title="Arena berikutnya"
                                                onClick={() =>
                                                    selectFacility(
                                                        nextFacilityIndex,
                                                        true,
                                                    )
                                                }
                                            >
                                                <ArrowRight aria-hidden="true" />
                                            </button>
                                        </div>
                                        <PricingBookingLink />
                                    </div>
                                </footer>
                            </div>

                            <figure
                                className="pfl-stage__media"
                                data-pfl-reveal="media"
                                data-image-prepared={
                                    sectionMediaPrepared ||
                                    preloadedFacilityImages.has(
                                        activeFacility.image,
                                    )
                                }
                            >
                                <img
                                    src={activeFacility.image}
                                    alt={activeFacility.name}
                                    width={1200}
                                    height={1500}
                                    loading={
                                        sectionMediaPrepared ? "eager" : "lazy"
                                    }
                                    decoding="async"
                                    draggable={false}
                                />
                                <div
                                    className="pfl-media__count"
                                    aria-hidden="true"
                                >
                                    <span>{activeFacility.id}</span>
                                    <small>
                                        / {String(totalFacilities).padStart(2, "0")}
                                    </small>
                                </div>
                                <figcaption>
                                    <span>
                                        {formatPanelLabel(
                                            activeFacility.badgeLocation,
                                        )}
                                    </span>
                                    <strong>
                                        {formatPanelLabel(
                                            activeFacility.badgeType,
                                        )}
                                    </strong>
                                </figcaption>
                            </figure>
                        </div>
                    </div>
                ) : (
                    <div className="pfl-empty">
                        <span>Jadwal &amp; Tarif</span>
                        <p>Informasi arena sedang disiapkan.</p>
                    </div>
                )}
            </div>
        </section>
    );
}
