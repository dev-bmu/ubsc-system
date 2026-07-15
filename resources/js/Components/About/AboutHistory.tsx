import { useEffect, useRef, useState, type CSSProperties } from "react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import CurvedLoop from "@/Components/Landing/CurvedLoop";
import HeroCurtainEdge from "@/Components/Landing/HeroCurtainEdge";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import person from "@/../assets/images/person.avif";
import bg from "@/../assets/images/bg-about.avif";

const STATS = [
    { value: 81.5, decimals: 1, suffix: "%", label: "Tingkat Kepuasan" },
    { value: 122, decimals: 0, suffix: "+", label: "Karyawan" },
    { value: 17, decimals: 0, suffix: "+", label: "Fasilitas" },
    { value: 231, decimals: 0, suffix: "", label: "Membership" },
] as const;

type Stat = (typeof STATS)[number];

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
        const finalValue = `${stat.value.toFixed(stat.decimals)}${stat.suffix}`;
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion) {
            node.textContent = finalValue;
            return;
        }

        let animationFrame = 0;
        const delayTimer = window.setTimeout(() => {
            const startedAt = performance.now();
            const duration = 2600;

            const tick = (now: number) => {
                const progress = Math.min((now - startedAt) / duration, 1);
                const eased =
                    progress < 0.5
                        ? 4 * progress * progress * progress
                        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
                const current = stat.value * eased;

                node.textContent = `${current.toFixed(stat.decimals)}${stat.suffix}`;

                if (progress < 1) {
                    animationFrame = window.requestAnimationFrame(tick);
                } else {
                    node.textContent = finalValue;
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
        <span ref={valueRef} aria-label={`${stat.value}${stat.suffix}`}>
            0{stat.suffix}
        </span>
    );
}

function StatItem({
    stat,
    active,
    index,
}: {
    stat: Stat;
    active: boolean;
    index: number;
}) {
    return (
        <article
            className="about-history-stat relative min-w-0"
            style={
                {
                    "--about-history-line-delay": `${590 + index * 90}ms`,
                    "--about-history-content-delay": `${560 + index * 105}ms`,
                    "--about-history-mobile-line-delay": `${680 + index * 90}ms`,
                } as CSSProperties
            }
        >
            <div className="about-history-stat-content">
                <span className="about-history-stat-value font-bdo font-normal leading-none text-black">
                    <CountUpValue
                        stat={stat}
                        active={active}
                        delay={620 + index * 120}
                    />
                </span>
                <span className="about-history-stat-label font-bdo font-light normal-case tracking-normal text-black/40">
                    {stat.label}
                </span>
            </div>
        </article>
    );
}

function useResponsiveCurve(mobile: number, desktop: number): number {
    const [curve, setCurve] = useState<number>(() =>
        typeof window !== "undefined" && window.innerWidth < 1280
            ? mobile
            : desktop,
    );

    useEffect(() => {
        const update = () =>
            setCurve(window.innerWidth < 1280 ? mobile : desktop);

        window.addEventListener("resize", update, { passive: true });

        return () => window.removeEventListener("resize", update);
    }, [mobile, desktop]);

    return curve;
}

function useInViewOnce<T extends HTMLElement>(
    rootMargin: string,
    threshold = 0.08,
) {
    const elementRef = useRef<T>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        if (
            !("IntersectionObserver" in window) ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsVisible(true);
                observer.disconnect();
            },
            { rootMargin, threshold },
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [rootMargin, threshold]);

    return [elementRef, isVisible] as const;
}

export default function AboutHistory() {
    const [introRef, isIntroVisible] = useInViewOnce<HTMLDivElement>(
        "0px 0px -14% 0px",
        0.06,
    );
    const [statsRef, isStatsVisible] = useInViewOnce<HTMLDivElement>(
        "0px 0px -10% 0px",
        0.08,
    );
    const [mediaRef, isMediaVisible] = useInViewOnce<HTMLDivElement>(
        "0px 0px -34% 0px",
        0.18,
    );
    const [isComplete, setIsComplete] = useState(false);
    const curveAmount = useResponsiveCurve(128, 124);
    const loopFontSize = useResponsiveCurve(112, 58);
    const loopSpeed = useResponsiveCurve(2.65, 1.5);

    useEffect(() => {
        if (!isIntroVisible || !isStatsVisible || !isMediaVisible || isComplete)
            return;

        const timeout = window.setTimeout(() => setIsComplete(true), 2800);
        return () => window.clearTimeout(timeout);
    }, [isComplete, isIntroVisible, isMediaVisible, isStatsVisible]);

    return (
        <section
            className={`about-history-stage section-two-curtain relative z-[18] w-full overflow-x-clip bg-transparent ${
                isIntroVisible ? "is-intro-visible" : ""
            } ${isStatsVisible ? "is-stats-visible" : ""} ${
                isMediaVisible ? "is-media-visible" : ""
            } ${isComplete ? "is-complete" : ""}`}
            id="about-history"
        >
            <HeroCurtainEdge postFlowSelector=".about-post-history-flow" />

            <div className="section-two-curtain-content relative z-10 bg-white">
                <div
                    ref={introRef}
                    className="about-history-shell mx-auto w-full"
                >
                    <div className="about-history-divider">
                        <SectionDivider
                            number="01"
                            title="Sejarah"
                            subtitle="02 aboutpage"
                            theme="light"
                            outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                            contentClassName="px-3"
                        />
                    </div>

                    <div className="about-history-member-label">
                        <span className="section-label-diamond" />
                        <ScrollTextReveal
                            delay={80}
                            className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] xl:text-[1.25rem]"
                        >
                            Gabung Member Sekarang
                        </ScrollTextReveal>
                    </div>

                    <div className="about-history-intro">
                        <ScrollTextReveal
                            as="h2"
                            split="words"
                            delay={90}
                            stagger={34}
                            amount={0.16}
                            className="about-history-heading font-bdo font-semibold text-black"
                        >
                            Sejarah dan Perkembangan
                        </ScrollTextReveal>
                        <ScrollTextReveal
                            as="p"
                            split="words"
                            delay={120}
                            stagger={10}
                            amount={0.12}
                            className="about-history-copy font-bdo font-normal text-black/70"
                        >
                            UB Sport Center merupakan pusat olahraga milik
                            Universitas Brawijaya yang dikelola oleh PT Brawijaya
                            Multi Usaha, dengan tujuan menyediakan fasilitas
                            olahraga yang representatif bagi sivitas akademika
                            dan masyarakat umum.
                        </ScrollTextReveal>
                        <ScrollTextReveal
                            as="p"
                            split="words"
                            delay={180}
                            stagger={10}
                            amount={0.12}
                            className="about-history-copy font-bdo font-normal text-black/70"
                        >
                            Berdiri sejak tahun 2008 sebagai Fitness Centre di
                            lingkungan Universitas Brawijaya, UB Sport Center
                            berkembang menjadi pusat olahraga terpadu berbasis
                            pendidikan dengan layanan dan fasilitas yang
                            terkelola secara profesional.
                        </ScrollTextReveal>
                    </div>

                    <div
                        ref={statsRef}
                        className="about-history-stats"
                    >
                        {STATS.map((stat, index) => (
                            <StatItem
                                key={stat.label}
                                stat={stat}
                                active={isStatsVisible}
                                index={index}
                            />
                        ))}
                    </div>
                </div>

                <div
                    ref={mediaRef}
                    className="about-history-media relative isolate overflow-hidden"
                >
                    <img
                        src={bg}
                        alt=""
                        aria-hidden
                        className="about-history-media-bg absolute inset-0 h-full w-full object-cover object-center"
                        loading="lazy"
                        decoding="async"
                    />
                    <div className="absolute inset-0 z-0 bg-black/25" />
                    <div
                        className="about-history-media-shine absolute inset-y-0 z-[1]"
                        aria-hidden="true"
                    />
                    <CurvedLoop
                        marqueeText={
                            "P   \u2726   UB   \u2726   SPORT   \u2726   CENTER   \u2726   UB   \u2726   "
                        }
                        speed={loopSpeed}
                        curveAmount={curveAmount}
                        fontSize={loopFontSize}
                        direction="left"
                        interactive
                        className="about-history-loop absolute top-1/2 z-10"
                    />

                    <div className="about-history-media-person-wrap pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                        <span
                            className="about-history-person-aura"
                            aria-hidden="true"
                        />
                        <img
                            src={person}
                            alt="UB Sport Center athlete"
                            className="about-history-media-person w-auto object-cover shadow-2xl"
                            loading="lazy"
                            decoding="async"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
