import { ArrowRight } from "lucide-react";
import NewsCard from "@/Components/Landing/NewsCard";
import type { NewsItem } from "@/Components/Landing/NewsCard";
import SectionDivider from "@/Components/Landing/SectionDivider";
import NewsHeroBg from "@/../assets/images/news-hero.avif";

interface DummyArtikelItem extends NewsItem {
    description: string;
}

const DUMMY_ARTIKEL: DummyArtikelItem[] = Array.from(
    { length: 7 },
    (_, idx) => ({
        id: idx + 1,
        title: "Raih Performa Terbaik Dengan Paket Fasilitas Unggulan",
        description:
            "Streaming is transforming how we watch movies and TV. Explore trends shaping 2025, including......",
        date: "26.02.2026",
        category: "Artikel",
        image: idx === 0 ? NewsHeroBg : "/assets/images/comingsoon.avif",
    }),
);

const SECTION_CONTAINER_CLASS =
    "mx-auto px-6 sm:px-10 xl:px-[clamp(70px,4.53vw,87px)]";
const CARD_FEATURED_CLASS =
    "w-full aspect-[857/529] md:col-span-2 xl:col-span-2";
const CARD_STANDARD_CLASS = "w-full aspect-[413/529]";
const CARD_GRID_CLASS =
    "grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-[clamp(24px,1.56vw,30px)]";

export default function ServicesSectionArtikel({
    articles,
}: {
    articles?: DummyArtikelItem[];
}) {
    const activeArticles =
        articles && articles.length > 0 ? articles : DUMMY_ARTIKEL;
    const [featured, ...rest] = activeArticles;

    return (
        <section
            className="overflow-x-clip bg-[#F5F7F9] py-12"
            id="artikel-content"
        >
            <div className={SECTION_CONTAINER_CLASS}>
                <SectionDivider
                    number="02"
                    title="Artikel Kami"
                    subtitle="News page /02"
                    theme="light"
                />

                <div className="mb-8 mt-10 flex flex-col justify-between gap-3 xl:mb-12 xl:flex-row xl:items-end xl:gap-0">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="size-[14px] flex-shrink-0 rounded-[5px] bg-[#ff0000] xl:size-[17px]" />
                            <span className="font-bdo text-[clamp(1rem,1.25vw,1.5rem)] font-normal text-black">
                                Artikel Terbaru Kami
                            </span>
                        </div>
                        <h2 className="mt-10 font-bdo text-[clamp(2rem,2.7vw,52px)] font-medium leading-[1.1] tracking-[-0.021em] text-black">
                            Artikel Terkini Kami
                        </h2>
                    </div>
                    <a
                        href="#"
                        className="hidden items-center gap-2 font-bdo text-[clamp(1rem,1.25vw,24px)] font-normal text-[#ff0000] transition-all duration-300 hover:gap-3 xl:flex xl:flex-shrink-0"
                    >
                        Lihat Selengkapnya
                        <ArrowRight size={18} />
                    </a>
                </div>

                <div className={`${CARD_GRID_CLASS} pb-12`}>
                    <NewsCard
                        {...featured}
                        index={0}
                        layoutOverride="artikel"
                        className={CARD_FEATURED_CLASS}
                        variant="news-page"
                        featured
                    />

                    <div className="flex justify-end md:hidden">
                        <a
                            href="#"
                            className="flex items-center gap-2 font-bdo text-sm font-normal text-[#ff0000] transition-all duration-300 hover:gap-3"
                        >
                            Lihat Selengkapnya
                            <ArrowRight size={16} />
                        </a>
                    </div>

                    {rest.map((item, idx) => (
                        <NewsCard
                            key={item.id}
                            {...item}
                            index={idx + 1}
                            layoutOverride="artikel"
                            className={CARD_STANDARD_CLASS}
                            variant="news-page"
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
