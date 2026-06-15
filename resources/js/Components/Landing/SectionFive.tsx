import NewsSection from "@/Components/Landing/NewsSection";
import ReelsSection from "@/Components/Landing/ReelsSection";
import SectionDivider from "@/Components/Landing/SectionDivider";
import SectionActionLink from "@/Components/Landing/SectionActionLink";
import type { NewsItem } from "@/Components/Landing/NewsCard";
import type { ReelItem } from "@/Components/Landing/ReelCard";

const STATS = [
    {
        value: "99.9%",
        mobileValue: "99.9%",
        description:
            "Akurasi standar layanan kami yang selalu terjaga setiap saat.",
    },
    {
        value: "1K+",
        mobileValue: "1M+",
        description: "Kunjungan pengguna yang telah berlatih bersama kami.",
    },
    {
        value: "3X",
        mobileValue: "3X",
        description: "Peningkatan fasilitas dan layanan jadi lebih optimal",
    },
    {
        value: "24/7",
        mobileValue: "24/7",
        description:
            "Akses informasi dan sistem booking online aktif setiap saat.",
    },
] as const;

function ImpactStats() {
    return (
        <div className="grid grid-cols-2 border-t border-white/15 xl:grid-cols-4 xl:border-t-0 xl:pl-[4.45vw] xl:pr-[1.3vw]">
            {STATS.map((stat) => (
                <article
                    key={stat.value}
                    className="min-w-0 -translate-y-[6px] border-white/15 px-0 py-[13px] odd:border-r odd:pr-[14px] even:pl-[16px] xl:translate-y-0 xl:border-r-0 xl:px-0 xl:py-0"
                >
                    <p className="font-bdo text-[46px] font-normal leading-none tracking-[-0.055em] text-white sm:text-[54px] xl:-translate-y-[14px] xl:text-[clamp(5.5rem,6.4vw,7.7rem)]">
                        <span className="xl:hidden">{stat.mobileValue}</span>
                        <span className="hidden xl:inline">{stat.value}</span>
                    </p>
                    <p className="mt-[19px] max-w-[142px] font-bdo text-[8.5px] font-light leading-[1.42] tracking-[-0.018em] text-white/90 sm:max-w-[170px] sm:text-[10px] xl:mt-[clamp(2.3rem,4.6vh,3.1rem)] xl:max-w-[285px] xl:text-[clamp(0.82rem,1.02vw,1.18rem)] xl:leading-[1.42]">
                        {stat.description}
                    </p>
                </article>
            ))}
        </div>
    );
}

function ImpactHero() {
    return (
        <div className="relative isolate h-[689px] overflow-hidden bg-[#00000] text-white sm:h-[780px] xl:h-auto xl:min-h-[720px] xl:aspect-[1920/955]">
            <img
                src="/assets/images/ub-sport-statistic-data.png"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover object-[50%_center] sm:object-[45%_center] xl:object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,8,12,.24)_0%,rgba(0,8,12,.04)_48%,rgba(0,8,12,.08)_100%)] xl:bg-[linear-gradient(90deg,rgba(0,8,12,.14)_0%,rgba(0,8,12,.02)_48%,rgba(0,8,12,.05)_100%)]" />

            <div className="relative z-10 flex h-full flex-col px-[38px] pb-[25px] pt-[48px] sm:px-10 sm:pt-12 xl:px-[clamp(2.75rem,2.86vw,3.5rem)] xl:pb-[clamp(5.7rem,10.5vh,6.4rem)] xl:pt-[clamp(2rem,5.7vh,3.65rem)]">
                <SectionDivider
                    number="03"
                    title="Dampak"
                    subtitle="01 homepage"
                    theme="dark"
                    outerClassName="!pt-[10px] xl:!pt-[15px]"
                    contentClassName="!text-[7px] sm:!text-[9px] xl:!text-[clamp(0.72rem,0.84vw,1rem)]"
                />

                <div className="mt-[31px] grid gap-0 xl:mt-[clamp(3.4rem,7.5vh,5.2rem)] xl:grid-cols-[minmax(0,1.7fr)_minmax(340px,.82fr)] xl:gap-[clamp(3rem,6vw,7rem)]">
                    <h2 className="max-w-[325px] font-clash text-[29px] font-medium leading-[0.98] tracking-[-0.045em] text-white sm:max-w-[430px] sm:text-[38px] xl:w-[calc(100%+4vw)] xl:max-w-none xl:pl-[1.7vw] xl:text-[clamp(3.4rem,4.17vw,5rem)] xl:leading-[1.12]">
                        <span className="xl:hidden">
                            Standar baru
                            <br />
                            berolahraga hanya
                            <br />
                            di{" "}
                        </span>
                        <span className="hidden xl:inline">
                            Standar baru berolahraga
                            <br />
                            hanya di{" "}
                        </span>
                        <span className="text-[#ff0000]">UB Sport Center.</span>
                    </h2>

                    <div className="mt-[20px] xl:mt-0 xl:pl-4 xl:pt-0">
                        <p className="max-w-[300px] font-bdo text-[11px] font-light leading-[1.45] text-white sm:max-w-[420px] sm:text-sm xl:max-w-[520px] xl:text-[clamp(1.25rem,1.55vw,1.875rem)] xl:leading-[1.28]">
                            Komitmen kami adalah menghadirkan
                            <br />{" "}
                            <strong className="font-medium">
                                ekosistem olahraga yang inklusif.
                            </strong>
                        </p>
                        <div className="mt-[22px] max-w-[300px] sm:max-w-[420px] xl:mt-[clamp(2rem,5.5vh,3.5rem)] xl:max-w-[520px]">
                            <SectionActionLink label="Mulai Reservasi Sekarang" />
                        </div>
                    </div>
                </div>

                <div className="mt-auto border-b border-white/15 pb-[23px] xl:border-b-0 xl:pb-0 xl:pt-8">
                    <ImpactStats />
                </div>
            </div>
        </div>
    );
}

export default function SectionFive({
    news,
    reels,
}: {
    news?: NewsItem[];
    reels?: ReelItem[];
}) {
    return (
        <section id="impact" className="w-full bg-black pt-3 sm:pt-4 md:pt-8 xl:pt-20 text-white">
            <ImpactHero />
            <ReelsSection reels={reels} />
            <NewsSection news={news} />
        </section>
    );
}
