import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollStack, { ScrollStackItem } from "@/Components/Landing/ScrollStack";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import { type CSSProperties, useEffect, useState } from "react";

export interface Location {
    id: string;
    name: string;
    category: string;
    image: string;
    displayImage?: string;
    backdropImage?: string;
    mapLink?: string;
    hidden?: boolean;
}

const DUMMY_LOCATIONS: Location[] = [
    {
        id: "1",
        name: "UB Sport Center Veteran",
        category: "Pusat Kebugaran Utama",
        image: "/assets/images/ub-sport-center-kantor-pusat-malang.avif",
        displayImage:
            "/assets/images/ub-sport-center-kantor-pusat-malang-section-three.webp",
        backdropImage:
            "/assets/images/ub-sport-center-kantor-pusat-malang-section-three-blur.webp",
        mapLink: "https://maps.app.goo.gl/JLc41TfD5TuLfu8h9",
    },
    {
        id: "2",
        name: "UB Sport Center Dieng",
        category: "Cabang Arena Terbuka",
        image: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
        displayImage:
            "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang-section-three.webp",
        backdropImage:
            "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang-section-three-blur.webp",
        mapLink: "https://maps.app.goo.gl/RNPXp5pW2TqcE2YGA",
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
            className="relative z-10 h-6 w-6 object-contain [image-rendering:-webkit-optimize-contrast]"
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
        <div className="section-three-entrance-small gym-traffic-badge--animated inline-flex w-fit items-center gap-4 overflow-hidden rounded-[5px] bg-white p-1 pr-5">
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
                <ScrollTextReveal
                    delay={100}
                    className="font-clash font-light tabular-nums tracking-[0.015em] text-black/45"
                >
                    {`${current}/${count}`}
                </ScrollTextReveal>{" "}
                <ScrollTextReveal delay={155}>Cabang</ScrollTextReveal>
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
    revealDelay = 0,
}: {
    location: Location;
    priority?: boolean;
    revealDelay?: number;
}) {
    const handleClick = () => {
        if (location.mapLink) {
            window.open(location.mapLink, "_blank", "noopener,noreferrer");
        }
    };

    return (
        <div
            className="group flex w-full cursor-pointer flex-col gap-6"
            onClick={handleClick}
        >
            {/* IMAGE CONTAINER (The Blurred Backdrop + Sharp Foreground) */}
            <div
                className="section-three-location-media relative aspect-[1.16] w-full overflow-hidden rounded-[5px] sm:aspect-[1.35] xl:aspect-[1.5]"
                style={
                    {
                        "--section-three-reveal-delay": `${revealDelay}ms`,
                    } as CSSProperties
                }
            >
                {/* Layer 1 — blurred backdrop */}
                <div className="absolute inset-0">
                    <img
                        src={location.backdropImage ?? location.image}
                        alt=""
                        loading={priority ? "eager" : "lazy"}
                        fetchPriority={priority ? "low" : undefined}
                        decoding="async"
                        className="absolute inset-0 h-full w-full scale-110 object-cover"
                    />
                </div>

                {/* Layer 2 — sharp foreground image with Padding */}
                <div
                    className="relative z-10 flex h-full flex-col justify-center px-[clamp(2rem,8vw,5rem)] py-14 sm:px-[clamp(3rem,9vw,6rem)] xl:px-[clamp(7rem,8.2vw,10rem)] xl:py-24"
                >
                    <div className="relative aspect-[16/11] w-full overflow-hidden rounded-[5px] transition-transform duration-300 ease-out group-hover:scale-[1.015]">
                        <img
                            src={location.displayImage ?? location.image}
                            alt={location.name}
                            loading={priority ? "eager" : "lazy"}
                            fetchPriority={priority ? "low" : undefined}
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover"
                        />
                    </div>
                </div>
            </div>

            {/* TEXT CONTENT (Outside the image container as per SS1) */}
            <div className="flex items-start justify-between px-2 xl:px-3">
                <div className="flex flex-col gap-1">
                    <h3 className="font-bdo text-[clamp(1.02rem,1.04vw,1.22rem)] font-semibold leading-tight tracking-[-0.035em] text-black">
                        {location.name}
                    </h3>
                    <p className="font-bdo text-[clamp(0.78rem,0.86vw,0.98rem)] font-normal tracking-[-0.02em] text-gray-500">
                        {location.category}
                    </p>
                </div>

                <div className="flex flex-shrink-0 items-center justify-center pr-1 pt-0.5">
                    <CornerArrow />
                </div>
            </div>
        </div>
    );
}

export default function SectionThree() {
    const [activeLocationIndex, setActiveLocationIndex] = useState(0);

    useEffect(() => {
        const firstLocation = VISIBLE_LOCATIONS[0];
        if (!firstLocation) return;

        const sources = [
            firstLocation.backdropImage,
            firstLocation.displayImage,
        ].filter((source): source is string => Boolean(source));
        const images: HTMLImageElement[] = [];

        const timer = window.setTimeout(() => {
            sources.forEach((source) => {
                const image = new Image();
                image.decoding = "async";
                image.src = source;
                images.push(image);
                void image.decode().catch(() => {});
            });
        }, 900);

        return () => {
            window.clearTimeout(timer);
            images.forEach((image) => {
                image.src = "";
            });
        };
    }, []);

    return (
        <section
            id="locations"
            className="section-three-performance w-full bg-[#F5F7F9] pb-16 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14"
        >
            <div className="section-three-entrance-divider mx-auto px-[clamp(1.5rem,4.5vw,5.5rem)]">
                <SectionDivider
                    number="02"
                    title="Lokasi Kami"
                    subtitle="01 homepage"
                    theme="light"
                    outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                    contentClassName="px-3"
                />
            </div>

            <div className="mx-auto mt-12 hidden items-center gap-3 px-[clamp(1.5rem,4.5vw,5.5rem)] md:mt-14 lg:mt-16 xl:flex">
                <span className="section-label-diamond" />
                <ScrollTextReveal
                    delay={80}
                    className="font-bdo text-[1.25rem] font-medium tracking-[-0.025em] text-black"
                >
                    Eksplorasi Cabang Kami
                </ScrollTextReveal>
            </div>

            <div className="mx-auto mt-10 flex flex-col gap-0 px-[clamp(1.5rem,4.5vw,5.5rem)] sm:mt-12 sm:gap-6 md:mt-14 lg:mt-16 xl:mt-[4.6rem] xl:grid xl:grid-cols-[16rem_minmax(0,1fr)_14rem] xl:items-start xl:gap-[clamp(5rem,6.7vw,8rem)]">
                {/* Left — label static (scrolls away); badge viewport-center sticky */}
                <div className="xl:self-stretch">
                    <div className="flex items-center gap-4 xl:hidden">
                        <span className="section-label-diamond" />
                        <ScrollTextReveal
                            delay={80}
                            className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
                        >
                            Eksplorasi Cabang Kami
                        </ScrollTextReveal>
                    </div>
                    <div className="mt-6 sm:mt-5 xl:hidden">
                        <BranchCounter
                            activeIndex={activeLocationIndex}
                            total={VISIBLE_LOCATIONS.length}
                            compact
                        />
                    </div>
                    <div className="hidden xl:block xl:sticky xl:top-[50vh] xl:-translate-y-1/2 xl:mt-[12rem]">
                        <BranchCounter
                            activeIndex={activeLocationIndex}
                            total={VISIBLE_LOCATIONS.length}
                        />
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
                                    <div className="rounded-[5px] bg-[#F5F7F9]">
                                        {" "}
                                        {/* Background matching the section for clean stack */}
                                        <LocationCard
                                            location={loc}
                                            priority={index === 0}
                                            revealDelay={index * 90}
                                        />
                                    </div>
                                </ScrollStackItem>
                            ))}
                        </ScrollStack>
                    </div>
                </div>

                <div className="mt-9 font-bdo text-[clamp(1.24rem,4vw,1.5rem)] font-medium leading-tight text-black sm:mt-0 xl:hidden">
                    <ScrollTextReveal as="h2" delay={90}>
                        Pusat Olahraga saat ini
                    </ScrollTextReveal>
                    <ScrollTextReveal as="h2" delay={155}>
                        ada di Berbagai Lokasi
                    </ScrollTextReveal>
                </div>

                {/* Right — viewport-center sticky with initial offset */}
                <div className="hidden xl:flex xl:w-56 xl:flex-shrink-0 xl:self-stretch flex-col">
                    <div className="xl:sticky xl:top-[50vh] xl:-translate-y-1/2 xl:mt-[12rem]">
                        <ScrollTextReveal
                            as="h2"
                            split="words"
                            delay={90}
                            stagger={24}
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
