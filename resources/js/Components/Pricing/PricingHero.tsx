import TopBg from "@/../assets/hero/Top.png";
import RightBg from "@/../assets/images/bg-heropricing.avif";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";

export default function PricingHero() {
    return (
        <div className="relative overflow-hidden">
            {/* === ABSOLUTE BACKGROUNDS === */}

            {/* Top blue gradient: 75vh on mobile, 63vh on desktop */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[75vh] overflow-hidden bg-black xl:h-[63vh]">
                <img
                    src={TopBg}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover object-top"
                />
            </div>

            {/* Bottom photo: from 75vh on mobile, from 63vh on desktop */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[75vh] xl:top-[63vh]">
                <div className="absolute inset-0 bg-black" />
                <img
                    src={RightBg}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover object-center xl:hidden"
                />
                {/* Desktop: right 2/3 photo panel only */}
                <div className="absolute inset-y-0 right-0 hidden w-2/3 xl:block">
                    <img
                        src={RightBg}
                        alt=""
                        aria-hidden
                        className="h-full w-full object-cover object-center"
                    />
                </div>
            </div>

            {/* === RELATIVE CONTENT === */}
            <section
                className="relative flex h-screen flex-col"
                id="pricing-hero"
            >
                {/* ---- MOBILE LAYOUT: hidden on xl+ ---- */}
                <div className="flex flex-1 flex-col xl:hidden">
                    {/* Top 75% — blue block — star + heading anchored to bottom */}
                    <div className="flex flex-[3] flex-col justify-end px-6 pb-8 max-w-72">
                        <img
                            src="/assets/hero/star.png"
                            alt=""
                            aria-hidden
                            className="mb-3 h-12 w-12 object-contain opacity-90"
                        />
                        <ScrollTextReveal
                            as="h1"
                            split="words"
                            className="font-bdo font-medium text-[clamp(2.5rem,8vw,4rem)] leading-tight text-white "
                        >
                            Jadwal &amp; Paket Harga
                        </ScrollTextReveal>
                    </div>

                    {/* Bottom 25% — photo block — description centered */}
                    <div className="flex flex-[1] items-center px-6 max-w-72">
                        <p className="font-bdo font-light text-sm leading-relaxed text-white/80">
                            Welcome to the UB Sport where people work on{" "}
                            <span className="font-medium text-white">
                                strength body where people on{" "}
                            </span>
                            <span className="font-medium text-white">
                                strengthening body
                            </span>
                            .
                        </p>
                    </div>
                </div>

                {/* ---- DESKTOP LAYOUT: hidden on mobile, shown on xl+ ---- */}
                <div className="hidden xl:flex xl:flex-1 xl:flex-col">
                    {/* Spacer fills the blue section */}
                    <div className="h-[63vh] flex-shrink-0" />

                    {/* Two-column content row in the black/photo section */}
                    <div className="relative flex flex-1 flex-row">
                        {/* Left 1/3: star + title */}
                        <div className="flex flex-col justify-center px-14 xl:basis-1/3">
                            <div className="pointer-events-none mb-6">
                                <img
                                    src="/assets/hero/star.png"
                                    alt=""
                                    aria-hidden
                                    className="h-20 w-20 object-contain opacity-90"
                                />
                            </div>
                            <ScrollTextReveal
                                as="h1"
                                split="words"
                                className="font-bdo font-medium text-[clamp(2rem,2.7vw,52px)] leading-[1.1] tracking-[-0.017em] text-white"
                            >
                                Jadwal &amp; Paket Harga
                            </ScrollTextReveal>
                        </div>

                        {/* Right 2/3: description */}
                        <div className="flex flex-1 items-center xl:basis-2/3">
                            <p className="relative z-10 ml-auto w-full text-left font-bdo font-light text-[clamp(0.9rem,1.5vw,1.3rem)] leading-relaxed text-white/80 xl:max-w-md xl:pr-16">
                                Pilih jadwal dan paket terbaik Anda, lalu{" "}
                                <span className="font-medium text-white">
                                    mulai perjalanan menuju tubuh yang lebih
                                    kuat dan bugar.
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/10" />
            </section>

            <HeroBottomBar
                variant="transparent"
                sectionNumber="01/"
                sectionLabel="homepage"
                description="UB Sport Center – Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama."
                targetId="pricing-info"
                showVideo={false}
            />
        </div>
    );
}
