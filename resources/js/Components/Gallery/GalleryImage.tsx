import type { CSSProperties, ImgHTMLAttributes } from "react";
import type { GalleryImageAsset } from "@/types/gallery";

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "width" | "height"> {
    asset: GalleryImageAsset;
    focalX?: number;
    focalY?: number;
    sizes?: string;
}

export default function GalleryImage({
    asset,
    focalX = 0.5,
    focalY = 0.5,
    sizes = "100vw",
    style,
    fetchPriority,
    ...imageProps
}: Props) {
    const priorityProps = fetchPriority ? { fetchpriority: fetchPriority } : {};

    return (
        <picture>
            {asset.srcsets.avif && <source type="image/avif" srcSet={asset.srcsets.avif} sizes={sizes} />}
            {asset.srcsets.webp && <source type="image/webp" srcSet={asset.srcsets.webp} sizes={sizes} />}
            {asset.srcsets.jpg && <source type="image/jpeg" srcSet={asset.srcsets.jpg} sizes={sizes} />}
            <img
                {...imageProps}
                {...priorityProps}
                src={asset.fallback_url}
                width={asset.width}
                height={asset.height}
                style={{
                    objectPosition: `${focalX * 100}% ${focalY * 100}%`,
                    ...style,
                } as CSSProperties}
            />
        </picture>
    );
}
