export interface FacilityClassificationInput {
    category?: string | null;
    venue_type?: string | null;
    class_code?: string | null;
}

function normalize(value?: string | null): string {
    return value?.trim().toLocaleLowerCase("id-ID") ?? "";
}

export function isOutdoorFacility(
    facility: FacilityClassificationInput,
): boolean {
    const venueType = normalize(facility.venue_type);
    const classCode = normalize(facility.class_code);
    const category = normalize(facility.category);

    return (
        venueType === "arena luar" ||
        venueType.includes("outdoor") ||
        venueType.includes("arena terbuka") ||
        classCode.startsWith("terbuka") ||
        category === "outdoor facility"
    );
}
