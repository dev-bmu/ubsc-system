import {
    Map,
    MapMarker,
    MarkerContent,
    MarkerLabel,
    MarkerPopup,
    useMap,
    type MapRef,
} from "@/Components/Landing/map";
import { BadgeCheck, Clock, Minus, Plus, Star } from "lucide-react";
import {
    useEffect,
    useRef,
    useState,
    type MouseEvent,
    type PointerEvent,
    type TouchEvent,
} from "react";
import bg from "@/../assets/images/bg-about.avif";
import person from "@/../assets/images/person map.avif";

const places = [
    {
        id: 1,
        name: "Open Arena Branch Dieng",
        label: "Open Arena Branch",
        category: "UB Sport Center",
        rating: 4.5,
        reviews: 54,
        hours: "06:00 AM - 10:00 PM",
        image: "/assets/images/fasilitas-arena-terbuka-dieng-ub-sport-center-malang.avif",
        lng: 112.59151096357927,
        lat: -7.9691905411073645,
        markerOffset: undefined,
        markerVariant: "standard",
    },
    {
        id: 2,
        name: "Exclusive Branch Transmart",
        label: "Exclusive Branch",
        category: "UB Sport Center",
        rating: 4.4,
        reviews: 1570,
        hours: "9:00 AM - 10:00 PM",
        image: "/assets/images/cabang-eksklusif-transmart-ub-sport-center-malang.avif",
        lng: 112.61788923503353,
        lat: -7.956800793398481,
        markerOffset: [14, 12] as [number, number],
        markerVariant: "satellite",
    },
    {
        id: 3,
        name: "UB Sport Center",
        label: "UB Sport Center",
        category: "UB Sport Center",
        isPrimary: true,
        rating: 4.4,
        reviews: 1189,
        hours: "6:00 AM - 10:00 PM",
        image: "/assets/images/ub-sport-center-kantor-pusat-malang.avif",
        lng: 112.61843891490952,
        lat: -7.955087591403217,
        markerOffset: undefined,
        markerVariant: "primary",
    },
];

const getMapsUrl = (lat: number, lng: number) =>
    `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

const pinLocationIcon = "/assets/icons/ubsc_pin_location.svg";
const mapCenter: [number, number] = [112.6206015734149, -7.967043987533171];

type Place = (typeof places)[number];

type PlacePopupCardProps = {
    place: Place;
    zoomLevel: number;
    onZoomChange: (nextLevel: number) => void;
};

function PlacePopupCard({
    place,
    zoomLevel,
    onZoomChange,
}: PlacePopupCardProps) {
    const changeZoom = (nextLevel: number) => {
        onZoomChange(Math.max(0, Math.min(2, nextLevel)));
    };

    const stopMapInteraction = (
        event:
            | PointerEvent<HTMLElement>
            | MouseEvent<HTMLElement>
            | TouchEvent<HTMLElement>,
    ) => {
        event.stopPropagation();
    };

    return (
        <div
            className="section-eight-popup-card"
            onPointerDownCapture={stopMapInteraction}
            onTouchStartCapture={stopMapInteraction}
            onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                changeZoom(zoomLevel >= 2 ? 0 : zoomLevel + 1);
            }}
        >
            <div className="section-eight-popup-media relative w-full overflow-hidden rounded-t-[5px]">
                <img
                    src={place.image}
                    alt={place.name}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    width={320}
                    height={190}
                    className="h-full w-full object-cover"
                />
                <div className="section-eight-popup-zoom-controls">
                    <button
                        type="button"
                        aria-label="Zoom out location card"
                        disabled={zoomLevel === 0}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            changeZoom(zoomLevel - 1);
                        }}
                    >
                        <Minus aria-hidden className="size-3" />
                    </button>
                    <span aria-hidden>{zoomLevel + 1}</span>
                    <button
                        type="button"
                        aria-label="Zoom in location card"
                        disabled={zoomLevel === 2}
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            changeZoom(zoomLevel + 1);
                        }}
                    >
                        <Plus aria-hidden className="size-3" />
                    </button>
                </div>
            </div>
            <div className="section-eight-popup-body">
                <div>
                    <div className="section-eight-popup-heading-row">
                        <span className="section-eight-popup-category">
                            {place.category}
                        </span>
                        {place.isPrimary && (
                            <span
                                className="section-eight-popup-primary-badge"
                                aria-label="Head office location"
                            >
                                <BadgeCheck aria-hidden className="size-3" />
                                <span>Head Office</span>
                            </span>
                        )}
                    </div>
                    <h3 className="section-eight-popup-title">{place.name}</h3>
                </div>
                <div className="section-eight-popup-meta">
                    <div className="flex items-center gap-1">
                        <Star className="section-eight-popup-icon section-eight-popup-icon--rating" />
                        <span className="font-medium">{place.rating}</span>
                        <span className="text-muted-foreground">
                            ({place.reviews.toLocaleString()})
                        </span>
                    </div>
                </div>
                <div className="section-eight-popup-meta text-muted-foreground">
                    <Clock className="section-eight-popup-icon section-eight-popup-icon--clock" />
                    <span>{place.hours}</span>
                </div>
                <a
                    href={getMapsUrl(place.lat, place.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="section-eight-popup-link"
                    onPointerDownCapture={stopMapInteraction}
                    onTouchStartCapture={stopMapInteraction}
                    onClick={(event) => event.stopPropagation()}
                >
                    See Location
                </a>
            </div>
        </div>
    );
}

function ParkedMapView() {
    const { map, isLoaded } = useMap();
    const hasParkedRef = useRef(false);

    useEffect(() => {
        if (!map || !isLoaded || hasParkedRef.current) return;

        hasParkedRef.current = true;
        const parkFrame = window.requestAnimationFrame(() => {
            const container = map.getContainer();
            const isMobileMap = container.clientWidth < 768;
            const targetZoom = isMobileMap
                ? 13 + Math.log2(0.65)
                : 13 + Math.log2(1.265);
            const horizontalShift = isMobileMap ? 0.35 : 0.25;
            const verticalShift = isMobileMap ? 0.15 : 0.25;

            map.jumpTo({ center: mapCenter, zoom: targetZoom });

            const centerPoint = map.project(mapCenter);
            const parkedCenter = map.unproject([
                centerPoint.x - container.clientWidth * horizontalShift,
                centerPoint.y - container.clientHeight * verticalShift,
            ]);

            map.jumpTo({ center: parkedCenter, zoom: targetZoom });
        });

        return () => window.cancelAnimationFrame(parkFrame);
    }, [map, isLoaded]);

    return null;
}

export default function SectionEight() {
    const sectionRef = useRef<HTMLElement>(null);
    const backgroundRef = useRef<HTMLImageElement>(null);
    const portraitRef = useRef<HTMLImageElement>(null);
    const mapRef = useRef<MapRef>(null);
    const [shouldRenderMap, setShouldRenderMap] = useState(false);
    const [popupZoomLevel, setPopupZoomLevel] = useState(0);

    const preservePageScroll = (action: () => void) => {
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;

        action();

        const restoreScroll = () => {
            if (
                Math.abs(window.scrollX - scrollX) > 1 ||
                Math.abs(window.scrollY - scrollY) > 1
            ) {
                window.scrollTo(scrollX, scrollY);
            }
        };

        requestAnimationFrame(restoreScroll);
        window.setTimeout(restoreScroll, 90);
    };

    const focusPlace = (lat: number, lng: number, cardZoomLevel = popupZoomLevel) => {
        const map = mapRef.current;
        if (!map) return;

        const containerHeight = map.getContainer().clientHeight;
        const isDesktop = window.innerWidth >= 1280;
        const offsetY = isDesktop
            ? Math.min(92 + cardZoomLevel * 24, containerHeight * 0.28)
            : Math.min(76 + cardZoomLevel * 28, containerHeight * 0.42);

        map.easeTo({
            center: [lng, lat],
            zoom: Math.max(map.getZoom(), isDesktop ? 13 : 12.7),
            offset: [0, offsetY],
            duration: 520,
            essential: false,
        });
    };

    useEffect(() => {
        const section = sectionRef.current;
        const background = backgroundRef.current;
        const portrait = portraitRef.current;
        if (!section || !background || !portrait) return;

        let frame = 0;
        let parallaxActive = false;

        const updateParallax = () => {
            if (!parallaxActive) return;
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
                const viewportWidth = window.innerWidth;
                const portraitDistance =
                    viewportWidth < 640
                        ? -42
                        : viewportWidth < 1280
                          ? -56
                          : -68;
                const portraitScale =
                    viewportWidth < 640
                        ? 1.2
                        : viewportWidth < 1280
                          ? 1.18
                          : 1.16;

                portrait.style.transform = `translate3d(0, ${progress * portraitDistance}px, 0) scale(${portraitScale})`;
            });
        };

        window.addEventListener("scroll", updateParallax, { passive: true });
        window.addEventListener("resize", updateParallax);

        if (!("IntersectionObserver" in window)) {
            parallaxActive = true;
            section.classList.add("is-parallax-active");
            updateParallax();

            return () => {
                cancelAnimationFrame(frame);
                section.classList.remove("is-parallax-active");
                window.removeEventListener("scroll", updateParallax);
                window.removeEventListener("resize", updateParallax);
            };
        }

        const parallaxObserver = new IntersectionObserver(
            ([entry]) => {
                parallaxActive = Boolean(entry?.isIntersecting);
                section.classList.toggle("is-parallax-active", parallaxActive);
                if (parallaxActive) updateParallax();
            },
            { rootMargin: "35% 0px 35% 0px", threshold: 0 },
        );

        parallaxObserver.observe(section);

        return () => {
            cancelAnimationFrame(frame);
            parallaxObserver.disconnect();
            section.classList.remove("is-parallax-active");
            window.removeEventListener("scroll", updateParallax);
            window.removeEventListener("resize", updateParallax);
        };
    }, []);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section) return;

        let completeTimer = 0;
        const reveal = () => {
            section.classList.add("is-visible");
            completeTimer = window.setTimeout(
                () => section.classList.add("is-complete"),
                2100,
            );
        };

        if (!("IntersectionObserver" in window)) {
            reveal();
            return () => window.clearTimeout(completeTimer);
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                reveal();
                observer.disconnect();
            },
            {
                threshold: 0.04,
                rootMargin: "0px 0px -5% 0px",
            },
        );

        observer.observe(section);
        return () => {
            observer.disconnect();
            window.clearTimeout(completeTimer);
        };
    }, []);

    useEffect(() => {
        const section = sectionRef.current;
        if (!section || shouldRenderMap) return;

        let renderTimer = 0;
        const prepareMap = () => {
            window.clearTimeout(renderTimer);
            renderTimer = window.setTimeout(() => {
                setShouldRenderMap(true);
            }, 180);
        };

        if (!("IntersectionObserver" in window)) {
            prepareMap();
            return () => window.clearTimeout(renderTimer);
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                prepareMap();
                observer.disconnect();
            },
            {
                threshold: 0,
                rootMargin: "1100px 0px 1100px 0px",
            },
        );

        observer.observe(section);

        return () => {
            observer.disconnect();
            window.clearTimeout(renderTimer);
        };
    }, [shouldRenderMap]);

    return (
        <section
            ref={sectionRef}
            id="about-map"
            className="section-eight-entrance-stage relative isolate flex w-full items-center overflow-hidden bg-[#252525] px-0 pb-10 pt-5 sm:pb-14 sm:pt-12 lg:pb-16 xl:min-h-[606px] xl:py-[56px]"
        >
            <div className="section-eight-background pointer-events-none absolute inset-0 -z-10">
                <img
                    ref={backgroundRef}
                    src={bg}
                    alt=""
                    aria-hidden
                    className="section-eight-parallax-media h-full w-full scale-[1.14] object-cover object-center"
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                />
                <div className="absolute inset-0 bg-black/35 xl:bg-black/45" />
            </div>

            <div
                aria-hidden="true"
                className="section-eight-cinematic-sweep pointer-events-none absolute inset-0 z-[1]"
            />

            <div className="relative z-[2] mx-auto w-full px-[14px] sm:px-8 lg:px-12 xl:px-[clamp(3.5rem,6.35vw,7.6rem)]">
                <div className="relative grid grid-cols-1 xl:grid-cols-[341px_minmax(0,1fr)] xl:items-start xl:gap-[50px]">
                    <div className="relative z-10 flex flex-col xl:pt-[23px]">
                        <p className="section-eight-entrance-reveal section-eight-entrance-reveal--title location-title-shimmer mb-0 text-center font-bdo text-[16px] font-medium leading-none sm:text-xl lg:text-2xl xl:mb-[29px] xl:pl-[40px] xl:text-left xl:text-[24px]">
                            Temukan Lokasi Kami
                        </p>

                        <div className="section-eight-entrance-reveal section-eight-entrance-reveal--portrait relative mx-auto mt-[13px] h-[190px] w-[174px] overflow-hidden rounded-[2px] sm:mt-5 sm:h-[285px] sm:w-[228px] lg:h-[330px] lg:w-[264px] xl:mx-0 xl:mt-0 xl:h-[416px] xl:w-full xl:rounded-[5px]">
                            <img
                                ref={portraitRef}
                                src={person}
                                alt="Lokasi UB Sport Center"
                                className="section-eight-parallax-media section-eight-portrait-media absolute inset-0 h-full w-full scale-[1.2] object-cover object-center sm:scale-[1.18] xl:scale-[1.16]"
                                draggable={false}
                                loading="lazy"
                                decoding="async"
                                fetchPriority="low"
                            />
                            <div className="pointer-events-none absolute inset-0 bg-black/10" />
                        </div>
                    </div>

                    <div className="section-eight-entrance-reveal section-eight-entrance-reveal--map relative z-0 mt-4 h-[306px] overflow-hidden rounded-[2px] bg-gray-200 sm:mt-[26px] sm:h-[432px] lg:mt-8 lg:h-[516px] xl:mt-0 xl:h-[493px] xl:rounded-[5px]">
                        <div className="absolute inset-0 h-full w-full">
                            {shouldRenderMap ? (
                                <Map
                                    ref={mapRef}
                                    center={mapCenter}
                                    zoom={13}
                                    theme="light"
                                    cooperativeGestures
                                    scrollZoom
                                >
                                    <ParkedMapView />
                                    {places.map((place) => (
                                        <MapMarker
                                            key={place.id}
                                            longitude={place.lng}
                                            latitude={place.lat}
                                            anchor="bottom"
                                            offset={
                                                place.markerOffset ?? [0, 0]
                                            }
                                            onClick={() => {
                                                preservePageScroll(() =>
                                                    focusPlace(
                                                        place.lat,
                                                        place.lng,
                                                        popupZoomLevel,
                                                    ),
                                                );
                                            }}
                                        >
                                            <MarkerContent
                                                className={`section-eight-map-pin-trigger ${
                                                    place.markerVariant
                                                        ? `section-eight-map-pin-trigger--${place.markerVariant}`
                                                        : ""
                                                }`}
                                            >
                                                <img
                                                    src={pinLocationIcon}
                                                    alt=""
                                                    aria-hidden="true"
                                                    draggable={false}
                                                    className={`section-eight-map-pin ${
                                                        place.isPrimary
                                                            ? "section-eight-map-pin--primary"
                                                            : ""
                                                    }`}
                                                />
                                                <MarkerLabel
                                                    position="bottom"
                                                    className="section-eight-map-pin-label"
                                                >
                                                    <span className="section-eight-map-label-inner">
                                                        {place.isPrimary && (
                                                            <BadgeCheck
                                                                aria-hidden
                                                                className="section-eight-map-primary-icon"
                                                            />
                                                        )}
                                                        <span>{place.label}</span>
                                                    </span>
                                                </MarkerLabel>
                                            </MarkerContent>
                                            <MarkerPopup
                                                anchor="bottom"
                                                offset={10}
                                                focusAfterOpen={false}
                                                className={`section-eight-map-popup section-eight-map-popup--zoom-${popupZoomLevel} p-0`}
                                            >
                                                <PlacePopupCard
                                                    place={place}
                                                    zoomLevel={popupZoomLevel}
                                                    onZoomChange={(nextLevel) => {
                                                        preservePageScroll(() => {
                                                            setPopupZoomLevel(
                                                                nextLevel,
                                                            );
                                                            window.setTimeout(
                                                                () =>
                                                                    focusPlace(
                                                                        place.lat,
                                                                        place.lng,
                                                                        nextLevel,
                                                                    ),
                                                                40,
                                                            );
                                                        });
                                                    }}
                                                />
                                            </MarkerPopup>
                                        </MapMarker>
                                    ))}
                                </Map>
                            ) : (
                                <div
                                    aria-hidden="true"
                                    className="section-eight-map-skeleton absolute inset-0"
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
