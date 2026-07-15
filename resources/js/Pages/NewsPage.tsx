import Navbar from "@/Components/Landing/Navbar";
import NewsHero from "@/Components/News/NewsHero";
import type { NewsSlide } from "@/Components/News/NewsHero";
import HeroCurtainEdge from "@/Components/Landing/HeroCurtainEdge";
import ServicesSectionNews from "@/Components/News/ServicesSectionNews";
import ServicesSectionArtikel from "@/Components/News/ServicesSectionArtikel";
import NewsReveal from "@/Components/News/NewsReveal";
import NewsModeSwitch from "@/Components/News/NewsModeSwitch";
import type { NewsContentMode } from "@/Components/News/NewsModeSwitch";
import NewsShowcaseBridge from "@/Components/News/NewsShowcaseBridge";
import Footer from "@/Components/Landing/Footer";
import { Head, usePage } from "@inertiajs/react";
import AboutSectionContact from "@/Components/About/AboutSectionContact";
import type { PageProps } from "@/types";
import {
    startTransition,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { NewsFeedPage } from "@/Components/News/newsFeed";

interface BackendNewsItem {
    id: string | number;
    title: string;
    slug: string;
    date: string;
    category: "Berita" | "Artikel";
    image: string;
    description?: string;
}

type NewsPageProps = PageProps<{
    news?: BackendNewsItem[];
    newsFeed?: {
        hero: BackendNewsItem[];
        berita: NewsFeedPage<BackendNewsItem>;
        artikel: NewsFeedPage<BackendNewsItem>;
    };
}>;

export default function NewsPage() {
    const { news = [], newsFeed } = usePage<NewsPageProps>().props;
    const [contentMode, setContentMode] =
        useState<NewsContentMode>("berita");
    const [fullContentMode, setFullContentMode] =
        useState<NewsContentMode | null>(null);
    const [modeRevision, setModeRevision] = useState(0);
    const footerRevealRef = useRef<HTMLDivElement | null>(null);

    const heroSlides: NewsSlide[] = useMemo(
        () =>
            (newsFeed?.hero ?? news.slice(0, 3)).map((item) => ({
                id: item.id,
                slug: item.slug,
                badge: item.category,
                title: item.title,
                description: item.description ?? '',
                date: item.date,
                image: item.image || '/assets/images/comingsoon.avif',
            })),
        [news, newsFeed?.hero],
    );

    // Cast is safe — API only returns "Berita" or "Artikel" for category
    const beritaItems = useMemo(
        () => news.filter((n) => n.category === 'Berita') as never[],
        [news],
    );
    const artikelItems = useMemo(
        () => news.filter((n) => n.category === 'Artikel') as never[],
        [news],
    );
    const handleModeChange = useCallback(
        (mode: NewsContentMode) => {
            if (mode === contentMode) return;

            startTransition(() => {
                setContentMode(mode);
                setFullContentMode((currentMode) =>
                    currentMode === null ? null : mode,
                );
                setModeRevision((revision) => (revision + 1) % 100000);
            });
        },
        [contentMode],
    );
    const handleOpenFullMode = useCallback((mode: NewsContentMode) => {
        startTransition(() => {
            setContentMode(mode);
            setFullContentMode(mode);
            setModeRevision((revision) => (revision + 1) % 100000);
        });
    }, []);
    const handleCloseFullMode = useCallback(() => {
        startTransition(() => {
            setFullContentMode(null);
            setModeRevision((revision) => (revision + 1) % 100000);
        });
    }, []);
    const modeSwitch = (
        <NewsModeSwitch value={contentMode} onChange={handleModeChange} />
    );
    const promoMode = fullContentMode ?? contentMode;

    useEffect(() => {
        const root = footerRevealRef.current;
        const stage = root?.querySelector<HTMLElement>(
            ".home-footer-reveal-stage",
        );

        if (!root || !stage) return;

        let frame = 0;

        const syncStageOffset = () => {
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => {
                const viewportHeight =
                    window.visualViewport?.height ?? window.innerHeight;
                const stageHeight = stage.offsetHeight;
                const offset = Math.min(0, viewportHeight - stageHeight);

                root.style.setProperty(
                    "--news-footer-stage-offset",
                    `${Math.round(offset)}px`,
                );
            });
        };

        syncStageOffset();

        const resizeObserver =
            "ResizeObserver" in window
                ? new ResizeObserver(syncStageOffset)
                : null;

        resizeObserver?.observe(stage);
        window.addEventListener("resize", syncStageOffset);
        window.visualViewport?.addEventListener("resize", syncStageOffset);

        return () => {
            window.cancelAnimationFrame(frame);
            resizeObserver?.disconnect();
            window.removeEventListener("resize", syncStageOffset);
            window.visualViewport?.removeEventListener(
                "resize",
                syncStageOffset,
            );
        };
    }, []);

    const newsSection = (
        <NewsReveal key="berita" className="news-reveal--large-section">
            <ServicesSectionNews
                news={beritaItems}
                initialPage={newsFeed?.berita}
                modeSwitch={contentMode === "berita" ? modeSwitch : undefined}
                sectionNumber="01"
                revealVersion={modeRevision}
                isFullMode={fullContentMode === "berita"}
                showPromoSlot={promoMode === "berita"}
                onOpenFullMode={() => handleOpenFullMode("berita")}
                onCloseFullMode={handleCloseFullMode}
            />
        </NewsReveal>
    );
    const articleSection = (
        <NewsReveal key="artikel">
            <ServicesSectionArtikel
                articles={artikelItems}
                initialPage={newsFeed?.artikel}
                modeSwitch={contentMode === "artikel" ? modeSwitch : undefined}
                sectionNumber="02"
                revealVersion={modeRevision}
                isFullMode={fullContentMode === "artikel"}
                showPromoSlot={promoMode === "artikel"}
                onOpenFullMode={() => handleOpenFullMode("artikel")}
                onCloseFullMode={handleCloseFullMode}
            />
        </NewsReveal>
    );
    const orderedSections =
        fullContentMode === "berita"
            ? [newsSection]
            : fullContentMode === "artikel"
              ? [articleSection]
              : contentMode === "berita"
                ? [newsSection, articleSection]
                : [articleSection, newsSection];
    const [leadSection, ...remainingSections] = orderedSections;

    return (
        <>
            <Head>
                <title>Berita | UB Sport Center</title>
                <meta
                    name="description"
                    content="Berita dan artikel terbaru dari UB Sport Center — pusat olahraga terkemuka di Malang."
                />
                <meta property="og:title" content="Berita | UB Sport Center" />
                <meta
                    property="og:description"
                    content="Berita dan artikel terbaru dari UB Sport Center."
                />
                <meta
                    property="og:image"
                    content="/assets/images/gym-konten-1-olahraga-ub-sport-center.avif"
                />
                <meta property="og:type" content="website" />
                <meta name="twitter:card" content="summary_large_image" />
            </Head>
            <main className="relative bg-white text-black">
                <Navbar activeSection="News" />
                {heroSlides.length > 0 && (
                    <div className="news-hero-section-reveal">
                        <NewsHero slides={heroSlides} />
                    </div>
                )}
                <section className="news-post-hero-curtain section-two-curtain relative z-[18] overflow-x-clip bg-[#F5F7F9]">
                    <HeroCurtainEdge postFlowSelector=".news-post-hero-flow" />
                    <div className="section-two-curtain-content relative z-10 bg-[#F5F7F9]">
                        <div id="news-content" />
                        {leadSection}
                    </div>
                </section>
                <div className="news-post-hero-flow bg-white">
                    {remainingSections.length > 0 && <NewsShowcaseBridge />}
                    {remainingSections}
                </div>
            </main>
            <div
                ref={footerRevealRef}
                className="home-footer-reveal-root news-footer-reveal-root"
            >
                <div className="home-footer-reveal-stage">
                    <NewsReveal>
                        <AboutSectionContact
                            sectionNumber="03"
                            sectionTitle="Informasi"
                            sectionSubtitle="03 newspage"
                        />
                    </NewsReveal>
                </div>
                <div className="home-footer-reveal-footer">
                    <Footer />
                </div>
            </div>
        </>
    );
}
