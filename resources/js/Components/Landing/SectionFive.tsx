import { useEffect, useRef, useState } from "react";
import NewsSection from "@/Components/Landing/NewsSection";
import ReelsSection from "@/Components/Landing/ReelsSection";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
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

function ImpactLink() {
    const [hovered, setHovered] = useState(false);

    return (
        <a
            href="/coming-soon"
            className="group relative block cursor-pointer select-none overflow-hidden border-b border-white/35 py-1"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <span
                aria-hidden
                className="pointer-events-none absolute bg-accent-red"
                style={{
                    top: "-50%",
                    left: "-5%",
                    right: "-5%",
                    bottom: "-50%",
                    transform: hovered
                        ? "skewY(-5deg) translateY(0%)"
                        : "skewY(-5deg) translateY(130%)",
                    transition:
                        "transform 0.55s cubic-bezier(0.76, 0, 0.24, 1)",
                    zIndex: 0,
                }}
            />

            <span className="pointer-events-none relative z-10 flex w-full items-center justify-between gap-4">
                <span className="font-bdo text-[13px] font-medium leading-tight text-white sm:text-[15px] xl:text-[clamp(1.25rem,1.55vw,1.875rem)]">
                    Mulai Reservasi Sekarang
                </span>
                <svg
                    width="24"
                    height="24"
                    viewBox="0 0 72 72"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="shrink-0 xl:h-[30px] xl:w-[30px]"
                >
                    <path
                        d="M24 36H53"
                        stroke="white"
                        strokeWidth="3.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M42 22L56 36L42 50"
                        stroke="white"
                        strokeWidth="3.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M29 32.8C32.6 34.9 36 35.8 40 36"
                        stroke="white"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity="0.48"
                    />
                </svg>
            </span>
        </a>
    );
}

function ImpactStats({ active }: { active: boolean }) {
    return (
        <div className="grid grid-cols-2 border-t border-white/15 xl:grid-cols-4 xl:border-t-0">
            {STATS.map((stat, index) => (
                <article
                    key={stat.value}
                    className={`impact-stat impact-reveal impact-reveal--stat-${index + 1} min-w-0 -translate-y-[6px] border-white/15 px-0 py-[13px] odd:border-r odd:pr-[14px] even:pl-[16px] xl:translate-y-0 xl:border-r-0 xl:px-0 xl:py-0`}
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
    const [isVisible, setIsVisible] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        const hero = heroRef.current;
        if (!hero) return;

        if (!("IntersectionObserver" in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsVisible(true);
                observer.disconnect();
            },
            {
                threshold: 0.08,
                rootMargin: "0px 0px -8% 0px",
            },
        );

        observer.observe(hero);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isVisible) return;
        const timer = window.setTimeout(() => setIsComplete(true), 2100);
        return () => window.clearTimeout(timer);
    }, [isVisible]);

    return (
        <div
            ref={heroRef}
            className={`impact-hero relative isolate h-[689px] overflow-hidden bg-black text-white sm:h-[780px] xl:h-auto xl:min-h-[720px] xl:aspect-[1920/955] ${isVisible ? "is-visible" : ""} ${isComplete ? "is-complete" : ""}`}
        >
            <img
                src="/assets/images/ub-sport-statistic-data.png"
                alt=""
                aria-hidden="true"
                className="impact-hero-media absolute inset-0 h-full w-full object-cover object-[50%_center] sm:object-[45%_center] xl:object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,8,12,.24)_0%,rgba(0,8,12,.04)_48%,rgba(0,8,12,.08)_100%)] xl:bg-[linear-gradient(90deg,rgba(0,8,12,.14)_0%,rgba(0,8,12,.02)_48%,rgba(0,8,12,.05)_100%)]" />
            <div
                className="impact-cinematic-sweep pointer-events-none absolute inset-0 z-[1]"
                aria-hidden="true"
            />

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
                        className="max-w-[325px] font-clash text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-white sm:max-w-[430px] md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-none xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
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
                        <p className="max-w-[300px] font-bdo text-[11px] font-light leading-[1.45] text-white sm:max-w-[420px] sm:text-sm xl:max-w-[520px] xl:text-[clamp(1.25rem,1.55vw,1.875rem)] xl:leading-[1.28]">
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
            className="relative z-20 w-full overflow-hidden bg-black pt-0 text-white"
        >
            <ImpactHero />
            <ReelsSection reels={reels} />
            <NewsSection news={news} />
        </section>
    );
}
