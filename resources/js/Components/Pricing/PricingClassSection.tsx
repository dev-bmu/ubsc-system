import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import PricingClassCard, {
    type ClassPricing,
    type PricingLine,
} from "./PricingClassCard";
import PricingSectionHeadline from "./PricingSectionHeadline";
import PricingBookingLink from "./PricingBookingLink";
import "./PricingClassSection.css";

interface BackendFacilityPrice {
    id?: number | string;
    user_category?: string | null;
    label?: string | null;
    price?: number | string | null;
    duration_minutes?: number | null;
    notes?: string | null;
}

interface BackendFacility {
    id: number | string;
    name?: string | null;
    slug?: string | null;
    image?: string | null;
    category?: string | null;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    rating?: number | null;
    display_metadata?: Record<string, unknown> | null;
    prices?: BackendFacilityPrice[] | null;
    price_range?: string | null;
}

interface Props {
    facilities?: BackendFacility[];
}

type UnknownRecord = Record<string, unknown>;

const FALLBACK_IMAGE = "/assets/images/comingsoon.avif";
const CLASS_CATEGORY_TERMS = ["kebugaran", "fitness", "kelas"];
const RENTAL_TERMS = ["sewa", "rental", "persewaan"];
const PRICING_CLASS_HEADING =
    "Temukan kelas yang paling sesuai, bangun ritme latihan yang menyenangkan, selalu bergerak menuju versi terbaik Anda.";
const POINTER_DRAG_THRESHOLD = 5;
const POINTER_INTENT_MINIMUM = 34;
const POINTER_INTENT_MAXIMUM = 68;
const POINTER_VELOCITY_PROJECTION = 180;
const POINTER_VELOCITY_LIMIT = 2.4;
const POINTER_VELOCITY_DECAY_WINDOW = 140;
const POINTER_DRAG_GAIN = 1.04;
const CAROUSEL_EDGE_TOLERANCE = 2;
const CARD_MOTION_IDLE_DELAY = 550;

const preparedClassImages = new Set<string>();
const classImagePreparationTasks = new Map<string, Promise<void>>();

type IdleSchedulerWindow = Window & {
    requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
};

const prepareClassImage = (source: string) => {
    if (!source || typeof Image === "undefined") return Promise.resolve();
    if (preparedClassImages.has(source)) return Promise.resolve();

    const pendingTask = classImagePreparationTasks.get(source);
    if (pendingTask) return pendingTask;

    const task = new Promise<void>((resolve) => {
        const image = new Image();
        image.decoding = "async";
        image.fetchPriority = "low";

        const finish = () => {
            preparedClassImages.add(source);
            classImagePreparationTasks.delete(source);
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

    classImagePreparationTasks.set(source, task);
    return task;
};

interface CarouselPointerDrag {
    pointerId: number | null;
    startX: number;
    startScrollLeft: number;
    startIndex: number;
    lastX: number;
    lastTimestamp: number;
    velocityX: number;
    hasMoved: boolean;
}

interface CarouselMetrics {
    viewport: HTMLElement | null;
    slides: HTMLElement[];
    offsets: number[];
    maxScrollLeft: number;
}

interface CarouselViewState {
    selectedIndex: number;
    progressIndex: number;
    canScrollPrev: boolean;
    canScrollNext: boolean;
}

const createIdlePointerDrag = (): CarouselPointerDrag => ({
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
    startIndex: 0,
    lastX: 0,
    lastTimestamp: 0,
    velocityX: 0,
    hasMoved: false,
});

const getCarouselSlides = (viewport: HTMLElement) =>
    Array.from(viewport.querySelectorAll<HTMLElement>(".pcs__slide"));

const getNearestSlideIndex = (
    viewport: HTMLElement,
    slides: HTMLElement[],
) =>
    slides.reduce((nearestIndex, slide, index) => {
        const nearestDistance = Math.abs(
            slides[nearestIndex].offsetLeft - viewport.scrollLeft,
        );
        const currentDistance = Math.abs(
            slide.offsetLeft - viewport.scrollLeft,
        );

        return currentDistance < nearestDistance ? index : nearestIndex;
    }, 0);

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const cleanText = (value: unknown): string => {
    if (typeof value !== "string" && typeof value !== "number") return "";

    return String(value)
        .replace(/\r\n?/g, "\n")
        .replace(/[\t ]+/g, " ")
        .replace(/ *\n */g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
};

const pickText = (record: UnknownRecord, keys: string[]) => {
    for (const key of keys) {
        const value = cleanText(record[key]);
        if (value) return value;
    }

    return "";
};

const normalizeLine = (
    entry: unknown,
    prefix: string,
    index: number,
): PricingLine | null => {
    if (typeof entry === "string" || typeof entry === "number") {
        const label = cleanText(entry);
        return label ? { id: `${prefix}-${index}`, label } : null;
    }

    if (!isRecord(entry)) return null;

    const label = pickText(entry, ["label", "name", "title", "key"]);
    const value = pickText(entry, ["harga", "value", "price", "amount"]);
    const note = pickText(entry, [
        "note",
        "notes",
        "description",
        "subtitle",
    ]);

    if (!label && !value && !note) return null;

    const sourceId = cleanText(entry.id);

    return {
        id: `${prefix}-${index}${sourceId ? `-${sourceId}` : ""}`,
        label: label || undefined,
        value: value || undefined,
        note: note || undefined,
    };
};

const normalizeColumn = (value: unknown, prefix: string): PricingLine[] => {
    if (!Array.isArray(value)) return [];

    return value
        .map((entry, index) => normalizeLine(entry, prefix, index))
        .filter((line): line is PricingLine => line !== null);
};

const normalizeColumns = (value: unknown, prefix: string): PricingLine[][] => {
    if (Array.isArray(value)) {
        const column = normalizeColumn(value, `${prefix}-column`);
        return column.length > 0 ? [column] : [];
    }

    if (!isRecord(value)) return [];

    const explicitColumns = Array.isArray(value.columns)
        ? value.columns
              .map((column, index) =>
                  normalizeColumn(column, `${prefix}-column-${index}`),
              )
              .filter((column) => column.length > 0)
        : [];

    if (explicitColumns.length > 0) return explicitColumns;

    return [
        normalizeColumn(value.left, `${prefix}-left`),
        normalizeColumn(value.right, `${prefix}-right`),
    ].filter((column) => column.length > 0);
};

const humanizeCategory = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase("id-ID");
    const knownCategories: Record<string, string> = {
        warga_ub: "Warga UB",
        warga_kampus: "Warga UB",
        mahasiswa: "Mahasiswa",
        umum: "Umum",
        public: "Umum",
        general: "Umum",
        guest: "Tamu",
    };

    if (knownCategories[normalized]) return knownCategories[normalized];

    return normalized
        .split(/[_-]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toLocaleUpperCase("id-ID") + word.slice(1))
        .join(" ");
};

const formatPrice = (value: number | string | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return new Intl.NumberFormat("id-ID", {
            style: "currency",
            currency: "IDR",
            maximumFractionDigits: 0,
        }).format(value);
    }

    const text = cleanText(value);
    if (!text) return "";

    if (/^\d+(?:[.,]\d+)?$/.test(text)) {
        const numericValue = Number(text.replace(",", "."));
        if (Number.isFinite(numericValue)) {
            return new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                maximumFractionDigits: 0,
            }).format(numericValue);
        }
    }

    return text;
};

const priceColumnsFromFacility = (
    prices: BackendFacilityPrice[] | null | undefined,
): PricingLine[][] => {
    if (!Array.isArray(prices)) return [];

    const columns: [PricingLine[], PricingLine[]] = [[], []];

    prices.forEach((price, index) => {
        if (!price || typeof price !== "object") return;

        const categoryKey = cleanText(price.user_category).toLocaleLowerCase(
            "id-ID",
        );
        const categoryLabel = humanizeCategory(categoryKey || "tarif");
        const priceLabel = cleanText(price.label);
        const priceValue = formatPrice(price.price);
        const duration =
            typeof price.duration_minutes === "number" &&
            price.duration_minutes > 0
                ? `${price.duration_minutes} menit`
                : "";
        const sourceNote = cleanText(price.notes);
        const noteParts = [
            priceLabel && priceLabel.toLocaleLowerCase("id-ID") !== "reguler"
                ? priceLabel
                : "",
            duration && !/jam|menit/i.test(priceLabel) ? duration : "",
            sourceNote,
        ].filter((part, partIndex, parts) => part && parts.indexOf(part) === partIndex);

        if (!categoryLabel && !priceValue && noteParts.length === 0) return;

        const line: PricingLine = {
            id: `database-price-${cleanText(price.id) || index}`,
            label: categoryLabel || undefined,
            value: priceValue || undefined,
            note: noteParts.join(" · ") || undefined,
        };
        const isPublic = /umum|public|general|guest|tamu/.test(categoryKey);
        const isCampus = /warga|kampus|mahasiswa|dosen|pegawai|staff|ub/.test(
            categoryKey,
        );
        const columnIndex = isPublic
            ? 1
            : isCampus
              ? 0
              : columns[0].length <= columns[1].length
                ? 0
                : 1;

        columns[columnIndex].push(line);
    });

    return columns.filter((column) => column.length > 0);
};

const rentalColumnsFromMetadata = (metadata: UnknownRecord): PricingLine[][] => {
    const directRentalData =
        metadata.persewaan ?? metadata.rentals ?? metadata.rental;
    const directColumns = normalizeColumns(directRentalData, "rental");

    if (directColumns.length > 0) return directColumns;

    if (!Array.isArray(metadata.additionalDetails)) return [];

    const rentalDetails = metadata.additionalDetails
        .filter((detail) => {
            if (!isRecord(detail)) return false;
            const key = cleanText(detail.key).toLocaleLowerCase("id-ID");
            return RENTAL_TERMS.some((term) => key.includes(term));
        })
        .map((detail, index) => normalizeLine(detail, "rental-detail", index))
        .filter((line): line is PricingLine => line !== null);

    return rentalDetails.length > 0 ? [rentalDetails] : [];
};

const presentationRecord = (metadata: UnknownRecord): UnknownRecord =>
    isRecord(metadata.pricingPresentation)
        ? metadata.pricingPresentation
        : {};

const presentationClassColumns = (
    metadata: UnknownRecord,
): PricingLine[][] => {
    const rates = presentationRecord(metadata).classRates;
    if (!Array.isArray(rates)) return [];

    return rates.flatMap((entry, index) => {
        if (!isRecord(entry)) return [];
        const level = cleanText(entry.level);
        const wargaPrice = cleanText(entry.wargaPrice);
        const umumPrice = cleanText(entry.umumPrice);
        if (!level && !wargaPrice && !umumPrice) return [];

        const column: PricingLine[] = [{
            id: `presentation-class-${index}-level`,
            label: level || "Tarif kelas",
        }];

        if (wargaPrice) {
            column.push({
                id: `presentation-class-${index}-warga`,
                label: "Warga UB",
                value: wargaPrice,
            });
        }

        if (umumPrice) {
            column.push({
                id: `presentation-class-${index}-umum`,
                label: "Umum",
                value: umumPrice,
            });
        }

        return [column];
    });
};

const presentationRentalColumns = (
    metadata: UnknownRecord,
): PricingLine[][] => {
    const rentals = presentationRecord(metadata).classRentals;
    if (!Array.isArray(rentals)) return [];

    return rentals.flatMap((entry, index) => {
        if (!isRecord(entry)) return [];
        const label = cleanText(entry.label);
        const value = cleanText(entry.value);
        if (!label && !value) return [];

        const column: PricingLine[] = [];
        if (label) {
            column.push({
                id: `presentation-rental-${index}-title`,
                label,
            });
        }

        const parts = value
            .split("·")
            .map((part) => part.trim())
            .filter(Boolean);
        const isEventRental =
            parts.length > 1 &&
            /fasilitasi|matras|termasuk|include/i.test(parts.slice(1).join(" "));

        if (isEventRental) {
            column.push({
                id: `presentation-rental-${index}-value`,
                label: parts[0],
                note: `(${parts.slice(1).join(" · ")})`,
            });
        } else {
            parts.forEach((part, partIndex) => {
                column.push({
                    id: `presentation-rental-${index}-value-${partIndex}`,
                    label: part,
                });
            });
        }

        return column.length > 0 ? [column] : [];
    });
};

const isFitnessClass = (facility: BackendFacility) => {
    const category = cleanText(facility.category).toLocaleLowerCase("id-ID");
    return CLASS_CATEGORY_TERMS.some((term) => category.includes(term));
};

const mapFacilityToClass = (
    facility: BackendFacility,
    index: number,
): ClassPricing => {
    const metadata = isRecord(facility.display_metadata)
        ? facility.display_metadata
        : {};
    const metadataPriceColumns = normalizeColumns(
        metadata.daftarHarga,
        "display-price",
    );
    const publicPriceColumns = presentationClassColumns(metadata);
    const databasePriceColumns = priceColumnsFromFacility(facility.prices);
    const priceColumns =
        publicPriceColumns.length > 0
            ? publicPriceColumns
            : databasePriceColumns.length > 0
            ? databasePriceColumns
            : metadataPriceColumns;
    const publicRentalColumns = presentationRentalColumns(metadata);
    const rentalColumns =
        publicRentalColumns.length > 0
            ? publicRentalColumns
            : rentalColumnsFromMetadata(metadata);
    const sequence = String(index + 1).padStart(3, "0");
    const name = cleanText(facility.name) || `Kelas ${index + 1}`;
    const stableId = cleanText(facility.id) || `class-${index + 1}`;
    const blocks: ClassPricing["blocks"] = [
        {
            id: "pricing",
            title: "Daftar Harga",
            columns: priceColumns,
            emptyMessage: "Informasi harga belum tersedia.",
        },
        {
            id: "rental",
            title: "Persewaan",
            columns: rentalColumns,
            emptyMessage: "Informasi persewaan belum tersedia.",
        },
    ];

    return {
        id: stableId,
        name,
        classCode: cleanText(facility.class_code) || `Class ${sequence}`,
        image: cleanText(facility.image) || FALLBACK_IMAGE,
        badgeLocation: cleanText(facility.location) || undefined,
        badgeType:
            pickText(metadata, ["badgeType", "badge_type", "categoryLabel"]) ||
            "Kebugaran",
        blocks,
    };
};

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

function BookingLink() {
    return (
        <PricingBookingLink
            className="pcs__booking"
            label="Gabung Sekarang Juga"
        />
    );
}

export default function PricingClassSection({ facilities = [] }: Props) {
    const activeClasses = useMemo(
        () => facilities.filter(isFitnessClass).map(mapFacilityToClass),
        [facilities],
    );
    const sectionRef = useRef<HTMLElement | null>(null);
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const pointerDragRef = useRef<CarouselPointerDrag>(
        createIdlePointerDrag(),
    );
    const carouselMetricsRef = useRef<CarouselMetrics>({
        viewport: null,
        slides: [],
        offsets: [],
        maxScrollLeft: 0,
    });
    const carouselViewStateRef = useRef<CarouselViewState>({
        selectedIndex: 0,
        progressIndex: 0,
        canScrollPrev: false,
        canScrollNext: false,
    });
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [progressIndex, setProgressIndex] = useState(0);
    const [canScrollPrev, setCanScrollPrev] = useState(false);
    const [canScrollNext, setCanScrollNext] = useState(false);
    const [preparedImages, setPreparedImages] = useState<Set<string>>(
        () =>
            new Set(
                activeClasses
                    .map((item) => item.image)
                    .filter((source) => preparedClassImages.has(source)),
            ),
    );

    useEffect(() => {
        const section = sectionRef.current;
        const initialImage = activeClasses[0]?.image;

        if (!section || !initialImage) return;
        if (preparedClassImages.has(initialImage)) {
            setPreparedImages((current) => {
                if (current.has(initialImage)) return current;
                const next = new Set(current);
                next.add(initialImage);
                return next;
            });
            return;
        }

        const scheduler = window as IdleSchedulerWindow;
        let cancelled = false;
        let idleHandle: number | null = null;
        let timeoutHandle: number | null = null;

        const prepareImage = () => {
            void prepareClassImage(initialImage).then(() => {
                if (cancelled) return;
                setPreparedImages((current) => {
                    if (current.has(initialImage)) return current;
                    const next = new Set(current);
                    next.add(initialImage);
                    return next;
                });
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
            } else {
                timeoutHandle = window.setTimeout(prepareImage, 90);
            }
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
                    entry.boundingClientRect.top <= window.innerHeight * 1.15,
                );
            },
            {
                rootMargin: `${Math.round(window.innerHeight * 1.45)}px 0px`,
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
            if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
        };
    }, [activeClasses]);

    const commitCarouselState = useCallback(
        (nextState: CarouselViewState) => {
            const currentState = carouselViewStateRef.current;

            if (currentState.selectedIndex !== nextState.selectedIndex) {
                setSelectedIndex(nextState.selectedIndex);
            }
            if (currentState.progressIndex !== nextState.progressIndex) {
                setProgressIndex(nextState.progressIndex);
            }
            if (currentState.canScrollPrev !== nextState.canScrollPrev) {
                setCanScrollPrev(nextState.canScrollPrev);
            }
            if (currentState.canScrollNext !== nextState.canScrollNext) {
                setCanScrollNext(nextState.canScrollNext);
            }

            carouselViewStateRef.current = nextState;
        },
        [],
    );

    const measureCarousel = useCallback(() => {
        const viewport = viewportRef.current;
        const slides = viewport ? getCarouselSlides(viewport) : [];
        const metrics: CarouselMetrics = {
            viewport,
            slides,
            offsets: slides.map((slide) => slide.offsetLeft),
            maxScrollLeft: viewport
                ? Math.max(0, viewport.scrollWidth - viewport.clientWidth)
                : 0,
        };

        carouselMetricsRef.current = metrics;
        return metrics;
    }, []);

    const syncCarouselState = useCallback(() => {
        const viewport = viewportRef.current;
        const cachedMetrics = carouselMetricsRef.current;
        const metrics =
            cachedMetrics.viewport === viewport &&
            cachedMetrics.slides.length > 0
                ? cachedMetrics
                : measureCarousel();

        if (!viewport || metrics.slides.length === 0) {
            commitCarouselState({
                selectedIndex: 0,
                progressIndex: 0,
                canScrollPrev: false,
                canScrollNext: false,
            });
            return;
        }

        const nearestSlideIndex = metrics.offsets.reduce(
            (nearestIndex, offset, index) =>
                Math.abs(offset - viewport.scrollLeft) <
                Math.abs(
                    metrics.offsets[nearestIndex] - viewport.scrollLeft,
                )
                    ? index
                    : nearestIndex,
            0,
        );
        const maxScrollLeft = metrics.maxScrollLeft;
        const scrollLeft = Math.max(
            0,
            Math.min(viewport.scrollLeft, maxScrollLeft),
        );
        const hasScrollableOverflow =
            maxScrollLeft > CAROUSEL_EDGE_TOLERANCE;
        const normalizedProgress = hasScrollableOverflow
            ? scrollLeft / maxScrollLeft
            : 1;
        const nextProgressIndex = Math.max(
            0,
            Math.min(
                metrics.slides.length - 1,
                Math.round(
                    normalizedProgress * (metrics.slides.length - 1),
                ),
            ),
        );

        commitCarouselState({
            selectedIndex: nearestSlideIndex,
            progressIndex: nextProgressIndex,
            canScrollPrev:
                hasScrollableOverflow &&
                scrollLeft > CAROUSEL_EDGE_TOLERANCE,
            canScrollNext:
                hasScrollableOverflow &&
                maxScrollLeft - scrollLeft > CAROUSEL_EDGE_TOLERANCE,
        });
    }, [commitCarouselState, measureCarousel]);

    const scrollToSlide = useCallback(
        (targetIndex: number) => {
            const viewport = viewportRef.current;
            if (!viewport) return;

            const cachedMetrics = carouselMetricsRef.current;
            const metrics =
                cachedMetrics.viewport === viewport &&
                cachedMetrics.slides.length > 0
                    ? cachedMetrics
                    : measureCarousel();
            const safeIndex = Math.max(
                0,
                Math.min(targetIndex, metrics.slides.length - 1),
            );
            const targetOffset = metrics.offsets[safeIndex];

            if (targetOffset === undefined) return;

            viewport.scrollTo({ left: targetOffset });
        },
        [measureCarousel],
    );

    const finishPointerDrag = useCallback(
        (pointerId: number, endTimestamp: number) => {
            const viewport = viewportRef.current;
            const drag = pointerDragRef.current;

            if (!viewport || drag.pointerId !== pointerId) return;

            const slides = getCarouselSlides(viewport);
            const nearestIndex =
                slides.length > 0
                    ? getNearestSlideIndex(viewport, slides)
                    : 0;
            const shouldSnap = drag.hasMoved && slides.length > 0;
            const slideSpan =
                slides.length > 1
                    ? Math.abs(slides[1].offsetLeft - slides[0].offsetLeft)
                    : slides[0]?.clientWidth || viewport.clientWidth;
            const intentThreshold = Math.min(
                POINTER_INTENT_MAXIMUM,
                Math.max(POINTER_INTENT_MINIMUM, slideSpan * 0.1),
            );
            const dragDistance = drag.lastX - drag.startX;
            const idleTime = Math.max(
                0,
                endTimestamp - drag.lastTimestamp,
            );
            const velocityRetention = Math.max(
                0,
                1 - idleTime / POINTER_VELOCITY_DECAY_WINDOW,
            );
            const projectedDistance =
                dragDistance +
                drag.velocityX *
                    velocityRetention *
                    POINTER_VELOCITY_PROJECTION;
            let targetIndex = drag.startIndex;

            if (
                shouldSnap &&
                Math.abs(projectedDistance) >= intentThreshold
            ) {
                const direction = projectedDistance < 0 ? 1 : -1;
                const intentIndex = Math.max(
                    0,
                    Math.min(
                        drag.startIndex + direction,
                        slides.length - 1,
                    ),
                );

                targetIndex =
                    direction > 0
                        ? Math.max(nearestIndex, intentIndex)
                        : Math.min(nearestIndex, intentIndex);
            }

            pointerDragRef.current = createIdlePointerDrag();
            viewport.removeAttribute("data-dragging");

            if (viewport.hasPointerCapture(pointerId)) {
                viewport.releasePointerCapture(pointerId);
            }

            if (shouldSnap) {
                window.requestAnimationFrame(() =>
                    scrollToSlide(targetIndex),
                );
            }
        },
        [scrollToSlide],
    );

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (
                event.pointerType !== "mouse" ||
                event.button !== 0 ||
                event.currentTarget.scrollWidth <=
                    event.currentTarget.clientWidth
            ) {
                return;
            }

            const target = event.target as HTMLElement;
            if (
                target.closest(
                    "a, button, input, select, textarea, [role='button']",
                )
            ) {
                return;
            }

            const viewport = event.currentTarget;
            const slides = getCarouselSlides(viewport);
            pointerDragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startScrollLeft: viewport.scrollLeft,
                startIndex:
                    slides.length > 0
                        ? getNearestSlideIndex(viewport, slides)
                        : 0,
                lastX: event.clientX,
                lastTimestamp: event.timeStamp,
                velocityX: 0,
                hasMoved: false,
            };
            viewport.setPointerCapture(event.pointerId);
        },
        [],
    );

    const handlePointerMove = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const drag = pointerDragRef.current;
            if (drag.pointerId !== event.pointerId) return;

            if (event.buttons === 0) {
                finishPointerDrag(event.pointerId, event.timeStamp);
                return;
            }

            const movement = event.clientX - drag.startX;
            if (
                !drag.hasMoved &&
                Math.abs(movement) < POINTER_DRAG_THRESHOLD
            ) {
                return;
            }

            event.preventDefault();

            const elapsed = Math.max(
                1,
                event.timeStamp - drag.lastTimestamp,
            );
            const instantaneousVelocity =
                (event.clientX - drag.lastX) / elapsed;
            const boundedVelocity = Math.max(
                -POINTER_VELOCITY_LIMIT,
                Math.min(POINTER_VELOCITY_LIMIT, instantaneousVelocity),
            );
            drag.velocityX =
                drag.velocityX * 0.64 + boundedVelocity * 0.36;
            drag.lastX = event.clientX;
            drag.lastTimestamp = event.timeStamp;

            if (!drag.hasMoved) {
                drag.hasMoved = true;
                event.currentTarget.dataset.dragging = "true";
            }

            event.currentTarget.scrollLeft =
                drag.startScrollLeft - movement * POINTER_DRAG_GAIN;
        },
        [finishPointerDrag],
    );

    const handlePointerEnd = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            finishPointerDrag(event.pointerId, event.timeStamp);
        },
        [finishPointerDrag],
    );

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;

        let animationFrame = 0;
        let needsMeasurement = true;
        const flushSync = () => {
            animationFrame = 0;

            if (needsMeasurement) {
                measureCarousel();
                needsMeasurement = false;
            }

            syncCarouselState();
        };
        const scheduleSync = () => {
            if (animationFrame === 0) {
                animationFrame = window.requestAnimationFrame(flushSync);
            }
        };
        const scheduleMeasurement = () => {
            needsMeasurement = true;
            scheduleSync();
        };
        const resizeObserver = window.ResizeObserver
            ? new window.ResizeObserver(scheduleMeasurement)
            : null;

        viewport.scrollTo({ left: 0 });
        viewport.addEventListener("scroll", scheduleSync, { passive: true });
        window.addEventListener("resize", scheduleMeasurement);
        resizeObserver?.observe(viewport);
        Array.from(viewport.children).forEach((child) =>
            resizeObserver?.observe(child),
        );
        scheduleMeasurement();

        return () => {
            window.cancelAnimationFrame(animationFrame);
            viewport.removeEventListener("scroll", scheduleSync);
            window.removeEventListener("resize", scheduleMeasurement);
            resizeObserver?.disconnect();
        };
    }, [activeClasses.length, measureCarousel, syncCarouselState]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        const targets = Array.from(
            section.querySelectorAll<HTMLElement>("[data-pcs-reveal]"),
        );
        const revealTarget = (target: HTMLElement) => {
            target.dataset.pcsRevealed = "true";
        };
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion || typeof IntersectionObserver === "undefined") {
            targets.forEach(revealTarget);
            return;
        }

        const pendingTargets = new Set(
            targets.filter((target) => target.dataset.pcsRevealed !== "true"),
        );
        let observer: IntersectionObserver | null = null;
        let scrollFrame = 0;
        let fallbackAttached = false;

        function detachFallback() {
            if (!fallbackAttached) return;
            window.removeEventListener("scroll", schedulePassedCheck);
            window.removeEventListener("resize", schedulePassedCheck);
            fallbackAttached = false;
        }

        function completeReveal(target: HTMLElement) {
            revealTarget(target);
            pendingTargets.delete(target);
            observer?.unobserve(target);
            if (pendingTargets.size === 0) detachFallback();
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
                    if (entry.isIntersecting) {
                        completeReveal(entry.target as HTMLElement);
                    } else if (entry.boundingClientRect.bottom <= 0) {
                        completeReveal(entry.target as HTMLElement);
                    }
                });
            },
            { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
        );

        targets.forEach((target) => {
            if (target.dataset.pcsRevealed === "true") return;
            if (target.getBoundingClientRect().bottom <= 0) {
                completeReveal(target);
            } else {
                observer?.observe(target);
            }
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
            detachFallback();
        };
    }, [activeClasses.length]);

    useEffect(() => {
        const section = sectionRef.current;
        const viewport = viewportRef.current;
        if (!section) return;

        const slides = viewport ? getCarouselSlides(viewport) : [];
        const scheduler = window as IdleSchedulerWindow;
        let sectionIsNearViewport = false;
        let motionIdleFrame = 0;
        let visibleSlidesFrame = 0;
        let lastPageScrollY = window.scrollY;
        let lastCarouselScrollLeft = viewport?.scrollLeft ?? 0;
        let lastMotionTimestamp = 0;
        let mediaCancelled = false;
        const mediaIdleHandles = new Set<number>();
        const mediaTimeoutHandles = new Set<number>();
        const queuedMedia = new Set<string>();
        const mediaQueue: string[] = [];
        let mediaPreparationRunning = false;

        const markImagePrepared = (source: string) => {
            setPreparedImages((current) => {
                if (current.has(source)) return current;
                const next = new Set(current);
                next.add(source);
                return next;
            });
        };
        const scheduleImagePreparation = (source: string) => {
            if (!source || queuedMedia.has(source)) return;
            if (preparedClassImages.has(source)) {
                markImagePrepared(source);
                return;
            }

            queuedMedia.add(source);
            mediaQueue.push(source);
            scheduleNextImagePreparation();
        };

        function scheduleNextImagePreparation() {
            if (
                mediaCancelled ||
                mediaPreparationRunning ||
                mediaQueue.length === 0
            ) {
                return;
            }

            mediaPreparationRunning = true;

            const prepare = () => {
                const source = mediaQueue.shift();
                if (!source || mediaCancelled) {
                    mediaPreparationRunning = false;
                    return;
                }

                void prepareClassImage(source)
                    .then(() => {
                        if (!mediaCancelled) markImagePrepared(source);
                    })
                    .finally(() => {
                        mediaPreparationRunning = false;
                        scheduleNextImagePreparation();
                    });
            };

            if (scheduler.requestIdleCallback) {
                const handle = scheduler.requestIdleCallback(prepare, {
                    timeout: 1200,
                });
                mediaIdleHandles.add(handle);
            } else {
                const handle = window.setTimeout(prepare, 120);
                mediaTimeoutHandles.add(handle);
            }
        }

        const setCardMotionPaused = (paused: boolean) => {
            const nextValue = String(paused);

            if (section.dataset.cardMotionPaused !== nextValue) {
                section.dataset.cardMotionPaused = nextValue;
            }
            if (section.dataset.textMotionPaused !== nextValue) {
                section.dataset.textMotionPaused = nextValue;
            }
        };
        const stopMotionIdleMonitor = () => {
            if (motionIdleFrame === 0) return;

            window.cancelAnimationFrame(motionIdleFrame);
            motionIdleFrame = 0;
        };

        const updateSectionMotion = () => {
            const isActive = sectionIsNearViewport && !document.hidden;

            section.dataset.motionActive = String(isActive);

            if (!isActive) {
                stopMotionIdleMonitor();
                setCardMotionPaused(true);
            }
        };
        const syncVisibleSlides = () => {
            if (!viewport) return;

            const viewportRect = viewport.getBoundingClientRect();
            const viewportIsOnScreen =
                viewportRect.bottom > 0 &&
                viewportRect.top < window.innerHeight;
            const visibleIndexes: number[] = [];

            slides.forEach((slide, index) => {
                const slideRect = slide.getBoundingClientRect();
                const isVisible =
                    sectionIsNearViewport &&
                    viewportIsOnScreen &&
                    slideRect.right > viewportRect.left &&
                    slideRect.left < viewportRect.right;

                slide.dataset.cardVisible = String(isVisible);
                if (isVisible) {
                    visibleIndexes.push(index);
                    const source = activeClasses[index]?.image;
                    if (source) scheduleImagePreparation(source);
                }
            });

            const nextIndex =
                visibleIndexes.length > 0
                    ? Math.max(...visibleIndexes) + 1
                    : -1;
            const nextSource = activeClasses[nextIndex]?.image;
            if (nextSource) scheduleImagePreparation(nextSource);
        };
        const scheduleVisibleSlidesSync = () => {
            if (visibleSlidesFrame !== 0) return;

            visibleSlidesFrame = window.requestAnimationFrame(() => {
                visibleSlidesFrame = 0;
                syncVisibleSlides();
            });
        };
        const monitorMotionIdle = (timestamp: number) => {
            motionIdleFrame = 0;
            if (!sectionIsNearViewport || document.hidden) return;

            const nextPageScrollY = window.scrollY;
            const nextCarouselScrollLeft = viewport?.scrollLeft ?? 0;
            const positionChanged =
                Math.abs(nextPageScrollY - lastPageScrollY) > 0.25 ||
                Math.abs(nextCarouselScrollLeft - lastCarouselScrollLeft) >
                    0.25;

            if (positionChanged) {
                lastPageScrollY = nextPageScrollY;
                lastCarouselScrollLeft = nextCarouselScrollLeft;
                lastMotionTimestamp = timestamp;
                scheduleVisibleSlidesSync();
            }

            if (
                timestamp - lastMotionTimestamp >=
                CARD_MOTION_IDLE_DELAY
            ) {
                syncVisibleSlides();
                setCardMotionPaused(false);
                return;
            }

            motionIdleFrame = window.requestAnimationFrame(
                monitorMotionIdle,
            );
        };
        const startMotionIdleMonitor = () => {
            lastPageScrollY = window.scrollY;
            lastCarouselScrollLeft = viewport?.scrollLeft ?? 0;
            lastMotionTimestamp = window.performance.now();

            if (motionIdleFrame === 0) {
                motionIdleFrame = window.requestAnimationFrame(
                    monitorMotionIdle,
                );
            }
        };
        const suspendCardMotion = () => {
            if (!sectionIsNearViewport || document.hidden) return;

            setCardMotionPaused(true);
            scheduleVisibleSlidesSync();
            startMotionIdleMonitor();
        };
        const handleVisibilityChange = () => {
            updateSectionMotion();
            if (!document.hidden) suspendCardMotion();
        };
        const cleanupMotionActivity = () => {
            stopMotionIdleMonitor();
            window.cancelAnimationFrame(visibleSlidesFrame);
            window.removeEventListener("scroll", suspendCardMotion);
            window.removeEventListener("wheel", suspendCardMotion);
            window.removeEventListener("touchmove", suspendCardMotion);
            window.removeEventListener("resize", suspendCardMotion);
            viewport?.removeEventListener("scroll", suspendCardMotion);
        };

        slides.forEach((slide) => {
            slide.dataset.cardVisible = "false";
        });
        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange,
        );
        window.addEventListener("scroll", suspendCardMotion, {
            passive: true,
        });
        window.addEventListener("wheel", suspendCardMotion, {
            passive: true,
        });
        window.addEventListener("touchmove", suspendCardMotion, {
            passive: true,
        });
        window.addEventListener("resize", suspendCardMotion, {
            passive: true,
        });
        viewport?.addEventListener("scroll", suspendCardMotion, {
            passive: true,
        });

        if (!("IntersectionObserver" in window)) {
            sectionIsNearViewport = true;
            slides.forEach((slide) => {
                slide.dataset.cardVisible = "true";
            });
            activeClasses.forEach((item) =>
                scheduleImagePreparation(item.image),
            );
            updateSectionMotion();
            suspendCardMotion();

            return () => {
                mediaCancelled = true;
                document.removeEventListener(
                    "visibilitychange",
                    handleVisibilityChange,
                );
                cleanupMotionActivity();
                mediaIdleHandles.forEach((handle) =>
                    scheduler.cancelIdleCallback?.(handle),
                );
                mediaTimeoutHandles.forEach((handle) =>
                    window.clearTimeout(handle),
                );
            };
        }

        const sectionObserver = new IntersectionObserver(
            ([entry]) => {
                sectionIsNearViewport = entry?.isIntersecting ?? false;
                updateSectionMotion();
                syncVisibleSlides();
                if (sectionIsNearViewport) suspendCardMotion();
            },
            { rootMargin: "0px", threshold: 0.01 },
        );
        const slideObserver = viewport
            ? new IntersectionObserver(
                  (entries) => {
                      entries.forEach((entry) => {
                          const slide = entry.target as HTMLElement;
                          const viewportRect = viewport.getBoundingClientRect();
                          const viewportIsOnScreen =
                              viewportRect.bottom > 0 &&
                              viewportRect.top < window.innerHeight;
                          const isVisible =
                              sectionIsNearViewport &&
                              viewportIsOnScreen &&
                              entry.isIntersecting &&
                              entry.intersectionRatio > 0;
                          slide.dataset.cardVisible = String(isVisible);
                      });
                  },
                  {
                      root: viewport,
                      rootMargin: "0px 24px",
                      threshold: 0.01,
                  },
              )
            : null;
        const mediaObserver = viewport
            ? new IntersectionObserver(
                  (entries) => {
                      entries.forEach((entry) => {
                          if (!sectionIsNearViewport || !entry.isIntersecting) {
                              return;
                          }
                          const slideIndex = slides.indexOf(
                              entry.target as HTMLElement,
                          );
                          const source = activeClasses[slideIndex]?.image;
                          if (source) scheduleImagePreparation(source);
                      });
                  },
                  {
                      root: viewport,
                      rootMargin: "0px 18%",
                      threshold: 0,
                  },
              )
            : null;

        sectionObserver.observe(section);
        slides.forEach((slide) => {
            slideObserver?.observe(slide);
            mediaObserver?.observe(slide);
        });

        return () => {
            mediaCancelled = true;
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
            cleanupMotionActivity();
            sectionObserver.disconnect();
            slideObserver?.disconnect();
            mediaObserver?.disconnect();
            mediaIdleHandles.forEach((handle) =>
                scheduler.cancelIdleCallback?.(handle),
            );
            mediaTimeoutHandles.forEach((handle) =>
                window.clearTimeout(handle),
            );
        };
    }, [activeClasses]);

    return (
        <section
            ref={sectionRef}
            className="pricing-class-section"
            id="pricing-classes"
            aria-labelledby="pricing-class-heading"
            data-pcs-entrance="ready"
            data-motion-active="false"
            data-card-motion-paused="true"
            data-text-motion-paused="false"
            data-pcs-media-prepared={
                activeClasses.length === 0 ||
                preparedImages.has(activeClasses[0].image)
            }
        >
            <div className="pcs__divider" data-pcs-reveal="divider">
                <SectionDivider
                    number="03"
                    title="Kelas Kebugaran"
                    subtitle="05 pricingpage"
                    theme="dark"
                />
            </div>

            <div className="pcs__container">
                <div className="pcs__intro">
                    <div className="pcs__copy" data-pcs-reveal="copy">
                        <div className="pcs__eyebrow">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="home-section-anchor pcs__eyebrow-text">
                                Pilihan Kelas Kebugaran
                            </ScrollTextReveal>
                        </div>
                        <div id="pricing-class-heading">
                            <PricingSectionHeadline
                                theme="dark"
                                className="pcs__heading"
                            >
                                {PRICING_CLASS_HEADING}
                            </PricingSectionHeadline>
                        </div>
                    </div>

                    <div className="pcs__actions" data-pcs-reveal="actions">
                        <BookingLink />
                        {activeClasses.length > 0 && (
                            <div
                                className="pcs__carousel-status"
                                aria-label="Kontrol daftar kelas"
                            >
                                <span
                                    className="pcs__counter"
                                    aria-live="polite"
                                >
                                    {String(progressIndex + 1).padStart(2, "0")}
                                    <span aria-hidden="true">/</span>
                                    {String(activeClasses.length).padStart(
                                        2,
                                        "0",
                                    )}
                                </span>
                                <div className="pcs__controls">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            scrollToSlide(selectedIndex - 1)
                                        }
                                        aria-label="Kelas sebelumnya"
                                        className="pcs__control pcs__control--previous"
                                        disabled={!canScrollPrev}
                                    >
                                        <ArrowLeft />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            scrollToSlide(selectedIndex + 1)
                                        }
                                        aria-label="Kelas berikutnya"
                                        className="pcs__control pcs__control--next"
                                        disabled={!canScrollNext}
                                    >
                                        <ArrowRight />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {activeClasses.length > 0 ? (
                    <div
                        className="pcs__carousel"
                        data-pcs-reveal="carousel"
                        data-can-scroll-next={canScrollNext ? "true" : "false"}
                        role="region"
                        aria-roledescription="carousel"
                        aria-label="Daftar kelas kebugaran"
                    >
                        <div
                            className="pcs__viewport"
                            ref={viewportRef}
                            tabIndex={0}
                            aria-label="Geser untuk melihat kelas lainnya"
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerEnd}
                            onPointerCancel={handlePointerEnd}
                            onLostPointerCapture={handlePointerEnd}
                            onDragStart={(event) => event.preventDefault()}
                        >
                            <div className="pcs__track">
                                {activeClasses.map((item, index) => (
                                    <div
                                        className="pcs__slide"
                                        data-card-visible="false"
                                        role="group"
                                        aria-roledescription="slide"
                                        aria-label={`${index + 1} dari ${activeClasses.length}`}
                                        key={item.id}
                                    >
                                        <PricingClassCard
                                            item={item}
                                            eagerImage={
                                                preparedImages.has(item.image) ||
                                                preparedClassImages.has(item.image)
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div
                        className="pcs__empty"
                        role="status"
                        data-pcs-reveal="empty"
                    >
                        <span aria-hidden="true">03</span>
                        <p>Informasi kelas akan segera tersedia.</p>
                    </div>
                )}
            </div>
        </section>
    );
}
