import { useEffect, useState } from "react";
import { useMotionValue, useAnimationFrame } from "framer-motion";
import SectionDivider from "@/Components/Landing/SectionDivider";
import CurvedLoop from "@/Components/Landing/CurvedLoop";
import person from "@/../assets/images/person.avif";
import bg from "@/../assets/images/bg-about.avif";

function useCountUp(target: number, duration: number = 2.3) {
    const motionValue = useMotionValue(0);
    const [value, setValue] = useState(0);
    useEffect(() => {
        const start = performance.now();
        function animate(now: number) {
            const elapsed = (now - start) / 1000;
            const progress = Math.min(elapsed / duration, 1);
            const current = target * progress;
            motionValue.set(current);
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }
        requestAnimationFrame(animate);
    }, [target, duration, motionValue]);
    useAnimationFrame(() => {
        setValue(motionValue.get());
    });
    return value;
}

const STATS = [
    { value: 81.5, suffix: "%", label: "Tingkat Kepuasan" },
    { value: 122, suffix: "+", label: "Karyawan" },
    { value: 17, suffix: "+", label: "Fasilitas" },
    { value: 231, suffix: "", label: "Membership" },
];

function StatItem({
    value,
    suffix,
    label,
}: {
    value: number;
    suffix: string;
    label: string;
}) {
    const animated = useCountUp(value, 1.4);
    let display: string;
    if (suffix === "%") {
        display = `${animated.toFixed(1)}%`;
    } else if (suffix === "+") {
        if (value >= 1000) display = `${Math.round(animated / 1000)}K+`;
        else display = `${Math.round(animated)}+`;
    } else {
        display = `${Math.round(animated)}`;
    }

    return (
        <div className="flex h-full flex-col gap-4 px-5 py-8 sm:px-8 sm:py-10 xl:gap-[30px] xl:px-[clamp(3.4rem,3.45vw,4.2rem)] xl:py-[clamp(3rem,3vw,3.65rem)]">
            <span className="font-bdo text-[clamp(3rem,4.15vw,80px)] font-normal leading-none tracking-[-0.045em] text-black">
                {display}
            </span>
            <span className="font-bdo text-[clamp(1rem,1.25vw,24px)] font-light normal-case tracking-normal text-black/40">
                {label}
            </span>
        </div>
    );
}

function useResponsiveCurve(mobile: number, desktop: number): number {
    const [curve, setCurve] = useState<number>(() =>
        typeof window !== "undefined" && window.innerWidth < 1280
            ? mobile
            : desktop,
    );
    useEffect(() => {
        const update = () =>
            setCurve(window.innerWidth < 1280 ? mobile : desktop);
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, [mobile, desktop]);
    return curve;
}

export default function AboutHistory() {
    const curveAmount = useResponsiveCurve(120, 200);
    return (
        <section className="w-full bg-white" id="about-history">
            <div className="mx-auto w-full px-6 pb-16 pt-10 sm:px-10 sm:pb-20 sm:pt-14 lg:px-12 xl:px-[clamp(2.8rem,2.85vw,3.5rem)] xl:pb-[9.5rem] xl:pt-[6.65rem]">
                <SectionDivider
                    number="01"
                    title="Lokasi Kami"
                    subtitle="01 homepage"
                    theme="light"
                />

                <div className="mt-14 grid grid-cols-1 gap-8 sm:mt-16 xl:mt-[5.65rem] xl:grid-cols-[clamp(24rem,25vw,30rem)_minmax(0,0.97fr)_minmax(0,1.03fr)] xl:gap-[clamp(4rem,4.2vw,5rem)]">
                    <h2 className="font-bdo text-[clamp(2rem,2.82vw,54px)] font-semibold leading-[1.34] tracking-[-0.035em] text-black">
                        <span className="block">Sejarah dan</span>
                        <span className="block">Perkembangan</span>
                    </h2>
                    <p className="max-w-[590px] font-bdo text-[clamp(1rem,1.04vw,20px)] font-normal leading-[1.34] tracking-[-0.018em] text-black/70 xl:pt-2">
                        UB Sport Center merupakan pusat olahraga milik
                        Universitas Brawijaya yang dikelola oleh PT Brawijaya
                        Multi Usaha, dengan tujuan menyediakan fasilitas
                        olahraga yang representatif bagi sivitas akademika dan
                        masyarakat umum.
                    </p>
                    <p className="max-w-[590px] font-bdo text-[clamp(1rem,1.04vw,20px)] font-normal leading-[1.34] tracking-[-0.018em] text-black/70 xl:pt-2">
                        Berdiri sejak tahun 2008 sebagai Fitness Centre di
                        lingkungan Universitas Brawijaya, UB Sport Center
                        berkembang menjadi pusat olahraga terpadu berbasis
                        pendidikan dengan layanan dan fasilitas yang terkelola
                        secara profesional.
                    </p>
                </div>

                <div className="mt-16 grid min-h-[314px] grid-cols-2 border-l border-t border-black/25 sm:mt-[3.65rem] md:grid-cols-4 xl:min-h-[313px]">
                    {STATS.map((stat, index) => (
                        <div
                            key={stat.label}
                            className={`border-r border-black/25 ${
                                index < 2 ? "border-b md:border-b-0" : ""
                            }`}
                        >
                            <StatItem {...stat} />
                        </div>
                    ))}
                </div>
            </div>

            <div
                className="relative mx-4 overflow-hidden py-36 xl:mx-16 xl:mb-12 xl:py-52"
                style={{
                    backgroundImage: `url(${bg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                }}
            >
                <CurvedLoop
                    marqueeText="UB   ✦   SPORT  ✦  CENTER   ✦   UBSC   ✦   "
                    speed={1.5}
                    curveAmount={curveAmount}
                    direction="left"
                    interactive
                    className="z-100 absolute -top-12 h-full xl:-top-16"
                />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <img
                        src={person}
                        alt="UB Sport Center athlete"
                        className="h-44 w-auto object-cover shadow-2xl md:h-64 xl:h-80"
                    />
                </div>
            </div>
        </section>
    );
}
