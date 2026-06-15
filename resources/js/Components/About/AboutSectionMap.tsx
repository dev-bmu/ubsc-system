import {
    Map,
    MapMarker,
    MarkerContent,
    MarkerLabel,
    MarkerPopup,
} from "@/Components/Landing/map";
import { Star, Clock } from "lucide-react";
import person from "@/../assets/images/person map.avif";
import bg from "@/../assets/images/bg-about.avif";

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

export default function AboutSectionMap() {
    return (
        <section
            id="about-map"
            className="relative w-full h-full xl:h-[600px] overflow-hidden flex items-center"
        >
            <div className="pointer-events-none absolute inset-0 z-0">
                <img
                    src={bg}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-cover object-center"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-black/40" />
            </div>

            <div className="relative z-10 mx-auto w-full max-w-7xl px-8">
                <div className="grid w-full grid-cols-1 items-stretch gap-6 xl:gap-16 xl:grid-cols-12 xl:h-[420px]">
                    <div className="xl:col-span-4 flex flex-col gap-3 xl:h-full">
                        <p className="font-bdo font-medium text-white text-[clamp(1rem,1.5vw,1.25rem)] leading-snug flex-shrink-0">
                            Temukan Lokasi Kami
                        </p>

                        <div className="group relative flex-1 overflow-hidden rounded-3xl min-h-[180px]">
                            <img
                                src={person}
                                alt="Lokasi UB Sport Center"
                                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                draggable={false}
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/30" />
                        </div>
                    </div>

                    <div className="relative h-[280px] xl:h-auto overflow-hidden rounded-3xl bg-gray-200 xl:col-span-8">
                        <div className="absolute inset-0 h-full w-full">
                            <Map
                                center={[112.6206015734149, -7.967043987533171]}
                                zoom={13}
                                theme="light"
                            >
                                {places.map((place) => (
                                    <MapMarker
                                        key={place.id}
                                        longitude={place.lng}
                                        latitude={place.lat}
                                    >
                                        <MarkerContent>
                                            <div className="size-5 rounded-full bg-rose-500 border-2 border-white shadow-lg cursor-pointer hover:scale-110 transition-transform" />
                                            <MarkerLabel position="bottom">
                                                {place.label}
                                            </MarkerLabel>
                                        </MarkerContent>
                                        <MarkerPopup className="p-0 w-62">
                                            <div className="relative h-32 w-48 overflow-hidden rounded-t-md">
                                                <img
                                                    src={place.image}
                                                    alt={place.name}
                                                    className="object-cover"
                                                />
                                            </div>
                                            <div className="space-y-2 p-3">
                                                <div>
                                                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                                        {place.category}
                                                    </span>
                                                    <h3 className="font-semibold text-foreground leading-tight">
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
                                                            (
                                                            {place.reviews.toLocaleString()}
                                                            )
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
