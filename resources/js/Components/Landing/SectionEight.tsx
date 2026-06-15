import {
    Map,
    MapMarker,
    MarkerContent,
    MarkerLabel,
    MarkerPopup,
} from "@/Components/Landing/map";
import { Clock, Star } from "lucide-react";
import { useEffect, useRef } from "react";
import bg from "@/../assets/images/bg-about.avif";
import person from "@/../assets/images/person map.avif";

const places = [
    {
        id: 1,
        name: "Lapangan Sepak Bola UB",
        label: "Football Field",
        category: "Football Field",
        rating: 4.5,
        reviews: 54,
        hours: "06:00 AM - 10:00 PM",
        image: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
        lng: 112.59151096357927,
        lat: -7.9691905411073645,
    },
    {
        id: 2,
        name: "UBSC Cabang Transmart",
        label: "Sport Facility",
        category: "Sport Facility",
        rating: 4.4,
        reviews: 1570,
        hours: "9:00 AM - 10:00 PM",
        image: "/assets/images/cabang-eksklusif-transmart-ub-sport-center-malang.avif",
        lng: 112.61788923503353,
        lat: -7.956800793398481,
    },
    {
        id: 3,
        name: "UB Sports Center",
        label: "Sport Facility",
        category: "Sport Facility",
        rating: 4.4,
        reviews: 1189,
        hours: "6:00 AM - 10:00 PM",
        image: "/assets/images/ub-sport-center-kantor-pusat-malang.avif",
        lng: 112.61843891490952,
        lat: -7.955087591403217,
    },
];

export default function SectionEight() {
    const sectionRef = useRef<HTMLElement>(null);
    const backgroundRef = useRef<HTMLImageElement>(null);
    const portraitRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        const section = sectionRef.current;
        const background = backgroundRef.current;
        const portrait = portraitRef.current;
        if (!section || !background || !portrait) return;

        let frame = 0;

        const updateParallax = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const rect = section.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const progress = Math.max(
                    -1,
                    Math.min(
                        1,
                        (viewportHeight / 2 - (rect.top + rect.height / 2)) /
                            viewportHeight,
                    ),
                );

                background.style.transform = `translate3d(0, ${progress * 48}px, 0) scale(1.14)`;
                portrait.style.transform = `translate3d(0, ${progress * -68}px, 0) scale(1.16)`;
            });
        };

        window.addEventListener("scroll", updateParallax, { passive: true });
        window.addEventListener("resize", updateParallax);
        updateParallax();

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", updateParallax);
            window.removeEventListener("resize", updateParallax);
        };
    }, []);

    return (
        <section
            ref={sectionRef}
            id="about-map"
            className="relative isolate flex min-h-[410px] w-full items-center overflow-hidden bg-black pb-5 pt-4 sm:min-h-[650px] sm:py-14 lg:min-h-[720px] xl:min-h-[606px] xl:py-0"
        >
            <div className="pointer-events-none absolute inset-0 -z-10">
                <img
                    ref={backgroundRef}
                    src={bg}
                    alt=""
                    aria-hidden
                    className="h-full w-full scale-[1.14] object-cover object-center will-change-transform"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-black/35 xl:bg-black/45" />
            </div>

            <div className="mx-auto w-full px-[14px] sm:px-8 lg:px-12 xl:px-[clamp(3.5rem,6.35vw,7.6rem)]">
                <div className="relative grid grid-cols-1 xl:grid-cols-[341px_minmax(0,1fr)] xl:items-start xl:gap-[50px]">
                    <div className="relative z-10 flex flex-col xl:pt-[23px]">
                        <p className="location-title-shimmer mb-0 text-center font-bdo text-[16px] font-medium leading-none sm:text-xl lg:text-2xl xl:mb-[29px] xl:pl-[40px] xl:text-left xl:text-[24px]">
                            Temukan Lokasi Kami
                        </p>

                        <div className="relative mx-auto mt-[13px] h-[190px] w-[126px] overflow-hidden rounded-[2px] sm:mt-5 sm:h-[285px] sm:w-[190px] lg:h-[330px] lg:w-[220px] xl:mx-0 xl:mt-0 xl:h-[416px] xl:w-full xl:rounded-[5px]">
                            <img
                                ref={portraitRef}
                                src={person}
                                alt="Lokasi UB Sport Center"
                                className="absolute inset-0 h-full w-full scale-[1.16] object-cover object-center will-change-transform"
                                draggable={false}
                                loading="lazy"
                            />
                            <div className="pointer-events-none absolute inset-0 bg-black/10" />
                        </div>
                    </div>

                    <div className="relative z-0 mt-5 h-[160px] overflow-hidden rounded-[2px] bg-gray-200 sm:mt-8 sm:h-[280px] lg:mt-10 lg:h-[340px] xl:mt-0 xl:h-[493px] xl:rounded-[5px]">
                        <div className="absolute inset-0 h-full w-full">
                            <Map
                                center={[112.6206015734149, -7.967043987533171]}
                                zoom={13}
                                theme="light"
                                cooperativeGestures
                                scrollZoom
                            >
                                {places.map((place) => (
                                    <MapMarker
                                        key={place.id}
                                        longitude={place.lng}
                                        latitude={place.lat}
                                    >
                                        <MarkerContent>
                                            <div className="size-5 cursor-pointer rounded-full border-2 border-white bg-rose-500 shadow-lg transition-transform hover:scale-110" />
                                            <MarkerLabel position="bottom">
                                                {place.label}
                                            </MarkerLabel>
                                        </MarkerContent>
                                        <MarkerPopup className="w-62 p-0">
                                            <div className="relative h-32 w-48 overflow-hidden rounded-t-md">
                                                <img
                                                    src={place.image}
                                                    alt={place.name}
                                                    className="object-cover"
                                                />
                                            </div>
                                            <div className="space-y-2 p-3">
                                                <div>
                                                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                                        {place.category}
                                                    </span>
                                                    <h3 className="font-semibold leading-tight text-foreground">
                                                        {place.name}
                                                    </h3>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm">
                                                    <div className="flex items-center gap-1">
                                                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                                                        <span className="font-medium">
                                                            {place.rating}
                                                        </span>
                                                        <span className="text-muted-foreground">
                                                            ({place.reviews.toLocaleString()})
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                                    <Clock className="size-3.5" />
                                                    <span>{place.hours}</span>
                                                </div>
                                            </div>
                                        </MarkerPopup>
                                    </MapMarker>
                                ))}
                            </Map>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
