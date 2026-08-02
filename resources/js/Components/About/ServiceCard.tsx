import { Link } from "@inertiajs/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useHomepageEntranceReady } from "@/Components/Landing/HomepageEntranceContext";

interface ServiceCardProps {
    index: number;
    numberString: string;
    title: string;
    subtitle: string;
    image: string;
}

export default function ServiceCard({
    index,
    numberString,
    title,
    subtitle,
    image,
}: ServiceCardProps) {
    const isTall = index % 2 === 0;
    const cardRef = useRef<HTMLAnchorElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const entranceReady = useHomepageEntranceReady();

    useEffect(() => {
        const card = cardRef.current;
        if (!entranceReady || !card || isVisible) return;

        if (!("IntersectionObserver" in window)) {
            setIsVisible(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry?.isIntersecting) return;
                setIsVisible(true);
                observer.disconnect();
            },
            {
                threshold: 0.08,
                rootMargin: "0px 0px -10% 0px",
            },
        );

        observer.observe(card);
        return () => observer.disconnect();
    }, [entranceReady, isVisible]);

    return (
        <Link
            ref={cardRef}
            href="#"
            className={`about-service-card group flex cursor-pointer flex-col items-start ${
                isVisible ? "is-visible" : ""
            }`}
            style={
                {
                    "--about-service-card-delay": `${index * 95}ms`,
                } as CSSProperties
            }
        >
            <div
                className={`about-service-card-media w-full overflow-hidden rounded-[5px] ${
                    isTall ? "aspect-[3/4]" : "aspect-[4/3]"
                }`}
            >
                <img
                    src={image}
                    alt={title}
                    className="about-service-card-image h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                    data-page-media-reveal="1"
                    {...{ fetchpriority: "low" }}
                    width={640}
                    height={853}
                    sizes="(min-width: 1280px) 22vw, (min-width: 640px) 45vw, 88vw"
                    draggable={false}
                />
            </div>

            <div className="about-service-card-copy mt-4 flex w-full items-start gap-4">
                <span className="about-service-card-number w-8 flex-shrink-0 font-bdo font-medium text-[clamp(0.875rem,0.83vw,16px)] text-black">
                    {numberString}
                </span>
                <div className="flex flex-col gap-0.5">
                    <span className="about-service-card-title font-bdo font-medium text-[clamp(1rem,1.04vw,20px)] leading-tight text-black">
                        {title}
                    </span>
                    <span className="about-service-card-subtitle font-bdo font-light text-[clamp(0.875rem,0.83vw,16px)] text-black/60">
                        {subtitle}
                    </span>
                </div>
            </div>
        </Link>
    );
}
