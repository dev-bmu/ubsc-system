import { ArrowLeft, ArrowRight } from "lucide-react";
import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import NewsCard from "@/Components/Landing/NewsCard";
import type { NewsItem } from "@/Components/Landing/NewsCard";
import NewsPagination from "@/Components/News/NewsPagination";
import FeaturedPromoCard from "@/Components/News/FeaturedPromoCard";
import {
    type NewsFeedPage,
    usePaginatedNewsFeed,
} from "@/Components/News/newsFeed";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import NewsHeroBg from "@/../assets/images/news-hero.avif";
import useNewsProgressiveReveal from "@/Components/News/useNewsProgressiveReveal";

interface DummyArtikelItem extends NewsItem {
    description?: string;
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
    "mx-auto px-6 pt-8 pb-4 sm:px-10 sm:pt-12 sm:pb-8 xl:px-[clamp(70px,4.53vw,87px)] xl:py-12";
const CARD_FEATURED_CLASS =
    "news-card-featured w-full md:aspect-[857/529]";
const CARD_STANDARD_CLASS = "w-full aspect-[413/529]";
const CARD_GRID_CLASS =
    "news-card-grid grid gap-x-3 gap-y-5 md:gap-8 xl:gap-[clamp(24px,1.56vw,30px)]";
const ARTICLE_SUMMARY_PAGE_SIZE = 4;
const ARTICLE_FULL_PAGE_SIZE = 7;

export default function ServicesSectionArtikel({
    articles,
    initialPage,
    modeSwitch,
    sectionNumber = "02",
    revealVersion = 0,
    isFullMode = false,
    showPromoSlot = false,
    onOpenFullMode,
    onCloseFullMode,
}: {
    articles?: DummyArtikelItem[];
    initialPage?: NewsFeedPage<DummyArtikelItem>;
    modeSwitch?: ReactNode;
    sectionNumber?: string;
    revealVersion?: number;
    isFullMode?: boolean;
    showPromoSlot?: boolean;
    onOpenFullMode?: () => void;
    onCloseFullMode?: () => void;
}) {
    const sectionRef = useRef<HTMLElement | null>(null);
    const [isPrepared, setIsPrepared] = useState(false);
    const fallbackArticles = useMemo(
        () => (articles && articles.length > 0 ? articles : DUMMY_ARTIKEL),
        [articles],
    );
    const pageSize = isFullMode
        ? ARTICLE_FULL_PAGE_SIZE
        : ARTICLE_SUMMARY_PAGE_SIZE;
    const {
        currentPage,
        currentItems: currentArticles,
        pageCount,
        isLoadingPage,
        pageError,
        requestPage,
        retryPage,
    } = usePaginatedNewsFeed<DummyArtikelItem>({
        category: "Artikel",
        pageSize,
        fallbackItems: fallbackArticles,
        initialPage,
        prewarmNextPage: isPrepared,
    });
    const [featured, standard, ...rest] = currentArticles;
    const prewarmArticles = currentArticles;
    const shouldShowPagination = currentArticles.length > 0;
    const expandedListId = "artikel-expanded-list";
    const listActionLabel = isFullMode
        ? "Kembali"
        : "Lihat Selengkapnya";
    const handleListToggle = useCallback(() => {
        requestPage(0);

        if (isFullMode) {
            onCloseFullMode?.();
            return;
        }

        onOpenFullMode?.();
    }, [isFullMode, onCloseFullMode, onOpenFullMode, requestPage]);
    const handlePageChange = useCallback(
        (page: number) => {
            requestPage(page);
        },
        [requestPage],
    );

    useNewsProgressiveReveal(
        sectionRef,
        `artikel-${currentPage}-${currentArticles.length}-${isFullMode ? "full" : "summary"}`,
        `artikel-${revealVersion}-${sectionNumber}`,
    );

    useEffect(() => {
        const node = sectionRef.current;
        if (!node || isPrepared) return;

        if (!("IntersectionObserver" in window)) {
            setIsPrepared(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsPrepared(true);
                observer.disconnect();
            },
            {
                threshold: 0.01,
                rootMargin: "1200px 0px 1200px 0px",
            },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [isPrepared]);

    useEffect(() => {
        if (!isPrepared) return;

        let cancelled = false;
        const timeouts: number[] = [];

        const wait = (ms: number) =>
            new Promise<void>((resolve) => {
                const timeout = window.setTimeout(resolve, ms);
                timeouts.push(timeout);
            });

        const warmSequentially = async () => {
            for (const item of prewarmArticles) {
                await wait(120);
                if (cancelled) return;
                if (!item.image) continue;

                const image = new Image();
                image.decoding = "async";
                image.src = item.image;

                if (image.decode) {
                    await image.decode().catch(() => undefined);
                }

                if (cancelled) return;
            }
        };

        void warmSequentially();

        return () => {
            cancelled = true;
            timeouts.forEach((timeout) => window.clearTimeout(timeout));
        };
    }, [prewarmArticles, isPrepared]);

    return (
        <section
            ref={sectionRef}
            className="news-services-section overflow-x-clip bg-[#F5F7F9]"
            id="artikel-content"
        >
            <div className={SECTION_CONTAINER_CLASS}>
                <div
                    data-news-reveal="divider"
                    data-news-reveal-order="0"
                    className="news-section-divider-reveal"
                >
                    <SectionDivider
                        key={`artikel-divider-${sectionNumber}-${revealVersion}`}
                        number={sectionNumber}
                        title="Artikel Kami"
                        subtitle="03 newspage"
                        theme="light"
                    />
                </div>

                <div className="mb-6 mt-10 flex flex-col justify-between gap-3 xl:mb-9 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch xl:gap-x-8 xl:gap-y-0">
                    <div className="flex flex-col gap-2">
                        <div
                            data-news-reveal="label"
                            data-news-reveal-order="1"
                            className="flex items-center gap-4 xl:gap-3"
                        >
                            <span className="section-label-diamond" />
                            <ScrollTextReveal
                                key={`artikel-label-${sectionNumber}-${revealVersion}`}
                                delay={70}
                                stagger={18}
                                amount={0.15}
                                className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
                            >
                                Artikel Terbaru Kami
                            </ScrollTextReveal>
                        </div>
                        {modeSwitch && (
                            <div
                                data-news-reveal="mode-switch"
                                data-news-reveal-order="2"
                                data-news-reveal-reset="keep"
                                className={`news-mobile-switch-slot mt-5 w-full max-w-[20.75rem] xl:hidden ${
                                    revealVersion > 0
                                        ? "is-news-prepared is-news-visible"
                                        : ""
                                }`}
                            >
                                {modeSwitch}
                            </div>
                        )}
                        <h2
                            data-news-reveal="headline"
                            data-news-reveal-order="2"
                            aria-label="Artikel Terkini Kami"
                            className="section-two-headline-weight mt-5 max-w-[1100px] text-left font-bdo text-[clamp(1.74rem,6.93vw,2.4rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:mt-10 xl:max-w-[980px] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:max-w-[1120px] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
                        >
                            <span aria-hidden className="block">
                                <span className="block overflow-visible">
                                    <ScrollTextReveal
                                        key={`artikel-headline-${sectionNumber}-${revealVersion}`}
                                        delay={110}
                                        className="-mb-[0.14em] pb-[0.14em] pr-[0.08em] whitespace-nowrap"
                                    >
                                        Artikel Terkini Kami
                                    </ScrollTextReveal>
                                </span>
                            </span>
                        </h2>
                    </div>
                    <div
                        data-news-reveal="action"
                        data-news-reveal-order="3"
                        className={`hidden min-w-0 flex-col items-start xl:flex xl:min-w-[15rem] xl:items-end xl:self-stretch ${
                            modeSwitch
                                ? "xl:justify-between"
                                : "xl:justify-end"
                        }`}
                    >
                        {modeSwitch && (
                            <div
                                data-news-reveal-reset="keep"
                                className={`news-section-switch-slot hidden xl:block ${
                                    revealVersion > 0
                                        ? "is-news-prepared is-news-visible"
                                        : ""
                                }`}
                            >
                                {modeSwitch}
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={handleListToggle}
                            aria-expanded={isFullMode}
                            aria-controls={expandedListId}
                            className={`news-more-link hidden items-center gap-2 font-bdo text-[clamp(0.825rem,1.03125vw,1.2375rem)] font-normal text-[#ff0000] xl:flex xl:flex-shrink-0 ${
                                isFullMode ? "news-more-link--back" : ""
                            }`}
                        >
                            {isFullMode && (
                                <ArrowLeft className="news-more-link__icon" size={15.4} />
                            )}
                            <span className="news-more-link__label">
                                {listActionLabel}
                            </span>
                            {!isFullMode && (
                                <ArrowRight className="news-more-link__icon" size={15.4} />
                            )}
                        </button>
                    </div>
                </div>

                <div
                    id={expandedListId}
                    className={`${CARD_GRID_CLASS} pb-3 md:pb-12`}
                    data-news-list-mode={isFullMode ? "full" : "summary"}
                    role="region"
                    aria-label={
                        isFullMode
                            ? "Daftar lengkap artikel"
                            : "Ringkasan artikel terbaru"
                    }
                >
                    {featured && (
                        <NewsCard
                            key={`artikel-featured-${currentPage}-${featured.id}`}
                            {...featured}
                            index={0}
                            layoutOverride="artikel"
                            className={CARD_FEATURED_CLASS}
                            variant="news-page"
                            featured
                            priority={isPrepared}
                            newsReveal="card"
                            newsRevealOrder={4}
                        />
                    )}

                    <div
                        data-news-reveal="action"
                        data-news-reveal-order="5"
                        className="news-list-mobile-action -mb-2 flex justify-end md:mb-0 md:hidden"
                    >
                        <button
                            type="button"
                            onClick={handleListToggle}
                            aria-expanded={isFullMode}
                            aria-controls={expandedListId}
                            className={`news-more-link flex items-center gap-2 font-bdo text-[0.902rem] font-normal text-[#ff0000] ${
                                isFullMode ? "news-more-link--back" : ""
                            }`}
                        >
                            {isFullMode && (
                                <ArrowLeft
                                    className="news-more-link__icon"
                                    size={16.5}
                                />
                            )}
                            <span className="news-more-link__label">
                                {listActionLabel}
                            </span>
                            {!isFullMode && (
                                <ArrowRight className="news-more-link__icon" size={16.5} />
                            )}
                        </button>
                    </div>

                    {standard && (
                        <NewsCard
                            key={`artikel-standard-${currentPage}-${standard.id}`}
                            {...standard}
                            index={1}
                            layoutOverride="artikel"
                            className={CARD_STANDARD_CLASS}
                            variant="news-page"
                            priority={isPrepared}
                            newsReveal="card"
                            newsRevealOrder={6}
                        />
                    )}

                    {showPromoSlot && (
                        <div className="news-featured-video-slot">
                            <FeaturedPromoCard
                                isPrepared={isPrepared}
                                revealOrder={7}
                            />
                        </div>
                    )}

                    {rest.map((item, idx) => (
                        <NewsCard
                            key={`artikel-card-${currentPage}-${item.id}`}
                            {...item}
                            index={idx + 2}
                            layoutOverride="artikel"
                            className={CARD_STANDARD_CLASS}
                            variant="news-page"
                            priority={isPrepared && idx < 2}
                            newsReveal="card"
                            newsRevealOrder={(showPromoSlot ? 8 : 7) + idx}
                        />
                    ))}

                    {isLoadingPage && currentArticles.length === 0 && (
                        <div className="news-content-state col-span-full">
                            <span />
                            <p>Memuat konten artikel...</p>
                        </div>
                    )}

                    {!isLoadingPage && pageError && currentArticles.length === 0 && (
                        <div className="news-content-state news-content-state--error col-span-full">
                            <p>{pageError}</p>
                            <button type="button" onClick={retryPage}>
                                Coba lagi
                            </button>
                        </div>
                    )}

                    {!isLoadingPage && !pageError && currentArticles.length === 0 && (
                        <div className="news-content-state col-span-2 md:col-span-full">
                            <p>Belum ada artikel yang tersedia.</p>
                        </div>
                    )}

                    {shouldShowPagination && (
                        <NewsPagination
                            page={currentPage}
                            pageCount={pageCount}
                            onPageChange={handlePageChange}
                            label="Pagination artikel"
                            className="news-pagination--mobile order-[98] col-span-full"
                        />
                    )}
                </div>

                {shouldShowPagination && (
                    <NewsPagination
                        page={currentPage}
                        pageCount={pageCount}
                        onPageChange={handlePageChange}
                        label="Pagination artikel"
                        className="news-pagination--desktop mt-2"
                    />
                )}
            </div>
        </section>
    );
}
