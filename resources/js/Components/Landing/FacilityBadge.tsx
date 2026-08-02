import { MapPin } from "lucide-react";

type BadgeVariant = "blue" | "red" | "blue-red";

interface FacilityBadgeProps {
    location: string;
    category: string;
    variant?: BadgeVariant;
}

const variantClassMap: Record<BadgeVariant, string> = {
    blue: "facility-badge--blue",
    red: "facility-badge--red",
    "blue-red": "facility-badge--blue-red",
};

export default function FacilityBadge({
    location,
    category,
    variant = "blue",
}: FacilityBadgeProps) {
    return (
        <div className={`facility-badge ${variantClassMap[variant]}`}>
            <div className="facility-badge__location">
                <MapPin className="facility-badge__icon" aria-hidden="true" />
                <span>{location}</span>
            </div>
            <div className="facility-badge__category">
                <span>{category}</span>
            </div>
        </div>
    );
}
