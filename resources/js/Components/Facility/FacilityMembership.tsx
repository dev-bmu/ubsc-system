import SectionDivider from "@/Components/Landing/SectionDivider";
import ReservasiButton from "@/Components/Landing/ReservasiButton";
import LogoMarquee from "@/Components/Landing/LogoMarquee";
import CurvedLoop from "@/Components/Landing/CurvedLoop";
import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import person from "@/../assets/images/person.avif";
import bg from "@/../assets/images/bg-about.avif";

const SECTION_CONTAINER_CLASS =
    "mx-auto max-w-8xl px-[clamp(1.5rem,4.5vw,5.5rem)]";
const SECTION_HEADING_CLASS =
    "font-bdo text-[clamp(1.75rem,2.5vw,3rem)] font-medium leading-[1.1] tracking-[-0.021em] text-black";
const BODY_TEXT_CLASS =
    "font-bdo text-[clamp(0.75rem,0.8vw,0.875rem)] font-normal leading-relaxed text-gray-500";
const SECTION_DIVIDER_WRAP_CLASS =
    "mx-auto px-[clamp(1.5rem,2.7vw,5.5rem)] pb-16 pt-12 sm:pb-20 md:pt-14 lg:pt-16 xl:pb-16 xl:pt-14";

export default function FacilityMembership() {
    return (
        <section className="overflow-x-clip bg-white" id="facility-membership">
            <div className={SECTION_DIVIDER_WRAP_CLASS}>
                <SectionDivider
                    number="01"
                    title="Fasilitas Gym"
                    subtitle="04 facility page"
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
                        Bergabunglah dengan komunitas olahraga terbaik dan capai
                        target Anda. Kami sedia program terstruktur - semua di
                        satu tempat.
                    </ScrollTextReveal>

                    <div className="aspect-[480/216] w-full overflow-hidden rounded-[5px] bg-gray-100">
                        <img
                            src="/assets/images/gym-konten-2-olahraga-ub-sport-center.avif"
                            alt="UB Sport Center membership"
                            className="h-full w-full object-cover"
                        />
                    </div>

                    <ScrollTextReveal
                        as="p"
                        split="words"
                        delay={150}
                        className={BODY_TEXT_CLASS}
                    >
                        Daftarkan diri Anda sekarang dan rasakan pengalaman
                        berolahraga yang sesungguhnya. Pilih paket membership
                        yang sesuai dengan kebutuhan dan jadwal Anda di UB Sport
                        Center.
                    </ScrollTextReveal>

                    <ReservasiButton label="Daftar Sekarang" href="#" />
                </div>

                <div className="hidden xl:grid xl:grid-cols-[minmax(28rem,30rem)_minmax(0,1fr)] xl:gap-x-[clamp(5rem,6.25vw,7.5rem)]">
                    <div className="flex flex-col gap-[9.4rem]">
                        <div className="flex items-center gap-4">
                            <span className="section-label-diamond" />
                            <ScrollTextReveal className="font-bdo text-[clamp(1.16rem,1.32vw,1.45rem)] font-medium tracking-[-0.025em]">
                                Program Membership
                            </ScrollTextReveal>
                        </div>

                        <div className="aspect-[480/216] w-[82%] overflow-hidden rounded-[5px] bg-gray-100 ml-5">
                            <img
                                src="/assets/images/gym-konten-2-olahraga-ub-sport-center.avif"
                                alt="UB Sport Center membership"
                                className="h-full w-full object-cover"
                            />
                        </div>
                    </div>

                    <div className="flex min-w-0 flex-col -ml-16">
                        <ScrollTextReveal
                            as="h2"
                            split="block"
                            delay={80}
                            className={`${SECTION_HEADING_CLASS} max-w-[62rem]`}
                        >
                            Bergabunglah dengan komunitas olahraga terbaik dan
                            capai target Anda. Kami sedia program terstruktur -
                            semua di satu tempat.
                        </ScrollTextReveal>

                        <div className="mt-[8.85rem] grid grid-cols-[minmax(0,33rem)_auto] items-center gap-x-[1rem]">
                            <ScrollTextReveal
                                as="p"
                                split="words"
                                delay={150}
                                className="max-w-[27rem] font-bdo text-[clamp(1rem,1.05vw,1.18rem)] font-normal leading-[1.35] tracking-[-0.03em] text-[#242424]"
                            >
                                Daftarkan diri Anda sekarang dan rasakan
                                pengalaman berolahraga yang sesungguhnya. Pilih
                                paket membership yang sesuai dengan kebutuhan
                                dan jadwal Anda di UB Sport Center.
                            </ScrollTextReveal>
                            <ReservasiButton label="Daftar Sekarang" href="#" />
                        </div>
                    </div>
                </div>

                <hr className="my-[4.35rem] w-full border-gray-200" />
                <LogoMarquee density="compact" label="/WORKED WITH" />
            </div>

            <div
                className="relative mx-4 mb-10 overflow-hidden py-36 xl:mx-16 xl:mb-12 xl:py-52"
                style={{
                    backgroundImage: `url(${bg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                }}
            >
                <CurvedLoop
                    marqueeText="UB   *   SPORT  *  CENTER   *   UBSC   *   "
                    speed={1.5}
                    curveAmount={200}
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
