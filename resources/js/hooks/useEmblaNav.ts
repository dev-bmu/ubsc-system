import { useCallback } from "react";
import type { EmblaCarouselType } from "embla-carousel";

export function useEmblaNav(emblaApi: EmblaCarouselType | undefined) {
    const scrollPrev = useCallback(
        () => emblaApi?.scrollPrev(),
        [emblaApi],
    );
    const scrollNext = useCallback(
        () => emblaApi?.scrollNext(),
        [emblaApi],
    );
    return { scrollPrev, scrollNext };
}
