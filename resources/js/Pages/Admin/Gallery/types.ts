import type { GalleryImageAsset, GalleryVideoAsset } from "@/types/gallery";

export type GalleryStatus =
    | "draft"
    | "processing"
    | "ready_for_review"
    | "scheduled"
    | "published"
    | "unpublished"
    | "failed";

export interface AdminGalleryItem {
    uuid: string;
    media_type: "image" | "video";
    status: GalleryStatus;
    title: string;
    arena_type: string;
    alt_text: string;
    caption: string | null;
    search_aliases: string[];
    translation_en: {
        title: string;
        arena_type: string;
        alt_text: string;
        caption: string | null;
    } | null;
    location: { id: number; name: string } | null;
    sections: Array<{
        key: string;
        name: string;
        featured_position: number | null;
        sort_order: number;
    }>;
    captured_at: string | null;
    publish_at: string | null;
    published_at: string | null;
    credit: string;
    focal_x: number;
    focal_y: number;
    poster_second: number | null;
    image: GalleryImageAsset | null;
    video: GalleryVideoAsset | null;
    processing_error_code: string | null;
    processing_error_detail: string | null;
    source_file_name: string | null;
    rights_confirmed: boolean;
    lock_version: number;
    readiness_errors: Record<string, string>;
    created_by: string | null;
    updated_by: string | null;
    updated_at: string | null;
    audit: Array<{
        id: number;
        action: string;
        user: string;
        created_at: string | null;
    }>;
}

export interface GalleryLocation {
    id: number;
    name: string;
    slug: string;
    is_active: boolean;
}

export interface FeaturedGalleryItem {
    uuid: string;
    title: string;
    status: GalleryStatus;
    position: number;
    thumbnail: string | null;
}

export interface GallerySectionAdmin {
    id: number;
    key: "indoor" | "exclusive" | "outdoor";
    name: string;
    slug: string;
    quota: number;
    layout: "grid" | "carousel";
    is_active: boolean;
    items_count: number;
    featured_items: FeaturedGalleryItem[];
}

export interface GalleryPaginator<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    prev_page_url: string | null;
    next_page_url: string | null;
    links: Array<{ url: string | null; label: string; active: boolean }>;
}

export interface GallerySavedView {
    id: number;
    name: string;
    filters: Record<string, string>;
}

export interface GalleryCapabilities {
    image: Record<"jpeg" | "png" | "webp" | "avif" | "heic", boolean>;
    video: { ffmpeg: boolean; ffprobe: boolean };
    queue: string;
    originals_disk: string;
    public_disk: string;
    search: { driver: string; healthy: boolean };
}

export interface GalleryPermissions {
    manage: boolean;
    publish: boolean;
    delete: boolean;
}

export interface GalleryUploadConfig {
    max_batch_files: number;
    image_max_bytes: number;
    video_max_bytes: number;
    timezone: string;
}

export interface GalleryPageData {
    items: GalleryPaginator<AdminGalleryItem>;
    status_counts: Record<GalleryStatus, number>;
    sections: GallerySectionAdmin[];
    locations: GalleryLocation[];
    saved_views: GallerySavedView[];
    editors: Array<{ id: number; name: string }>;
    filters: Record<string, string | undefined>;
    capabilities: GalleryCapabilities;
    upload_config: GalleryUploadConfig;
    permissions: GalleryPermissions;
    analytics: GalleryAnalytics;
}

export interface GalleryAnalytics {
    days: number;
    published_count: number;
    media_distribution: Record<string, number>;
    section_distribution: Array<{ key: string; name: string; count: number }>;
    top_opened: Array<{ uuid: string; title: string; count: number }>;
    search_terms: Array<{ term: string; count: number }>;
    zero_result_terms: Array<{ term: string; count: number }>;
    events: Record<string, number>;
    processing: { success: number; failed: number };
    filter_usage: Array<{ label: string; count: number }>;
    average_navigation_depth: number;
    video_completion_rate: number;
}

export interface CurationCandidate {
    uuid: string;
    title: string;
    arena_type: string;
    location: string | null;
    thumbnail: string | null;
}
