import {
    lazy,
    Suspense,
    useEffect,
    useRef,
    useState,
    type RefObject,
} from "react";

const loadSectionEight = () => import("./SectionEight");
const LazySectionEight = lazy(loadSectionEight);

type DeferredSectionEightProps = {
    deferLoopAnimations?: boolean;
};

type SectionEightPlaceholderProps = DeferredSectionEightProps & {
    observerRef?: RefObject<HTMLElement>;
};

function SectionEightPlaceholder({
    deferLoopAnimations = false,
    observerRef,
}: SectionEightPlaceholderProps) {
    return (
        <section
            ref={observerRef}
            id="about-map"
            aria-label="Lokasi UB Sport Center"
            aria-busy="true"
            data-pricing-loop-region={
                deferLoopAnimations ? "true" : undefined
            }
            className="relative isolate flex w-full items-center overflow-hidden bg-[#252525] px-0 pb-10 pt-5 sm:pb-14 sm:pt-12 lg:pb-16 xl:min-h-[606px] xl:py-[56px]"
        >
            <span className="sr-only">Bagian lokasi sedang dimuat.</span>

            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_76%_32%,rgba(255,255,255,0.08),transparent_34%),linear-gradient(118deg,#171717_0%,#303030_54%,#202020_100%)]"
            />

            <div
                aria-hidden="true"
                className="relative mx-auto w-full px-[14px] sm:px-8 lg:px-12 xl:px-[clamp(3.5rem,6.35vw,7.6rem)]"
            >
                <div className="relative grid grid-cols-1 xl:grid-cols-[341px_minmax(0,1fr)] xl:items-start xl:gap-[50px]">
                    <div className="relative flex flex-col xl:pt-[23px]">
                        <div className="mx-auto h-4 w-36 rounded-sm bg-white/10 sm:h-5 sm:w-44 lg:h-6 xl:mb-[29px] xl:ml-10 xl:mr-0" />
                        <div className="mx-auto mt-[13px] h-[190px] w-[174px] overflow-hidden rounded-[2px] bg-white/[0.055] sm:mt-5 sm:h-[285px] sm:w-[228px] lg:h-[330px] lg:w-[264px] xl:mx-0 xl:mt-0 xl:h-[416px] xl:w-full xl:rounded-[5px]" />
                    </div>

                    <div className="section-eight-map-skeleton relative mt-4 h-[306px] overflow-hidden rounded-[2px] sm:mt-[26px] sm:h-[432px] lg:mt-8 lg:h-[516px] xl:mt-0 xl:h-[493px] xl:rounded-[5px]" />
                </div>
            </div>
        </section>
    );
}

export default function DeferredSectionEight({
    deferLoopAnimations = false,
}: DeferredSectionEightProps) {
    const observerRef = useRef<HTMLElement>(null);
    const [shouldLoad, setShouldLoad] = useState(false);

    useEffect(() => {
        if (shouldLoad) return;

        // Keep the map out of the critical bundle, but prepare its code once the
        // first screen is idle. The section can then mount immediately when the
        // visitor approaches it instead of starting a 1 MB download at that point.
        const idleWindow = window as typeof window & {
            requestIdleCallback?: (
                callback: () => void,
                options?: { timeout: number },
            ) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        let fallbackTimer = 0;
        let idleHandle: number | undefined;
        const preload = () => {
            void loadSectionEight();
        };

        if (typeof idleWindow.requestIdleCallback === "function") {
            idleHandle = idleWindow.requestIdleCallback(preload, {
                timeout: 2400,
            });
        } else {
            fallbackTimer = window.setTimeout(preload, 1400);
        }

        return () => {
            if (
                idleHandle !== undefined &&
                typeof idleWindow.cancelIdleCallback === "function"
            ) {
                idleWindow.cancelIdleCallback(idleHandle);
            }
            window.clearTimeout(fallbackTimer);
        };
    }, [shouldLoad]);

    useEffect(() => {
        if (shouldLoad) return;

        const target = observerRef.current;
        if (!target) return;

        const loadSection = () => setShouldLoad(true);

        if (typeof window.IntersectionObserver !== "function") {
            const fallbackTimer = window.setTimeout(loadSection, 200);
            return () => window.clearTimeout(fallbackTimer);
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                observer.disconnect();
                loadSection();
            },
            {
                // MapLibre still has to initialize its worker and fetch map tiles.
                // Start that work well before this below-the-fold section becomes
                // visible so the visitor never arrives at a permanently blank map.
                rootMargin: "2200px 0px",
                threshold: 0,
            },
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [shouldLoad]);

    if (!shouldLoad) {
        return (
            <SectionEightPlaceholder
                deferLoopAnimations={deferLoopAnimations}
                observerRef={observerRef}
            />
        );
    }

    return (
        <Suspense
            fallback={
                <SectionEightPlaceholder
                    deferLoopAnimations={deferLoopAnimations}
                />
            }
        >
            <LazySectionEight deferLoopAnimations={deferLoopAnimations} />
        </Suspense>
    );
}
