export type FacilityReservationMethod =
    | "website"
    | "whatsapp"
    | "external";

export interface PublicFacilityReservation {
    configured_method?: "auto" | FacilityReservationMethod;
    method: FacilityReservationMethod;
    href: string;
    target: "_self" | "_blank";
    automatic_fallback?: boolean;
}

const DEFAULT_WHATSAPP_NUMBER = "6285280809080";

export function manualFacilityReservationHref(
    facilityName: string,
    location = "UB Sport Center",
): string {
    const cleanName = facilityName
        .replace(/^\/+|[/.]+$/g, "")
        .trim() || "fasilitas UB Sport Center";
    const message = [
        "Halo UB Sport Center 👋",
        "",
        `Saya ingin melakukan reservasi *${cleanName}* di lokasi *${location}*.`,
        "",
        "Mohon bantuannya untuk informasi jadwal yang tersedia, harga, dan langkah reservasi selanjutnya.",
        "",
        "Terima kasih.",
    ].join("\n");

    return `https://api.whatsapp.com/send/?phone=${DEFAULT_WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;
}

export function facilityReservationDestination(
    reservation: PublicFacilityReservation | null | undefined,
    facilityName: string,
    location?: string | null,
): { href: string; target: "_self" | "_blank" } {
    if (reservation?.href) {
        return {
            href: reservation.href,
            target: reservation.target === "_blank" ? "_blank" : "_self",
        };
    }

    return {
        href: manualFacilityReservationHref(
            facilityName,
            location || "UB Sport Center",
        ),
        target: "_blank",
    };
}
