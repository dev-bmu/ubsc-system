import {
    ChevronLeft,
    ChevronRight,
    MapPin,
    Pause,
    Play,
    Share2,
    X,
} from "lucide-react";
import {
    useEffect,
    useRef,
    useState,
    type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import type { PublicGalleryItem } from "@/types/gallery";
import GalleryImage from "./GalleryImage";
import { trackGalleryEvent } from "./galleryAnalytics";
import "./GalleryLightbox.css";

interface Props {
    items: PublicGalleryItem[];
    activeIndex: number | null;
    onChange: (index: number | null) => void;
    source?: string;
    hasMore?: boolean;
    onRequestNext?: () => Promise<boolean>;
}

export default function GalleryLightbox({ items, activeIndex, onChange, source = "archive", hasMore = false, onRequestNext }: Props) {
    const closeRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const touchStart = useRef<number | null>(null);
    const triggerRef = useRef<HTMLElement | null>(null);
    const wasOpenRef = useRef(false);
    const bodyOverflowRef = useRef("");
    const [playing, setPlaying] = useState(false);
    const item = activeIndex === null ? null : items[activeIndex];
    const canPrevious = activeIndex !== null && activeIndex > 0;
    const canNext = activeIndex !== null && (activeIndex < items.length - 1 || hasMore);

    useEffect(() => {
        if (!item || activeIndex === null) return;
        if (!wasOpenRef.current) {
            triggerRef.current = document.activeElement as HTMLElement | null;
            bodyOverflowRef.current = document.body.style.overflow;
            trackGalleryEvent("gallery_lightbox_open", {
                item_uuid: item.uuid,
                section_key: item.sections[0]?.key,
                payload: { position: activeIndex + 1, source },
            });
            wasOpenRef.current = true;
            closeRef.current?.focus();
        }
        document.body.style.overflow = "hidden";
        setPlaying(false);
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set("media", item.uuid);
        window.history.replaceState(window.history.state, "", currentUrl);

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
            if (event.key === "ArrowLeft" && canPrevious) previous();
            if (event.key === "ArrowRight" && canNext) void next();
            if (event.key === "Tab") {
                const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), video[controls], [href], [tabindex]:not([tabindex="-1"])',
                ) ?? []);
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };
        window.addEventListener("keydown", onKeyDown);

        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    // next is intentionally resolved from the current render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeIndex, canNext, canPrevious, item, onChange, source]);

    useEffect(() => {
        if (activeIndex !== null) return;
        if (!wasOpenRef.current) return;
        wasOpenRef.current = false;
        document.body.style.overflow = bodyOverflowRef.current;
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete("media");
        window.history.replaceState(window.history.state, "", currentUrl);
        triggerRef.current?.focus();
    }, [activeIndex]);

    useEffect(() => () => {
        if (wasOpenRef.current) document.body.style.overflow = bodyOverflowRef.current;
    }, []);

    if (!item || activeIndex === null || typeof document === "undefined") return null;

    const previous = () => {
        if (!canPrevious) return;
        trackGalleryEvent("gallery_lightbox_previous", {
            item_uuid: item.uuid,
            section_key: item.sections[0]?.key,
            payload: { position: activeIndex + 1, source },
        });
        onChange(activeIndex - 1);
    };
    const next = async () => {
        if (activeIndex < items.length - 1) {
            trackGalleryEvent("gallery_lightbox_next", {
                item_uuid: item.uuid,
                section_key: item.sections[0]?.key,
                payload: { position: activeIndex + 1, source },
            });
            onChange(activeIndex + 1);
            return;
        }
        if (hasMore && onRequestNext && await onRequestNext()) {
            trackGalleryEvent("gallery_lightbox_next", {
                item_uuid: item.uuid,
                section_key: item.sections[0]?.key,
                payload: { position: activeIndex + 1, source },
            });
            onChange(activeIndex + 1);
        }
    };
    const close = () => onChange(null);
    const share = async () => {
        const url = window.location.href;
        try {
            if (navigator.share) await navigator.share({ title: item.title, url });
            else await navigator.clipboard.writeText(url);
            trackGalleryEvent("gallery_share", {
                item_uuid: item.uuid,
                section_key: item.sections[0]?.key,
                payload: { position: activeIndex + 1, source },
            });
        } catch {
            // A cancelled native share sheet is not an application error.
        }
    };
    const handleTouchStart = (event: TouchEvent) => {
        touchStart.current = event.changedTouches[0]?.clientX ?? null;
    };
    const handleTouchEnd = (event: TouchEvent) => {
        if (touchStart.current === null) return;
        const delta = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current;
        if (delta > 56) previous();
                if (delta < -56) void next();
        touchStart.current = null;
    };

    return createPortal(
        <div ref={dialogRef} className="gallery-lightbox" role="dialog" aria-modal="true" aria-labelledby={`gallery-lightbox-title-${item.uuid}`}>
            <header className="gallery-lightbox__topbar">
                <span className="gallery-lightbox__count font-bdo" aria-live="polite">
                    {String(activeIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                </span>
                <span className="gallery-lightbox__section font-bdo">{item.sections[0]?.name ?? "UB Sport Center"}</span>
                <span className="gallery-lightbox__actions">
                <button type="button" onClick={share} className="gallery-lightbox__share" aria-label="Bagikan media">
                    <Share2 aria-hidden="true" />
                </button>
                <button ref={closeRef} type="button" onClick={close} className="gallery-lightbox__close" aria-label="Tutup galeri">
                    <X aria-hidden="true" />
                </button>
                </span>
            </header>

            <div className="gallery-lightbox__stage" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
                <div className="gallery-lightbox__media">
                    {item.media_type === "image" && item.image ? (
                        <GalleryImage
                            asset={item.image}
                            focalX={item.focal_x}
                            focalY={item.focal_y}
                            alt={item.alt_text}
                            sizes="100vw"
                            loading="eager"
                            decoding="async"
                        />
                    ) : item.video ? (
                        <div className="gallery-lightbox__video-wrap">
                            <video
                                key={item.uuid}
                                controls
                                playsInline
                                preload="metadata"
                                poster={item.video.poster?.fallback_url}
                                onPlay={() => {
                                    setPlaying(true);
                                    trackGalleryEvent("gallery_media_play", {
                                        item_uuid: item.uuid,
                                        section_key: item.sections[0]?.key,
                                        payload: { position: activeIndex + 1, source },
                                    });
                                }}
                                onPause={() => setPlaying(false)}
                                onEnded={() => {
                                    setPlaying(false);
                                    trackGalleryEvent("gallery_media_complete", {
                                        item_uuid: item.uuid,
                                        section_key: item.sections[0]?.key,
                                        payload: { position: activeIndex + 1, source },
                                    });
                                }}
                            >
                                {item.video.hls_url && <source src={item.video.hls_url} type="application/vnd.apple.mpegurl" />}
                                <source src={item.video.fallback_url} type="video/mp4" />
                                {item.subtitle_url && <track kind="captions" src={item.subtitle_url} srcLang="id" label="Bahasa Indonesia" default />}
                            </video>
                            <span className="gallery-lightbox__video-state" aria-hidden="true">{playing ? <Pause /> : <Play />}</span>
                        </div>
                    ) : null}
                </div>

                <button type="button" onClick={previous} disabled={!canPrevious} className="gallery-lightbox__nav gallery-lightbox__nav--previous" aria-label="Media sebelumnya"><ChevronLeft /></button>
                <button type="button" onClick={() => void next()} disabled={!canNext} className="gallery-lightbox__nav gallery-lightbox__nav--next" aria-label="Media berikutnya"><ChevronRight /></button>
            </div>

            <footer className="gallery-lightbox__details">
                <div>
                    <p className="gallery-lightbox__type font-bdo">{item.arena_type}</p>
                    <h2 id={`gallery-lightbox-title-${item.uuid}`} className="gallery-lightbox__title font-bdo">{item.title}</h2>
                </div>
                <div className="gallery-lightbox__meta font-bdo">
                    {item.location && <span><MapPin aria-hidden="true" />{item.location.name}</span>}
                    {item.captured_at && <span>{new Date(`${item.captured_at}T00:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</span>}
                    <span>{item.credit}</span>
                </div>
                {item.caption && <p className="gallery-lightbox__caption font-bdo">{item.caption}</p>}
            </footer>
        </div>,
        document.body,
    );
}
