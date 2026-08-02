import useEmblaCarousel from "embla-carousel-react";
import {
    useCallback,
    useEffect,
    useState,
    type AnimationEvent,
} from "react";
import AnimatedBookingLink from "@/Components/News/AnimatedBookingLink";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import { cn } from "@/lib/utils";

/** Auto-advance interval. The visible progress bar IS this clock —
 *  see the single-clock note in the component below. */
const SLIDE_MS = 6500;
const ARTICLE_LINE_GRADIENT =
    "linear-gradient(90deg, #15678d 0%, #1a9fc0 45%, transparent 100%)";
const NEWS_LINE_GRADIENT =
    "linear-gradient(90deg, #ff2d2d 0%, #d50000 45%, transparent 100%)";

function getHeroBadgeTone(badge: string) {
    return badge.trim().toLowerCase() === "artikel"
        ? {
              tone: "artikel" as const,
              line: ARTICLE_LINE_GRADIENT,
          }
        : {
              tone: "berita" as const,
              line: NEWS_LINE_GRADIENT,
          };
}

const PrevArrow = () => (
    <svg className="h-[15px] w-[15px] xl:h-5 xl:w-5" width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 6L9 16L19 26" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const NextArrow = () => (
    <svg className="h-[15px] w-[15px] xl:h-5 xl:w-5" width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 6L23 16L13 26" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export interface NewsSlide {
    id: number | string;
    slug?: string;
    badge: string;
    title: string;
    description: string;
    date: string;
    image: string;
}

export default function NewsHero({ slides }: { slides: NewsSlide[] }) {
    const activeSlides = slides;
    const hasMultiple = activeSlides.length > 1;

    const [emblaRef, emblaApi] = useEmblaCarousel({
        loop: true,
        duration: 36,
        align: "start",
    });

    const [selectedIndex, setSelectedIndex] = useState(0);
    /** Bumped on every slide change → remounts the active progress fill so
     *  its CSS animation restarts from 0. This is what makes user nav and
     *  auto-advance share ONE clock (no race / "rebutan klik"). */
    const [cycle, setCycle] = useState(0);

    // Pause sources — auto-advance halts while any is true.
    const [hovering, setHovering] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [hidden, setHidden] = useState(false);
    const isPaused = hovering || dragging || hidden;

    const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
    const scrollTo = useCallback(
        (i: number) => emblaApi?.scrollTo(i),
        [emblaApi],
    );

    /* ── Selection + interaction tracking ── */
    useEffect(() => {
        if (!emblaApi) return;
        const onSelect = () => {
            setSelectedIndex(emblaApi.selectedScrollSnap());
            setCycle((c) => c + 1);
        };
        const onPointerDown = () => setDragging(true);
        const onPointerUp = () => setDragging(false);
        onSelect();
        emblaApi
            .on("select", onSelect)
            .on("reInit", onSelect)
            .on("pointerDown", onPointerDown)
            .on("pointerUp", onPointerUp);
        return () => {
            emblaApi
                .off("select", onSelect)
                .off("reInit", onSelect)
                .off("pointerDown", onPointerDown)
                .off("pointerUp", onPointerUp);
        };
    }, [emblaApi]);

    /* ── Pause auto-advance when the tab is hidden ── */
    useEffect(() => {
        const onVis = () => setHidden(document.hidden);
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, []);

    /* ── Single-clock auto-advance: the active progress bar finishing IS
       the trigger. User nav remounts it (restart) and unmounts the old one,
       so a stale bar can never fire — eliminating click vs. autoplay races. */
    const onProgressEnd = useCallback(
        (e: AnimationEvent<HTMLSpanElement>) => {
            if (e.animationName !== "nh-progress") return;
            scrollNext();
        },
        [scrollNext],
    );

    const pauseOn = {
        onMouseEnter: () => setHovering(true),
        onMouseLeave: () => setHovering(false),
    };

    return (
        <section className="relative w-full bg-black overflow-x-clip" id="home">
            {/* Lightweight static atmosphere behind all slides */}
            <div
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                    background:
                        "radial-gradient(circle at 76% 24%, rgba(21, 103, 141, 0.48), transparent 58%), linear-gradient(90deg, #173859 0%, #173859 44%, #15678D 100%)",
                }}
            >
                <div
                    className="absolute inset-0 opacity-[0.1641] md:opacity-[0.07]"
                    style={{
                        backgroundImage:
                            "radial-gradient(rgba(255,255,255,0.55) 0.55px, transparent 0.65px)",
                        backgroundSize: "3px 3px",
                    }}
                    aria-hidden="true"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/50 to-black/80" />
            </div>

            {/* Embla carousel */}
            <div className="relative z-10 overflow-hidden" ref={emblaRef}>
                <div className="flex">
                    {activeSlides.map((slide, idx) => {
                        const badgeTone = getHeroBadgeTone(slide.badge);
                        const detailHref = slide.slug
                            ? route("news.show", slide.slug)
                            : "#news-content";

                        return (
                            <div
                                key={slide.id}
                                className={cn(
                                    "nh-slide flex-[0_0_100%] min-w-0 w-full h-screen min-h-[650px] flex flex-col justify-between xl:h-[calc(100vh+100px)] xl:min-h-[750px]",
                                    idx === selectedIndex && "nh-active",
                                )}
                            >
                            {/* Top text area */}
                            <div className="relative">
                                <div className="nh-mobile-top-gap h-28 xl:h-36" />

                                <div className="relative z-10 grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 px-8 xl:px-16 pb-10 xl:pb-12 items-end">
                                    <div className="xl:col-span-8 flex flex-col gap-4">
                                        <div className="flex items-center gap-3">
                                            <div
                                                 className="news-gradient-badge news-gradient-badge--story nh-reveal relative flex h-[27px] min-w-[5.704rem] items-center justify-center rounded-[5px] px-[0.9375rem] text-center md:h-9 md:min-w-[7.604rem] md:px-5"
                                                 data-tone={badgeTone.tone}
                                                 style={{
                                                     ["--i" as string]: 0,
                                                 }}
                                            >
                                                <span className="font-clash text-[0.65625rem] font-bold text-white md:text-[clamp(0.875rem,0.83vw,16px)]">
                                                    {slide.badge}
                                                </span>
                                            </div>
                                            <span
                                                className="news-gradient-line nh-line h-[2px] w-16 rounded-full"
                                                style={{ background: badgeTone.line }}
                                            />
                                        </div>

                                        <h1 className="nh-clip font-bdo font-medium text-xl md:text-2xl xl:text-[clamp(1.125rem,1.46vw,28px)] text-white leading-snug max-w-[656px]">
                                            <span style={{ ["--i" as string]: 1 }}>
                                                {slide.title}
                                            </span>
                                        </h1>

                                        <p
                                            className="nh-reveal font-bdo font-light text-[0.85rem] text-white/70 max-w-[643px] md:text-base xl:text-[clamp(1rem,1.25vw,24px)]"
                                            style={{ ["--i" as string]: 3 }}
                                        >
                                            {slide.description}
                                        </p>
                                    </div>

                                    <div className="xl:col-span-4 flex flex-col xl:items-end justify-end gap-3 w-full xl:w-auto xl:self-stretch xl:relative">
                                        <span
                                            className="nh-reveal font-bdo font-light text-[0.85rem] text-white/80 md:text-base xl:absolute xl:right-0 xl:top-4 xl:text-[clamp(1rem,1.04vw,20px)]"
                                            style={{ ["--i" as string]: 4 }}
                                        >
                                            {slide.date}
                                        </span>
                                        <div
                                            className="nh-reveal"
                                            style={{ ["--i" as string]: 5 }}
                                        >
                                            <AnimatedBookingLink
                                                href={detailHref}
                                                label="Lihat selengkapnya"
                                                arrowVariant="hero"
                                                width="clamp(19rem,20.2vw,24.25rem)"
                                                textClassName="text-[clamp(1rem,1.25vw,24px)]"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Per-slide image with Ken Burns */}
                            <a
                                href={detailHref}
                                aria-label={`Buka detail ${slide.title}`}
                                className="nh-img group relative block w-full flex-1 overflow-hidden bg-neutral-900"
                            >
                                <img
                                    src={slide.image}
                                    alt={slide.title}
                                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.025]"
                                    loading={idx === 0 ? "eager" : "lazy"}
                                    draggable={false}
                                />
                                <div className="nh-sheen" aria-hidden="true" />
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
                                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/70 to-transparent" />
                            </a>
                            </div>
                        );
                    })}
                </div>

                {/* ── Track-level controls (single set) ── */}
                {hasMultiple && (
                    <>
                        <button
                            type="button"
                            onClick={scrollPrev}
                            aria-label="Previous slide"
                            className="nh-nav-button group absolute left-3 xl:left-6 top-[58%] -translate-y-1/2 z-20 flex size-[40px] xl:size-[60px] items-center justify-center rounded-full border border-white/25 bg-black/25 text-white backdrop-blur-sm"
                        >
                            <span className="nh-nav-icon nh-nav-icon--prev">
                                <PrevArrow />
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={scrollNext}
                            aria-label="Next slide"
                            className="nh-nav-button group absolute right-3 xl:right-6 top-[58%] -translate-y-1/2 z-20 flex size-[40px] xl:size-[60px] items-center justify-center rounded-full border border-white/25 bg-black/25 text-white backdrop-blur-sm"
                        >
                            <span className="nh-nav-icon nh-nav-icon--next">
                                <NextArrow />
                            </span>
                        </button>

                        {/* ── Pro segmented progress dots (the auto-advance clock) ── */}
                        <div
                            {...pauseOn}
                            className={cn(
                                "absolute bottom-[7.5rem] left-8 z-20 flex items-center gap-2.5 md:bottom-[7.85rem] xl:bottom-[8.45rem] xl:left-16",
                                isPaused && "nh-dots-paused",
                            )}
                            style={{ ["--nh-duration" as string]: `${SLIDE_MS}ms` }}
                        >
                            {activeSlides.map((s, i) => {
                                const active = i === selectedIndex;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => scrollTo(i)}
                                        aria-label={`Go to slide ${i + 1}`}
                                        className="group py-2"
                                    >
                                        <span
                                            className={cn(
                                                "nh-dot block",
                                                active
                                                    ? "nh-dot-active w-12 xl:w-16"
                                                    : "w-5 group-hover:bg-white/45",
                                            )}
                                        >
                                            {active ? (
                                                <span
                                                    key={cycle}
                                                    className="nh-dot-fill"
                                                    onAnimationEnd={onProgressEnd}
                                                />
                                            ) : (
                                                <span className="nh-dot-fill" />
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                            <span className="ml-2 font-bdo text-[11px] font-medium tabular-nums text-white/55">
                                {String(selectedIndex + 1).padStart(2, "0")}
                                <span className="mx-1 text-white/25">/</span>
                                {String(activeSlides.length).padStart(2, "0")}
                            </span>
                        </div>
                    </>
                )}

                <div className="nh-bottom page-hero-bottom pointer-events-auto absolute inset-x-0 bottom-0 z-30">
                    <HeroBottomBar
                        sectionNumber="03/"
                        sectionLabel="newspage"
                        description="UB Sport Center – Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama."
                        targetId="news-content"
                        showVideo
                        mobileVideoOnly
                        variant="transparent"
                        lineInset
                        sectionInset
                        mobileCopySmaller
                        mobileCopyLockRight
                    />
                </div>
            </div>
        </section>
    );
}
