import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEmblaNav } from "@/hooks/useEmblaNav";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import NewsCard from "@/Components/Landing/NewsCard";
import type { NewsItem } from "@/Components/Landing/NewsCard";

const DUMMY_NEWS: NewsItem[] = [
    {
        id: 1,
        title: "Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir",
        date: "26.02.2026",
        category: "Berita",
        image: "/assets/images/comingsoon.avif",
    },
    {
        id: 2,
        title: "Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir",
        date: "26.02.2026",
        category: "Artikel",
        image: "/assets/images/comingsoon.avif",
    },
    {
        id: 3,
        title: "Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir",
        date: "24.02.2026",
        category: "Berita",
        image: "/assets/images/comingsoon.avif",
    },
    {
        id: 4,
        title: "Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir",
        date: "22.02.2026",
        category: "Artikel",
        image: "/assets/images/comingsoon.avif",
    },
    {
        id: 5,
        title: "Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir",
        date: "20.02.2026",
        category: "Berita",
        image: "/assets/images/comingsoon.avif",
    },
    {
        id: 6,
        title: "Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir",
        date: "18.02.2026",
        category: "Artikel",
        image: "/assets/images/comingsoon.avif",
    },
    {
        id: 7,
        title: "Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir",
        date: "18.02.2026",
        category: "Artikel",
        image: "/assets/images/comingsoon.avif",
    },
];

interface NewsSectionProps {
    news?: NewsItem[];
}

function NewsNavButtons({
    onPrevious,
    onNext,
}: {
    onPrevious: () => void;
    onNext: () => void;
}) {
    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={onPrevious}
                aria-label="Previous articles"
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-black text-black transition-colors duration-200 hover:bg-gray-100"
            >
                <ChevronLeft size={20} />
            </button>
            <button
                type="button"
                onClick={onNext}
                aria-label="Next articles"
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-black text-white transition-colors duration-200 hover:bg-gray-800"
            >
                <ChevronRight size={20} />
            </button>
        </div>
    );
}

export default function NewsSection({ news = DUMMY_NEWS }: NewsSectionProps) {
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        dragFree: true,
    });

    const { scrollPrev, scrollNext } = useEmblaNav(emblaApi);

    return (
        <section className="w-full bg-[#F5F7F9] pb-16 pt-10 text-black sm:pb-20 sm:pt-14 xl:pb-[72px] xl:pt-[58px]">
            <div className="px-[clamp(1.5rem,4.5vw,5.5rem)]">
                <SectionDivider
                    number="04"
                    title="Berita"
                    subtitle="01 homepage"
                    theme="light"
                />
            </div>

            <h2 className="mt-12 px-[clamp(1.5rem,4.5vw,5.5rem)] font-bdo text-[clamp(2rem,2.75vw,52px)] font-semibold leading-[1.05] tracking-[-0.035em] text-black sm:mt-16 xl:mt-[76px]">
                Berita & Artikel
            </h2>

            <div className="mx-auto mb-12 mt-12 hidden grid-cols-[minmax(250px,1fr)_minmax(430px,1.35fr)_minmax(150px,.72fr)] items-end gap-8 px-[clamp(1.5rem,4.5vw,5.5rem)] xl:grid xl:mb-[96px] xl:mt-[112px]">
                <div className="max-w-[520px]">
                    <ReservasiButton
                        href="/coming-soon"
                        label="Lihat Berita Lainnya"
                    />
                </div>
                <p className="max-w-[640px] justify-self-center font-bdo text-[clamp(1.25rem,1.55vw,1.875rem)] font-light leading-[1.28] tracking-[-0.025em] text-black">
                    Komitmen kami adalah menghadirkan{" "}
                    <strong className="font-medium">
                        ekosistem
                        <br />
                        olahraga yang inklusif.
                    </strong>
                </p>
                <div className="justify-self-end">
                    <NewsNavButtons onPrevious={scrollPrev} onNext={scrollNext} />
                </div>
            </div>

            <div className="mb-10 mt-10 flex flex-col gap-8 px-[clamp(1.5rem,4.5vw,5.5rem)] xl:hidden">
                <p className="font-bdo text-base font-light leading-[1.35] tracking-[-0.02em] text-black sm:text-lg">
                        Komitmen kami adalah menghadirkan
                        <br />
                        <strong className="font-medium">
                            ekosistem olahraga yang inklusif.
                        </strong>
                </p>
                <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <ReservasiButton
                            href="/coming-soon"
                            label="Lihat Berita Lainnya"
                        />
                    </div>
                    <NewsNavButtons onPrevious={scrollPrev} onNext={scrollNext} />
                </div>
            </div>

            <div className="overflow-hidden px-[clamp(1.5rem,4.5vw,5.5rem)]" ref={emblaRef}>
                <div className="flex gap-[30px]">
                    {news.map((item, i) => (
                        <NewsCard
                            key={item.id}
                            {...item}
                            index={i}
                            className="h-[430px] w-[300px] flex-shrink-0 sm:h-[500px] sm:w-[360px] xl:h-[530px] xl:w-[414px]"
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
