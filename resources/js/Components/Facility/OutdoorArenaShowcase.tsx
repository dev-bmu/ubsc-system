import {
    type CSSProperties,
    type RefObject,
    type SyntheticEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import GalleryLightbox from "@/Components/Gallery/GalleryLightbox";
import type { PublicGalleryItem } from "@/types/gallery";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import SectionDivider from "@/Components/Landing/SectionDivider";
import FacilitySectionLabel from "./FacilitySectionLabel";
import "./FacilitySectionMonument.css";
import "./OutdoorArenaShowcase.css";

export interface OutdoorArenaItem {
    id: string | number;
    name: string;
    category: string;
    image: string;
    location?: string | null;
    href?: string | null;
    fallback?: string;
    galleryItem?: PublicGalleryItem;
}

interface OutdoorArenaShowcaseProps {
    facilities?: OutdoorArenaItem[];
    galleryItems?: PublicGalleryItem[];
}

const TRANSPARENT_PIXEL =
    "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const OUTDOOR_HEADING =
    "Pilihan arena outdoor untuk latihan dan pertandingan di ruang terbuka.";

const CURATED_OUTDOOR_ARENAS: OutdoorArenaItem[] = [
    {
        id: "01",
        name: "Padel Open Court",
        category: "Panoramic Court",
        location: "Dieng",
        image: "https://unsplash.com/photos/XCAbydHHV3Q/download?force=true&w=1500&q=78",
        fallback:
            "/assets/images/fasilitas-tenis-ub-sport-center.avif",
    },
    {
        id: "02",
        name: "Tennis Garden",
        category: "Outdoor Court",
        location: "Veteran",
        image: "https://unsplash.com/photos/p-a2bD-LOzg/download?force=true&w=1500&q=78",
        fallback:
            "/assets/images/fasilitas-tenis-ub-sport-center.avif",
    },
    {
        id: "03",
        name: "Athletic Track",
        category: "Performance Ground",
        location: "Dieng",
        image: "https://unsplash.com/photos/W3WeT8tnqn4/download?force=true&w=1500&q=78",
        fallback:
            "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
    },
    {
        id: "04",
        name: "Basketball Grove",
        category: "Community Court",
        location: "Veteran",
        image: "https://unsplash.com/photos/hYDBeuhi2Mo/download?force=true&w=1500&q=78",
        fallback:
            "/assets/images/fasilitas-bulutangkis-ub-sport-center.avif",
    },
    {
        id: "05",
        name: "Football Ground",
        category: "Competition Field",
        location: "Dieng",
        image: "https://unsplash.com/photos/BFSIyNi64SM/download?force=true&w=1500&q=78",
        fallback:
            "/assets/images/fasilitas-futsal-dieng-ub-sport-center.avif",
    },
    {
        id: "06",
        name: "City Court",
        category: "Urban Basketball",
        location: "Veteran",
        image: "https://unsplash.com/photos/gwua2Yn28VQ/download?force=true&w=1500&q=78",
        fallback:
            "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
    },
];

function OutdoorArenaCard({
    facility,
    index,
    active,
    trackRef,
    onOpen,
}: {
    facility: OutdoorArenaItem;
    index: number;
    active: boolean;
    trackRef: RefObject<HTMLDivElement | null>;
    onOpen?: () => void;
}) {
    const cardRef = useRef<HTMLElement | null>(null);
    const [isPrepared, setIsPrepared] = useState(index < 2);
    const [isVisible, setIsVisible] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const card = cardRef.current;
        const root = trackRef.current;
        if (!card || !root) return;

        if (!("IntersectionObserver" in window)) {
            setIsPrepared(true);
            setIsVisible(true);
            return;
        }

        let prepareTimer = 0;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                setIsVisible(true);
                prepareTimer = window.setTimeout(
                    () => setIsPrepared(true),
                    Math.min(index, 3) * 55,
                );
                observer.disconnect();
            },
            {
                root,
                rootMargin: "0px 320px",
                threshold: 0.06,
            },
        );

        observer.observe(card);

        return () => {
            window.clearTimeout(prepareTimer);
            observer.disconnect();
        };
    }, [index, trackRef]);

    const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
        const image = event.currentTarget;
        if (image.dataset.fallbackApplied === "true") return;

        image.dataset.fallbackApplied = "true";
        image.src =
            facility.fallback ??
            "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif";
    };

    return (
        <article
            ref={(node) => {
                cardRef.current = node;
            }}
            className={`outdoor-arena__card ${active ? "is-active" : ""} ${
                isVisible ? "is-visible" : ""
            }`}
            style={
                {
                    "--outdoor-card-delay": `${Math.min(index, 3) * 65}ms`,
                } as CSSProperties
            }
            role="listitem"
        >
            <div className="outdoor-arena__card-media">
                <img
                    src={isPrepared ? facility.image : TRANSPARENT_PIXEL}
                    alt={`${facility.name}, ${facility.category}`}
                    width="900"
                    height="1280"
                    loading={index < 2 ? "eager" : "lazy"}
                    decoding="async"
                    className={isLoaded ? "is-loaded" : ""}
                    onLoad={() => {
                        if (isPrepared) setIsLoaded(true);
                    }}
                    onError={handleImageError}
                />
                <span className="outdoor-arena__card-overlay" aria-hidden="true" />
                <span className="outdoor-arena__card-number font-bdo">
                    /{String(index + 1).padStart(2, "0")}
                </span>
                {facility.galleryItem ? (
                    <button
                        type="button"
                        onClick={onOpen}
                        className="outdoor-arena__card-link"
                        aria-label={`Buka ${facility.name}`}
                    />
                ) : facility.href ? (
                    <a
                        href={facility.href}
                        className="outdoor-arena__card-link"
                        aria-label={`Lihat ${facility.name}`}
                    />
                ) : null}
            </div>

            <div className="outdoor-arena__card-caption">
                <h3 className="font-bdo">{facility.name}</h3>
                <div className="font-bdo">
                    <span>{facility.category}</span>
                    <span>{facility.location ?? "UB Sport Center"}</span>
                </div>
            </div>
        </article>
    );
}

export default function OutdoorArenaShowcase({
    facilities,
    galleryItems,
}: OutdoorArenaShowcaseProps) {
    const items = galleryItems?.length
        ? galleryItems.map((item, index): OutdoorArenaItem => ({
              id: item.uuid,
              name: item.title,
              category: item.arena_type,
              image:
                  item.image?.fallback_url ??
                  item.poster?.fallback_url ??
                  "/assets/images/comingsoon.avif",
              location: item.location?.name ?? "UB Sport Center",
              fallback: "/assets/images/comingsoon.avif",
              galleryItem: item,
          }))
        : facilities && facilities.length > 0
            ? facilities.slice(0, 8)
            : CURATED_OUTDOOR_ARENAS;
    const trackRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef(0);
    const [activeIndex, setActiveIndex] = useState(0);
    const [canMoveBack, setCanMoveBack] = useState(false);
    const [canMoveForward, setCanMoveForward] = useState(items.length > 1);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const measureTrack = useCallback(() => {
        const track = trackRef.current;
        const firstCard = track?.querySelector<HTMLElement>(
            ".outdoor-arena__card",
        );
        if (!track || !firstCard) return;

        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        const scrollPosition = Math.max(
            0,
            Math.min(maxScroll, track.scrollLeft),
        );
        const scrollProgress = maxScroll > 4 ? scrollPosition / maxScroll : 0;
        const nextIndex = Math.max(
            0,
            Math.min(
                items.length - 1,
                Math.round(scrollProgress * (items.length - 1)),
            ),
        );
        const nextCanMoveBack = track.scrollLeft > 4;
        const nextCanMoveForward = track.scrollLeft < maxScroll - 4;

        setActiveIndex((current) =>
            current === nextIndex ? current : nextIndex,
        );
        setCanMoveBack((current) =>
            current === nextCanMoveBack ? current : nextCanMoveBack,
        );
        setCanMoveForward((current) =>
            current === nextCanMoveForward ? current : nextCanMoveForward,
        );
    }, [items.length]);

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;

        measureTrack();
        const resizeObserver =
            "ResizeObserver" in window
                ? new ResizeObserver(measureTrack)
                : null;

        resizeObserver?.observe(track);
        window.addEventListener("resize", measureTrack, { passive: true });

        return () => {
            window.cancelAnimationFrame(frameRef.current);
            resizeObserver?.disconnect();
            window.removeEventListener("resize", measureTrack);
        };
    }, [measureTrack]);

    const handleTrackScroll = () => {
        if (frameRef.current) return;

        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = 0;
            measureTrack();
        });
    };

    const moveTrack = (direction: -1 | 1) => {
        const track = trackRef.current;
        const firstCard = track?.querySelector<HTMLElement>(
            ".outdoor-arena__card",
        );
        if (!track || !firstCard) return;

        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        const nextIndex = Math.max(
            0,
            Math.min(items.length - 1, activeIndex + direction),
        );
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        track.scrollTo({
            left:
                items.length > 1
                    ? maxScroll * (nextIndex / (items.length - 1))
                    : 0,
            behavior: reducedMotion ? "auto" : "smooth",
        });
    };

    const currentItem = items[activeIndex] ?? items[0];
    const progress = items.length > 0 ? (activeIndex + 1) / items.length : 0;

    return (
        <section className="outdoor-arena" id="facility-outdoor-showcase">
            <div className="outdoor-arena__divider">
                <SectionDivider
                    number="04"
                    title="Fasilitas Outdoor"
                    subtitle="04 facilitypage"
                    theme="light"
                />
            </div>

            <div className="outdoor-arena__intro">
                <FacilitySectionLabel className="outdoor-arena__label">
                    Arena Terbuka
                </FacilitySectionLabel>

                <ScrollTextReveal
                    as="h2"
                    split="lines"
                    delay={110}
                    stagger={95}
                    className="outdoor-arena__intro-title section-two-headline-weight max-w-[1100px] font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-[#161815] md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-[980px] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:max-w-[1120px] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
                >
                    {OUTDOOR_HEADING}
                </ScrollTextReveal>

                <div className="outdoor-arena__intro-aside">
                    <span className="outdoor-arena__intro-index font-bdo">
                        04 / {String(items.length).padStart(2, "0")}
                    </span>
                    <ScrollTextReveal
                        as="p"
                        split="words"
                        delay={180}
                        stagger={12}
                        className="outdoor-arena__intro-copy font-bdo"
                    >
                        Temukan arena outdoor untuk latihan, kompetisi, dan
                        aktivitas komunitas.
                    </ScrollTextReveal>
                </div>
            </div>

            <div className="outdoor-arena__stage">
                <div className="outdoor-arena__stage-bar font-bdo">
                    <span>Outdoor Collection</span>
                    <span>UBSC / Malang</span>
                    <span>{String(items.length).padStart(2, "0")} Arenas</span>
                </div>

                <div className="outdoor-arena__stage-body">
                    <aside className="outdoor-arena__narrative">
                        <div className="outdoor-arena__narrative-top">
                            <span className="outdoor-arena__narrative-kicker font-bdo">
                                Currently viewing
                            </span>
                            <span className="outdoor-arena__narrative-count font-clash">
                                {String(activeIndex + 1).padStart(2, "0")}
                            </span>
                        </div>

                        <div
                            className="outdoor-arena__narrative-current"
                            aria-live="polite"
                        >
                            <span className="font-bdo">
                                {currentItem?.category}
                            </span>
                            <h3 className="outdoor-arena__narrative-title section-two-headline-weight font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]">
                                {currentItem?.name}
                            </h3>
                        </div>

                        <div className="outdoor-arena__narrative-bottom">
                            <p className="font-bdo">
                                Cahaya alami, udara terbuka, dan permukaan
                                permainan yang terawat menjadi bagian dari
                                pengalaman setiap arena.
                            </p>
                            <div className="outdoor-arena__active-meta font-bdo">
                                <span>UB Sport Center</span>
                                <span>{currentItem?.location ?? "UBSC"}</span>
                            </div>
                        </div>
                    </aside>

                    <div className="outdoor-arena__viewport">
                        <div
                            ref={trackRef}
                            className="outdoor-arena__track"
                            onScroll={handleTrackScroll}
                            role="list"
                            aria-label="Koleksi fasilitas arena luar"
                        >
                            {items.map((facility, index) => (
                                <OutdoorArenaCard
                                    key={facility.id}
                                    facility={facility}
                                    index={index}
                                    active={index === activeIndex}
                                    trackRef={trackRef}
                                    onOpen={
                                        facility.galleryItem
                                            ? () => setLightboxIndex(index)
                                            : undefined
                                    }
                                />
                            ))}
                        </div>

                        <div className="outdoor-arena__navigation">
                            <div
                                className={`outdoor-arena__progress ${
                                    activeIndex === items.length - 1
                                        ? "is-complete"
                                        : ""
                                }`}
                                role="progressbar"
                                aria-label="Progres koleksi fasilitas outdoor"
                                aria-valuemin={1}
                                aria-valuemax={items.length}
                                aria-valuenow={activeIndex + 1}
                                aria-valuetext={`${currentItem?.name ?? "Fasilitas"}, ${activeIndex + 1} dari ${items.length}`}
                            >
                                <span
                                    style={
                                        {
                                            "--outdoor-progress": progress,
                                        } as CSSProperties
                                    }
                                    aria-hidden="true"
                                />
                            </div>

                            <span
                                className="outdoor-arena__counter font-bdo"
                                aria-live="polite"
                            >
                                {String(activeIndex + 1).padStart(2, "0")} /{" "}
                                {String(items.length).padStart(2, "0")}
                            </span>

                            <div className="outdoor-arena__buttons">
                                <button
                                    type="button"
                                    onClick={() => moveTrack(-1)}
                                    disabled={!canMoveBack}
                                    aria-label="Fasilitas outdoor sebelumnya"
                                >
                                    <ChevronLeft size={20} strokeWidth={1.6} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveTrack(1)}
                                    disabled={!canMoveForward}
                                    aria-label="Fasilitas outdoor berikutnya"
                                >
                                    <ChevronRight size={20} strokeWidth={1.6} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    className="outdoor-arena__stage-footer facility-section-monument"
                    aria-hidden="true"
                >
                    <ScrollTextReveal
                        split="block"
                        delay={110}
                        amount={0.25}
                        className="facility-section-monument__reveal"
                    >
                        04
                    </ScrollTextReveal>
                    <ScrollTextReveal
                        split="block"
                        delay={205}
                        amount={0.25}
                        className="facility-section-monument__reveal"
                    >
                        OPEN AIR
                    </ScrollTextReveal>
                </div>
            </div>
            <GalleryLightbox
                items={galleryItems ?? []}
                activeIndex={lightboxIndex}
                onChange={setLightboxIndex}
                source="facility-outdoor"
            />
        </section>
    );
}
