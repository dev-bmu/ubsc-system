import useEmblaCarousel from "embla-carousel-react";
import { useEmblaNav } from "@/hooks/useEmblaNav";
import AnimatedBookingLink from "@/Components/News/AnimatedBookingLink";
import CarouselNavButtons from "@/Components/Landing/CarouselNavButtons";
import ReelCard from "@/Components/Landing/ReelCard";
import type { ReelItem } from "@/Components/Landing/ReelCard";

const DUMMY_REELS: ReelItem[] = [
    {
        id: 1,
        date: "31/12 2025",
        title: "SPORT CENTER UB.",
        isActive: true,
        thumbnail: "/assets/reels/thumbnail 1.png",
        videoUrl: "/assets/reels/reels ubsc 1.mp4",
    },
    {
        id: 2,
        date: "16/12 2025",
        title: "SPORT CENTER UB.",
        thumbnail: "/assets/reels/thumbnail 2.png",
        videoUrl: "/assets/reels/reels ubsc 2.mp4",
    },
    {
        id: 3,
        date: "10/12 2025",
        title: "SPORT CENTER UB.",
        thumbnail: "/assets/reels/thumbnail 3.png",
        videoUrl: "/assets/reels/reels ubsc 3.mp4",
    },
    {
        id: 4,
        date: "05/12 2025",
        title: "SPORT CENTER UB.",
        thumbnail: "/assets/reels/thumbnail 4.png",
        videoUrl: "/assets/reels/reels ubsc 4.mp4",
    },
    {
        id: 5,
        date: "01/12 2025",
        title: "SPORT CENTER UB.",
        thumbnail: "/assets/reels/thumbnail 5.png",
        videoUrl: "/assets/reels/reels ubsc 5.mp4",
    },
];

interface ReelsSectionProps {
    reels?: ReelItem[];
}

export default function ReelsSection({
    reels = DUMMY_REELS,
}: ReelsSectionProps) {
    const [emblaRef, emblaApi] = useEmblaCarousel({
        align: "start",
        dragFree: true,
    });

    const { scrollPrev, scrollNext } = useEmblaNav(emblaApi);

    return (
        <section className="relative overflow-hidden bg-black text-white xl:h-[864px]">
            <div className="pb-6 pt-8 sm:pt-10 xl:min-h-[1080px] xl:w-[125%] xl:origin-top-left xl:scale-[.8] xl:pb-[26px] xl:pt-[55px]">
            <div className="mx-auto w-full px-6 sm:px-10 xl:px-[55px]">
                <div className="border-t border-white/65 px-2 xl:px-[32px]">
                    <div className="mt-5 flex items-center justify-between xl:mt-[65px]">
                        <span className="inline-flex h-5 items-center rounded-full bg-white px-3 font-bdo text-[8px] font-semibold text-black sm:h-10 sm:px-5 sm:text-sm xl:h-[54px] xl:px-[28px] xl:text-[22px]">
                            Sport center
                        </span>
                        <span className="font-bdo text-[8px] font-normal text-white sm:text-xs xl:-translate-y-[9px] xl:text-[20px]">
                            1/{reels.length}{" "}
                            <strong className="font-semibold">Detail</strong>
                        </span>
                    </div>

                    <div className="mt-8 grid gap-2 md:grid-cols-2 md:gap-5 xl:mt-[34px] xl:grid-cols-[minmax(0,1fr)_minmax(420px,497px)] xl:items-start">
                        <h3 className="font-bdo text-[20px] font-semibold leading-none tracking-[-0.035em] text-white sm:text-[clamp(2rem,3vw,3.25rem)] xl:translate-y-[2px] xl:text-[52px]">
                            Reels UB Sport Center
                        </h3>
                        <p className="font-bdo text-[9px] font-normal leading-normal text-white sm:text-sm md:ml-auto md:max-w-md xl:-translate-y-[3px] xl:max-w-[497px] xl:text-[20px]">
                            <span className="block xl:hidden">
                                Intip keseruan latihan, tips kebugaran, dan atmosfer
                            </span>
                            <span className="block xl:hidden">
                                energi positif langsung melalui media sosial kami.
                            </span>
                            <span className="hidden xl:inline">
                                Intip keseruan latihan, tips kebugaran, dan atmosfer energi positif langsung melalui media sosial kami.
                            </span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="mt-[66px] grid min-w-0 grid-cols-1 sm:mt-10 xl:mt-[54px] xl:grid-cols-[308px_minmax(0,1fr)]">
                <div className="hidden pl-[87px] xl:block">
                    <span className="font-bdo text-[28px] font-semibold leading-[1.38] text-white">
                        Sorotan
                        <br />
                        Komunitas
                    </span>
                </div>

                <div className="min-w-0 overflow-hidden pl-8 sm:pl-10 xl:pl-0" ref={emblaRef}>
                    <div className="flex items-end gap-1 sm:gap-[14px] xl:[&>*:nth-child(2)]:ml-[30px]">
                        {reels.map((reel, index) => (
                            <ReelCard
                                key={reel.id}
                                item={reel}
                                featured={index === 0}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="mx-8 mt-5 pb-8 sm:mx-10 sm:mt-8 xl:mx-0 xl:mt-[33px] xl:px-[87px] xl:pb-[37px]">
                <div className="flex items-center justify-between gap-4 xl:grid xl:grid-cols-[1fr_1fr_1fr] xl:gap-6">
                    <CarouselNavButtons
                        onPrevious={scrollPrev}
                        onNext={scrollNext}
                        previousLabel="Previous reels"
                        nextLabel="Next reels"
                    />

                    <span className="hidden text-center font-bdo text-[24px] font-semibold text-white xl:block xl:translate-x-[4px] xl:translate-y-[2px]">
                        Mari Bergabung Dengan Kami.
                    </span>

                    <AnimatedBookingLink
                        href="https://www.instagram.com/ubsportcenter/?hl=en"
                        label="Ikuti Keseruan Kami"
                        className="ml-auto min-w-0 flex-1 pb-2 xl:max-w-[410px] xl:pb-[14px]"
                        labelClassName="!text-[clamp(0.875rem,1.04vw,20px)] !font-medium !leading-normal !tracking-normal"
                        arrowSize={16}
                    />
                </div>
            </div>
            </div>
        </section>
    );
}
