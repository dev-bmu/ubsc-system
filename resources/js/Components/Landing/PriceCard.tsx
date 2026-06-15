import { Star } from "lucide-react";
import type { CSSProperties } from "react";

export interface PriceItem {
    id: string | number;
    image: string;
    title: string;
    price: string;
    rating?: number; // 1–5, default 5
    href?: string;
}

interface PriceCardProps {
    item: PriceItem;
}

export default function PriceCard({ item }: PriceCardProps) {
    const rating = item.rating ?? 5;
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;

    return (
        <div className="flex cursor-pointer items-center gap-3 rounded-sm bg-gray-100 p-3 transition-colors duration-200 hover:bg-gray-200 xl:gap-6 xl:p-3">
            <div className="h-16 w-20 flex-shrink-0 overflow-hidden rounded-sm xl:h-24 xl:w-32">
                {item.image ? (
                    <img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        draggable={false}
                        loading="lazy"
                    />
                ) : (
                    <div className="h-full w-full bg-gray-300" />
                )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
                {/* Top row: title + stars */}
                <div className="flex items-start justify-between gap-2 w-full">
                    <span className="truncate text-[clamp(0.875rem,1.04vw,20px)] font-medium text-gray-900">
                        {item.title}
                    </span>
                    <div className="pricing-stars flex flex-shrink-0 items-center gap-0.5 pt-0.5">
                        {Array.from({ length: 5 }).map((_, i) => {
                            const filled = i < fullStars;
                            const half = !filled && i === fullStars && hasHalf;
                            return (
                                <Star
                                    key={i}
                                    size={13}
                                    strokeWidth={1.5}
                                    className={
                                        filled || half
                                            ? "pricing-star-lustre text-orange-400"
                                            : "text-gray-300"
                                    }
                                    fill={filled ? "currentColor" : "none"}
                                    style={{
                                        ...(half
                                            ? {
                                                  fill: "url(#half-fill)",
                                                  color: "#fb923c",
                                              }
                                            : {}),
                                        "--pricing-star-index": i,
                                    } as CSSProperties}
                                />
                            );
                        })}
                        <svg width="0" height="0" className="absolute">
                            <defs>
                                <linearGradient
                                    id="half-fill"
                                    x1="0"
                                    x2="1"
                                    y1="0"
                                    y2="0"
                                >
                                    <stop offset="50%" stopColor="#fb923c" />
                                    <stop
                                        offset="50%"
                                        stopColor="transparent"
                                    />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                </div>
                <span className="mt-1 truncate text-[clamp(0.625rem,0.73vw,14px)] text-gray-600">
                    {item.price}
                </span>
            </div>
        </div>
    );

    //     if (item.href && item.href !== "#") {
    //         return (
    //             <a
    //                 href={item.href}
    //                 target="_blank"
    //                 rel="noopener noreferrer"
    //                 className="block"
    //             >
    //                 {inner}
    //             </a>
    //         );
    //     }

    //     return inner;
}
