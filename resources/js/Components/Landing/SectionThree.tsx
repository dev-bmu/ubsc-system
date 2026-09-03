import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollStack, { ScrollStackItem } from "@/Components/Landing/ScrollStack";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import {
    type CSSProperties,
    useEffect,
    useRef,
    useState,
} from "react";

export interface Location {
    id: string;
    name: string;
    category: string;
    image: string;
    mapLink: string;
    hidden?: boolean;
}

const DUMMY_LOCATIONS: Location[] = [
    {
        id: "1",
        name: "UB Sport Center Veteran",
        category: "Pusat Kebugaran Utama",
        image: "/assets/images/ub-sport-center-kantor-pusat-malang.avif",
        mapLink:
            "https://www.google.com/maps/place/UB+Sport+Center/@-7.9562538,112.6187071,17z/data=!4m6!3m5!1s0x2e7882788af472d9:0x12f8cee690772ec5!8m2!3d-7.955132!4d112.618489!16s%2Fg%2F11ckv5zn2f!5m1!1e4?entry=ttu&g_ep=EgoyMDI2MDcyOC4wIKXMDSoASAFQAw%3D%3D",
    },
    {
        id: "2",
        name: "UB Sport Center Dieng",
        category: "Cabang Arena Terbuka",
        image: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
        mapLink:
            "https://www.google.com/maps/place/Lapangan+Sepak+Bola+Universitas+Brawijaya/@-7.969492,112.591967,19z/data=!4m12!1m5!3m4!2zN8KwNTgnMDkuMSJTIDExMsKwMzUnMjkuNCJF!8m2!3d-7.9691905!4d112.591511!3m5!1s0x2e7882f3e36b08a7:0x4b7c912caaba1ca0!8m2!3d-7.9692283!4d112.5915689!16s%2Fg%2F11gbfm0jsj!5m1!1e4?entry=ttu&g_ep=EgoyMDI2MDcyOC4wIKXMDSoASAFQAw%3D%3D",
    },
    // {
    //     id: "3",
    //     name: "UB Sport Center Transmart",
    //     category: "Cabang Eksklusif",
    //     image: "/assets/images/cabang-eksklusif-transmart-ub-sport-center-malang.avif",
    //     mapLink: "https://maps.app.goo.gl/rNEukCEQAQSZDAga6",
    // },
];

const VISIBLE_LOCATIONS = DUMMY_LOCATIONS.filter((location) => !location.hidden);

function BranchIcon() {
    return (
        <img
            src="/assets/icons/branch-office-modern-hd.png"
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            width={24}
            height={24}
            className="relative z-10 h-6 w-6 object-contain"
        />
    );
}

function BranchCounter({
    activeIndex,
    total,
    compact = false,
}: {
    activeIndex: number;
    total: number;
    compact?: boolean;
}) {
    const current = String(Math.min(activeIndex + 1, total)).padStart(2, "0");
    const count = String(total).padStart(2, "0");

    return (
        <div className="gym-traffic-badge--animated inline-flex w-fit items-center gap-4 overflow-hidden rounded-[5px] bg-white p-1 pr-5">
            <div
                className={`branch-office-tile flex items-center justify-center overflow-hidden rounded-[5px] bg-gradient-to-tr from-[#002244] to-[#15678D] ${
                    compact ? "h-11 w-14" : "h-12 w-14"
                }`}
            >
                <BranchIcon />
            </div>
            <span
                className={`whitespace-nowrap font-bdo font-medium text-black/70 ${
                    compact ? "text-[14px]" : "text-[15px]"
                }`}
            >
                <span className="font-clash font-light tabular-nums tracking-[0.015em] text-black/45">
                    {`${current}/${count}`}
                </span>{" "}
                <span>Cabang</span>
            </span>
        </div>
    );
}

function CornerArrow() {
    return (
        <svg
            viewBox="0 0 34 34"
            fill="none"
            aria-hidden="true"
            className="h-8 w-8 text-[#8A8A8A] transition duration-300 ease-out group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-[#6F6F6F]"
        >
            <path
                d="M10.8 9.35H24.65V23.2"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M15.45 14H20V18.55"
                stroke="currentColor"
                strokeWidth="0.85"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.45"
            />
        </svg>
    );
}

function LocationCard({
    location,
    priority = false,
}: {
    location: Location;
    priority?: boolean;
}) {
    return (
        <a
            href={location.mapLink}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex w-full cursor-pointer flex-col gap-6"
        >
            {/* IMAGE CONTAINER (The Blurred Backdrop + Sharp Foreground) */}
            <div className="section-three-card-media relative aspect-[1.16] w-full overflow-hidden rounded-[5px] sm:aspect-[1.35] xl:aspect-[1.5]">
                {/* Layer 1 — blurred backdrop */}
                <div className="absolute inset-0">
                    <img
                        src={location.image}
                        alt=""
                        loading={priority ? "eager" : "lazy"}
                        decoding="async"
                        {...{
                            fetchpriority: priority ? "high" : "low",
                        }}
                        width={1600}
                        height={1067}
                        sizes="(min-width: 1280px) 70vw, (min-width: 768px) 92vw, 100vw"
                        className="section-three-card-backdrop absolute inset-0 h-full w-full scale-110 object-cover opacity-90"
                    />
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 z-[1] bg-black/30"
                    />
                    <div
                        aria-hidden="true"
                        className="section-three-card-glass"
                    >
                        <div className="section-three-card-glass__effect" />
                        <div className="section-three-card-glass__tint" />
                        <div className="section-three-card-glass__shine" />
                    </div>
                </div>

                {/* Layer 2 — sharp foreground image with Padding */}
                <div
                    className="section-three-card-foreground-shell relative z-10 flex h-full flex-col justify-center px-[clamp(2rem,8vw,5rem)] py-14 sm:px-[clamp(3rem,9vw,6rem)] xl:px-[clamp(7rem,8.2vw,10rem)] xl:py-24"
                >
                    <div className="section-three-card-foreground relative aspect-[16/11] w-full overflow-hidden rounded-[5px] transition-transform duration-300 ease-out group-hover:scale-[1.015]">
                        <img
                            src={location.image}
                            alt={location.name}
                            loading={priority ? "eager" : "lazy"}
                            decoding="async"
                            {...{
                                fetchpriority: priority ? "high" : "low",
                            }}
                            width={1600}
                            height={1100}
                            sizes="(min-width: 1280px) 58vw, (min-width: 768px) 78vw, 86vw"
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    </div>
                </div>
            </div>

            {/* TEXT CONTENT (Outside the image container as per SS1) */}
            <div className="section-three-card-copy flex items-start justify-between px-2 xl:px-3">
                <div className="flex flex-col gap-1">
                    <ScrollTextReveal
                        as="h3"
                        split="words"
                        delay={60}
                        stagger={16}
                        amount={0.18}
                        className="font-bdo text-[clamp(1.02rem,1.04vw,1.22rem)] font-semibold leading-tight tracking-[-0.035em] text-black"
                    >
                        {location.name}
                    </ScrollTextReveal>
                    <ScrollTextReveal
                        as="p"
                        split="words"
                        delay={120}
                        stagger={12}
                        amount={0.18}
                        className="font-bdo text-[clamp(0.78rem,0.86vw,0.98rem)] font-normal tracking-[-0.02em] text-gray-500"
                    >
                        {location.category}
                    </ScrollTextReveal>
                </div>

                <div className="flex flex-shrink-0 items-center justify-center pr-1 pt-0.5">
                    <CornerArrow />
                </div>
            </div>
        </a>
    );
}

export default function SectionThree() {
    const sectionRef = useRef<HTMLElement>(null);
    const entranceReady = useHomepageEntranceReady();
    const [activeLocationIndex, setActiveLocationIndex] = useState(0);
    const [shouldPrioritizeMedia, setShouldPrioritizeMedia] = useState(false);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || shouldPrioritizeMedia) return;

        if (!("IntersectionObserver" in window)) {
            setShouldPrioritizeMedia(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setShouldPrioritizeMedia(true);
                observer.disconnect();
            },
            {
                threshold: 0,
                rootMargin: "720px 0px 720px 0px",
            },
        );

        observer.observe(section);
        return () => observer.disconnect();
    }, [shouldPrioritizeMedia]);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || !entranceReady) return;

        let completeTimer = 0;
        const reveal = () => {
            section.classList.add("is-visible");
            completeTimer = window.setTimeout(
                () => section.classList.add("is-complete"),
                1900,
            );
        };

        if (!("IntersectionObserver" in window)) {
            reveal();
            return () => window.clearTimeout(completeTimer);
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                reveal();
                observer.disconnect();
            },
            {
                threshold: 0.025,
                rootMargin: "0px 0px -4% 0px",
            },
        );

        observer.observe(section);
        return () => {
            observer.disconnect();
            window.clearTimeout(completeTimer);
        };
    }, [entranceReady]);

    return (
        <section
            ref={sectionRef}
            id="locations"
            data-navbar-surface="light"
            className="section-three-performance section-three-stage w-full bg-[#F5F7F9] pb-16 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14"
        >
            <svg
                aria-hidden="true"
                width="0"
                height="0"
                style={{ position: "absolute", width: 0, height: 0 }}
            >
                <defs>
                    <filter
                        id="section-three-glass-distortion"
                        x="-20%"
                        y="-20%"
                        width="140%"
                        height="140%"
                        filterUnits="objectBoundingBox"
                    >
                        <feTurbulence
                            type="fractalNoise"
                            baseFrequency="0.010 0.014"
                            numOctaves={2}
                            seed={42}
                            result="noise"
                        />
                        <feGaussianBlur
                            in="noise"
                            stdDeviation="2.4"
                            result="blurred"
                        />
                        <feDisplacementMap
                            in="SourceGraphic"
                            in2="blurred"
                            scale={58}
                            xChannelSelector="R"
                            yChannelSelector="G"
                        />
                    </filter>
                </defs>
            </svg>

            <div className="section-three-reveal section-three-reveal--divider mx-auto px-[clamp(1.5rem,4.5vw,5.5rem)]">
                <SectionDivider
                    number="02"
                    title="Lokasi Kami"
                    subtitle="01 homepage"
                    theme="light"
                    outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                    contentClassName="px-3"
                />
            </div>

            <div className="section-three-reveal section-three-reveal--label mx-auto mt-12 hidden items-center gap-3 px-[clamp(1.5rem,4.5vw,5.5rem)] md:mt-14 lg:mt-16 xl:flex">
                <span className="section-label-diamond" />
                <ScrollTextReveal
                    delay={70}
                    stagger={18}
                    amount={0.15}
                    className="home-section-anchor font-bdo text-[1.25rem] font-medium tracking-[-0.025em] text-black"
                >
                    Eksplorasi Cabang Kami
                </ScrollTextReveal>
            </div>

            <div className="mx-auto mt-10 flex flex-col gap-0 px-[clamp(1.5rem,4.5vw,5.5rem)] sm:mt-12 sm:gap-6 md:mt-14 lg:mt-16 xl:mt-[4.6rem] xl:grid xl:grid-cols-[16rem_minmax(0,1fr)_14rem] xl:items-start xl:gap-[clamp(5rem,6.7vw,8rem)]">
                {/* Left — label static (scrolls away); badge viewport-center sticky */}
                <div className="xl:self-stretch">
                    <div className="section-three-reveal section-three-reveal--label flex items-center gap-4 xl:hidden">
                        <span className="section-label-diamond" />
                        <ScrollTextReveal
                            delay={70}
                            stagger={18}
                            amount={0.15}
                            className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
                        >
                            Eksplorasi Cabang Kami
                        </ScrollTextReveal>
                    </div>
                    <div className="section-three-reveal section-three-reveal--counter mt-6 sm:mt-5 xl:hidden">
                        <BranchCounter
                            activeIndex={activeLocationIndex}
                            total={VISIBLE_LOCATIONS.length}
                            compact
                        />
                    </div>
                    <div className="hidden xl:block xl:sticky xl:top-[50vh] xl:-translate-y-1/2 xl:mt-[12rem]">
                        <div className="section-three-reveal section-three-reveal--counter">
                            <BranchCounter
                                activeIndex={activeLocationIndex}
                                total={VISIBLE_LOCATIONS.length}
                            />
                        </div>
                    </div>
                </div>

                {/* ScrollStack cards */}
                <div className="mt-9 min-w-0 flex-1 sm:mt-0">
                    <div className="w-full origin-top md:w-[108%] md:-translate-x-[3.75%] xl:w-[115%] xl:-translate-x-[6.5%]">
                        <ScrollStack
                            topStart={0}
                            cardOffset={0}
                            lastItemGap="0px"
                            onActiveIndexChange={setActiveLocationIndex}
                        >
                            {VISIBLE_LOCATIONS.map((loc, index) => (
                                <ScrollStackItem
                                    key={loc.id}
                                    itemClassName="rounded-[5px]"
                                >
                                    <div
                                        className="section-three-reveal section-three-reveal--card rounded-[5px] bg-[#F5F7F9]"
                                        style={
                                            {
                                                "--section-three-delay": `${220 + index * 110}ms`,
                                            } as CSSProperties
                                        }
                                    >
                                        {" "}
                                        {/* Background matching the section for clean stack */}
                                        <LocationCard
                                            location={loc}
                                            priority={
                                                shouldPrioritizeMedia &&
                                                index === 0
                                            }
                                        />
                                    </div>
                                </ScrollStackItem>
                            ))}
                        </ScrollStack>
                    </div>
                </div>

                <div className="section-three-reveal section-three-reveal--aside mt-9 font-bdo text-[clamp(1.24rem,4vw,1.5rem)] font-medium leading-tight text-black sm:mt-0 xl:hidden">
                    <ScrollTextReveal
                        as="h2"
                        split="words"
                        delay={80}
                        stagger={20}
                        amount={0.16}
                    >
                        Pusat Olahraga saat ini
                    </ScrollTextReveal>
                    <ScrollTextReveal
                        as="h2"
                        split="words"
                        delay={130}
                        stagger={20}
                        amount={0.16}
                    >
                        ada di Berbagai Lokasi
                    </ScrollTextReveal>
                </div>

                {/* Right — viewport-center sticky with initial offset */}
                <div className="section-three-reveal section-three-reveal--aside hidden xl:flex xl:w-56 xl:flex-shrink-0 xl:self-stretch flex-col">
                    <div className="xl:sticky xl:top-[50vh] xl:-translate-y-1/2 xl:mt-[12rem]">
                        <ScrollTextReveal
                            as="h2"
                            split="words"
                            delay={90}
                            stagger={18}
                            amount={0.18}
                            className="font-bdo text-[20px] font-medium leading-[1.4] text-black"
                        >
                            Pusat Olahraga saat ini ada di Berbagai Lokasi
                        </ScrollTextReveal>
                    </div>
                </div>
            </div>
        </section>
    );
}
