import FacilityListSection from "@/Components/Facility/FacilityListSection";
import FacilityClassSection from "@/Components/Facility/FacilityClassSection";
import FacilityOutdoorSection, {
    type OutdoorFacility,
} from "@/Components/Facility/FacilityOutdoorSection";
import type { FacilityItem } from "@/Components/Facility/FacilityListItem";
import type { ClassItem } from "@/Components/Facility/FacilityClassSection";
import { isOutdoorFacility } from "@/lib/facilityClassification";
import type { PublicFacilityReservation } from "@/lib/facilityReservation";

interface BookingFacility {
    id: number;
    name: string;
    image: string;
    category: string;
    location?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
    reservation?: PublicFacilityReservation | null;
}

interface BookingFacilitiesSectionProps {
    facilities?: BookingFacility[];
}

export default function BookingFacilitiesSection({
    facilities = [],
}: BookingFacilitiesSectionProps) {
    const indoorFacilities: FacilityItem[] = facilities
        .filter(
            (facility) =>
                facility.category === "Lapangan & Arena" &&
                !isOutdoorFacility(facility),
        )
        .map((facility, index) => ({
            id: String(index + 1).padStart(2, "0"),
            title: `/${facility.name}.`,
            code:
                facility.class_code ??
                `/Tertutup ${String(index + 1).padStart(3, "0")}/`,
            image: facility.image || "/assets/images/comingsoon.avif",
            badgeLocation: facility.location || "Veteran",
            badgeType: "Arena Dalam",
            reservation: facility.reservation,
        }));

    const classFacilities: ClassItem[] = facilities
        .filter((facility) => facility.category === "Kelas & Kebugaran")
        .map((facility, index) => ({
            id: String(facility.id),
            name: facility.name,
            code:
                facility.class_code
                    ?.replace(/^\/+|\/+$/g, "")
                    .replace(/^Class\s+/i, "") ??
                String(index + 1).padStart(3, "0"),
            image: facility.image || "/assets/images/comingsoon.avif",
            badgeLocation: facility.location || "Veteran",
            badgeCategory: "Kebugaran",
            reservation: facility.reservation,
        }));

    const outdoorFacilities: OutdoorFacility[] = facilities
        .filter(isOutdoorFacility)
        .map((facility) => ({
            id: String(facility.id),
            name: facility.name,
            category: facility.category || "Lapangan & Arena",
            image: facility.image || "/assets/images/comingsoon.avif",
            classCode: facility.class_code,
            location: facility.location || "Dieng",
            venueType: facility.venue_type || "Arena Luar",
            mapLink: null,
            reservation: facility.reservation,
        }));

    return (
        <>
            <FacilityListSection
                sectionNumber="03"
                sectionTitle="Fasilitas Lainnya"
                sectionSubtitle="06 bookingpage"
                showSectionDivider
                facilities={
                    indoorFacilities.length > 0 ? indoorFacilities : undefined
                }
            />
            <FacilityClassSection
                classes={
                    classFacilities.length > 0 ? classFacilities : undefined
                }
            />
            <FacilityOutdoorSection
                facilities={
                    outdoorFacilities.length > 0
                        ? outdoorFacilities
                        : undefined
                }
                totalFacilitiesCount={outdoorFacilities.length}
            />
        </>
    );
}
