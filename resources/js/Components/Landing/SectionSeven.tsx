import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { FocusEvent, PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";

export interface PublicTestimonial {
    id: string | number;
    image?: string | null;
    quote: string;
    authorName: string;
    authorRole: string;
    authorLogo?: string | null;
}

export interface PublicReview {
    id: number;
    reviewer_name: string;
    rating: number;
    text: string;
}

const TESTIMONIAL_VISUAL_IMAGE =
    "/assets/icons/testimonial-ub-sport-center.avif";
const MALANG_TENNIS_LOGO =
    "/assets/icons/ulasan-malang-tennis-academy-ubsc.avif";

const DUMMY_TESTIMONIALS: PublicTestimonial[] = [
    {
        id: 1,
        image: TESTIMONIAL_VISUAL_IMAGE,
        quote: "Malang Tenis Academy mengapresiasi kualitas fasilitas lapangan tenis di UB Sport Center yang terjaga baik dan memenuhi standar latihan serta pembinaan atlet profesional.",
        authorName: "Malang Tennis Academy",
        authorRole: "Akademi Tenis",
        authorLogo: MALANG_TENNIS_LOGO,
    },
    {
        id: 2,
        image: TESTIMONIAL_VISUAL_IMAGE,
        quote: "Fasilitas lapangan futsal di UB Sport Center sangat terawat dan nyaman. Kami rutin mengadakan latihan di sini setiap minggunya.",
        authorName: "UB Football Club",
        authorRole: "Klub Sepak Bola",
        authorLogo: null,
    },
    {
        id: 3,
        image: TESTIMONIAL_VISUAL_IMAGE,
        quote: "Pelayanan staf yang ramah dan fasilitas ganti yang bersih membuat pengalaman olahraga kami semakin menyenangkan.",
        authorName: "Brawijaya Badminton Club",
        authorRole: "Komunitas Olahraga",
        authorLogo: null,
    },
];

const FIXED_STATS = [
    {
        value: 122,
        decimals: 0,
        suffix: "+",
        label: "Jumlah Ulasan",
        sublabel: "Pelayanan Terpercaya",
    },
    {
        value: 99,
        decimals: 0,
        suffix: "%",
        label: "Tingkat Kepuasan",
        sublabel: "Kualitas Terjamin",
    },
] as const;

type TestimonialStat = (typeof FIXED_STATS)[number];

interface SectionSevenProps {
    testimonials?: PublicTestimonial[];
    reviews?: PublicReview[];
    sectionNumber?: string;
    sectionTitle?: string;
    sectionSubtitle?: string;
    dividerLineWeight?: "default" | "hairline";
}

type NormalizedTestimonial = PublicTestimonial & {
    image: string;
    authorLogo?: string;
    quote: string;
};

interface TestimonialEntranceOptions {
    enabled?: boolean;
    threshold?: number;
    rootMargin?: string;
    completeDelay?: number;
}

function useTestimonialEntrance<T extends HTMLElement>({
    enabled = true,
    threshold = 0.16,
    rootMargin = "0px 0px -12% 0px",
    completeDelay = 1380,
}: TestimonialEntranceOptions = {}) {
    const entranceReady = useHomepageEntranceReady();
    const ref = useRef<T>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!entranceReady || !node || isVisible || !enabled) return;

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion || !("IntersectionObserver" in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsVisible(true);
                observer.disconnect();
            },
            {
                threshold,
                rootMargin,
            },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [enabled, entranceReady, isVisible, rootMargin, threshold]);

    useEffect(() => {
        if (!isVisible || isComplete) return;

        const timer = window.setTimeout(
            () => setIsComplete(true),
            completeDelay,
        );

        return () => window.clearTimeout(timer);
    }, [completeDelay, isComplete, isVisible]);

    return {
        ref,
        isVisible,
        className: `${isVisible ? "is-visible" : ""} ${
            isComplete ? "is-complete" : ""
        }`.trim(),
    };
}

function normalizeMediaUrl(source?: string | null): string | undefined {
    if (!source) return undefined;

    if (
        source.startsWith("/") ||
        source.startsWith("http://") ||
        source.startsWith("https://") ||
        source.startsWith("data:") ||
        source.startsWith("blob:")
    ) {
        return source;
    }

    return `/${source.replace(/^public\//, "")}`;
}

function fallbackMedia(authorName: string): string {
    return TESTIMONIAL_VISUAL_IMAGE;
}

function isKnownLogoMedia(source?: string): boolean {
    if (!source) return false;

    return source
        .toLowerCase()
        .includes("ulasan-malang-tennis-academy-ubsc");
}

function fallbackAuthorLogo(authorName: string): string | undefined {
    const name = authorName.toLowerCase();

    if (name.includes("tennis") || name.includes("tenis")) {
        return MALANG_TENNIS_LOGO;
    }

    return undefined;
}

function authorInitials(authorName: string): string {
    const words = authorName
        .replace(/[^a-zA-Z0-9\s]/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) return "UB";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

    return words
        .slice(0, 2)
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase();
}

function AuthorLogoMark({
    source,
    authorName,
}: {
    source?: string | null;
    authorName: string;
}) {
    const [hasError, setHasError] = useState(false);
    const initials = authorInitials(authorName);

    useEffect(() => {
        setHasError(false);
    }, [source]);

    if (source && !hasError) {
        return (
            <img
                src={source}
                alt={authorName}
                loading="lazy"
                decoding="async"
                {...({ fetchpriority: "low" } as Record<string, string>)}
                className="h-full w-full object-cover"
                onError={() => setHasError(true)}
            />
        );
    }

    return (
        <span className="flex h-full w-full items-center justify-center rounded-[3px] bg-gradient-to-br from-[#0F5A7A] via-[#164E68] to-[#071A28] font-clash text-[1.05rem] font-semibold leading-none text-white">
            {initials}
        </span>
    );
}

function cleanQuote(quote: string): string {
    let value = quote.trim();
    const quoteMarks = new Set([34, 39, 96, 8216, 8217, 8220, 8221]);

    while (value.length > 0 && quoteMarks.has(value.charCodeAt(0))) {
        value = value.slice(1).trimStart();
    }

    while (
        value.length > 0 &&
        quoteMarks.has(value.charCodeAt(value.length - 1))
    ) {
        value = value.slice(0, -1).trimEnd();
    }

    return value;
}

function quoteText(quote: string): string {
    return `${String.fromCharCode(8220)}${quote}${String.fromCharCode(8221)}`;
}

interface QuoteLine {
    text: string;
    top: number;
    left: number;
    width: number;
    height: number;
}

function TestimonialQuoteReveal({
    text,
    className,
    active,
    delay,
    stagger,
}: {
    text: string;
    className: string;
    active: boolean;
    delay: number;
    stagger: number;
}) {
    const rootRef = useRef<HTMLParagraphElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);
    const [lines, setLines] = useState<QuoteLine[]>([]);
    const [isVisible, setIsVisible] = useState(false);
    const tokens = useMemo(() => text.split(/(\s+)/), [text]);

    const measureLines = useCallback(() => {
        const root = rootRef.current;
        const measure = measureRef.current;

        if (!root || !measure) return;

        const rootRect = root.getBoundingClientRect();
        const wordNodes = Array.from(
            measure.querySelectorAll<HTMLElement>(
                "[data-testimonial-quote-word]",
            ),
        );
        const measured: Array<
            QuoteLine & { right: number; bottom: number }
        > = [];

        wordNodes.forEach((node) => {
            const rect = node.getBoundingClientRect();
            const value = node.textContent ?? "";

            if (!value.trim() || rect.width <= 0 || rect.height <= 0) return;

            const top = rect.top - rootRect.top;
            const left = rect.left - rootRect.left;
            const right = rect.right - rootRect.left;
            const bottom = rect.bottom - rootRect.top;
            const line = measured.find(
                (item) =>
                    Math.abs(item.top - top) <=
                    Math.max(2, rect.height * 0.28),
            );

            if (line) {
                line.text = `${line.text} ${value}`;
                line.left = Math.min(line.left, left);
                line.top = Math.min(line.top, top);
                line.right = Math.max(line.right, right);
                line.bottom = Math.max(line.bottom, bottom);
                line.width = line.right - line.left;
                line.height = line.bottom - line.top;
                return;
            }

            measured.push({
                text: value,
                top,
                left,
                right,
                bottom,
                width: right - left,
                height: bottom - top,
            });
        });

        setLines(
            measured
                .sort((a, b) => a.top - b.top)
                .map(({ right: _right, bottom: _bottom, ...line }) => ({
                    ...line,
                    top: line.top - 4,
                    height: line.height + 14,
                    width: rootRect.width - line.left + 18,
                })),
        );
    }, []);

    useEffect(() => {
        setIsVisible(false);
        setLines([]);

        const firstFrame = window.requestAnimationFrame(() => {
            measureLines();
            window.setTimeout(measureLines, 80);
        });

        return () => window.cancelAnimationFrame(firstFrame);
    }, [measureLines, text]);

    useEffect(() => {
        measureLines();

        let measureFrame = 0;
        let viewportWidth = document.documentElement.clientWidth;
        let rootWidth =
            rootRef.current?.getBoundingClientRect().width ?? 0;

        const scheduleMeasure = () => {
            window.cancelAnimationFrame(measureFrame);
            measureFrame = window.requestAnimationFrame(measureLines);
        };

        const handleResize = () => {
            const nextViewportWidth = document.documentElement.clientWidth;
            if (Math.abs(nextViewportWidth - viewportWidth) < 1) return;

            viewportWidth = nextViewportWidth;
            scheduleMeasure();
        };
        window.addEventListener("resize", handleResize);

        const observer =
            "ResizeObserver" in window
                ? new ResizeObserver(([entry]) => {
                      const nextRootWidth =
                          entry?.contentRect.width ??
                          rootRef.current?.getBoundingClientRect().width ??
                          0;

                      if (Math.abs(nextRootWidth - rootWidth) < 0.5) return;

                      rootWidth = nextRootWidth;
                      scheduleMeasure();
                  })
                : null;

        if (rootRef.current) observer?.observe(rootRef.current);

        document.fonts?.ready.then(measureLines).catch(() => {});

        return () => {
            window.cancelAnimationFrame(measureFrame);
            window.removeEventListener("resize", handleResize);
            observer?.disconnect();
        };
    }, [measureLines]);

    useEffect(() => {
        if (!active) {
            setIsVisible(false);
            return;
        }

        let secondFrame = 0;
        const firstFrame = window.requestAnimationFrame(() => {
            measureLines();
            secondFrame = window.requestAnimationFrame(() => {
                setIsVisible(true);
            });
        });

        return () => {
            window.cancelAnimationFrame(firstFrame);
            if (secondFrame) window.cancelAnimationFrame(secondFrame);
        };
    }, [active, measureLines, text]);

    return (
        <p
            ref={rootRef}
            aria-label={text}
            className={`testimonial-quote-text testimonial-quote-final-reveal ${
                isVisible ? "is-visible" : ""
            } ${className}`}
        >
            <span className="testimonial-quote-final-reveal__ghost" aria-hidden>
                {text}
            </span>
            <span
                ref={measureRef}
                className="testimonial-quote-final-reveal__measure"
                aria-hidden
            >
                {tokens.map((token, index) => {
                    if (token.trim() === "") return token;

                    return (
                        <span
                            key={`${token}-${index}`}
                            data-testimonial-quote-word
                        >
                            {token}
                        </span>
                    );
                })}
            </span>
            <span
                className="testimonial-quote-final-reveal__overlay"
                aria-hidden
            >
                {lines.map((line, index) => (
                    <span
                        key={`${line.text}-${index}`}
                        className="testimonial-quote-final-reveal__clip"
                        style={
                            {
                                top: `${line.top}px`,
                                left: `${line.left}px`,
                                width: `${line.width}px`,
                                height: `${line.height}px`,
                                "--testimonial-quote-delay": `${
                                    delay + index * stagger
                                }ms`,
                            } as CSSProperties
                        }
                    >
                        <span className="testimonial-quote-final-reveal__line">
                            {line.text}
                        </span>
                    </span>
                ))}
            </span>
        </p>
    );
}

function CountUpValue({
    stat,
    active,
    delay,
}: {
    stat: TestimonialStat;
    active: boolean;
    delay: number;
}) {
    const valueRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!active || !valueRef.current) return;

        const node = valueRef.current;
        const finalValue = `${stat.value.toFixed(stat.decimals)}${stat.suffix}`;
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;

        if (reducedMotion) {
            node.textContent = finalValue;
            return;
        }

        let frame = 0;
        const timer = window.setTimeout(() => {
            const startedAt = performance.now();
            const duration = 2400;

            const tick = (now: number) => {
                const progress = Math.min((now - startedAt) / duration, 1);
                const eased =
                    progress < 0.5
                        ? 4 * progress * progress * progress
                        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

                node.textContent = `${(stat.value * eased).toFixed(
                    stat.decimals,
                )}${stat.suffix}`;

                if (progress < 1) {
                    frame = window.requestAnimationFrame(tick);
                } else {
                    node.textContent = finalValue;
                }
            };

            frame = window.requestAnimationFrame(tick);
        }, delay);

        return () => {
            window.clearTimeout(timer);
            window.cancelAnimationFrame(frame);
        };
    }, [active, delay, stat]);

    return (
        <span ref={valueRef} aria-label={`${stat.value}${stat.suffix}`}>
            0{stat.suffix}
        </span>
    );
}

function numericCssValue(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function AnimatedIdentityCard({
    animationKey,
    outerClassName,
    innerClassName,
    children,
}: {
    animationKey: string | number;
    outerClassName: string;
    innerClassName: string;
    children: ReactNode;
}) {
    const rootRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const previousSizeRef = useRef<{ width: number; height: number } | null>(
        null,
    );
    const [animatedSize, setAnimatedSize] = useState<{
        width: number;
        height: number;
    } | null>(null);

    useLayoutEffect(() => {
        const root = rootRef.current;
        const content = contentRef.current;

        if (!root || !content) return;

        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        const styles = window.getComputedStyle(root);
        const horizontalChrome =
            numericCssValue(styles.paddingLeft) +
            numericCssValue(styles.paddingRight) +
            numericCssValue(styles.borderLeftWidth) +
            numericCssValue(styles.borderRightWidth);
        const verticalChrome =
            numericCssValue(styles.paddingTop) +
            numericCssValue(styles.paddingBottom) +
            numericCssValue(styles.borderTopWidth) +
            numericCssValue(styles.borderBottomWidth);
        const contentRect = content.getBoundingClientRect();
        const nextSize = {
            width: Math.ceil(contentRect.width + horizontalChrome),
            height: Math.ceil(contentRect.height + verticalChrome),
        };
        const previousSize = previousSizeRef.current;

        previousSizeRef.current = nextSize;

        if (
            previousSize === null ||
            reducedMotion ||
            (Math.abs(previousSize.width - nextSize.width) < 1 &&
                Math.abs(previousSize.height - nextSize.height) < 1)
        ) {
            setAnimatedSize(null);
            return;
        }

        setAnimatedSize(previousSize);

        const frame = window.requestAnimationFrame(() => {
            setAnimatedSize(nextSize);
        });
        const timer = window.setTimeout(() => {
            setAnimatedSize(null);
        }, 780);

        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(timer);
        };
    }, [animationKey]);

    return (
        <div
            ref={rootRef}
            className={`testimonial-identity-card ${outerClassName}`}
            style={
                animatedSize === null
                    ? undefined
                    : ({
                          width: animatedSize.width,
                          height: animatedSize.height,
                      } as CSSProperties)
            }
        >
            <div
                ref={contentRef}
                className="testimonial-identity-card__content"
            >
                <div
                    key={animationKey}
                    className={`testimonial-identity-card__motion ${innerClassName}`}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}

const decodedTestimonialMedia = new Set<string>();
const pendingTestimonialMedia = new Map<string, Promise<string>>();

function decodeTestimonialMedia(source: string): Promise<string> {
    if (decodedTestimonialMedia.has(source)) {
        return Promise.resolve(source);
    }

    const pending = pendingTestimonialMedia.get(source);

    if (pending) return pending;

    const promise = new Promise<string>((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => {
            decodedTestimonialMedia.add(source);
            pendingTestimonialMedia.delete(source);
            resolve(source);
        };
        image.onerror = () => {
            pendingTestimonialMedia.delete(source);
            reject(new Error(`Unable to decode testimonial media: ${source}`));
        };
        image.src = source;

        if (image.complete && image.naturalWidth > 0) {
            decodedTestimonialMedia.add(source);
            pendingTestimonialMedia.delete(source);
            resolve(source);
            return;
        }

        void image.decode?.().then(() => {
            decodedTestimonialMedia.add(source);
            pendingTestimonialMedia.delete(source);
            resolve(source);
        }).catch(() => {
            // Let onload/onerror settle the promise; some browsers reject decode
            // while still completing the image shortly after.
        });
    });

    pendingTestimonialMedia.set(source, promise);
    return promise;
}

function TestimonialSlidePanel({
    item,
    index,
    isActive,
    slideCycle,
    onScrollPrev,
    onScrollNext,
}: {
    item: NormalizedTestimonial;
    index: number;
    isActive: boolean;
    slideCycle: number;
    onScrollPrev: () => void;
    onScrollNext: () => void;
}) {
    const mobileSummaryEntrance = useTestimonialEntrance<HTMLDivElement>({
        enabled: isActive,
        threshold: 0.18,
        rootMargin: "0px 0px -10% 0px",
    });
    const mobileControlsEntrance = useTestimonialEntrance<HTMLDivElement>({
        enabled: isActive,
        threshold: 0.18,
        rootMargin: "0px 0px -8% 0px",
        completeDelay: 1120,
    });
    const desktopMediaEntrance = useTestimonialEntrance<HTMLDivElement>({
        enabled: isActive,
        threshold: 0.16,
        rootMargin: "0px 0px -13% 0px",
    });
    const quoteEntrance = useTestimonialEntrance<HTMLQuoteElement>({
        enabled: isActive,
        threshold: 0.16,
        rootMargin: "0px 0px -11% 0px",
        completeDelay: 1880,
    });

    return (
        <div
            className={`min-w-0 flex-[0_0_100%] ${
                isActive ? "testimonial-slide-cycle is-active" : ""
            }`}
        >
            <div className="testimonial-mobile-summary">
                <div
                    ref={mobileSummaryEntrance.ref}
                    className={`testimonial-entrance-reveal testimonial-entrance-reveal--mobile-summary testimonial-mobile-summary__top ${mobileSummaryEntrance.className}`}
                >
                    <div
                        className={`testimonial-slide-reveal testimonial-slide-reveal--media testimonial-mobile-media-frame overflow-hidden rounded-[5px] ${
                            isActive && mobileSummaryEntrance.isVisible
                                ? "is-visible"
                                : ""
                        }`}
                    >
                        <img
                            src={item.image}
                            alt={item.authorName}
                            className="h-full w-full object-cover"
                            draggable={false}
                            loading="lazy"
                            decoding="async"
                            {...({
                                fetchpriority: "low",
                            } as Record<string, string>)}
                            onError={(event) => {
                                event.currentTarget.src = fallbackMedia(
                                    item.authorName,
                                );
                            }}
                        />
                    </div>
                    <div className="testimonial-mobile-stats">
                        {FIXED_STATS.map((stat, statIndex) => (
                            <div
                                key={stat.label}
                                className="testimonial-mobile-stat"
                            >
                                <span className="testimonial-mobile-stat__value">
                                    <CountUpValue
                                        stat={stat}
                                        active={
                                            isActive &&
                                            mobileSummaryEntrance.isVisible
                                        }
                                        delay={420 + statIndex * 140}
                                    />
                                </span>
                                <span className="testimonial-mobile-stat__label">
                                    {stat.label}
                                </span>
                                <span className="testimonial-mobile-stat__sublabel">
                                    {stat.sublabel}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
                <div
                    ref={mobileControlsEntrance.ref}
                    className={`testimonial-entrance-reveal testimonial-entrance-reveal--controls testimonial-mobile-controls ${mobileControlsEntrance.className}`}
                >
                    <button
                        type="button"
                        onClick={onScrollPrev}
                        aria-label="Previous testimonial"
                        className="testimonial-mobile-control testimonial-mobile-control--prev"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={onScrollNext}
                        aria-label="Next testimonial"
                        className="testimonial-mobile-control testimonial-mobile-control--next"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>
            <div className="testimonial-slide-layout">
                <div
                    ref={desktopMediaEntrance.ref}
                    className="testimonial-media-column"
                >
                    <div
                        className={`testimonial-slide-reveal testimonial-slide-reveal--media testimonial-media-frame aspect-[5/6] overflow-hidden rounded-[5px] ${
                            isActive && desktopMediaEntrance.isVisible
                                ? "is-visible"
                                : ""
                        }`}
                    >
                        <img
                            src={item.image}
                            alt={item.authorName}
                            className="h-full w-full object-cover"
                            draggable={false}
                            loading="lazy"
                            decoding="async"
                            {...({
                                fetchpriority: "low",
                            } as Record<string, string>)}
                            onError={(event) => {
                                event.currentTarget.src = fallbackMedia(
                                    item.authorName,
                                );
                            }}
                        />
                    </div>
                </div>
                <div className="testimonial-quote-column relative flex flex-col">
                    <blockquote
                        ref={quoteEntrance.ref}
                        key={
                            isActive
                                ? `desktop-quote-${item.id}-${slideCycle}`
                                : `desktop-quote-${item.id}`
                        }
                        className={`testimonial-text-rail testimonial-slide-reveal testimonial-slide-reveal--quote relative z-10 mb-4 w-full ${
                            isActive && quoteEntrance.isVisible
                                ? "is-visible"
                                : ""
                        }`}
                    >
                        <TestimonialQuoteReveal
                            text={quoteText(item.quote)}
                            active={isActive && quoteEntrance.isVisible}
                            delay={650}
                            stagger={92}
                            className="home-section-heading testimonial-quote-text section-two-headline-weight indent-[2rem] sm:indent-[3.5rem] lg:indent-[8rem] xl:indent-[8rem] font-bdo text-[clamp(1.9rem,7.2vw,2.55rem)] font-medium leading-[1.01] tracking-[-0.058em] text-gray-900 md:text-[clamp(2.12rem,4.35vw,2.82rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:text-[clamp(3.5rem,3.3vw,4.1rem)]"
                        />
                    </blockquote>
                </div>
            </div>
        </div>
    );
}

export default function SectionSeven({
    testimonials = DUMMY_TESTIMONIALS,
    sectionNumber = "07",
    sectionTitle = "Testimoni",
    sectionSubtitle = "01 homepage",
    dividerLineWeight = "default",
}: SectionSevenProps) {
    const entranceReady = useHomepageEntranceReady();
    const sectionRef = useRef<HTMLElement>(null);
    const normalizedTestimonials = useMemo<NormalizedTestimonial[]>(() => {
        const source =
            testimonials.length > 0 ? testimonials : DUMMY_TESTIMONIALS;

        return source.map((item) => {
            const fallback = fallbackMedia(item.authorName);
            const image = normalizeMediaUrl(item.image);
            const authorLogo = normalizeMediaUrl(item.authorLogo);

            return {
                ...item,
                image: image && !isKnownLogoMedia(image) ? image : fallback,
                authorLogo:
                    authorLogo ??
                    (image && isKnownLogoMedia(image)
                        ? image
                        : fallbackAuthorLogo(item.authorName)),
                quote: cleanQuote(item.quote),
            };
        });
    }, [testimonials]);

    const [emblaRef, emblaApi] = useEmblaCarousel({
        loop: normalizedTestimonials.length > 1,
    });
    const [activeIndex, setActiveIndex] = useState(0);
    const [slideCycle, setSlideCycle] = useState(0);
    const [isSectionVisible, setIsSectionVisible] = useState(false);
    const pauseUntilRef = useRef(0);
    const pointerInsideRef = useRef(false);
    const focusInsideRef = useRef(false);
    const touchActiveRef = useRef(false);

    const pauseAutoplay = useCallback((duration = 9000) => {
        pauseUntilRef.current = Math.max(
            pauseUntilRef.current,
            performance.now() + duration,
        );
    }, []);

    const canAutoplay = useCallback(() => {
        if (document.hidden) return false;
        if (
            pointerInsideRef.current ||
            focusInsideRef.current ||
            touchActiveRef.current
        ) {
            return false;
        }

        return performance.now() >= pauseUntilRef.current;
    }, []);

    const handleScrollPrev = useCallback(() => {
        pauseAutoplay(10000);
        emblaApi?.scrollPrev(true);
    }, [emblaApi, pauseAutoplay]);

    const handleScrollNext = useCallback(() => {
        pauseAutoplay(10000);
        emblaApi?.scrollNext(true);
    }, [emblaApi, pauseAutoplay]);

    const handlePointerEnter = useCallback(
        (event: PointerEvent<HTMLElement>) => {
            if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
                return;
            }

            pointerInsideRef.current = true;
        },
        [],
    );

    const handlePointerLeave = useCallback(
        (event: PointerEvent<HTMLElement>) => {
            if (event.pointerType !== "mouse" && event.pointerType !== "pen") {
                return;
            }

            pointerInsideRef.current = false;
            pauseAutoplay(2800);
        },
        [pauseAutoplay],
    );

    const handleFocusCapture = useCallback(() => {
        focusInsideRef.current = true;
    }, []);

    const handleBlurCapture = useCallback(
        (event: FocusEvent<HTMLElement>) => {
            const nextTarget = event.relatedTarget;

            if (
                nextTarget instanceof Node &&
                event.currentTarget.contains(nextTarget)
            ) {
                return;
            }

            focusInsideRef.current = false;
            pauseAutoplay(2800);
        },
        [pauseAutoplay],
    );

    const handleWheelCapture = useCallback(() => {
        pauseAutoplay(3800);
    }, [pauseAutoplay]);

    const handleTouchStartCapture = useCallback(() => {
        touchActiveRef.current = true;
        pauseAutoplay(12000);
    }, [pauseAutoplay]);

    const handleTouchEndCapture = useCallback(() => {
        touchActiveRef.current = false;
        pauseAutoplay(9000);
    }, [pauseAutoplay]);

    useEffect(() => {
        if (activeIndex < normalizedTestimonials.length) return;
        setActiveIndex(0);
    }, [activeIndex, normalizedTestimonials.length]);

    useEffect(() => {
        if (!emblaApi) return;

        const pauseForDrag = () => pauseAutoplay(12000);
        const pauseAfterSettle = () => pauseAutoplay(6500);

        emblaApi.on("pointerDown", pauseForDrag);
        emblaApi.on("settle", pauseAfterSettle);

        return () => {
            emblaApi.off("pointerDown", pauseForDrag);
            emblaApi.off("settle", pauseAfterSettle);
        };
    }, [emblaApi, pauseAutoplay]);

    useEffect(() => {
        if (!emblaApi) return;

        const onSelect = () => {
            const selected = emblaApi.selectedScrollSnap();

            setActiveIndex((current) => {
                if (current === selected) return current;

                setSlideCycle((value) => value + 1);
                return selected;
            });
        };

        emblaApi.on("select", onSelect);
        onSelect();

        return () => {
            emblaApi.off("select", onSelect);
        };
    }, [emblaApi]);

    useEffect(() => {
        if (!entranceReady) return;

        const section = sectionRef.current;
        if (!section) return;

        let completeTimer = 0;
        const reveal = () => {
            setIsSectionVisible(true);
            section.classList.add("is-visible");
            completeTimer = window.setTimeout(
                () => section.classList.add("is-complete"),
                2100,
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
                threshold: 0.03,
                rootMargin: "0px 0px -5% 0px",
            },
        );

        observer.observe(section);
        return () => {
            observer.disconnect();
            window.clearTimeout(completeTimer);
        };
    }, [entranceReady]);

    useEffect(() => {
        if (
            !emblaApi ||
            !isSectionVisible ||
            normalizedTestimonials.length < 2 ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            return;
        }

        let timer = 0;

        const tick = () => {
            timer = window.setTimeout(() => {
                if (canAutoplay()) {
                    emblaApi.scrollNext(true);
                }

                tick();
            }, 7000);
        };

        tick();

        return () => window.clearTimeout(timer);
    }, [
        canAutoplay,
        emblaApi,
        isSectionVisible,
        normalizedTestimonials.length,
    ]);

    const activeItem =
        normalizedTestimonials[activeIndex % normalizedTestimonials.length] ??
        normalizedTestimonials[0];
    const labelEntrance = useTestimonialEntrance<HTMLDivElement>({
        threshold: 0.18,
        rootMargin: "0px 0px -14% 0px",
        completeDelay: 1120,
    });
    const footerEntrance = useTestimonialEntrance<HTMLDivElement>({
        threshold: 0.18,
        rootMargin: "0px 0px -10% 0px",
        completeDelay: 1640,
    });

    return (
        <section
            ref={sectionRef}
            id="testimonials"
            data-navbar-surface="light"
            className="testimonial-entrance-stage w-full bg-white px-[clamp(1.5rem,4.5vw,5.5rem)] py-14 sm:py-16 lg:py-20 xl:py-[5.9rem]"
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onFocusCapture={handleFocusCapture}
            onBlurCapture={handleBlurCapture}
            onWheelCapture={handleWheelCapture}
            onTouchStartCapture={handleTouchStartCapture}
            onTouchEndCapture={handleTouchEndCapture}
            onTouchCancelCapture={handleTouchEndCapture}
        >
            <div className="mx-auto">
                <SectionDivider
                    number={sectionNumber}
                    title={sectionTitle}
                    subtitle={sectionSubtitle}
                    theme="light"
                    outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                    contentClassName="px-3"
                    lineWeight={dividerLineWeight}
                />
            </div>

            <div
                ref={labelEntrance.ref}
                className={`testimonial-entrance-reveal testimonial-entrance-reveal--label mt-10 mb-8 flex items-center gap-4 lg:relative lg:z-20 lg:mb-[-1.8rem] ${labelEntrance.className}`}
            >
                <span className="section-label-diamond" />
                <span className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-gray-900 lg:text-[1.25rem]">
                    Apa Kata Mereka?
                </span>
            </div>

            <div>
                <div className="overflow-hidden" ref={emblaRef}>
                    <div className="flex">
                        {normalizedTestimonials.map((item, index) => (
                            <TestimonialSlidePanel
                                key={item.id}
                                item={item}
                                index={index}
                                isActive={
                                    index ===
                                    activeIndex %
                                        normalizedTestimonials.length
                                }
                                slideCycle={slideCycle}
                                onScrollPrev={handleScrollPrev}
                                onScrollNext={handleScrollNext}
                            />
                        ))}
                    </div>
                </div>

                <div
                    ref={footerEntrance.ref}
                    className={`testimonial-entrance-reveal testimonial-entrance-reveal--footer mt-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-12 lg:gap-16 ${footerEntrance.className}`}
                >
                    <div className="testimonial-footer-controls flex items-center gap-3 lg:col-span-4 lg:mt-[33px]">
                        <button
                            type="button"
                            onClick={handleScrollPrev}
                            aria-label="Previous testimonial"
                            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full border border-gray-900 text-gray-900 transition-colors duration-200 hover:bg-gray-200"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            type="button"
                            onClick={handleScrollNext}
                            aria-label="Next testimonial"
                            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-white transition-colors duration-200 hover:bg-gray-700"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <div className="testimonial-text-rail lg:col-span-8">
                        <div className="mb-8 border-t border-gray-200" />
                        <div className="grid max-w-[1100px] grid-cols-1 items-center gap-6 sm:grid-cols-[minmax(250px,1.45fr)_minmax(135px,.72fr)_minmax(135px,.72fr)] sm:gap-[clamp(2rem,4vw,5rem)]">
                            <div
                                className={`testimonial-footer-identity testimonial-slide-cycle is-active min-w-0 ${
                                    footerEntrance.isVisible
                                        ? "is-visible"
                                        : ""
                                }`}
                            >
                                <AnimatedIdentityCard
                                    animationKey={`desktop-${activeItem.id}-${slideCycle}`}
                                    outerClassName="min-w-0 rounded-[5px] bg-[#F7F7F7] p-[5px]"
                                    innerClassName="flex items-center gap-4"
                                >
                                    <div className="testimonial-identity-avatar-reveal flex h-[5.9rem] w-[5.9rem] flex-shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-gray-100">
                                        <AuthorLogoMark
                                            source={activeItem.authorLogo}
                                            authorName={activeItem.authorName}
                                        />
                                    </div>
                                    <div className="flex min-w-0 flex-col pr-4">
                                        <ScrollTextReveal
                                            as="span"
                                            split="words"
                                            delay={910}
                                            stagger={24}
                                            triggerOnMount
                                            className="font-clash text-[clamp(0.875rem,1.04vw,20px)] font-medium leading-tight text-gray-900"
                                        >
                                            {activeItem.authorName}
                                        </ScrollTextReveal>
                                        <ScrollTextReveal
                                            as="span"
                                            split="words"
                                            delay={1010}
                                            stagger={20}
                                            triggerOnMount
                                            className="mt-0.5 font-clash text-[clamp(0.75rem,0.83vw,16px)] font-regular text-gray-500"
                                        >
                                            {activeItem.authorRole}
                                        </ScrollTextReveal>
                                    </div>
                                </AnimatedIdentityCard>
                            </div>
                            {FIXED_STATS.map((stat, index) => (
                                <div
                                    key={stat.label}
                                    className="testimonial-footer-stat flex flex-col"
                                >
                                    <span className="font-bdo text-[clamp(1.25rem,2.08vw,40px)] font-regular tracking-tight text-gray-900">
                                        <CountUpValue
                                            stat={stat}
                                            active={footerEntrance.isVisible}
                                            delay={420 + index * 140}
                                        />
                                    </span>
                                    <span className="mt-1 font-bdo text-[clamp(0.75rem,0.73vw,14px)] font-semibold text-gray-800">
                                        {stat.label}
                                    </span>
                                    <span className="font-bdo text-xs font-regular text-gray-500">
                                        {stat.sublabel}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

