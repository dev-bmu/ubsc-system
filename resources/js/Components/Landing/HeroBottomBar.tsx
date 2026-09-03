import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import {
    type CSSProperties,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from "react";

interface HeroBottomBarProps {
    sectionNumber?: string;
    sectionLabel?: string;
    description?: string;
    targetId?: string;
    showVideo?: boolean;
    /** 'solid' = opaque bg (default); 'transparent' = no bg, only the top border line */
    variant?: "solid" | "transparent";
    insetLine?: boolean;
    lineInset?: boolean;
    hideLine?: boolean;
    compact?: boolean;
    mobileWide?: boolean;
    mobileCopySmaller?: boolean;
    mobileCopyLockRight?: boolean;
    mobileVideoOnly?: boolean;
    sectionInset?: boolean;
    cinematicCopyReveal?: boolean;
}

function getCleanDescription(description: string) {
    const prefix = "UB Sport Center";
    const trimmed = description.trim();

    if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        return trimmed;
    }

    const withoutPrefix = trimmed.slice(prefix.length).trimStart();
    const firstCode = withoutPrefix.charCodeAt(0);

    if (firstCode === 45 || firstCode === 0x2013 || firstCode === 0x2014) {
        return withoutPrefix.slice(1).trimStart();
    }

    if (firstCode === 0x00e2 || firstCode === 0x00c3) {
        const firstSpace = withoutPrefix.indexOf(" ");
        return firstSpace === -1
            ? ""
            : withoutPrefix.slice(firstSpace + 1).trimStart();
    }

    return withoutPrefix;
}

function HeroCtaArrow({ className = "" }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 72 72"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-hidden="true"
        >
            <path
                d="M24 36H53"
                stroke="currentColor"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M42 22L56 36L42 50"
                stroke="currentColor"
                strokeWidth="3.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M29 32.8C32.6 34.9 36 35.8 40 36"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.48"
            />
        </svg>
    );
}

export default function HeroBottomBar({
    sectionNumber = "01/",
    sectionLabel = "homepage",
    description = "Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama.",
    targetId = "about",
    showVideo = true,
    variant = "solid",
    insetLine = false,
    lineInset = false,
    hideLine = false,
    compact = false,
    mobileWide = false,
    mobileCopySmaller = false,
    mobileCopyLockRight = false,
    mobileVideoOnly = false,
    sectionInset = false,
    cinematicCopyReveal = false,
}: HeroBottomBarProps) {
    const [rotated, setRotated] = useState(false);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const entranceReady = useHomepageEntranceReady();
    const cleanDescription = getCleanDescription(description);
    const isHomepageDescription =
        cleanDescription ===
        "Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama.";
    const topLineInsetClass = mobileWide
        ? "left-[0.95rem] right-[0.95rem] md:left-[clamp(2.75rem,3.25vw,4rem)] md:right-[clamp(2.75rem,3.25vw,4rem)]"
        : sectionInset
          ? "left-[clamp(1.5rem,2.7vw,5.5rem)] right-[clamp(1.5rem,2.7vw,5.5rem)]"
          : lineInset
            ? "left-[0.95rem] right-[0.95rem] md:left-[clamp(1.5rem,4.6vw,3.5rem)] md:right-[clamp(1.5rem,4.6vw,3.5rem)] xl:left-[clamp(2rem,4.2vw,4.25rem)] xl:right-[clamp(2rem,4.2vw,4.25rem)]"
            : insetLine
              ? "left-[clamp(2.75rem,3.25vw,4rem)] right-[clamp(2.75rem,3.25vw,4rem)]"
              : "left-0 right-0";

    useEffect(() => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        const mobileQuery = window.matchMedia("(max-width: 47.999rem)");
        let isNearViewport = true;
        let isDisposed = false;
        let frameReadyCommitted = false;

        const markReady = () => {
            if (
                !frameReadyCommitted &&
                video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
                frameReadyCommitted = true;
                setIsVideoReady(true);
            }
        };
        const markWaitingForFrame = () => {
            if (
                frameReadyCommitted &&
                video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
            ) {
                frameReadyCommitted = false;
                setIsVideoReady(false);
            }
        };
        const showPosterFallback = () => {
            frameReadyCommitted = false;
            setIsVideoReady(false);
        };
        const canUseVideo = () => !mobileVideoOnly || mobileQuery.matches;
        const syncPlayback = () => {
            if (isDisposed) return;

            const shouldPlay =
                canUseVideo() &&
                isNearViewport &&
                document.visibilityState === "visible";

            if (!shouldPlay) {
                if (!video.paused) {
                    video.pause();
                }
                return;
            }

            if (video.networkState === HTMLMediaElement.NETWORK_EMPTY) {
                video.load();
            }

            if (video.paused || video.ended) {
                const playback = video.play();
                playback?.catch(() => {
                    // Muted autoplay remains browser-controlled; the decoded
                    // frame is retained and playback is retried on the next
                    // visibility or intersection transition.
                });
            }
        };
        const handlePageHide = () => {
            if (!video.paused) {
                video.pause();
            }
        };
        const handlePageShow = () => syncPlayback();
        const observer =
            "IntersectionObserver" in window
                ? new IntersectionObserver(
                      ([entry]) => {
                          isNearViewport = Boolean(entry?.isIntersecting);
                          syncPlayback();
                      },
                      {
                          root: null,
                          rootMargin: "220px 0px",
                          threshold: 0,
                      },
                  )
                : null;
        const viewportHeight = Math.max(
            document.documentElement.clientHeight,
            window.innerHeight || 0,
        );
        const initialRect = container.getBoundingClientRect();
        isNearViewport =
            initialRect.bottom >= -220 &&
            initialRect.top <= viewportHeight + 220;

        markReady();
        video.addEventListener("loadstart", markWaitingForFrame);
        video.addEventListener("emptied", markWaitingForFrame);
        video.addEventListener("loadeddata", markReady);
        video.addEventListener("canplay", markReady);
        video.addEventListener("error", showPosterFallback);
        video.addEventListener("stalled", markWaitingForFrame);
        document.addEventListener("visibilitychange", syncPlayback);
        window.addEventListener("pagehide", handlePageHide);
        window.addEventListener("pageshow", handlePageShow);
        if (typeof mobileQuery.addEventListener === "function") {
            mobileQuery.addEventListener("change", syncPlayback);
        } else {
            mobileQuery.addListener(syncPlayback);
        }
        observer?.observe(container);
        syncPlayback();

        return () => {
            isDisposed = true;
            observer?.disconnect();
            if (!video.paused) {
                video.pause();
            }
            video.removeEventListener("loadstart", markWaitingForFrame);
            video.removeEventListener("emptied", markWaitingForFrame);
            video.removeEventListener("loadeddata", markReady);
            video.removeEventListener("canplay", markReady);
            video.removeEventListener("error", showPosterFallback);
            video.removeEventListener("stalled", markWaitingForFrame);
            document.removeEventListener("visibilitychange", syncPlayback);
            window.removeEventListener("pagehide", handlePageHide);
            window.removeEventListener("pageshow", handlePageShow);
            if (typeof mobileQuery.removeEventListener === "function") {
                mobileQuery.removeEventListener("change", syncPlayback);
            } else {
                mobileQuery.removeListener(syncPlayback);
            }
        };
    }, [showVideo, variant, mobileVideoOnly]);

    const scrollToTarget = () => {
        const el = document.getElementById(targetId);
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
        }
    };

    const renderCinematicCopyLines = (lines: ReactNode[]) => (
        <span className="hero-bottom-copy-lines block">
            {lines.map((line, index) => (
                <span
                    key={index}
                    className="hero-bottom-copy-line-mask block overflow-hidden"
                >
                    <span
                        className="hero-bottom-copy-line block whitespace-nowrap"
                        style={
                            {
                                "--hero-bottom-copy-delay": `${630 + index * 92}ms`,
                            } as CSSProperties
                        }
                    >
                        {line}
                    </span>
                </span>
            ))}
        </span>
    );

    const renderScrollButton = () => (
        <button
            type="button"
            aria-label="Scroll to next section"
            onClick={() => {
                setRotated(true);
                scrollToTarget();
            }}
            onMouseEnter={() => setRotated(true)}
            onMouseLeave={() => setRotated(false)}
            className="hero-bottom-scroll group flex shrink-0 items-center"
        >
            <span
                className={`hero-bottom-scroll-label flex items-center justify-center whitespace-nowrap rounded-full border border-white/70 font-bdo font-light leading-none text-white transition-colors duration-300 group-hover:border-white group-hover:bg-white group-hover:text-[rgba(2,5,11,0.52)] ${
                    mobileWide
                        ? "h-[1.55rem] px-[0.92rem] text-[0.58rem] md:h-10 md:px-6 md:text-[15px] lg:text-[16px]"
                        : "h-8 px-4 text-[12px] md:h-10 md:px-6 md:text-[15px] lg:text-[16px] max-[380px]:px-3 max-[380px]:text-[11px]"
                }`}
            >
                Scroll down
            </span>
            <span
                className={`-ml-px flex items-center justify-center rounded-full border border-white/70 text-white transition-colors duration-300 group-hover:border-white group-hover:bg-white group-hover:text-[rgba(2,5,11,0.52)] ${
                    mobileWide
                        ? "h-[1.55rem] w-[1.55rem] md:h-10 md:w-10"
                        : "h-8 w-8 md:h-10 md:w-10"
                }`}
            >
                <span
                    className={`flex items-center justify-center transition-transform duration-500 ease-out md:h-5 md:w-5 ${
                        mobileWide
                            ? "h-[0.78rem] w-[0.78rem]"
                            : "h-[18px] w-[18px]"
                    } ${rotated ? "rotate-[88deg]" : "rotate-[45deg]"}`}
                >
                    <HeroCtaArrow className="h-full w-full" />
                </span>
            </span>
        </button>
    );

    return (
        <div
            ref={containerRef}
            className={`hero-bottom-bar hero-bottom-bar--${variant} ${
                entranceReady ? "is-visible" : ""
            } relative w-full overflow-hidden ${
                variant === "solid" ? "bg-[#02050B]" : ""
            }`}
        >
            {showVideo && (variant === "solid" || mobileVideoOnly) && (
                <>
                    <img
                        src="/assets/hero/Bottom-poster.jpg"
                        alt=""
                        aria-hidden="true"
                        loading="eager"
                        decoding="async"
                        className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
                            mobileVideoOnly ? "md:hidden" : ""
                        }`}
                    />
                    <video
                        ref={videoRef}
                        data-video-ready={isVideoReady ? "true" : "false"}
                        className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
                            isVideoReady ? "opacity-100" : "opacity-0"
                        } ${mobileVideoOnly ? "md:hidden" : ""}`}
                        poster="/assets/hero/Bottom-poster.jpg"
                        loop
                        muted
                        playsInline
                        preload="auto"
                    >
                        <source
                            src="/assets/reels/hero-h264.mp4"
                            type='video/mp4; codecs="avc1.640028"'
                            media={
                                mobileVideoOnly
                                    ? "(max-width: 47.999rem)"
                                    : undefined
                            }
                        />
                        <source
                            src="/assets/reels/hero.mp4"
                            type='video/mp4; codecs="av01.0.05M.08"'
                            media={
                                mobileVideoOnly
                                    ? "(max-width: 47.999rem)"
                                    : undefined
                            }
                        />
                    </video>
                </>
            )}

            {!hideLine && (
                <div
                    className={`hero-bottom-line absolute top-0 border-t border-white/35 ${topLineInsetClass}`}
                />
            )}

            <div
                className={`relative z-10 hidden grid-cols-[minmax(152px,0.72fr)_minmax(360px,1fr)_minmax(220px,0.72fr)] items-center gap-6 xl:grid ${
                    compact ? "min-h-[72px] py-3" : "min-h-[100px] py-6"
                } ${
                    sectionInset
                        ? "px-[clamp(1.5rem,2.7vw,5.5rem)]"
                        : insetLine
                          ? "px-[clamp(2.75rem,3.25vw,4rem)]"
                          : "px-[clamp(2rem,4.2vw,4.25rem)]"
                }`}
            >
                <div className="hero-bottom-item hero-bottom-item--meta flex items-center gap-2">
                    <span className="font-bdo text-[16px] font-light leading-none text-white">
                        {sectionNumber}
                    </span>
                    <span className="font-bdo text-[16px] font-medium leading-none text-white">
                        {sectionLabel}
                    </span>
                </div>

                <p
                    className={`hero-bottom-item hero-bottom-item--copy mx-auto max-w-[560px] font-bdo text-[16px] font-light leading-[1.32] text-white ${
                        insetLine ? "text-center" : "text-left"
                    }`}
                >
                    {cinematicCopyReveal ? (
                        renderCinematicCopyLines([
                            <>
                                <span className="font-medium">
                                    UB Sport Center
                                </span>
                                <span> - </span>
                                Temukan fasilitas olahraga modern
                            </>,
                            <>
                                untuk berlatih, berprestasi, dan berkembang
                                bersama.
                            </>,
                        ])
                    ) : isHomepageDescription ? (
                        <>
                            <span className="block whitespace-nowrap">
                                <span className="font-medium">
                                    UB Sport Center
                                </span>
                                <span> - </span>
                                Temukan fasilitas olahraga modern
                            </span>
                            <span className="block whitespace-nowrap">
                                untuk berlatih, berprestasi, dan berkembang
                                bersama.
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="font-medium">UB Sport Center</span>
                            <span> - </span>
                            {cleanDescription}
                        </>
                    )}
                </p>

                <div className="hero-bottom-item hero-bottom-item--button flex justify-end">
                    {renderScrollButton()}
                </div>
            </div>

            <div
                className={`relative z-10 hidden min-h-[96px] grid-cols-[minmax(132px,0.55fr)_minmax(0,1fr)_auto] items-center gap-5 py-5 md:grid xl:hidden ${
                    sectionInset
                        ? "px-[clamp(1.5rem,2.7vw,5.5rem)]"
                        : "px-[clamp(1.5rem,4.6vw,3.5rem)]"
                }`}
            >
                <div className="hero-bottom-item hero-bottom-item--meta flex items-center gap-2">
                    <span className="font-bdo text-[15px] font-light leading-none text-white">
                        {sectionNumber}
                    </span>
                    <span className="font-bdo text-[15px] font-medium leading-none text-white">
                        {sectionLabel}
                    </span>
                </div>

                <p
                    className={`hero-bottom-item hero-bottom-item--copy max-w-[440px] font-bdo text-[15px] font-light leading-[1.32] text-white ${
                        insetLine ? "mx-auto text-center" : "text-left"
                    }`}
                >
                    {cinematicCopyReveal ? (
                        renderCinematicCopyLines([
                            <>
                                <span className="font-medium">
                                    UB Sport Center
                                </span>
                                <span> - </span>
                                Temukan fasilitas olahraga modern
                            </>,
                            <>
                                untuk berlatih, berprestasi, dan berkembang
                                bersama.
                            </>,
                        ])
                    ) : (
                        <>
                            <span className="font-medium">UB Sport Center</span>
                            <span> - </span>
                            {cleanDescription}
                        </>
                    )}
                </p>

                <div className="hero-bottom-item hero-bottom-item--button flex justify-end">
                    {renderScrollButton()}
                </div>
            </div>

            <div
                className={`relative z-10 md:hidden ${
                    sectionInset
                        ? "px-[clamp(1.5rem,2.7vw,5.5rem)] py-4"
                        : mobileWide
                          ? "px-[0.95rem] py-[0.92rem]"
                          : "px-[clamp(1rem,5vw,1.35rem)] py-4"
                }`}
            >
                <div
                    className={`hero-bottom-mobile mx-auto grid w-full items-center ${
                        mobileWide
                            ? "max-w-none grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] gap-x-3 gap-y-2"
                            : "max-w-[440px] grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] gap-x-4 gap-y-3 max-[380px]:max-w-[330px] max-[380px]:grid-cols-1"
                    }`}
                >
                    <div className="hero-bottom-item hero-bottom-item--meta flex flex-col items-start gap-3 max-[380px]:w-full max-[380px]:flex-row max-[380px]:items-center max-[380px]:justify-between">
                        <div className="flex items-center gap-1.5">
                            <span
                                className={`font-bdo font-light leading-none text-white ${
                                    mobileWide
                                        ? "text-[0.58rem]"
                                        : "text-[13px] max-[380px]:text-[12px]"
                                }`}
                            >
                                {sectionNumber}
                            </span>
                            <span
                                className={`font-bdo font-medium leading-none text-white ${
                                    mobileWide
                                        ? "text-[0.58rem]"
                                        : "text-[13px] max-[380px]:text-[12px]"
                                }`}
                            >
                                {sectionLabel}
                            </span>
                        </div>
                        {renderScrollButton()}
                    </div>

                    <p
                        className={`hero-bottom-item hero-bottom-item--copy font-bdo font-light text-white ${
                            mobileCopyLockRight
                                ? "justify-self-end w-[12.125rem] max-w-[56vw] max-[380px]:w-auto max-[380px]:max-w-[285px]"
                                : ""
                        } ${
                            mobileWide
                                ? mobileCopySmaller
                                    ? "text-[0.523rem] leading-[1.22]"
                                    : "text-[0.58rem] leading-[1.22]"
                                : mobileCopySmaller
                                  ? "text-[10.83px] leading-[1.52] max-[380px]:max-w-[285px] max-[380px]:text-[10.36px] max-[380px]:leading-[1.46]"
                                  : "text-[12px] leading-[1.34] max-[380px]:max-w-[285px] max-[380px]:text-[11.5px] max-[380px]:leading-[1.32]"
                        }`}
                    >
                        {cinematicCopyReveal ? (
                            renderCinematicCopyLines([
                                <>
                                    <span className="font-medium">
                                        UB Sport Center
                                    </span>
                                    <span> - </span>
                                    Temukan fasilitas
                                </>,
                                <>olahraga modern untuk berlatih,</>,
                                <>berprestasi, dan berkembang bersama.</>,
                            ])
                        ) : mobileWide && isHomepageDescription ? (
                            <>
                                <span className="block whitespace-nowrap">
                                    <span className="font-medium">
                                        UB Sport Center
                                    </span>
                                    <span> - </span>
                                    Temukan fasilitas
                                </span>
                                <span className="block whitespace-nowrap">
                                    olahraga modern untuk berlatih,
                                </span>
                                <span className="block whitespace-nowrap">
                                    berprestasi, dan berkembang bersama.
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="font-medium">
                                    UB Sport Center
                                </span>
                                <span> - </span>
                                {cleanDescription}
                            </>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
}
