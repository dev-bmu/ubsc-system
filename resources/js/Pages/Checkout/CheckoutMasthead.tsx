import heroImage from "@/../assets/images/bg-herobooking.avif";
import BeamsBackground from "@/Components/Booking/BeamsBackground";
import { ChronoHalo } from "@/Components/Booking/BookingHero";

const CHECKOUT_IMAGE_PRIORITY = { fetchpriority: "high" } as const;

export default function CheckoutMasthead({
    title = "Checkout",
    compact = false,
}: {
    title?: string;
    compact?: boolean;
}) {
    return (
        <section
            className={`checkout-masthead${compact ? " checkout-masthead--compact" : ""}`}
            data-section
            aria-label={title}
        >
            <BeamsBackground
                className="checkout-masthead__beams"
                beamColor="#15678D"
                speed={0.55}
            />

            <div className="checkout-masthead__atmosphere" aria-hidden="true" />
            <div className="checkout-masthead__edge-field" aria-hidden="true">
                <span className="checkout-masthead__edge-wing checkout-masthead__edge-wing--left" />
                <span className="checkout-masthead__edge-wing checkout-masthead__edge-wing--right" />
            </div>

            <ChronoHalo layer="rear" />

            <div className="checkout-masthead__focus" aria-hidden="true">
                <span className="checkout-masthead__focus-rail checkout-masthead__focus-rail--top" />
                <figure className="checkout-masthead__portrait">
                    <img
                        className="checkout-masthead__portrait-base"
                        src={heroImage}
                        alt=""
                        width="1920"
                        height="2050"
                        decoding="async"
                        loading="eager"
                        {...CHECKOUT_IMAGE_PRIORITY}
                    />
                    <img
                        className="checkout-masthead__portrait-shift"
                        src={heroImage}
                        alt=""
                        width="1920"
                        height="2050"
                        decoding="async"
                    />
                    <span className="checkout-masthead__portrait-tone" />
                    <i className="checkout-masthead__portrait-mark checkout-masthead__portrait-mark--left" />
                    <i className="checkout-masthead__portrait-mark checkout-masthead__portrait-mark--right" />
                </figure>
                <span className="checkout-masthead__focus-rail checkout-masthead__focus-rail--bottom" />
            </div>

            <ChronoHalo layer="front" />
            <p className="checkout-masthead__title">{title}</p>
        </section>
    );
}
