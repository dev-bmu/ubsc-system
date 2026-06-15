import useEmblaCarousel from "embla-carousel-react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import AnimatedBookingLink from "@/Components/News/AnimatedBookingLink";
import PricingClassCard, { ClassPricing } from "./PricingClassCard";

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

const ArrowLeft = () => (
    <svg
        width="10"
        height="12"
        viewBox="0 0 12 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M10 2L2 10L10 18"
            stroke="currentColor"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const ArrowRight = () => (
    <svg
        width="10"
        height="12"
        viewBox="0 0 12 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M2 2L10 10L2 18"
            stroke="currentColor"
            strokeWidth="4.2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

interface Props {
    facilities?: BackendFacility[];
}

const SECTION_CONTAINER_CLASS =
    "mx-auto max-w-[1920px] px-[clamp(1.5rem,4.6vw,5.5rem)]";
const DARK_HEADING_CLASS =
    "font-bdo text-[clamp(1.5rem,2.82vw,3.65rem)] font-medium leading-[1.08] tracking-[-0.04em] text-white";
const SECTION_DIVIDER_WRAP_CLASS =
    "mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)]  pb-16 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14";

const DEFAULT_DAFTAR_HARGA = {
    left: [
        { label: "Beginner" },
        { label: "Warga UB 25K" },
        { label: "Umum 23K" },
    ],
    right: [{ label: "Intermediate" }, { label: "Umum 35K" }],
};

const DEFAULT_PERSEWAAN = {
    left: [
        { label: "Sewa Ruang Yoga" },
        { label: "Warga UB 100K" },
        { label: "Umum 150K" },
    ],
    right: [
        { label: "Sewa Event Ruang" },
        { label: "1650K/ Hari\n(Matras Kami Fasilitasi)" },
    ],
};

export default function PricingClassSection({ facilities = [] }: Props) {
    // Map real facilities to ClassPricing format, filter to fitness classes only
    const classesData: ClassPricing[] = facilities
        .filter((f) => f.category === "Kelas & Kebugaran")
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            title: `/${f.name}.`,
            classCode:
                f.class_code || `/Class ${String(idx + 1).padStart(3, "0")}/`,
            description: `Ikuti kelas ${f.name} yang dipandu instruktur berpengalaman di UB Sport Center.`,
            image: f.image || "/assets/images/comingsoon.avif",
            badgeLocation: f.location ?? "Veteran",
            badgeType: "Kebugaran",
            daftarHarga: DEFAULT_DAFTAR_HARGA,
            persewaan: DEFAULT_PERSEWAAN,
        }));

    // Use real data if available, fallback to DUMMY data
    const activeClasses: ClassPricing[] = classesData;
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        dragFree: true,
    });

    return (
        <section className="overflow-x-clip bg-[#242424]" id="pricing-classes">
            <div className={SECTION_DIVIDER_WRAP_CLASS}>
                <SectionDivider
                    number="03"
                    title="Kelas"
                    subtitle="05 pricing page"
                    theme="dark"
                />
            </div>
            <div className={`${SECTION_CONTAINER_CLASS} pb-0 pt-[1.85rem]`}>
                <div className="mb-[6.75rem] grid grid-cols-1 gap-8 xl:grid-cols-12 xl:gap-10">
                    <div className="flex flex-col gap-[3.2rem] xl:col-span-8">
                        <div className="flex items-center gap-4">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-white">
                                Gabung Member Sekarang
                            </ScrollTextReveal>
                        </div>
                        <ScrollTextReveal
                            as="h2"
                            split="block"
                            delay={80}
                            className={`${DARK_HEADING_CLASS} max-w-[60rem]`}
                        >
                            Area gym ini dirancang kardio yang sangat nyaman
                            bagi seluruh pengguna yang ada di UB Sport Center®
                        </ScrollTextReveal>
                    </div>

                    <div className="flex flex-col gap-4 xl:col-span-4 xl:items-end xl:justify-start xl:gap-[4.2rem] xl:pt-[4.95rem]">
                        <AnimatedBookingLink
                            label="More about me"
                            href="/coming-soon"
                            width="18rem"
                        />
                        <div className="flex items-center gap-5">
                            <button
                                onClick={() => emblaApi?.scrollPrev()}
                                aria-label="Previous"
                                className="flex size-[2.75rem] flex-shrink-0 items-center justify-center rounded-full border border-white text-white transition-colors hover:bg-white/10"
                            >
                                <ArrowLeft />
                            </button>
                            <button
                                onClick={() => emblaApi?.scrollNext()}
                                aria-label="Next"
                                className="flex size-[2.75rem] flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/90"
                            >
                                <ArrowRight />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="min-w-0 overflow-hidden" ref={emblaRef}>
                    <div className="flex gap-[0.95rem]">
                        {activeClasses.map((item) => (
                            <PricingClassCard key={item.id} item={item} />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
