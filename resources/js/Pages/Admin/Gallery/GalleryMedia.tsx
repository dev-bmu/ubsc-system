import { Image as ImageIcon, Play } from "lucide-react";
import type { AdminGalleryItem } from "./types";

interface Props {
    item: AdminGalleryItem;
    className?: string;
}

export default function GalleryMedia({ item, className = "" }: Props) {
    const source = item.image?.fallback_url ?? item.video?.poster?.fallback_url;

    return (
        <span
            className={`relative block overflow-hidden bg-[#e9ebee] ${className}`}
            style={{
                aspectRatio: item.image
                    ? `${item.image.width} / ${item.image.height}`
                    : item.video
                      ? `${item.video.width} / ${item.video.height}`
                      : "4 / 3",
            }}
        >
            {source ? (
                <img
                    src={source}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: `${item.focal_x * 100}% ${item.focal_y * 100}%` }}
                />
            ) : (
                <span className="grid h-full w-full place-items-center text-slate-400">
                    <ImageIcon size={20} strokeWidth={1.5} aria-hidden="true" />
                </span>
            )}
            {item.media_type === "video" && (
                <span className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/75 text-white">
                    <Play size={11} fill="currentColor" aria-hidden="true" />
                </span>
            )}
        </span>
    );
}
