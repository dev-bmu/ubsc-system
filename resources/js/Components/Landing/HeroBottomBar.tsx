import { useEffect, useRef, useState } from "react";

interface HeroBottomBarProps {
    sectionNumber?: string;
    sectionLabel?: string;
    description?: string;
    targetId?: string;
    showVideo?: boolean;
    /** 'solid' = opaque bg (default); 'transparent' = no bg, only the top border line */
    variant?: "solid" | "transparent";
    insetLine?: boolean;
    compact?: boolean;
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
        return firstSpace === -1 ? "" : withoutPrefix.slice(firstSpace + 1).trimStart();
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
    compact = false,
}: HeroBottomBarProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [rotated, setRotated] = useState(false);
    const [hasEntered, setHasEntered] = useState(false);
    const [hasUserScrolled, setHasUserScrolled] = useState(false);
    const cleanDescription = getCleanDescription(description);
    const isHomepageDescription =
        cleanDescription ===
        "Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama.";

    useEffect(() => {
        const onScroll = () => {
            if (window.scrollY <= 8) return;
            setHasUserScrolled(true);
            window.removeEventListener("scroll", onScroll);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    useEffect(() => {
        const node = rootRef.current;
        if (!node || hasEntered || !hasUserScrolled) return;

        if (!("IntersectionObserver" in window)) {
            setHasEntered(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setHasEntered(true);
                observer.disconnect();
            },
            { threshold: 0.35, rootMargin: "0px 0px -8% 0px" },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [hasEntered, hasUserScrolled]);

    const scrollToTarget = () => {
        const el = document.getElementById(targetId);
        if (el) {
            el.scrollIntoView({ behavior: "smooth" });
        }
    };

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
            <span className="hero-bottom-scroll-label flex h-8 items-center justify-center whitespace-nowrap rounded-full border border-white/70 px-4 font-bdo text-[12px] font-light leading-none text-white transition-colors duration-300 group-hover:border-white group-hover:bg-white group-hover:text-[rgba(2,5,11,0.52)] md:h-10 md:px-6 md:text-[15px] lg:text-[16px] max-[380px]:px-3 max-[380px]:text-[11px]">
                Scroll down
            </span>
            <span className="-ml-px flex h-8 w-8 items-center justify-center rounded-full border border-white/70 text-white transition-colors duration-300 group-hover:border-white group-hover:bg-white group-hover:text-[rgba(2,5,11,0.52)] md:h-10 md:w-10">
                <span
                    className={`flex h-[18px] w-[18px] items-center justify-center transition-transform duration-500 ease-out md:h-5 md:w-5 ${
                        rotated ? "rotate-[88deg]" : "rotate-[45deg]"
                    }`}
                >
                    <HeroCtaArrow className="h-full w-full" />
                </span>
            </span>
        </button>
    );

    return (
        <div
            ref={rootRef}
            className={`hero-bottom-bar hero-bottom-bar--${variant} ${
                hasEntered ? "is-visible" : ""
            } relative w-full overflow-hidden ${
                variant === "solid" && !showVideo ? "bg-[#02050B]" : ""
            }`}
        >
            {variant === "solid" && showVideo && (
                <video
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                    src="/assets/reels/Hero.mp4"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="none"
                />
            )}

            <div
                className={`absolute top-0 border-t border-white/35 ${
                    insetLine
                        ? "left-[clamp(2.75rem,3.25vw,4rem)] right-[clamp(2.75rem,3.25vw,4rem)]"
                        : "left-0 right-0"
                }`}
            />

            <div
                className={`relative z-10 hidden grid-cols-[minmax(152px,0.72fr)_minmax(360px,1fr)_minmax(220px,0.72fr)] items-center gap-6 xl:grid ${
                    compact ? "min-h-[72px] py-3" : "min-h-[100px] py-6"
                } ${
                    insetLine
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
                    {isHomepageDescription ? (
                        <>
                            <span className="block whitespace-nowrap">
                                <span className="font-medium">UB Sport Center</span>
                                <span> - </span>
                                Temukan fasilitas olahraga modern
                            </span>
                            <span className="block whitespace-nowrap">
                                untuk berlatih, berprestasi, dan berkembang bersama.
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

            <div className="relative z-10 hidden min-h-[96px] grid-cols-[minmax(132px,0.55fr)_minmax(0,1fr)_auto] items-center gap-5 px-[clamp(1.5rem,4.6vw,3.5rem)] py-5 md:grid xl:hidden">
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
                    <span className="font-medium">UB Sport Center</span>
                    <span> - </span>
                    {cleanDescription}
                </p>

                <div className="hero-bottom-item hero-bottom-item--button flex justify-end">
                    {renderScrollButton()}
                </div>
            </div>

            <div className="relative z-10 px-[clamp(1rem,5vw,1.35rem)] py-4 md:hidden">
                <div className="hero-bottom-mobile mx-auto grid w-full max-w-[440px] grid-cols-[minmax(0,0.84fr)_minmax(0,1.16fr)] items-center gap-x-4 gap-y-3 max-[380px]:max-w-[330px] max-[380px]:grid-cols-1">
                    <div className="hero-bottom-item hero-bottom-item--meta flex flex-col items-start gap-3 max-[380px]:w-full max-[380px]:flex-row max-[380px]:items-center max-[380px]:justify-between">
                        <div className="flex items-center gap-1.5">
                            <span className="font-bdo text-[13px] font-light leading-none text-white max-[380px]:text-[12px]">
                                {sectionNumber}
                            </span>
                            <span className="font-bdo text-[13px] font-medium leading-none text-white max-[380px]:text-[12px]">
                                {sectionLabel}
                            </span>
                        </div>
                        {renderScrollButton()}
                    </div>

                    <p className="hero-bottom-item hero-bottom-item--copy font-bdo text-[12px] font-light leading-[1.34] text-white max-[380px]:max-w-[285px] max-[380px]:text-[11.5px] max-[380px]:leading-[1.32]">
                        <span className="font-medium">
                            UB Sport Center
                        </span>
                        <span> - </span>
                        {cleanDescription}
                    </p>
                </div>
            </div>
        </div>
    );
}
