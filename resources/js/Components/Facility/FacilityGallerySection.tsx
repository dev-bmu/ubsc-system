import {
    type CSSProperties,
    type SyntheticEvent,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Link } from "@inertiajs/react";
import { ArrowUpRight } from "lucide-react";
import GalleryLightbox from "@/Components/Gallery/GalleryLightbox";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import type { FacilityItem } from "./FacilityListItem";
import type { PublicGalleryItem } from "@/types/gallery";
import {
    facilityReservationDestination,
    type PublicFacilityReservation,
} from "@/lib/facilityReservation";
import FacilitySectionLabel from "./FacilitySectionLabel";
import "./FacilitySectionMonument.css";
import "./FacilityGallerySection.css";

interface FacilityGallerySectionProps {
    facilities?: FacilityItem[];
    galleryItems?: PublicGalleryItem[];
}

interface CuratedGalleryItem {
    id: string;
    title: string;
    category: string;
    image: string;
    fallback: string;
    photographer: string;
    slug?: string;
    location?: string | null;
    reservation?: PublicFacilityReservation | null;
    galleryItem?: PublicGalleryItem;
}

const TRANSPARENT_PIXEL =
    "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const GALLERY_HEADING =
    "Temukan fasilitas indoor yang tepat untuk setiap target latihan Anda.";

const CURATED_GALLERY: CuratedGalleryItem[] = [
    {
        id: "01",
        title: "Arena Basket",
        category: "Indoor Court",
        image: "https://unsplash.com/photos/w9xgVg5tU4Q/download?force=true&w=1600&q=76",
        fallback: "/assets/images/fasilitas-futsal-dieng-ub-sport-center.avif",
        photographer: "Drew Dempsey",
    },
    {
        id: "02",
        title: "Lapangan Utama",
        category: "Competition Hall",
        image: "https://unsplash.com/photos/EKXCGy4Zsbg/download?force=true&w=1400&q=76",
        fallback: "/assets/images/fasilitas-tenis-ub-sport-center.avif",
        photographer: "Mitchell Griest",
    },
    {
        id: "03",
        title: "Tenis Indoor",
        category: "Racket Court",
        image: "https://unsplash.com/photos/z1txOkkTgGQ/download?force=true&w=1400&q=76",
        fallback: "/assets/images/fasilitas-tenis-ub-sport-center.avif",
        photographer: "Fiqih Alfarish",
    },
    {
        id: "04",
        title: "Badminton Hall",
        category: "Indoor Arena",
        image: "https://unsplash.com/photos/AILEpOyczIk/download?force=true&w=1600&q=76",
        fallback: "/assets/images/fasilitas-bulutangkis-ub-sport-center.avif",
        photographer: "Palak Pitroda",
    },
    {
        id: "05",
        title: "Tennis Training",
        category: "Performance Court",
        image: "https://unsplash.com/photos/_Qj2WwIhiDk/download?force=true&w=1400&q=76",
        fallback: "/assets/images/gym-konten-2-olahraga-ub-sport-center.avif",
        photographer: "Andy Sartori",
    },
    {
        id: "06",
        title: "Tenis Meja",
        category: "Precision Zone",
        image: "https://unsplash.com/photos/Hi6IM3MLYkg/download?force=true&w=1400&q=76",
        fallback: "/assets/images/fasilitas-tennis-meja-ub-sport-center.avif",
        photographer: "Hongjin Wang",
    },
    {
        id: "07",
        title: "Fitness Studio",
        category: "Training Space",
        image: "https://unsplash.com/photos/2mz9IKab7DE/download?force=true&w=1600&q=76",
        fallback: "/assets/images/gym-konten-1-olahraga-ub-sport-center.avif",
        photographer: "Rodrigo S",
    },
];

function normalizeFacilityTitle(title: string): string {
    return title.replace(/^\/+/, "").replace(/\.$/, "").trim();
}

function GalleryTile({
    item,
    index,
    onOpen,
}: {
    item: CuratedGalleryItem;
    index: number;
    onOpen?: () => void;
}) {
    const rootRef = useRef<HTMLElement | null>(null);
    const [isPrepared, setIsPrepared] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const node = rootRef.current;
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
                    index * 65,
                );
                prepareObserver.disconnect();
            },
            { threshold: 0, rootMargin: "360px 0px 140px 0px" },
        );
        const revealObserver = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                setIsVisible(true);
                revealObserver.disconnect();
            },
            { threshold: 0.12, rootMargin: "160px 0px -7% 0px" },
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
        image.src = item.fallback;
    };

    const reservationDestination = item.slug
        ? facilityReservationDestination(
              item.reservation,
              item.title,
              item.location,
          )
        : null;
    const Wrapper = (
        item.galleryItem
            ? "button"
            : reservationDestination?.target === "_self"
              ? Link
              : reservationDestination
                ? "a"
                : "article"
    ) as any;
    const wrapperProps = item.galleryItem
        ? { type: "button", onClick: onOpen }
        : reservationDestination
          ? {
                href: reservationDestination.href,
                target: reservationDestination.target,
                rel:
                    reservationDestination.target === "_blank"
                        ? "noopener noreferrer"
                        : undefined,
            }
          : {};

    return (
        <Wrapper
            {...wrapperProps}
            ref={(node: HTMLElement | null) => {
                rootRef.current = node;
            }}
            className={`facility-gallery__tile facility-gallery__tile--${index + 1} ${
                isVisible ? "is-visible" : ""
            } ${
                reservationDestination || item.galleryItem
                    ? "is-linked"
                    : "is-static"
            }`}
            style={
                {
                    "--facility-gallery-delay": `${Math.min(index, 4) * 55}ms`,
                } as CSSProperties
            }
            aria-label={`${item.title}, ${item.category}`}
            role="listitem"
        >
            <img
                src={isPrepared ? item.image : TRANSPARENT_PIXEL}
                alt={`${item.title} - ${item.category}`}
                width="1600"
                height="1200"
                loading="lazy"
                decoding="async"
                className={isLoaded ? "is-loaded" : ""}
                onLoad={() => {
                    if (isPrepared) setIsLoaded(true);
                }}
                onError={handleImageError}
            />

            <span className="facility-gallery__shade" aria-hidden="true" />
            <span className="facility-gallery__index font-bdo">
                ({item.id})
            </span>
            <span className="facility-gallery__arrow" aria-hidden="true">
                <ArrowUpRight size={19} strokeWidth={1.7} />
            </span>
            <span className="facility-gallery__caption">
                <strong className="font-bdo">{item.title}</strong>
                <span className="font-bdo">{item.category}</span>
            </span>
        </Wrapper>
    );
}

export default function FacilityGallerySection({
    facilities = [],
    galleryItems: cmsItems,
}: FacilityGallerySectionProps) {
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const galleryItems = useMemo(() => {
        if (cmsItems?.length) {
            return cmsItems.map((item, index): CuratedGalleryItem => ({
                id: String(index + 1).padStart(2, "0"),
                title: item.title,
                category: item.arena_type,
                image:
                    item.image?.fallback_url ??
                    item.poster?.fallback_url ??
                    "/assets/images/comingsoon.avif",
                fallback: "/assets/images/comingsoon.avif",
                photographer: item.credit,
                galleryItem: item,
            }));
        }

        return CURATED_GALLERY.map((item, index) => {
                const facility = facilities[index];

                return {
                    ...item,
                    title: facility
                        ? normalizeFacilityTitle(facility.title)
                        : item.title,
                    category: facility?.badgeType || item.category,
                    image: facility?.image || item.image,
                    slug: facility?.slug,
                    location: facility?.badgeLocation,
                    reservation: facility?.reservation,
                };
            });
    }, [cmsItems, facilities]);

    return (
        <section className="facility-gallery" id="facility-gallery">
            <div className="facility-gallery__divider">
                <SectionDivider
                    number="02"
                    title="Fasilitas Indoor"
                    subtitle="04 facilitypage"
                    theme="light"
                />
            </div>

            <div className="facility-gallery__inner">
                <div className="facility-gallery__stage">
                    <div className="facility-gallery__stage-bar font-bdo">
                        <span>Indoor archive</span>
                        <Link
                            href={route("gallery.index")}
                            className="facility-gallery__archive-link"
                            aria-label="Lihat semua foto di galeri fasilitas UB Sport Center"
                        >
                            <span>Lihat semua foto</span>
                            <ArrowUpRight aria-hidden="true" />
                        </Link>
                        <span>
                            Collection {String(galleryItems.length).padStart(2, "0")}
                        </span>
                    </div>

                    <div className="facility-gallery__composition">
                        <header className="facility-gallery__intro">
                            <FacilitySectionLabel className="facility-gallery__eyebrow">
                                Koleksi Arena
                            </FacilitySectionLabel>

                            <ScrollTextReveal
                                as="h2"
                                split="lines"
                                delay={110}
                                stagger={95}
                                className="home-section-heading facility-gallery__heading section-two-headline-weight text-left font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(1.56rem,3.375vw,1.95rem)] lg:text-[clamp(1.815rem,3.135vw,2.2275rem)] xl:text-[clamp(1.69125rem,1.9635vw,1.947rem)] min-[1440px]:text-[clamp(2.02125rem,2.3265vw,2.2275rem)] 2xl:text-[clamp(2.2275rem,2.10375vw,2.59875rem)]"
                            >
                                {GALLERY_HEADING}
                            </ScrollTextReveal>

                            <div className="facility-gallery__aside">
                                <span className="facility-gallery__intro-index font-bdo">
                                    02 / Indoor archive
                                </span>
                                <ScrollTextReveal
                                    as="p"
                                    split="words"
                                    delay={180}
                                    stagger={14}
                                    className="facility-gallery__copy font-bdo"
                                >
                                    Ruang untuk fokus, bergerak, dan membangun
                                    ritme latihan yang lebih baik.
                                </ScrollTextReveal>
                            </div>
                        </header>

                        <div
                            className="facility-gallery__grid"
                            role="list"
                            aria-label="Koleksi fasilitas indoor UB Sport Center"
                        >
                            {galleryItems.map((item, index) => (
                                <GalleryTile
                                    key={item.id}
                                    item={item}
                                    index={index}
                                    onOpen={
                                        item.galleryItem
                                            ? () => setLightboxIndex(index)
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    </div>

                    <div
                        className="facility-gallery__stage-footer facility-section-monument"
                        aria-hidden="true"
                    >
                        <ScrollTextReveal
                            split="block"
                            delay={110}
                            amount={0.25}
                            className="facility-section-monument__reveal"
                        >
                            02
                        </ScrollTextReveal>
                        <ScrollTextReveal
                            split="block"
                            delay={205}
                            amount={0.25}
                            className="facility-section-monument__reveal"
                        >
                            INDOOR
                        </ScrollTextReveal>
                    </div>
                </div>
            </div>
            <GalleryLightbox
                items={cmsItems ?? []}
                activeIndex={lightboxIndex}
                onChange={setLightboxIndex}
                source="facility-indoor"
            />
        </section>
    );
}
