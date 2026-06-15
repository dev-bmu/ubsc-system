import { ArrowUpRight } from "lucide-react";
import FacilityBadge from "@/Components/Landing/FacilityBadge";

export interface Facility {
    id: string;
    name: string;
    location: string;
    category: string;
    bgImage: string;
    href: string;
    slug?: string;
}

interface FacilityRowProps {
    facility: Facility;
}

export default function FacilityRow({ facility }: FacilityRowProps) {
    return (
        <a
            href={facility.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative block w-full overflow-hidden text-white transition-all duration-300 hover:brightness-110"
            style={{ height: "clamp(150px, 14vw, 160px)" }}
        >
            <img
                src={facility.bgImage}
                alt={facility.name}
                className="absolute inset-0 z-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                draggable={false}
                loading="lazy"
            />

            <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />

            <div className="relative z-20 flex h-full flex-col justify-between px-5 py-3 xl:hidden">
                <div className="flex items-start justify-between">
                    <span className="text-[10px] md:text-[14px] font-medium tracking-widest text-white/70">
                        /Tertutup {facility.id}/
                    </span>
                    <FacilityBadge
                        location={facility.location}
                        category={facility.category}
                    />
                </div>
                <div className="flex items-end justify-between">
                    <span className="text-2xl font-medium tracking-tight leading-none sm:text-3xl md:text-4xl mb-4">
                        /{facility.name}.
                    </span>
                    <div className="ml-3 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-600 transition-transform duration-300 group-hover:translate-x-1 sm:h-10 sm:w-10 mb-2">
                        <ArrowUpRight size={16} className="sm:hidden" />
                        <ArrowUpRight size={18} className="hidden sm:block" />
                    </div>
                </div>
            </div>

            <div className="relative z-20 mx-auto hidden h-full max-w items-center px-12 xl:flex">
                <span className="w-36 flex-shrink-0 text-xs font-medium tracking-widest text-white/70">
                    /Tertutup {facility.id}/
                </span>

                <div className="flex-shrink-0">
                    <FacilityBadge
                        location={facility.location}
                        category={facility.category}
                    />
                </div>

                <span className="ml-10 flex-1 truncate text-[clamp(1.5rem,2.5vw,48px)] font-semibold tracking-tight">
                    /{facility.name}.
                </span>

                <div className="ml-4 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-600 transition-transform duration-300 group-hover:translate-x-1">
                    <ArrowUpRight size={20} />
                </div>
            </div>
        </a>
    );
}
