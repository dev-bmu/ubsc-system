import {
    useRef,
    type PointerEvent as ReactPointerEvent,
    type SyntheticEvent,
} from "react";
import FacilityBadge from "@/Components/Landing/FacilityBadge";
import PricingBookingLink from "./PricingBookingLink";

export interface FacilityRateData {
    id: string;
    label: string;
    value: string;
    duration?: string;
    note?: string;
    schedule?: string;
}

export interface FacilityRateGroup {
    id: string;
    label: string;
    rates: FacilityRateData[];
}

export interface FacilityFact {
    label: string;
    value: string;
}

export interface FacilityAccordionData {
    id: string;
    title: string;
    description: string;
    image: string;
    location: string;
    category: string;
    venueType: string;
    badgeLocation: string;
    badgeType: string;
    priceRange: string;
    hasRates: boolean;
    rateGroups: FacilityRateGroup[];
    facts: FacilityFact[];
}

interface Props {
    item: FacilityAccordionData;
    itemIndex: number;
    isActive: boolean;
    isMobileOpen: boolean;
    revealDirection: "up" | "down";
    onMobileToggle: () => void;
    registerChapter: (node: HTMLElement | null) => void;
}

const FALLBACK_IMAGE = "/assets/images/comingsoon.avif";

function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
    if (event.currentTarget.src.endsWith(FALLBACK_IMAGE)) return;
    event.currentTarget.src = FALLBACK_IMAGE;
}

const facilityTitleName = (title: string) =>
    title.replace(/^\s*\/+|[\/.]+\s*$/g, "").trim() || "Fasilitas";

export const formatFacilityTitle = (title: string) =>
    `/${facilityTitleName(title)}.`;

const venueLabel = (venueType: string) =>
    venueType
        .replace(/^\s*Arena\s+/i, "")
        .replace(/\s+\d+\s*$/g, "")
        .replace(/^\s*\/+|\/+\s*$/g, "")
        .trim() || "Fasilitas";

export default function PricingFacilityChapter({
    item,
    itemIndex,
    isActive,
    isMobileOpen,
    revealDirection,
    onMobileToggle,
    registerChapter,
}: Props) {
    const panelPointerRef = useRef<{
        id: number;
        x: number;
        y: number;
        scrollY: number;
        time: number;
    } | null>(null);
    const chapterId = `price-${item.id}`;
    const headingId = `${chapterId}-heading`;
    const triggerId = `${chapterId}-trigger`;
    const panelId = `${chapterId}-panel`;
    const mediaLabel = venueLabel(item.venueType);
    const mediaSequence = String(itemIndex + 1).padStart(3, "0");
    const displayTitle = facilityTitleName(item.title);
    const formattedTitle = formatFacilityTitle(item.title);
    const prioritizeMedia = isActive || isMobileOpen;

    const shouldIgnorePanelTarget = (target: EventTarget | null) => {
        if (!(target instanceof HTMLElement)) return true;

        return Boolean(
            target.closest(
                "a,button,input,textarea,select,video,audio,[data-no-accordion-toggle]",
            ),
        );
    };

    const handlePanelPointerDown = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        /* CSS exposes panel-tap behavior only on the mobile accordion. */
        if (window.getComputedStyle(event.currentTarget).cursor !== "pointer") {
            return;
        }
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (shouldIgnorePanelTarget(event.target)) return;

        panelPointerRef.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            scrollY: window.scrollY,
            time: window.performance.now(),
        };
    };

    const handlePanelPointerUp = (
        event: ReactPointerEvent<HTMLDivElement>,
    ) => {
        const start = panelPointerRef.current;
        panelPointerRef.current = null;

        if (!start || start.id !== event.pointerId) return;
        if (shouldIgnorePanelTarget(event.target)) return;

        const deltaX = Math.abs(event.clientX - start.x);
        const deltaY = Math.abs(event.clientY - start.y);
        const scrollDelta = Math.abs(window.scrollY - start.scrollY);
        const elapsed = window.performance.now() - start.time;
        const selectedText = window.getSelection()?.toString().trim();

        if (selectedText) return;
        if (deltaX > 10 || deltaY > 10) return;
        if (scrollDelta > 2 || elapsed > 700) return;

        onMobileToggle();
    };

    return (
        <article
            ref={registerChapter}
            id={chapterId}
            className="pfa-chapter"
            data-pfa-chapter
            data-facility-id={item.id}
            data-active={isActive ? "true" : "false"}
            data-mobile-open={isMobileOpen ? "true" : "false"}
            data-reveal-direction={revealDirection}
            data-pfa-reveal="chapter"
            aria-label={formattedTitle}
        >
            <button
                id={triggerId}
                className="pfa-chapter__mobile-trigger"
                type="button"
                aria-expanded={isMobileOpen}
                aria-controls={panelId}
                onClick={onMobileToggle}
            >
                <span className="pfa-chapter__mobile-thumbnail" aria-hidden="true">
                    <img
                        className="pfa-chapter__mobile-thumbnail-image pfa-chapter__mobile-thumbnail-image--mono"
                        src={item.image}
                        alt=""
                        loading={prioritizeMedia ? "eager" : "lazy"}
                        decoding="async"
                        {...{
                            fetchpriority: prioritizeMedia ? "high" : "low",
                        }}
                        onError={handleImageError}
                    />
                    <span className="pfa-chapter__mobile-thumbnail-reveal">
                        <span className="pfa-chapter__mobile-thumbnail-reveal-media">
                            <img
                                className="pfa-chapter__mobile-thumbnail-image pfa-chapter__mobile-thumbnail-image--color"
                                src={item.image}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                {...{ fetchpriority: "low" }}
                                onError={handleImageError}
                            />
                        </span>
                    </span>
                </span>
                <span className="pfa-chapter__mobile-index" aria-hidden="true">
                    {String(itemIndex + 1).padStart(2, "0")}
                </span>
                <span className="pfa-chapter__mobile-title">
                    {formattedTitle}
                </span>
                <span className="pfa-chapter__mobile-toggle" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none">
                        <path
                            d="m4.5 7.5 5.5 5.5 5.5-5.5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </span>
            </button>

            <div
                id={panelId}
                className="pfa-chapter__panel"
                role="region"
                aria-labelledby={triggerId}
            >
                <div
                    className="pfa-chapter__panel-inner"
                    onPointerDown={handlePanelPointerDown}
                    onPointerUp={handlePanelPointerUp}
                    onPointerCancel={() => {
                        panelPointerRef.current = null;
                    }}
                >
                    <figure className="pfa-chapter__media">
                        <div className="pfa-chapter__media-visual">
                            <img
                                src={item.image}
                                alt={`Fasilitas ${item.title}`}
                                loading={prioritizeMedia ? "eager" : "lazy"}
                                decoding="async"
                                {...{
                                    fetchpriority: prioritizeMedia
                                        ? "high"
                                        : "low",
                                }}
                                onError={handleImageError}
                            />
                        </div>
                        <div
                            className="pfa-chapter__media-shade"
                            aria-hidden="true"
                        />
                        <span
                            className="pfa-chapter__media-code"
                            aria-hidden="true"
                        >
                            /{mediaLabel} {mediaSequence}/
                        </span>
                        <div className="pfa-chapter__badge-slot">
                            <FacilityBadge
                                location={item.badgeLocation}
                                category={item.badgeType}
                                variant="red"
                            />
                        </div>
                    </figure>

                    <div className="pfa-chapter__information">
                <header className="pfa-chapter__lead">
                    <div className="pfa-chapter__titleline">
                        <span
                            className="pfa-chapter__title-index"
                            aria-hidden="true"
                        >
                            {String(itemIndex + 1).padStart(2, "0")}
                        </span>
                        <h3 id={headingId} aria-label={formattedTitle}>
                            <span
                                className="pfa-chapter__title-punctuation"
                                aria-hidden="true"
                            >
                                /
                            </span>
                            <span aria-hidden="true">{displayTitle}</span>
                            <span
                                className="pfa-chapter__title-punctuation"
                                aria-hidden="true"
                            >
                                .
                            </span>
                        </h3>
                    </div>

                    <p className="pfa-chapter__description">{item.description}</p>

                    <dl className="pfa-chapter__summary">
                        <div>
                            <dt>Lokasi</dt>
                            <dd>{item.location}</dd>
                        </div>
                        <div>
                            <dt>Tipe</dt>
                            <dd>{item.venueType}</dd>
                        </div>
                        <div>
                            <dt>Rentang harga</dt>
                            <dd>{item.priceRange}</dd>
                        </div>
                    </dl>

                    <PricingBookingLink
                        className="pfa-chapter__booking"
                        label="Reservasi fasilitas"
                    />
                </header>

                <div className="pfa-chapter__catalog">
                    <div className="pfa-chapter__catalog-heading">
                        <span>Daftar tarif</span>
                        <span>
                            {String(
                                item.rateGroups.reduce(
                                    (totalRates, group) => totalRates + group.rates.length,
                                    0,
                                ),
                            ).padStart(2, "0")} tarif
                        </span>
                    </div>

                    {item.hasRates ? (
                        <div className="pfa-chapter__groups">
                            {item.rateGroups.map((group, groupIndex) => (
                                <section
                                    className="pfa-chapter__group"
                                    aria-labelledby={`${chapterId}-group-${groupIndex}`}
                                    key={group.id}
                                >
                                    <header>
                                        <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                                        <h4 id={`${chapterId}-group-${groupIndex}`}>
                                            {group.label}
                                        </h4>
                                    </header>

                                    <dl className="pfa-chapter__rate-list">
                                        {group.rates.map((rate) => (
                                            <div className="pfa-chapter__rate" key={rate.id}>
                                                <dt>{rate.label}</dt>
                                                <dd>
                                                    <span className="pfa-chapter__amount">
                                                        <strong>{rate.value}</strong>
                                                        {rate.duration && <span>{rate.duration}</span>}
                                                    </span>
                                                    {(rate.schedule || rate.note) && (
                                                        <small>
                                                            {[rate.schedule, rate.note]
                                                                .filter(Boolean)
                                                                .join(" · ")}
                                                        </small>
                                                    )}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                </section>
                            ))}
                        </div>
                    ) : (
                        <div className="pfa-chapter__unavailable" role="status">
                            <span>[00]</span>
                            <div>
                                <h4>Tarif sedang diperbarui.</h4>
                                <p>
                                    Hubungi tim kami untuk mendapatkan informasi harga terbaru
                                    fasilitas ini.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {item.facts.length > 0 && (
                    <dl className="pfa-chapter__facts">
                        {item.facts.map((fact, index) => (
                            <div key={`${fact.label}-${index}`}>
                                <dt>{fact.label}</dt>
                                <dd>{fact.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </div>
                </div>
            </div>
        </article>
    );
}
