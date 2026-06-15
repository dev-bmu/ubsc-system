import useEmblaCarousel from "embla-carousel-react";
import HeroBottomBar from "@/Components/Landing/HeroBottomBar";
import TopBg from "@/../assets/hero/Top.png";

const FACILITY_IMAGES = [
    { src: "/assets/images/fasilitas-tenis-ub-sport-center.avif", alt: "" },
    {
        src: "/assets/images/gym-konten-2-olahraga-ub-sport-center.avif",
        alt: "",
    },
    {
        src: "/assets/images/fasilitas-sepak-bola-ub-sport-center.avif",
        alt: "",
    },
    {
        src: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
        alt: "",
    },
    {
        src: "/assets/images/fasilitas-bulutangkis-ub-sport-center.avif",
        alt: "",
    },
    {
        src: "/assets/images/gym-konten-1-olahraga-ub-sport-center.avif",
        alt: "",
    },
];

const ArrowRight = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M5 12H19M19 12L12 5M19 12L12 19" />
    </svg>
);

export default function FacilityHero() {
    const [emblaRef, emblaApi] = useEmblaCarousel({
        loop: false,
        align: "start",
    });
    const scrollNext = () => {
        if (!emblaApi) return;

        if (emblaApi.canScrollNext()) {
            emblaApi.scrollNext();
            return;
        }

        emblaApi.scrollTo(0);
    };

    return (
        <section
            className="relative flex h-screen min-h-[700px] w-full flex-col overflow-hidden"
            id="facility-hero"
        >
            <div className="pointer-events-none absolute inset-0 z-0">
                <img
                    src={TopBg}
                    alt=""
                    aria-hidden
                    className="absolute inset-0 h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 " />
            </div>

            <div className="relative z-10 px-[clamp(2.75rem,3.25vw,4rem)] pt-[clamp(8.25rem,6.7vw,8.75rem)]">
                <h1 className="font-bdo text-[clamp(2.35rem,2.55vw,2.85rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-white">
                    Fasilitas Terbaik Kami
                </h1>
            </div>

            <div className="flex-1 " />

            <div className="relative z-10">
                <HeroBottomBar
                    variant="transparent"
                    sectionNumber="04/"
                    sectionLabel="facilitypage"
                    description="UB Sport Center – Temukan fasilitas olahraga modern untuk berlatih, berprestasi, dan berkembang bersama."
                    targetId="facility-content"
                    showVideo={false}
                    insetLine
                    compact
                />
            </div>

            <div className="relative z-10 pb-[2.15rem] pt-[1.55rem]">
                <div
                    className="min-w-0 overflow-hidden pl-[clamp(2.75rem,3.25vw,4rem)] pr-[clamp(2.75rem,3.25vw,4rem)]"
                    ref={emblaRef}
                >
                    <div className="flex gap-[1rem]">
                        {FACILITY_IMAGES.map((img, i) => (
                            <div
                                key={i}
                                className={`h-[200px] flex-shrink-0 overflow-hidden rounded-[0.8rem] xl:h-[18rem] ${
                                    i % 2 === 0
                                        ? "w-[74vw] xl:w-[32rem]"
                                        : "w-[34vw] xl:w-[16rem]"
                                }`}
                            >
                                <img
                                    src={img.src}
                                    alt={img.alt}
                                    aria-hidden
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        ))}
                    </div>
                </div>
                <button
                    onClick={scrollNext}
                    aria-label="Next"
                    className="absolute right-[clamp(1.25rem,2.75vw,3.5rem)] top-1/2 z-20 flex size-[3.25rem] -translate-y-1/2 flex-shrink-0 items-center justify-center rounded-full bg-accent-red text-white transition-colors hover:bg-accent-red/90"
                >
                    <ArrowRight />
                </button>
            </div>
        </section>
    );
}
