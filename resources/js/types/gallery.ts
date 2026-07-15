export interface GalleryImageSource {
    url: string;
    width: number;
    height: number;
    path?: string;
}

export interface GalleryImageAsset {
    width: number;
    height: number;
    fallback_url: string;
    formats: Record<string, GalleryImageSource[]>;
    srcsets: Record<string, string>;
}

export interface GalleryVideoAsset {
    width: number;
    height: number;
    duration_ms: number;
    hls_url: string | null;
    fallback_url: string;
    renditions: Array<{
        height: number;
        width?: number;
        playlist_url: string;
    }>;
    poster: GalleryImageAsset | null;
}

export interface PublicGalleryItem {
    uuid: string;
    media_type: "image" | "video";
    title: string;
    arena_type: string;
    alt_text: string;
    caption: string | null;
    location: { name: string; slug: string } | null;
    sections: Array<{ key: string; name: string; slug: string }>;
    captured_at: string | null;
    published_at: string | null;
    credit: string;
    focal_x: number;
    focal_y: number;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
    image: GalleryImageAsset | null;
    video: GalleryVideoAsset | null;
    poster: GalleryImageAsset | null;
    subtitle_url: string | null;
}

export interface CuratedGallerySection {
    active: boolean;
    key: "indoor" | "exclusive" | "outdoor";
    name: string;
    slug: string;
    layout: "grid" | "carousel";
    quota: number;
    items: PublicGalleryItem[];
}
