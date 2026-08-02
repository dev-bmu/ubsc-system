import type { SyntheticEvent } from "react";

const FALLBACK_IMAGE = "/assets/images/comingsoon.avif";

export interface PricingLine {
    id: string;
    label?: string;
    value?: string;
    note?: string;
}

export interface PricingBlock {
    id: string;
    title: string;
    columns: PricingLine[][];
    emptyMessage: string;
}

export interface ClassPricing {
    id: string;
    name: string;
    classCode?: string;
    image: string;
    badgeLocation?: string;
    badgeType?: string;
    blocks: PricingBlock[];
}

interface Props {
    item: ClassPricing;
    eagerImage?: boolean;
}

const trimDecorativeSlashes = (value: string) =>
    value.replace(/^\/+|\/+$/g, "").trim();

const toDomId = (value: string) =>
    value.toLocaleLowerCase("id-ID").replace(/[^a-z0-9_-]+/g, "-");

function LocationPinIcon() {
    return (
        <svg
            aria-hidden="true"
            className="pcc-badge__icon"
            viewBox="0 0 20 20"
            fill="none"
        >
            <path
                d="M15.5 8.25c0 4.18-5.5 8.25-5.5 8.25s-5.5-4.07-5.5-8.25a5.5 5.5 0 1 1 11 0Z"
                stroke="currentColor"
                strokeWidth="1.55"
            />
            <circle
                cx="10"
                cy="8.25"
                r="1.8"
                stroke="currentColor"
                strokeWidth="1.55"
            />
        </svg>
    );
}

function ClassBadge({
    location,
    category,
}: {
    location?: string;
    category?: string;
}) {
    if (!location && !category) return null;

    return (
        <div
            className={`pcc-badge${location && category ? "" : " pcc-badge--single"}`}
            aria-label={[location, category].filter(Boolean).join(", ")}
        >
            {location && (
                <span className="pcc-badge__location" title={location}>
                    <LocationPinIcon />
                    <span>{location}</span>
                </span>
            )}
            {category && (
                <span className="pcc-badge__category" title={category}>
                    {category}
                </span>
            )}
        </div>
    );
}

function handleImageError(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;

    if (image.dataset.fallbackApplied === "true") return;

    image.dataset.fallbackApplied = "true";
    image.src = FALLBACK_IMAGE;
}

function PricingBlocks({
    item,
    cardTitleId,
    decorative = false,
}: {
    item: ClassPricing;
    cardTitleId: string;
    decorative?: boolean;
}) {
    return item.blocks.map((block) => {
        const columns = block.columns
            .map((column) =>
                column.filter(
                    (line) => line.label || line.value || line.note,
                ),
            )
            .filter((column) => column.length > 0);
        const itemCount = columns.reduce(
            (total, column) => total + column.length,
            0,
        );
        const blockTitleId = `${cardTitleId}-${toDomId(block.id)}`;
        const displayBlockTitle = block.title.trim();

        return (
            <section
                className={`pcc-card__block${itemCount === 0 ? " pcc-card__block--empty" : ""}`}
                aria-labelledby={decorative ? undefined : blockTitleId}
                key={block.id}
            >
                <div className="pcc-card__block-heading">
                    <h4 id={decorative ? undefined : blockTitleId}>
                        {displayBlockTitle}
                    </h4>
                    <span
                        className="pcc-card__block-count"
                        role={decorative ? undefined : "img"}
                        aria-label={
                            decorative ? undefined : `${itemCount} item`
                        }
                    />
                </div>

                {itemCount > 0 ? (
                    <div
                        className={`pcc-card__columns${columns.length === 1 ? " pcc-card__columns--single" : ""}`}
                    >
                        {columns.map((column, columnIndex) => (
                            <ul
                                className="pcc-card__list"
                                key={`${block.id}-column-${columnIndex}`}
                            >
                                {column.map((line) => (
                                    <li
                                        className="pcc-card__line"
                                        key={line.id}
                                    >
                                        <span
                                            className="pcc-card__marker"
                                            aria-hidden="true"
                                        >
                                            +
                                        </span>
                                        <span className="pcc-card__line-content">
                                            {line.label && (
                                                <span className="pcc-card__line-label">
                                                    {line.label}
                                                </span>
                                            )}
                                            {line.value && (
                                                <strong className="pcc-card__line-value">
                                                    {line.value}
                                                </strong>
                                            )}
                                            {line.note && (
                                                <span className="pcc-card__line-note">
                                                    {line.note}
                                                </span>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ))}
                    </div>
                ) : (
                    <p className="pcc-card__empty">{block.emptyMessage}</p>
                )}
            </section>
        );
    });
}

export default function PricingClassCard({ item, eagerImage = false }: Props) {
    const domId = toDomId(item.id);
    const cardTitleId = `pricing-class-card-${domId}`;
    const classCode = item.classCode
        ? trimDecorativeSlashes(item.classCode)
        : "";

    return (
        <article className="pcc-card" aria-labelledby={cardTitleId}>
            <span className="pcc-card__stroke" aria-hidden="true">
                <span className="pcc-card__stroke-edge pcc-card__stroke-edge--top" />
                <span className="pcc-card__stroke-edge pcc-card__stroke-edge--right" />
                <span className="pcc-card__stroke-edge pcc-card__stroke-edge--bottom" />
                <span className="pcc-card__stroke-edge pcc-card__stroke-edge--left" />
            </span>

            <header className="pcc-card__media">
                <a
                    className="pcc-card__media-link"
                    href="/booking"
                    aria-label={`Booking kelas ${item.name}`}
                >
                    <img
                        src={item.image || FALLBACK_IMAGE}
                        alt=""
                        className="pcc-card__image"
                        loading={eagerImage ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                        onError={handleImageError}
                    />
                    <div className="pcc-card__shade" aria-hidden="true" />

                    <div className="pcc-card__identity">
                        <div className="pcc-card__topline">
                            <h3 className="pcc-card__title" id={cardTitleId}>
                                <span aria-hidden="true">/</span>
                                {item.name}
                            </h3>
                            {classCode && (
                                <p
                                    className="pcc-card__code"
                                    aria-label={`Kode kelas ${classCode}`}
                                >
                                    /{classCode}/
                                </p>
                            )}
                        </div>

                        <ClassBadge
                            location={item.badgeLocation}
                            category={item.badgeType}
                        />
                    </div>
                </a>
            </header>

            <div className="pcc-card__body">
                <PricingBlocks item={item} cardTitleId={cardTitleId} />

                <div
                    className="pcc-card__text-shimmer"
                    aria-hidden="true"
                >
                    <div className="pcc-card__text-shimmer-copy">
                        <PricingBlocks
                            item={item}
                            cardTitleId={cardTitleId}
                            decorative
                        />
                    </div>
                </div>
            </div>
        </article>
    );
}
