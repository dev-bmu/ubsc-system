type GalleryEvent =
    | "gallery_card_impression"
    | "gallery_lightbox_open"
    | "gallery_lightbox_next"
    | "gallery_lightbox_previous"
    | "gallery_media_play"
    | "gallery_media_complete"
    | "gallery_share"
    | "gallery_search"
    | "gallery_zero_result"
    | "gallery_filter_change"
    | "gallery_load_more";

export function trackGalleryEvent(
    eventType: GalleryEvent,
    data: {
        item_uuid?: string;
        section_key?: string;
        query?: string;
        payload?: Record<string, string | number>;
        beacon?: boolean;
    } = {},
) {
    if (typeof window === "undefined") return;
    const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
    const { beacon, ...eventData } = data;
    const body = JSON.stringify({
        event_type: eventType,
        ...eventData,
        ...(token ? { _token: token } : {}),
    });

    if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(
            route("gallery.events"),
            new Blob([body], { type: "application/json" }),
        );
        return;
    }

    fetch(route("gallery.events"), {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            ...(token ? { "X-CSRF-TOKEN": token } : {}),
        },
        body,
    }).catch(() => undefined);
}
