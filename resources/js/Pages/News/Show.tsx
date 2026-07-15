import Navbar from "@/Components/Landing/Navbar";
import Footer from "@/Components/Landing/Footer";
import { Head, Link, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback } from "react";
import newsHeroBg from "@/../assets/images/news-hero.avif";

interface NewsDetailItem {
    id: number;
    title: string;
    slug: string;
    sub_title: string;
    description: string;
    content: string;
    date: string;
    category: string;
    facility: string;
    images_array: string[];
    cover_image?: string | null;
}

interface SimilarNewsItem {
    id: number;
    title: string;
    slug: string;
    date: string;
    category: string;
    description: string;
    cover_image: string;
}

type NewsShowPageProps = PageProps<{
    newsItem: NewsDetailItem;
    similarNews: SimilarNewsItem[];
}>;

const FALLBACK_IMAGE = newsHeroBg;

function isHtml(value: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(value);
}

function textToHtml(value: string): string {
    return value
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
        .join("");
}

function CategoryBadge({ children }: { children: string }) {
    return (
        <span className="inline-flex h-7 w-fit items-center rounded-[4px] bg-[linear-gradient(90deg,#ff0000,#9b0000)] px-5 font-clash text-[0.68rem] font-bold text-white shadow-[0_8px_20px_rgba(255,0,0,0.18)]">
            {children}
        </span>
    );
}

function DetailHero({ newsItem }: { newsItem: NewsDetailItem }) {
    const images =
        newsItem.images_array && newsItem.images_array.length > 0
            ? newsItem.images_array
            : [newsItem.cover_image || FALLBACK_IMAGE];
    const [emblaRef, emblaApi] = useEmblaCarousel({ loop: images.length > 1 });
    const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
    const showControls = images.length > 1;

    return (
        <section className="relative h-[clamp(560px,45.45vw,698px)] min-h-[560px] overflow-hidden bg-black text-white">
            <div className="absolute inset-0 overflow-hidden" ref={emblaRef}>
                <div className="flex h-full">
                    {images.map((image, index) => (
                        <div
                            key={`${image}-${index}`}
                            className="relative h-full min-w-0 flex-[0_0_100%]"
                        >
                            <img
                                src={image}
                                alt={newsItem.title}
                                className="absolute inset-0 h-full w-full object-cover"
                                loading={index === 0 ? "eager" : "lazy"}
                                draggable={false}
                            />
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.08)_40%,rgba(0,0,0,0.72)_100%)]" />
                        </div>
                    ))}
                </div>
            </div>

            <Navbar activeSection="News" />

            <div className="relative z-10 flex h-full items-end">
                <div className="w-full px-[clamp(1.5rem,4.5vw,5.5rem)] pb-[clamp(2.2rem,4.2vw,4.8rem)]">
                    <div className="max-w-[980px]">
                        <CategoryBadge>{newsItem.category}</CategoryBadge>
                        <h1 className="mt-7 max-w-[1060px] font-bdo text-[clamp(2.2rem,3.3vw,4rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-white">
                            {newsItem.title}
                        </h1>
                        {newsItem.description && (
                            <p className="mt-6 max-w-[760px] font-bdo text-[clamp(0.95rem,1.04vw,1.22rem)] font-normal leading-[1.45] text-white/70">
                                {newsItem.description}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {showControls && (
                <div className="absolute bottom-10 right-[clamp(1.5rem,4.5vw,5.5rem)] z-20 flex gap-3">
                    <button
                        type="button"
                        onClick={scrollPrev}
                        aria-label="Previous image"
                        className="flex size-11 items-center justify-center rounded-full border border-white/45 bg-black/25 text-white backdrop-blur transition hover:bg-white hover:text-black"
                    >
                        <ChevronLeft className="size-5" />
                    </button>
                    <button
                        type="button"
                        onClick={scrollNext}
                        aria-label="Next image"
                        className="flex size-11 items-center justify-center rounded-full border border-white/45 bg-black/25 text-white backdrop-blur transition hover:bg-white hover:text-black"
                    >
                        <ChevronRight className="size-5" />
                    </button>
                </div>
            )}
        </section>
    );
}

function MetaCard({
    label,
    value,
    badge,
}: {
    label: string;
    value: string;
    badge?: boolean;
}) {
    return (
        <article className="min-h-[88px] rounded-xl border border-black/5 bg-[#F7F7F7] p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-bdo text-[0.78rem] font-medium text-black/45">
                    {label}
                </span>
                <span className="font-bdo text-sm leading-none text-black/20">..</span>
            </div>
            {badge ? (
                <CategoryBadge>{value}</CategoryBadge>
            ) : (
                <p className="font-bdo text-[0.9rem] font-medium leading-tight text-black">
                    {value}
                </p>
            )}
        </article>
    );
}

function SimilarCard({ item }: { item: SimilarNewsItem }) {
    return (
        <Link href={route("news.show", item.slug)} className="group block">
            <div className="relative mb-4 aspect-[16/11] w-full overflow-hidden rounded-2xl bg-[#F7F7F7]">
                <img
                    src={item.cover_image || FALLBACK_IMAGE}
                    alt={item.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                    draggable={false}
                />
            </div>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <h3 className="line-clamp-2 font-bdo text-lg font-semibold leading-tight tracking-[-0.025em] text-black">
                        {item.title}
                    </h3>
                    <p className="mt-1 line-clamp-3 font-bdo text-sm font-normal leading-relaxed text-gray-500">
                        {item.description}
                    </p>
                </div>
                <span className="mt-1 shrink-0 font-bdo text-xs font-medium text-black/40">
                    {item.date}
                </span>
            </div>
        </Link>
    );
}

export default function NewsShow() {
    const { newsItem, similarNews } = usePage<NewsShowPageProps>().props;
    const contentHtml = isHtml(newsItem.content)
        ? newsItem.content
        : textToHtml(newsItem.content);
    const recommendations = similarNews.slice(0, 6);

    return (
        <>
            <Head title={newsItem.title}>
                <meta name="description" content={newsItem.description} />
                <meta property="og:title" content={newsItem.title} />
                <meta property="og:description" content={newsItem.description} />
                <meta
                    property="og:image"
                    content={newsItem.images_array?.[0] ?? newsItem.cover_image ?? FALLBACK_IMAGE}
                />
            </Head>

            <main className="bg-white text-black">
                <DetailHero newsItem={newsItem} />

                <section className="mx-auto max-w-[1200px] px-6 pt-12 xl:px-0">
                    <h2 className="max-w-[760px] font-bdo text-[clamp(2rem,2.35vw,3rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-black">
                        {newsItem.title}
                    </h2>
                </section>

                <section className="mx-auto mt-10 grid max-w-[720px] grid-cols-1 gap-4 px-6 md:grid-cols-3 xl:gap-6 xl:px-0">
                    <MetaCard label="Category" value={newsItem.category} badge />
                    <MetaCard label="Date" value={newsItem.date} />
                    <MetaCard label="Facility" value={newsItem.facility} />
                </section>

                <article className="mx-auto mt-16 w-full max-w-[1200px] rounded-[24px] bg-[#F7F7F7] p-6 sm:p-12 xl:p-16">
                    {newsItem.sub_title && (
                        <p className="mb-10 max-w-[920px] font-bdo text-xl font-medium leading-snug text-black/90 sm:text-2xl xl:text-3xl">
                            {newsItem.sub_title}
                        </p>
                    )}
                    <div
                        className="news-detail-prose max-w-none font-bdo text-sm font-normal leading-relaxed text-gray-600 sm:text-base"
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />
                </article>

                {recommendations.length > 0 && (
                    <section className="mx-auto mt-10 max-w-[1200px] px-6 pb-24 xl:px-0">
                        <div className="flex items-center justify-between gap-6">
                            <h2 className="font-bdo text-[clamp(1.65rem,1.95vw,2.4rem)] font-medium leading-none tracking-[-0.045em] text-black">
                                Similar templates
                            </h2>
                            <Link
                                href={route("news")}
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#EFEFEF] px-5 font-bdo text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-black transition hover:bg-black hover:text-white"
                            >
                                All templates
                                <ArrowUpRight className="size-3.5" />
                            </Link>
                        </div>

                        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2">
                            {recommendations.map((item) => (
                                <SimilarCard key={item.id} item={item} />
                            ))}
                        </div>
                    </section>
                )}
            </main>

            <Footer />
        </>
    );
}
