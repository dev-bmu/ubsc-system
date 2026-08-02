import { useEffect, useRef, useState, type CSSProperties } from "react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";
import ServiceCard from "@/Components/About/ServiceCard";
import aboutcard1 from "../../../assets/images/aboutcard1.avif";
import aboutcard2 from "../../../assets/images/aboutcard2.avif";
import aboutcard3 from "../../../assets/images/aboutcard3.avif";
import aboutcard4 from "../../../assets/images/aboutcard4.avif";

interface ServiceItem {
    id: number;
    numberString: string;
    title: string;
    subtitle: string;
    image: string;
}

const DUMMY_SERVICES: ServiceItem[] = [
    {
        id: 1,
        numberString: "001",
        title: "Pusat Layanan Pengguna",
        subtitle: "Layanan ramah dan responsif",
        image: aboutcard1,
    },
    {
        id: 2,
        numberString: "002",
        title: "Fasilitas Peminjaman Olahraga",
        subtitle: "Alat lengkap dan terawat",
        image: aboutcard2,
    },
    {
        id: 3,
        numberString: "003",
        title: "Bimbingan Pelatih Olahraga",
        subtitle: "Pendamping latihan profesional",
        image: aboutcard3,
    },
    {
        id: 4,
        numberString: "004",
        title: "Penyelenggaraan Event Sport",
        subtitle: "Event tertata dan sukses",
        image: aboutcard4,
    },
];

export default function AboutServices() {
    const sectionRef = useRef<HTMLElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isSettled, setIsSettled] = useState(false);
    const entranceReady = useHomepageEntranceReady();

    useEffect(() => {
        const section = sectionRef.current;
        if (!entranceReady || !section || isVisible) return;

        if (!("IntersectionObserver" in window)) {
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
                threshold: 0.08,
                rootMargin: "0px 0px -16% 0px",
            },
        );

        observer.observe(section);
        return () => observer.disconnect();
    }, [entranceReady, isVisible]);

    useEffect(() => {
        if (!isVisible) return;

        const timer = window.setTimeout(() => setIsSettled(true), 2200);
        return () => window.clearTimeout(timer);
    }, [isVisible]);

    const sectionClassName = `about-services-stage ${
        isVisible ? "is-visible" : ""
    } ${isSettled ? "is-settled" : ""}`;

    return (
        <section
            ref={sectionRef}
            className={`${sectionClassName} w-full bg-white`}
            id="about-services"
        >
            <div className="mx-auto max-w px-6 py-8 sm:px-10 sm:py-12 lg:px-16 lg:pt-16 xl:px-24 xl:pt-24">
                <SectionDivider
                    number="03"
                    title="Sorotan"
                    subtitle="02 aboutpage"
                    theme="light"
                    outerClassName="-mx-[clamp(0rem,1.65vw,2rem)]"
                    contentClassName="px-3"
                />

                <div className="mt-12 grid grid-cols-1 items-start gap-8 md:mt-14 lg:mt-16 xl:relative xl:mt-14 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,2fr)_minmax(0,1fr)] xl:gap-6">
                    <div
                        className="about-services-text-reveal about-services-text-reveal--kicker flex items-center gap-4 xl:gap-3"
                        style={
                            {
                                "--about-services-delay": "80ms",
                            } as CSSProperties
                        }
                    >
                        <span className="section-label-diamond" />
                        <span className="home-section-anchor font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black xl:text-[1.25rem]">
                            Layanan Unggulan
                        </span>
                    </div>

                    <div className="xl:justify-self-center">
                        <h2
                            aria-label="Mendukung Kebutuhan Aktivitas Olahraga Anda"
                            className="home-section-heading section-two-headline-weight max-w-lg font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-none xl:text-center xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]"
                        >
                            {[
                                "Mendukung Kebutuhan",
                                "Aktivitas Olahraga Anda",
                            ].map((line, index) => (
                                <span
                                    key={line}
                                    className="about-services-title-line block overflow-hidden pb-[0.14em]"
                                >
                                    <span
                                        className="about-services-title-inner -mb-[0.14em] block whitespace-nowrap pr-[0.08em]"
                                        style={
                                            {
                                                "--about-services-delay": `${150 + index * 115}ms`,
                                            } as CSSProperties
                                        }
                                    >
                                        {line}
                                    </span>
                                </span>
                            ))}
                        </h2>
                    </div>

                    <div className="xl:justify-self-end">
                        <p
                            className="about-services-copy font-bdo text-[clamp(0.875rem,1.04vw,20px)] font-normal leading-relaxed text-black/70 xl:hidden"
                            style={
                                {
                                    "--about-services-delay": "320ms",
                                } as CSSProperties
                            }
                        >
                            Beragam layanan pendukung kami hadir untuk
                            memberikan kenyamanan terbaik bagi pengguna.
                        </p>
                        <p className="hidden w-max text-left font-bdo text-[clamp(0.875rem,1.04vw,20px)] font-normal leading-[1.55] text-black xl:block">
                            {[
                                "Beragam layanan pendukung kami",
                                "hadir untuk memberikan kenyamanan",
                                "terbaik bagi pengguna.",
                            ].map((line, index) => (
                                <span
                                    key={line}
                                    className="about-services-copy-line block overflow-hidden pb-[0.1em]"
                                >
                                    <span
                                        className="about-services-copy-inner -mb-[0.1em] block whitespace-nowrap pr-[0.08em]"
                                        style={
                                            {
                                                "--about-services-delay": `${330 + index * 80}ms`,
                                            } as CSSProperties
                                        }
                                    >
                                        {line}
                                    </span>
                                </span>
                            ))}
                        </p>
                    </div>
                </div>

                <div className="about-services-cards mt-16 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {DUMMY_SERVICES.map((service, i) => (
                        <ServiceCard
                            key={service.id}
                            index={i}
                            numberString={service.numberString}
                            title={service.title}
                            subtitle={service.subtitle}
                            image={service.image}
                        />
                    ))}
                </div>
            </div>
        </section>
    );
}
