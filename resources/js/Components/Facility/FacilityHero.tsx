import useEmblaCarousel from "embla-carousel-react";
import {
    type CSSProperties,
    type ReactNode,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import TopBg from "@/../assets/hero/Top.png";
import "./FacilityHero.css";

interface FacilityHeroImage {
    src: string;
    alt: string;
    title: string;
    category: string;
    width: number;
    height: number;
    position?: string;
}

const FACILITY_IMAGES: FacilityHeroImage[] = [
    {
        src: "/assets/images/fasilitas-tenis-ub-sport-center.avif",
        alt: "Lapangan tenis UB Sport Center",
        title: "Lapangan Tenis",
        category: "Outdoor / Tennis",
        width: 2048,
        height: 1118,
        position: "center 54%",
    },
    {
        src: "/assets/images/gym-konten-2-olahraga-ub-sport-center.avif",
        alt: "Area performance gym UB Sport Center",
        title: "Performance Gym",
        category: "Indoor / Training",
        width: 677,
        height: 668,
        position: "center 42%",
    },
    {
        src: "/assets/images/fasilitas-sepak-bola-ub-sport-center.avif",
        alt: "Arena sepak bola UB Sport Center",
        title: "Football Arena",
        category: "Outdoor / Football",
        width: 2048,
        height: 1534,
        position: "center 58%",
    },
    {
        src: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
        alt: "Arena terbuka Dieng UB Sport Center",
        title: "Arena Dieng",
        category: "Outdoor / Open Field",
        width: 1024,
        height: 682,
        position: "center 48%",
    },
    {
        src: "/assets/images/fasilitas-bulutangkis-ub-sport-center.avif",
        alt: "Lapangan bulutangkis UB Sport Center",
        title: "Badminton Hall",
        category: "Indoor / Badminton",
        width: 1024,
        height: 559,
    },
    {
        src: "/assets/images/gym-konten-1-olahraga-ub-sport-center.avif",
        alt: "Ruang latihan gym UB Sport Center",
        title: "Training Gym",
        category: "Indoor / Strength",
        width: 845,
        height: 677,
    },
];

function HeroObjectReveal({
    children,
    className = "",
    delay = 0,
}: {
    children: ReactNode;
    className?: string;
    delay?: number;
}) {
    const elementRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = elementRef.current;
        if (!element) return;

        if (!window.IntersectionObserver) {
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
                threshold: 0.04,
                rootMargin: "120px 0px 40px 0px",
            },
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={elementRef}
            className={`facility-hero__reveal ${
                isVisible ? "is-visible" : ""
            } ${className}`}
            style={
                {
                    "--facility-hero-reveal-delay": `${delay}ms`,
                } as CSSProperties
            }
        >
            {children}
        </div>
    );
}

function FacilityHeroSlide({
    image,
    index,
}: {
    image: FacilityHeroImage;
    index: number;
}) {
    const slideRef = useRef<HTMLDivElement>(null);
    const [isPrepared, setIsPrepared] = useState(index === 0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const slide = slideRef.current;
        if (!slide || !window.IntersectionObserver) {
            setIsPrepared(true);
            setIsVisible(true);
            return;
        }

        let prepareTimer = 0;
        let prepareObserver: IntersectionObserver | null = null;

        if (index > 0) {
            prepareObserver = new IntersectionObserver(
                ([entry]) => {
                    if (!entry?.isIntersecting) return;

                    prepareTimer = window.setTimeout(
                        () => setIsPrepared(true),
                        Math.min(index, 4) * 110,
                    );
                    prepareObserver?.disconnect();
                },
                {
                    threshold: 0,
                    rootMargin: "220px 300px 520px 300px",
                },
            );
            prepareObserver.observe(slide);
        }

        const revealObserver = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                setIsVisible(true);
                revealObserver.disconnect();
            },
            {
                threshold: 0.1,
                rootMargin: "0px 80px -4% 80px",
            },
        );

        revealObserver.observe(slide);

        return () => {
            window.clearTimeout(prepareTimer);
            prepareObserver?.disconnect();
            revealObserver.disconnect();
        };
    }, [index]);

    return (
        <div
            ref={slideRef}
            className={`facility-hero__reveal facility-hero__slide ${
                isVisible ? "is-visible" : ""
            } ${
                index % 2 === 0
                    ? "facility-hero__slide--wide"
                    : "facility-hero__slide--narrow"
            }`}
            style={
                {
                    "--facility-hero-reveal-delay": `${130 + index * 55}ms`,
                } as CSSProperties
            }
        >
            <figure>
                {isPrepared && (
                    <img
                        src={image.src}
                        alt={image.alt}
                        width={image.width}
                        height={image.height}
                        loading={index === 0 ? "eager" : "lazy"}
                        decoding="async"
                        style={{
                            objectPosition:
                                image.position ?? "center center",
                        }}
                    />
                )}
                <span
                    className="facility-hero__slide-shade"
                    aria-hidden="true"
                />
                <span className="facility-hero__slide-index font-bdo">
                    /{String(index + 1).padStart(2, "0")}
                </span>
                <figcaption className="font-bdo">
                    <span>{image.title}</span>
                    <small>{image.category}</small>
                </figcaption>
            </figure>
        </div>
    );
}

function ChevronIcon({
    direction = "right",
}: {
    direction?: "left" | "right";
}) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.35"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={direction === "left" ? "rotate-180" : ""}
            aria-hidden="true"
        >
            <path d="M9 5L16 12L9 19" />
        </svg>
    );
}

export default function FacilityHero() {
    const [emblaRef, emblaApi] = useEmblaCarousel({
        loop: false,
        align: "start",
    });
    const [canScrollPrev, setCanScrollPrev] = useState(false);

    const syncControls = useCallback(() => {
        if (!emblaApi) return;
        setCanScrollPrev(emblaApi.canScrollPrev());
    }, [emblaApi]);

    useEffect(() => {
        if (!emblaApi) return;

        syncControls();
        emblaApi.on("select", syncControls).on("reInit", syncControls);

        return () => {
            emblaApi.off("select", syncControls).off("reInit", syncControls);
        };
    }, [emblaApi, syncControls]);

    const scrollPrev = () => {
        if (!emblaApi) return;
        emblaApi.scrollPrev();
        window.requestAnimationFrame(syncControls);
    };

    const scrollNext = () => {
        if (!emblaApi) return;

        if (emblaApi.canScrollNext()) {
            emblaApi.scrollNext();
        } else {
            emblaApi.scrollTo(0);
        }

        window.requestAnimationFrame(syncControls);
    };

    return (
        <section className="facility-hero" id="facility-hero">
            <HeroObjectReveal
                className="facility-hero__background"
                delay={0}
            >
                <img
                    src={TopBg}
                    alt=""
                    width="1920"
                    height="465"
                    decoding="async"
                />
                <span className="facility-hero__background-tone" />
                <span className="facility-hero__background-rule" />
            </HeroObjectReveal>

            <span className="facility-hero__sweep" aria-hidden="true" />

            <HeroObjectReveal
                className="facility-hero__signature font-clash"
                delay={140}
            >
                <span aria-hidden="true">F / 04</span>
            </HeroObjectReveal>

            <div className="facility-hero__stage">
                <div className="facility-hero__intro">
                    <div className="facility-hero__intro-meta font-bdo">
                        <HeroObjectReveal
                            className="facility-hero__intro-meta-item facility-hero__intro-meta-item--kicker"
                            delay={70}
                        >
                            <span className="facility-hero__intro-kicker">
                                <i aria-hidden="true" />
                                UBSC / Facilities
                            </span>
                        </HeroObjectReveal>
                        <HeroObjectReveal
                            className="facility-hero__intro-meta-item facility-hero__intro-meta-item--center"
                            delay={145}
                        >
                            <span>Indoor + Outdoor</span>
                        </HeroObjectReveal>
                        <HeroObjectReveal
                            className="facility-hero__intro-meta-item facility-hero__intro-meta-item--end"
                            delay={220}
                        >
                            <span>Malang / Indonesia</span>
                        </HeroObjectReveal>
                    </div>

                    <div className="facility-hero__title-row">
                        <h1
                            className="facility-hero__title font-bdo"
                            aria-label="Fasilitas Terbaik Kami"
                        >
                            <span className="facility-hero__title-lines facility-hero__title-lines--wide">
                                <ScrollTextReveal
                                    triggerOnMount
                                    delay={285}
                                    className="facility-hero__title-line"
                                >
                                    Fasilitas Terbaik Kami
                                </ScrollTextReveal>
                            </span>
                            <span className="facility-hero__title-lines facility-hero__title-lines--compact">
                                <span className="facility-hero__title-line-clip">
                                    <ScrollTextReveal
                                        triggerOnMount
                                        delay={285}
                                        className="facility-hero__title-line"
                                    >
                                        Fasilitas Terbaik
                                    </ScrollTextReveal>
                                </span>
                                <span className="facility-hero__title-line-clip">
                                    <ScrollTextReveal
                                        triggerOnMount
                                        delay={380}
                                        className="facility-hero__title-line"
                                    >
                                        Kami
                                    </ScrollTextReveal>
                                </span>
                            </span>
                        </h1>
                        <HeroObjectReveal
                            className="facility-hero__title-summary"
                            delay={365}
                        >
                            <p className="font-bdo">
                                <span>01 - 06 / Collection</span>
                                <span>Space for every movement</span>
                            </p>
                        </HeroObjectReveal>
                    </div>
                </div>
            </div>

            <div className="facility-hero__lower">
                <div className="facility-hero-bottom">
                    <HeroBottomBar
                        variant="transparent"
                        sectionNumber="04/"
                        sectionLabel="facilitypage"
                        description="UB Sport Center - Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama."
                        targetId="facility-membership"
                        showVideo={false}
                        lineInset
                        sectionInset
                        mobileCopySmaller
                        mobileCopyLockRight
                        cinematicCopyReveal
                    />
                </div>

                <div className="facility-hero__carousel-shell">
                    <div className="facility-hero__carousel">
                        <div
                            className="facility-hero__carousel-viewport"
                            ref={emblaRef}
                        >
                            <div className="facility-hero__carousel-track">
                                {FACILITY_IMAGES.map((image, index) => (
                                    <FacilityHeroSlide
                                        key={image.src}
                                        image={image}
                                        index={index}
                                    />
                                ))}
                            </div>
                        </div>

                        {canScrollPrev && (
                            <button
                                type="button"
                                onClick={scrollPrev}
                                aria-label="Previous facility image"
                                className="facility-hero__nav facility-hero__nav--prev"
                            >
                                <ChevronIcon direction="left" />
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={scrollNext}
                            aria-label="Next facility image"
                            className="facility-hero__nav facility-hero__nav--next"
                        >
                            <ChevronIcon />
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
