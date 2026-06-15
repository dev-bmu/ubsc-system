import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import {
    FALLBACK_MEMBERSHIP_PLANS,
    MembershipPlanCarousel,
} from "@/Components/Landing/SectionTwo";
import type { MembershipPlanItem } from "@/types";

const STATS_DATA = [
    { label: "Jadwal Latihan", value: "Fleksibel 06.00 - 21.00" },
    { label: "Paket Membership", value: "Mulai dari 150K / Bulan" },
    { label: "Cabang Tersedia", value: "2 Lokasi Aktif" },
];

const SECTION_CONTAINER_CLASS =
    "mx-auto max-w-8xl px-[clamp(1.5rem,4.5vw,5.5rem)]";
const SECTION_HEADING_CLASS =
    "font-bdo text-[clamp(1.75rem,2.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.021em] text-black indent-[2rem] sm:indent-[4rem] lg:indent-[6rem] xl:indent-[6rem]";
const BODY_TEXT_CLASS =
    "font-bdo text-[clamp(0.75rem,0.8vw,0.875rem)] font-normal leading-relaxed text-gray-500";
const RESULT_ROW_CLASS =
    "flex h-[clamp(2.75rem,2.86vw,3.4375rem)] items-center justify-between border-b border-gray-200/80 last:border-b-0";
const SECTION_DIVIDER_WRAP_CLASS =
    "mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)]  pb-16 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14";

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

            <div className={`${SECTION_CONTAINER_CLASS} pb-16 xl:pb-20`}>
                <div className="flex flex-col gap-6 xl:hidden">
                    <div className="flex items-center gap-4">
                        <span className="section-label-diamond" />
                        <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]">
                            Program Membership
                        </ScrollTextReveal>
                    </div>

                    <ScrollTextReveal
                        as="h2"
                        split="block"
                        delay={80}
                        className={SECTION_HEADING_CLASS}
                    >
                        Nikmati semua fasilitas olahraga yang pasti modern untuk
                        mendukung kebugaran, performa, dan gaya hidup. Nikmati
                        semua fasilitas olahraga yang modern untuk mendukung.
                    </ScrollTextReveal>

                    <div className="mx-auto my-6 w-full max-w-[380px]">
                        <MembershipPlanCarousel plans={plans} />
                    </div>
                    <ReservasiButton label="Daftar Sekarang" href="#" />
                    <div className="mt-2 flex flex-col">
                        <span className="mb-2 font-bdo text-[clamp(0.75rem,0.8vw,0.875rem)] font-medium text-black/40">
                            (=Results)
                        </span>
                        {STATS_DATA.map((stat, index) => (
                            <div
                                key={index}
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

                <div className="hidden xl:grid xl:grid-cols-12 xl:items-stretch xl:gap-x-10">
                    <div className="flex flex-col items-start justify-between gap-12 xl:col-span-4">
                        <div className="flex items-center gap-4">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]">
                                Program Membership
                            </ScrollTextReveal>
                        </div>

                        <div className="mt-auto w-[420px] flex-shrink-0">
                            <MembershipPlanCarousel plans={plans} />
                        </div>
                    </div>

                    <div className="flex flex-col items-start gap-10 xl:col-span-8 xl:gap-12">
                        <ScrollTextReveal
                            as="h2"
                            split="block"
                            delay={80}
                            className={SECTION_HEADING_CLASS}
                        >
                            Nikmati semua fasilitas olahraga yang pasti modern
                            untuk mendukung kebugaran, performa, dan gaya hidup.
                            Nikmati semua fasilitas olahraga yang modern untuk
                            mendukung.
                        </ScrollTextReveal>

                        <div
                            className="mt-6 grid w-full gap-x-8 xl:gap-x-10"
                            style={{
                                gridTemplateColumns:
                                    "clamp(210px,12.5vw,240px) minmax(0, clamp(540px,37vw,740px))",
                            }}
                        >
                            <div className="pt-1">
                                <span className="font-bdo text-[clamp(0.875rem,0.95vw,1.125rem)] font-medium text-black">
                                    (=Results)
                                </span>
                            </div>
                            <div className="flex w-full max-w-[740px] flex-col">
                                {STATS_DATA.map((stat, index) => (
                                    <div
                                        key={index}
                                        className={RESULT_ROW_CLASS}
                                    >
                                        <span className="font-bdo text-[clamp(0.875rem,1vw,1.125rem)] font-medium text-black">
                                            {stat.label}
                                        </span>
                                        <span className="pl-4 text-right font-bdo text-[clamp(0.875rem,1vw,1.125rem)] font-medium text-gray-500">
                                            {stat.value}
                                        </span>
                                    </div>
                                ))}
                                <ScrollTextReveal
                                    as="p"
                                    split="words"
                                    delay={150}
                                    className={`${BODY_TEXT_CLASS} mt-[clamp(2.5rem,2.86vw,3.4375rem)] max-w-[650px] text-[clamp(0.875rem,1vw,1.125rem)]`}
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
                            <ReservasiButton label="Daftar Sekarang" href="#" />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
