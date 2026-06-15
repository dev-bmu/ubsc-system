import { Link } from "@inertiajs/react";

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

    return (
        <Link href="#" className="group flex flex-col items-start cursor-pointer">
            <div
                className={`w-full overflow-hidden rounded-[15px] ${
                    isTall ? "aspect-[3/4]" : "aspect-[4/3]"
                }`}
            >
                <img
                    src={image}
                    alt={title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    draggable={false}
                />
            </div>

            <div className="mt-4 flex w-full items-start gap-4">
                <span className="w-8 flex-shrink-0 font-bdo font-medium text-[clamp(0.875rem,0.83vw,16px)] text-black">
                    {numberString}
                </span>
                <div className="flex flex-col gap-0.5">
                    <span className="font-bdo font-medium text-[clamp(1rem,1.04vw,20px)] leading-tight text-black">
                        {title}
                    </span>
                    <span className="font-bdo font-light text-[clamp(0.875rem,0.83vw,16px)] text-black/60">
                        {subtitle}
                    </span>
                </div>
            </div>
        </Link>
    );
}
