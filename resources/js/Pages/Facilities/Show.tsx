import Navbar from "@/Components/Landing/Navbar";
import Footer from "@/Components/Landing/Footer";
import FacilityBadge from "@/Components/Landing/FacilityBadge";
import SeoHead from "@/Components/SeoHead";
import { Link, usePage } from "@inertiajs/react";
import type { PageProps } from "@/types";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowUpRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useCallback } from "react";
import type { ReactNode } from "react";

interface FacilityDetailItem {
    id: number;
    name: string;
    slug: string;
    category: string;
    venue_type: string;
    location: string;
    class_code: string;
    description: string;
    map_embed_url: string;
    map_url?: string;
    images_array: string[];
    cover_image?: string | null;
}

interface SimilarFacilityItem {
    id: number;
    name: string;
    slug: string;
    category: string;
    venue_type: string;
    location: string;
    description: string;
    cover_image: string;
    map_url?: string;
}

type FacilityShowPageProps = PageProps<{
    facilityItem: FacilityDetailItem;
    similarFacilities: SimilarFacilityItem[];
}>;

const FALLBACK_IMAGE = "/assets/images/fasilitas-tenis-ub-sport-center.avif";
type BadgeVariant = "blue" | "red" | "blue-red";

const gradientMap: Record<BadgeVariant, string> = {
    blue: "from-[#15678D] to-[#153359]",
    red: "from-[#FF462E] to-[#790A0A]",
    "blue-red": "from-[#FF0000] to-[#153359]",
};

function isHtml(value: string): boolean {
    return /<\/?[a-z][\s\S]*>/i.test(value);
}

function textToHtml(value: string): string {
    return value
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
        .join("");
}

function badgeVariantFor(value: string): BadgeVariant {
    const normalized = value.toLowerCase();

    if (normalized.includes("outdoor") || normalized.includes("luar")) {
        return "blue-red";
    }

    if (normalized.includes("hybrid")) {
        return "red";
    }

    return "blue";
}

function DetailHero({ facilityItem }: { facilityItem: FacilityDetailItem }) {
    const images =
        facilityItem.images_array && facilityItem.images_array.length > 0
            ? facilityItem.images_array
            : [facilityItem.cover_image || FALLBACK_IMAGE];
    const [emblaRef, emblaApi] = useEmblaCarousel({ loop: images.length > 1 });
    const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
    const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
    const showControls = images.length > 1;

    return (
        <section className="relative h-[clamp(560px,45.45vw,698px)] min-h-[560px] overflow-hidden bg-black text-white">
            <div className="absolute inset-0 overflow-hidden" ref={emblaRef}>
                <div className="flex h-full">
                    {images.map((image, index) => (
                        <div
                            key={`${image}-${index}`}
                            className="relative h-full min-w-0 flex-[0_0_100%]"
                        >
                            <img
                                src={image}
                                alt={facilityItem.name}
                                className="absolute inset-0 h-full w-full object-cover"
                                loading={index === 0 ? "eager" : "lazy"}
                                draggable={false}
                            />
                            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.08)_40%,rgba(0,0,0,0.72)_100%)]" />
                        </div>
                    ))}
                </div>
            </div>

            <Navbar activeSection="Facilities" />

            <div className="relative z-10 flex h-full items-end">
                <div className="w-full px-[clamp(1.5rem,4.5vw,5.5rem)] pb-[clamp(2.2rem,4.2vw,4.8rem)]">
                    <div className="max-w-[980px]">
                        <FacilityBadge
                            location={facilityItem.location || "Veteran"}
                            category={facilityItem.venue_type || facilityItem.category}
                            variant={badgeVariantFor(
                                `${facilityItem.venue_type} ${facilityItem.category}`
                            )}
                        />
                        <h1 className="mt-7 max-w-[1060px] font-bdo text-[clamp(2.2rem,3.3vw,4rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-white">
                            {facilityItem.name}
                        </h1>
                        {facilityItem.description && (
                            <p className="mt-6 max-w-[760px] font-bdo text-[clamp(0.95rem,1.04vw,1.22rem)] font-normal leading-[1.45] text-white/70 line-clamp-2">
                                {facilityItem.description}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {showControls && (
                <div className="absolute bottom-10 right-[clamp(1.5rem,4.5vw,5.5rem)] z-20 flex gap-3">
                    <button
                        type="button"
                        onClick={scrollPrev}
                        aria-label="Previous image"
                        className="flex size-11 items-center justify-center rounded-full border border-white/45 bg-black/25 text-white backdrop-blur transition hover:bg-white hover:text-black"
                    >
                        <ChevronLeft className="size-5" />
                    </button>
                    <button
                        type="button"
                        onClick={scrollNext}
                        aria-label="Next image"
                        className="flex size-11 items-center justify-center rounded-full border border-white/45 bg-black/25 text-white backdrop-blur transition hover:bg-white hover:text-black"
                    >
                        <ChevronRight className="size-5" />
                    </button>
                </div>
            )}
        </section>
    );
}

function MetaCard({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <article className="min-h-[88px] rounded-xl border border-black/5 bg-[#F7F7F7] p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-bdo text-[0.78rem] font-medium text-black/45">
                    {label}
                </span>
                <span className="font-bdo text-sm leading-none text-black/20">..</span>
            </div>
            {children}
        </article>
    );
}

function FacilityLocationChip({ location }: { location: string }) {
    return (
        <div className="flex w-fit items-center gap-1.5 rounded-l-sm bg-black px-2 py-1 font-bdo text-[clamp(0.7rem,0.7vw+0.5rem,1rem)] font-normal text-white backdrop-blur-sm lg:px-3 lg:py-1.5">
            <MapPin size={12} className="flex-shrink-0 opacity-70" />
            <span className="whitespace-nowrap">{location}</span>
        </div>
    );
}

function FacilityCategoryChip({
    category,
    variant,
}: {
    category: string;
    variant: BadgeVariant;
}) {
    return (
        <div
            className={`flex w-fit items-center bg-gradient-to-r ${gradientMap[variant]} px-2 py-1 font-clash text-[clamp(0.7rem,0.7vw+0.5rem,1rem)] font-semibold text-white ring-1 ring-inset ring-white/10 lg:px-3 lg:py-1.5`}
        >
            <span className="whitespace-nowrap">{category}</span>
        </div>
    );
}

function FacilityRecommendationCard({ item }: { item: SimilarFacilityItem }) {
    const metaText = [item.category, item.venue_type, item.location]
        .filter(Boolean)
        .join(" / ");

    return (
        <article className="group block">
            <Link href={route("facilities.show", item.slug)} className="block">
                <div className="relative mb-4 aspect-[16/11] w-full overflow-hidden rounded-2xl bg-[#F7F7F7]">
                    <img
                        src={item.cover_image || FALLBACK_IMAGE}
                        alt={item.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                        draggable={false}
                    />
                </div>
                <h3 className="line-clamp-2 font-bdo text-lg font-semibold leading-tight tracking-[-0.025em] text-black">
                    {item.name}
                </h3>
            </Link>
            <a
                href={item.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block line-clamp-1 font-bdo text-sm font-normal leading-relaxed text-gray-500 transition hover:text-black"
            >
                {metaText}
            </a>
        </article>
    );
}

export default function FacilityShow() {
    const { facilityItem, similarFacilities } = usePage<FacilityShowPageProps>().props;
    const contentHtml = isHtml(facilityItem.description)
        ? facilityItem.description
        : textToHtml(facilityItem.description);
    const recommendations = similarFacilities.slice(0, 6);

    return (
        <>
            <SeoHead />

            <main className="bg-white text-black">
                <DetailHero facilityItem={facilityItem} />

                <section className="mx-auto max-w-[1200px] px-6 pt-12 xl:px-0">
                    <h2 className="max-w-[760px] font-bdo text-[clamp(2rem,2.35vw,3rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-black">
                        {facilityItem.name}
                    </h2>
                </section>

                <section className="mx-auto mt-10 grid max-w-[720px] grid-cols-1 gap-4 px-6 md:grid-cols-3 xl:gap-6 xl:px-0">
                    <MetaCard label="Location">
                        <a
                            href={facilityItem.map_url || "https://maps.app.goo.gl/X7uRTbmnwqKAGfXr8"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex transition hover:opacity-75"
                        >
                            <FacilityLocationChip location={facilityItem.location || "Veteran"} />
                        </a>
                    </MetaCard>
                    <MetaCard label="Category">
                        <FacilityCategoryChip
                            category={facilityItem.venue_type || facilityItem.category}
                            variant={badgeVariantFor(
                                `${facilityItem.venue_type} ${facilityItem.category}`
                            )}
                        />
                    </MetaCard>
                    <MetaCard label="Class Code">
                        <p className="font-bdo text-[0.9rem] font-medium leading-tight text-black">
                            {facilityItem.class_code}
                        </p>
                    </MetaCard>
                </section>

                <section className="mx-auto mt-16 w-full max-w-[1200px] rounded-[24px] bg-[#F7F7F7] p-6 sm:p-12 xl:p-16">
                    <div
                        className="news-detail-prose max-w-none font-bdo text-sm font-normal leading-relaxed text-gray-600 sm:text-base"
                        dangerouslySetInnerHTML={{ __html: contentHtml }}
                    />
                </section>

                {recommendations.length > 0 && (
                    <section className="mx-auto mt-10 max-w-[1200px] px-6 pb-24 xl:px-0">
                        <div className="flex items-center justify-between gap-6">
                            <h2 className="font-bdo text-[clamp(1.65rem,1.95vw,2.4rem)] font-medium leading-none tracking-[-0.045em] text-black">
                                Fasilitas Lainnya
                            </h2>
                            <Link
                                href={route("facility")}
                                className="inline-flex h-9 items-center gap-2 rounded-full bg-[#EFEFEF] px-5 font-bdo text-[0.62rem] font-semibold uppercase tracking-[0.32em] text-black transition hover:bg-black hover:text-white"
                            >
                                Lihat semua
                                <ArrowUpRight className="size-3.5" />
                            </Link>
                        </div>

                        <div className="mt-12 grid grid-cols-1 gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
                            {recommendations.map((item) => (
                                <FacilityRecommendationCard key={item.id} item={item} />
                            ))}
                        </div>
                    </section>
                )}
            </main>

            <Footer />
        </>
    );
}
