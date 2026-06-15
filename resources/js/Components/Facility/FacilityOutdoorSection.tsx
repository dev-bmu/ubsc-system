import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import FacilityBadge from "@/Components/Landing/FacilityBadge";

export interface OutdoorFacility {
    id: string | number;
    name: string;
    category: string;
    image: string;
    location?: string | null;
    venueType?: string | null;
    mapLink?: string | null;
}

const MARQUEE_ITEMS = Array(40).fill(null);

const DUMMY_OUTDOOR_FACILITIES: OutdoorFacility[] = [
    {
        id: "1",
        name: "Lapangan Sepak Bola Dieng",
        category: "Arena Luar Terbuka",
        image: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
    },
    {
        id: "2",
        name: "Lapangan Tenis Veteran",
        category: "Fasilitas Outdoor Utama",
        image: "/assets/images/fasilitas-bulutangkis-ub-sport-center.avif",
    },
    {
        id: "3",
        name: "Lapangan Futsal Dieng",
        category: "Arena Luar Terbuka",
        image: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
    },
    {
        id: "4",
        name: "Lapangan Basket Veteran",
        category: "Arena Outdoor",
        image: "/assets/images/fasilitas-bulutangkis-ub-sport-center.avif",
    },
    {
        id: "5",
        name: "Lapangan Voli Outdoor",
        category: "Arena Outdoor",
        image: "/assets/images/fasilitas-yoga-ub-sport-center.avif",
    },
    {
        id: "6",
        name: "Arena Serbaguna",
        category: "Fasilitas Outdoor",
        image: "/assets/images/fasilitas-aerobik-ub-sport-center.avif",
    },
];

interface FacilityOutdoorSectionProps {
    sectionNumber?: string;
    sectionTitle?: string;
    sectionSubtitle?: string;
    facilities?: OutdoorFacility[];
    totalFacilitiesCount?: number;
    isLandingPage?: boolean;
}

function OutdoorFacilityCard({
    facility,
    index,
}: {
    facility: OutdoorFacility;
    index: number;
}) {
    const displayName = facility.name || "Nama Fasilitas";

    return (
        <a
            href={facility.mapLink ?? "#"}
            target={facility.mapLink ? "_blank" : undefined}
            rel={facility.mapLink ? "noopener noreferrer" : undefined}
            className="group block w-[calc(100vw-37px)] shrink-0 overflow-hidden rounded-[5px] bg-[#f7f7f7] p-[5px] text-black md:w-[min(876px,57.05vw)] md:rounded-[12px] md:p-[10px]"
        >
            <div className="flex h-[33px] items-center justify-between gap-3 px-[12px] md:h-[67px] md:gap-4 md:px-[30px]">
                <div className="flex min-w-0 items-center gap-2.5 md:gap-5">
                    <span className="flex shrink-0 items-center gap-1 md:gap-1.5">
                        <span className="h-[4px] w-[4px] rounded-full bg-[#dce1e5] md:h-[10px] md:w-[10px]" />
                        <span className="h-[4px] w-[4px] rounded-full bg-[#15678D] md:h-[10px] md:w-[10px]" />
                    </span>
                    <h3 className="truncate font-bdo text-[15px] font-semibold leading-none tracking-[-0.055em] md:text-[clamp(1.45rem,1.48vw,1.875rem)]">
                        /{displayName}.
                    </h3>
                </div>
                <span className="shrink-0 font-bdo text-[11px] font-normal tracking-[-0.035em] text-black/55 md:text-[clamp(0.95rem,0.9vw,1.05rem)]">
                    /Outdoor {String(index + 1).padStart(3, "0")}/
                </span>
            </div>

            <div className="relative h-[432px] overflow-hidden rounded-[3px] bg-slate-200 md:aspect-[2.04/1] md:h-auto md:rounded-[8px]">
                <img
                    src={facility.image}
                    alt={facility.name}
                    className="h-full w-full object-cover object-center transition duration-700 ease-out group-hover:scale-[1.025] md:group-hover:scale-[1.035]"
                    loading={index < 2 ? "eager" : "lazy"}
                />
                <div className="absolute right-[13px] top-[17px] [&>div]:rounded-[4px] [&>div]:border-2 [&_span]:text-[10px] md:right-[3%] md:top-[6.6%] md:[&>div]:rounded-[7px] md:[&>div]:border-[3px] md:[&_span]:text-[16px]">
                    <FacilityBadge
                        location={facility.location ?? "Dieng"}
                        category={
                            facility.venueType ??
                            facility.category ??
                            "Outdoor Facility"
                        }
                        variant="blue-red"
                    />
                </div>
            </div>
        </a>
    );
}

export default function FacilityOutdoorSection({
    facilities,
    totalFacilitiesCount,
    isLandingPage = false,
}: FacilityOutdoorSectionProps = {}) {
    const activeFacilities =
        facilities && facilities.length > 0
            ? facilities
            : DUMMY_OUTDOOR_FACILITIES;
    const renderedItems = isLandingPage
        ? activeFacilities.slice(0, 4)
        : activeFacilities;
    const remainingOutdoorCount = Math.max(
        0,
        (totalFacilitiesCount ?? activeFacilities.length) -
            renderedItems.length,
    );

    const sectionRef = useRef<HTMLElement>(null);
    const stickyRef = useRef<HTMLDivElement>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const scrollDistanceRef = useRef(0);
    const frameRef = useRef(0);

    useEffect(() => {
        const section = sectionRef.current;
        const sticky = stickyRef.current;
        const scroller = scrollerRef.current;
        const track = trackRef.current;
        if (!section || !sticky || !scroller || !track) return;

        const applyScrollProgress = () => {
            frameRef.current = 0;

            const distance = scrollDistanceRef.current;
            if (distance <= 0) {
                track.style.transform = "translate3d(0, 0, 0)";
                return;
            }

            const sectionTop = section.getBoundingClientRect().top;
            const progress = Math.max(0, Math.min(1, -sectionTop / distance));
            track.style.transform = `translate3d(${-distance * progress}px, 0, 0)`;
        };

        const requestApplyScrollProgress = () => {
            if (frameRef.current) return;
            frameRef.current =
                window.requestAnimationFrame(applyScrollProgress);
        };

        const measure = () => {
            const distance = Math.max(
                0,
                track.scrollWidth - scroller.clientWidth,
            );
            const stickyH = sticky.offsetHeight;

            scrollDistanceRef.current = distance;
            section.style.height = `${stickyH + distance}px`;
            section.style.setProperty(
                "--outdoor-scroll-distance",
                `${distance}px`,
            );
            applyScrollProgress();
        };

        measure();
        window.addEventListener("resize", measure, { passive: true });
        window.addEventListener("scroll", requestApplyScrollProgress, {
            passive: true,
        });

        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener(
                "scroll",
                requestApplyScrollProgress,
            );
            section.style.removeProperty("height");
            track.style.removeProperty("transform");
            if (frameRef.current) {
                window.cancelAnimationFrame(frameRef.current);
            }
        };
    }, [renderedItems.length]);

    return (
        <section
            ref={sectionRef}
            id="facility-outdoor"
            className="relative bg-[#242424]"
        >
            <div
                ref={stickyRef}
                className="sticky top-0 flex h-[100svh] flex-col overflow-hidden bg-[#242424]"
            >
                <div className="relative overflow-hidden border-b border-white/10 bg-black py-[14px] md:py-[18px]">
                    <motion.div
                        className="flex items-center"
                        animate={{ x: ["0%", "-50%"] }}
                        transition={{
                            repeat: Infinity,
                            ease: "linear",
                            duration: 30,
                        }}
                    >
                        {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((_, i) => (
                            <span
                                key={i}
                                className="shrink-0 pr-9 font-clash text-[10px] font-semibold uppercase tracking-widest text-white sm:text-[12px] md:pr-12 lg:text-[16px]"
                            >
                                UBSC
                            </span>
                        ))}
                    </motion.div>
                </div>

                <div className="mx-auto grid w-full max-w-[1920px] grid-cols-[1fr_auto] items-center gap-x-6 px-[18px] pb-[clamp(2.2rem,4.5vh,3.2rem)] pt-[clamp(1.8rem,3.8vh,2.6rem)] text-white md:grid-cols-3 md:px-[clamp(1.75rem,4.65vw,5.55rem)] md:pb-[clamp(3rem,5.5vh,4rem)] md:pt-[clamp(2.6rem,4.8vh,3.5rem)]">
                    <div className="flex items-center gap-3 md:gap-5">
                        <span className="section-label-diamond" />
                        <span className="font-bdo text-[14px] font-medium tracking-[-0.035em] md:text-[clamp(1.35rem,1.35vw,1.75rem)]">
                            Arena Terbuka
                        </span>
                    </div>

                    <span className="hidden justify-self-center font-bdo text-[clamp(1rem,1vw,1.25rem)] font-light tracking-[-0.02em] text-white/72 md:block">
                        (Fasilitas)
                    </span>

                    <a
                        href="/facilities"
                        className="group flex items-center justify-self-end font-bdo text-[11px] tracking-[-0.025em] text-white/86 md:text-[clamp(1.05rem,1vw,1.35rem)]"
                    >
                        <span className="underline decoration-white/70 underline-offset-4">
                            <span className="font-light">
                                {remainingOutdoorCount}
                            </span>{" "}
                            <span className="font-normal">Lainnya</span>
                        </span>
                        <span className="ml-2 text-[1.2em] leading-none transition-transform duration-300 group-hover:translate-x-1">
                            ›
                        </span>
                    </a>
                </div>

                <div
                    ref={scrollerRef}
                    className="facility-outdoor-scroller min-h-0 flex-1 overflow-hidden pb-[clamp(1.8rem,3.8vh,2.5rem)] pt-[clamp(0.8rem,1.8vh,1.3rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    <div
                        ref={trackRef}
                        className="flex items-center gap-[9px] px-[18px] will-change-transform md:gap-5 md:px-[clamp(1.75rem,4.65vw,5.55rem)]"
                    >
                        {renderedItems.map((facility, index) => (
                            <OutdoorFacilityCard
                                key={facility.id}
                                facility={facility}
                                index={index}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
