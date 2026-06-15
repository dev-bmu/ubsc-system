import { MapPin } from "lucide-react";

type BadgeVariant = "blue" | "red" | "blue-red";

interface FacilityBadgeProps {
    location: string;
    category: string;
    variant?: BadgeVariant;
}

const gradientMap: Record<BadgeVariant, string> = {
    blue: "from-[#15678D] to-[#153359]",
    red: "from-[#FF462E] to-[#790A0A]",
    "blue-red": "from-[#FF0000] to-[#153359]",
};

export default function FacilityBadge({
    location,
    category,
    variant = "blue",
}: FacilityBadgeProps) {
    return (
        <div className="inline-flex w-fit max-w-full items-stretch overflow-hidden rounded-md border-2 border-black font-medium">
            <div className="flex items-center gap-1.5 bg-black rounded-l-sm px-2 py-1 lg:px-3 lg:py-1.5 font-bdo font-regular text-white text-[clamp(0.7rem,0.7vw+0.5rem,1rem)] whitespace-nowrap backdrop-blur-sm shrink-0">
                <MapPin size={12} className="flex-shrink-0 opacity-70" />
                <span>{location}</span>
            </div>
            <div
                className={`flex items-center font-clash font-semibold bg-gradient-to-r ${gradientMap[variant]} px-2 py-1 lg:px-3 lg:py-1.5 text-white text-[clamp(0.7rem,0.7vw+0.5rem,1rem)] whitespace-nowrap ring-1 ring-inset ring-white/10 shrink-0`}
            >
                <span>{category}</span>
            </div>
        </div>
    );
}
