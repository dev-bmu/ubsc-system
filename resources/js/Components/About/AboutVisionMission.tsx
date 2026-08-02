import { type PointerEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import visionImage from "@/../assets/images/vission.avif";

interface VisionItem {
    id: number;
    number: string;
    title: string;
    badgeText: string;
    bigNumber: string;
    bigNumberLabel: string;
    innerHeading: string;
    redLabel: string;
    description: string;
}

const VISION_ITEMS: VisionItem[] = [
    {
        id: 1,
        number: "01",
        title: "Profil Kami dan Arah Pengembangan",
        badgeText: "Eksistensi",
        bigNumber: "01",
        bigNumberLabel: "Progresif",
        innerHeading:
            "Tempat Di Mana Dedikasi Bertemu Dengan Fasilitas Berkualitas dan Terbaik",
        redLabel: "Prioritas Kami",
        description:
            "UB Sport Center merupakan pusat olahraga milik Universitas Brawijaya yang dikelola oleh PT Brawijaya Multi Usaha, kami selalu berfokus pada peningkatan layanan, kualitas fasilitas, dan kenyamanan pengguna. Pengembangan diarahkan secara terstruktur, adaptif, dan berkelanjutan.",
    },
    {
        id: 2,
        number: "02",
        title: "Visi Menuju Masa Depan",
        badgeText: "Visi Kami",
        bigNumber: "02",
        bigNumberLabel: "Berkelanjutan",
        innerHeading:
            "Komitmen Kami Dalam Mendukung Aktivitas Olahraga Berkualitas",
        redLabel: "Komitmen Kami",
        description:
            "Menjadi perusahaan yang sehat, profesional, dan berkinerja unggul sebagai penopang utama pendapatan Universitas Brawijaya melalui pengelolaan fasilitas olahraga yang modern, nyaman, dan berkelanjutan.",
    },
    {
        id: 3,
        number: "03",
        title: "Misi Untuk Kemajuan",
        badgeText: "Misi Kami",
        bigNumber: "03",
        bigNumberLabel: "Implementasi",
        innerHeading:
            "Mewujudkan Lingkungan Olahraga yang Kompetitif, Suportif, dan Berstandar Tinggi",
        redLabel: "Standar Kami",
        description:
            "Mengembangkan layanan olahraga melalui performa bisnis yang sehat, sumber daya manusia berintegritas, kolaborasi aktif, dan pengelolaan fasilitas yang berorientasi pada kualitas pengguna.",
    },
];

const ACCORDION_EASE = [0.16, 1, 0.3, 1] as const;

const panelMotion = {
    hidden: { height: 0 },
    visible: {
        height: "auto",
        transition: {
            height: { duration: 0.84, ease: ACCORDION_EASE },
        },
    },
    exit: {
        height: 0,
        transition: {
            height: { duration: 0.5, ease: ACCORDION_EASE },
        },
    },
};

const panelItemMotion = {
    hidden: { opacity: 0, y: 18 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.62,
            ease: ACCORDION_EASE,
        },
    },
    exit: {
        opacity: 0,
        y: -8,
        transition: {
            duration: 0.2,
            ease: ACCORDION_EASE,
        },
    },
};

const panelViewport = {
    once: true,
    amount: 0.22,
    margin: "0px 0px -14% 0px",
} as const;

const panelTextAmount = 0.16;
const panelTextRootMargin = "0px 0px -10% 0px";

export default function AboutVisionMission() {
    const sectionRef = useRef<HTMLElement | null>(null);
    const [hasEntered, setHasEntered] = useState(false);
    const [activeId, setActiveId] = useState<number | null>(null);
    const toggleLockRef = useRef<number | null>(null);
    const entranceReady = useHomepageEntranceReady();

    useEffect(() => {
        const node = sectionRef.current;

        if (!entranceReady || !node || hasEntered) return;

        if (!("IntersectionObserver" in window)) {
            setHasEntered(true);
            setActiveId(VISION_ITEMS[0].id);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                setHasEntered(true);
                setActiveId((current) => current ?? VISION_ITEMS[0].id);
                observer.disconnect();
            },
            { threshold: 0.18, rootMargin: "0px 0px -16% 0px" },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [entranceReady, hasEntered]);

    useEffect(() => {
        return () => {
            if (toggleLockRef.current) {
                window.clearTimeout(toggleLockRef.current);
            }
        };
    }, []);

    const handleToggle = (id: number) => {
        if (toggleLockRef.current) return;

        setActiveId((current) => {
            if (current !== id) return id;

            const currentIndex = VISION_ITEMS.findIndex(
                (item) => item.id === id,
            );
            const nextIndex = (currentIndex + 1) % VISION_ITEMS.length;

            return VISION_ITEMS[nextIndex]?.id ?? VISION_ITEMS[0].id;
        });

        toggleLockRef.current = window.setTimeout(() => {
            toggleLockRef.current = null;
        }, 180);
    };

    return (
        <section
            ref={sectionRef}
            className={`about-vision-section w-full bg-[#F3F6F8] ${
                hasEntered ? "is-entered" : ""
            }`}
            id="about-vision"
        >
            <div className="w-full px-[clamp(1.5rem,4.5vw,5.5rem)] py-14 sm:py-16 lg:py-20 xl:px-[55px] xl:pb-[6.6rem] xl:pt-[3.25rem]">
                <SectionDivider
                    number="04"
                    title="Sorotan"
                    subtitle="02 aboutpage"
                    theme="light"
                    outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                    contentClassName="px-3"
                />

                <AboutVisionHeading />

                <div className="mt-12 border-t border-black/20 md:mt-16 xl:mt-[3.2rem]">
                    {VISION_ITEMS.map((item) => (
                        <VisionAccordionItem
                            key={item.id}
                            item={item}
                            isOpen={activeId === item.id}
                            onToggle={() => handleToggle(item.id)}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}

function AboutVisionHeading() {
    return (
        <div className="mt-12 grid grid-cols-1 gap-8 md:mt-16 md:gap-10 lg:mt-20 xl:mt-[5.35rem] xl:grid-cols-12 xl:gap-8">
            <div className="xl:col-span-6">
                <div className="flex items-center gap-4 xl:gap-3">
                    <span className="section-label-diamond" />
                    <ScrollTextReveal
                        delay={80}
                        className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]"
                    >
                        Visi &amp; Misi
                    </ScrollTextReveal>
                </div>
            </div>

            <div className="xl:col-span-6">
                <h2 className="home-section-heading max-w-[700px] font-bdo text-[clamp(1.85rem,5.6vw,3.25rem)] font-semibold leading-[1.12] tracking-[-0.025em] text-black md:text-[clamp(2.35rem,4.45vw,3.25rem)] xl:text-[clamp(2.7rem,2.58vw,3rem)] xl:leading-[1.15]">
                    <ScrollTextReveal
                        delay={120}
                        split="words"
                        stagger={28}
                        className="about-vision-text-safe md:hidden"
                    >
                        Menetapkan Arah dan Tujuan Perjalanan Perusahaan
                    </ScrollTextReveal>
                    <span className="hidden md:block">
                        <ScrollTextReveal
                            delay={120}
                            split="block"
                            className="about-vision-heading-line about-vision-heading-line-first about-vision-text-safe"
                        >
                            Menetapkan Arah dan Tujuan
                        </ScrollTextReveal>
                        <ScrollTextReveal
                            delay={210}
                            split="block"
                            className="about-vision-heading-line about-vision-text-safe"
                        >
                            Perjalanan Perusahaan
                        </ScrollTextReveal>
                    </span>
                </h2>
            </div>
        </div>
    );
}

function VisionAccordionItem({
    item,
    isOpen,
    onToggle,
}: {
    item: VisionItem;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const panelPointerRef = useRef<{
        id: number;
        x: number;
        y: number;
        scrollY: number;
        time: number;
        target: EventTarget | null;
    } | null>(null);

    const shouldIgnorePanelTarget = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) return true;

        return Boolean(
            target.closest(
                "a,button,input,textarea,select,video,audio,[data-no-accordion-toggle]",
            ),
        );
    };

    const handlePanelPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (shouldIgnorePanelTarget(event.target)) return;

        panelPointerRef.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            scrollY: window.scrollY,
            time: window.performance.now(),
            target: event.target,
        };
    };

    const handlePanelPointerUp = (event: PointerEvent<HTMLDivElement>) => {
        const start = panelPointerRef.current;
        panelPointerRef.current = null;

        if (!start || start.id !== event.pointerId) return;
        if (shouldIgnorePanelTarget(event.target)) return;

        const deltaX = Math.abs(event.clientX - start.x);
        const deltaY = Math.abs(event.clientY - start.y);
        const scrollDelta = Math.abs(window.scrollY - start.scrollY);
        const elapsed = window.performance.now() - start.time;
        const selectedText = window.getSelection()?.toString().trim();

        if (selectedText) return;
        if (deltaX > 10 || deltaY > 10) return;
        if (scrollDelta > 2) return;
        if (elapsed > 700) return;

        onToggle();
    };

    return (
        <article
            className={`about-vision-panel relative overflow-hidden border-b border-black/20 ${
                isOpen ? "is-open" : ""
            }`}
        >
            <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px origin-center bg-gradient-to-r from-transparent via-black/40 to-transparent"
                initial={false}
                animate={{
                    opacity: isOpen ? 1 : 0,
                    scaleX: isOpen ? 1 : 0.62,
                }}
                transition={{
                    duration: 0.6,
                    ease: ACCORDION_EASE,
                }}
            />

            <button
                type="button"
                onClick={onToggle}
                className="about-vision-trigger group grid w-full cursor-pointer grid-cols-[2.35rem_minmax(0,1fr)_2.75rem] items-center gap-4 py-7 text-left transition-colors duration-500 sm:grid-cols-[3rem_minmax(0,1fr)_3rem] sm:gap-5 md:grid-cols-[4.25rem_minmax(0,1fr)_3.75rem] md:gap-7 md:py-9 lg:grid-cols-[6rem_minmax(0,1fr)_4rem] lg:py-10 xl:grid-cols-[7.5rem_1fr_auto] xl:gap-[72px] xl:py-[2.2rem]"
                aria-expanded={isOpen}
                aria-controls={`about-vision-panel-${item.id}`}
            >
                <ScrollTextReveal
                    delay={70}
                    className="font-bdo text-[clamp(0.95rem,1.18vw,1.45rem)] font-semibold leading-none text-black transition-opacity duration-300 group-hover:opacity-60"
                >
                    {item.number}
                </ScrollTextReveal>
                <ScrollTextReveal
                    delay={120}
                    split="block"
                    className="about-vision-text-safe min-w-0 font-bdo text-[clamp(1.35rem,5.35vw,2.7rem)] font-light leading-[1.03] tracking-[-0.035em] text-black transition-transform duration-500 ease-out group-hover:translate-x-1 md:text-[clamp(1.85rem,3.15vw,2.7rem)] xl:text-[2.42rem] xl:leading-[1.04]"
                >
                    {item.title}
                </ScrollTextReveal>
                <motion.span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 md:h-14 md:w-14 xl:h-[55px] xl:w-[55px]"
                    initial={false}
                    animate={{
                        backgroundColor: isOpen ? "#ff0000" : "#000000",
                        scale: isOpen ? 1 : 0.98,
                    }}
                    whileHover={{ scale: 1.055 }}
                    whileTap={{ scale: 0.94 }}
                    transition={{
                        duration: 0.42,
                        ease: ACCORDION_EASE,
                    }}
                >
                    <AnimatePresence initial={false} mode="wait">
                        {isOpen ? (
                            <motion.span
                                key="close"
                                initial={{
                                    opacity: 0,
                                    rotate: -45,
                                    scale: 0.72,
                                }}
                                animate={{
                                    opacity: 1,
                                    rotate: 0,
                                    scale: 1,
                                }}
                                exit={{
                                    opacity: 0,
                                    rotate: 45,
                                    scale: 0.72,
                                }}
                                transition={{
                                    duration: 0.24,
                                    ease: ACCORDION_EASE,
                                }}
                            >
                                <X
                                    className="h-5 w-5 text-white md:h-6 md:w-6"
                                    strokeWidth={2.3}
                                />
                            </motion.span>
                        ) : (
                            <motion.span
                                key="open"
                                initial={{
                                    opacity: 0,
                                    y: -6,
                                    scale: 0.74,
                                }}
                                animate={{
                                    opacity: 1,
                                    y: 0,
                                    scale: 1,
                                }}
                                exit={{
                                    opacity: 0,
                                    y: 6,
                                    scale: 0.74,
                                }}
                                transition={{
                                    duration: 0.24,
                                    ease: ACCORDION_EASE,
                                }}
                            >
                                <ChevronDown
                                    className="h-5 w-5 text-white md:h-6 md:w-6"
                                    strokeWidth={2.5}
                                />
                            </motion.span>
                        )}
                    </AnimatePresence>
                </motion.span>
            </button>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key={`about-vision-panel-${item.id}`}
                        id={`about-vision-panel-${item.id}`}
                        variants={panelMotion}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="overflow-hidden"
                    >
                        <motion.div
                            initial={false}
                            exit={{
                                opacity: 0,
                                transition: {
                                    duration: 0.16,
                                    ease: ACCORDION_EASE,
                                },
                            }}
                            className="about-vision-panel-body about-vision-panel-stage cursor-pointer pb-10 md:pb-14 xl:pb-[4.55rem]"
                            onPointerDown={handlePanelPointerDown}
                            onPointerUp={handlePanelPointerUp}
                            onPointerCancel={() => {
                                panelPointerRef.current = null;
                            }}
                        >
                            <VisionPanelImage item={item} />

                            <div className="about-vision-detail-grid mt-8 grid grid-cols-1 items-stretch gap-8 md:mt-12 md:gap-10 xl:mt-[3.15rem]">
                                <motion.div
                                    variants={panelItemMotion}
                                    initial="hidden"
                                    whileInView="visible"
                                    viewport={panelViewport}
                                    className="about-vision-detail-meta grid grid-cols-[minmax(0,1fr)_auto] items-end gap-5 md:grid-cols-[minmax(12rem,0.8fr)_minmax(10rem,0.45fr)]"
                                >
                                    <div className="inline-flex w-max rounded-full bg-black px-6 py-3 font-bdo text-[clamp(0.82rem,0.9vw,1.05rem)] font-medium leading-none text-white md:px-8 xl:px-9 xl:py-3.5">
                                        <ScrollTextReveal
                                            delay={140}
                                            amount={panelTextAmount}
                                            rootMargin={panelTextRootMargin}
                                        >
                                            {item.badgeText}
                                        </ScrollTextReveal>
                                    </div>
                                    <div className="about-vision-detail-stat justify-self-end text-right xl:justify-self-auto xl:text-left">
                                        <ScrollTextReveal
                                            as="p"
                                            delay={230}
                                            split="block"
                                            amount={panelTextAmount}
                                            rootMargin={panelTextRootMargin}
                                            className="about-vision-text-safe font-bdo text-[clamp(2.75rem,8vw,4.75rem)] font-semibold leading-none tracking-[-0.04em] text-[#ff0000] md:text-[clamp(3.55rem,5.2vw,4.75rem)]"
                                        >
                                            {item.bigNumber}
                                        </ScrollTextReveal>
                                        <ScrollTextReveal
                                            as="p"
                                            delay={300}
                                            split="block"
                                            amount={panelTextAmount}
                                            rootMargin={panelTextRootMargin}
                                            className="about-vision-text-safe mt-2 font-bdo text-[clamp(0.95rem,1.1vw,1.35rem)] font-normal leading-none text-black md:mt-3 xl:mt-4"
                                        >
                                            {item.bigNumberLabel}
                                        </ScrollTextReveal>
                                    </div>
                                </motion.div>

                                <motion.div
                                    variants={panelItemMotion}
                                    initial="hidden"
                                    whileInView="visible"
                                    viewport={panelViewport}
                                >
                                    <ScrollTextReveal
                                        as="h3"
                                        split="words"
                                        delay={360}
                                        stagger={24}
                                        amount={panelTextAmount}
                                        rootMargin={panelTextRootMargin}
                                        className="about-vision-text-safe max-w-[900px] font-bdo text-[clamp(1.65rem,5.85vw,3rem)] font-semibold leading-[1.12] tracking-[-0.035em] text-black md:text-[clamp(2.2rem,3.7vw,3rem)] xl:text-[clamp(2.45rem,2.55vw,2.7rem)] xl:leading-[1.17]"
                                    >
                                        {item.innerHeading}
                                    </ScrollTextReveal>

                                    <div className="mt-7 grid grid-cols-1 gap-3 md:mt-10 md:grid-cols-[11rem_1fr] md:gap-5 xl:mt-12 xl:grid-cols-[14rem_1fr]">
                                        <ScrollTextReveal
                                            as="p"
                                            delay={610}
                                            amount={panelTextAmount}
                                            rootMargin={panelTextRootMargin}
                                            className="about-vision-text-safe font-bdo text-[clamp(1rem,1vw,1.25rem)] font-normal leading-snug text-[#ff0000]"
                                        >
                                            {item.redLabel}
                                        </ScrollTextReveal>
                                        <ScrollTextReveal
                                            as="p"
                                            delay={700}
                                            split="words"
                                            stagger={12}
                                            amount={panelTextAmount}
                                            rootMargin={panelTextRootMargin}
                                            className="about-vision-text-safe max-w-[760px] font-bdo text-[clamp(0.95rem,1.05vw,1.25rem)] font-normal leading-[1.36] text-black md:leading-[1.32]"
                                        >
                                            {item.description}
                                        </ScrollTextReveal>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </article>
    );
}

function VisionPanelImage({ item }: { item: VisionItem }) {
    const imageRef = useRef<HTMLDivElement | null>(null);
    const [hasImageEntered, setHasImageEntered] = useState(false);
    const entranceReady = useHomepageEntranceReady();

    useEffect(() => {
        const node = imageRef.current;

        if (!entranceReady || !node || hasImageEntered) return;

        if (!("IntersectionObserver" in window)) {
            setHasImageEntered(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;

                setHasImageEntered(true);
                observer.disconnect();
            },
            { threshold: 0.08, rootMargin: "0px 0px -10% 0px" },
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [entranceReady, hasImageEntered]);

    return (
        <motion.div
            ref={imageRef}
            variants={panelItemMotion}
            initial="hidden"
            animate={hasImageEntered ? "visible" : "hidden"}
            className="about-vision-image-stage"
        >
            <div
                className={`about-vision-image-reveal overflow-hidden rounded-[5px] ${
                    hasImageEntered ? "is-visible" : ""
                }`}
            >
                <img
                    src={visionImage}
                    alt={item.title}
                    className="about-vision-image h-[220px] w-full object-cover object-center sm:h-[300px] md:h-[350px] lg:h-[370px] xl:h-[305px]"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                />
            </div>
        </motion.div>
    );
}
