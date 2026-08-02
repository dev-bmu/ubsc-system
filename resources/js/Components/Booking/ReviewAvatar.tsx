import { useEffect, useMemo, useState } from "react";

interface ReviewAvatarProps {
    authorName: string;
    avatar?: string | null;
    avatarFallback?: string | null;
    className?: string;
    eager?: boolean;
}

function initialsFor(name: string): string {
    const words = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) return "U";

    return words
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toLocaleUpperCase("id-ID");
}

export default function ReviewAvatar({
    authorName,
    avatar,
    avatarFallback,
    className = "",
    eager = false,
}: ReviewAvatarProps) {
    const sources = useMemo(
        () =>
            Array.from(
                new Set(
                    [avatar, avatarFallback]
                        .map((source) => source?.trim())
                        .filter((source): source is string => Boolean(source)),
                ),
            ),
        [avatar, avatarFallback],
    );
    const [sourceIndex, setSourceIndex] = useState(0);

    useEffect(() => {
        setSourceIndex(0);
    }, [sources]);

    const source = sources[sourceIndex];

    return (
        <span
            className={`booking-review-avatar ${className}`.trim()}
            role="img"
            aria-label={`Foto profil ${authorName}`}
        >
            {source ? (
                <img
                    src={source}
                    alt=""
                    width="80"
                    height="80"
                    loading={eager ? "eager" : "lazy"}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() =>
                        setSourceIndex((index) =>
                            Math.min(index + 1, sources.length),
                        )
                    }
                />
            ) : (
                <span aria-hidden="true">{initialsFor(authorName)}</span>
            )}
        </span>
    );
}
