import { Link } from "@inertiajs/react";
import type { CSSProperties } from "react";

function getBadgeTone(category: NewsItem["category"]) {
    return category === "Artikel" ? "artikel" : "berita";
}

export interface NewsItem {
    id: string | number;
    title: string;
    slug?: string;
    date: string;
    category: "Berita" | "Artikel";
    image: string;
    description?: string;
}

interface NewsCardProps extends NewsItem {
    index: number;
    layoutOverride?: "berita" | "artikel" | "alternate";
    className?: string;
    compact?: boolean;
    variant?: "default" | "news-page";
    featured?: boolean;
    priority?: boolean;
    entranceIndex?: number;
    newsReveal?: string;
    newsRevealOrder?: number;
}

export default function NewsCard({
    slug,
    title,
    date,
    category,
    image,
    description,
    index,
    layoutOverride,
    className,
    compact = false,
    variant = "default",
    featured = false,
    priority = false,
    entranceIndex,
    newsReveal,
    newsRevealOrder,
}: NewsCardProps) {
    const Wrapper = slug ? Link : "article";
    const wrapperProps = slug ? { href: route("news.show", slug) } : {};
    const fetchPriorityAttr = {
        fetchpriority: priority ? "high" : "low",
    } as Record<string, string>;
    const isImageTop =
        layoutOverride === "berita"
            ? true
            : layoutOverride === "artikel"
              ? false
              : index % 2 === 0;
    const entranceClass =
        entranceIndex === undefined
            ? ""
            : "news-entrance-reveal news-entrance-reveal--card";
    const entranceStyle =
        entranceIndex === undefined
            ? undefined
            : ({
                  "--news-card-delay": `${390 + entranceIndex * 80}ms`,
              } as CSSProperties);

    if (variant === "news-page") {
        const outerClass =
            className ??
            (featured
                ? "w-full md:aspect-[857/529]"
                : "w-full aspect-[413/529]");
        const imageClass = featured
            ? "aspect-[857/311]"
            : "aspect-[413/218] md:aspect-[413/233]";
        const padClass = featured
            ? "px-[clamp(1rem,1.1vw,1.3125rem)] py-[clamp(1.125rem,1.45vw,1.875rem)]"
            : "px-2 py-2.5 md:px-[clamp(1rem,1.1vw,1.3125rem)] md:py-[clamp(1rem,1.45vw,1.75rem)]";
        const contentClass = featured
            ? "flex min-h-[7.75rem] flex-col overflow-hidden md:min-h-0 md:flex-1"
            : "flex min-h-0 flex-1 flex-col overflow-hidden";
        const dateWrapClass = featured
            ? "mt-4 flex min-h-[1.35rem] flex-shrink-0 items-end md:mt-auto md:h-12"
            : "mt-auto flex h-8 flex-shrink-0 items-end md:h-12";
        const topDateWrapClass = featured
            ? "flex min-h-[1.35rem] flex-shrink-0 items-start md:h-10"
            : "flex h-7 flex-shrink-0 items-start md:h-10";
        const bottomTextClass = featured
            ? "mt-4 min-h-0 overflow-hidden md:mt-auto"
            : "mt-auto min-h-0 overflow-hidden pb-1.5 md:pb-0";
        const badgeTone = getBadgeTone(category);
        const descriptionTone = isImageTop ? "text-black/70" : "text-white/70";
        const badgeClass = featured
            ? "left-4 min-w-[4.75rem] px-4 py-1 text-xs"
            : "left-2 min-w-[2.55rem] px-1.5 py-[0.12rem] text-[0.48rem] md:left-4 md:min-w-[4.75rem] md:px-4 md:py-1 md:text-xs";
        const badgePositionClass = featured
            ? isImageTop
                ? "top-4"
                : "bottom-4"
            : isImageTop
              ? "top-2 md:top-4"
              : "bottom-2 md:bottom-4";
        const titleClass = featured
            ? "text-[0.9rem] leading-snug xl:text-base"
            : "text-[0.68rem] leading-[1.08] md:text-[0.9rem] md:leading-snug xl:text-base";
        const titleClampClass = featured
            ? "line-clamp-2"
            : "line-clamp-3 md:line-clamp-2";
        const descClass = featured
            ? "mt-2 text-[0.7rem] leading-relaxed xl:text-[0.8rem]"
            : "mt-1 text-[0.49rem] leading-[1.18] md:mt-2 md:text-[0.7rem] md:leading-relaxed xl:text-[0.8rem]";
        const descClampClass = featured
            ? "line-clamp-3"
            : "line-clamp-2 md:line-clamp-3";
        const dateClass = featured
            ? "text-[0.8rem] xl:text-[0.9rem]"
            : "text-[0.52rem] md:text-[0.8rem] xl:text-[0.9rem]";

        const imageNode = (
            <div className={`relative w-full flex-shrink-0 overflow-hidden ${imageClass}`}>
                <img
                    src={image}
                    alt={title}
                    loading={priority ? "eager" : "lazy"}
                    decoding="async"
                    {...fetchPriorityAttr}
                    width={857}
                    height={529}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    draggable={false}
                />
                <span
                    className={`news-gradient-badge news-gradient-badge--story absolute inline-flex items-center justify-center rounded-[5px] text-center font-bdo font-medium text-white ${badgeClass} ${badgePositionClass}`}
                    data-tone={badgeTone}
                >
                    <span>{category}</span>
                </span>
            </div>
        );

        const titleNode = (
            <p className={`font-bdo font-medium text-current ${titleClampClass} ${titleClass}`}>
                {title}
            </p>
        );
        const descNode =
            description && (
                <p
                    className={`font-bdo font-normal ${descClampClass} ${descClass} ${descriptionTone}`}
                >
                    {description}
                </p>
            );

        return (
            <Wrapper
                {...wrapperProps}
                data-news-reveal={newsReveal}
                data-news-reveal-order={newsRevealOrder}
                className={`news-card-shell group flex min-h-0 cursor-pointer flex-col overflow-hidden border border-black/5 ${entranceClass} ${outerClass}`}
                style={entranceStyle}
            >
                {isImageTop ? (
                    <>
                        {imageNode}
                        <div className={`${contentClass} bg-white text-black ${padClass}`}>
                            <div className="min-h-0 overflow-hidden">
                                {titleNode}
                                {descNode}
                            </div>
                            <div className={dateWrapClass}>
                                <span className={`line-clamp-1 font-bdo font-normal text-black/70 ${dateClass}`}>
                                    {date}
                                </span>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className={`${contentClass} bg-black text-white ${padClass}`}>
                            <div className={topDateWrapClass}>
                                <span className={`line-clamp-1 font-bdo font-normal text-white/70 ${dateClass}`}>
                                    {date}
                                </span>
                            </div>
                            <div className={bottomTextClass}>
                                {descNode}
                                <div className="mt-4">{titleNode}</div>
                            </div>
                        </div>
                        {imageNode}
                    </>
                )}
            </Wrapper>
        );
    }

    const outerClass =
        className ??
        "h-[clamp(21.875rem,18rem+10vw,28.125rem)] w-[clamp(17.5rem,15rem+8vw,21.875rem)] flex-shrink-0";

    const titleClass = compact
        ? "text-[12px] xl:text-[clamp(1rem,1.25vw,24px)]"
        : "text-[clamp(1rem,1.25vw,24px)]";

    const descClass = compact
        ? "text-[8px] xl:text-[clamp(0.875rem,0.83vw,16px)]"
        : "text-[clamp(0.875rem,0.83vw,16px)]";

    const dateClass = compact
        ? "text-[10px] xl:text-[clamp(1rem,0.75vw,20px)]"
        : "text-[clamp(1rem,0.75vw,20px)]";

    const padClass = compact ? "p-3 xl:p-6" : "p-6";

    return (
        <Wrapper
            {...wrapperProps}
            data-news-reveal={newsReveal}
            data-news-reveal-order={newsRevealOrder}
            className={`news-card-shell group cursor-pointer flex flex-col border border-white/10 overflow-hidden ${entranceClass} ${outerClass}`}
            style={entranceStyle}
        >
            {isImageTop ? (
                <>
                    <div className="relative flex-[0_0_44%] overflow-hidden">
                        <img
                            src={image}
                            alt={title}
                            loading={priority ? "eager" : "lazy"}
                            decoding="async"
                            {...fetchPriorityAttr}
                            width={720}
                            height={920}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            draggable={false}
                        />
                        <span
                            className="news-gradient-badge news-gradient-badge--story absolute left-3 top-3 inline-flex min-w-[4rem] items-center justify-center rounded-[5px] px-3 py-0.5 text-center text-[10px] font-medium text-white xl:left-4 xl:top-4 xl:min-w-[4.75rem] xl:px-4 xl:py-1 xl:text-xs"
                            data-tone={getBadgeTone(category)}
                        >
                            <span>{category}</span>
                        </span>
                    </div>

                    <div
                        className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-white ${padClass}`}
                    >
                        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                            <p
                                className={`line-clamp-3 font-bdo font-medium leading-snug text-black md:line-clamp-2 ${titleClass}`}
                            >
                                {title}
                            </p>
                            {description && (
                                <p
                                    className={`mt-1 line-clamp-2 font-bdo font-normal text-black/70 md:line-clamp-3 ${descClass}`}
                                >
                                    {description}
                                </p>
                            )}
                        </div>
                        <div className="mt-auto flex h-8 flex-shrink-0 items-end xl:h-10">
                            <span
                                className={`line-clamp-1 font-bdo font-normal text-black/70 ${dateClass}`}
                            >
                                {date}
                            </span>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div
                        className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-black ${padClass}`}
                    >
                        <div className="flex h-7 flex-shrink-0 items-start xl:h-10">
                            <span
                                className={`line-clamp-1 font-bdo font-normal text-white/70 ${dateClass}`}
                            >
                                {date}
                            </span>
                        </div>
                        <div className="mt-auto flex min-h-0 flex-1 flex-col justify-end gap-1 overflow-hidden">
                            {description && (
                                <p
                                    className={`mt-1 line-clamp-2 font-bdo font-normal text-white/70 md:line-clamp-3 ${descClass}`}
                                >
                                    {description}
                                </p>
                            )}
                            <p
                                className={`mt-2 line-clamp-3 font-bdo font-medium leading-snug text-white md:line-clamp-2 ${titleClass}`}
                            >
                                {title}
                            </p>
                        </div>
                    </div>

                    <div className="relative flex-[0_0_44%] overflow-hidden">
                        <img
                            src={image}
                            alt={title}
                            loading={priority ? "eager" : "lazy"}
                            decoding="async"
                            {...fetchPriorityAttr}
                            width={720}
                            height={920}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                            draggable={false}
                        />
                        <span
                            className="news-gradient-badge news-gradient-badge--story absolute bottom-3 left-3 inline-flex min-w-[4rem] items-center justify-center rounded-[5px] px-3 py-0.5 text-center text-[10px] font-medium text-white xl:bottom-4 xl:left-4 xl:min-w-[4.75rem] xl:px-4 xl:py-1 xl:text-xs"
                            data-tone={getBadgeTone(category)}
                        >
                            <span>{category}</span>
                        </span>
                    </div>
                </>
            )}
        </Wrapper>
    );
}
