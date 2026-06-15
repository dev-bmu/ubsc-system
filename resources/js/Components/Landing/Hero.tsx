import GymTrafficBadge from "@/Components/Landing/GymTrafficBadge";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import HeroContent from "@/Components/Landing/HeroContent";
import HeroTitle from "@/Components/Landing/HeroTitle";
import { Head } from "@inertiajs/react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

import EntranceLoader from "@/Components/Landing/EntranceLoader";

const revealStyle = (
    delay: string,
    x = "0px",
    y = "24px",
): CSSProperties =>
    ({
        "--hero-delay": delay,
        "--hero-x": x,
        "--hero-y": y,
    }) as CSSProperties;

export default function Hero() {
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [isIntroComplete, setIsIntroComplete] = useState(false);
    const [isSettled, setIsSettled] = useState(false);
    const [isConstrainedDevice, setIsConstrainedDevice] = useState(false);
    const isReady = isImageLoaded && isIntroComplete;

    const heroClassName = useMemo(
        () =>
            [
                "ubsc-hero relative flex min-h-screen flex-col overflow-hidden bg-[#040812]",
                isReady ? "ubsc-hero-ready" : "",
                isSettled ? "ubsc-hero-settled" : "ubsc-hero-prep",
                isConstrainedDevice ? "ubsc-hero-lite" : "",
            ]
                .filter(Boolean)
                .join(" "),
        [isConstrainedDevice, isReady, isSettled],
    );

    useEffect(() => {
        const connection = (
            navigator as Navigator & {
                connection?: { saveData?: boolean; effectiveType?: string };
            }
        ).connection;
        const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
            .deviceMemory;
        const cores = navigator.hardwareConcurrency;

        setIsConstrainedDevice(
            Boolean(
                connection?.saveData ||
                    connection?.effectiveType === "2g" ||
                    connection?.effectiveType === "slow-2g" ||
                    (deviceMemory && deviceMemory <= 4) ||
                    (cores && cores <= 4),
            ),
        );
    }, []);

    useEffect(() => {
        if (!isReady) return;

        const timer = window.setTimeout(() => setIsSettled(true), 2100);
        return () => window.clearTimeout(timer);
    }, [isReady]);

    return (
        <>
            <Head>
                <link rel="preload" as="image" href="/assets/hero/Hero.avif" />
                <link rel="preload" as="image" href="/assets/images/ub-sport-enterence.png" />
            </Head>
            <EntranceLoader 
                onExitStart={() => setIsIntroComplete(true)} 
                onComplete={() => {}} 
            />
            <section
                id="home"
                className={heroClassName}
            >

                    <img
                        src="/assets/hero/Hero.avif"
                        alt="UBSC Hero Background"
                        className="ubsc-hero-bg pointer-events-none absolute inset-0 z-0 h-full w-full select-none object-cover object-center"
                        onLoad={() => setIsImageLoaded(true)}
                        onError={() => setIsImageLoaded(true)}
                        draggable={false}
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                    />

                    <div className="ubsc-hero-veil absolute inset-0 z-[1]" />
                    <div className="ubsc-hero-depth absolute inset-0 z-[2]" />
                    <div className="ubsc-hero-sweep absolute inset-0 z-[3]" />
                    <div className="ubsc-hero-frame pointer-events-none absolute inset-0 z-[4]">
                        <span className="ubsc-hero-frame-line ubsc-hero-frame-line--v left-[24%]" />
                        <span className="ubsc-hero-frame-line ubsc-hero-frame-line--v right-[17%]" />
                        <span className="ubsc-hero-frame-line ubsc-hero-frame-line--h bottom-[25%]" />
                    </div>

                    <div className="relative z-10 hidden min-h-screen max-h-[100vh] flex-col items-stretch overflow-y-auto xl:flex">
                        <div className="flex min-h-0 flex-1 items-end justify-between px-6 pb-12 pt-12 xl:px-16 xl:pb-32 xl:pt-32">
                            <div
                                className="ubsc-hero-reveal"
                                style={revealStyle("520ms", "-28px", "0px")}
                            >
                                <GymTrafficBadge />
                            </div>
                            <div
                                className="ubsc-hero-reveal ubsc-hero-reveal--copy"
                                style={revealStyle("650ms", "0px", "28px")}
                            >
                                <HeroContent />
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-col justify-end px-16">
                            <div
                                className="ubsc-hero-reveal ubsc-hero-reveal--title"
                                style={revealStyle("760ms", "0px", "26px")}
                            >
                                <HeroTitle />
                            </div>
                        </div>

                        <div
                            className="ubsc-hero-reveal absolute bottom-6 right-16"
                            style={revealStyle("980ms", "0px", "20px")}
                        >
                            <div className="ubsc-hero-orbit flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white shadow-xl">
                                <img
                                    src="/BMU.svg"
                                    alt="Brawijaya Multi Usaha"
                                    className="h-full w-full object-contain"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="relative z-10 flex min-h-screen flex-col px-8 pt-28 xl:hidden">
                        <div
                            className="ubsc-hero-reveal flex-shrink-0"
                            style={revealStyle("520ms", "-24px", "0px")}
                        >
                            <GymTrafficBadge />
                        </div>

                        <div
                            className="ubsc-hero-reveal ubsc-hero-reveal--copy mt-8 flex-shrink-0"
                            style={revealStyle("650ms", "0px", "26px")}
                        >
                            <HeroContent />
                        </div>

                        <div className="flex flex-1 flex-col justify-end pb-5">
                            <div
                                className="ubsc-hero-reveal mb-6"
                                style={revealStyle("980ms", "0px", "18px")}
                            >
                                <div className="ubsc-hero-orbit mt-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white shadow-xl">
                                    <img
                                        src="/BMU.svg"
                                        alt="Brawijaya Multi Usaha"
                                        className="h-full w-full object-contain"
                                    />
                                </div>
                            </div>

                            <div
                                className="ubsc-hero-reveal ubsc-hero-reveal--title"
                                style={revealStyle("760ms", "0px", "24px")}
                            >
                                <HeroTitle />
                            </div>
                        </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/10" />
            </section>

            <div
                className={`ubsc-hero-bottom-shell ${
                    isReady ? "ubsc-hero-bottom-shell--ready" : ""
                }`}
            >
                <HeroBottomBar showVideo />
            </div>
        </>
    );
}
