import {
    type CSSProperties,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from "react";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import FacilityExploreLink from "@/Components/Landing/FacilityExploreLink";
import SectionDivider from "@/Components/Landing/SectionDivider";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import FacilityTextMarquee from "./FacilityTextMarquee";
import FacilityListItem from "./FacilityListItem";
import type { FacilityItem } from "./FacilityListItem";
import person from "@/../assets/images/person.avif";

const FACILITIES: FacilityItem[] = [
    {
        id: "01",
        title: "/Tennis Reborn.",
        code: "/Tertutup 001/",
        image: "/assets/images/fasilitas-tenis-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeType: "Arena Dalam",
    },
    {
        id: "02",
        title: "/Badminton.",
        code: "/Tertutup 002/",
        image: "/assets/images/fasilitas-bulutangkis-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeType: "Arena Dalam",
    },
    {
        id: "03",
        title: "/Table Tennis.",
        code: "/Tertutup 003/",
        image: "/assets/images/fasilitas-tennis-meja-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeType: "Arena Dalam",
    },
    {
        id: "04",
        title: "/Futsal Veteran.",
        code: "/Tertutup 004/",
        image: "/assets/images/fasilitas-futsal-dieng-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeType: "Arena Dalam",
    },
    {
        id: "05",
        title: "/Ruang Beladiri.",
        code: "/Tertutup 005/",
        image: "/assets/images/fasilitas-beladiri-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeType: "Arena Dalam",
    },
];

const FACILITY_LIST_HEADING =
    "Nikmati berbagai pilihan fasilitas indoor dengan suasana tertata, akses mudah, dan dukungan ruang yang sesuai untuk aktivitas olahraga harian.";

const FACILITY_OVERVIEW_HEADING =
    "Kenali pilihan fasilitas indoor, kelas, dan outdoor yang kami hadirkan untuk mendukung setiap aktivitas olahraga Anda.";

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
                threshold: 0.22,
                rootMargin: "0px 0px -12% 0px",
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

interface FacilityListSectionProps {
    sectionNumber?: string;
    sectionTitle?: string;
    sectionSubtitle?: string;
    facilities?: FacilityItem[];
    isLandingPage?: boolean;
    showSectionDivider?: boolean;
    itemLimit?: number;
    marqueeWords?: string[];
    introVariant?: "indoor" | "overview";
    ctaHref?: string;
    ctaLabel?: string;
}

export default function FacilityListSection({
    sectionNumber,
    sectionTitle,
    sectionSubtitle,
    facilities,
    isLandingPage = false,
    showSectionDivider = false,
    itemLimit,
    marqueeWords,
    introVariant = "indoor",
    ctaHref,
    ctaLabel,
}: FacilityListSectionProps = {}) {
    /* Always show at least as many items as the fallback set.
       Real DB data comes first; unused fallback items fill the rest. */
    const baseList =
        facilities && facilities.length > 0 ? facilities : FACILITIES;
    const usedIds = new Set(baseList.map((f) => f.id));
    const extraFallback = FACILITIES.filter((f) => !usedIds.has(f.id));
    const activeList = [...baseList, ...extraFallback];
    const resolvedLimit = itemLimit ?? (isLandingPage ? 4 : undefined);
    const renderedList =
        resolvedLimit === undefined
            ? activeList
            : activeList.slice(0, resolvedLimit);
    const isOverview = introVariant === "overview";
    const heading = isOverview
        ? FACILITY_OVERVIEW_HEADING
        : FACILITY_LIST_HEADING;
    const mobileHeadingLines = [
        "Nikmati berbagai",
        "pilihan fasilitas indoor",
        "dengan suasana tertata,",
        "akses mudah, dan",
        "dukungan ruang yang",
        "sesuai untuk aktivitas",
        "olahraga harian.",
    ];
    const tabletHeadingLines = isOverview
        ? [
              "Kenali pilihan fasilitas indoor,",
              "kelas, dan outdoor yang kami",
              "hadirkan untuk mendukung setiap",
              "aktivitas olahraga Anda.",
          ]
        : [
              "Nikmati berbagai pilihan fasilitas",
              "indoor dengan suasana tertata,",
              "akses mudah, dan dukungan ruang",
              "yang sesuai untuk aktivitas olahraga harian.",
          ];
    const largeTabletHeadingLines = isOverview
        ? [
              "Kenali pilihan fasilitas",
              "indoor, kelas, dan outdoor yang",
              "kami hadirkan untuk mendukung",
              "setiap aktivitas olahraga Anda.",
          ]
        : [
              "Nikmati berbagai pilihan",
              "fasilitas indoor dengan suasana tertata,",
              "akses mudah, dan dukungan ruang yang",
              "sesuai untuk aktivitas olahraga harian.",
          ];
    return (
        <section className="bg-[#242424] overflow-x-clip" id="facility-content">
            {/* --- MARQUEE STRIP --- */}
            <ScrollObjectReveal delay={20}>
                <FacilityTextMarquee
                    text="INDOOR"
                    words={marqueeWords}
                    className="relative z-0 py-2 md:py-2"
                />
            </ScrollObjectReveal>

            {showSectionDivider &&
                sectionNumber &&
                sectionTitle &&
                sectionSubtitle && (
                    <div className="px-[clamp(1.5rem,4.5vw,5.5rem)] pb-8 pt-14 sm:pb-10 sm:pt-16 lg:pt-20 xl:pt-[5.9rem]">
                        <SectionDivider
                            number={sectionNumber}
                            title={sectionTitle}
                            subtitle={sectionSubtitle}
                            theme="dark"
                            outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                            contentClassName="px-3"
                        />
                    </div>
                )}

            <div className="mx-auto px-[clamp(1.75rem,4.5vw,5.5rem)] py-6">
                {/* --- HERO INTRO EDITORIAL LAYOUT --- */}
                <div className="mb-20 mt-12 flex flex-col gap-11 xl:grid xl:grid-cols-[clamp(328px,21.4vw,410px)_minmax(0,1fr)] xl:gap-[clamp(4.1rem,4.75vw,5.7rem)] min-[1800px]:grid-cols-[390px_minmax(0,1fr)] min-[1800px]:gap-[7.25rem]">
                    <div className="flex flex-col items-start justify-between gap-10 xl:pb-3 xl:pt-[3px]">
                        <div className="flex items-center gap-4 xl:gap-3">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal
                                delay={80}
                                className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.5rem)] font-medium tracking-[-0.035em] text-white"
                            >
                                {isOverview ? "Pilihan Fasilitas" : "Arena Tertutup"}
                            </ScrollTextReveal>
                        </div>
                        {ctaHref && (
                            <ScrollObjectReveal
                                delay={210}
                                className="mt-auto hidden w-[328px] xl:block min-[1800px]:w-[410px]"
                            >
                                <FacilityExploreLink
                                    href={ctaHref}
                                    label={ctaLabel}
                                />
                            </ScrollObjectReveal>
                        )}
                    </div>

                    <div className="block min-w-0 w-full">
                        <ScrollObjectReveal
                            delay={130}
                            className="w-full"
                        >
                            <h2
                                aria-label={heading}
                                className="home-section-heading section-two-headline-weight block text-left font-bdo text-[1.75rem] font-medium leading-[1.01] tracking-[-0.058em] text-white sm:text-[2rem] xl:text-[2.6rem]"
                            >
                                <span
                                    className="relative hidden min-h-[258px] overflow-visible pt-[148px] xl:block min-[1800px]:min-h-[318px] min-[1800px]:pt-[190px]"
                                    aria-hidden
                                >
                                    <span className="absolute left-0 top-0 block aspect-[187/244] w-[150px] -translate-y-[9%] overflow-hidden min-[1800px]:w-[187px]">
                                        <img
                                            src={person}
                                            alt="UB Sport Center"
                                            className="h-full w-full object-cover object-top"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </span>
                                    <ScrollTextReveal
                                        split="lines"
                                        delay={110}
                                        stagger={95}
                                        className="facility-list-heading-fluid-reveal"
                                    >
                                        {heading}
                                    </ScrollTextReveal>
                                </span>
                                <span
                                    className="relative block min-h-[212px] overflow-visible pt-[78px] sm:min-h-[236px] sm:pt-[102px] md:hidden"
                                    aria-hidden
                                >
                                    <span className="absolute left-0 top-0 block aspect-[187/244] w-[88px] -translate-y-[9%] overflow-hidden max-[359px]:w-[78px]">
                                        <img
                                            src={person}
                                            alt="UB Sport Center"
                                            className="h-full w-full object-cover object-top"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </span>
                                    {isOverview ? (
                                        <ScrollTextReveal
                                            split="lines"
                                            delay={130}
                                            stagger={95}
                                            className="facility-list-heading-mobile-reveal"
                                        >
                                            {heading}
                                        </ScrollTextReveal>
                                    ) : (
                                        mobileHeadingLines.map((line, index) => (
                                            <span
                                                key={line}
                                                className={`block overflow-visible whitespace-nowrap ${
                                                    index === 0
                                                        ? "pl-[100px] max-[359px]:pl-[88px]"
                                                        : ""
                                                }`}
                                            >
                                                <ScrollTextReveal
                                                    delay={130 + index * 95}
                                                    className="-mb-[0.14em] inline-block whitespace-nowrap pb-[0.14em] pr-[0.08em]"
                                                >
                                                    {line}
                                                </ScrollTextReveal>
                                            </span>
                                        ))
                                    )}
                                </span>
                                <span
                                    className="relative hidden min-h-[258px] overflow-visible pt-[122px] md:block xl:hidden"
                                    aria-hidden
                                >
                                    <span className="absolute left-0 top-0 block aspect-[187/244] w-[120px] -translate-y-[9%] overflow-hidden lg:w-[138px]">
                                        <img
                                            src={person}
                                            alt="UB Sport Center"
                                            className="h-full w-full object-cover object-top"
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    </span>
                                    {tabletHeadingLines.map((line, index) => (
                                        <span
                                            key={line}
                                            className={`block overflow-visible whitespace-nowrap lg:hidden ${
                                                index === 0 ? "pl-[142px]" : ""
                                            }`}
                                        >
                                            <ScrollTextReveal
                                                delay={130 + index * 95}
                                                className="-mb-[0.14em] inline-block pb-[0.14em] pr-[0.08em] whitespace-nowrap"
                                            >
                                                {line}
                                            </ScrollTextReveal>
                                        </span>
                                    ))}
                                    {largeTabletHeadingLines.map((line, index) => (
                                        <span
                                            key={line}
                                            className={`hidden overflow-visible whitespace-nowrap lg:block ${
                                                index === 0 ? "pl-[162px]" : ""
                                            }`}
                                        >
                                            <ScrollTextReveal
                                                delay={130 + index * 95}
                                                className="-mb-[0.14em] inline-block pb-[0.14em] pr-[0.08em] whitespace-nowrap"
                                            >
                                                {line}
                                            </ScrollTextReveal>
                                        </span>
                                    ))}
                                </span>
                            </h2>
                        </ScrollObjectReveal>

                        {ctaHref && (
                            <ScrollObjectReveal delay={230} className="pt-14 xl:hidden">
                                <FacilityExploreLink
                                    href={ctaHref}
                                    label={ctaLabel}
                                />
                            </ScrollObjectReveal>
                        )}
                    </div>
                </div>

                {/* --- FACILITY LIST (NO GAP) --- */}
                <div className="mb-16 flex flex-col gap-0 border-t border-white/10 sm:mb-20 xl:mb-24">
                    {renderedList.map((item, index) => (
                        <ScrollObjectReveal
                            key={item.id}
                            delay={80 + index * 55}
                        >
                            <FacilityListItem item={item} revealDelay={index * 45} />
                        </ScrollObjectReveal>
                    ))}
                </div>
            </div>
        </section>
    );
}
