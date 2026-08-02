import { ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import { useEmblaNav } from "@/hooks/useEmblaNav";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import NewsCard from "@/Components/Landing/NewsCard";
import type { NewsItem } from "@/Components/Landing/NewsCard";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import { useEffect, useRef } from "react";

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

export default function NewsSection({ news = DUMMY_NEWS }: NewsSectionProps) {
    const sectionRef = useRef<HTMLElement>(null);
    const entranceReady = useHomepageEntranceReady();
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        dragFree: true,
    });

    const { scrollPrev, scrollNext } = useEmblaNav(emblaApi);

    useEffect(() => {
        if (!entranceReady) return;

        const section = sectionRef.current;
        if (!section) return;

        let completeTimer = 0;
        const reveal = () => {
            section.classList.add("is-visible");
            completeTimer = window.setTimeout(
                () => section.classList.add("is-complete"),
                2200,
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
                threshold: 0.035,
                rootMargin: "0px 0px -5% 0px",
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
            className="news-entrance-stage w-full bg-[#F3F6F8] pb-20 pt-14 text-black md:pb-24 md:pt-16 xl:pb-[6.4rem] xl:pt-[3.55rem]"
        >
            <div className="mx-auto flex w-full max-w-[1920px] flex-col px-[clamp(1.5rem,4.5vw,5.5rem)]">
                <div>
                    <SectionDivider
                        number="04"
                        title="Berita"
                        subtitle="01 homepage"
                        theme="light"
                        outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                        contentClassName="px-3"
                    />
                </div>

                <h2 className="home-section-heading news-entrance-reveal news-entrance-reveal--title mt-12 font-bdo text-[clamp(2.35rem,4.15vw,5rem)] font-semibold leading-[1.02] tracking-[-0.055em] text-black md:mt-14 xl:mt-[4.35rem] xl:text-[clamp(3.25rem,3.1vw,3.75rem)]">
                    Berita &amp; Artikel
                </h2>

                <div className="news-entrance-reveal news-entrance-reveal--actions mb-12 mt-12 grid grid-cols-1 items-center gap-8 md:mt-16 md:grid-cols-12 xl:mb-[4.5rem] xl:mt-[7.05rem]">
                    <div className="md:col-span-4">
                        <ReservasiButton
                            label="Lihat Berita Lainnya"
                            href="/coming-soon"
                            size="compact"
                        />
                    </div>

                    <div className="md:col-span-5 md:justify-self-center">
                        <p className="max-w-[540px] font-bdo text-[clamp(1.2rem,1.45vw,1.875rem)] font-light leading-[1.24] tracking-[-0.035em] text-black">
                            Komitmen kami adalah menghadirkan{" "}
                            <strong className="font-medium">
                                ekosistem
                                <br className="hidden md:block" />
                                olahraga yang inklusif.
                            </strong>
                        </p>
                    </div>

                    <div className="flex items-center gap-[0.65rem] md:col-span-3 md:justify-self-end lg:gap-3">
                        <button
                            type="button"
                            onClick={scrollPrev}
                            aria-label="Previous articles"
                            className="flex h-12 w-12 flex-shrink-0 items-center justify-center border border-black text-black transition-colors duration-200 hover:bg-black hover:text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-300 xl:h-[60px] xl:w-[60px]"
                        >
                            <ChevronLeft className="h-5 w-5 xl:h-7 xl:w-7" />
                        </button>
                        <button
                            type="button"
                            onClick={scrollNext}
                            aria-label="Next articles"
                            className="flex h-12 w-12 flex-shrink-0 items-center justify-center bg-black text-white transition-colors duration-200 hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 xl:h-[60px] xl:w-[60px]"
                        >
                            <ChevronRight className="h-5 w-5 xl:h-7 xl:w-7" />
                        </button>
                    </div>
                </div>

                <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex gap-6">
                        {news.map((item, i) => (
                            <NewsCard
                                key={item.id}
                                {...item}
                                index={i}
                                priority={false}
                                entranceIndex={i < 4 ? i : undefined}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
