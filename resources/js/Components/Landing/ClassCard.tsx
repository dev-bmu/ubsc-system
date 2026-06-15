import { ArrowUpRight, MapPin } from "lucide-react";

export interface ClassItem {
    id: string;
    title: string;
    location: string;
    category: string;
    image: string;
    href: string;
    slug?: string;
}

interface ClassCardProps {
    item: ClassItem;
}

export default function ClassCard({ item }: ClassCardProps) {
    return (
        <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex w-full cursor-pointer flex-col overflow-hidden"
        >
            <div className="relative h-[280px] w-full overflow-hidden md:h-[380px]">
                <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    draggable={false}
                    loading="lazy"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                <span className="absolute left-5 top-5 z-10 text-xs tracking-widest text-white/90 sm:text-sm">
                    {item.id}
                </span>

                <div className="absolute bottom-5 left-5 z-10 flex overflow-hidden rounded-md text-xs font-clash font-semibold border-2 border-[#323232]">
                    <span className="flex items-center gap-1 bg-[#242424] px-3 py-1.5 text-white">
                        <MapPin
                            size={10}
                            className="flex-shrink-0 opacity-75"
                        />
                        {item.location}
                    </span>
                    <span
                        className="flex items-center px-3 py-1.5 text-white"
                        style={{
                            background:
                                "linear-gradient(135deg, #FF0000 0%, #153359  100%)",
                        }}
                    >
                        {item.category}
                    </span>
                </div>
            </div>

            <div className="flex items-center justify-between border border-t-0 border-neutral-700/50 bg-[#242424] p-6 md:p-8">
                <span className="text-[clamp(1.5rem,2.08vw,40px)] font-bold tracking-tight text-white">
                    {item.title}
                </span>
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-600 transition-transform duration-300 group-hover:translate-x-1">
                    <ArrowUpRight size={18} className="text-white" />
                </div>
            </div>
        </a>
    );
}
