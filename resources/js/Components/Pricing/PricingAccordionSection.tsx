import { useState } from "react";
import { motion } from "framer-motion";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import AnimatedBookingLink from "@/Components/News/AnimatedBookingLink";
import PricingAccordionItem, {
    ClassAccordionData,
} from "./PricingAccordionItem";

interface BackendFacility {
    id: number;
    name: string;
    slug: string;
    image: string;
    category: string;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    rating?: number | null;
    display_metadata?: Record<string, unknown> | null;
}

interface Props {
    facilities?: BackendFacility[];
}

const SECTION_CONTAINER_CLASS =
    "mx-auto max-w-[1920px] px-[clamp(1.5rem,4.6vw,5.5rem)]";
const DARK_HEADING_CLASS =
    "font-bdo text-[clamp(3rem,3.02vw,3.65rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white";
const SECTION_DIVIDER_WRAP_CLASS =
    "mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)] pb-16 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14";

const DUMMY_ACCORDION: ClassAccordionData[] = [
    {
        id: "01",
        title: "/Sepak Bola",
        image: "/assets/images/fasilitas-sepak-bola-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeType: "Arena Luar",
        classCode: "/Terbuka 003/",
        pricingDetails: [
            { label: "1750K/2 Jam" },
            { label: "Extension 875K/ Jam" },
        ],
    },
    {
        id: "02",
        title: "/Basket",
        image: "/assets/images/fasilitas-yoga-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeType: "Arena Luar",
        classCode: "/Terbuka 004/",
        pricingDetails: [
            { label: "1200K/2 Jam" },
            { label: "Extension 600K/ Jam" },
        ],
    },
    {
        id: "03",
        title: "/Volly",
        image: "/assets/images/fasilitas-aerobik-ub-sport-center.avif",
        badgeLocation: "Veteran",
        badgeType: "Arena Luar",
        classCode: "/Terbuka 005/",
        pricingDetails: [
            { label: "1000K/2 Jam" },
            { label: "Extension 500K/ Jam" },
        ],
    },
    {
        id: "04",
        title: "/Futsal Dieng",
        image: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
        badgeLocation: "Dieng",
        badgeType: "Arena Luar",
        classCode: "/Terbuka 006/",
        pricingDetails: [
            { label: "1500K/2 Jam" },
            { label: "Extension 750K/ Jam" },
        ],
    },
];

export default function PricingAccordionSection({ facilities = [] }: Props) {
    const facilitiesData: ClassAccordionData[] = facilities
        .filter(
            (f) =>
                f.category === "Lapangan & Arena" &&
                Array.isArray((f.display_metadata as any)?.pricingDetails),
        )
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            title: `/${f.name}`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location ?? "Veteran",
            badgeType: "Arena Luar",
            classCode:
                f.class_code ?? `/Terbuka ${String(idx + 3).padStart(3, "0")}/`,
            pricingDetails: ((f.display_metadata as any)?.pricingDetails ??
                []) as { label: string }[],
        }));

    const activeData =
        facilitiesData.length > 0 ? facilitiesData : DUMMY_ACCORDION;

    const [activeIndex, setActiveIndex] = useState<number | null>(0);
    const activeItem =
        activeIndex === null ? activeData[0] : activeData[activeIndex];
    const previewImage =
        activeItem?.id === "01"
            ? "/assets/images/poster-sepakbola-konten-program-ub-sport-center.avif"
            : activeItem?.image ?? activeData[0]?.image;

    return (
        <section
            className="overflow-x-clip bg-[#242424]"
            id="pricing-accordion"
        >
            <div className={SECTION_DIVIDER_WRAP_CLASS}>
                <SectionDivider
                    number="04"
                    title="Kelas Outdoor"
                    subtitle="05 pricing page"
                    theme="dark"
                />
            </div>

            <div className={`${SECTION_CONTAINER_CLASS} pb-2 pt-[1.75rem]`}>
                {/* ── MOBILE LAYOUT (xl:hidden) ───────────────────────────────── */}
                <div className="xl:hidden">
                    <div className="mb-10 flex flex-col gap-6">
                        <div className="mt-5 flex items-center gap-4">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-white">
                                Gabung Member Sekarang
                            </ScrollTextReveal>
                        </div>
                        <ScrollTextReveal
                            as="h2"
                            split="block"
                            delay={80}
                            className={`${DARK_HEADING_CLASS} mt-5`}
                        >
                            Area gym ini dirancang kardio yang nyaman bagi seluruh pengguna yang ada di UB Sport Center.®
                        </ScrollTextReveal>
                        <AnimatedBookingLink
                            label="Ikuti Keseruan Kami"
                            href="/coming-soon"
                        />
                    </div>

                    <div className="border-t border-white/50" />
                    {activeData.map((item, idx) => (
                        <PricingAccordionItem
                            key={item.id}
                            item={item}
                            isOpen={activeIndex === idx}
                            onToggle={() =>
                                setActiveIndex(activeIndex === idx ? null : idx)
                            }
                        />
                    ))}
                </div>

                {/* ── DESKTOP LAYOUT (hidden xl:block) ────────────────────────── */}
                <div className="hidden xl:block">
                    <div
                        className="grid gap-10"
                        style={{ gridTemplateColumns: "30.6% minmax(0, 1fr)" }}
                    >
                        <div className="flex flex-col gap-[5.8rem]">
                            <div className="flex items-center gap-4">
                                <span className="section-label-diamond" />
                                <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-white">
                                    Gabung Member Sekarang
                                </ScrollTextReveal>
                            </div>
                            <AnimatedBookingLink
                                label="More about me"
                                href="/coming-soon"
                                width="17.6rem"
                            />
                            <div className="mt-[3.9rem] aspect-square w-[17.6rem] overflow-hidden rounded-[0.6rem]">
                                <motion.img
                                    key={activeIndex ?? 0}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.3 }}
                                    src={previewImage}
                                    alt="UB Sport Center"
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        </div>

                        <div className="flex min-w-0 flex-col">
                            <ScrollTextReveal
                                as="h2"
                                split="block"
                                delay={80}
                                className={`${DARK_HEADING_CLASS} max-w-[73rem]`}
                            >
                                Area gym ini dirancang sebagai kardio yang sangat nyaman bagi seluruh pengguna yang ada di UB Sport Center.®
                            </ScrollTextReveal>

                            <div className="mt-[8.3rem] flex flex-col">
                                {activeData.map((item, idx) => (
                                    <PricingAccordionItem
                                        key={item.id}
                                        item={item}
                                        isOpen={activeIndex === idx}
                                        onToggle={() =>
                                            setActiveIndex(
                                                activeIndex === idx
                                                    ? null
                                                    : idx,
                                            )
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
