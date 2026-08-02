import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type MouseEvent as ReactMouseEvent,
    type SyntheticEvent,
} from "react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import PricingFacilityChapter, {
    formatFacilityTitle,
    type FacilityAccordionData,
    type FacilityFact,
    type FacilityRateData,
    type FacilityRateGroup,
} from "./PricingAccordionItem";
import PricingSectionHeadline from "./PricingSectionHeadline";
import PricingBookingLink from "./PricingBookingLink";
import { isOutdoorFacility } from "@/lib/facilityClassification";

interface BackendFacilityPrice {
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
}

interface BackendFacilityUnit {
    id: number | string;
    name?: string | null;
    image?: string | null;
    use_custom_pricing?: boolean | null;
    prices?: BackendFacilityPrice[] | null;
}

interface BackendFacility {
    id: number | string;
    name?: string | null;
    description?: string | null;
    slug?: string | null;
    image?: string | null;
    category?: string | null;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    rating?: number | null;
    display_metadata?: Record<string, unknown> | null;
    prices?: BackendFacilityPrice[] | null;
    units?: BackendFacilityUnit[] | null;
    price_range?: string | null;
}

interface Props {
    facilities?: BackendFacility[];
}

type UnknownRecord = Record<string, unknown>;
type ThumbnailRevealDirection = "up" | "down";

interface ActiveThumbnailState {
    itemId: string | null;
    revealDirection: ThumbnailRevealDirection;
}

const FALLBACK_IMAGE = "/assets/images/comingsoon.avif";
const preparedAccordionImages = new Set<string>();
const accordionImagePreparationTasks = new Map<string, Promise<void>>();

type AccordionIdleSchedulerWindow = Window & {
    requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
};

const prepareAccordionImage = (source: string) => {
    if (!source || typeof Image === "undefined") return Promise.resolve();
    if (preparedAccordionImages.has(source)) return Promise.resolve();

    const pendingTask = accordionImagePreparationTasks.get(source);
    if (pendingTask) return pendingTask;

    const task = new Promise<void>((resolve) => {
        const image = new Image();
        image.decoding = "async";
        image.fetchPriority = "low";

        const finish = () => {
            preparedAccordionImages.add(source);
            accordionImagePreparationTasks.delete(source);
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

    accordionImagePreparationTasks.set(source, task);
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

const cleanText = (value: unknown) =>
    typeof value === "string" || typeof value === "number"
        ? String(value).trim()
        : "";

const handleDirectoryImageError = (
    event: SyntheticEvent<HTMLImageElement>,
) => {
    if (event.currentTarget.src.endsWith(FALLBACK_IMAGE)) return;
    event.currentTarget.src = FALLBACK_IMAGE;
};

const isRecord = (value: unknown): value is UnknownRecord =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    })
        .format(value)
        .replace(/\s/g, "");

const numericPrice = (value: number | string | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;

    const text = cleanText(value);
    if (!text) return null;

    const compact = text.replace(/[^\d,.-]/g, "");
    const isNegative = compact.startsWith("-");
    const unsigned = compact.replace(/-/g, "");
    const lastComma = unsigned.lastIndexOf(",");
    const lastDot = unsigned.lastIndexOf(".");
    let normalized = unsigned;

    if (lastComma >= 0 && lastDot >= 0) {
        const decimalSeparator = lastComma > lastDot ? "," : ".";
        const thousandsSeparator = decimalSeparator === "," ? "." : ",";
        normalized = unsigned.split(thousandsSeparator).join("");
        const decimalIndex = normalized.lastIndexOf(decimalSeparator);
        normalized = `${normalized.slice(0, decimalIndex).replaceAll(decimalSeparator, "")}.${normalized.slice(decimalIndex + 1)}`;
    } else if (lastComma >= 0 || lastDot >= 0) {
        const separator = lastComma >= 0 ? "," : ".";
        const parts = unsigned.split(separator);
        const fraction = parts.at(-1) ?? "";

        normalized =
            fraction.length > 0 && fraction.length <= 2
                ? `${parts.slice(0, -1).join("")}.${fraction}`
                : parts.join("");
    }

    const parsed = Number(`${isNegative ? "-" : ""}${normalized}`);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatPriceValue = (value: number | string | null | undefined) => {
    const numeric = numericPrice(value);
    if (numeric !== null) return numeric === 0 ? "Gratis" : formatCurrency(numeric);
    return cleanText(value) || "Hubungi kami";
};

const priceRangeFromDatabase = (
    prices: BackendFacilityPrice[] | null | undefined,
) => {
    if (!Array.isArray(prices)) return "";

    const amounts = prices
        .map((price) => numericPrice(price?.price))
        .filter((price): price is number => price !== null);
    if (amounts.length === 0) return "";

    const minimum = Math.min(...amounts);
    const maximum = Math.max(...amounts);
    const range =
        minimum === maximum
            ? formatPriceValue(minimum)
            : `${formatPriceValue(minimum)} – ${formatPriceValue(maximum)}`;
    const durations = Array.from(
        new Set(
            prices
                .map((price) => price?.duration_minutes)
                .filter(
                    (duration): duration is number =>
                        typeof duration === "number" && duration > 0,
                ),
        ),
    );

    if (durations.length !== 1) return range;
    const duration = durations[0];
    const suffix =
        duration === 60
            ? "/ Jam"
            : duration % 60 === 0
              ? `/ ${duration / 60} Jam`
              : `/ ${duration} Menit`;

    return `${range} ${suffix}`;
};

const humanizeAudience = (value: unknown) => {
    const normalized = cleanText(value).toLocaleLowerCase("id-ID");
    const known: Record<string, string> = {
        warga_ub: "Warga UB",
        warga_kampus: "Warga UB",
        mahasiswa: "Mahasiswa",
        umum: "Umum",
        public: "Umum",
        general: "Umum",
        guest: "Tamu",
    };

    if (known[normalized]) return known[normalized];
    if (!normalized) return "Tarif Fasilitas";

    return normalized
        .split(/[_-]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toLocaleUpperCase("id-ID") + word.slice(1))
        .join(" ");
};

const localizeVenueType = (value: unknown, fallback: unknown) => {
    const venue = cleanText(value);
    const normalized = venue.toLocaleLowerCase("id-ID");

    if (/indoor|tertutup/.test(normalized)) return "Arena Tertutup";
    if (/outdoor|terbuka/.test(normalized)) return "Arena Terbuka";
    return venue || cleanText(fallback) || "Fasilitas Olahraga";
};

const formatDuration = (duration: number | null | undefined, label: string) => {
    if (!duration || duration <= 0 || /jam|menit|sesi/i.test(label)) return "";
    if (duration === 60) return "/ jam";
    if (duration % 60 === 0) return `/ ${duration / 60} jam`;
    return `/ ${duration} menit`;
};

const formatSchedule = (price: BackendFacilityPrice) => {
    const days = Array.isArray(price.applicable_days)
        ? price.applicable_days
              .map((day) => DAY_LABELS[cleanText(day).toLocaleLowerCase("id-ID")] ?? cleanText(day))
              .filter(Boolean)
        : [];
    const time =
        cleanText(price.starts_at) && cleanText(price.ends_at)
            ? `${cleanText(price.starts_at).slice(0, 5)}–${cleanText(price.ends_at).slice(0, 5)}`
            : "";
    const period =
        cleanText(price.starts_on) && cleanText(price.ends_on)
            ? `${cleanText(price.starts_on)}–${cleanText(price.ends_on)}`
            : "";

    return [days.join(", "), time, period].filter(Boolean).join(" / ");
};

function priceGroupsFromDatabase(
    prices: BackendFacilityPrice[] | null | undefined,
): FacilityRateGroup[] {
    if (!Array.isArray(prices)) return [];

    const grouped = new Map<string, FacilityRateGroup>();

    prices.forEach((price, index) => {
        if (!price) return;
        const audience = humanizeAudience(price.user_category);
        const groupKey = cleanText(price.user_category).toLocaleLowerCase("id-ID") || "facility";
        const label = cleanText(price.label) || "Tarif reguler";
        const rate: FacilityRateData = {
            id: `database-${cleanText(price.id) || index}-${index}`,
            label,
            value: formatPriceValue(price.price),
            duration: formatDuration(price.duration_minutes, label),
            schedule: formatSchedule(price),
            note: cleanText(price.notes),
        };

        const current = grouped.get(groupKey);
        if (current) {
            current.rates.push(rate);
        } else {
            grouped.set(groupKey, {
                id: `audience-${groupKey}`,
                label: audience,
                rates: [rate],
            });
        }
    });

    return Array.from(grouped.values()).filter((group) => group.rates.length > 0);
}

function priceGroupsFromUnits(
    units: BackendFacilityUnit[] | null | undefined,
): FacilityRateGroup[] {
    if (!Array.isArray(units)) return [];

    return units.flatMap((unit, unitIndex) => {
        if (!unit?.use_custom_pricing || !Array.isArray(unit.prices)) return [];
        const unitId = cleanText(unit.id) || String(unitIndex);
        const unitName = cleanText(unit.name) || `Unit ${unitIndex + 1}`;

        return priceGroupsFromDatabase(unit.prices).map((group) => ({
            ...group,
            id: `unit-${unitId}-${group.id}`,
            label: `${unitName} · ${group.label}`,
            rates: group.rates.map((rate) => ({
                ...rate,
                id: `unit-${unitId}-${rate.id}`,
            })),
        }));
    });
}

function metadataRateGroups(metadata: UnknownRecord): FacilityRateGroup[] {
    const pricingPresentation = isRecord(metadata.pricingPresentation)
        ? metadata.pricingPresentation
        : {};
    const outdoorRates = Array.isArray(pricingPresentation.outdoorRates)
        ? pricingPresentation.outdoorRates
        : [];
    const presentationRates = outdoorRates
        .map((entry, index): FacilityRateData | null => {
            if (!isRecord(entry)) return null;
            const label = cleanText(entry.label);
            const value = cleanText(entry.value);
            if (!label && !value) return null;

            return {
                id: `presentation-outdoor-${index}`,
                label: label || "Tarif arena",
                value: value || "Hubungi kami",
            };
        })
        .filter((rate): rate is FacilityRateData => rate !== null);

    if (presentationRates.length > 0) {
        return [{
            id: "presentation-outdoor-rates",
            label: "Daftar Harga",
            rates: presentationRates,
        }];
    }

    const groups: FacilityRateGroup[] = [];
    const periods = Array.isArray(metadata.periods) ? metadata.periods : [];
    const periodRates = periods
        .map((entry, index): FacilityRateData | null => {
            if (!isRecord(entry)) return null;
            const label = cleanText(entry.label);
            const value = cleanText(entry.harga);
            if (!label && !value) return null;
            return {
                id: `metadata-period-${index}`,
                label: label || "Periode",
                value: value || "Hubungi kami",
            };
        })
        .filter((rate): rate is FacilityRateData => rate !== null);

    if (periodRates.length > 0) {
        groups.push({
            id: "metadata-periods",
            label: "Paket & Durasi",
            rates: periodRates,
        });
    }

    const daftarHarga = isRecord(metadata.daftarHarga) ? metadata.daftarHarga : {};
    const priceEntries = [
        ...(Array.isArray(daftarHarga.left) ? daftarHarga.left : []),
        ...(Array.isArray(daftarHarga.right) ? daftarHarga.right : []),
    ];
    const metadataPrices = priceEntries
        .map((entry, index): FacilityRateData | null => {
            if (!isRecord(entry)) return null;
            const label = cleanText(entry.label);
            const value = cleanText(entry.harga);
            if (!label && !value) return null;
            return {
                id: `metadata-price-${index}`,
                label: label || "Tarif tambahan",
                value: value || "Hubungi kami",
            };
        })
        .filter((rate): rate is FacilityRateData => rate !== null);

    if (metadataPrices.length > 0) {
        groups.push({
            id: "metadata-prices",
            label: "Tarif Tambahan",
            rates: metadataPrices,
        });
    }

    if (groups.length === 0 && Array.isArray(metadata.pricingDetails)) {
        const legacyRates = metadata.pricingDetails
            .map((entry, index): FacilityRateData | null => {
                const label = isRecord(entry) ? cleanText(entry.label) : cleanText(entry);
                if (!label) return null;
                return {
                    id: `legacy-price-${index}`,
                    label: "Tarif fasilitas",
                    value: label,
                };
            })
            .filter((rate): rate is FacilityRateData => rate !== null);

        if (legacyRates.length > 0) {
            groups.push({
                id: "legacy-prices",
                label: "Daftar Harga",
                rates: legacyRates,
            });
        }
    }

    return groups;
}

function factsFromMetadata(metadata: UnknownRecord): FacilityFact[] {
    if (!Array.isArray(metadata.additionalDetails)) return [];

    return metadata.additionalDetails
        .map((entry): FacilityFact | null => {
            if (!isRecord(entry)) return null;
            const label = cleanText(entry.key);
            const value = cleanText(entry.value);
            if (!label || !value) return null;
            return { label, value };
        })
        .filter((fact): fact is FacilityFact => fact !== null);
}

function mapFacility(
    facility: BackendFacility,
    index: number,
): FacilityAccordionData {
    const metadata = isRecord(facility.display_metadata)
        ? facility.display_metadata
        : {};
    const databaseGroups = priceGroupsFromDatabase(facility.prices);
    const unitGroups = priceGroupsFromUnits(facility.units);
    const editorialGroups = metadataRateGroups(metadata);
    const structuredGroups = [...databaseGroups, ...unitGroups];
    // Structured prices are canonical. Legacy/editorial metadata remains a
    // complete fallback for facilities that have not migrated yet, avoiding
    // duplicate or contradictory tariffs when both formats are present.
    const hasPublicPresentation =
        isRecord(metadata.pricingPresentation) &&
        Array.isArray(metadata.pricingPresentation.outdoorRates) &&
        metadata.pricingPresentation.outdoorRates.length > 0;
    const rateGroups = hasPublicPresentation
        ? editorialGroups
        : structuredGroups.length > 0
          ? structuredGroups
          : editorialGroups;
    const unitPrices = Array.isArray(facility.units)
        ? facility.units.flatMap((unit) =>
              unit?.use_custom_pricing && Array.isArray(unit.prices)
                  ? unit.prices
                  : [],
          )
        : [];
    const effectivePrices = [
        ...(Array.isArray(facility.prices) ? facility.prices : []),
        ...unitPrices,
    ];
    const numericPrices = effectivePrices
        .map((price) => numericPrice(price?.price))
        .filter((price): price is number => price !== null);
    const minimumPrice = numericPrices.length > 0 ? Math.min(...numericPrices) : null;
    const title = cleanText(facility.name) || "Fasilitas Tanpa Nama";
    const description =
        cleanText(facility.description) ||
        `Temukan jadwal dan tarif ${title} untuk Warga UB dan masyarakat umum.`;
    const fallbackRate = rateGroups[0]?.rates[0]?.value;
    const databasePriceRange = priceRangeFromDatabase(effectivePrices);

    return {
        id: `facility-${cleanText(facility.id) || index}`,
        title,
        description,
        image: cleanText(facility.image) || FALLBACK_IMAGE,
        location: cleanText(facility.location) || "Lokasi belum ditentukan",
        category: cleanText(facility.category) || "Fasilitas",
        venueType: localizeVenueType(facility.venue_type, facility.category),
        badgeLocation: cleanText(facility.location) || "Veteran",
        badgeType: cleanText(facility.venue_type) || "Arena Luar",
        priceRange:
            databasePriceRange ||
            (cleanText(facility.price_range) &&
            !/belum tersedia/i.test(cleanText(facility.price_range))
                ? cleanText(facility.price_range)
                : minimumPrice !== null
                  ? `Mulai ${formatCurrency(minimumPrice)}`
                  : fallbackRate || "Tarif sedang diperbarui"),
        hasRates: rateGroups.some((group) => group.rates.length > 0),
        rateGroups,
        facts: factsFromMetadata(metadata),
    };
}

function FacilityBookingLink({ compact = false }: { compact?: boolean }) {
    return (
        <PricingBookingLink
            className={`pfa__booking${compact ? " pfa__booking--compact" : ""}`}
            label="Mulai Reservasi Sekarang"
        />
    );
}

export default function PricingAccordionSection({ facilities = [] }: Props) {
    const items = useMemo(
        () => facilities.filter(isOutdoorFacility).map(mapFacility),
        [facilities],
    );
    const [activeThumbnail, setActiveThumbnail] = useState<ActiveThumbnailState>(
        {
            itemId: null,
            revealDirection: "down",
        },
    );
    const activeItemId = activeThumbnail.itemId;
    const [mobileOpenItemId, setMobileOpenItemId] = useState<string | null>(null);
    const [hasMobileEntered, setHasMobileEntered] = useState(false);
    const sectionRef = useRef<HTMLElement | null>(null);
    const mobileToggleLockRef = useRef<number | null>(null);
    const activeThumbnailRef = useRef<ActiveThumbnailState>(activeThumbnail);
    const chapterNodes = useRef(new Map<string, HTMLElement>());
    const visibleEntries = useRef(
        new Map<string, IntersectionObserverEntry>(),
    );
    const scrollDirection = useRef<ThumbnailRevealDirection>("down");
    const revealDirectionByItem = useRef(
        new Map<string, ThumbnailRevealDirection>(),
    );

    const activateItemWithReveal = useCallback(
        (
            itemId: string,
            direction: ThumbnailRevealDirection = scrollDirection.current,
        ) => {
            if (activeThumbnailRef.current.itemId === itemId) return;

            revealDirectionByItem.current.set(itemId, direction);
            const nextState: ActiveThumbnailState = {
                itemId,
                revealDirection: direction,
            };

            activeThumbnailRef.current = nextState;
            setActiveThumbnail(nextState);
        },
        [],
    );

    useEffect(() => {
        return () => {
            if (mobileToggleLockRef.current !== null) {
                window.clearTimeout(mobileToggleLockRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const node = sectionRef.current;

        if (items.length === 0) {
            setHasMobileEntered(false);
            return;
        }
        if (!node || hasMobileEntered) return;

        const enterSection = () => {
            const firstItem = items[0];
            if (!firstItem) return;

            setHasMobileEntered(true);
            setMobileOpenItemId((current) => {
                const nextId = current ?? firstItem.id;

                return nextId;
            });
        };

        if (!("IntersectionObserver" in window)) {
            enterSection();
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                enterSection();
                observer.disconnect();
            },
            {
                threshold: 0.18,
                rootMargin: "0px 0px -16% 0px",
            },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [hasMobileEntered, items]);

    useEffect(() => {
        if (items.length === 0) {
            const emptyState: ActiveThumbnailState = {
                itemId: null,
                revealDirection: scrollDirection.current,
            };

            activeThumbnailRef.current = emptyState;
            setActiveThumbnail(emptyState);
            setMobileOpenItemId(null);
            return;
        }

        const currentThumbnail = activeThumbnailRef.current;
        if (
            currentThumbnail.itemId !== null &&
            !items.some((item) => item.id === currentThumbnail.itemId)
        ) {
            const nextState: ActiveThumbnailState = {
                itemId: null,
                revealDirection: scrollDirection.current,
            };

            activeThumbnailRef.current = nextState;
            setActiveThumbnail(nextState);
        }
        setMobileOpenItemId((current) => {
            if (current !== null && items.some((item) => item.id === current)) {
                return current;
            }

            return hasMobileEntered ? items[0].id : null;
        });

        const syncFromHash = () => {
            const hash = window.location.hash.replace(/^#/, "");
            if (!hash.startsWith("price-")) return;

            const target = document.getElementById(hash);
            const itemId = target?.dataset.facilityId;
            if (target && itemId && items.some((item) => item.id === itemId)) {
                const direction: ThumbnailRevealDirection =
                    target.getBoundingClientRect().top >= window.innerHeight * 0.26
                        ? "down"
                        : "up";

                scrollDirection.current = direction;
                activateItemWithReveal(itemId, direction);
                setMobileOpenItemId(itemId);

                // The chapters are rendered after Inertia has restored the page,
                // so the browser's native initial hash jump can happen too early.
                // Re-run it once layout exists; scroll-margin handles the fixed nav.
                window.requestAnimationFrame(() => {
                    target.scrollIntoView({ behavior: "auto", block: "start" });
                });
            }
        };

        syncFromHash();
        window.addEventListener("hashchange", syncFromHash);

        if (!("IntersectionObserver" in window)) {
            activateItemWithReveal(items[0].id, scrollDirection.current);
            return () => window.removeEventListener("hashchange", syncFromHash);
        }

        visibleEntries.current.clear();
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const itemId = (entry.target as HTMLElement).dataset.facilityId;
                    if (!itemId) return;

                    if (entry.isIntersecting) {
                        visibleEntries.current.set(itemId, entry);
                    } else {
                        visibleEntries.current.delete(itemId);
                    }
                });

                const anchorLine = window.innerHeight * 0.26;
                const activeItem = Array.from(visibleEntries.current.keys()).sort(
                    (firstId, secondId) => {
                        const firstTop =
                            chapterNodes.current
                                .get(firstId)
                                ?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
                        const secondTop =
                            chapterNodes.current
                                .get(secondId)
                                ?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;

                        return (
                            Math.abs(firstTop - anchorLine) -
                            Math.abs(secondTop - anchorLine)
                        );
                    },
                )[0];

                if (activeItem) {
                    activateItemWithReveal(activeItem, scrollDirection.current);
                }
            },
            {
                rootMargin: "-18% 0px -58% 0px",
                threshold: 0,
            },
        );

        chapterNodes.current.forEach((node) => observer.observe(node));

        return () => {
            observer.disconnect();
            visibleEntries.current.clear();
            window.removeEventListener("hashchange", syncFromHash);
        };
    }, [activateItemWithReveal, hasMobileEntered, items]);

    useEffect(() => {
        let animationFrame = 0;
        let lastScrollPosition = window.scrollY;

        const updateScrollDirection = () => {
            animationFrame = 0;

            const nextScrollPosition = window.scrollY;
            const scrollDelta = nextScrollPosition - lastScrollPosition;

            if (Math.abs(scrollDelta) >= 1) {
                scrollDirection.current = scrollDelta > 0 ? "down" : "up";
            }
            lastScrollPosition = nextScrollPosition;
        };

        const requestScrollDirectionUpdate = () => {
            if (animationFrame) return;
            animationFrame = window.requestAnimationFrame(updateScrollDirection);
        };

        window.addEventListener("scroll", requestScrollDirectionUpdate, {
            passive: true,
        });

        return () => {
            if (animationFrame) window.cancelAnimationFrame(animationFrame);
            window.removeEventListener("scroll", requestScrollDirectionUpdate);
        };
    }, []);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || items.length === 0) return;

        const scheduler = window as AccordionIdleSchedulerWindow;
        const itemById = new Map(items.map((item) => [item.id, item]));
        const itemIdsBySource = new Map<string, string[]>();
        const queuedSources = new Set<string>();
        const queue: string[] = [];
        let cancelled = false;
        let scheduled = false;
        let idleHandle: number | null = null;
        let timeoutHandle: number | null = null;

        items.forEach((item) => {
            const sourceItems = itemIdsBySource.get(item.image) ?? [];
            sourceItems.push(item.id);
            itemIdsBySource.set(item.image, sourceItems);
        });

        const markSourcePrepared = (source: string) => {
            itemIdsBySource.get(source)?.forEach((itemId) => {
                const chapter = chapterNodes.current.get(itemId);
                if (chapter) chapter.dataset.pfaMediaPrepared = "true";
            });
        };

        const scheduleNext = () => {
            if (cancelled || scheduled || queue.length === 0) return;
            scheduled = true;

            const prepareNext = () => {
                scheduled = false;
                idleHandle = null;
                timeoutHandle = null;

                if (cancelled) return;
                const source = queue.shift();
                if (!source) return;

                queuedSources.delete(source);
                void prepareAccordionImage(source).finally(() => {
                    if (cancelled) return;
                    markSourcePrepared(source);
                    scheduleNext();
                });
            };

            if (scheduler.requestIdleCallback) {
                idleHandle = scheduler.requestIdleCallback(prepareNext, {
                    timeout: 1200,
                });
                return;
            }

            timeoutHandle = window.setTimeout(prepareNext, 110);
        };

        const enqueueItem = (itemId: string) => {
            const source = itemById.get(itemId)?.image;
            if (!source) return;

            if (preparedAccordionImages.has(source)) {
                markSourcePrepared(source);
                return;
            }
            if (queuedSources.has(source)) return;

            queuedSources.add(source);
            queue.push(source);
            scheduleNext();
        };

        if (typeof IntersectionObserver === "undefined") {
            items.forEach((item) => enqueueItem(item.id));
            return () => {
                cancelled = true;
            };
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries
                    .filter((entry) => entry.isIntersecting)
                    .sort(
                        (first, second) =>
                            Math.abs(first.boundingClientRect.top) -
                            Math.abs(second.boundingClientRect.top),
                    )
                    .forEach((entry) => {
                        const itemId = (entry.target as HTMLElement).dataset
                            .facilityId;
                        if (!itemId) return;

                        enqueueItem(itemId);
                        observer.unobserve(entry.target);
                    });
            },
            {
                rootMargin: "140% 0px 140% 0px",
                threshold: 0,
            },
        );

        chapterNodes.current.forEach((chapter) => observer.observe(chapter));

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
    }, [items]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        const targets = Array.from(
            section.querySelectorAll<HTMLElement>("[data-pfa-reveal]"),
        );
        const revealTarget = (target: HTMLElement) => {
            target.dataset.pfaRevealed = "true";
        };
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion || typeof IntersectionObserver === "undefined") {
            targets.forEach(revealTarget);
            return;
        }

        const pendingTargets = new Set(
            targets.filter((target) => target.dataset.pfaRevealed !== "true"),
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
                    const target = entry.target as HTMLElement;
                    if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0) {
                        completeReveal(target);
                    }
                });
            },
            {
                rootMargin: "0px 0px -8% 0px",
                threshold: 0.06,
            },
        );

        pendingTargets.forEach((target) => {
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
        }

        return () => {
            observer?.disconnect();
            window.cancelAnimationFrame(scrollFrame);
            detachFallback();
        };
    }, [items.length]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        if (typeof IntersectionObserver === "undefined") {
            section.dataset.pfaInView = "true";
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                section.dataset.pfaInView = String(
                    Boolean(entry?.isIntersecting),
                );
            },
            {
                rootMargin: "18% 0px 18% 0px",
                threshold: 0,
            },
        );

        observer.observe(section);
        return () => observer.disconnect();
    }, []);

    const registerChapter = (itemId: string, node: HTMLElement | null) => {
        if (node) {
            chapterNodes.current.set(itemId, node);
        } else {
            chapterNodes.current.delete(itemId);
        }
    };

    const handleIndexClick = (
        event: ReactMouseEvent<HTMLAnchorElement>,
        itemId: string,
    ) => {
        if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return;
        }

        const target = chapterNodes.current.get(itemId);
        if (!target) return;

        event.preventDefault();
        const direction: ThumbnailRevealDirection =
            target.getBoundingClientRect().top >= window.innerHeight * 0.26
                ? "down"
                : "up";

        scrollDirection.current = direction;
        activateItemWithReveal(itemId, direction);
        setMobileOpenItemId(itemId);

        const reduceMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        target.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "start",
        });
        window.history.replaceState(
            window.history.state,
            "",
            `#price-${itemId}`,
        );
    };

    const handleMobileToggle = (itemId: string) => {
        if (mobileToggleLockRef.current !== null || items.length === 0) return;

        setHasMobileEntered(true);
        setMobileOpenItemId((current) => {
            const clickedIndex = items.findIndex((item) => item.id === itemId);
            const currentOpenIndex = items.findIndex((item) => item.id === current);
            const nextItem =
                current === itemId
                    ? items[(clickedIndex + 1) % items.length]
                    : items[clickedIndex];
            const nextId = nextItem?.id ?? items[0].id;
            const nextIndex = items.findIndex((item) => item.id === nextId);
            const direction: ThumbnailRevealDirection =
                currentOpenIndex >= 0 && nextIndex < currentOpenIndex ? "up" : "down";

            scrollDirection.current = direction;
            activateItemWithReveal(nextId, direction);
            window.history.replaceState(
                window.history.state,
                "",
                `#price-${nextId}`,
            );

            return nextId;
        });

        mobileToggleLockRef.current = window.setTimeout(() => {
            mobileToggleLockRef.current = null;
        }, 180);
    };

    const activeDirectoryIndex = Math.max(
        0,
        items.findIndex((item) => item.id === activeItemId),
    );

    return (
        <section
            ref={sectionRef}
            className="pricing-facility-accordion"
            id="pricing-accordion"
            data-pricing-loop-region="true"
            data-pfa-motion="ready"
            data-pfa-in-view="false"
            aria-labelledby="pricing-facility-heading"
        >
            <div className="pfa__divider" data-pfa-reveal="divider">
                <SectionDivider
                    number="04"
                    title="Arena Luar"
                    subtitle="05 pricingpage"
                    theme="dark"
                />
            </div>

            <div className="pfa__container">
                <header className="pfa__intro" data-pfa-reveal="intro">
                    <div className="pfa__intro-label">
                        <span className="section-label-diamond" aria-hidden="true" />
                        <ScrollTextReveal className="home-section-anchor pfa__intro-label-text">
                            Jadwal &amp; Tarif Outdoor
                        </ScrollTextReveal>
                    </div>

                    <div className="pfa__intro-copy">
                        <PricingSectionHeadline
                            id="pricing-facility-heading"
                            theme="dark"
                            className="pfa__headline"
                        >
                            Nikmati arena luar yang mengundang untuk kembali, rasakan setiap sesi
                            dengan lebih nyaman, lalu pilih waktu terbaik untuk bergerak.
                        </PricingSectionHeadline>
                        <div className="pfa__intro-foot">
                            <p>
                                <span>
                                    Semua harga tersusun langsung dari data setiap fasilitas agar
                                    mudah dibandingkan,
                                </span>{" "}
                                <span>
                                    lengkap dengan detail durasi, ketentuan penggunaan, dan pilihan
                                    tarif yang tersedia.
                                </span>
                            </p>
                        </div>
                    </div>

                    <FacilityBookingLink />
                </header>

                {items.length > 0 ? (
                    <div className="pfa-directory" data-pfa-reveal="directory">
                        <nav
                            className="pfa-directory__index"
                            aria-label="Indeks harga fasilitas"
                            data-pfa-reveal="index"
                        >
                            <div className="pfa-directory__index-sticky">
                                <ol className="pfa-directory__index-list">
                                    {items.map((item) => {
                                        const isActive = activeItemId === item.id;

                                        return (
                                            <li
                                                key={item.id}
                                                data-active={isActive ? "true" : "false"}
                                                data-facility-id={item.id}
                                                data-reveal-direction={
                                                    isActive
                                                        ? activeThumbnail.revealDirection
                                                        : (revealDirectionByItem.current.get(
                                                              item.id,
                                                          ) ?? "down")
                                                }
                                            >
                                                <a
                                                    href={`#price-${item.id}`}
                                                    aria-current={isActive ? "location" : undefined}
                                                    onClick={(event) =>
                                                        handleIndexClick(event, item.id)
                                                    }
                                                >
                                                    <span className="pfa-directory__link-viewport">
                                                        <span className="pfa-directory__link-rail">
                                                            <span>{formatFacilityTitle(item.title)}</span>
                                                            <span aria-hidden="true">
                                                                {formatFacilityTitle(item.title)}
                                                            </span>
                                                        </span>
                                                    </span>
                                                    <span
                                                        className="pfa-directory__thumbnail"
                                                        aria-hidden="true"
                                                    >
                                                        <img
                                                            className="pfa-directory__thumbnail-image pfa-directory__thumbnail-image--mono"
                                                            src={item.image}
                                                            alt=""
                                                            loading={
                                                                isActive
                                                                    ? "eager"
                                                                    : "lazy"
                                                            }
                                                            decoding="async"
                                                            onError={handleDirectoryImageError}
                                                        />
                                                        <span className="pfa-directory__thumbnail-reveal">
                                                            <span className="pfa-directory__thumbnail-reveal-media">
                                                                <img
                                                                    className="pfa-directory__thumbnail-image pfa-directory__thumbnail-image--color"
                                                                    src={item.image}
                                                                    alt=""
                                                                    loading="lazy"
                                                                    decoding="async"
                                                                    onError={handleDirectoryImageError}
                                                                />
                                                            </span>
                                                        </span>
                                                    </span>
                                                </a>
                                            </li>
                                        );
                                    })}
                                </ol>

                                <div
                                    className="pfa-directory__index-note"
                                    aria-hidden="true"
                                >
                                    <span className="pfa-directory__index-note-label">
                                        /Indeks fasilitas.
                                    </span>
                                    <span className="pfa-directory__index-note-count">
                                        <strong>
                                            {String(activeDirectoryIndex + 1).padStart(
                                                2,
                                                "0",
                                            )}
                                        </strong>
                                        <span>/</span>
                                        <span>
                                            {String(items.length).padStart(2, "0")}
                                        </span>
                                    </span>
                                    <span className="pfa-directory__index-note-track">
                                        {items.map((item, index) => (
                                            <span
                                                key={`${item.id}-index-mark`}
                                                data-current={
                                                    index === activeDirectoryIndex
                                                        ? "true"
                                                        : "false"
                                                }
                                                data-reached={
                                                    index <= activeDirectoryIndex
                                                        ? "true"
                                                        : "false"
                                                }
                                            />
                                        ))}
                                    </span>
                                </div>
                            </div>
                        </nav>

                        <div className="pfa-directory__chapters">
                            {items.map((item, itemIndex) => (
                                <PricingFacilityChapter
                                    key={item.id}
                                    item={item}
                                    itemIndex={itemIndex}
                                    isActive={activeItemId === item.id}
                                    isMobileOpen={mobileOpenItemId === item.id}
                                    revealDirection={
                                        activeThumbnail.itemId === item.id
                                            ? activeThumbnail.revealDirection
                                            : (revealDirectionByItem.current.get(item.id) ??
                                              "down")
                                    }
                                    onMobileToggle={() =>
                                        handleMobileToggle(item.id)
                                    }
                                    registerChapter={(node) =>
                                        registerChapter(item.id, node)
                                    }
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <div
                        className="pfa__empty"
                        role="status"
                        data-pfa-reveal="empty"
                    >
                        <span>00 / 00</span>
                        <div>
                            <h3>Daftar tarif sedang kami siapkan.</h3>
                            <p>
                                Belum ada fasilitas yang dapat ditampilkan. Tim kami tetap dapat
                                membantu Anda memilih arena dan mengetahui tarif terbaru.
                            </p>
                            <FacilityBookingLink compact />
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
