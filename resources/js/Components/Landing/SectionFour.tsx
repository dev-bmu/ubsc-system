import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import FacilityListSection from "@/Components/Facility/FacilityListSection";
import FacilityClassSection from "@/Components/Facility/FacilityClassSection";
import FacilityOutdoorSection from "@/Components/Facility/FacilityOutdoorSection";
import type { FacilityItem } from "@/Components/Facility/FacilityListItem";
import type { ClassItem } from "@/Components/Facility/FacilityClassSection";
import type { OutdoorFacility } from "@/Components/Facility/FacilityOutdoorSection";
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

    useEffect(() => {
        const node = rootRef.current;
        if (!node || hasEntered) return;

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
    }, [hasEntered]);

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
        const outdoorSection = document.getElementById("facility-outdoor");

        if (!root || !section || !content) return;

        let frame = 0;
        let lastHeight = -1;
        let lastContentOffset = 1;
        let lastOutdoorMargin = 0;

        const update = () => {
            frame = 0;

            const rect = section.getBoundingClientRect();
            const viewportHeight =
                window.innerHeight ||
                document.documentElement.clientHeight ||
                1;
            const progress = Math.min(
                1,
                Math.max(0, (viewportHeight - rect.top) / viewportHeight),
            );
            const nextHeight = Math.round(progress * viewportHeight);

            if (Math.abs(lastHeight - nextHeight) >= 1) {
                lastHeight = nextHeight;
                root.style.height = `${nextHeight}px`;
            }

            const viewportWidth =
                window.innerWidth ||
                document.documentElement.clientWidth ||
                1;
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
            const followEase = progress * progress * (3 - 2 * progress);
            const maxFollow = Math.max(0, viewportHeight * followRatio - followInset);
            const contentPaddingReserve = isMobile
                ? 48
                : isTabletPortrait
                  ? 56
                  : isTabletLandscape
                    ? 64
                    : 56;
            const contentMaxFollow = Math.max(
                0,
                maxFollow - contentPaddingReserve,
            );
            const contentFollowOffset = Math.round(-contentMaxFollow * followEase);

            if (Math.abs(lastContentOffset - contentFollowOffset) >= 1) {
                lastContentOffset = contentFollowOffset;
                content.style.transform = `translate3d(0, ${contentFollowOffset}px, 0)`;
                content.style.willChange =
                    contentFollowOffset === 0 ? "auto" : "transform";

                // Compensate outdoor section margin to close parallax gap
                if (outdoorSection) {
                    const targetMargin = contentFollowOffset;
                    if (Math.abs(lastOutdoorMargin - targetMargin) >= 1) {
                        lastOutdoorMargin = targetMargin;
                        outdoorSection.style.marginTop = `${targetMargin}px`;
                    }
                }
            }

        };

        const requestUpdate = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(update);
        };

        update();
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate);

        return () => {
            window.removeEventListener("scroll", requestUpdate);
            window.removeEventListener("resize", requestUpdate);
            root.style.removeProperty("height");
            content.style.removeProperty("transform");
            content.style.removeProperty("will-change");
            if (outdoorSection) {
                outdoorSection.style.removeProperty("margin-top");
            }
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
            className="gym-traffic-badge gym-traffic-badge--animated gym-traffic-badge--no-hover flex h-[46px] w-full min-w-0 max-w-[192px] overflow-hidden rounded-[7px] bg-black p-[3px] xl:h-16 xl:w-[230px] xl:max-w-none xl:shrink-0 xl:rounded-lg xl:p-1"
            aria-label="3 kategori fasilitas"
        >
            <div className="flex min-w-0 items-center justify-center gap-1 bg-black px-2.5 sm:gap-1.5 sm:px-3.5 xl:gap-1.5 xl:px-5">
                <img
                    src="/assets/icons/branch-court.png"
                    alt=""
                    aria-hidden="true"
                    className="gym-traffic-spin h-4 w-4 object-contain xl:h-[18px] xl:w-[18px]"
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
    isLandingPage = true,
}: SectionFourProps) {
    const arenaFacilities: FacilityItem[] = facilities
        .filter((f) => f.category === "Lapangan & Arena")
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            title: `/${f.name}.`,
            code:
                f.class_code ||
                `/Tertutup ${String(idx + 1).padStart(3, "0")}/`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location || "Veteran",
            badgeType: f.venue_type || "Indoor Facility",
        }));

    const classFacilities: ClassItem[] = facilities
        .filter((f) => f.category === "Kelas & Kebugaran")
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            name: f.name,
            code: String(idx + 1).padStart(3, "0"),
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location || "Veteran",
            badgeCategory: f.venue_type || "Kebugaran",
        }));

    const outdoorFacilities: OutdoorFacility[] = facilities
        .filter((f) => f.category === "Lapangan & Arena")
        .map((f) => ({
            id: String(f.id),
            name: f.name,
            category: f.venue_type || "Arena Luar",
            image: f.image || "/assets/images/comingsoon.avif",
            location: f.location || "Dieng",
            venueType: f.venue_type || "Outdoor Facility",
            mapLink: null,
        }));
    return (
        <section
            id="facilities"
            className="section-four-curtain w-full bg-[#FAFAFA] pb-0 pt-12 md:pt-14 lg:pt-16 xl:pt-14"
        >
            <SectionFourCurtainEdge />
            <div className="section-four-curtain-content">
                <div className="mx-auto bg-[#FAFAFA] px-[clamp(1.5rem,4.5vw,5.5rem)]">
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
                                className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
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

                    <div className="mb-10 mt-10 grid grid-cols-2 items-center gap-3 sm:gap-6 md:mt-12 xl:mb-16 xl:mt-16 xl:flex xl:justify-between">
                        <ScrollObjectReveal
                            delay={360}
                            className="min-w-0 xl:-ml-1.5"
                        >
                            <ReservasiButton label="Mulai Reservasi" />
                        </ScrollObjectReveal>
                        <ScrollObjectReveal
                            delay={430}
                            className="flex min-w-0 justify-end"
                        >
                            <FacilityCategoryBadge />
                        </ScrollObjectReveal>
                    </div>
                </div>

                <FacilityListSection
                    sectionNumber="04"
                    sectionTitle="Fasilitas Outdoor"
                    sectionSubtitle="01 homepage"
                    facilities={
                        arenaFacilities.length > 0 ? arenaFacilities : undefined
                    }
                    isLandingPage={isLandingPage}
                />
                <FacilityClassSection
                    sectionNumber="05"
                    sectionTitle="Kelas Indoor"
                    sectionSubtitle="01 homepage"
                    classes={
                        classFacilities.length > 0 ? classFacilities : undefined
                    }
                    isLandingPage={isLandingPage}
                />
            </div>
            <FacilityOutdoorSection
                sectionNumber="06"
                sectionTitle="Fasilitas Outdoor"
                sectionSubtitle="01 homepage"
                totalFacilitiesCount={facilities.length}
                facilities={
                    outdoorFacilities.length > 0 ? outdoorFacilities : undefined
                }
                isLandingPage={isLandingPage}
            />
        </section>
    );
}
