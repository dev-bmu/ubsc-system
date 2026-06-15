import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";

export interface CarouselImage {
    id: string;
    src: string;
    alt: string;
}

interface ImageCarouselProps {
    images: CarouselImage[];
    density?: "default" | "compact";
}

export default function ImageCarousel({
    images,
    density = "default",
}: ImageCarouselProps) {
    const visibleImages = images.filter((image) => image.src);
    const isCompact = density === "compact";
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        containScroll: "trimSnaps",
        dragFree: false,
        loop: visibleImages.length > 1,
    });
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [snapCount, setSnapCount] = useState(0);

    const onSelect = useCallback(() => {
        if (!emblaApi) return;

        setSelectedIndex(emblaApi.selectedScrollSnap());
        setSnapCount(emblaApi.scrollSnapList().length);
    }, [emblaApi]);

    useEffect(() => {
        if (!emblaApi) return;

        onSelect();
        emblaApi.on("select", onSelect);
        emblaApi.on("reInit", onSelect);

        return () => {
            emblaApi.off("select", onSelect);
            emblaApi.off("reInit", onSelect);
        };
    }, [emblaApi, onSelect]);

    useEffect(() => {
        if (!emblaApi || visibleImages.length === 0) return;

        const scrollToFirst = () => emblaApi.scrollTo(0, true);
        const initialFrame = window.requestAnimationFrame(scrollToFirst);
        const handleReInit = () => window.requestAnimationFrame(scrollToFirst);

        emblaApi.on("reInit", handleReInit);

        return () => {
            window.cancelAnimationFrame(initialFrame);
            emblaApi.off("reInit", handleReInit);
        };
    }, [emblaApi, visibleImages.length]);

    if (visibleImages.length === 0) return null;

    return (
        <div className="relative">
            <div ref={emblaRef} className="overflow-hidden">
                <div
                    className={`flex ${
                        isCompact
                            ? "-ml-[clamp(0.95rem,1.05vw,1.25rem)]"
                            : "-ml-[clamp(1rem,1.1vw,1.35rem)]"
                    }`}
                >
                    {visibleImages.map((image, index) => (
                        <figure
                            key={image.id}
                            className={`min-w-0 shrink-0 basis-[88%] sm:basis-[76%] md:basis-[68%] lg:basis-[55%] xl:basis-[45.5%] ${
                                isCompact
                                    ? "pl-[clamp(0.95rem,1.05vw,1.25rem)]"
                                    : "pl-[clamp(1rem,1.1vw,1.35rem)]"
                            }`}
                        >
                            <ProgramImage
                                image={image}
                                eager={index < 3}
                                compact={isCompact}
                                active={selectedIndex === index}
                            />
                        </figure>
                    ))}
                </div>
            </div>

            {snapCount > 1 && (
                <div className="mt-5 flex items-center justify-center xl:mt-5">
                    <div className="inline-flex items-center gap-2">
                        {Array.from({ length: snapCount }).map((_, index) => (
                            <button
                                key={index}
                                type="button"
                                onClick={() => emblaApi?.scrollTo(index)}
                                className="group relative flex h-3.5 w-3.5 items-center justify-center rounded-full outline-none transition"
                                aria-label={`Lihat gambar ${index + 1}`}
                            >
                                <span
                                    className={`absolute inset-0 rounded-full transition duration-500 ${
                                        selectedIndex === index
                                            ? "scale-100 bg-[#FF0000]/12 shadow-[0_0_14px_rgba(255,0,0,0.18)]"
                                            : "scale-75 bg-transparent"
                                    }`}
                                />
                                <span
                                    className={`relative h-2 w-2 rounded-full transition duration-500 ${
                                        selectedIndex === index
                                            ? "scale-100 bg-[#FF0000] shadow-[0_0_10px_rgba(255,0,0,0.42)]"
                                            : "scale-[0.68] bg-slate-400/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.8),0_2px_8px_rgba(15,23,42,0.12)] group-hover:scale-90 group-hover:bg-slate-500/80"
                                    }`}
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ProgramImage({
    image,
    eager,
    compact = false,
    active = false,
}: {
    image: CarouselImage;
    eager: boolean;
    compact?: boolean;
    active?: boolean;
}) {
    return (
        <div
            className={`relative rounded-[5px] transition duration-500 ${
                active
                    ? "shadow-[0_30px_72px_-56px_rgba(15,23,42,0.55)]"
                    : "shadow-[0_22px_56px_-48px_rgba(15,23,42,0.32)]"
            }`}
        >
            <div
                className={`relative aspect-[2.14/1] w-full overflow-hidden rounded-[5px] bg-black ${
                    compact ? "" : "md:h-[clamp(17rem,21.15vw,24.3rem)]"
                }`}
            >
                <img
                    src={image.src}
                    alt={image.alt}
                    className="h-full w-full object-cover object-center"
                    draggable={false}
                    loading={eager ? "eager" : "lazy"}
                />
                <span className="pointer-events-none absolute inset-0 rounded-[5px] ring-1 ring-inset ring-white/16" />
            </div>
        </div>
    );
}
