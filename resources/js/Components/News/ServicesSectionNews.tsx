import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import NewsCard from "@/Components/Landing/NewsCard";
import type { NewsItem } from "@/Components/Landing/NewsCard";
import CurvedLoop from "@/Components/Landing/CurvedLoop";
import person from "@/../assets/images/person.avif";
import bg from "@/../assets/images/bg-about.avif";
import SectionDivider from "../Landing/SectionDivider";
import NewsHeroBg from "@/../assets/images/news-hero.avif";

interface DummyNewsItem extends NewsItem {
    description: string;
}

const DUMMY_NEWS: DummyNewsItem[] = Array.from({ length: 6 }, (_, idx) => ({
    id: idx + 1,
    title: "Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir",
    description:
        "Streaming is transforming how we watch movies and TV. Explore trends shaping 2025, including......",
    date: "26.02.2026",
    category: "Berita",
    image: idx === 0 ? NewsHeroBg : "/assets/images/comingsoon.avif",
}));

const SECTION_CONTAINER_CLASS =
    "mx-auto px-6 py-8 sm:px-10 sm:py-12 xl:px-[clamp(70px,4.53vw,87px)]";
const CARD_FEATURED_CLASS =
    "w-full aspect-[857/529] md:col-span-2 xl:col-span-2";
const CARD_STANDARD_CLASS = "w-full aspect-[413/529]";
const CARD_GRID_CLASS =
    "grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-[clamp(24px,1.56vw,30px)]";

function useResponsiveCurve(mobile: number, desktop: number): number {
    const [curve, setCurve] = useState<number>(() =>
        typeof window !== "undefined" && window.innerWidth < 1280
            ? mobile
            : desktop,
    );

    useEffect(() => {
        const update = () =>
            setCurve(window.innerWidth < 1280 ? mobile : desktop);
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, [mobile, desktop]);

    return curve;
}

export default function ServicesSectionNews({
    news,
}: {
    news?: DummyNewsItem[];
}) {
    const curveAmount = useResponsiveCurve(120, 200);
    const activeNews = news && news.length > 0 ? news : DUMMY_NEWS;
    const [featured, standard, ...bottom4] = activeNews;

    const unggulanBg = {
        background:
            "linear-gradient(266deg, #15678d 3%, #173859 61%, #002244 97%)",
    } as const;

    const unggulanCard = (
        <div
            className={`${CARD_STANDARD_CLASS} flex flex-col overflow-hidden p-6`}
            style={unggulanBg}
        >
            <div className="mb-2 flex items-center justify-center gap-2">
                <p className="text-center font-bdo text-xs font-medium text-white xl:text-sm">
                    Unggulan Kami
                </p>
            </div>
            <p className="text-center font-bdo text-sm font-medium leading-snug text-white xl:text-base">
                Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir
            </p>
            <div className="mt-4 flex-1 overflow-hidden rounded-sm bg-black/40">
                <video
                    src="/assets/reels/tennis vid.mp4"
                    className="h-full w-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                />
            </div>
        </div>
    );

    return (
        <section className="overflow-x-clip bg-[#F5F7F9]" id="news-content">
            <div className={SECTION_CONTAINER_CLASS}>
                <SectionDivider
                    number="01"
                    title="Berita Kami"
                    subtitle="Newspage /01"
                    theme="light"
                />

                <div className="mb-8 mt-10 flex flex-col justify-between gap-3 xl:mb-12 xl:flex-row xl:items-end xl:gap-0">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <div className="size-[14px] flex-shrink-0 rounded-[5px] bg-[#ff0000] xl:size-[17px]" />
                            <span className="font-bdo text-[clamp(1rem,1.25vw,1.5rem)] font-normal text-black">
                                Berita Terbaru Kami
                            </span>
                        </div>
                        <h2 className="mt-10 font-bdo text-[clamp(2rem,2.7vw,3.25rem)] font-medium leading-[1.1] tracking-[-0.021em] text-black">
                            Berita Terkini Kami
                        </h2>
                    </div>
                    <a
                        href="#"
                        className="hidden items-center gap-2 font-bdo text-[clamp(1rem,1.25vw,1.5rem)] font-normal text-[#ff0000] transition-all duration-300 hover:gap-3 xl:flex xl:flex-shrink-0"
                    >
                        Lihat Selengkapnya
                        <ArrowRight size={18} />
                    </a>
                </div>

                <div className={`${CARD_GRID_CLASS} pb-12`}>
                    <NewsCard
                        {...featured}
                        description={undefined}
                        index={0}
                        layoutOverride="berita"
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

                    <NewsCard
                        {...standard}
                        index={1}
                        layoutOverride="berita"
                        className={CARD_STANDARD_CLASS}
                        variant="news-page"
                    />

                    <div className="hidden md:block">{unggulanCard}</div>

                    {bottom4.map((item, idx) => (
                        <NewsCard
                            key={item.id}
                            {...item}
                            index={idx + 2}
                            layoutOverride="berita"
                            className={CARD_STANDARD_CLASS}
                            variant="news-page"
                        />
                    ))}

                    <div className="md:hidden">{unggulanCard}</div>
                </div>
            </div>

            <div
                className="relative mx-4 overflow-hidden py-36 xl:mx-16 xl:mb-12 xl:py-52"
                style={{
                    backgroundImage: `url(${bg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                }}
            >
                <CurvedLoop
                    marqueeText="UB   *   SPORT  *  CENTER   *   UBSC   *   "
                    speed={1.5}
                    curveAmount={curveAmount}
                    direction="left"
                    interactive
                    className="z-100 absolute -top-12 h-full xl:-top-16"
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <img
                        src={person}
                        alt="UB Sport Center athlete"
                        className="h-44 w-auto object-cover shadow-2xl md:h-64 xl:h-80"
                    />
                </div>
            </div>
        </section>
    );
}
