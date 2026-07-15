import { useEffect, useRef, useState, type CSSProperties } from "react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import { Plus } from "lucide-react";
import fresh from "@/../assets/images/fresh water.avif";

const CONTACT_US_URL = "https://wa.me/6285280809080";

function FeatureItem({ text, index }: { text: string; index: number }) {
    return (
        <div
            className="about-contact-feature flex items-center gap-3"
            style={
                {
                    "--about-contact-delay": `${520 + index * 95}ms`,
                } as CSSProperties
            }
        >
            <div className="about-contact-feature-icon flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-red/10">
                <Plus size={10} className="text-accent-red" strokeWidth={2.5} />
            </div>
            <span className="font-bdo text-[clamp(1rem,1.04vw,20px)] font-medium leading-snug text-black">
                {text}
            </span>
        </div>
    );
}

interface AboutSectionContactProps {
    sectionNumber?: string;
    sectionTitle?: string;
    sectionSubtitle?: string;
}

export default function AboutSectionContact({
    sectionNumber = "07",
    sectionTitle = "Informasi",
    sectionSubtitle = "02 aboutpage",
}: AboutSectionContactProps = {}) {
    const sectionRef = useRef<HTMLElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isSettled, setIsSettled] = useState(false);

    useEffect(() => {
        const section = sectionRef.current;
        const image = imageRef.current;
        if (!section || !image) return;

        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }

        let frame = 0;
        let parallaxActive = false;

        const updateParallax = () => {
            if (!parallaxActive) return;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const rect = section.getBoundingClientRect();
                const imageRect =
                    image.parentElement?.getBoundingClientRect() ?? rect;
                const viewportHeight = window.innerHeight;
                const progress = Math.max(
                    -1,
                    Math.min(
                        1,
                        (viewportHeight / 2 -
                            (imageRect.top + imageRect.height / 2)) /
                            (viewportHeight * 0.72),
                    ),
                );

                const parallaxDistance =
                    window.innerWidth >= 1280 ? -58 : -34;

                image.style.setProperty(
                    "--about-contact-image-y",
                    `${progress * parallaxDistance}px`,
                );
            });
        };

        window.addEventListener("scroll", updateParallax, { passive: true });
        window.addEventListener("resize", updateParallax);

        if (!("IntersectionObserver" in window)) {
            parallaxActive = true;
            section.classList.add("is-parallax-active");
            updateParallax();

            return () => {
                cancelAnimationFrame(frame);
                section.classList.remove("is-parallax-active");
                window.removeEventListener("scroll", updateParallax);
                window.removeEventListener("resize", updateParallax);
            };
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                parallaxActive = Boolean(entry?.isIntersecting);
                section.classList.toggle("is-parallax-active", parallaxActive);
                if (parallaxActive) updateParallax();
            },
            { rootMargin: "30% 0px 30% 0px", threshold: 0 },
        );

        observer.observe(section);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            section.classList.remove("is-parallax-active");
            window.removeEventListener("scroll", updateParallax);
            window.removeEventListener("resize", updateParallax);
        };
    }, []);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || isVisible) return;

        if (
            !("IntersectionObserver" in window) ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            setIsVisible(true);
            setIsSettled(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsVisible(true);
                observer.disconnect();
            },
            {
                threshold: 0.12,
                rootMargin: "0px 0px -24% 0px",
            },
        );

        observer.observe(section);
        return () => observer.disconnect();
    }, [isVisible]);

    useEffect(() => {
        if (!isVisible) return;

        const timer = window.setTimeout(() => setIsSettled(true), 1500);
        return () => window.clearTimeout(timer);
    }, [isVisible]);

    return (
        <section
            ref={sectionRef}
            className={`about-contact-stage w-full bg-[#F5F7F9] ${
                isVisible ? "is-visible" : ""
            } ${isSettled ? "is-settled" : ""}`}
            id="about-contact"
        >
            <div className="mx-auto w-full px-[clamp(1.5rem,4.5vw,5.5rem)] py-14 sm:py-16 lg:py-20 xl:py-[5.9rem]">
                <div className="about-contact-object about-contact-object--divider">
                    <SectionDivider
                        number={sectionNumber}
                        title={sectionTitle}
                        subtitle={sectionSubtitle}
                        theme="light"
                        outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                        contentClassName="px-3"
                    />
                </div>

                <div className="mt-10 grid grid-cols-1 gap-12 xl:grid-cols-12 xl:items-center">
                    <div className="flex flex-col xl:col-span-5">
                        <div className="about-contact-kicker mb-6 flex items-center gap-4 xl:gap-3">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal
                                delay={80}
                                className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
                            >
                                Pusat Bantuan
                            </ScrollTextReveal>
                        </div>

                        <ScrollTextReveal
                            as="h2"
                            split="words"
                            delay={130}
                            stagger={34}
                            amount={0.12}
                            className="section-two-headline-weight mb-8 max-w-lg font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-none xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
                        >
                            Hubungi Kami!
                        </ScrollTextReveal>

                        <ScrollTextReveal
                            as="p"
                            split="words"
                            delay={220}
                            stagger={12}
                            amount={0.12}
                            className="mb-8 font-bdo text-[clamp(1rem,1.04vw,20px)] font-normal leading-relaxed text-black/50"
                        >
                            Tim UB Sport Center siap membantu kebutuhan
                            reservasi, informasi layanan, dan konsultasi
                            fasilitas olahraga Anda.
                        </ScrollTextReveal>

                        <hr className="about-contact-line mb-8 border-black/10" />

                        <div className="mb-10 flex flex-col gap-5">
                            <FeatureItem
                                text="Respon cepat dan profesional"
                                index={0}
                            />
                            <FeatureItem
                                text="Layanan reservasi mudah"
                                index={1}
                            />
                        </div>

                        <div className="about-contact-object about-contact-object--cta">
                            <ReservasiButton
                                label="Hubungi Kami"
                                href={CONTACT_US_URL}
                            />
                        </div>
                    </div>

                    <div className="xl:col-span-7">
                        <div className="about-contact-card flex min-h-[320px] flex-col overflow-hidden rounded-[5px] xl:flex-row">
                            <div className="about-contact-media relative h-52 flex-shrink-0 xl:h-auto xl:w-[390px]">
                                <img
                                    ref={imageRef}
                                    src={fresh}
                                    alt="UB Sport Center"
                                    className="about-contact-media-image absolute inset-0 h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority="low"
                                />
                            </div>

                            <div className="about-contact-panel flex flex-1 flex-col justify-center bg-black p-8 xl:p-10">
                                <ScrollTextReveal
                                    as="p"
                                    split="words"
                                    delay={640}
                                    stagger={22}
                                    amount={0.12}
                                    className="contact-panel-shimmer contact-panel-shimmer--heading mb-4 font-bdo text-[clamp(1.25rem,1.67vw,32px)] font-normal leading-tight text-white"
                                >
                                    Hubungi Kami
                                </ScrollTextReveal>
                                <hr className="about-contact-panel-line mb-8 border-white/20" />

                                <div className="flex flex-col gap-7">
                                    <div className="about-contact-info about-contact-info--1">
                                        <ScrollTextReveal
                                            as="p"
                                            split="words"
                                            delay={760}
                                            stagger={14}
                                            amount={0.12}
                                            className="contact-panel-shimmer contact-panel-shimmer--label mb-2 font-bdo text-[clamp(0.875rem,0.83vw,16px)] font-medium text-white/80"
                                        >
                                            Email
                                        </ScrollTextReveal>
                                        <ScrollTextReveal
                                            as="p"
                                            split="words"
                                            delay={820}
                                            stagger={10}
                                            amount={0.12}
                                            className="contact-panel-shimmer contact-panel-shimmer--body font-bdo text-[clamp(0.875rem,0.94vw,18px)] font-normal text-white"
                                        >
                                            contact@ubsportcenter.co.id
                                        </ScrollTextReveal>
                                    </div>

                                    <div className="about-contact-info about-contact-info--2">
                                        <ScrollTextReveal
                                            as="p"
                                            split="words"
                                            delay={900}
                                            stagger={14}
                                            amount={0.12}
                                            className="contact-panel-shimmer contact-panel-shimmer--label mb-2 font-bdo text-[clamp(0.875rem,0.83vw,16px)] font-medium text-white/80"
                                        >
                                            Pusat Panggilan
                                        </ScrollTextReveal>
                                        <ScrollTextReveal
                                            as="p"
                                            split="words"
                                            delay={960}
                                            stagger={10}
                                            amount={0.12}
                                            className="contact-panel-shimmer contact-panel-shimmer--body font-bdo text-[clamp(0.875rem,0.94vw,18px)] font-normal text-white"
                                        >
                                            (0341) 579955
                                        </ScrollTextReveal>
                                        <ScrollTextReveal
                                            as="p"
                                            split="words"
                                            delay={1010}
                                            stagger={10}
                                            amount={0.12}
                                            className="contact-panel-shimmer contact-panel-shimmer--body mt-1.5 font-bdo text-[clamp(0.875rem,0.94vw,18px)] font-normal text-white"
                                        >
                                            +62 852-8080-9080
                                        </ScrollTextReveal>
                                    </div>

                                    <div className="about-contact-info about-contact-info--3">
                                        <ScrollTextReveal
                                            as="p"
                                            split="words"
                                            delay={1090}
                                            stagger={14}
                                            amount={0.12}
                                            className="contact-panel-shimmer contact-panel-shimmer--label mb-2 font-bdo text-[clamp(0.875rem,0.83vw,16px)] font-medium text-white/80"
                                        >
                                            Lokasi Kami
                                        </ScrollTextReveal>
                                        <ScrollTextReveal
                                            as="p"
                                            split="words"
                                            delay={1150}
                                            stagger={8}
                                            amount={0.12}
                                            className="contact-panel-shimmer contact-panel-shimmer--body font-bdo text-[clamp(0.875rem,0.94vw,18px)] font-normal leading-relaxed text-white"
                                        >
                                            Jl. Terusan Cibogo No.1,
                                            Penanggungan, Kec. Klojen, Kota
                                            Malang, Jawa Timur 65113
                                        </ScrollTextReveal>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
