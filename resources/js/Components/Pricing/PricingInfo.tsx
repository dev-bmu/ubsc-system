import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import {
    FALLBACK_MEMBERSHIP_PLANS,
    MembershipPlanCarousel,
} from "@/Components/Landing/SectionTwo";
import type { MembershipPlanItem } from "@/types";
import "./PricingInfo.css";

const PRICING_MEMBERSHIP_HEADING =
    "Temukan ritme terbaik untuk latihan Anda bersama fasilitas modern, program terarah, dan membership fleksibel agar tetap konsisten, meningkatkan performa, dan mencapai target.";

const PRICING_MEMBERSHIP_HEADING_CLASS =
    "pricing-membership__heading section-two-headline-weight max-w-[1100px] text-left font-bdo text-[clamp(2.05rem,8.15vw,2.82rem)] font-medium leading-[1.01] tracking-[-0.058em] text-black md:text-[clamp(2.08rem,4.5vw,2.6rem)] lg:text-[clamp(2.2rem,3.8vw,2.7rem)] xl:max-w-[980px] xl:text-[clamp(2.05rem,2.38vw,2.36rem)] min-[1440px]:text-[clamp(2.45rem,2.82vw,2.7rem)] 2xl:max-w-[1120px] 2xl:text-[clamp(2.7rem,2.55vw,3.15rem)]";

function PricingMembershipHeadline() {
    return (
        <h2
            aria-label={PRICING_MEMBERSHIP_HEADING}
            className={PRICING_MEMBERSHIP_HEADING_CLASS}
        >
            <ScrollTextReveal
                split="lines"
                delay={110}
                stagger={95}
                className="pricing-membership__heading-reveal"
            >
                {PRICING_MEMBERSHIP_HEADING}
            </ScrollTextReveal>
        </h2>
    );
}

const STATS_DATA = [
    { label: "Jadwal Latihan", value: "Fleksibel 06.00 - 21.00" },
    { label: "Paket Membership", value: "Mulai dari 150K / Bulan" },
    { label: "Cabang Tersedia", value: "2 Lokasi Aktif" },
];

const SECTION_CONTAINER_CLASS =
    "mx-auto max-w-8xl px-[clamp(1.5rem,4.5vw,5.5rem)]";
const BODY_TEXT_CLASS =
    "font-bdo text-[clamp(0.8rem,0.8vw,0.875rem)] font-normal leading-relaxed text-gray-500 lg:text-[clamp(0.75rem,0.8vw,0.875rem)]";
const RESULT_ROW_CLASS =
    "flex h-[clamp(2.75rem,2.86vw,3.4375rem)] items-center justify-between border-b border-gray-200/80 last:border-b-0";
const SECTION_DIVIDER_WRAP_CLASS =
    "mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)]  pb-10 pt-10 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14";

interface Props {
    membershipPlans?: MembershipPlanItem[];
}

export default function PricingSectionTwo({ membershipPlans }: Props) {
    const plans =
        membershipPlans && membershipPlans.length > 0
            ? membershipPlans
            : FALLBACK_MEMBERSHIP_PLANS;

    return (
        <section className="overflow-x-clip bg-white" id="pricing-info">
            <div className={SECTION_DIVIDER_WRAP_CLASS}>
                <SectionDivider
                    number="01"
                    title="Paket Kami"
                    subtitle="05 pricing page"
                    theme="light"
                />
            </div>

            <div className={`${SECTION_CONTAINER_CLASS} pb-10 xl:pb-20`}>
                <div className="flex flex-col gap-4 xl:hidden">
                    <div className="flex items-center gap-4">
                        <span className="section-label-diamond" />
                        <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]">
                            Program Membership
                        </ScrollTextReveal>
                    </div>

                    <PricingMembershipHeadline />

                    <div className="mx-auto my-6 w-full max-w-[380px]">
                        <MembershipPlanCarousel plans={plans} />
                    </div>

                    <ReservasiButton label="Daftar Sekarang" href="#" />

                    <div className="mt-2 flex flex-col">
                        <span className="mb-2 font-bdo text-[clamp(0.75rem,0.8vw,0.875rem)] font-medium text-black">
                            (=Results)
                        </span>
                        {STATS_DATA.map((stat) => (
                            <div
                                key={stat.label}
                                className="flex items-center justify-between border-b border-gray-200/80 py-3 last:border-b-0"
                            >
                                <span className="font-bdo text-[clamp(0.875rem,1vw,1.125rem)] font-medium text-black">
                                    {stat.label}
                                </span>
                                <span className="pl-3 text-right font-bdo text-[clamp(0.875rem,1vw,1.125rem)] font-medium text-gray-500">
                                    {stat.value}
                                </span>
                            </div>
                        ))}
                    </div>

                    <ScrollTextReveal
                        as="p"
                        split="words"
                        delay={150}
                        className={BODY_TEXT_CLASS}
                    >
                        UB Sport Center hadir untuk mendukung gaya hidup aktif
                        Anda dengan fasilitas olahraga modern, instruktur
                        profesional, dan program membership yang dirancang untuk
                        semua kalangan di Kota Malang.
                    </ScrollTextReveal>
                </div>

                <div className="hidden xl:grid xl:grid-cols-12 xl:items-start xl:gap-x-10">
                    <div className="flex flex-col items-start xl:col-span-4">
                        <div className="flex items-center gap-4">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]">
                                Program Membership
                            </ScrollTextReveal>
                        </div>

                        <div className="mt-[clamp(2.5rem,3.2vw,3.75rem)] w-full max-w-[420px] flex-shrink-0">
                            <MembershipPlanCarousel plans={plans} />
                        </div>
                    </div>

                    <div className="flex flex-col items-start gap-10 xl:col-span-8">
                        <PricingMembershipHeadline />

                        <div
                            className="pricing-membership__results grid w-full gap-x-8 xl:gap-x-10"
                            style={{
                                gridTemplateColumns:
                                    "clamp(205px,12vw,232px) minmax(0, 1fr)",
                            }}
                        >
                            <div className="pt-1">
                                <span className="pricing-membership__results-label font-bdo text-[clamp(0.875rem,0.95vw,1.125rem)] font-medium text-black">
                                    (=Results)
                                </span>
                            </div>

                            <div className="pricing-membership__results-table flex w-full flex-col">
                                {STATS_DATA.map((stat) => (
                                    <div
                                        key={stat.label}
                                        className={`${RESULT_ROW_CLASS} pricing-membership__result-row`}
                                    >
                                        <span className="pricing-membership__result-label font-bdo text-[clamp(0.875rem,1vw,1.125rem)] font-medium text-black">
                                            {stat.label}
                                        </span>
                                        <span className="pricing-membership__result-value pl-4 text-right font-bdo text-[clamp(0.875rem,1vw,1.125rem)] font-medium text-gray-500">
                                            {stat.value}
                                        </span>
                                    </div>
                                ))}

                                <ScrollTextReveal
                                    as="p"
                                    split="words"
                                    delay={150}
                                    className={`${BODY_TEXT_CLASS} pricing-membership__summary mt-[clamp(2.25rem,2.5vw,3rem)] max-w-[680px] text-[clamp(0.875rem,1vw,1.125rem)]`}
                                >
                                    UB Sport Center hadir untuk mendukung gaya
                                    hidup aktif Anda dengan fasilitas olahraga
                                    modern, instruktur profesional, dan program
                                    membership yang dirancang untuk semua
                                    kalangan di Kota Malang.
                                </ScrollTextReveal>
                            </div>
                        </div>

                        <div className="mt-auto w-full self-start pb-6">
                            <ReservasiButton
                                label="Daftar Sekarang"
                                href="#"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
