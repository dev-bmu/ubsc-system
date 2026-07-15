import { Head, Link, router } from "@inertiajs/react";
import {
    Listbox,
    ListboxButton,
    ListboxOption,
    ListboxOptions,
} from "@headlessui/react";
import {
    ArrowDown,
    ArrowLeft,
    ArrowUpRight,
    Check,
    ChevronDown,
    Image as ImageIcon,
    LoaderCircle,
    MapPin,
    Play,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";
import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type FormEvent,
} from "react";
import FacilitySectionLabel from "@/Components/Facility/FacilitySectionLabel";
import Footer from "@/Components/Landing/Footer";
import Navbar from "@/Components/Landing/Navbar";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import GalleryImage from "@/Components/Gallery/GalleryImage";
import GalleryLightbox from "@/Components/Gallery/GalleryLightbox";
import { trackGalleryEvent } from "@/Components/Gallery/galleryAnalytics";
import type { PageProps } from "@/types";
import type { PublicGalleryItem } from "@/types/gallery";
import "@/Components/Facility/FacilitySectionMonument.css";
import "./gallery.css";

interface Paginator {
    data: PublicGalleryItem[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    next_page_url: string | null;
    prev_page_url: string | null;
}

interface FilterOptions {
    sections: Array<{ key: string; slug: string; name: string }>;
    locations: Array<{ id: number; name: string; slug: string }>;
    years: number[];
    media_types: string[];
}

interface GallerySeo {
    title: string;
    description: string;
    canonical: string;
    image: string | null;
    robots: string;
    previous: string | null;
    next: string | null;
    json_ld: Record<string, unknown>;
}

type Props = PageProps<{
    items: Paginator;
    filters: Record<string, string | undefined>;
    filter_options: FilterOptions;
    active_section: { key: string; slug: string; name: string } | null;
    search_degraded: boolean;
    seo: GallerySeo;
}>;

interface GalleryFilterChoice {
    value: string;
    label: string;
}

function GalleryFilterSelect({
    value,
    choices,
    ariaLabel,
    menuIndex,
    menuTitle,
    onChange,
}: {
    value: string;
    choices: GalleryFilterChoice[];
    ariaLabel: string;
    menuIndex: string;
    menuTitle: string;
    onChange: (value: string) => void;
}) {
    const selectedChoice =
        choices.find((choice) => choice.value === value) ?? choices[0];

    return (
        <Listbox value={value} onChange={onChange}>
            <div className="public-gallery__filter-select">
                <ListboxButton
                    className="public-gallery__filter-button font-bdo"
                    aria-label={`${ariaLabel}: ${selectedChoice?.label ?? "Semua"}`}
                >
                    <span>{selectedChoice?.label}</span>
                    <ChevronDown aria-hidden="true" />
                </ListboxButton>
                <ListboxOptions
                    anchor={{ to: "bottom start", gap: 6 }}
                    portal
                    modal={false}
                    transition
                    className="public-gallery__filter-options"
                >
                    <div
                        className="public-gallery__filter-options-head font-bdo"
                        aria-hidden="true"
                    >
                        <span>{menuIndex} / Filter</span>
                        <strong>{menuTitle}</strong>
                    </div>
                    {choices.map((choice, index) => (
                        <ListboxOption
                            key={choice.value || "all"}
                            value={choice.value}
                            className="public-gallery__filter-option font-bdo"
                        >
                            <span className="public-gallery__filter-option-index">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="public-gallery__filter-option-label">
                                {choice.label}
                            </span>
                            <Check aria-hidden="true" />
                        </ListboxOption>
                    ))}
                </ListboxOptions>
            </div>
        </Listbox>
    );
}

export default function GalleryArchive({
    items,
    filters,
    filter_options: options,
    active_section: activeSection,
    search_degraded: searchDegraded,
    seo,
}: Props) {
    const [media, setMedia] = useState(items.data);
    const [lightboxMedia, setLightboxMedia] = useState(items.data);
    const [nextUrl, setNextUrl] = useState(items.next_page_url);
    const [currentPage, setCurrentPage] = useState(items.current_page);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [query, setQuery] = useState(filters.q ?? "");
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const gridRef = useRef<HTMLElement>(null);
    const directContext = useRef(false);
    const routeKey = `${activeSection?.key ?? "all"}:${JSON.stringify(filters)}:${items.current_page}`;

    useEffect(() => {
        setMedia(items.data);
        setLightboxMedia(items.data);
        setNextUrl(items.next_page_url);
        setCurrentPage(items.current_page);
        setLightboxIndex(null);
    }, [routeKey, items.data, items.current_page, items.next_page_url]);

    useEffect(() => {
        try {
            setRecentSearches(
                JSON.parse(
                    localStorage.getItem("ubsc.gallery.recent-searches") ??
                        "[]",
                ),
            );
        } catch {
            localStorage.removeItem("ubsc.gallery.recent-searches");
        }
    }, []);

    useEffect(() => {
        const uuid = new URL(window.location.href).searchParams.get("media");
        if (!uuid) return;
        const localIndex = items.data.findIndex((item) => item.uuid === uuid);

        if (localIndex >= 0) {
            directContext.current = false;
            setLightboxMedia(items.data);
            setLightboxIndex(localIndex);
            return;
        }

        const parameters = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value && key !== "page") parameters.set(key, value);
        });
        if (activeSection) parameters.set("section", activeSection.key);
        const endpoint = `${route("gallery.media", uuid)}?${parameters.toString()}`;
        const controller = new AbortController();

        fetch(endpoint, {
            credentials: "same-origin",
            headers: {
                Accept: "application/json",
                "X-Requested-With": "XMLHttpRequest",
            },
            signal: controller.signal,
        })
            .then((response) => {
                if (!response.ok) throw new Error("Media is unavailable");
                return response.json();
            })
            .then(
                (payload: {
                    items: PublicGalleryItem[];
                    active_index: number;
                }) => {
                    directContext.current = true;
                    setLightboxMedia(payload.items);
                    setLightboxIndex(payload.active_index);
                },
            )
            .catch(() => {
                const url = new URL(window.location.href);
                url.searchParams.delete("media");
                window.history.replaceState(window.history.state, "", url);
            });

        return () => controller.abort();
        // The server route payload is authoritative whenever the Inertia route changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routeKey]);

    useEffect(() => {
        if (!filters.q) return;
        setRecentSearches((current) => {
            const next = [
                filters.q as string,
                ...current.filter((term) => term !== filters.q),
            ].slice(0, 6);
            localStorage.setItem(
                "ubsc.gallery.recent-searches",
                JSON.stringify(next),
            );
            return next;
        });
        trackGalleryEvent("gallery_search", {
            section_key: activeSection?.key,
            query: filters.q,
            payload: { result_count: items.total, source: "archive" },
        });
        if (items.total === 0) {
            trackGalleryEvent("gallery_zero_result", {
                section_key: activeSection?.key,
                query: filters.q,
                payload: { result_count: 0, source: "archive" },
            });
        }
    }, [activeSection?.key, filters.q, items.total]);

    useEffect(() => {
        const root = gridRef.current;
        if (!root || !("IntersectionObserver" in window)) return;
        const storageKey = "ubsc.gallery.impressions";
        let storedImpressions: string[] = [];
        try {
            storedImpressions = JSON.parse(
                sessionStorage.getItem(storageKey) ?? "[]",
            ) as string[];
        } catch {
            sessionStorage.removeItem(storageKey);
        }
        const seen = new Set<string>(storedImpressions);
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting || entry.intersectionRatio < 0.55)
                        return;
                    const element = entry.target as HTMLElement;
                    const uuid = element.dataset.galleryUuid;
                    if (!uuid || seen.has(uuid)) return;
                    seen.add(uuid);
                    sessionStorage.setItem(
                        storageKey,
                        JSON.stringify([...seen].slice(-500)),
                    );
                    trackGalleryEvent("gallery_card_impression", {
                        item_uuid: uuid,
                        section_key: activeSection?.key,
                        payload: {
                            position: Number(
                                element.dataset.galleryPosition ?? 0,
                            ),
                            source: "archive",
                        },
                    });
                    observer.unobserve(element);
                });
            },
            { threshold: 0.55 },
        );
        root.querySelectorAll<HTMLElement>("[data-gallery-uuid]").forEach(
            (node) => observer.observe(node),
        );
        return () => observer.disconnect();
    }, [activeSection?.key, media]);

    const baseRoute = activeSection
        ? route("gallery.section", activeSection.slug)
        : route("gallery.index");
    const hasFilters = Boolean(
        filters.q || filters.location || filters.media_type || filters.year,
    );
    const activeFacetCount = [
        filters.location,
        filters.media_type,
        filters.year,
    ].filter(Boolean).length;
    const archiveHeading = activeSection
        ? `Koleksi visual ${activeSection.name.toLowerCase()} UB Sport Center.`
        : "UB Sport Center, ruang untuk setiap cara Anda bergerak.";
    const archiveDescription = activeSection
        ? `Jelajahi detail ruang, atmosfer, dan aktivitas dari koleksi ${activeSection.name.toLowerCase()}.`
        : "Jelajahi koleksi visual fasilitas UB Sport Center, dari arena indoor dan lokasi eksklusif hingga ruang outdoor.";
    const visibleFrom = media.length > 0 ? (items.from ?? 1) : 0;
    const visibleTo = media.length > 0 ? visibleFrom + media.length - 1 : 0;
    const visibleRange = `${String(visibleFrom).padStart(2, "0")} - ${String(visibleTo).padStart(2, "0")}`;

    const applyFilters = (next: Record<string, string | undefined>) => {
        const clean = Object.fromEntries(
            Object.entries(next).filter(([, value]) => value),
        );
        router.get(baseRoute, clean, {
            preserveState: false,
            preserveScroll: false,
        });
    };

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        applyFilters({ ...filters, q: query || undefined });
    };

    const loadMore = async (): Promise<boolean> => {
        if (!nextUrl || loadingMore) return false;
        setLoadingMore(true);
        try {
            const response = await fetch(nextUrl, {
                credentials: "same-origin",
                headers: {
                    Accept: "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
            });
            if (!response.ok) throw new Error("Load failed");
            const payload = await response.json();
            const nextItems = payload.items as Paginator;
            const appendUnique = (current: PublicGalleryItem[]) => {
                const known = new Set(current.map((item) => item.uuid));
                return [
                    ...current,
                    ...nextItems.data.filter((item) => !known.has(item.uuid)),
                ];
            };
            setMedia(appendUnique);
            if (!directContext.current) setLightboxMedia(appendUnique);
            setNextUrl(nextItems.next_page_url);
            setCurrentPage(nextItems.current_page);
            trackGalleryEvent("gallery_load_more", {
                section_key: activeSection?.key,
                payload: {
                    position: nextItems.current_page,
                    result_count: nextItems.data.length,
                    source: "archive",
                },
            });
            return nextItems.data.length > 0;
        } catch {
            window.location.assign(nextUrl);
            return false;
        } finally {
            setLoadingMore(false);
        }
    };

    const safeJsonLd = useMemo(
        () => JSON.stringify(seo.json_ld).replace(/</g, "\\u003c"),
        [seo.json_ld],
    );
    const mastheadImage =
        seo.image ??
        "/assets/images/fasilitas-tenis-ub-sport-center.avif";

    return (
        <>
            <Head>
                <title>{seo.title}</title>
                <meta name="description" content={seo.description} />
                <meta name="robots" content={seo.robots} />
                <link rel="canonical" href={seo.canonical} />
                {seo.previous && <link rel="prev" href={seo.previous} />}
                {seo.next && <link rel="next" href={seo.next} />}
                <meta property="og:type" content="website" />
                <meta property="og:title" content={seo.title} />
                <meta property="og:description" content={seo.description} />
                <meta property="og:url" content={seo.canonical} />
                {seo.image && <meta property="og:image" content={seo.image} />}
                <meta name="twitter:card" content="summary_large_image" />
                <link rel="preload" as="image" href={mastheadImage} />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: safeJsonLd }}
                />
            </Head>

            <Navbar activeSection="Facilities" surface="media" />
            <main className="public-gallery">
                <section className="public-gallery__masthead">
                    <div
                        className="public-gallery__masthead-media"
                        aria-hidden="true"
                    >
                        <img
                            src={mastheadImage}
                            alt=""
                            loading="eager"
                            decoding="async"
                        />
                        <span className="public-gallery__masthead-veil" />
                        <span className="public-gallery__masthead-grid" />
                        <span className="public-gallery__masthead-scan" />
                    </div>

                    <div className="public-gallery__masthead-content">
                        <div className="public-gallery__shell public-gallery__masthead-shell">
                            <header className="public-gallery__header">
                                <div className="public-gallery__stage-bar font-bdo">
                                    <span>Visual archive</span>
                                    <span>
                                        {activeSection?.name ??
                                            "Semua fasilitas"}
                                    </span>
                                    <span>
                                        {String(items.total).padStart(3, "0")}{" "}
                                        media
                                    </span>
                                </div>

                                <div className="public-gallery__intro-grid">
                                    <div className="public-gallery__intro-main">
                                        <FacilitySectionLabel
                                            className="public-gallery__eyebrow"
                                            tone="dark"
                                        >
                                            Arsip Visual
                                        </FacilitySectionLabel>
                                        <ScrollTextReveal
                                            as="h1"
                                            split="lines"
                                            delay={90}
                                            stagger={95}
                                            trackingEm={-0.058}
                                            className="public-gallery__title section-two-headline-weight font-bdo"
                                        >
                                            {archiveHeading}
                                        </ScrollTextReveal>
                                    </div>

                                    <div className="public-gallery__intro-aside">
                                        <span className="public-gallery__intro-index font-bdo">
                                            04 / Facility archive
                                        </span>
                                        <ScrollTextReveal
                                            as="p"
                                            split="words"
                                            delay={170}
                                            stagger={14}
                                            className="public-gallery__intro-copy font-bdo"
                                        >
                                            {archiveDescription}
                                        </ScrollTextReveal>
                                        <div className="public-gallery__intro-meta font-bdo">
                                            <span>
                                                Indoor / Exclusive / Outdoor
                                            </span>
                                            <span>Malang / Indonesia</span>
                                        </div>
                                    </div>
                                </div>
                            </header>
                        </div>
                    </div>
                </section>

                <div className="public-gallery__shell public-gallery__body">
                    <nav
                        className="public-gallery__sections"
                        aria-label="Kategori galeri"
                    >
                        <Link
                            href={route("gallery.index")}
                            className={!activeSection ? "is-active" : ""}
                        >
                            Semua <span>{items.total}</span>
                        </Link>
                        {options.sections.map((section) => (
                            <Link
                                key={section.key}
                                href={route("gallery.section", section.slug)}
                                className={
                                    activeSection?.key === section.key
                                        ? "is-active"
                                        : ""
                                }
                            >
                                {section.name}
                            </Link>
                        ))}
                    </nav>

                    <section
                        className="public-gallery__tools"
                        aria-label="Pencarian dan filter galeri"
                    >
                        <form
                            onSubmit={submitSearch}
                            className="public-gallery__search"
                        >
                            <Search aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(event) =>
                                    setQuery(event.target.value)
                                }
                                placeholder="Cari arena, lokasi, atau aktivitas"
                                aria-label="Cari galeri"
                                list="gallery-recent-searches"
                            />
                            <datalist id="gallery-recent-searches">
                                {recentSearches.map((term) => (
                                    <option key={term} value={term} />
                                ))}
                            </datalist>
                            {query && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setQuery("");
                                        applyFilters({
                                            ...filters,
                                            q: undefined,
                                        });
                                    }}
                                    aria-label="Hapus pencarian"
                                >
                                    <X />
                                </button>
                            )}
                        </form>

                        <div className="public-gallery__filter-group">
                            <div
                                className="public-gallery__filter-mark font-bdo"
                                aria-hidden="true"
                            >
                                <span className="public-gallery__filter-mark-icon">
                                    <SlidersHorizontal />
                                </span>
                                <span className="public-gallery__filter-mark-copy">
                                    <strong>Filter</strong>
                                    <small>
                                        {String(activeFacetCount).padStart(2, "0")}
                                        /03
                                    </small>
                                </span>
                            </div>

                            <div
                                className="public-gallery__filter-control public-gallery__filter-control--location"
                                data-active={filters.location ? "true" : undefined}
                            >
                                <span className="public-gallery__filter-meta font-bdo">
                                    <span>01 /</span> Lokasi
                                </span>
                                <GalleryFilterSelect
                                    value={filters.location ?? ""}
                                    choices={[
                                        {
                                            value: "",
                                            label: "Semua lokasi",
                                        },
                                        ...options.locations.map((location) => ({
                                            value: location.slug,
                                            label: location.name,
                                        })),
                                    ]}
                                    ariaLabel="Filter lokasi"
                                    menuIndex="01"
                                    menuTitle="Pilih lokasi"
                                    onChange={(value) => {
                                        applyFilters({
                                            ...filters,
                                            location: value || undefined,
                                        });
                                        trackGalleryEvent(
                                            "gallery_filter_change",
                                            {
                                                section_key:
                                                    activeSection?.key,
                                                payload: {
                                                    filter: "location",
                                                    value: value || "all",
                                                    source: "archive",
                                                },
                                            },
                                        );
                                    }}
                                />
                            </div>

                            <div
                                className="public-gallery__filter-control public-gallery__filter-control--media"
                                data-active={
                                    filters.media_type ? "true" : undefined
                                }
                            >
                                <span className="public-gallery__filter-meta font-bdo">
                                    <span>02 /</span> Media
                                </span>
                                <GalleryFilterSelect
                                    value={filters.media_type ?? ""}
                                    choices={[
                                        {
                                            value: "",
                                            label: "Gambar & video",
                                        },
                                        { value: "image", label: "Gambar" },
                                        { value: "video", label: "Video" },
                                    ]}
                                    ariaLabel="Filter jenis media"
                                    menuIndex="02"
                                    menuTitle="Pilih format"
                                    onChange={(value) => {
                                        applyFilters({
                                            ...filters,
                                            media_type: value || undefined,
                                        });
                                        trackGalleryEvent(
                                            "gallery_filter_change",
                                            {
                                                section_key:
                                                    activeSection?.key,
                                                payload: {
                                                    filter: "media_type",
                                                    value: value || "all",
                                                    source: "archive",
                                                },
                                            },
                                        );
                                    }}
                                />
                            </div>

                            <div
                                className="public-gallery__filter-control public-gallery__filter-control--year"
                                data-active={filters.year ? "true" : undefined}
                            >
                                <span className="public-gallery__filter-meta font-bdo">
                                    <span>03 /</span> Tahun
                                </span>
                                <GalleryFilterSelect
                                    value={filters.year ?? ""}
                                    choices={[
                                        {
                                            value: "",
                                            label: "Semua tahun",
                                        },
                                        ...options.years.map((year) => ({
                                            value: String(year),
                                            label: String(year),
                                        })),
                                    ]}
                                    ariaLabel="Filter tahun"
                                    menuIndex="03"
                                    menuTitle="Pilih tahun"
                                    onChange={(value) => {
                                        applyFilters({
                                            ...filters,
                                            year: value || undefined,
                                        });
                                        trackGalleryEvent(
                                            "gallery_filter_change",
                                            {
                                                section_key:
                                                    activeSection?.key,
                                                payload: {
                                                    filter: "year",
                                                    value: value || "all",
                                                    source: "archive",
                                                },
                                            },
                                        );
                                    }}
                                />
                            </div>
                        </div>

                        {hasFilters && (
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery("");
                                    router.get(baseRoute);
                                }}
                                className="public-gallery__reset font-bdo"
                            >
                                <X /> Reset
                            </button>
                        )}
                    </section>

                    {searchDegraded && (
                        <p
                            className="public-gallery__degraded font-bdo"
                            role="status"
                        >
                            Pencarian cepat sedang dipulihkan. Hasil dari arsip
                            utama tetap tersedia.
                        </p>
                    )}

                    <div className="public-gallery__collection-bar font-bdo">
                        <span>Koleksi fasilitas</span>
                        <span>
                            {visibleRange} /{" "}
                            {String(items.total).padStart(2, "0")}
                        </span>
                    </div>

                    {media.length > 0 ? (
                        <section
                            ref={gridRef}
                            className="public-gallery__grid"
                            aria-label="Koleksi media fasilitas"
                        >
                            {media.map((item, index) => (
                                <article
                                    key={item.uuid}
                                    id={`media-${item.uuid}`}
                                    className="public-gallery__item"
                                    data-gallery-uuid={item.uuid}
                                    data-gallery-position={index + 1}
                                    style={
                                        {
                                            "--gallery-item-delay": `${Math.min(index, 8) * 45}ms`,
                                        } as CSSProperties
                                    }
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            directContext.current = false;
                                            setLightboxMedia(media);
                                            setLightboxIndex(index);
                                        }}
                                        className="public-gallery__card"
                                        aria-label={`Buka ${item.title}`}
                                    >
                                        <span className="public-gallery__media">
                                            {item.image ? (
                                                <GalleryImage
                                                    asset={item.image}
                                                    focalX={item.focal_x}
                                                    focalY={item.focal_y}
                                                    alt={item.alt_text}
                                                    sizes="(max-width: 700px) 100vw, (max-width: 1200px) 50vw, 50vw"
                                                    loading={
                                                        index < 3
                                                            ? "eager"
                                                            : "lazy"
                                                    }
                                                    fetchPriority={
                                                        index === 0
                                                            ? "high"
                                                            : "low"
                                                    }
                                                    decoding="async"
                                                />
                                            ) : item.poster ? (
                                                <GalleryImage
                                                    asset={item.poster}
                                                    focalX={item.focal_x}
                                                    focalY={item.focal_y}
                                                    alt={item.alt_text}
                                                    sizes="(max-width: 700px) 100vw, 50vw"
                                                    loading={
                                                        index < 3
                                                            ? "eager"
                                                            : "lazy"
                                                    }
                                                    decoding="async"
                                                />
                                            ) : (
                                                <span className="public-gallery__placeholder">
                                                    <ImageIcon />
                                                </span>
                                            )}
                                            <span
                                                className="public-gallery__shade"
                                                aria-hidden="true"
                                            />
                                            <span className="public-gallery__number font-bdo">
                                                (
                                                {String(index + 1).padStart(
                                                    2,
                                                    "0",
                                                )}
                                                )
                                            </span>
                                            <span
                                                className="public-gallery__card-arrow"
                                                aria-hidden="true"
                                            >
                                                <ArrowUpRight />
                                            </span>
                                            {item.media_type === "video" && (
                                                <span className="public-gallery__play">
                                                    <Play fill="currentColor" />{" "}
                                                    Video
                                                </span>
                                            )}
                                            <span className="public-gallery__caption font-bdo">
                                                <span>
                                                    <strong>
                                                        {item.title}
                                                    </strong>
                                                    <small>
                                                        {item.arena_type}
                                                    </small>
                                                </span>
                                                <span className="public-gallery__location">
                                                    <MapPin />{" "}
                                                    {item.location?.name ??
                                                        "UBSC"}
                                                </span>
                                            </span>
                                        </span>
                                    </button>
                                </article>
                            ))}
                        </section>
                    ) : (
                        <section className="public-gallery__empty">
                            <span
                                className="public-gallery__empty-index font-clash"
                                aria-hidden="true"
                            >
                                00
                            </span>
                            <div className="public-gallery__empty-content">
                                <FacilitySectionLabel className="public-gallery__empty-label">
                                    Arsip Visual
                                </FacilitySectionLabel>
                                <ScrollTextReveal
                                    as="h2"
                                    split="lines"
                                    delay={110}
                                    stagger={95}
                                    trackingEm={-0.058}
                                    className="section-two-headline-weight font-bdo"
                                >
                                    {hasFilters
                                        ? "Tidak ada koleksi yang sesuai."
                                        : "Koleksi sedang disiapkan."}
                                </ScrollTextReveal>
                                <p className="font-bdo">
                                    {hasFilters
                                        ? "Ubah kata kunci atau filter untuk menjelajahi koleksi lainnya."
                                        : "Media terpublikasi akan tampil di sini tanpa mengubah ritme halaman Facilities."}
                                </p>
                                {hasFilters ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setQuery("");
                                            router.get(baseRoute);
                                        }}
                                        className="public-gallery__empty-action font-bdo"
                                    >
                                        <ArrowLeft /> Bersihkan filter
                                    </button>
                                ) : (
                                    <Link
                                        href="/facilities#facility-gallery"
                                        className="public-gallery__empty-action font-bdo"
                                    >
                                        <ArrowLeft /> Kembali ke fasilitas
                                    </Link>
                                )}
                            </div>
                        </section>
                    )}

                    {nextUrl && (
                        <div className="public-gallery__load-wrap">
                            <a
                                href={nextUrl}
                                onClick={(event) => {
                                    event.preventDefault();
                                    loadMore();
                                }}
                                className="public-gallery__load font-bdo"
                                aria-disabled={loadingMore}
                            >
                                <span className="public-gallery__load-label">
                                    {loadingMore ? (
                                        <LoaderCircle className="is-loading" />
                                    ) : (
                                        <ArrowDown />
                                    )}
                                    {loadingMore
                                        ? "Memuat koleksi"
                                        : "Tampilkan koleksi berikutnya"}
                                </span>
                                <span>
                                    {currentPage} / {items.last_page}
                                </span>
                            </a>
                        </div>
                    )}

                    <div
                        className="public-gallery__monument facility-section-monument"
                        aria-hidden="true"
                    >
                        <span>{String(items.total).padStart(2, "0")}</span>
                        <span>ARCHIVE</span>
                    </div>
                </div>
            </main>
            <Footer />

            <GalleryLightbox
                items={lightboxMedia}
                activeIndex={lightboxIndex}
                onChange={setLightboxIndex}
                source="archive"
                hasMore={!directContext.current && Boolean(nextUrl)}
                onRequestNext={loadMore}
            />
        </>
    );
}
