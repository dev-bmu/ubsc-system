interface PricingBookingLinkProps {
    label: string;
    className?: string;
    href?: string;
}

export default function PricingBookingLink({
    label,
    className = "",
    href = "/booking",
}: PricingBookingLinkProps) {
    const classes = ["pricing-booking-cta", className]
        .filter(Boolean)
        .join(" ");

    return (
        <a className={classes} href={href}>
            <span>{label}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path
                    d="M5 12h13M13 6l6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </a>
    );
}
