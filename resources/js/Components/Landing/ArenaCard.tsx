import { ArrowUpRight, MapPin } from "lucide-react";

export interface ArenaItem {
    id: string;
    title: string;
    location: string;
    category: string;
    image: string;
    href: string;
    slug?: string;
}

interface ArenaCardProps {
    item: ArenaItem;
}

export default function ArenaCard({ item }: ArenaCardProps) {
    return (
        <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex w-full cursor-pointer flex-col overflow-hidden border-b border-t border-r border-white/55 even:border-r-0 md:border-b-0 md:border-r md:last:border-r-0 md:even:border-r"
        >
            <div className="relative h-[200px] w-full overflow-hidden md:h-[220px] xl:h-[260px]">
                <img
                    src={item.image}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    draggable={false}
                    loading="lazy"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                <span className="absolute left-4 top-4 z-10 text-xs font-medium tracking-widest text-white/80">
                    {item.id}
                </span>

                <div className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-red-600 transition-transform duration-300 group-hover:scale-110">
                    <ArrowUpRight size={16} className="text-white" />
                </div>

                <div className="absolute bottom-4 left-4 z-10 flex overflow-hidden rounded-md text-[10px] font-clash font-semibold md:text-xs">
                    <span className="flex items-center gap-1 bg-black px-2.5 py-1.5 text-white">
                        <MapPin size={9} className="flex-shrink-0 opacity-75" />
                        {item.location}
                    </span>
                    <span className="flex items-center bg-red-600 px-2.5 py-1.5 text-white">
                        {item.category}
                    </span>
                </div>
            </div>

            <div className="flex items-center bg-[#252525] border-b border-white/55 p-5">
                <span className="text-[clamp(1rem,1.56vw,30px)] font-bold tracking-tight text-white">
                    {item.title}
                </span>
            </div>
        </a>
    );
}
