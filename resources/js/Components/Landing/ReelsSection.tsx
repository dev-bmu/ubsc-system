import { useCallback, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEmblaNav } from "@/hooks/useEmblaNav";
import ReelCard from "@/Components/Landing/ReelCard";
import type { ReelItem } from "@/Components/Landing/ReelCard";

/* ─────────────────────────────────────────────────────────────────
   Relative time helper
   "X menit lalu" / "X jam lalu" / "X hari lalu" up to 30 days,
   then "31 Des" (with year lighter, passed separately)
   ───────────────────────────────────────────────────────────────── */
const ID_MONTHS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, Mei: 4, Jun: 5,
    Jul: 6, Agu: 7, Sep: 8, Okt: 9, Nov: 10, Des: 11,
};

function parseDate(dateStr: string): Date | null {
    // Expects "31 Des 2025"
    const parts = dateStr.split(" ");
    if (parts.length < 3) return null;
    const day   = parseInt(parts[0], 10);
    const month = ID_MONTHS[parts[1]];
    const year  = parseInt(parts[2], 10);
    if (isNaN(day) || month === undefined || isNaN(year)) return null;
    return new Date(year, month, day);
}

function relativeTime(dateStr: string): {
    label: string;   // "31 Des" or "3 hari lalu" etc.
    year: string | null; // "2025" shown lighter, null if relative
} {
    const date = parseDate(dateStr);
    if (!date) return { label: dateStr, year: null };

    const now     = Date.now();
    const diffMs  = now - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr  = Math.floor(diffMs / 3_600_000);
    const diffDay = Math.floor(diffMs / 86_400_000);

    if (diffMin < 1)   return { label: "Baru saja",         year: null };
    if (diffMin < 60)  return { label: `${diffMin} mnt lalu`, year: null };
    if (diffHr  < 24)  return { label: `${diffHr} jam lalu`,  year: null };
    if (diffDay < 30)  return { label: `${diffDay} hari lalu`, year: null };

    const parts = dateStr.split(" ");
    return { label: `${parts[0]} ${parts[1]}`, year: parts[2] ?? null };
}

/* ─────────────────────────────────────────────────────────────────
   Data ordered newest → oldest (index 0 = terbaru)
   ───────────────────────────────────────────────────────────────── */
const DUMMY_REELS: ReelItem[] = [
    { id: 1, date: "31 Des 2025", title: "SPORT CENTER UB.", isActive: true,  thumbnail: "/assets/reels/thumbnail 1.png", videoUrl: "/assets/reels/reels ubsc 1.mp4" },
    { id: 2, date: "16 Des 2025", title: "SPORT CENTER UB.",                  thumbnail: "/assets/reels/thumbnail 2.png", videoUrl: "/assets/reels/reels ubsc 2.mp4" },
    { id: 3, date: "16 Des 2025", title: "SPORT CENTER UB.",                  thumbnail: "/assets/reels/thumbnail 3.png", videoUrl: "/assets/reels/reels ubsc 3.mp4" },
    { id: 4, date: "16 Des 2025", title: "SPORT CENTER UB.",                  thumbnail: "/assets/reels/thumbnail 4.png", videoUrl: "/assets/reels/reels ubsc 4.mp4" },
    { id: 5, date: "16 Des 2025", title: "SPORT CENTER UB.",                  thumbnail: "/assets/reels/thumbnail 5.png", videoUrl: "/assets/reels/reels ubsc 5.mp4" },
];

/* ── Nav button ── */
function ReelArrow({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
            <path d="M12 32H52M52 32L34 14M52 32L34 50" stroke="currentColor" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ReelsNavButton({ direction, onClick }: { direction: "prev" | "next"; onClick: () => void }) {
    const isNext = direction === "next";
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={isNext ? "Next reels" : "Previous reels"}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 sm:h-10 sm:w-10 xl:h-12 xl:w-12 ${
                isNext
                    ? "border-white bg-white text-black hover:bg-white/85"
                    : "border-white/80 text-white hover:bg-white hover:text-black"
            }`}
        >
            {isNext ? <ChevronRight className="h-[14px] w-[14px] sm:h-[18px] sm:w-[18px] xl:h-5 xl:w-5" /> : <ChevronLeft className="h-[14px] w-[14px] sm:h-[18px] sm:w-[18px] xl:h-5 xl:w-5" />}
        </button>
    );
}

function ReelsCta() {
    const [hovered, setHovered] = useState(false);
    return (
        <a
            href="https://www.instagram.com/ubsportcenter/?hl=en"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block min-w-0 overflow-hidden border-b border-white/75 pb-[7px] pt-1 text-white"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <span
                aria-hidden
                className="pointer-events-none absolute -inset-x-3 -inset-y-8 bg-[#ff0000]"
                style={{
                    transform: hovered ? "skewY(-4deg) translateY(0)" : "skewY(-4deg) translateY(125%)",
                    transition: "transform 0.5s cubic-bezier(0.76, 0, 0.24, 1)",
                }}
            />
            <span className="relative z-10 flex items-center justify-between gap-4 font-bdo text-[12px] font-normal leading-none tracking-[-0.02em] sm:text-[14px] xl:text-[20px]">
                Ikuti Keseruan Kami
                <ReelArrow className={`h-[14px] w-[14px] shrink-0 transition-transform duration-500 ease-out sm:h-[18px] sm:w-[18px] xl:h-[22px] xl:w-[22px] ${hovered ? "rotate-0" : "-rotate-45"}`} />
            </span>
        </a>
    );
}

interface ReelsSectionProps { reels?: ReelItem[]; }

export default function ReelsSection({ reels = DUMMY_REELS }: ReelsSectionProps) {
    const sectionRef               = useRef<HTMLElement>(null);
    const layoutFrameRef           = useRef<number>(0);
    const [isVisible, setIsVisible]   = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        dragFree: true,
        loop: true,
        containScroll: false,
        duration: 24,
        watchResize: false,
        watchDrag: (_emblaApi, event) => {
            const target = event.target;
            return !(
                target instanceof Element &&
                target.closest("[data-reel-control]")
            );
        },
    });
    const { scrollPrev, scrollNext } = useEmblaNav(emblaApi);

    /* Card activated by tap */
    const handleActivate = useCallback((index: number) => {
        if (index === activeIndex) return;
        setActiveIndex(index);
        cancelAnimationFrame(layoutFrameRef.current);
        layoutFrameRef.current = requestAnimationFrame(() => {
            emblaApi?.reInit();
            emblaApi?.scrollTo(index, false);
        });
    }, [activeIndex, emblaApi]);

    useEffect(() => {
        if (!emblaApi) return;
        let resizeFrame = 0;
        const handleResize = () => {
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => emblaApi.reInit());
        };

        window.addEventListener("resize", handleResize, { passive: true });
        return () => {
            cancelAnimationFrame(resizeFrame);
            cancelAnimationFrame(layoutFrameRef.current);
            window.removeEventListener("resize", handleResize);
        };
    }, [emblaApi]);

    /* Section entrance */
    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;
        if (!("IntersectionObserver" in window)) { setIsVisible(true); return; }
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry?.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
            { threshold: 0.04, rootMargin: "0px 0px -8% 0px" },
        );
        observer.observe(section);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isVisible) return;
        const timer = window.setTimeout(() => setIsComplete(true), 2300);
        return () => window.clearTimeout(timer);
    }, [isVisible]);

    const totalReels = reels.length;

    return (
        <section
            ref={sectionRef}
            className={`reels-section w-full bg-black text-white ${isVisible ? "is-visible" : ""} ${isComplete ? "is-complete" : ""}`}
        >
            <div
                className="reels-divider-track mx-[calc(clamp(1.5rem,4.5vw,5.5rem)-clamp(0rem,1.65vw,2rem))] h-px overflow-hidden"
                aria-hidden="true"
            >
                <span className="reels-divider-line block h-full w-full" />
            </div>

            <div className="px-[clamp(1.5rem,4.5vw,5.5rem)] pt-[25px] sm:pt-10 xl:pt-[28px]">
                <div className="reels-reveal reels-reveal--meta flex items-center justify-between">
                    <span className="reels-sport-badge rounded-full px-[14px] py-[6px] font-bdo text-[9px] font-semibold leading-none tracking-[-0.02em] text-black sm:px-5 sm:py-2 sm:text-sm xl:px-[42px] xl:py-[17px] xl:text-[18px]">
                        <span className="reels-sport-badge__label">
                            Sport center
                        </span>
                    </span>
                    <span className="font-bdo text-[9px] font-semibold leading-none tracking-[-0.02em] sm:text-sm xl:text-[18px]">
                        <span className="font-light">{activeIndex + 1}/{totalReels}</span>{" "}
                        <span className="font-semibold">Detail</span>
                    </span>
                </div>

                <div className="mt-[34px] grid gap-[8px] xl:mt-[34px] xl:grid-cols-[minmax(0,1fr)_500px] xl:items-start">
                    <h2 className="reels-reveal reels-reveal--title font-bdo text-[20px] font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-[32px] xl:text-[52px]">
                        Reels UB Sport Center
                    </h2>
                    <p className="reels-reveal reels-reveal--copy max-w-[286px] text-balance font-bdo text-[9px] font-normal leading-[1.24] tracking-[-0.01em] text-white sm:max-w-[510px] sm:text-[14px] xl:ml-auto xl:max-w-[500px] xl:text-[19px] xl:leading-[1.22]">
                        Intip keseruan latihan, tips kebugaran, dan atmosfer
                        energi positif langsung melalui media sosial kami.
                    </p>
                </div>
            </div>

            {/* ── Carousel ── */}
            <div className="mt-[80px] flex items-start sm:mt-14 xl:mt-[49px]">
                {/* Desktop side label — ORIGINAL layout */}
                <div className="reels-reveal reels-reveal--community hidden w-[276px] shrink-0 pl-[clamp(1.5rem,4.5vw,5.5rem)] xl:block xl:pt-[5px]">
                    <p className="font-bdo text-[28px] font-semibold leading-[1.24] tracking-[-0.025em] text-white">
                        Sorotan<br />Komunitas
                    </p>
                </div>

                <div
                    className="min-w-0 flex-1 overflow-hidden pl-[clamp(1.5rem,4.5vw,5.5rem)] xl:pl-[32px]"
                    ref={emblaRef}
                >
                    <div className="flex items-end gap-3 pr-[clamp(1.5rem,4.5vw,5.5rem)] sm:gap-4 xl:gap-[14px]">
                        {reels.map((reel, index) => {
                            const { label, year } = relativeTime(reel.date);
                            const isActive = index === activeIndex;
                            return (
                                <div
                                    key={reel.id}
                                    className="relative flex-shrink-0"
                                >
                                    <ReelCard
                                        item={reel}
                                        featured={isActive}
                                        active={isActive}
                                        priority={isActive || index === activeIndex + 1}
                                        entranceIndex={index}
                                        dateLabel={label}
                                        dateYear={year}
                                        onActivate={() => handleActivate(index)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── Controls row ── */}
            <div className="px-[clamp(1.5rem,4.5vw,5.5rem)] pb-[46px] pt-[17px] sm:pb-16 sm:pt-[20px] xl:pb-[clamp(4rem,7vh,5.2rem)] xl:pt-[clamp(2.8rem,5vh,3.6rem)]">
                <div className="reels-reveal reels-reveal--controls grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-7 gap-y-6 xl:grid-cols-[auto_minmax(0,1fr)_410px] xl:gap-8">
                    <div className="flex items-center gap-2 sm:gap-3">
                        <ReelsNavButton direction="prev" onClick={scrollPrev} />
                        <ReelsNavButton direction="next" onClick={scrollNext} />
                    </div>
                    <p className="hidden justify-self-center font-bdo text-[clamp(1.05rem,1.25vw,1.5rem)] font-semibold leading-none tracking-[-0.025em] text-white xl:block">
                        Mari Bergabung Dengan Kami.
                    </p>
                    <div className="w-[182px] min-w-0 max-w-full justify-self-end xl:w-[410px]">
                        <ReelsCta />
                    </div>
                </div>
            </div>
        </section>
    );
}
