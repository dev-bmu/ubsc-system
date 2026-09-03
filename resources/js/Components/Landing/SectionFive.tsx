import { useEffect, useRef, useState } from "react";
import NewsSection from "@/Components/Landing/NewsSection";
import ReelsSection from "@/Components/Landing/ReelsSection";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import type { NewsItem } from "@/Components/Landing/NewsCard";
import type { ReelItem } from "@/Components/Landing/ReelCard";

const STATS = [
    {
        value: "99.9%",
        mobileValue: "99.9%",
        target: 99.9,
        mobileTarget: 99.9,
        decimals: 1,
        suffix: "%",
        mobileSuffix: "%",
        description:
            "Akurasi standar layanan kami yang selalu terjaga setiap saat.",
    },
    {
        value: "1K+",
        mobileValue: "1M+",
        target: 1000,
        mobileTarget: 1000000,
        decimals: 0,
        suffix: "K+",
        mobileSuffix: "M+",
        description: "Kunjungan pengguna yang telah berlatih bersama kami.",
    },
    {
        value: "3X",
        mobileValue: "3X",
        target: 3,
        mobileTarget: 3,
        decimals: 0,
        suffix: "X",
        mobileSuffix: "X",
        description: "Peningkatan fasilitas dan layanan jadi lebih optimal",
    },
    {
        value: "24/7",
        mobileValue: "24/7",
        target: 24,
        mobileTarget: 24,
        decimals: 0,
        suffix: "/7",
        mobileSuffix: "/7",
        description:
            "Akses informasi dan sistem booking online aktif setiap saat.",
    },
] as const;

type Stat = (typeof STATS)[number];

function formatCount(
    value: number,
    stat: Stat,
    isMobile: boolean,
    progress: number,
) {
    const target = isMobile ? stat.mobileTarget : stat.target;
    const suffix = isMobile ? stat.mobileSuffix : stat.suffix;

    if (suffix === "K+" || suffix === "M+") {
        if (value >= target * 0.995) return `1${suffix}`;

        const normalized = value / target;
        return `${normalized.toFixed(normalized < 0.1 ? 2 : 1)}${suffix}`;
    }

    // Small targets need fractional steps so the count still feels continuous.
    if (target <= 3 && progress < 1) {
        return `${value.toFixed(1)}${suffix}`;
    }

    return `${value.toFixed(stat.decimals)}${suffix}`;
}

function CountUpValue({
    stat,
    active,
    delay,
}: {
    stat: Stat;
    active: boolean;
    delay: number;
}) {
    const valueRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!active || !valueRef.current) return;

        const node = valueRef.current;
        const isMobile = !window.matchMedia("(min-width: 1280px)").matches;
        const target = isMobile ? stat.mobileTarget : stat.target;
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion) {
            node.textContent = isMobile ? stat.mobileValue : stat.value;
            return;
        }

        let animationFrame = 0;
        let delayTimer = 0;
        const duration = 2600;

        delayTimer = window.setTimeout(() => {
            const startedAt = performance.now();

            const tick = (now: number) => {
                const progress = Math.min((now - startedAt) / duration, 1);
                const eased =
                    progress < 0.5
                        ? 4 * progress * progress * progress
                        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                node.textContent = formatCount(
                    target * eased,
                    stat,
                    isMobile,
                    progress,
                );

                if (progress < 1) {
                    animationFrame = window.requestAnimationFrame(tick);
                } else {
                    node.textContent = isMobile
                        ? stat.mobileValue
                        : stat.value;
                }
            };

            animationFrame = window.requestAnimationFrame(tick);
        }, delay);

        return () => {
            window.clearTimeout(delayTimer);
            window.cancelAnimationFrame(animationFrame);
        };
    }, [active, delay, stat]);

    return (
        <span ref={valueRef} aria-label={stat.value}>
            0{stat.suffix}
        </span>
    );
}

function ReelArrow({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
            <path d="M12 32H52M52 32L34 14M52 32L34 50" stroke="currentColor" strokeWidth="4.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function ImpactLink() {
    const [hovered, setHovered] = useState(false);

    return (
        <a
            href="/booking"
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

            <span className="relative z-10 flex w-full items-center justify-between gap-4 font-bdo text-[12px] font-normal leading-none tracking-[-0.02em] sm:text-[14px] xl:text-[20px]">
                Mulai Reservasi Sekarang
                <ReelArrow className={`h-[14px] w-[14px] shrink-0 transition-transform duration-500 ease-out sm:h-[18px] sm:w-[18px] xl:h-[22px] xl:w-[22px] ${hovered ? "rotate-0" : "-rotate-45"}`} />
            </span>
        </a>
    );
}

function ImpactStats({ active }: { active: boolean }) {
    return (
        <div className="relative grid grid-cols-2 border-t border-white/15 before:pointer-events-none before:absolute before:bottom-[-23px] before:left-1/2 before:top-0 before:z-[1] before:w-px before:-translate-x-1/2 before:bg-white/15 xl:grid-cols-4 xl:border-t-0 xl:before:hidden">
            {STATS.map((stat, index) => (
                <article
                    key={stat.value}
                    className={`impact-stat impact-reveal impact-reveal--stat-${index + 1} min-w-0 border-white/15 px-0 py-[13px] odd:pr-[14px] even:pl-[16px] xl:px-0 xl:py-0 ${
                        index === 2 ? "xl:pl-[clamp(1rem,1.65vw,2rem)]" : ""
                    } ${index < STATS.length - 1 ? "xl:border-r" : ""}`}
                >
                    <p className="font-bdo text-[46px] font-normal leading-none tracking-[-0.055em] text-white sm:text-[54px] xl:-translate-y-[14px] xl:text-[clamp(5.5rem,6.4vw,7.7rem)]">
                        <CountUpValue
                            stat={stat}
                            active={active}
                            delay={480 + index * 105}
                        />
                    </p>
                    <p className="mt-[19px] max-w-[142px] font-bdo text-[8.5px] font-light leading-[1.42] tracking-[-0.018em] text-white/90 sm:max-w-[170px] sm:text-[10px] xl:mt-[clamp(2.3rem,4.6vh,3.1rem)] xl:max-w-[285px] xl:text-[clamp(0.82rem,1.02vw,1.18rem)] xl:leading-[1.42]">
                        {stat.description}
                    </p>
                </article>
            ))}
        </div>
    );
}

function ImpactHero() {
    const heroRef = useRef<HTMLDivElement>(null);
    const mediaRef = useRef<HTMLImageElement>(null);
    const [hasEnteredViewport, setHasEnteredViewport] = useState(false);
    const [isMediaReady, setIsMediaReady] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const entranceReady = useHomepageEntranceReady();

    useEffect(() => {
        if (!entranceReady) return;

        const hero = heroRef.current;
        if (!hero) return;

        if (!("IntersectionObserver" in window)) {
            setHasEnteredViewport(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setHasEnteredViewport(true);
                observer.disconnect();
            },
            {
                threshold: 0.08,
                rootMargin: "0px 0px -8% 0px",
            },
        );

        observer.observe(hero);
        return () => observer.disconnect();
    }, [entranceReady]);

    useEffect(() => {
        const image = mediaRef.current;
        if (!image) return;

        let cancelled = false;
        let resolving = false;

        const releaseImage = () => {
            if (!cancelled) setIsMediaReady(true);
        };

        const resolveImage = () => {
            if (resolving) return;
            resolving = true;

            if (typeof image.decode !== "function") {
                releaseImage();
                return;
            }

            void image.decode().catch(() => undefined).then(releaseImage);
        };

        const handleLoad = () => resolveImage();
        const handleError = () => releaseImage();

        image.addEventListener("load", handleLoad, { once: true });
        image.addEventListener("error", handleError, { once: true });

        if (image.complete) {
            if (image.naturalWidth > 0) {
                resolveImage();
            } else {
                handleError();
            }
        }

        return () => {
            cancelled = true;
            image.removeEventListener("load", handleLoad);
            image.removeEventListener("error", handleError);
        };
    }, []);

    useEffect(() => {
        if (!hasEnteredViewport || !isMediaReady || isVisible) return;

        let settleFrame = 0;
        const paintFrame = window.requestAnimationFrame(() => {
            settleFrame = window.requestAnimationFrame(() => {
                setIsVisible(true);
            });
        });

        return () => {
            window.cancelAnimationFrame(paintFrame);
            window.cancelAnimationFrame(settleFrame);
        };
    }, [hasEnteredViewport, isMediaReady, isVisible]);

    useEffect(() => {
        if (!isVisible) return;
        const timer = window.setTimeout(() => setIsComplete(true), 2400);
        return () => window.clearTimeout(timer);
    }, [isVisible]);

    return (
        <div
            ref={heroRef}
            className={`impact-hero relative isolate h-[689px] overflow-hidden bg-black text-white sm:h-[780px] xl:h-auto xl:min-h-[720px] xl:aspect-[1920/955] ${isVisible ? "is-visible" : ""} ${isComplete ? "is-complete" : ""}`}
        >
            <div className="impact-hero-media-track absolute inset-0 z-0">
                <img
                    ref={mediaRef}
                    src="/assets/images/ub-sport-statistic-data.avif"
                    alt=""
                    aria-hidden="true"
                    className="impact-hero-media absolute inset-0 h-full w-full object-cover object-[50%_center] sm:object-[45%_center] xl:object-center"
                    loading="lazy"
                    decoding="async"
                />
                <div
                    className="impact-hero-focus-matte pointer-events-none absolute inset-y-0 left-0 z-[1]"
                    aria-hidden="true"
                />
            </div>

            <div className="relative z-10 flex h-full flex-col px-[clamp(1.5rem,4.5vw,5.5rem)] pb-[25px] pt-[48px] sm:pt-12 xl:pb-[clamp(5.7rem,10.5vh,6.4rem)] xl:pt-[clamp(2rem,5.7vh,3.65rem)]">
                <div>
                    <SectionDivider
                        number="03"
                        title="Dampak"
                        subtitle="01 homepage"
                        theme="dark"
                        outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                        contentClassName="px-3"
                    />
                </div>

                <div className="mt-[31px] grid gap-0 xl:mt-[clamp(3.4rem,7.5vh,5.2rem)] xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,.82fr)] xl:gap-[clamp(3rem,6vw,7rem)]">
                    <h2
                        aria-label="Standar baru berolahraga hanya di UB Sport Center."
                        className="max-w-[325px] font-clash text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-white sm:max-w-[430px] md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-none xl:text-[clamp(3.30rem,3.83vw,3.80rem)] min-[1440px]:text-[clamp(3.94rem,4.54vw,4.35rem)] 2xl:text-[clamp(4.35rem,4.11vw,5.07rem)]"
                    >
                        <span aria-hidden className="block xl:hidden">
                            <span className="block overflow-visible">
                                <ScrollTextReveal delay={110} className="-mb-[0.14em] pb-[0.14em] pr-[0.08em]">
                                    Standar baru
                                </ScrollTextReveal>
                            </span>
                            <span className="block overflow-visible">
                                <ScrollTextReveal delay={205} className="-mb-[0.14em] pb-[0.14em] pr-[0.08em]">
                                    berolahraga hanya
                                </ScrollTextReveal>
                            </span>
                            <span className="flex overflow-visible">
                                <ScrollTextReveal delay={300} className="-mb-[0.14em] pb-[0.14em] pr-[0.16em]">
                                    di
                                </ScrollTextReveal>
                                <ScrollTextReveal delay={395} className="-mb-[0.14em] pb-[0.14em] pr-[0.08em] text-[#ff0000]">
                                    UB Sport Center.
                                </ScrollTextReveal>
                            </span>
                        </span>
                        <span aria-hidden className="hidden xl:block">
                            <span className="block overflow-visible">
                                <ScrollTextReveal delay={110} className="-mb-[0.14em] pb-[0.14em] pr-[0.08em]">
                                    Standar baru berolahraga
                                </ScrollTextReveal>
                            </span>
                            <span className="flex overflow-visible">
                                <ScrollTextReveal delay={205} className="-mb-[0.14em] pb-[0.14em] pr-[0.16em]">
                                    hanya di
                                </ScrollTextReveal>
                                <ScrollTextReveal delay={300} className="-mb-[0.14em] pb-[0.14em] pr-[0.08em] text-[#ff0000]">
                                    UB Sport Center.
                                </ScrollTextReveal>
                            </span>
                        </span>
                    </h2>

                    <div className="impact-reveal impact-reveal--copy mt-[20px] xl:mt-0 xl:pl-4 xl:pt-0">
                        <p className="max-w-[300px] font-bdo text-[11px] font-light leading-[1.45] text-white sm:max-w-[420px] sm:text-sm xl:max-w-[520px] xl:text-[clamp(1.125rem,1.39vw,1.68rem)] xl:leading-[1.28]">
                            Komitmen kami adalah menghadirkan
                            <br />{" "}
                            <strong className="font-medium">
                                ekosistem olahraga yang inklusif.
                            </strong>
                        </p>
                        <div className="mt-[22px] max-w-[300px] sm:max-w-[420px] xl:mt-[clamp(2rem,5.5vh,3.5rem)] xl:max-w-[520px]">
                            <ImpactLink />
                        </div>
                    </div>
                </div>

                <div className="mt-auto border-b border-white/15 pb-[23px] xl:border-b-0 xl:pb-0 xl:pt-8">
                    <ImpactStats active={isVisible} />
                </div>
            </div>
        </div>
    );
}

export default function SectionFive({
    news,
    reels,
}: {
    news?: NewsItem[];
    reels?: ReelItem[];
}) {
    return (
        <section
            id="impact"
            data-navbar-surface="dark"
            className="relative z-20 w-full overflow-hidden bg-black pt-0 text-white"
        >
            <ImpactHero />
            <ReelsSection reels={reels} />
            <NewsSection news={news} />
        </section>
    );
}
