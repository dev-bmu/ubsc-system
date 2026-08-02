import {
    type CSSProperties,
    type SyntheticEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import GalleryLightbox from "@/Components/Gallery/GalleryLightbox";
import type { PublicGalleryItem } from "@/types/gallery";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import FacilitySectionLabel from "./FacilitySectionLabel";
import "./FacilitySectionMonument.css";
import "./ExclusiveFacilitiesSection.css";

interface ExclusiveFacility {
    id: string;
    name: string;
    category: string;
    branch: string;
    image: string;
    fallback: string;
    galleryItem?: PublicGalleryItem;
}

interface ExclusiveFacilitiesSectionProps {
    galleryItems?: PublicGalleryItem[];
}

const TRANSPARENT_PIXEL =
    "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const EXCLUSIVE_HEADING =
    "Fasilitas premium untuk latihan yang lebih privat dan personal.";

const EXCLUSIVE_FACILITIES: ExclusiveFacility[] = [
    {
        id: "01",
        name: "Padel Signature",
        category: "Panoramic Court",
        branch: "Dieng Branch",
        image: "https://unsplash.com/photos/XCAbydHHV3Q/download?force=true&w=1400&q=78",
        fallback: "/assets/images/fasilitas-tenis-ub-sport-center.avif",
    },
    {
        id: "02",
        name: "Padel Performance",
        category: "Private Training",
        branch: "Veteran Branch",
        image: "https://unsplash.com/photos/db-KVhjl5Pc/download?force=true&w=1400&q=78",
        fallback: "/assets/images/gym-konten-2-olahraga-ub-sport-center.avif",
    },
    {
        id: "03",
        name: "Squash Glass Court",
        category: "Competition Court",
        branch: "Dieng Branch",
        image: "https://unsplash.com/photos/NQaK7kIYkeg/download?force=true&w=1400&q=78",
        fallback: "/assets/images/fasilitas-beladiri-ub-sport-center.avif",
    },
    {
        id: "04",
        name: "Rooftop Padel",
        category: "Skyline Court",
        branch: "Future Branch",
        image: "https://unsplash.com/photos/0ETJ5mnMWg8/download?force=true&w=1400&q=78",
        fallback: "/assets/images/fasilitas-futsal-dieng-ub-sport-center.avif",
    },
    {
        id: "05",
        name: "Private Strength Lab",
        category: "Performance Studio",
        branch: "Veteran Branch",
        image: "https://unsplash.com/photos/O3UrNIU1FVQ/download?force=true&w=1400&q=78",
        fallback: "/assets/images/gym-konten-1-olahraga-ub-sport-center.avif",
    },
    {
        id: "06",
        name: "Athlete Recovery",
        category: "Recovery Suite",
        branch: "Dieng Branch",
        image: "https://unsplash.com/photos/rFd9Y7J_zHE/download?force=true&w=1400&q=78",
        fallback: "/assets/images/ub-sport-center-gym-footer.avif",
    },
];

function ExclusiveFacilityCard({
    facility,
    index,
    onOpen,
}: {
    facility: ExclusiveFacility;
    index: number;
    onOpen?: () => void;
}) {
    const cardRef = useRef<HTMLElement | null>(null);
    const [isPrepared, setIsPrepared] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const node = cardRef.current;
        if (!node) return;

        if (!("IntersectionObserver" in window)) {
            setIsPrepared(true);
            setIsVisible(true);
            return;
        }

        let prepareTimer = 0;
        const prepareObserver = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                prepareTimer = window.setTimeout(
                    () => setIsPrepared(true),
                    Math.min(index, 4) * 90,
                );
                prepareObserver.disconnect();
            },
            {
                threshold: 0,
                rootMargin: "240px 220px 520px 220px",
            },
        );

        const revealObserver = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                setIsVisible(true);
                revealObserver.disconnect();
            },
            {
                threshold: 0.12,
                rootMargin: "0px 120px -6% 120px",
            },
        );

        prepareObserver.observe(node);
        revealObserver.observe(node);

        return () => {
            window.clearTimeout(prepareTimer);
            prepareObserver.disconnect();
            revealObserver.disconnect();
        };
    }, [index]);

    const handleImageError = (event: SyntheticEvent<HTMLImageElement>) => {
        const image = event.currentTarget;
        if (image.dataset.fallbackApplied === "true") return;

        image.dataset.fallbackApplied = "true";
        image.src = facility.fallback;
    };

    return (
        <article
            ref={(node) => {
                cardRef.current = node;
            }}
            className={`exclusive-facilities__card ${
                isVisible ? "is-visible" : ""
            }`}
            style={
                {
                    "--exclusive-card-delay": `${Math.min(index, 4) * 65}ms`,
                } as CSSProperties
            }
            role="listitem"
        >
            <div className="exclusive-facilities__media">
                <img
                    src={isPrepared ? facility.image : TRANSPARENT_PIXEL}
                    alt={`${facility.name} - ${facility.category}`}
                    width="1100"
                    height="1450"
                    loading="lazy"
                    decoding="async"
                    className={isLoaded ? "is-loaded" : ""}
                    onLoad={() => {
                        if (isPrepared) setIsLoaded(true);
                    }}
                    onError={handleImageError}
                />
                <span
                    className="exclusive-facilities__media-shade"
                    aria-hidden="true"
                />
                <span className="exclusive-facilities__card-index font-bdo">
                    /{facility.id}
                </span>
                <span className="exclusive-facilities__card-branch font-bdo">
                    {facility.branch}
                </span>
                {facility.galleryItem && (
                    <button
                        type="button"
                        className="exclusive-facilities__open"
                        onClick={onOpen}
                        aria-label={`Buka ${facility.name}`}
                    />
                )}
            </div>

            <div className="exclusive-facilities__card-copy">
                <h3 className="font-bdo">{facility.name}</h3>
                <p className="font-bdo">{facility.category}</p>
            </div>
        </article>
    );
}

export default function ExclusiveFacilitiesSection({
    galleryItems,
}: ExclusiveFacilitiesSectionProps) {
    const items: ExclusiveFacility[] = galleryItems?.length
        ? galleryItems.map((item, index) => ({
              id: String(index + 1).padStart(2, "0"),
              name: item.title,
              category: item.arena_type,
              branch: item.location?.name ?? "UB Sport Center",
              image:
                  item.image?.fallback_url ??
                  item.poster?.fallback_url ??
                  "/assets/images/comingsoon.avif",
              fallback: "/assets/images/comingsoon.avif",
              galleryItem: item,
          }))
        : EXCLUSIVE_FACILITIES;
    const trackRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef(0);
    const [canScrollBack, setCanScrollBack] = useState(false);
    const [canScrollForward, setCanScrollForward] = useState(items.length > 1);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    const syncControls = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;

        const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
        const nextCanBack = track.scrollLeft > 4;
        const nextCanForward = track.scrollLeft < maxScroll - 4;

        setCanScrollBack((current) =>
            current === nextCanBack ? current : nextCanBack,
        );
        setCanScrollForward((current) =>
            current === nextCanForward ? current : nextCanForward,
        );
    }, []);

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;

        syncControls();
        const resizeObserver =
            "ResizeObserver" in window
                ? new ResizeObserver(syncControls)
                : null;

        resizeObserver?.observe(track);
        window.addEventListener("resize", syncControls, { passive: true });

        return () => {
            window.cancelAnimationFrame(frameRef.current);
            resizeObserver?.disconnect();
            window.removeEventListener("resize", syncControls);
        };
    }, [syncControls]);

    const handleScroll = () => {
        if (frameRef.current) return;

        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = 0;
            syncControls();
        });
    };

    const moveTrack = (direction: -1 | 1) => {
        const track = trackRef.current;
        const firstCard = track?.querySelector<HTMLElement>(
            ".exclusive-facilities__card",
        );
        if (!track || !firstCard) return;

        const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 16;
        track.scrollBy({
            left: direction * (firstCard.offsetWidth + gap),
            behavior: "smooth",
        });
    };

    return (
        <section
            className="exclusive-facilities"
            id="exclusive-facilities"
        >
            <div className="exclusive-facilities__divider">
                <SectionDivider
                    number="03"
                    title="Fasilitas Eksklusif"
                    subtitle="04 facilitypage"
                    theme="dark"
                />
            </div>

            <header className="exclusive-facilities__header">
                <FacilitySectionLabel
                    className="exclusive-facilities__eyebrow"
                    tone="dark"
                >
                    Cabang Eksklusif
                </FacilitySectionLabel>

                <ScrollTextReveal
                    as="h2"
                    split="lines"
                    delay={110}
                    stagger={95}
                    className="home-section-heading exclusive-facilities__heading section-two-headline-weight max-w-[1100px] font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-white md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-[980px] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:max-w-[1120px] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
                >
                    {EXCLUSIVE_HEADING}
                </ScrollTextReveal>

                <div className="exclusive-facilities__header-aside">
                    <span className="exclusive-facilities__header-index font-bdo">
                        03 / Private collection
                    </span>
                    <ScrollTextReveal
                        as="p"
                        split="words"
                        delay={170}
                        stagger={14}
                        className="exclusive-facilities__description font-bdo"
                    >
                        Dari padel hingga ruang performa privat, setiap cabang
                        dirancang dengan standar yang lebih tinggi.
                    </ScrollTextReveal>
                </div>
            </header>

            <div className="exclusive-facilities__stage">
                <div className="exclusive-facilities__stage-bar">
                    <span className="font-bdo">Selected spaces</span>
                    <span className="font-bdo">UBSC / Malang</span>
                    <div className="exclusive-facilities__stage-actions">
                        <span className="exclusive-facilities__stage-count font-bdo">
                            01 / {String(items.length).padStart(2, "0")}
                        </span>
                        <div className="exclusive-facilities__controls">
                            <button
                                type="button"
                                onClick={() => moveTrack(-1)}
                                disabled={!canScrollBack}
                                aria-label="Geser ke fasilitas sebelumnya"
                            >
                                <ChevronLeft size={18} strokeWidth={1.7} />
                            </button>
                            <button
                                type="button"
                                onClick={() => moveTrack(1)}
                                disabled={!canScrollForward}
                                aria-label="Geser ke fasilitas berikutnya"
                            >
                                <ChevronRight size={18} strokeWidth={1.7} />
                            </button>
                        </div>
                    </div>
                </div>

                <div
                    ref={trackRef}
                    className="exclusive-facilities__track"
                    onScroll={handleScroll}
                    role="list"
                    aria-label="Fasilitas cabang eksklusif"
                    data-lenis-prevent-touch=""
                >
                    {items.map((facility, index) => (
                        <ExclusiveFacilityCard
                            key={facility.id}
                            facility={facility}
                            index={index}
                            onOpen={
                                facility.galleryItem
                                    ? () => setLightboxIndex(index)
                                    : undefined
                            }
                        />
                    ))}
                </div>
            </div>

            <div
                className="exclusive-facilities__monument facility-section-monument"
                aria-hidden="true"
            >
                <ScrollTextReveal
                    split="block"
                    delay={110}
                    amount={0.25}
                    className="facility-section-monument__reveal"
                >
                    03
                </ScrollTextReveal>
                <ScrollTextReveal
                    split="block"
                    delay={205}
                    amount={0.25}
                    className="facility-section-monument__reveal"
                >
                    EXCLUSIVE
                </ScrollTextReveal>
            </div>
            <GalleryLightbox
                items={galleryItems ?? []}
                activeIndex={lightboxIndex}
                onChange={setLightboxIndex}
                source="facility-exclusive"
            />
        </section>
    );
}
