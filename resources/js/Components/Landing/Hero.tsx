import GymTrafficBadge from "@/Components/Landing/GymTrafficBadge";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import HeroContent from "@/Components/Landing/HeroContent";
import HeroTitle from "@/Components/Landing/HeroTitle";
import {
    type AnimationEvent as ReactAnimationEvent,
    memo,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react";

import EntranceLoader from "@/Components/Landing/EntranceLoader";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";

const HERO_GLASS_SHARDS = [
    "0,0 0.16,0 0.20,0.25 0.17,0.5 0.23,0.75 0.19,1 0,1",
    "0.16,0 0.34,0 0.31,0.25 0.38,0.5 0.33,0.75 0.36,1 0.19,1 0.23,0.75 0.17,0.5 0.20,0.25",
    "0.34,0 0.51,0 0.55,0.25 0.47,0.5 0.54,0.75 0.50,1 0.36,1 0.33,0.75 0.38,0.5 0.31,0.25",
    "0.51,0 0.68,0 0.64,0.25 0.72,0.5 0.66,0.75 0.70,1 0.50,1 0.54,0.75 0.47,0.5 0.55,0.25",
    "0.68,0 0.84,0 0.88,0.25 0.81,0.5 0.86,0.75 0.83,1 0.70,1 0.66,0.75 0.72,0.5 0.64,0.25",
    "0.84,0 1,0 1,1 0.83,1 0.86,0.75 0.81,0.5 0.88,0.25",
] as const;

const StableGymTrafficBadge = memo(GymTrafficBadge);
const StableHeroContent = memo(HeroContent);
const StableHeroTitle = memo(HeroTitle);
const StableEntranceLoader = memo(EntranceLoader);
const StableHeroBottomBar = memo(HeroBottomBar);

const HeroOrbitLogo = memo(function HeroOrbitLogo({
    compact = false,
}: {
    compact?: boolean;
}) {
    const orbitRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const rateFrameRef = useRef<number | null>(null);
    const resumeTimerRef = useRef<number | null>(null);

    const clearResumeTimer = useCallback(() => {
        if (resumeTimerRef.current === null) return;

        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
    }, []);

    const rampSpinRate = useCallback((targetRate: number, duration: number) => {
        if (rateFrameRef.current !== null) {
            window.cancelAnimationFrame(rateFrameRef.current);
            rateFrameRef.current = null;
        }

        const image = imageRef.current;
        const spinAnimation = image
            ?.getAnimations()
            .find(
                (animation) =>
                    (animation as CSSAnimation).animationName ===
                    "ubsc-hero-orbit",
            );

        if (!spinAnimation || typeof spinAnimation.updatePlaybackRate !== "function") {
            orbitRef.current?.classList.toggle(
                "ubsc-hero-orbit--slow",
                targetRate < 0.99,
            );
            return;
        }

        orbitRef.current?.classList.remove("ubsc-hero-orbit--slow");

        const initialRate = spinAnimation.playbackRate || 1;
        const startedAt = window.performance.now();

        const updateRate = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / duration);
            const easedProgress = 1 - Math.pow(1 - progress, 3);

            spinAnimation.updatePlaybackRate(
                initialRate +
                    (targetRate - initialRate) * easedProgress,
            );

            if (progress < 1) {
                rateFrameRef.current =
                    window.requestAnimationFrame(updateRate);
            } else {
                rateFrameRef.current = null;
            }
        };

        rateFrameRef.current = window.requestAnimationFrame(updateRate);
    }, []);

    const slowTemporarily = useCallback(() => {
        clearResumeTimer();
        rampSpinRate(0.22, 320);
        resumeTimerRef.current = window.setTimeout(() => {
            rampSpinRate(1, 520);
            resumeTimerRef.current = null;
        }, 900);
    }, [clearResumeTimer, rampSpinRate]);

    useEffect(
        () => () => {
            clearResumeTimer();
            if (rateFrameRef.current !== null) {
                window.cancelAnimationFrame(rateFrameRef.current);
            }
        },
        [clearResumeTimer],
    );

    return (
        <div
            ref={orbitRef}
            className={`ubsc-hero-orbit flex cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white shadow-xl ${
                compact ? "mt-3 h-20 w-20" : "h-24 w-24"
            }`}
            role="button"
            tabIndex={0}
            aria-label="Perlambat rotasi logo Brawijaya Multi Usaha"
            onPointerEnter={(event) => {
                if (event.pointerType !== "mouse") return;

                clearResumeTimer();
                rampSpinRate(0.22, 320);
            }}
            onPointerLeave={(event) => {
                if (event.pointerType !== "mouse") return;

                clearResumeTimer();
                rampSpinRate(1, 520);
            }}
            onPointerDown={(event) => {
                if (event.pointerType === "mouse") return;
                slowTemporarily();
            }}
            onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;

                event.preventDefault();
                slowTemporarily();
            }}
        >
            <img
                ref={imageRef}
                src="/BMU.svg"
                alt="Brawijaya Multi Usaha"
                className="h-full w-full object-contain"
                draggable={false}
            />
        </div>
    );
});

const HeroGlassRegistration = memo(function HeroGlassRegistration({
    glassId,
    imageSource,
    onSequenceComplete,
}: {
    glassId: string;
    imageSource: string;
    onSequenceComplete: () => void;
}) {
    return (
        <svg
            className="ubsc-hero-glass-registration pointer-events-none absolute inset-0 z-[1] h-full w-full"
            width="100%"
            height="100%"
            aria-hidden="true"
            focusable="false"
            onAnimationEnd={(event) => {
                const target = event.target as SVGElement;

                if (
                    event.animationName === "ubsc-hero-glass-register" &&
                    target.classList.contains("ubsc-hero-glass-shard--6")
                ) {
                    onSequenceComplete();
                }
            }}
        >
            <defs>
                <image
                    id={`${glassId}-photo`}
                    href={imageSource}
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    preserveAspectRatio="xMidYMid slice"
                />
                {HERO_GLASS_SHARDS.map((points, index) => (
                    <clipPath
                        key={points}
                        id={`${glassId}-clip-${index}`}
                        clipPathUnits="objectBoundingBox"
                    >
                        <polygon points={points} />
                    </clipPath>
                ))}
            </defs>

            {HERO_GLASS_SHARDS.map((points, index) => (
                <g
                    key={points}
                    className={`ubsc-hero-glass-shard ubsc-hero-glass-shard--${index + 1}`}
                >
                    <use
                        href={`#${glassId}-photo`}
                        width="100%"
                        height="100%"
                        clipPath={`url(#${glassId}-clip-${index})`}
                    />
                </g>
            ))}
        </svg>
    );
});

export default function Hero({
    heroImageSource,
    onEntranceReady,
}: {
    heroImageSource: string;
    onEntranceReady?: () => void;
}) {
    const heroSectionRef = useRef<HTMLElement>(null);
    const heroImageRef = useRef<HTMLImageElement>(null);
    const glassId = useId().replace(/:/g, "");
    const heroDecodeGenerationRef = useRef(0);
    const heroDecodePendingSourceRef = useRef<string | null>(null);
    const heroDecodedSourceRef = useRef<string | null>(null);
    const contentRevealCommittedRef = useRef(false);
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [resolvedHeroImageSource, setResolvedHeroImageSource] = useState("");
    const [isContentReady, setIsContentReady] = useState(false);
    const [isGlassRegistrationActive, setIsGlassRegistrationActive] =
        useState(false);
    const [shouldRenderGlass, setShouldRenderGlass] = useState(true);
    const [isSettled, setIsSettled] = useState(false);
    const entranceReady = useHomepageEntranceReady();
    const isApertureReady = entranceReady;
    const isReady = isContentReady;
    const handleIntroComplete = useCallback(() => {
        if (contentRevealCommittedRef.current) return;
        contentRevealCommittedRef.current = true;
        setIsContentReady(true);
    }, []);
    const handleRegistrationReveal = useCallback(() => {
        setShouldRenderGlass(true);
        setIsGlassRegistrationActive(true);
    }, []);
    const completeGlassRegistration = useCallback(() => {
        setIsGlassRegistrationActive(false);
        setShouldRenderGlass(false);
    }, []);
    const handlePhotoAnimationEnd = useCallback(
        (event: ReactAnimationEvent<HTMLImageElement>) => {
            if (event.animationName !== "ubsc-hero-photographic-develop") {
                return;
            }

            heroSectionRef.current?.setAttribute("data-photo-settled", "");
        },
        [],
    );
    const handleSweepAnimationEnd = useCallback(
        (event: ReactAnimationEvent<HTMLDivElement>) => {
            if (event.animationName !== "ubsc-hero-sweep-laser") {
                return;
            }

            heroSectionRef.current?.setAttribute("data-sweep-settled", "");
        },
        [],
    );
    const handleHeroImageLoad = useCallback(() => {
        const image = heroImageRef.current;
        const source = image?.currentSrc || image?.src || "";

        if (!image || !source) return;

        if (heroDecodedSourceRef.current === source) {
            setResolvedHeroImageSource(source);
            setIsImageLoaded(true);
            return;
        }

        if (heroDecodePendingSourceRef.current === source) return;

        heroDecodePendingSourceRef.current = source;
        const generation = heroDecodeGenerationRef.current + 1;
        heroDecodeGenerationRef.current = generation;

        const commitReady = () => {
            if (
                heroDecodeGenerationRef.current !== generation ||
                (image.currentSrc || image.src || "") !== source
            ) {
                return;
            }

            heroDecodePendingSourceRef.current = null;
            heroDecodedSourceRef.current = source;
            setResolvedHeroImageSource(source);
            setIsImageLoaded(true);
        };

        if (typeof image.decode !== "function") {
            commitReady();
            return;
        }

        void image
            .decode()
            .then(commitReady)
            .catch(() => {
                if (image.complete && image.naturalWidth > 0) {
                    commitReady();
                } else if (heroDecodePendingSourceRef.current === source) {
                    heroDecodePendingSourceRef.current = null;
                }
            });
    }, []);

    const heroClassName = useMemo(
        () =>
            [
                "ubsc-hero relative flex min-h-[100svh] flex-col overflow-hidden bg-[#040812]",
                isImageLoaded ? "ubsc-hero-media-ready" : "",
                isApertureReady ? "ubsc-hero-aperture-ready" : "",
                isGlassRegistrationActive ? "ubsc-hero-glass-live" : "",
                isReady ? "ubsc-hero-ready" : "",
                isSettled ? "ubsc-hero-settled" : "ubsc-hero-prep",
            ]
                .filter(Boolean)
                .join(" "),
        [
            isApertureReady,
            isGlassRegistrationActive,
            isImageLoaded,
            isReady,
            isSettled,
        ],
    );

    useEffect(() => {
        const image = heroImageRef.current;
        if (!image?.complete) return;

        if (image.naturalWidth > 0) {
            handleHeroImageLoad();
        } else {
            // A cached error can complete before hydration attaches onError.
            setIsImageLoaded(true);
        }
    }, [handleHeroImageLoad]);

    useEffect(() => {
        const section = heroSectionRef.current;
        if (!section) return;

        let isNearViewport = true;
        let isPaused = false;
        const setRuntimePaused = (shouldPause: boolean) => {
            if (isPaused === shouldPause) return;

            isPaused = shouldPause;
            section.toggleAttribute("data-runtime-paused", shouldPause);
        };
        const syncRuntimeState = () =>
            setRuntimePaused(
                document.visibilityState !== "visible" || !isNearViewport,
            );
        const handlePageHide = () => setRuntimePaused(true);
        const handlePageShow = () => syncRuntimeState();
        const observer =
            "IntersectionObserver" in window
                ? new IntersectionObserver(
                      ([entry]) => {
                          isNearViewport = Boolean(entry?.isIntersecting);
                          syncRuntimeState();
                      },
                      {
                          root: null,
                          rootMargin: "180px 0px",
                          threshold: 0,
                      },
                  )
                : null;

        observer?.observe(section);
        document.addEventListener("visibilitychange", syncRuntimeState);
        window.addEventListener("pagehide", handlePageHide);
        window.addEventListener("pageshow", handlePageShow);
        syncRuntimeState();

        return () => {
            observer?.disconnect();
            section.removeAttribute("data-runtime-paused");
            document.removeEventListener(
                "visibilitychange",
                syncRuntimeState,
            );
            window.removeEventListener("pagehide", handlePageHide);
            window.removeEventListener("pageshow", handlePageShow);
        };
    }, []);

    useEffect(() => {
        if (!isReady) return;

        const timer = window.setTimeout(() => setIsSettled(true), 1900);
        return () => window.clearTimeout(timer);
    }, [isReady]);

    useEffect(() => {
        if (!isGlassRegistrationActive) return;

        const timer = window.setTimeout(completeGlassRegistration, 620);
        return () => window.clearTimeout(timer);
    }, [completeGlassRegistration, isGlassRegistrationActive]);

    return (
        <>
            <StableEntranceLoader
                ready={isImageLoaded}
                onEntranceReady={onEntranceReady}
                onRegistrationReveal={handleRegistrationReveal}
                onContentReveal={handleIntroComplete}
                onComplete={handleIntroComplete}
            />
            <section
                ref={heroSectionRef}
                id="home"
                data-navbar-surface="dark"
                className={heroClassName}
            >
                <img
                    ref={heroImageRef}
                    src={heroImageSource}
                    alt=""
                    aria-hidden="true"
                    width={4048}
                    height={2232}
                    className="ubsc-hero-bg pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover object-center"
                    onLoad={handleHeroImageLoad}
                    onError={() => setIsImageLoaded(true)}
                    onAnimationEnd={handlePhotoAnimationEnd}
                    draggable={false}
                    loading="eager"
                    decoding="async"
                    {...{ fetchpriority: "high" }}
                />

                {shouldRenderGlass && resolvedHeroImageSource && (
                    <HeroGlassRegistration
                        glassId={glassId}
                        imageSource={resolvedHeroImageSource}
                        onSequenceComplete={completeGlassRegistration}
                    />
                )}

                <div className="ubsc-hero-veil absolute inset-0 z-[2]" />
                <div className="ubsc-hero-depth absolute inset-0 z-[3]" />
                <div
                    className="ubsc-hero-sweep absolute inset-0 z-[4]"
                    onAnimationEnd={handleSweepAnimationEnd}
                />
                <div className="ubsc-hero-frame pointer-events-none absolute inset-0 z-[5]">
                    <span className="ubsc-hero-frame-line ubsc-hero-frame-line--v left-[24%]" />
                    <span className="ubsc-hero-frame-line ubsc-hero-frame-line--v right-[17%]" />
                    <span className="ubsc-hero-frame-line ubsc-hero-frame-line--h bottom-[25%]" />
                </div>

                <div className="relative z-10 hidden min-h-[100svh] max-h-[100svh] flex-col items-stretch overflow-y-auto xl:flex">
                    <div className="flex min-h-0 flex-1 items-end justify-between px-6 pb-12 pt-12 xl:px-16 xl:pb-32 xl:pt-32">
                        <div className="ubsc-hero-reveal ubsc-hero-reveal--traffic">
                            <StableGymTrafficBadge />
                        </div>
                        <div className="ubsc-hero-reveal ubsc-hero-reveal--copy">
                            <StableHeroContent />
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-col justify-end px-16">
                        <div className="ubsc-hero-reveal ubsc-hero-reveal--title">
                            <StableHeroTitle />
                        </div>
                    </div>

                    <div className="ubsc-hero-reveal ubsc-hero-reveal--orbit absolute bottom-6 right-16">
                        <HeroOrbitLogo />
                    </div>
                </div>

                <div className="relative z-10 flex min-h-[100svh] flex-col px-8 pt-28 xl:hidden">
                    <div className="ubsc-hero-reveal ubsc-hero-reveal--traffic flex-shrink-0">
                        <StableGymTrafficBadge />
                    </div>

                    <div className="ubsc-hero-reveal ubsc-hero-reveal--copy mt-8 flex-shrink-0">
                        <StableHeroContent />
                    </div>

                    <div className="flex flex-1 flex-col justify-end pb-5">
                        <div className="ubsc-hero-reveal ubsc-hero-reveal--orbit mb-6">
                            <HeroOrbitLogo compact />
                        </div>

                        <div className="ubsc-hero-reveal ubsc-hero-reveal--title">
                            <StableHeroTitle />
                        </div>
                    </div>
                </div>
            </section>

            <div
                className={`ubsc-hero-bottom-shell ${
                    isReady ? "ubsc-hero-bottom-shell--ready" : ""
                }`}
            >
                <StableHeroBottomBar
                    showVideo
                    sectionNumber="01/"
                    sectionLabel="homepage"
                    lineInset
                    sectionInset
                    mobileCopySmaller
                    mobileCopyLockRight
                />
            </div>
        </>
    );
}
