import Footer from "@/Components/Landing/Footer";
import Navbar from "@/Components/Landing/Navbar";
import SeoHead from "@/Components/SeoHead";
import type { PageProps } from "@/types";
import newsHeroBg from "@/../assets/images/news-hero.avif";
import { Link, usePage } from "@inertiajs/react";
import {
    ArrowLeft,
    ArrowUpRight,
    Check,
    ChevronLeft,
    ChevronRight,
    Copy,
} from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import {
    type ReactNode,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import "./Show.css";

interface NewsDetailItem {
    id: number;
    title: string;
    slug: string;
    sub_title: string;
    description: string;
    content: string;
    date: string;
    published_at_iso?: string | null;
    category: string;
    author?: string;
    reading_minutes?: number;
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

type StoryTone = "berita" | "artikel";

const FALLBACK_IMAGE = newsHeroBg;

function getStoryTone(category: string): StoryTone {
    return category.trim().toLowerCase() === "artikel" ? "artikel" : "berita";
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function isHtml(value: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(value);
}

function textToHtml(value: string): string {
    return escapeHtml(value)
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
        .join("");
}

function htmlToText(value: string): string {
    return value
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("id-ID");
}

function removeRepeatedOpeningParagraph(
    html: string,
    candidates: string[],
): string {
    const openingMatch = html.match(/^\s*<p\b[^>]*>[\s\S]*?<\/p>/i);

    if (!openingMatch) return html;

    const openingText = normalizeText(htmlToText(openingMatch[0]));
    const repeatsEditorialCopy = candidates
        .filter(Boolean)
        .map(normalizeText)
        .some((candidate) => candidate === openingText);

    if (!repeatsEditorialCopy) return html;

    const remainder = html.slice(openingMatch[0].length).trimStart();

    return normalizeText(htmlToText(remainder)).length > 0 ? remainder : html;
}

function estimateReadingMinutes(content: string): number {
    const words = htmlToText(content).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 220));
}

function StoryBadge({ children, tone }: { children: string; tone: StoryTone }) {
    return (
        <span
            className="news-story-badge news-gradient-badge news-gradient-badge--story"
            data-tone={tone}
        >
            <span>{children || "News"}</span>
        </span>
    );
}

function DetailHero({
    newsItem,
    readingMinutes,
    tone,
}: {
    newsItem: NewsDetailItem;
    readingMinutes: number;
    tone: StoryTone;
}) {
    const images = useMemo(() => {
        const candidates = [
            ...(newsItem.images_array ?? []),
            newsItem.cover_image ?? "",
        ].filter(Boolean);

        return Array.from(new Set(candidates)).length > 0
            ? Array.from(new Set(candidates))
            : [FALLBACK_IMAGE];
    }, [newsItem.cover_image, newsItem.images_array]);
    const [emblaRef, emblaApi] = useEmblaCarousel({
        loop: images.length > 1,
        duration: 34,
        dragThreshold: 3,
        skipSnaps: false,
        watchDrag: images.length > 1,
    });
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [visibleBackdropIndex, setVisibleBackdropIndex] = useState(0);
    const loadedBackdropIndexesRef = useRef<Set<number>>(new Set());
    const pendingBackdropIndexRef = useRef(0);
    const prefetchedImagesRef = useRef<Set<string>>(new Set());
    const safeSelectedIndex = Math.min(
        Math.max(0, selectedIndex),
        Math.max(0, images.length - 1),
    );

    const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

    useEffect(() => {
        if (!emblaApi) return;

        const handleSelect = () => {
            const nextIndex = Math.min(
                emblaApi.selectedScrollSnap(),
                Math.max(0, images.length - 1),
            );

            pendingBackdropIndexRef.current = nextIndex;
            setSelectedIndex(nextIndex);

            if (loadedBackdropIndexesRef.current.has(nextIndex)) {
                setVisibleBackdropIndex(nextIndex);
            }
        };

        handleSelect();
        emblaApi.on("select", handleSelect).on("reInit", handleSelect);

        return () => {
            emblaApi.off("select", handleSelect).off("reInit", handleSelect);
        };
    }, [emblaApi, images.length]);

    useEffect(() => {
        setSelectedIndex(0);
        setVisibleBackdropIndex(0);
        pendingBackdropIndexRef.current = 0;
        loadedBackdropIndexesRef.current = new Set();
        prefetchedImagesRef.current = new Set();
    }, [images]);

    useEffect(() => {
        if (images.length < 2) return;

        const adjacentIndexes = [
            safeSelectedIndex,
            (safeSelectedIndex + 1) % images.length,
            (safeSelectedIndex - 1 + images.length) % images.length,
        ];

        adjacentIndexes.forEach((index) => {
            const source = images[index];

            if (!source || prefetchedImagesRef.current.has(source)) return;

            prefetchedImagesRef.current.add(source);
            const preloader = new Image();
            preloader.decoding = "async";
            preloader.src = source;
        });
    }, [images, safeSelectedIndex]);

    return (
        <section className="news-story-hero" data-tone={tone}>
            <div className="news-story-hero__backdrops" aria-hidden="true">
                {images.map((image, index) => (
                    <img
                        key={`backdrop-${image}-${index}`}
                        src={image}
                        alt=""
                        className="news-story-hero__backdrop"
                        data-active={
                            index === visibleBackdropIndex ? "true" : "false"
                        }
                        width={1920}
                        height={1080}
                        sizes="100vw"
                        loading={index < 2 ? "eager" : "lazy"}
                        decoding="async"
                        fetchPriority={index === 0 ? "high" : "auto"}
                        onLoad={(event) => {
                            event.currentTarget.dataset.loaded = "true";
                            loadedBackdropIndexesRef.current.add(index);

                            if (pendingBackdropIndexRef.current === index) {
                                setVisibleBackdropIndex(index);
                            }
                        }}
                        onError={(event) => {
                            if (!event.currentTarget.dataset.fallback) {
                                event.currentTarget.dataset.fallback = "true";
                                event.currentTarget.src = FALLBACK_IMAGE;
                            }
                        }}
                        draggable={false}
                    />
                ))}
            </div>

            <div
                className="news-story-hero__viewport"
                ref={emblaRef}
                role="region"
                aria-roledescription="carousel"
                aria-label={`Galeri utama berita, ${images.length} gambar`}
                tabIndex={images.length > 1 ? 0 : -1}
                onKeyDown={(event) => {
                    if (images.length < 2) return;

                    if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        scrollPrev();
                    }

                    if (event.key === "ArrowRight") {
                        event.preventDefault();
                        scrollNext();
                    }
                }}
            >
                <div className="news-story-hero__track">
                    {images.map((image, index) => (
                        <div
                            key={`${image}-${index}`}
                            className="news-story-hero__slide"
                            role="group"
                            aria-label={`${index + 1} dari ${images.length}`}
                            aria-hidden={index !== safeSelectedIndex}
                        >
                            <img
                                src={image}
                                alt={
                                    index === 0
                                        ? newsItem.title
                                        : `${newsItem.title}, gambar ${index + 1}`
                                }
                                className="news-story-hero__image"
                                width={1920}
                                height={1080}
                                sizes="100vw"
                                loading={index < 2 ? "eager" : "lazy"}
                                decoding="async"
                                fetchPriority={index === 0 ? "high" : "auto"}
                                onLoad={(event) => {
                                    event.currentTarget.dataset.loaded = "true";
                                }}
                                onError={(event) => {
                                    if (!event.currentTarget.dataset.fallback) {
                                        event.currentTarget.dataset.fallback =
                                            "true";
                                        event.currentTarget.src =
                                            FALLBACK_IMAGE;
                                    }
                                }}
                                draggable={false}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="news-story-hero__veil" aria-hidden="true" />
            <div className="news-story-hero__grain" aria-hidden="true" />

            <div className="news-story-hero__content">
                <StoryBadge tone={tone}>{newsItem.category}</StoryBadge>
                <p className="news-story-hero__title" aria-hidden="true">
                    {newsItem.title}
                </p>
                {newsItem.description &&
                    normalizeText(newsItem.description) !==
                        normalizeText(newsItem.title) && (
                        <p className="news-story-hero__summary">
                            {newsItem.description}
                        </p>
                    )}
                <div
                    className="news-story-hero__meta"
                    aria-label="Informasi artikel"
                >
                    <time
                        className="news-story-hero__meta-date"
                        dateTime={newsItem.published_at_iso ?? undefined}
                    >
                        {newsItem.date}
                    </time>
                    <span
                        className="news-story-hero__meta-separator"
                        aria-hidden="true"
                    />
                    <span className="news-story-hero__meta-reading">
                        {readingMinutes} menit baca
                    </span>
                    <span
                        className="news-story-hero__meta-separator"
                        aria-hidden="true"
                    />
                    <span className="news-story-hero__meta-author">
                        Oleh{" "}
                        {newsItem.author || "Tim Editorial UB Sport Center"}
                    </span>
                </div>
            </div>

            {images.length > 1 && (
                <div className="news-story-hero__gallery-controls">
                    <span
                        className="news-story-hero__gallery-index"
                        aria-live="polite"
                    >
                        {String(safeSelectedIndex + 1).padStart(2, "0")}
                        <i>/</i>
                        {String(images.length).padStart(2, "0")}
                    </span>
                    <button
                        type="button"
                        onClick={scrollPrev}
                        aria-label="Gambar sebelumnya"
                    >
                        <ChevronLeft aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={scrollNext}
                        aria-label="Gambar berikutnya"
                    >
                        <ChevronRight aria-hidden="true" />
                    </button>
                </div>
            )}
        </section>
    );
}

function ArticleMetaCard({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <div className="news-story-masthead__meta-card">
            <span>{label}</span>
            <div>{children}</div>
        </div>
    );
}

function SimilarCard({
    item,
    index,
}: {
    item: SimilarNewsItem;
    index: number;
}) {
    const tone = getStoryTone(item.category);

    return (
        <Link
            href={route("news.show", item.slug)}
            className="news-story-related-card"
            data-tone={tone}
        >
            <div className="news-story-related-card__media">
                <img
                    src={item.cover_image || FALLBACK_IMAGE}
                    alt={item.title}
                    width={900}
                    height={640}
                    sizes="(min-width: 900px) 30vw, 100vw"
                    loading="lazy"
                    decoding="async"
                    onLoad={(event) => {
                        event.currentTarget.dataset.loaded = "true";
                    }}
                    onError={(event) => {
                        if (!event.currentTarget.dataset.fallback) {
                            event.currentTarget.dataset.fallback = "true";
                            event.currentTarget.src = FALLBACK_IMAGE;
                        }
                    }}
                    draggable={false}
                />
                <span className="news-story-related-card__index">
                    {String(index + 1).padStart(2, "0")}
                </span>
                <span
                    className="news-story-related-card__arrow"
                    aria-hidden="true"
                >
                    <ArrowUpRight />
                </span>
            </div>
            <div className="news-story-related-card__content">
                <div className="news-story-related-card__meta">
                    <StoryBadge tone={tone}>{item.category}</StoryBadge>
                    <span>{item.date}</span>
                </div>
                <h3>{item.title}</h3>
                {item.description && <p>{item.description}</p>}
            </div>
        </Link>
    );
}

export default function NewsShow() {
    const { newsItem, similarNews } = usePage<NewsShowPageProps>().props;
    const tone = getStoryTone(newsItem.category);
    const sanitizedContent = newsItem.content.trim();
    const rawContentHtml = sanitizedContent
        ? isHtml(sanitizedContent)
            ? sanitizedContent
            : textToHtml(sanitizedContent)
        : textToHtml(newsItem.description);
    const contentHtml = removeRepeatedOpeningParagraph(rawContentHtml, [
        newsItem.title,
        newsItem.sub_title,
        newsItem.description,
    ]);
    const readingMinutes =
        newsItem.reading_minutes ?? estimateReadingMinutes(contentHtml);
    const normalizedLead = normalizeText(newsItem.sub_title || "");
    const normalizedContent = normalizeText(htmlToText(contentHtml));
    const shouldShowLead =
        normalizedLead.length > 0 &&
        !normalizedContent.startsWith(normalizedLead);
    const recommendations = similarNews.slice(0, 6);
    const articleRef = useRef<HTMLElement>(null);
    const progressRef = useRef<HTMLSpanElement>(null);
    const copyTimerRef = useRef<number | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let frame = 0;

        const updateProgress = () => {
            frame = 0;
            const article = articleRef.current;
            const progress = progressRef.current;

            if (!article || !progress) return;

            const viewportHeight =
                window.visualViewport?.height ?? window.innerHeight;
            const rect = article.getBoundingClientRect();
            const distance = Math.max(1, rect.height + viewportHeight * 0.25);
            const traveled = viewportHeight * 0.42 - rect.top;
            const ratio = Math.min(1, Math.max(0, traveled / distance));

            progress.style.transform = `scaleX(${ratio})`;
        };

        const scheduleProgress = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(updateProgress);
        };

        scheduleProgress();
        window.addEventListener("scroll", scheduleProgress, { passive: true });
        window.addEventListener("resize", scheduleProgress, { passive: true });
        window.visualViewport?.addEventListener("resize", scheduleProgress, {
            passive: true,
        });

        return () => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener("scroll", scheduleProgress);
            window.removeEventListener("resize", scheduleProgress);
            window.visualViewport?.removeEventListener(
                "resize",
                scheduleProgress,
            );
        };
    }, []);

    useEffect(
        () => () => {
            if (copyTimerRef.current !== null) {
                window.clearTimeout(copyTimerRef.current);
            }
        },
        [],
    );

    const markCopied = useCallback(() => {
        setCopied(true);

        if (copyTimerRef.current !== null) {
            window.clearTimeout(copyTimerRef.current);
        }

        copyTimerRef.current = window.setTimeout(() => {
            setCopied(false);
            copyTimerRef.current = null;
        }, 2200);
    }, []);

    const copyCurrentUrl = useCallback(async () => {
        const url = window.location.href;

        try {
            await navigator.clipboard.writeText(url);
            markCopied();
            return;
        } catch {
            const field = document.createElement("textarea");
            field.value = url;
            field.setAttribute("readonly", "");
            field.style.position = "fixed";
            field.style.opacity = "0";
            document.body.appendChild(field);
            field.select();
            document.execCommand("copy");
            field.remove();
            markCopied();
        }
    }, [markCopied]);

    const shareArticle = useCallback(async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: newsItem.title,
                    text: newsItem.description || newsItem.title,
                    url: window.location.href,
                });
                return;
            } catch (error) {
                if (
                    error instanceof DOMException &&
                    error.name === "AbortError"
                ) {
                    return;
                }
            }
        }

        await copyCurrentUrl();
    }, [copyCurrentUrl, newsItem.description, newsItem.title]);

    return (
        <>
            <SeoHead />
            <Navbar activeSection="News" />

            <main className="news-story-page" data-tone={tone}>
                <div className="news-story-reading-progress" aria-hidden="true">
                    <span ref={progressRef} />
                </div>

                <DetailHero
                    newsItem={newsItem}
                    readingMinutes={readingMinutes}
                    tone={tone}
                />

                <section className="news-story-masthead">
                    <div className="news-story-masthead__inner">
                        <div className="news-story-masthead__copy">
                            <h1>{newsItem.title}</h1>
                        </div>

                        <div
                            className="news-story-masthead__meta"
                            aria-label="Ringkasan publikasi"
                        >
                            <ArticleMetaCard label="Kategori">
                                <StoryBadge tone={tone}>
                                    {newsItem.category}
                                </StoryBadge>
                            </ArticleMetaCard>
                            <ArticleMetaCard label="Tanggal">
                                <time
                                    dateTime={
                                        newsItem.published_at_iso ?? undefined
                                    }
                                >
                                    {newsItem.date}
                                </time>
                            </ArticleMetaCard>
                            <ArticleMetaCard label="Lokasi">
                                <span>
                                    {newsItem.facility || "UB Sport Center"}
                                </span>
                            </ArticleMetaCard>
                        </div>
                    </div>
                </section>

                <section className="news-story-reading">
                    <article ref={articleRef} className="news-story-article">
                        <header className="news-story-article__toolbar">
                            <span className="news-story-article__context">
                                <i aria-hidden="true" />
                                <span>Ruang baca</span>
                                <small>{readingMinutes} menit baca</small>
                            </span>
                            <div className="news-story-article__actions">
                                <button type="button" onClick={shareArticle}>
                                    <span>Bagikan</span>
                                    <ArrowUpRight aria-hidden="true" />
                                </button>
                                <button type="button" onClick={copyCurrentUrl}>
                                    <span role="status" aria-live="polite">
                                        {copied
                                            ? "Tautan tersalin"
                                            : "Salin tautan"}
                                    </span>
                                    {copied ? (
                                        <Check aria-hidden="true" />
                                    ) : (
                                        <Copy aria-hidden="true" />
                                    )}
                                </button>
                            </div>
                        </header>

                        <div className="news-story-article__body">
                            {shouldShowLead && (
                                <p className="news-story-article__lead">
                                    {newsItem.sub_title}
                                </p>
                            )}

                            <div
                                className={`news-story-prose${
                                    shouldShowLead
                                        ? " news-story-prose--after-lead"
                                        : ""
                                }`}
                                dangerouslySetInnerHTML={{
                                    __html: contentHtml,
                                }}
                            />
                        </div>

                        <footer className="news-story-article__footer">
                            <span className="news-story-article__byline">
                                <small>Ditulis oleh</small>
                                <strong>
                                    {newsItem.author ||
                                        "Tim Editorial UB Sport Center"}
                                </strong>
                                <i aria-hidden="true">·</i>
                                <span>{readingMinutes} menit baca</span>
                            </span>
                            <Link href={route("news")}>
                                <ArrowLeft aria-hidden="true" />
                                <span>Kembali ke semua berita</span>
                            </Link>
                        </footer>
                    </article>
                </section>

                {recommendations.length > 0 && (
                    <section className="news-story-related">
                        <div className="news-story-related__header">
                            <div>
                                <span>Bacaan berikutnya</span>
                                <h2>Berita lainnya.</h2>
                            </div>
                            <Link
                                href={route("news")}
                                className="news-story-all-link"
                            >
                                <span>Lihat semua berita</span>
                                <ArrowUpRight aria-hidden="true" />
                            </Link>
                        </div>

                        <div className="news-story-related__grid">
                            {recommendations.map((item, index) => (
                                <SimilarCard
                                    key={item.id}
                                    item={item}
                                    index={index}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </main>

            <Footer />
        </>
    );
}
