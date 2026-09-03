import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import FacilityListSection from "@/Components/Facility/FacilityListSection";
import type { FacilityItem } from "@/Components/Facility/FacilityListItem";
import { isOutdoorFacility } from "@/lib/facilityClassification";
import type { PublicFacilityReservation } from "@/lib/facilityReservation";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

interface BackendFacility {
    id: number;
    name: string;
    image: string;
    category: string;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    rating?: number | null;
    reservation?: PublicFacilityReservation | null;
}

interface SectionFourProps {
    facilities?: BackendFacility[];
    isLandingPage?: boolean;
}

function ScrollObjectReveal({
    children,
    className = "",
    delay = 0,
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const [hasEntered, setHasEntered] = useState(false);
    const entranceReady = useHomepageEntranceReady();

    useEffect(() => {
        const node = rootRef.current;
        if (!entranceReady || !node || hasEntered) return;

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
            {
                threshold: 0.25,
                rootMargin: "0px 0px -14% 0px",
            },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [entranceReady, hasEntered]);

    return (
        <div
            ref={rootRef}
            className={`ubsc-object-reveal ${hasEntered ? "is-visible" : ""} ${className}`}
            style={{ "--ubsc-object-delay": `${delay}ms` } as CSSProperties}
        >
            {children}
        </div>
    );
}

function SectionFourHeadline() {
    return (
        <h2
            aria-label="Dukungan Penuh Untuk Setiap Cabang Olahraga"
            className="section-two-headline-weight max-w-lg font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-none xl:text-center xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
        >
            {["Dukungan Penuh Untuk", "Setiap Cabang Olahraga"].map(
                (line, index) => (
                    <span key={line} className="block overflow-visible">
                        <ScrollTextReveal
                            delay={100 + index * 95}
                            className="-mb-[0.14em] whitespace-nowrap pb-[0.14em] pr-[0.08em]"
                        >
                            {line}
                        </ScrollTextReveal>
                    </span>
                ),
            )}
        </h2>
    );
}

function SectionFourCurtainEdge() {
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = rootRef.current;
        const section = root?.closest("section") as HTMLElement | null;
        const content = section?.querySelector<HTMLElement>(
            ".section-four-curtain-content",
        );
        const postSectionFlow = document.querySelector<HTMLElement>(
            ".home-post-section-four-flow",
        );

        if (!root || !section || !content) return;

        let frame = 0;
        let disposed = false;
        let needsMeasure = true;
        let isNearViewport = true;
        let viewportWidth = 1;
        let viewportHeight = 1;
        let sectionTop = 0;
        let maxFollow = 0;
        let contentMaxFollow = 0;
        let renderedProgress = 0;
        let hasRenderedProgress = false;
        let lastFrameTime = 0;
        let lastCurtainScale = -1;
        let lastContentOffset = Number.NaN;
        const measuredSibling = section.previousElementSibling;
        const isIOSWebKit =
            /iP(?:hone|ad|od)/.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" &&
                navigator.maxTouchPoints > 1);

        // Remove stale inline properties left by the previous layout-driven
        // implementation during hot reloads. Later sections stay in normal
        // document flow; only the curtain and its own content are composited.
        postSectionFlow?.style.removeProperty("transform");
        postSectionFlow?.style.removeProperty("will-change");

        const measure = () => {
            viewportWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;
            viewportHeight =
                root.offsetHeight ||
                document.documentElement.clientHeight ||
                window.innerHeight ||
                1;
            sectionTop =
                section.getBoundingClientRect().top +
                Math.max(
                    0,
                    window.scrollY || document.documentElement.scrollTop || 0,
                );
            const isMobile = viewportWidth < 640;
            const isTabletPortrait =
                viewportWidth >= 640 &&
                viewportWidth < 1180 &&
                viewportHeight > viewportWidth;
            const isTabletLandscape =
                viewportWidth >= 900 &&
                viewportWidth < 1440 &&
                viewportHeight <= viewportWidth;
            const followRatio = isMobile
                ? 0.42
                : isTabletPortrait
                  ? 0.46
                  : isTabletLandscape
                    ? 0.48
                    : 0.52;
            const followInset = isMobile
                ? 34
                : isTabletPortrait
                  ? 44
                  : isTabletLandscape
                    ? 52
                    : 64;
            const contentPaddingReserve = isMobile
                ? 48
                : isTabletPortrait
                  ? 56
                  : isTabletLandscape
                    ? 64
                    : 56;

            maxFollow = Math.max(
                0,
                viewportHeight * followRatio - followInset,
            );
            contentMaxFollow = Math.max(
                0,
                maxFollow - contentPaddingReserve,
            );

            // Reserve the final resting geometry once instead of mutating
            // margin on every scroll frame. The content transform reaches the
            // same final position as before without forcing repeated reflow.
            section.style.marginBottom =
                contentMaxFollow > 0 ? `${-contentMaxFollow}px` : "0px";
            needsMeasure = false;
        };

        const update = (now = window.performance.now()) => {
            frame = 0;
            if (!isNearViewport && !needsMeasure) return;
            if (needsMeasure) measure();

            const scrollTop = Math.max(
                0,
                window.scrollY || document.documentElement.scrollTop || 0,
            );
            const sectionViewportTop = sectionTop - scrollTop;
            const targetProgress = Math.min(
                1,
                Math.max(
                    0,
                    (viewportHeight - sectionViewportTop) / viewportHeight,
                ),
            );
            let progress = targetProgress;

            if (isIOSWebKit) {
                if (!hasRenderedProgress) {
                    renderedProgress = targetProgress;
                    hasRenderedProgress = true;
                } else {
                    const elapsed =
                        lastFrameTime > 0 && now - lastFrameTime < 80
                            ? Math.max(1, now - lastFrameTime)
                            : 1000 / 60;
                    const difference = targetProgress - renderedProgress;

                    if (Math.abs(difference) <= 0.00012) {
                        renderedProgress = targetProgress;
                    } else {
                        const response = difference > 0 ? 46 : 40;
                        const blend =
                            1 - Math.exp((-response * elapsed) / 1000);
                        renderedProgress += difference * blend;
                    }
                }

                progress = Math.min(1, Math.max(0, renderedProgress));
            } else {
                renderedProgress = targetProgress;
                hasRenderedProgress = true;
            }

            lastFrameTime = now;
            const pixelRatio = Math.min(3, window.devicePixelRatio || 1);
            const visibleHeight = progress * viewportHeight;
            const curtainScale =
                Math.round(visibleHeight * pixelRatio) /
                pixelRatio /
                viewportHeight;

            if (Math.abs(curtainScale - lastCurtainScale) > 0.00004) {
                root.style.transform = `translate3d(0, 0, 0) scaleY(${curtainScale})`;
                lastCurtainScale = curtainScale;
            }

            const followEase = progress * progress * (3 - 2 * progress);
            const rawContentOffset = -contentMaxFollow * followEase;
            const contentFollowOffset =
                Math.round(rawContentOffset * pixelRatio) / pixelRatio;

            if (
                !Number.isFinite(lastContentOffset) ||
                Math.abs(lastContentOffset - contentFollowOffset) > 0.05
            ) {
                lastContentOffset = contentFollowOffset;
                content.style.transform = `translate3d(0, ${contentFollowOffset}px, 0)`;
                if (progress > 0.001 && progress < 0.999) {
                    content.style.willChange = "transform";
                } else {
                    content.style.removeProperty("will-change");
                }
            }

            if (
                isIOSWebKit &&
                Math.abs(targetProgress - renderedProgress) > 0.00012
            ) {
                frame = window.requestAnimationFrame(update);
            } else {
                lastFrameTime = 0;
            }
        };

        const requestUpdate = () => {
            if (disposed || frame) return;
            frame = window.requestAnimationFrame(update);
        };

        const requestMeasure = () => {
            if (disposed) return;
            needsMeasure = true;
            requestUpdate();
        };

        const requestViewportMeasure = () => {
            if (disposed) return;
            const nextWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;

            // Safari changes only the viewport height while its browser chrome
            // opens and closes. Reusing stable svh geometry prevents shaking.
            if (isIOSWebKit && Math.abs(nextWidth - viewportWidth) < 1) return;
            requestMeasure();
        };

        const intersectionObserver =
            "IntersectionObserver" in window
                ? new IntersectionObserver(
                      ([entry]) => {
                          isNearViewport = entry?.isIntersecting ?? true;
                          if (isNearViewport) requestMeasure();
                      },
                      {
                          rootMargin: "100% 0px 100% 0px",
                          threshold: 0,
                      },
                  )
                : null;

        const resizeObserver =
            "ResizeObserver" in window
                ? new ResizeObserver(requestViewportMeasure)
                : null;

        intersectionObserver?.observe(section);
        if (measuredSibling instanceof Element) {
            resizeObserver?.observe(measuredSibling);
        }

        update();
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestViewportMeasure, {
            passive: true,
        });
        window.addEventListener("load", requestMeasure, { once: true });
        void document.fonts?.ready.then(requestMeasure);

        return () => {
            disposed = true;
            intersectionObserver?.disconnect();
            resizeObserver?.disconnect();
            window.removeEventListener("scroll", requestUpdate);
            window.removeEventListener("resize", requestViewportMeasure);
            window.removeEventListener("load", requestMeasure);
            root.style.removeProperty("transform");
            content.style.removeProperty("transform");
            content.style.removeProperty("will-change");
            section.style.removeProperty("margin-bottom");
            postSectionFlow?.style.removeProperty("transform");
            postSectionFlow?.style.removeProperty("will-change");
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <div
            ref={rootRef}
            className="section-four-curtain-edge"
            aria-hidden="true"
        >
            <span className="section-four-curtain-edge__shape" />
        </div>
    );
}

function FacilityCategoryBadge() {
    return (
        <div
            className="gym-traffic-badge gym-traffic-badge--animated gym-traffic-badge--no-hover flex h-[46px] w-full min-w-0 max-w-[150px] overflow-hidden rounded-[7px] bg-black p-[3px] xl:h-16 xl:w-[210px] xl:max-w-none xl:shrink-0 xl:rounded-lg xl:p-1"
            aria-label="3 kategori fasilitas"
        >
            <div className="flex min-w-0 items-center justify-center gap-1 bg-black px-2 sm:gap-1.5 sm:px-2.5 xl:px-3.5">
                <img
                    src="/assets/icons/branch-court.png"
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4 rotate-90 object-contain xl:h-[18px] xl:w-[18px]"
                />
                <span className="font-clash text-sm font-semibold leading-none text-white sm:text-base xl:text-xl">
                    3
                </span>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-r from-[#15678D] to-[#002244]">
                <div className="gym-traffic-glow absolute inset-0 shadow-[inset_0_0_24px_rgba(59,130,246,0.38)]" />
                <div className="gym-traffic-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                <span className="relative whitespace-nowrap font-clash text-xs font-semibold text-white sm:text-sm xl:text-base">
                    Kategori
                </span>
            </div>
        </div>
    );
}

export default function SectionFour({
    facilities = [],
}: SectionFourProps) {
    const arenaFacilities: FacilityItem[] = facilities
        .filter(
            (f) =>
                f.category === "Lapangan & Arena" &&
                !isOutdoorFacility(f),
        )
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            title: `/${f.name}.`,
            code:
                f.class_code ||
                `/Tertutup ${String(idx + 1).padStart(3, "0")}/`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location || "Veteran",
            badgeType: "Arena Dalam",
            badgeVariant: "blue" as const,
            reservation: f.reservation,
        }));

    const classFacilities: FacilityItem[] = facilities
        .filter((f) => f.category === "Kelas & Kebugaran")
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            title: `/${f.name}.`,
            code:
                f.class_code ||
                `/Class ${String(idx + 1).padStart(3, "0")}/`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location || "Veteran",
            badgeType: "Kebugaran",
            badgeVariant: "blue-red" as const,
            reservation: f.reservation,
        }));

    const outdoorFacilities: FacilityItem[] = facilities
        .filter(isOutdoorFacility)
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            title: `/${f.name}.`,
            code:
                f.class_code ||
                `/Terbuka ${String(idx + 1).padStart(3, "0")}/`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location || "Dieng",
            badgeType: f.venue_type || "Arena Luar",
            badgeVariant: "red" as const,
            reservation: f.reservation,
        }));

    const featuredFacilities: FacilityItem[] = [
        ...arenaFacilities.slice(0, 2),
        ...classFacilities.slice(0, 2),
        ...outdoorFacilities.slice(0, 2),
    ].map((facility, index) => ({
        ...facility,
        id: String(index + 1).padStart(2, "0"),
    }));
    return (
        <>
        <section
            id="facilities"
            data-navbar-surface="light"
            className="section-four-curtain w-full bg-white pb-0 pt-12 md:pt-14 lg:pt-16 xl:pt-14"
        >
            <SectionFourCurtainEdge />
            <div className="section-four-curtain-content">
                <div className="mx-auto bg-white px-[clamp(1.5rem,4.5vw,5.5rem)]">
                    <SectionDivider
                        number="03"
                        title="Fasilitas"
                        subtitle="01 homepage"
                        theme="light"
                        outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                        contentClassName="px-3"
                    />

                    <div className="mt-12 grid grid-cols-1 items-start gap-8 md:mt-14 lg:mt-16 xl:relative xl:mt-14 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,2fr)_minmax(0,1fr)] xl:gap-6">
                        <div className="flex items-center gap-4 xl:gap-3">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal
                                delay={80}
                                className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
                            >
                                Fasilitas Kami
                            </ScrollTextReveal>
                        </div>

                        <div className="xl:justify-self-center">
                            <SectionFourHeadline />
                        </div>

                        <div className="xl:justify-self-end">
                            <ScrollTextReveal
                                as="p"
                                split="words"
                                delay={180}
                                stagger={10}
                                className="font-bdo text-[clamp(0.875rem,1.04vw,20px)] font-normal leading-relaxed text-black/70 xl:hidden"
                            >
                                Kami menghadirkan berbagai pilihan fasilitas
                                olahraga indoor, Outdoor, dan Kelas untuk kenyamanan
                                latihan Anda.
                            </ScrollTextReveal>
                            <p className="hidden w-max text-left font-bdo text-[clamp(0.875rem,1.04vw,20px)] font-normal leading-[1.55] text-black xl:block">
                                <span className="block overflow-visible">
                                    <ScrollTextReveal
                                        delay={180}
                                        className="-mb-[0.1em] whitespace-nowrap pb-[0.1em] pr-[0.08em]"
                                    >
                                        Kami menghadirkan berbagai pilihan
                                    </ScrollTextReveal>
                                </span>
                                <span className="block overflow-visible">
                                    <ScrollTextReveal
                                        delay={250}
                                        className="-mb-[0.1em] whitespace-nowrap pb-[0.1em] pr-[0.08em]"
                                    >
                                        fasilitas olahraga indoor, Outdoor, dan
                                    </ScrollTextReveal>
                                </span>
                                <span className="block overflow-visible">
                                    <ScrollTextReveal
                                        delay={320}
                                        className="-mb-[0.1em] whitespace-nowrap pb-[0.1em] pr-[0.08em]"
                                    >
                                        Kelas untuk kenyamanan latihan Anda.
                                    </ScrollTextReveal>
                                </span>
                            </p>
                        </div>
                    </div>

                    <div className="mt-10 flex items-center gap-3 pb-10 md:mt-12 md:grid md:grid-cols-2 md:gap-6 xl:mt-16 xl:flex xl:justify-between xl:pb-16">
                        <ScrollObjectReveal
                            delay={360}
                            className="section-four-reservation-action min-w-0 flex-1 md:flex-none xl:-ml-1.5"
                        >
                            <ReservasiButton
                                label="Mulai Reservasi"
                                href="/booking"
                            />
                        </ScrollObjectReveal>
                        <ScrollObjectReveal
                            delay={430}
                            className="flex w-[150px] min-w-0 shrink-0 justify-end xl:w-[210px]"
                        >
                            <FacilityCategoryBadge />
                        </ScrollObjectReveal>
                    </div>
                </div>

                <FacilityListSection
                    facilities={
                        featuredFacilities.length > 0
                            ? featuredFacilities
                            : undefined
                    }
                    itemLimit={6}
                    introVariant="overview"
                    marqueeWords={["Fasilitas", "Kami"]}
                    ctaHref="/booking"
                    ctaLabel="Lihat & Reservasi Fasilitas"
                />
            </div>
        </section>
        </>
    );
}
