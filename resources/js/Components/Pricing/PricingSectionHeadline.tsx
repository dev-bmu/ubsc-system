import ScrollTextReveal from "@/Components/Landing/ScrollTextReveal";
import "./PricingInfo.css";

const PRICING_SECTION_HEADING_CLASS =
    "home-section-heading pricing-membership__heading section-two-headline-weight";

interface PricingSectionHeadlineProps {
    children: string;
    className?: string;
    delay?: number;
    id?: string;
    stagger?: number;
    theme?: "dark" | "light";
}

export default function PricingSectionHeadline({
    children,
    className = "",
    delay = 110,
    id,
    stagger = 95,
    theme = "light",
}: PricingSectionHeadlineProps) {
    return (
        <h2
            id={id}
            aria-label={children}
            className={`${PRICING_SECTION_HEADING_CLASS} pricing-membership__heading--${theme} ${className}`}
        >
            <ScrollTextReveal
                split="lines"
                delay={delay}
                stagger={stagger}
                className="pricing-membership__heading-reveal"
            >
                {children}
            </ScrollTextReveal>
        </h2>
    );
}
