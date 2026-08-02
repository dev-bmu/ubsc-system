import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type KeyboardEvent,
    type SyntheticEvent,
} from "react";

export interface BookingGalleryImage {
    id: string;
    src: string;
    alt: string;
    source: "hero" | "facility-gallery" | "unit" | "fallback";
    unit_id: number | null;
    unit_name: string | null;
}

interface BookingFacilityGalleryProps {
    facilityName: string;
    images: BookingGalleryImage[];
}

const FALLBACK_IMAGE = "/assets/images/comingsoon.avif";

function applyGalleryImageFallback(
    event: SyntheticEvent<HTMLImageElement>,
): void {
    const image = event.currentTarget;

    if (image.dataset.fallbackApplied === "true") {
        image.style.opacity = "0";
        return;
    }

    image.dataset.fallbackApplied = "true";
    image.src = FALLBACK_IMAGE;
}

export default function BookingFacilityGallery({
    facilityName,
    images,
}: BookingFacilityGalleryProps) {
    const reduceMotion = useReducedMotion();
    const gallery = useMemo(() => {
        const seen = new Set<string>();

        return images.filter((image) => {
            const key = image.id || image.src;

            if (!image.src || seen.has(key)) {
                return false;
            }

            seen.add(key);
            return true;
        });
    }, [images]);
    const safeGallery = useMemo<BookingGalleryImage[]>(
        () =>
            gallery.length > 0
                ? gallery
                : [
                      {
                          id: "fallback",
                          src: FALLBACK_IMAGE,
                          alt: facilityName,
                          source: "fallback",
                          unit_id: null,
                          unit_name: null,
                      },
                  ],
        [facilityName, gallery],
    );
    const hasMultipleImages = safeGallery.length > 1;
    const gallerySignature = safeGallery
        .map((image) => `${image.id}:${image.src}`)
        .join("|");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        containScroll: "trimSnaps",
        dragFree: false,
        loop: hasMultipleImages,
        skipSnaps: false,
        watchDrag: hasMultipleImages,
    });

    const syncSelection = useCallback(() => {
        if (!emblaApi) {
            return;
        }

        setSelectedIndex(emblaApi.selectedScrollSnap());
    }, [emblaApi]);

    useEffect(() => {
        if (!emblaApi) {
            return;
        }

        syncSelection();
        emblaApi.on("select", syncSelection);
        emblaApi.on("reInit", syncSelection);

        return () => {
            emblaApi.off("select", syncSelection);
            emblaApi.off("reInit", syncSelection);
        };
    }, [emblaApi, syncSelection]);

    useEffect(() => {
        if (!emblaApi) {
            return;
        }

        emblaApi.reInit();
        emblaApi.scrollTo(0, true);
        setSelectedIndex(0);
    }, [emblaApi, gallerySignature]);

    useEffect(() => {
        if (typeof window === "undefined" || safeGallery.length < 2) {
            return;
        }

        const neighboringIndexes = [
            (selectedIndex + 1) % safeGallery.length,
            (selectedIndex - 1 + safeGallery.length) % safeGallery.length,
        ];

        neighboringIndexes.forEach((index) => {
            const preload = new window.Image();
            preload.src = safeGallery[index].src;
        });
    }, [safeGallery, selectedIndex]);

    const scrollPrevious = useCallback(() => {
        emblaApi?.scrollPrev();
    }, [emblaApi]);

    const scrollNext = useCallback(() => {
        emblaApi?.scrollNext();
    }, [emblaApi]);

    const handleKeyDown = useCallback(
        (event: KeyboardEvent<HTMLDivElement>) => {
            if (!hasMultipleImages || !emblaApi) {
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                emblaApi.scrollPrev();
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                emblaApi.scrollNext();
            } else if (event.key === "Home") {
                event.preventDefault();
                emblaApi.scrollTo(0);
            } else if (event.key === "End") {
                event.preventDefault();
                emblaApi.scrollTo(safeGallery.length - 1);
            }
        },
        [emblaApi, hasMultipleImages, safeGallery.length],
    );

    const currentImage =
        safeGallery[Math.min(selectedIndex, safeGallery.length - 1)];

    return (
        <div
            className="booking-directory-item__stage"
            role="region"
            aria-roledescription="carousel"
            aria-label={`Galeri ${facilityName}`}
            tabIndex={hasMultipleImages ? 0 : -1}
            onKeyDown={handleKeyDown}
        >
            <AnimatePresence initial={false}>
                <motion.img
                    key={`backdrop:${currentImage.id}`}
                    className="booking-directory-item__backdrop"
                    src={currentImage.src}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    decoding="async"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 0.34 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        duration: reduceMotion ? 0 : 0.22,
                        ease: [0.22, 1, 0.36, 1],
                    }}
                    onError={applyGalleryImageFallback}
                />
            </AnimatePresence>

            {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                <span
                    key={corner}
                    className={`booking-directory-item__stage-mark booking-directory-item__stage-mark--${corner}`}
                    aria-hidden="true"
                >
                    <i />
                </span>
            ))}

            <div className="booking-directory-item__frame">
                <div
                    className="booking-directory-item__gallery-viewport"
                    ref={emblaRef}
                >
                    <div className="booking-directory-item__gallery-track">
                        {safeGallery.map((image, index) => (
                            <div
                                className="booking-directory-item__gallery-slide"
                                key={image.id}
                                role="group"
                                aria-roledescription="slide"
                                aria-label={`${index + 1} dari ${safeGallery.length}`}
                            >
                                <img
                                    src={image.src}
                                    alt={image.alt || facilityName}
                                    loading={index === 0 ? "eager" : "lazy"}
                                    decoding="async"
                                    draggable={false}
                                    onDragStart={(event) =>
                                        event.preventDefault()
                                    }
                                    onError={applyGalleryImageFallback}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {hasMultipleImages && (
                    <>
                        <div
                            className="booking-directory-item__gallery-progress"
                            aria-label="Pilih gambar galeri"
                        >
                            {safeGallery.map((image, index) => (
                                <button
                                    key={`progress:${image.id}`}
                                    type="button"
                                    className={
                                        index === selectedIndex
                                            ? "is-active"
                                            : undefined
                                    }
                                    aria-label={`Tampilkan gambar ${index + 1}`}
                                    aria-current={
                                        index === selectedIndex
                                            ? "true"
                                            : undefined
                                    }
                                    onClick={() => emblaApi?.scrollTo(index)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            {hasMultipleImages && (
                <div className="booking-directory-item__gallery-controls">
                    <button
                        type="button"
                        className="booking-directory-item__gallery-arrow booking-directory-item__gallery-arrow--previous"
                        aria-label="Gambar sebelumnya"
                        onClick={scrollPrevious}
                    >
                        <ChevronLeft aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className="booking-directory-item__gallery-arrow booking-directory-item__gallery-arrow--next"
                        aria-label="Gambar berikutnya"
                        onClick={scrollNext}
                    >
                        <ChevronRight aria-hidden="true" />
                    </button>
                </div>
            )}

            <span className="sr-only" aria-live="polite" aria-atomic="true">
                Gambar {selectedIndex + 1} dari {safeGallery.length}
            </span>
        </div>
    );
}
