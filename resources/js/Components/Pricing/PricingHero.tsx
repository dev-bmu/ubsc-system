import { useEffect, useRef, useState } from "react";
import TopBg from "@/../assets/hero/Top.png";
import RightBg from "@/../assets/images/bg-heropricing.avif";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";

const DESKTOP_TITLE_PANEL_WIDTH =
    "clamp(501px, calc(27.96vw + 112px), 651px)";

const PRICING_ENTRANCE = {
    title: 480,
    copyFirst: 650,
    copySecond: 760,
    copyThird: 870,
} as const;

export default function PricingHero() {
    const sectionRef = useRef<HTMLElement>(null);
    const [phase, setPhase] = useState<"idle" | "prep" | "enter" | "settled">(
        "idle",
    );

    useEffect(() => {
        const prepTimer = setTimeout(() => setPhase("prep"), 30);
        const enterTimer = setTimeout(() => setPhase("enter"), 80);
        const settleTimer = setTimeout(() => setPhase("settled"), 2200);

        return () => {
            clearTimeout(prepTimer);
            clearTimeout(enterTimer);
            clearTimeout(settleTimer);
        };
    }, []);

    return (
        <div
            className={`pricing-hero ah-hero ah-hero--${phase} relative overflow-hidden bg-black text-white`}
        >
            <div className="pricing-hero__top-panel ah-panel ah-panel--top pointer-events-none absolute inset-x-0 top-0 h-[61.5%] overflow-hidden bg-[#103755] sm:h-[54%] lg:h-[56%] xl:h-[63vh] xl:bg-black">
                <img
                    src={TopBg}
                    alt=""
                    aria-hidden
                    className="ah-panel-img absolute inset-0 h-full w-full object-cover object-top"
                    style={{ transformOrigin: "center 70%" }}
                />
                <div
                    aria-hidden
                    className="ah-vignette absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(ellipse at 50% 30%, transparent 40%, rgba(0,0,0,0.18) 100%)",
                    }}
                />
            </div>

            <div className="pricing-hero__bottom-panel ah-panel ah-panel--bottom pointer-events-none absolute inset-x-0 bottom-0 top-[61.5%] bg-black sm:top-[54%] lg:top-[56%] xl:top-[63vh]">
                <div
                    aria-hidden
                    className="absolute inset-y-0 left-0 z-[1] hidden bg-black xl:block"
                    style={{ width: DESKTOP_TITLE_PANEL_WIDTH }}
                />
                <img
                    src={RightBg}
                    alt=""
                    aria-hidden
                    className="ah-panel-img absolute inset-0 h-full w-full object-cover object-center opacity-80 xl:hidden"
                    style={{
                        transformOrigin: "50% 30%",
                    }}
                />
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.92)_0%,rgba(0,0,0,.72)_44%,rgba(0,0,0,.22)_100%)] xl:hidden" />
                <div
                    className="pricing-hero__desktop-media absolute inset-y-0 right-0 hidden overflow-hidden xl:block"
                    style={{ left: DESKTOP_TITLE_PANEL_WIDTH }}
                >
                    <img
                        src={RightBg}
                        alt=""
                        aria-hidden
                        className="ah-panel-img h-full w-full object-cover object-center"
                        style={{
                            transformOrigin: "50% 30%",
                        }}
                    />
                    <div
                        aria-hidden
                        className="pricing-hero__desktop-depth pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,.24)_0%,rgba(0,0,0,.04)_44%,rgba(0,0,0,.08)_100%)]"
                    />
                </div>
            </div>

            <div aria-hidden className="ah-sweep absolute inset-0 z-[2]" />

            <div
                aria-hidden
                className="ah-split-line pointer-events-none absolute inset-x-0 top-[61.5%] z-[3] sm:top-[54%] lg:top-[56%] xl:hidden"
            />

            <section
                ref={sectionRef}
                id="pricing-hero"
                className="relative flex h-[100svh] flex-col xl:h-screen"
            >
                <div className="ah-content absolute inset-x-0 bottom-[92px] top-[47.7%] z-10 grid content-start gap-0 px-[37px] py-0 sm:bottom-[96px] sm:top-[54%] sm:grid-cols-[0.82fr_1.18fr] sm:content-center sm:items-center sm:gap-8 sm:px-10 md:px-14 lg:top-[56%] lg:px-16 xl:hidden">
                    <div className="ah-title-column flex min-w-0 flex-col justify-start sm:justify-center">
                        <img
                            src="/assets/hero/star.png"
                            alt=""
                            aria-hidden
                            className="ah-star relative top-[3.6px] mb-[9px] h-9 w-9 object-contain opacity-95 sm:top-[4.8px] sm:mb-[14.4px] sm:h-12 sm:w-12"
                        />
                        <h1 className="ah-title overflow-hidden font-bdo text-[30px] font-medium leading-[1.04] tracking-[-0.017em] sm:text-[clamp(2rem,4.5vw,3rem)]">
                            <ScrollTextReveal
                                triggerOnMount
                                delay={PRICING_ENTRANCE.title}
                                className="pricing-hero__title-reveal block w-fit whitespace-nowrap"
                            >
                                Jadwal &amp; Paket Harga
                            </ScrollTextReveal>
                        </h1>
                    </div>

                    <div className="ah-desc-column mt-[74px] flex min-w-0 items-center sm:mt-0 sm:justify-end">
                        <p className="pricing-hero__lead ah-desc ah-desc--scroll-reveal max-w-[316px] font-bdo text-[12.5px] font-light leading-[1.38] text-white/88 sm:max-w-[520px] sm:text-[clamp(0.9rem,2.2vw,1.25rem)] sm:leading-[1.34]">
                            <ScrollTextReveal
                                triggerOnMount
                                delay={PRICING_ENTRANCE.copyFirst}
                                className="block whitespace-nowrap"
                            >
                                Atur jadwal sesuai ritme dan tujuan Anda.
                            </ScrollTextReveal>
                            <ScrollTextReveal
                                triggerOnMount
                                delay={PRICING_ENTRANCE.copySecond}
                                className="block whitespace-nowrap font-medium text-white"
                            >
                                Pilih paket terbaik untuk target Anda.
                            </ScrollTextReveal>
                            <ScrollTextReveal
                                triggerOnMount
                                delay={PRICING_ENTRANCE.copyThird}
                                className="block whitespace-nowrap font-medium text-white"
                            >
                                Raih tubuh lebih kuat, aktif, dan bugar.
                            </ScrollTextReveal>
                        </p>
                    </div>
                </div>

                <div className="relative z-10 hidden flex-1 flex-col xl:flex">
                    <div className="h-[63vh] flex-shrink-0" />

                    <div className="relative flex flex-1 items-center">
                        <div className="relative flex w-full items-end">
                            <div
                                className="absolute bottom-0 left-0 flex flex-col px-14"
                                style={{ width: DESKTOP_TITLE_PANEL_WIDTH }}
                            >
                                <img
                                    src="/assets/hero/star.png"
                                    alt=""
                                    aria-hidden
                                    className="ah-star pointer-events-none relative mb-0 h-20 w-20 object-contain opacity-90"
                                />
                                <h1 className="ah-title whitespace-nowrap font-bdo text-[30px] font-medium leading-[1.04] tracking-[-0.017em] sm:text-[clamp(2rem,4.5vw,3rem)] xl:text-[clamp(2.35rem,2.7vw,3.25rem)]">
                                    <ScrollTextReveal
                                        triggerOnMount
                                        delay={PRICING_ENTRANCE.title}
                                        className="pricing-hero__title-reveal block w-fit whitespace-nowrap"
                                    >
                                        Jadwal &amp; Paket Harga
                                    </ScrollTextReveal>
                                </h1>
                            </div>

                            <div
                                className="pricing-hero__desktop-copy flex min-w-0 flex-1 justify-end"
                                style={{ marginLeft: DESKTOP_TITLE_PANEL_WIDTH }}
                            >
                                <p className="pricing-hero__lead pricing-hero__lead--desktop ah-desc ah-desc--scroll-reveal max-w-[316px] text-right font-bdo text-[12.5px] font-light leading-[1.38] text-white/88 sm:max-w-[520px] sm:text-[clamp(0.9rem,2.2vw,1.25rem)] sm:leading-[1.34] xl:text-[clamp(1.05rem,1.45vw,1.75rem)]">
                                    <ScrollTextReveal
                                        triggerOnMount
                                        delay={PRICING_ENTRANCE.copyFirst}
                                        className="pricing-hero__copy-line block whitespace-nowrap"
                                    >
                                        Atur jadwal sesuai ritme dan tujuan Anda.
                                    </ScrollTextReveal>
                                    <ScrollTextReveal
                                        triggerOnMount
                                        delay={PRICING_ENTRANCE.copySecond}
                                        className="pricing-hero__copy-line block whitespace-nowrap font-medium text-white"
                                    >
                                        Pilih paket terbaik untuk target Anda.
                                    </ScrollTextReveal>
                                    <ScrollTextReveal
                                        triggerOnMount
                                        delay={PRICING_ENTRANCE.copyThird}
                                        className="pricing-hero__copy-line block whitespace-nowrap font-medium text-white"
                                    >
                                        Raih tubuh lebih kuat, aktif, dan bugar.
                                    </ScrollTextReveal>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="pricing-hero-bottom ah-bottom-motion page-hero-bottom pointer-events-auto absolute inset-x-0 bottom-0 z-30 xl:relative xl:inset-auto">
                <HeroBottomBar
                    variant="transparent"
                    sectionNumber="05/"
                    sectionLabel="pricingpage"
                    description="UB Sport Center - Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama."
                    targetId="pricing-info"
                    showVideo={false}
                    lineInset
                    sectionInset
                    mobileCopySmaller
                    mobileCopyLockRight
                />
            </div>
        </div>
    );
}
