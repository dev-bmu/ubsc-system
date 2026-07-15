import { useState } from "react";
import { Clock } from "lucide-react";
import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import FacilityBadge from "@/Components/Landing/FacilityBadge";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import star from "@/../assets/hero/star.png";

interface PricingPeriod {
    label: string;
    wargaPrice: string;
    umumPrice: string;
}

interface FacilityPricing {
    id: string;
    name: string;
    classCode: string;
    periods: PricingPeriod[];
    additionalDetails: string[];
    timeSlot: string;
    badgeLocation: string;
    badgeType: string;
    image: string;
}

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

const ArrowChevron = () => (
    <svg
        className="h-2 w-2 xl:h-3 xl:w-2.5"
        viewBox="0 0 12 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M2 2L10 10L2 18"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

interface Props {
    facilities?: BackendFacility[];
}

const SECTION_CONTAINER_CLASS =
    "mx-auto max-w-8xl px-[clamp(1.5rem,4.5vw,5.5rem)]";
const SECTION_HEADING_CLASS =
    "font-bdo text-[clamp(1.5rem,2.5vw,3rem)] lg:text-[clamp(2rem,2.72vw,3.25rem)] font-medium leading-[1.08] tracking-[-0.035em] indent-[2rem] sm:indent-[4rem] lg:indent-[6rem]";
const SECTION_DIVIDER_WRAP_CLASS =
    "mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)]  pb-10 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14";

const DEFAULT_PERIODS: PricingPeriod[] = [
    {
        label: "Pagi/ 06.00 - 12.00",
        wargaPrice: "Warga UB 95K/ Jam",
        umumPrice: "Umum 105K/ Jam",
    },
    {
        label: "Malam/ 16.00 - 22.00",
        wargaPrice: "Warga UB 105K/ Jam",
        umumPrice: "Umum 115K/ Jam",
    },
    {
        label: "Sabtu - Minggu\nMalam/ 18.00 - 22.00",
        wargaPrice: "Warga UB 50K/ Jam",
        umumPrice: "Umum 65K/ Jam",
    },
];

const DEFAULT_DETAILS = [
    "Sewa Event 8500K/ Hari",
    "Sewa Raket 10K/ Max. 2 Jam",
    "Sewa Event Non Sport 25000K/ Hari",
];

const normalizeClassCode = (classCode: string) =>
    classCode.replace(/^\/+|\/+$/g, "");

const displayClassCode = (classCode: string) => {
    const normalized = normalizeClassCode(classCode);
    return normalized.toLowerCase().startsWith("tertutup")
        ? "Class 003"
        : normalized;
};

const detailOrder = (detail: string) => {
    const lower = detail.toLowerCase();
    if (lower.includes("event 8500")) return 0;
    if (lower.includes("raket")) return 1;
    if (lower.includes("non sport")) return 2;
    return 3;
};

export default function PricingFacilityList({ facilities = [] }: Props) {
    // Map real facilities to PricingFacility format, filter to arena facilities only
    const facilitiesData: FacilityPricing[] = facilities
        .filter((f) => f.category === "Lapangan & Arena")
        .map((f, idx) => ({
            id: String(idx + 1).padStart(2, "0"),
            name: `/${f.name}.`,
            classCode:
                f.class_code || `/Class ${String(idx + 1).padStart(3, "0")}/`,
            periods:
                ((f.display_metadata as any)?.periods?.length ?? 0) >= 3
                    ? (f.display_metadata as any).periods
                    : DEFAULT_PERIODS,
            additionalDetails:
                ((f.display_metadata as any)?.additionalDetails?.length ?? 0) >=
                3
                    ? (f.display_metadata as any).additionalDetails
                    : DEFAULT_DETAILS,
            timeSlot: "16.00 - 18.00",
            badgeLocation: f.location ?? "Veteran",
            badgeType: f.venue_type ?? "Indoor Facility",
            image: f.image || "/assets/images/comingsoon.avif",
        }))
        .slice(0, 5); // Limit to 5 items

    const activeData: FacilityPricing[] = facilitiesData;
    const [activeIndex, setActiveIndex] = useState(0);
    const activeFacility = activeData[activeIndex];

    const leftItems = activeData.slice(0, 3);
    const rightItems = activeData.slice(3);

    return (
        <section
            className="overflow-x-clip bg-[#FAFAFA]"
            id="pricing-facilities"
        >
            <div className={SECTION_DIVIDER_WRAP_CLASS}>
                <SectionDivider
                    number="02"
                    title="Arena Dalam"
                    subtitle="05 pricing page"
                    theme="light"
                />
            </div>

            <div className={`${SECTION_CONTAINER_CLASS} pb-6`}>
                {/* ── MOBILE LAYOUT (xl:hidden) ───────────────────────────────── */}
                <div className="xl:hidden">
                    <div className="mb-10 flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black">
                                Gabung Member Sekarang
                            </ScrollTextReveal>
                        </div>
                        <ScrollTextReveal
                            as="h2"
                            split="block"
                            delay={80}
                            className={`${SECTION_HEADING_CLASS} mb-6 indent-[2rem] text-black`}
                        >
                            Area gym ini dirancang kardio yang nyaman bagi seluruh pengguna yang ada di UB Sport Center.®
                        </ScrollTextReveal>
                        <ReservasiButton label="Mulai Reservasi" href="#" />
                    </div>

                    {/* Facility list — single column, compact size-8 chevrons */}
                    <div className="mb-6">
                        {activeData.map((facility, idx) => (
                            <button
                                key={facility.id}
                                onClick={() => setActiveIndex(idx)}
                                className={`flex w-full items-center justify-between border-b py-[0.88rem] text-left transition-opacity duration-200 ${
                                    activeIndex === idx
                                        ? "border-black/80 opacity-100"
                                        : "border-black/25 opacity-[0.36]"
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="font-bdo text-[0.86rem] font-normal leading-none tracking-[-0.055em] text-black">
                                        ({facility.id})
                                    </span>
                                    <span className="font-bdo text-[0.82rem] font-medium leading-none tracking-[-0.055em] text-black">
                                        {facility.name}
                                    </span>
                                </div>
                                <span
                                    className={`flex size-[1.35rem] flex-shrink-0 items-center justify-center rounded-full backdrop-blur-sm ${
                                        activeIndex === idx
                                            ? "bg-black/10 text-black"
                                            : "bg-black/5 text-black/45"
                                    }`}
                                >
                                    <ArrowChevron />
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Black card — mobile structure */}
                    {activeFacility && (
                        <div className="relative left-1/2 flex w-screen -translate-x-1/2 flex-col overflow-hidden bg-black px-[0.95rem] pb-[1.65rem] pt-[1.1rem]">
                            <img
                                src={activeFacility.image}
                                alt={activeFacility.name}
                                className="h-[92px] w-full rounded-none object-cover"
                            />
                            <img
                                src={star}
                                alt=""
                                aria-hidden
                                className="mt-6 h-6 w-6 object-contain"
                            />
                            <div className="mt-5 grid grid-cols-3 gap-x-3">
                                {activeFacility.periods.map((period, i) => (
                                    <div
                                        key={i}
                                        className="flex flex-col gap-0.5"
                                    >
                                        <p className="whitespace-pre-line font-bdo text-[0.56rem] font-medium leading-[1.13] tracking-[-0.015em] text-white/85">
                                            {period.label}
                                        </p>
                                        <p className="font-bdo text-[0.56rem] font-medium leading-[1.13] tracking-[-0.015em] text-white/85">
                                            {period.wargaPrice}
                                        </p>
                                        <p className="font-bdo text-[0.56rem] font-medium leading-[1.13] tracking-[-0.015em] text-white/85">
                                            {period.umumPrice}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-7 flex flex-col gap-2.5">
                                {[...activeFacility.additionalDetails]
                                    .sort(
                                        (a, b) =>
                                            detailOrder(a) - detailOrder(b),
                                    )
                                    .map((detail, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-1.5"
                                        >
                                            <div className="size-[0.18rem] flex-shrink-0 rounded-full bg-white/85" />
                                            <span className="font-bdo text-[0.56rem] font-medium leading-none tracking-[-0.015em] text-white/85">
                                                {detail}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                            <div className="mt-8 flex items-end justify-between">
                                <div className="origin-bottom-left scale-[0.62]">
                                    <FacilityBadge
                                        location={activeFacility.badgeLocation}
                                        category={activeFacility.badgeType}
                                    />
                                </div>
                                <span className="font-bdo text-[0.58rem] font-semibold leading-none tracking-[-0.015em] text-white">
                                    /
                                    {displayClassCode(
                                        activeFacility.classCode,
                                    )}
                                    /
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── DESKTOP LAYOUT (hidden xl:block) ────────────────────────── */}
                <div className="hidden xl:block">
                    <div className="mb-16 grid gap-8 xl:mb-16 xl:grid-cols-12 xl:gap-10">
                        <div className="flex flex-col gap-6 xl:col-span-4">
                            <div className="flex items-center gap-4">
                                <span className="section-label-diamond" />
                                <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em] text-black">
                                    Gabung Member Sekarang
                                </ScrollTextReveal>
                            </div>
                            <ReservasiButton label="Mulai Reservasi" href="#" />
                        </div>

                        <div className="flex items-start xl:col-span-8">
                            <ScrollTextReveal
                                as="h2"
                                split="block"
                                delay={80}
                                className={`${SECTION_HEADING_CLASS} max-w-5xl text-black`}
                            >
                                Area gym ini dirancang kardio yang nyaman bagi seluruh pengguna yang ada di UB Sport Center.®
                            </ScrollTextReveal>
                        </div>
                    </div>

                    <div className="mb-12 grid xl:mb-16 xl:grid-cols-2 xl:gap-x-48">
                        <div>
                            {leftItems.map((facility, idx) => (
                                <button
                                    key={facility.id}
                                    onClick={() => setActiveIndex(idx)}
                                    className={`w-full flex items-center justify-between border-b py-6 text-left transition-opacity duration-200 ${
                                        activeIndex === idx
                                            ? "border-black/80 opacity-100"
                                            : "border-black opacity-[0.36] hover:opacity-60"
                                    }`}
                                >
                                    <div className="flex items-center gap-5">
                                        <span className="font-bdo text-[clamp(1.125rem,1.45vw,1.75rem)] font-normal tracking-[-0.04em] text-black">
                                            ({facility.id})
                                        </span>
                                        <span className="font-bdo text-[clamp(1rem,1.35vw,1.625rem)] font-medium tracking-[-0.04em] text-black">
                                            {facility.name}
                                        </span>
                                    </div>
                                    {activeIndex === idx && (
                                        <span className="flex-shrink-0 flex size-9 items-center justify-center rounded-full backdrop-blur-sm bg-black/10">
                                            <ArrowChevron />
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div>
                            {rightItems.map((facility, idx) => {
                                const globalIdx = idx + 3;
                                return (
                                    <button
                                        key={facility.id}
                                        onClick={() =>
                                            setActiveIndex(globalIdx)
                                        }
                                        className={`w-full flex items-center justify-between border-b py-6 text-left transition-opacity duration-200 w-[97%] ${
                                            activeIndex === globalIdx
                                                ? "border-black/80 opacity-100"
                                                : "border-black opacity-[0.36] hover:opacity-60"
                                        }`}
                                    >
                                        <div className="flex items-center gap-5">
                                            <span className="font-bdo text-[clamp(1.125rem,1.45vw,1.75rem)] font-normal tracking-[-0.04em] text-black">
                                                ({facility.id})
                                            </span>
                                            <span className="font-bdo text-[clamp(1rem,1.35vw,1.625rem)] font-medium tracking-[-0.04em] text-black">
                                                {facility.name}
                                            </span>
                                        </div>
                                        {activeIndex === globalIdx && (
                                            <span className="flex-shrink-0 flex size-11 items-center justify-center rounded-full backdrop-blur-sm bg-black/10">
                                                <ArrowChevron />
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="relative left-1/2 flex min-h-[20.5rem] w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[1.25rem] bg-[#212121] p-[0.62rem] xl:flex-row">
                        <div className="flex min-w-0 flex-1 flex-col pb-[2.25rem] pl-[6.7rem] pr-[4.4rem] pt-[1.7rem]">
                            <div className="flex items-start justify-between">
                                <img
                                    src={star}
                                    alt=""
                                    aria-hidden
                                    className="h-[3.1rem] w-[3.1rem] object-contain"
                                />
                                <div className="mr-[0.7rem] flex items-center gap-2.5 pt-0.5">
                                    <Clock
                                        size={18}
                                        className="flex-shrink-0 text-white/80"
                                    />
                                    <span className="font-bdo text-[clamp(0.875rem,0.83vw,1rem)] font-medium leading-none text-white/80">
                                        {activeFacility.timeSlot}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-[1.55rem] grid max-w-[44rem] grid-cols-3 gap-x-[4.7rem]">
                                {activeFacility.periods.map((period, i) => (
                                    <div
                                        key={i}
                                        className="flex min-w-0 flex-col"
                                    >
                                        <p className="font-bdo text-[clamp(1rem,1.02vw,1.16rem)] font-medium leading-[1.23] tracking-[-0.012em] text-white/80 whitespace-pre-line">
                                            {period.label}
                                        </p>
                                        <p className="font-bdo text-[clamp(1rem,1.02vw,1.16rem)] font-medium leading-[1.23] tracking-[-0.012em] text-white/80">
                                            {period.wargaPrice}
                                        </p>
                                        <p className="font-bdo text-[clamp(1rem,1.02vw,1.16rem)] font-medium leading-[1.23] tracking-[-0.012em] text-white/80">
                                            {period.umumPrice}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-[2.55rem] flex max-w-[50rem] flex-wrap gap-x-[1.35rem] gap-y-[1.05rem]">
                                {[...activeFacility.additionalDetails]
                                    .sort(
                                        (a, b) =>
                                            detailOrder(a) - detailOrder(b),
                                    )
                                    .map((detail, i) => (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-2 ${
                                                i === 2 ? "basis-full" : ""
                                            }`}
                                        >
                                            <div className="size-[0.35rem] rounded-full bg-white/80 flex-shrink-0" />
                                            <span className="font-bdo text-[clamp(1rem,1.02vw,1.16rem)] font-medium leading-none tracking-[-0.012em] text-white/80">
                                                {detail}
                                            </span>
                                        </div>
                                    ))}
                            </div>

                            <div className="mt-auto flex items-end justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-bdo font-semibold text-[1.08rem] leading-none tracking-[-0.012em] text-white">
                                        /
                                        {displayClassCode(
                                            activeFacility.classCode,
                                        )}
                                        /
                                    </span>
                                </div>
                                <FacilityBadge
                                    location={activeFacility.badgeLocation}
                                    category={activeFacility.badgeType}
                                />
                            </div>
                        </div>

                        <div className="relative w-[27.55%] flex-shrink-0">
                            <img
                                src={activeFacility.image}
                                alt={activeFacility.name}
                                className="absolute inset-0 h-full w-full rounded-[0.55rem] object-cover"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
