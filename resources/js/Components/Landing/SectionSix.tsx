import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import PriceCard from "@/Components/Landing/PriceCard";
import type { PriceItem } from "@/Components/Landing/PriceCard";

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

    return (
        <section id="pricing" className="w-full bg-white pb-12 pt-12 xl:pb-12">
            <div className="mx-auto w-full px-6 sm:px-10 xl:px-[55px]">
                <SectionDivider
                    number="06"
                    title="Daftar harga"
                    subtitle="01 homepage"
                    theme="light"
                />

                <div className="mt-10 grid grid-cols-1 gap-12 md:mt-16 xl:grid-cols-[minmax(0,555px)_minmax(0,1fr)] xl:gap-[80px] xl:px-8">
                    <div className="flex min-w-0 flex-col">
                        <div className="flex items-center gap-4 xl:gap-3">
                            <span className="section-label-diamond" />
                            <span className="font-bdo text-[clamp(1.16rem,1.32vw,1.6rem)] font-medium tracking-[-0.025em] text-black">
                                Tarif Lapangan
                            </span>
                        </div>

                        <h2 className="mt-7 max-w-[555px] font-bdo text-[clamp(2rem,4.7vw,3.5rem)] font-semibold leading-[1.12] tracking-[-0.021em] text-gray-950 xl:text-[clamp(2.65rem,2.92vw,3.5rem)]">
                            Raih Performa
                            <br className="hidden xl:block" /> Terbaik Dengan Paket
                            <br className="hidden xl:block" /> Fasilitas Unggulan
                        </h2>

                        <p className="mt-7 max-w-[550px] font-bdo text-base font-regular leading-[1.3] text-black/65 xl:text-[clamp(1rem,1.15vw,1.38rem)]">
                            Penyewaan arena olahraga standar profesional untuk
                            kebutuhan tim dan komunitas Anda.
                        </p>

                        <div className="mb-9 mt-6 w-full border-t border-black/20" />

                        <div className="flex flex-col gap-6">
                            <FeatureItem label="Cabang Olahraga Lengkap" />
                            <FeatureItem label="Fasilitas Standar Atlet" />
                        </div>

                        <div className="mt-12 flex items-center justify-between gap-6 xl:mt-auto">
                            <ReservasiButton label="Mulai Reservasi" />

                            <div className="flex flex-shrink-0 items-center gap-5">
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

                    <div className="grid min-w-0 grid-cols-1 content-start items-start gap-4 md:grid-cols-2 xl:grid-cols-1">
                        {visiblePrices.map((item) => (
                            <PriceCard key={item.id} item={item} />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
