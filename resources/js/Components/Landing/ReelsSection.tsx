import {
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    animate,
    motion,
    useDragControls,
    useMotionValue,
    useMotionValueEvent,
    useReducedMotion,
    useTransform,
    type MotionValue,
    type PanInfo,
} from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ReelCard from "@/Components/Landing/ReelCard";
import type { ReelItem } from "@/Components/Landing/ReelCard";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";

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

function ReelsNavButton({ direction, onClick, disabled }: { direction: "prev" | "next"; onClick: () => void; disabled: boolean }) {
    const isNext = direction === "next";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={isNext ? "Next reels" : "Previous reels"}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-35 sm:h-10 sm:w-10 xl:h-12 xl:w-12 ${
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
    const navigationTimerRef = useRef<number>(0);
    const navigatingRef = useRef(false);
    const destination = "https://www.instagram.com/ubsportcenter/?hl=en";

    useEffect(() => {
        return () => window.clearTimeout(navigationTimerRef.current);
    }, []);

    return (
        <a
            href={destination}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block min-w-0 overflow-hidden border-b border-white/75 pb-[7px] pt-1 text-white"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(event) => {
                const touchNavigation = window.matchMedia("(hover: none), (pointer: coarse)").matches;
                if (!touchNavigation) return;

                event.preventDefault();
                if (navigatingRef.current) return;

                navigatingRef.current = true;
                setHovered(true);
                navigationTimerRef.current = window.setTimeout(() => {
                    window.location.assign(destination);
                }, 440);
            }}
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

interface ReelMetrics {
    step: number;
    inactiveWidth: number;
    inactiveHeight: number;
    widthDelta: number;
    heightDelta: number;
}

interface ReelMetricMotionValues {
    step: MotionValue<number>;
    inactiveWidth: MotionValue<number>;
    inactiveHeight: MotionValue<number>;
    widthDelta: MotionValue<number>;
    heightDelta: MotionValue<number>;
}

const REEL_SPRING = {
    type: "spring" as const,
    stiffness: 360,
    damping: 38,
    mass: 0.85,
    restDelta: 0.25,
    restSpeed: 0.25,
};

function currentReelMetrics(): ReelMetrics {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches) {
        return {
            step: 342,
            inactiveWidth: 328,
            inactiveHeight: 551,
            widthDelta: 32,
            heightDelta: 53,
        };
    }
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches) {
        return {
            step: 296,
            inactiveWidth: 280,
            inactiveHeight: 486,
            widthDelta: 65,
            heightDelta: 112,
        };
    }
    return {
        step: 148.16,
        inactiveWidth: 140,
        inactiveHeight: 238,
        widthDelta: 66.25,
        heightDelta: 115.75,
    };
}

function reelWeight(trackPosition: number, index: number, step: number): number {
    return Math.max(
        0,
        Math.min(1, 1 - (Math.abs((index * step) + trackPosition) / step)),
    );
}

function FluidReelSlide({
    index,
    trackX,
    metricValues,
    repeated,
    active,
    children,
}: {
    index: number;
    trackX: MotionValue<number>;
    metricValues: ReelMetricMotionValues;
    repeated?: boolean;
    active?: boolean;
    children: ReactNode;
}) {
    const weight = useTransform(
        [trackX, metricValues.step],
        ([latest, step]) => reelWeight(Number(latest), index, Number(step)),
    );
    const width = useTransform(
        [weight, metricValues.inactiveWidth, metricValues.widthDelta],
        ([latest, inactiveWidth, widthDelta]) =>
            Number(inactiveWidth) + (Number(widthDelta) * Number(latest)),
    );
    const height = useTransform(
        [weight, metricValues.inactiveHeight, metricValues.heightDelta],
        ([latest, inactiveHeight, heightDelta]) =>
            Number(inactiveHeight) + (Number(heightDelta) * Number(latest)),
    );
    const siblingOffset = useTransform(
        [trackX, metricValues.step, metricValues.widthDelta],
        ([latest, step, widthDelta]) => {
            let priorExpansion = 0;
            for (let priorIndex = 0; priorIndex < index; priorIndex += 1) {
                priorExpansion += reelWeight(
                    Number(latest),
                    priorIndex,
                    Number(step),
                );
            }
            return priorExpansion * Number(widthDelta);
        },
    );

    return (
        <motion.div
            className="relative flex h-[353.75px] w-[140px] flex-shrink-0 items-end sm:h-[598px] sm:w-[280px] xl:h-[604px] xl:w-[328px]"
            style={{ x: siblingOffset }}
        >
            <motion.div
                className="relative flex-shrink-0"
                style={{ width, height }}
            >
                {children}
                {repeated && (
                    <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-0 z-[45] rounded-[5px] bg-[linear-gradient(145deg,rgba(3,8,13,0.16)_0%,rgba(0,0,0,0.58)_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.035)] transition-opacity duration-500 ease-out xl:rounded-[10px] ${
                            active ? "opacity-0" : "opacity-70"
                        }`}
                    />
                )}
            </motion.div>
        </motion.div>
    );
}

export default function ReelsSection({ reels: suppliedReels = DUMMY_REELS }: ReelsSectionProps) {
    const reels = suppliedReels.length > 0 ? suppliedReels : DUMMY_REELS;
    const sectionRef               = useRef<HTMLElement>(null);
    const [isVisible, setIsVisible]   = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeTrackIndex, setActiveTrackIndex] = useState(reels.length);
    const [settledIndex, setSettledIndex] = useState<number | null>(reels.length);
    const [playRequest, setPlayRequest] = useState<{ id: number; index: number } | null>(null);
    const [metrics, setMetrics] = useState<ReelMetrics>({
        step: 148.16,
        inactiveWidth: 140,
        inactiveHeight: 238,
        widthDelta: 66.25,
        heightDelta: 115.75,
    });
    const activeIndexRef = useRef(0);
    const activeTrackIndexRef = useRef(reels.length);
    const targetIndexRef = useRef(reels.length);
    const playRequestIdRef = useRef(0);
    const pendingPlayRef = useRef<{ id: number; index: number } | null>(null);
    const motionSequenceRef = useRef(0);
    const gestureDrivenRef = useRef(false);
    const trackAnimationRef = useRef<{ stop: () => void } | null>(null);
    const suppressTrackClickRef = useRef(false);
    const trackClickResetTimerRef = useRef<number>(0);
    const wheelDeltaRef = useRef(0);
    const wheelResetTimerRef = useRef<number>(0);
    const trackX = useMotionValue(-reels.length * 148.16);
    const metricStep = useMotionValue(148.16);
    const metricInactiveWidth = useMotionValue(140);
    const metricInactiveHeight = useMotionValue(238);
    const metricWidthDelta = useMotionValue(66.25);
    const metricHeightDelta = useMotionValue(115.75);
    const dragControls = useDragControls();
    const reduceMotion = useReducedMotion();
    const entranceReady = useHomepageEntranceReady();
    const totalReels = reels.length;
    const renderedReels = totalReels > 0
        ? Array.from({ length: 3 }, (_, cycle) =>
            reels.map((reel, reelIndex) => ({ reel, reelIndex, cycle })),
        ).flat()
        : [];
    const maxTrackIndex = Math.max(0, renderedReels.length - 1);
    const metricValues: ReelMetricMotionValues = {
        step: metricStep,
        inactiveWidth: metricInactiveWidth,
        inactiveHeight: metricInactiveHeight,
        widthDelta: metricWidthDelta,
        heightDelta: metricHeightDelta,
    };

    const semanticIndex = useCallback((index: number) => {
        if (totalReels === 0) return 0;
        return ((index % totalReels) + totalReels) % totalReels;
    }, [totalReels]);

    const centerTrackIndex = useCallback((index: number) => {
        if (totalReels === 0) return 0;
        return totalReels + semanticIndex(index);
    }, [semanticIndex, totalReels]);

    const setSemanticIndex = useCallback((index: number) => {
        if (totalReels === 0) return;
        const nextIndex = semanticIndex(index);
        if (activeIndexRef.current === nextIndex) return;
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
    }, [semanticIndex, totalReels]);

    const animateTrackTo = useCallback((
        index: number,
        sequence: number,
        onComplete?: () => void,
    ) => {
        const destination = -index * metrics.step;
        trackAnimationRef.current?.stop();

        const complete = () => {
            if (sequence !== motionSequenceRef.current) return;
            trackX.set(destination);
            onComplete?.();
        };

        if (reduceMotion) {
            trackX.set(destination);
            complete();
            return;
        }

        trackAnimationRef.current = animate(trackX, destination, {
            ...REEL_SPRING,
            onComplete: complete,
        });
    }, [metrics.step, reduceMotion, trackX]);

    const selectReel = useCallback((index: number, shouldPlay = false) => {
        if (totalReels === 0) return;
        const nextIndex = Math.max(0, Math.min(maxTrackIndex, index));
        const sequence = ++motionSequenceRef.current;
        const pendingPlay = shouldPlay
            ? { index: nextIndex, id: ++playRequestIdRef.current }
            : null;

        gestureDrivenRef.current = false;
        setSettledIndex(null);
        pendingPlayRef.current = pendingPlay;
        targetIndexRef.current = nextIndex;
        setPlayRequest(null);

        animateTrackTo(nextIndex, sequence, () => {
            const normalizedIndex = centerTrackIndex(nextIndex);
            if (normalizedIndex !== nextIndex) {
                trackX.set(-normalizedIndex * metrics.step);
            }
            targetIndexRef.current = normalizedIndex;
            activeTrackIndexRef.current = normalizedIndex;
            setActiveTrackIndex(normalizedIndex);
            setSemanticIndex(normalizedIndex);
            setSettledIndex(normalizedIndex);
            if (
                pendingPlay &&
                pendingPlayRef.current === pendingPlay &&
                activeIndexRef.current === semanticIndex(normalizedIndex)
            ) {
                pendingPlayRef.current = null;
                setPlayRequest({ ...pendingPlay, index: normalizedIndex });
            }
        });
    }, [animateTrackTo, centerTrackIndex, maxTrackIndex, metrics.step, semanticIndex, setSemanticIndex, totalReels, trackX]);

    const moveReel = useCallback((direction: number) => {
        const nextIndex = Math.max(
            0,
            Math.min(maxTrackIndex, targetIndexRef.current + direction),
        );
        if (nextIndex === targetIndexRef.current) return;
        selectReel(nextIndex);
    }, [maxTrackIndex, selectReel]);

    const handleDragStart = useCallback(() => {
        motionSequenceRef.current += 1;
        trackAnimationRef.current?.stop();
        gestureDrivenRef.current = true;
        suppressTrackClickRef.current = false;
        setSettledIndex(null);
        pendingPlayRef.current = null;
        targetIndexRef.current = activeTrackIndexRef.current;
        setPlayRequest(null);
    }, []);

    const handleDragEnd = useCallback((
        _event: MouseEvent | TouchEvent | PointerEvent,
        info: PanInfo,
    ) => {
        if (totalReels === 0) {
            gestureDrivenRef.current = false;
            return;
        }
        // Preserve the flick's direction without allowing an unusually fast
        // pointer sample to jump past an additional card.
        const velocityProjection = Math.max(
            -metrics.step * 0.28,
            Math.min(metrics.step * 0.28, info.velocity.x * 0.055),
        );
        const projectedX = trackX.get() + velocityProjection;
        const nextIndex = Math.max(
            0,
            Math.min(maxTrackIndex, Math.round(-projectedX / metrics.step)),
        );
        const sequence = ++motionSequenceRef.current;
        window.clearTimeout(trackClickResetTimerRef.current);
        trackClickResetTimerRef.current = window.setTimeout(() => {
            suppressTrackClickRef.current = false;
        }, 0);
        animateTrackTo(nextIndex, sequence, () => {
            const normalizedIndex = centerTrackIndex(nextIndex);
            if (normalizedIndex !== nextIndex) {
                trackX.set(-normalizedIndex * metrics.step);
            }
            targetIndexRef.current = normalizedIndex;
            activeTrackIndexRef.current = normalizedIndex;
            setActiveTrackIndex(normalizedIndex);
            setSemanticIndex(normalizedIndex);
            gestureDrivenRef.current = false;
            setSettledIndex(normalizedIndex);
        });
    }, [animateTrackTo, centerTrackIndex, maxTrackIndex, metrics.step, setSemanticIndex, totalReels, trackX]);

    const handleDrag = useCallback((
        _event: MouseEvent | TouchEvent | PointerEvent,
        info: PanInfo,
    ) => {
        if (Math.abs(info.offset.x) > 8) suppressTrackClickRef.current = true;
    }, []);

    useMotionValueEvent(trackX, "change", (latest) => {
        if (totalReels === 0) return;
        const nearestIndex = Math.max(
            0,
            Math.min(maxTrackIndex, Math.round(-latest / metrics.step)),
        );
        activeTrackIndexRef.current = nearestIndex;
        setActiveTrackIndex(nearestIndex);
        setSemanticIndex(nearestIndex);
        if (gestureDrivenRef.current) targetIndexRef.current = nearestIndex;
    });

    useEffect(() => {
        let resizeFrame = 0;
        const syncMetrics = () => {
            cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
                const nextMetrics = currentReelMetrics();
                setMetrics((current) =>
                    current.step === nextMetrics.step ? current : nextMetrics,
                );
            });
        };

        window.addEventListener("resize", syncMetrics, { passive: true });
        syncMetrics();
        return () => {
            cancelAnimationFrame(resizeFrame);
            window.removeEventListener("resize", syncMetrics);
        };
    }, []);

    useEffect(() => {
        metricStep.set(metrics.step);
        metricInactiveWidth.set(metrics.inactiveWidth);
        metricInactiveHeight.set(metrics.inactiveHeight);
        metricWidthDelta.set(metrics.widthDelta);
        metricHeightDelta.set(metrics.heightDelta);
    }, [
        metricHeightDelta,
        metricInactiveHeight,
        metricInactiveWidth,
        metricStep,
        metricWidthDelta,
        metrics,
    ]);

    useEffect(() => {
        const nextIndex = centerTrackIndex(activeIndexRef.current);
        motionSequenceRef.current += 1;
        trackAnimationRef.current?.stop();
        gestureDrivenRef.current = false;
        pendingPlayRef.current = null;
        activeIndexRef.current = semanticIndex(nextIndex);
        activeTrackIndexRef.current = nextIndex;
        targetIndexRef.current = nextIndex;
        setActiveIndex(semanticIndex(nextIndex));
        setActiveTrackIndex(nextIndex);
        setSettledIndex(nextIndex);
        setPlayRequest(null);
        trackX.set(-nextIndex * metrics.step);
    }, [centerTrackIndex, metrics.step, semanticIndex, trackX]);

    useEffect(() => {
        return () => {
            trackAnimationRef.current?.stop();
            window.clearTimeout(trackClickResetTimerRef.current);
            window.clearTimeout(wheelResetTimerRef.current);
        };
    }, []);

    /* Section entrance */
    useEffect(() => {
        if (!entranceReady) return;

        const section = sectionRef.current;
        if (!section) return;
        if (!("IntersectionObserver" in window)) { setIsVisible(true); return; }
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry?.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
            { threshold: 0.04, rootMargin: "0px 0px -8% 0px" },
        );
        observer.observe(section);
        return () => observer.disconnect();
    }, [entranceReady]);

    useEffect(() => {
        if (!isVisible) return;
        const timer = window.setTimeout(() => setIsComplete(true), 2300);
        return () => window.clearTimeout(timer);
    }, [isVisible]);

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
                    <span className="reels-sport-badge rounded-full px-[14px] py-[7.5px] font-bdo text-[9px] font-semibold leading-none tracking-[-0.02em] text-black sm:px-5 sm:py-2 sm:text-sm xl:px-[36px] xl:py-[14px] xl:text-[15px]">
                        <span className="reels-sport-badge__label">
                            Konten Kami
                        </span>
                    </span>
                    <span className="font-bdo text-[9px] font-semibold leading-none tracking-[-0.02em] sm:text-sm xl:text-[18px]">
                        <span className="font-light">{totalReels ? activeIndex + 1 : 0}/{totalReels}</span>{" "}
                        <span className="font-semibold">Detail</span>
                    </span>
                </div>

                <div className="mt-[22px] grid gap-[8px] sm:mt-[34px] xl:grid-cols-[minmax(0,1fr)_500px] xl:items-start">
                    <h2 className="reels-reveal reels-reveal--title font-bdo text-[25.3px] font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-[32px] xl:text-[44px]">
                        Reels <span className="text-[#ff0000]">UB Sport Center</span>
                    </h2>
                    <p className="reels-reveal reels-reveal--copy w-fit max-w-none justify-self-start text-left font-bdo text-[11.25px] font-light leading-[1.24] tracking-[-0.01em] text-white/75 sm:text-[14px] xl:ml-auto xl:justify-self-end xl:text-[19px] xl:leading-[1.22]">
                        <span className="block whitespace-nowrap font-light">
                            Intip keseruan latihan, tips kebugaran, dan atmosfer
                        </span>
                        <strong className="block whitespace-nowrap font-medium text-white">
                            energi positif langsung melalui media sosial kami.
                        </strong>
                    </p>
                </div>
            </div>

            {/* ── Carousel ── */}
            <div className="mt-[80px] flex items-start sm:mt-14 xl:mt-[49px]">
                {/* Desktop side label — ORIGINAL layout */}
                <div className="reels-reveal reels-reveal--community hidden w-[276px] shrink-0 pl-[clamp(1.5rem,4.5vw,5.5rem)] xl:block xl:pt-[5px]">
                    <p className="font-bdo text-[27px] font-semibold leading-[1.24] tracking-[-0.025em] text-white">
                        Sorotan<br />Komunitas
                    </p>
                </div>

                <div
                    className="min-w-0 flex-1 pl-[clamp(1.5rem,4.5vw,5.5rem)] xl:pl-[32px]"
                    onClickCapture={(event) => {
                        if (!suppressTrackClickRef.current) return;
                        suppressTrackClickRef.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    onPointerDown={(event) => {
                        const target = event.target;
                        if (
                            target instanceof Element &&
                            target.closest("[data-reel-control]")
                        ) {
                            return;
                        }
                        dragControls.start(event, { snapToCursor: false });
                    }}
                    onWheel={(event) => {
                        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
                        window.clearTimeout(wheelResetTimerRef.current);
                        wheelDeltaRef.current += event.deltaX;
                        if (Math.abs(wheelDeltaRef.current) < 40) {
                            wheelResetTimerRef.current = window.setTimeout(() => {
                                wheelDeltaRef.current = 0;
                            }, 140);
                            return;
                        }
                        moveReel(wheelDeltaRef.current > 0 ? 1 : -1);
                        wheelDeltaRef.current = 0;
                    }}
                >
                    <div className="overflow-hidden">
                        <motion.div
                            className="flex items-end gap-[8.16px] pr-[clamp(1.5rem,4.5vw,5.5rem)] sm:gap-4 xl:gap-[14px]"
                            style={{ x: trackX, touchAction: "pan-y" }}
                            drag="x"
                            dragControls={dragControls}
                            dragListener={false}
                            dragConstraints={{
                                left: -maxTrackIndex * metrics.step,
                                right: 0,
                            }}
                            dragElastic={reduceMotion ? 0 : 0.08}
                            dragMomentum={false}
                            onDragStart={handleDragStart}
                            onDrag={handleDrag}
                            onDragEnd={handleDragEnd}
                        >
                            {renderedReels.map(({ reel, reelIndex, cycle }, index) => {
                                const { label, year } = relativeTime(reel.date);
                                const isActive = index === activeTrackIndex;
                                return (
                                    <FluidReelSlide
                                        key={`${cycle}-${reel.id}`}
                                        index={index}
                                        trackX={trackX}
                                        metricValues={metricValues}
                                        repeated={cycle === 2}
                                        active={isActive}
                                    >
                                        <ReelCard
                                            item={reel}
                                            featured={isActive}
                                            active={isActive}
                                            priority={false}
                                            entranceIndex={reelIndex}
                                            dateLabel={label}
                                            dateYear={year}
                                            fluidSize
                                            interactionReady={settledIndex === index}
                                            playRequest={playRequest?.index === index ? playRequest.id : 0}
                                            onActivate={() => selectReel(index, true)}
                                            onMove={moveReel}
                                        />
                                    </FluidReelSlide>
                                );
                            })}
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* ── Controls row ── */}
            <div className="px-[clamp(1.5rem,4.5vw,5.5rem)] pb-[46px] pt-[17px] sm:pb-16 sm:pt-[20px] xl:pb-[clamp(4rem,7vh,5.2rem)] xl:pt-[clamp(2.8rem,5vh,3.6rem)]">
                <div className="reels-reveal reels-reveal--controls relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-7 gap-y-6 xl:grid-cols-[auto_minmax(0,1fr)_328px] xl:gap-8">
                    <div className="flex items-center gap-[6.8px] sm:gap-[10.2px]">
                        <ReelsNavButton direction="prev" onClick={() => moveReel(-1)} disabled={totalReels <= 1} />
                        <ReelsNavButton direction="next" onClick={() => moveReel(1)} disabled={totalReels <= 1} />
                    </div>
                    <p className="absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap font-bdo text-[clamp(1.05rem,1.25vw,1.5rem)] font-medium leading-none tracking-[-0.025em] text-white xl:block">
                        Mari Bergabung Dengan Kami.
                    </p>
                    <div className="w-[182px] min-w-0 max-w-full justify-self-end xl:col-start-3 xl:ml-auto xl:w-[328px]">
                        <ReelsCta />
                    </div>
                </div>
            </div>
        </section>
    );
}
