import FacilityListSection from "@/Components/Facility/FacilityListSection";
import FacilityClassSection from "@/Components/Facility/FacilityClassSection";

export default function BookingFacilitiesSection() {
    return (
        <>
            <FacilityListSection
                sectionNumber="02"
                sectionTitle="Fasilitas Indoor"
                sectionSubtitle="02 booking"
            />
            <FacilityClassSection
                sectionNumber="03"
                sectionTitle="Kelas Indoor"
                sectionSubtitle="02 booking"
            />
        </>
    );
}
