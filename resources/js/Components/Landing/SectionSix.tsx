import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import PriceCard from "@/Components/Landing/PriceCard";
import type { PriceItem } from "@/Components/Landing/PriceCard";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";

const PAGE_SIZE = 4;

interface BackendFacility {
    id: number;
    name: string;
    image: string;
    rating?: number | null;
    price_range?: string | null;
}

function facilitiesToPriceItems(facilities: BackendFacility[]): PriceItem[] {
    return facilities.map((f) => ({
        id: f.id,
        title: f.name,
        image: f.image || "/assets/images/comingsoon.avif",
        rating: f.rating ?? 5,
        price: f.price_range || "Harga belum tersedia",
    }));
}

function FeatureItem({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3.5">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#15678D] text-white xl:h-[25px] xl:w-[25px]">
                <svg
                    width="8"
                    height="8"
                    viewBox="0 0 12 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path
                        d="M6 1V11M1 6H11"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
            <span className="font-bdo text-sm font-regular leading-none text-black sm:text-base xl:text-[clamp(1rem,1.12vw,1.35rem)]">
                {label}
            </span>
        </div>
    );
}

interface SectionSixProps {
    facilities?: BackendFacility[];
}

export default function SectionSix({ facilities = [] }: SectionSixProps) {
    const entranceReady = useHomepageEntranceReady();
    const sectionRef = useRef<HTMLElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const prices: PriceItem[] = facilitiesToPriceItems(facilities);
    const totalPages = Math.ceil(prices.length / PAGE_SIZE);
    const [page, setPage] = useState(0);
    const visiblePrices = prices.slice(
        page * PAGE_SIZE,
        page * PAGE_SIZE + PAGE_SIZE,
    );

    const scrollPrev = () => setPage((p) => Math.max(0, p - 1));
    const scrollNext = () => setPage((p) => Math.min(totalPages - 1, p + 1));

    const prevDisabled = page === 0;
    const nextDisabled = page >= totalPages - 1;

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || !entranceReady || isVisible) return;

        const reveal = () => setIsVisible(true);

        if (
            !("IntersectionObserver" in window) ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            reveal();
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                reveal();
                observer.disconnect();
            },
            {
                threshold: 0.08,
                rootMargin: "0px 0px -8% 0px",
            },
        );

        observer.observe(section);
        return () => observer.disconnect();
    }, [entranceReady, isVisible]);

    useEffect(() => {
        if (!isVisible) return;

        const timer = window.setTimeout(() => setIsComplete(true), 1200);
        return () => window.clearTimeout(timer);
    }, [isVisible]);

    return (
        <section
            ref={sectionRef}
            id="pricing"
            className={`section-six-entrance w-full bg-white pb-12 pt-12 xl:pb-12 ${isVisible ? "is-visible" : ""} ${isComplete ? "is-complete" : ""}`}
        >
            <div className="mx-auto w-full px-6 sm:px-10 xl:px-[55px]">
                <SectionDivider
                    number="06"
                    title="Daftar harga"
                    subtitle="01 homepage"
                    theme="light"
                    outerClassName="section-six-reveal section-six-reveal--divider -mx-[clamp(0rem,1.65vw,2rem)]"
                    contentClassName="px-3"
                />

                <div className="mt-10 grid grid-cols-1 gap-12 md:mt-16 xl:grid-cols-[minmax(0,555px)_minmax(0,1fr)] xl:gap-[80px] xl:px-8">
                    <div className="flex min-w-0 flex-col">
                        <div className="section-six-reveal section-six-reveal--eyebrow flex items-center gap-4 xl:gap-3">
                            <span className="section-label-diamond" />
                            <span className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.6rem)] font-medium tracking-[-0.025em] text-black">
                                Tarif Lapangan
                            </span>
                        </div>

                        <h2
                            aria-label="Raih Performa Terbaik Dengan Paket Fasilitas Unggulan"
                            className="home-section-heading home-section-six-headline section-six-reveal section-six-reveal--headline section-two-headline-weight mt-7 max-w-[555px] font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-gray-950 md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
                        >
                            {[
                                "Raih Performa",
                                "Terbaik Dengan Paket",
                                "Fasilitas Unggulan",
                            ].map((line, index) => (
                                <span
                                    key={line}
                                    aria-hidden
                                    className="block overflow-visible"
                                >
                                    <ScrollTextReveal
                                        delay={110 + index * 95}
                                        className="-mb-[0.14em] pb-[0.14em] pr-[0.08em]"
                                    >
                                        {line}
                                    </ScrollTextReveal>
                                </span>
                            ))}
                        </h2>

                        <p className="section-six-reveal section-six-reveal--copy mt-7 max-w-[550px] font-bdo text-base font-regular leading-[1.3] tracking-[-0.005em] text-black/65 xl:text-[clamp(0.95rem,1.0925vw,1.311rem)]">
                            Penyewaan arena olahraga standar profesional untuk
                            kebutuhan tim dan komunitas Anda.
                        </p>

                        <div className="section-six-reveal section-six-reveal--rule mb-9 mt-6 w-full border-t border-black/20" />

                        <div className="section-six-reveal section-six-reveal--features flex flex-col gap-6">
                            <FeatureItem label="Cabang Olahraga Lengkap" />
                            <FeatureItem label="Fasilitas Standar Atlet" />
                        </div>

                        <div className="section-six-reveal section-six-reveal--actions mt-12 flex items-center justify-between gap-6 xl:mt-auto">
                            <ReservasiButton label="Mulai Reservasi" />

                            <div className="flex flex-shrink-0 items-center gap-[0.65rem] lg:gap-3">
                                <button
                                    type="button"
                                    onClick={scrollPrev}
                                    disabled={prevDisabled}
                                    aria-label="Previous"
                                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-black text-black transition-colors duration-200 hover:bg-gray-100 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-300 xl:h-[60px] xl:w-[60px]"
                                >
                                    <ChevronLeft className="h-5 w-5 xl:h-7 xl:w-7" />
                                </button>
                                <button
                                    type="button"
                                    onClick={scrollNext}
                                    disabled={nextDisabled}
                                    aria-label="Next"
                                    className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors duration-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 xl:h-[60px] xl:w-[60px]"
                                >
                                    <ChevronRight className="h-5 w-5 xl:h-7 xl:w-7" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid min-w-0 grid-cols-1 content-start items-start gap-4 md:grid-cols-2 xl:min-h-[528px] xl:grid-cols-1">
                        {visiblePrices.map((item, index) => (
                            <div
                                key={item.id}
                                className="section-six-reveal section-six-reveal--card"
                                style={
                                    {
                                        "--section-six-reveal-delay": `${150 + index * 70}ms`,
                                    } as CSSProperties
                                }
                            >
                                <PriceCard item={item} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
