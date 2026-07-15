import { useEffect, useRef, useState } from "react";

interface FeaturedPromoCardProps {
    isPrepared: boolean;
    revealOrder: number;
}

export default function FeaturedPromoCard({
    isPrepared,
    revealOrder,
}: FeaturedPromoCardProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const unggulanBg = {
        background:
            "linear-gradient(266deg, #15678d 3%, #173859 61%, #002244 97%)",
    } as const;

    useEffect(() => {
        const node = rootRef.current;
        if (!node) return;

        if (!("IntersectionObserver" in window)) {
            setIsVideoReady(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVideoReady(Boolean(entry?.isIntersecting));
            },
            {
                threshold: 0.01,
                rootMargin: "720px 0px 720px 0px",
            },
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!isPrepared || !video) return;

        video.load();
    }, [isPrepared]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        if (!isPrepared || !isVideoReady) {
            video.pause();
            return;
        }

        const timeout = window.setTimeout(() => {
            void video.play().catch(() => undefined);
        }, 120);

        return () => window.clearTimeout(timeout);
    }, [isPrepared, isVideoReady]);

    return (
        <div
            ref={rootRef}
            data-news-reveal="video"
            data-news-reveal-order={revealOrder}
            className="flex aspect-[413/529] w-full flex-col overflow-hidden p-6"
            style={unggulanBg}
        >
            <div className="mb-2 flex items-center justify-center gap-2">
                <p className="text-center font-bdo text-xs font-medium text-white xl:text-sm">
                    Unggulan Kami
                </p>
            </div>
            <p className="text-center font-bdo text-sm font-medium leading-snug text-white xl:text-base">
                Dalam Pengembangan: Fitur artikel dan berita akan Segera Hadir
            </p>
            <div className="mt-4 flex-1 overflow-hidden rounded-sm bg-black/40">
                {isPrepared ? (
                    <video
                        ref={videoRef}
                        src="/assets/reels/tennis vid.mp4"
                        className="h-full w-full object-cover"
                        loop
                        muted
                        playsInline
                        preload="metadata"
                    />
                ) : (
                    <div className="h-full w-full bg-black/35" />
                )}
            </div>
        </div>
    );
}
